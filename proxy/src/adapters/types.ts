import type { OpenAIMessage } from '../mapper.js';

export interface StreamChunk {
  type: 'text' | 'tool-call' | 'error' | 'done' | 'thought';
  content?: string;
  name?: string;
  args?: Record<string, unknown>;
  finishReason?: string;
}

export interface ModelAdapter {
  provider: string;
  stream(
    model: string,
    messages: OpenAIMessage[],
    tools?: Record<string, unknown>,
    config?: Record<string, unknown>,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk>;
}
