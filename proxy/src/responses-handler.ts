/**
 * OpenAI Responses API (/v1/responses) Handler
 *
 * Codex Desktop uses the Responses API, which is different from Chat Completions:
 * - Request: { model, input, instructions, stream, max_output_tokens, tools, ... }
 * - Streaming uses SSE events: response.output_text.delta, response.done, etc.
 * - Non-streaming: { id, object: "response", output: [...], usage: {...} }
 *
 * This handler converts Responses API requests to our internal format,
 * routes them through streamResponse(), and converts results back.
 *
 * Based on analysis of ulrich-zogo/ocgo (internal/proxy/responses.go)
 * and the OpenAI Responses API specification.
 */

import http from 'http';
import { logger } from './logger.js';
import { config } from './config.js';
import { streamResponse } from './engine.js';
import { checkRateLimit, recordRequest } from './rate-limiter.js';
import { checkBlocked } from './blocklist.js';
import { requestStore } from './request-store.js';
import { calculateCost } from './pricing.js';

// ---- Type Definitions (Responses API) ----

interface ResponsesRequest {
  model: string;
  input?: ResponsesInput;
  instructions?: string;
  stream?: boolean;
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  tools?: ResponsesTool[];
  reasoning?: any;
  reasoning_effort?: any;
  effort?: any;
  level?: any;
  depth?: any;
  output_config?: any;
  previous_response_id?: string;
  store?: boolean;
  metadata?: Record<string, string>;
  user?: string;
}

type ResponsesInput = string | ResponsesInputItem[];

interface ResponsesInputItem {
  role: string;
  content: string | ContentBlock[];
  type?: string;
}

interface ContentBlock {
  type: string;
  text?: string;
  image_url?: { url: string; detail?: string };
}

interface ResponsesTool {
  type: string;
  name?: string;
  description?: string;
  parameters?: Record<string, unknown>;
  search_context_size?: string;
  user_location?: any;
  input_schema?: Record<string, unknown>;
}

// ---- Request Body Parsing ----

function responsesInputToMessages(input: ResponsesInput | undefined): { messages: any[]; system?: string } {
  const messages: any[] = [];
  if (!input) return { messages };

  if (typeof input === 'string') {
    messages.push({ role: 'user', content: input });
    return { messages };
  }

  // Collect consecutive function_call items to merge into an assistant message.
  // Codex sends both a `message` item (role:assistant, empty content) AND separate
  // `function_call` items for the same turn. We must merge them into one message.
  let pendingToolCalls: any[] = [];

  function flushToolCalls() {
    if (pendingToolCalls.length === 0) return;
    const last = messages[messages.length - 1];
    if (last && last.role === 'assistant' && !last.tool_calls) {
      // Merge into the existing assistant message rather than creating a duplicate
      last.tool_calls = pendingToolCalls;
      last.content = null; // tool_calls messages must have content: null for strict backends
    } else {
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: pendingToolCalls,
      });
    }
    pendingToolCalls = [];
  }

  for (const item of input as any[]) {
    const itype = item.type || '';

    // function_call → accumulate into pending tool calls
    if (itype === 'function_call') {
      pendingToolCalls.push({
        id: item.call_id || item.id || `call_${Math.random().toString(36).slice(2)}`,
        type: 'function',
        function: {
          name: item.name || 'unknown',
          arguments: typeof item.arguments === 'string' ? item.arguments : JSON.stringify(item.arguments || {}),
        },
      });
      continue;
    }

    // function_call_output → tool result message
    if (itype === 'function_call_output') {
      flushToolCalls(); // ensure assistant tool_calls message is committed first
      messages.push({
        role: 'tool',
        tool_call_id: item.call_id || item.id || '',
        content: typeof item.output === 'string' ? item.output : JSON.stringify(item.output ?? ''),
      });
      continue;
    }

    // Flush any pending tool calls before a non-tool-call item
    flushToolCalls();

    const role = item.role === 'developer' ? 'system' : (item.role || 'user');
    let content = item.content;
    if (Array.isArray(content)) {
      content = content.map((block: any) => {
        if (block && typeof block === 'object') {
          const b = { ...block };
          if (b.type === 'input_text') {
            b.type = 'text';
            b.text = b.text || b.input_text || '';
            delete b.input_text;
          } else if (b.type === 'output_text') {
            b.type = 'text';
            b.text = b.text || b.output_text || '';
            delete b.output_text;
          }
          return b;
        }
        return block;
      });
    }

    let finalContent = content;
    if (finalContent === undefined || finalContent === null) {
      finalContent = '';
    }

    const msg: any = {
      role,
      content: role === 'system'
        ? (typeof finalContent === 'string' ? finalContent : JSON.stringify(finalContent))
        : finalContent,
    };

    // Preserve content blocks for multimodal messages
    messages.push(msg);
  }

  flushToolCalls();
  return { messages };
}

