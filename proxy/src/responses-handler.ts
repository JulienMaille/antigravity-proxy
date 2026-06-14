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

  for (const item of input) {
    const role = item.role === 'developer' ? 'system' : (item.role || 'user');
    if (role === 'system') {
      messages.push({ role: 'system', content: typeof item.content === 'string' ? item.content : JSON.stringify(item.content) });
    } else {
      messages.push({ role, content: item.content });
    }
  }

  return { messages };
}

function convertResponsesTools(tools: ResponsesTool[] | undefined): Record<string, any> {
  if (!tools || tools.length === 0) return {};

  const mapped: Record<string, any> = {};
  for (const t of tools) {
    // Responses API tools use `type`, `name`, `parameters` (without `function` wrapper)
    const name = t.name || t.type || 'unknown';
    mapped[name] = {
      description: t.description || '',
      parameters: t.parameters || t.input_schema || {},
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

  logger.info(`>>> Responses API: ${model}`, {
    hasInput: !!request.input,
    hasInstructions: !!request.instructions,
    hasTools: !!(request.tools && request.tools.length > 0),
    stream: isStream,
  });

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

  if (isStream) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
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
      },
      model,
    );

    let fullText = '';
    let thoughtText = '';
    let lastProvider = '';
    let lastResolvedModel = '';
    const toolCalls: { id: string; name: string; args: string }[] = [];
    let toolCallIndex = 0;

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
          writeResponseSSE(res, 'response.output_text.delta', {
            type: 'response.output_text.delta',
            delta: content,
            response_id: responseId,
          });
        }
      } else if (ctype === 'thought') {
        const content = (chunk as any).content || '';
        thoughtText += content;
        if (isStream) {
          writeResponseSSE(res, 'response.reasoning.delta', {
            type: 'response.reasoning.delta',
            delta: content,
            response_id: responseId,
          });
        }
      } else if (ctype === 'tool-call') {
        const tcId = `call_${genTraceId().substring(0, 8)}`;
        const args = JSON.stringify((chunk as any).args || {});
        toolCalls.push({
          id: tcId,
          name: (chunk as any).name || 'unknown',
          args,
        });

        if (isStream) {
          writeResponseSSE(res, 'response.function_call_arguments.delta', {
            type: 'response.function_call_arguments.delta',
            item_id: tcId,
            name: (chunk as any).name,
            arguments: args,
            response_id: responseId,
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

    if (isStream) {
      // Send completion event
      writeResponseSSE(res, 'response.output_text.done', {
        type: 'response.output_text.done',
        response_id: responseId,
      });

      // Send final done event with usage
      writeResponseSSE(res, 'response.done', {
        type: 'response.done',
        response_id: responseId,
        usage,
      });

      res.end();
    } else {
      // Build non-streaming response
      const outputItems: any[] = [];

      // Add text output
      if (fullText) {
        outputItems.push({
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'output_text', text: fullText },
            ...(thoughtText ? [{ type: 'reasoning', text: thoughtText }] : []),
          ],
        });
      }

      // Add tool call outputs
      for (const tc of toolCalls) {
        outputItems.push({
          type: 'function_call',
          id: tc.id,
          name: tc.name,
          arguments: tc.args,
        });
      }

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