function convertResponsesTools(tools: ResponsesTool[] | undefined): Record<string, any> {
  if (!tools || tools.length === 0) return {};

  const mapped: Record<string, any> = {};
  for (const t of tools) {
    // Responses API tools use `type`, `name`, `parameters` (without `function` wrapper)
    const name = t.name || t.type || 'unknown';
    const params = { ...(t.parameters || t.input_schema || {}) } as any;
    if (!params.type || params.type === 'null') {
      params.type = 'object';
    }
    if (!params.properties || params.properties === null) {
      params.properties = {};
    }
    mapped[name] = {
      description: t.description || '',
      parameters: params,
    };
  }
  return mapped;
}

// ---- Responses API Response Formatting ----

function genTraceId(): string {
  const h = '0123456789abcdef';
  return Array.from({ length: 16 }, () => h[Math.floor(Math.random() * 16)]).join('');
}

function genResponseId(): string {
  const c = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-';
  let r = '';
  for (let i = 0; i < 24; i++) r += c[Math.floor(Math.random() * c.length)];
  return `resp_${r}`;
}

function estTokens(t: string): number {
  return Math.max(1, Math.ceil(t.length / 4));
}

/**
 * Format an SSE event for the Responses API streaming protocol.
 * Codex Desktop expects events like:
 *   event: response.output_text.delta
 *   data: {"type":"response.output_text.delta","delta":"Hello"}
 *
 *   event: response.done
 *   data: {"type":"response.done"}
 */
function writeResponseSSE(
  res: http.ServerResponse,
  event: string,
  data: Record<string, unknown>,
): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ---- Main Handler ----

export async function handleResponses(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body: Buffer,
): Promise<void> {
  let request: ResponsesRequest;
  try {
    request = JSON.parse(body.toString('utf-8'));
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Invalid JSON body', code: 'invalid_request' } }));
    return;
  }

  const model = request.model || 'unknown';
  const isStream = request.stream !== false;

  // Validate: model is required
  if (!model || model === 'unknown') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'model is required', code: 'invalid_request' } }));
    return;
  }

  // Validate: at least one of input or instructions
  const hasInput = request.input !== undefined && request.input !== null && request.input !== '';
  const hasInstructions = !!request.instructions;
  if (!hasInput && !hasInstructions) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: "either 'input' or 'instructions' must be provided", code: 'invalid_request' } }));
    return;
  }

  // Check blocklist
  const blockCheck = checkBlocked(config.providerPriority, model);
  if (blockCheck.blocked) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: `Request blocked: ${blockCheck.reason}`, code: 'blocked' } }));
    return;
  }

  // Check rate limit
  const rateCheck = checkRateLimit();
  if (!rateCheck.allowed) {
    res.writeHead(429, { 'Content-Type': 'application/json', 'retry-after': String(rateCheck.retryAfter) });
    res.end(JSON.stringify({ error: { message: 'Rate limit exceeded', code: 'rate_limited' } }));
    return;
  }

  logger.info(`>>> Responses API: ${model} (tools=${(request.tools?.length ?? 0)}, stream=${isStream})`);

  // Convert Responses API request to our internal format
  const { messages, system } = responsesInputToMessages(request.input);
  const mappedTools = convertResponsesTools(request.tools);

  // If instructions are provided, prepend as system message
  const effectiveMessages = [...messages];
  if (request.instructions) {
    effectiveMessages.unshift({ role: 'system', content: request.instructions });
  }
  // Also handle it via the system field
  const systemInstruction = request.instructions || system || undefined;

  const responseId = genResponseId();

  const createdAt = Math.floor(Date.now() / 1000);

  if (isStream) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    // Required first lifecycle event — clients use this to initialize state
    writeResponseSSE(res, 'response.created', {
      type: 'response.created',
      response: {
        id: responseId,
        object: 'response',
        created_at: createdAt,
        status: 'in_progress',
        model,
        output: [],
        usage: null,
      },
    });
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' });
  }

  try {

    const generator = streamResponse(
      {
        messages: effectiveMessages,
        tools: Object.keys(mappedTools).length > 0 ? mappedTools : undefined,
        maxTokens: request.max_output_tokens || 8192,
        temperature: request.temperature,
        topP: request.top_p,
        system: systemInstruction,
        skipAgentContext: true,
      },
      model,
    );

    let fullText = '';
    let thoughtText = '';
    let lastProvider = '';
    let lastResolvedModel = '';
    const toolCalls: { id: string; name: string; args: string }[] = [];

    const textItemId = `msg_${genTraceId().substring(0, 16)}`;
    let hasSentTextItemAdded = false;

    for await (const chunk of generator) {
      const ctype = (chunk as any).type as string;
      if (ctype === 'attempt') {
        if ((chunk as any).provider) lastProvider = (chunk as any).provider;
        if ((chunk as any).resolvedModel) lastResolvedModel = (chunk as any).resolvedModel;
        continue;
      }

      if ((chunk as any).provider) lastProvider = (chunk as any).provider;
      if ((chunk as any).resolvedModel) lastResolvedModel = (chunk as any).resolvedModel;

      if (ctype === 'text') {
        const content = (chunk as any).content || '';
        fullText += content;
        if (isStream) {
          if (!hasSentTextItemAdded) {
            writeResponseSSE(res, 'response.output_item.added', {
              type: 'response.output_item.added',
              response_id: responseId,
              output_index: 0,
              item: {
                id: textItemId,
                object: 'realtime.item',
                type: 'message',
                status: 'in_progress',
                role: 'assistant',
                content: []
              }
            });
            hasSentTextItemAdded = true;
          }
          writeResponseSSE(res, 'response.output_text.delta', {
            type: 'response.output_text.delta',
            response_id: responseId,
            item_id: textItemId,
            output_index: 0,
            content_index: 0,
            delta: content,
          });
        }
      } else if (ctype === 'thought') {
        const content = (chunk as any).content || '';
        thoughtText += content;
        if (isStream) {
          if (!hasSentTextItemAdded) {
            writeResponseSSE(res, 'response.output_item.added', {
              type: 'response.output_item.added',
              response_id: responseId,
              output_index: 0,
              item: {
                id: textItemId,
                object: 'realtime.item',
                type: 'message',
                status: 'in_progress',
                role: 'assistant',
                content: []
              }
            });
            hasSentTextItemAdded = true;
          }
          writeResponseSSE(res, 'response.reasoning.delta', {
            type: 'response.reasoning.delta',
            item_id: textItemId,
            delta: content,
            response_id: responseId,
          });
        }
      } else if (ctype === 'tool-call') {
        const tcId = `call_${genTraceId().substring(0, 16)}`;
        const name = (chunk as any).name || 'unknown';
        const args = JSON.stringify((chunk as any).args || {});
        const currentToolIndex = toolCalls.length; // capture index before push
        toolCalls.push({
          id: tcId,
          name,
          args,
        });
        // output_index: text item is 0 (if present), tool calls follow
        const outputIdx = (hasSentTextItemAdded ? 1 : 0) + currentToolIndex;

        if (isStream) {
          writeResponseSSE(res, 'response.output_item.added', {
            type: 'response.output_item.added',
            response_id: responseId,
            output_index: outputIdx,
            item: {
              id: tcId,
              object: 'realtime.item',
              type: 'function_call',
              status: 'in_progress',
              call_id: tcId,
              name,
              arguments: ''
            }
          });

          writeResponseSSE(res, 'response.function_call_arguments.delta', {
            type: 'response.function_call_arguments.delta',
            response_id: responseId,
            item_id: tcId,
            output_index: outputIdx,
            content_index: 0,
            call_id: tcId,
            name,
            delta: args,
          });

          writeResponseSSE(res, 'response.function_call_arguments.done', {
            type: 'response.function_call_arguments.done',
            response_id: responseId,
            item_id: tcId,
            output_index: outputIdx,
            content_index: 0,
            call_id: tcId,
            name,
            arguments: args,
          });

          writeResponseSSE(res, 'response.output_item.done', {
            type: 'response.output_item.done',
            response_id: responseId,
            output_index: outputIdx,
            item: {
              id: tcId,
              object: 'realtime.item',
              type: 'function_call',
              status: 'completed',
              call_id: tcId,
              name,
              arguments: args
            }
          });
        }
      }
    }

    const outputTokens = estTokens(fullText + thoughtText);
    const promptText = JSON.stringify(request);
    const promptTokens = estTokens(promptText);

    // Track usage
    if (lastProvider) recordRequest(lastProvider);
    const cost = lastProvider ? calculateCost(lastProvider, lastResolvedModel || model, promptTokens, outputTokens) : 0;

    // Build usage info
    const usage = {
      input_tokens: promptTokens,
      output_tokens: outputTokens,
      total_tokens: promptTokens + outputTokens,
    };

    // Build output items for metadata/response objects
    const outputItems: any[] = [];
    if (fullText) {
      outputItems.push({
        id: textItemId,
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'output_text', text: fullText },
          ...(thoughtText ? [{ type: 'reasoning', text: thoughtText }] : []),
        ],
      });
    }
    for (const tc of toolCalls) {
      outputItems.push({
        id: tc.id,
        type: 'function_call',
        call_id: tc.id,
        name: tc.name,
        arguments: tc.args,
        status: 'completed',
      });
    }

    if (isStream) {
      // Only emit text item done events if we actually produced text.
      // An empty text item in response.completed causes Codex to store a bare
      // assistant message which then conflicts with the function_call items.
      if (hasSentTextItemAdded && fullText) {
        writeResponseSSE(res, 'response.output_text.done', {
          type: 'response.output_text.done',
          response_id: responseId,
          item_id: textItemId,
          output_index: 0,
          content_index: 0,
        });
        writeResponseSSE(res, 'response.output_item.done', {
          type: 'response.output_item.done',
          response_id: responseId,
          output_index: 0,
          item: {
            id: textItemId,
            object: 'realtime.item',
            type: 'message',
            status: 'completed',
            role: 'assistant',
            content: [{ type: 'output_text', text: fullText }],
          },
        });
      }

      const completedResponse = {
        id: responseId,
        object: 'response',
        created_at: createdAt,
        status: 'completed',
        model,
        output: outputItems,
        usage,
      };

      // response.done signals the stream is finishing
      writeResponseSSE(res, 'response.done', {
        type: 'response.done',
        response: completedResponse,
      });

      // response.completed is the true terminal event Codex waits for
      writeResponseSSE(res, 'response.completed', {
        type: 'response.completed',
        response: completedResponse,
      });

      res.end();
    } else {
      // Build non-streaming response
      res.end(JSON.stringify({
        id: responseId,
        object: 'response',
        model,
        created: Math.floor(Date.now() / 1000),
        output: outputItems,
        usage,
        status: 'completed',
      }));
    }

    // Log completion
    logger.info(`<<< Responses API done: ${model} (${fullText.length} chars, ${toolCalls.length} tool calls, provider: ${lastProvider})`);
    requestStore.push({
      id: responseId,
      timestamp: new Date().toISOString(),
      model,
      resolvedModel: lastResolvedModel || model,
      provider: lastProvider,
      direction: 'outgoing',
      type: toolCalls.length > 0 ? 'tool-call' : 'text',
      content: fullText,
      toolCalls: toolCalls.length > 0 ? toolCalls.map(tc => ({ name: tc.name, args: JSON.parse(tc.args || '{}') })) : undefined,
      promptTokens,
      outputTokens,
      cost,
    } as any);

  } catch (err: any) {
    logger.error(`<<< Responses API Error: ${err.message}`);
    if (isStream) {
      writeResponseSSE(res, 'error', {
        type: 'error',
        code: 'server_error',
        message: err.message,
      });
      res.end();
    } else {
      res.end(JSON.stringify({
        id: responseId,
        object: 'response',
        model,
        created: Math.floor(Date.now() / 1000),
        output: [],
        error: { message: err.message, code: 'server_error' },
        status: 'failed',
      }));
    }
  }
}
