import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignToolCallsAndResponses } from '../src/engine.js';
import type { OpenAIMessage } from '../src/mapper.js';

test('alignToolCallsAndResponses: keeps aligned tool calls and responses', () => {
  const messages: OpenAIMessage[] = [
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 't1', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'call_1', content: 'output' }
  ];
  const aligned = alignToolCallsAndResponses(messages);
  assert.equal(aligned.length, 3);
  assert.equal(aligned[1].tool_calls?.length, 1);
  assert.equal(aligned[1].tool_calls?.[0].id, 'call_1');
});

test('alignToolCallsAndResponses: filters out unresponded tool calls', () => {
  const messages: OpenAIMessage[] = [
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: null, tool_calls: [
      { id: 'call_1', type: 'function', function: { name: 't1', arguments: '{}' } },
      { id: 'call_2', type: 'function', function: { name: 't2', arguments: '{}' } }
    ] },
    { role: 'tool', tool_call_id: 'call_1', content: 'output' }
  ];
  const aligned = alignToolCallsAndResponses(messages);
  assert.equal(aligned.length, 3);
  assert.equal(aligned[1].tool_calls?.length, 1);
  assert.equal(aligned[1].tool_calls?.[0].id, 'call_1');
});

test('alignToolCallsAndResponses: removes tool_calls property completely if all are filtered out', () => {
  const messages: OpenAIMessage[] = [
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 't1', arguments: '{}' } }] }
  ];
  const aligned = alignToolCallsAndResponses(messages);
  assert.equal(aligned.length, 2);
  assert.equal(aligned[1].tool_calls, undefined);
  assert.equal(aligned[1].content, '');
});

test('alignToolCallsAndResponses: filters out orphaned tool responses', () => {
  const messages: OpenAIMessage[] = [
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 't1', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'call_1', content: 'output' },
    { role: 'tool', tool_call_id: 'call_2', content: 'orphaned' }
  ];
  const aligned = alignToolCallsAndResponses(messages);
  assert.equal(aligned.length, 3);
  assert.equal(aligned[1].tool_calls?.length, 1);
  assert.equal(aligned[2].tool_call_id, 'call_1');
  assert.ok(!aligned.some(m => m.tool_call_id === 'call_2'));
});

test('alignToolCallsAndResponses: groups and repositions tool responses to follow the assistant message immediately', () => {
  const messages: OpenAIMessage[] = [
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 't1', arguments: '{}' } }] },
    { role: 'user', content: 'some instruction' },
    { role: 'tool', tool_call_id: 'call_1', content: 'output_1' }
  ];
  const aligned = alignToolCallsAndResponses(messages);
  assert.equal(aligned.length, 4);
  assert.equal(aligned[0].role, 'user');
  assert.equal(aligned[1].role, 'assistant');
  assert.equal(aligned[2].role, 'tool');
  assert.equal(aligned[2].tool_call_id, 'call_1');
  assert.equal(aligned[3].role, 'user');
  assert.equal(aligned[3].content, 'some instruction');
});

test('alignToolCallsAndResponses: handles multiple consecutive assistant tool calls correctly', () => {
  const messages: OpenAIMessage[] = [
    { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 't1', arguments: '{}' } }] },
    { role: 'assistant', content: null, tool_calls: [{ id: 'call_2', type: 'function', function: { name: 't2', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'call_1', content: 'output_1' },
    { role: 'tool', tool_call_id: 'call_2', content: 'output_2' }
  ];
  const aligned = alignToolCallsAndResponses(messages);
  assert.equal(aligned.length, 4);
  assert.equal(aligned[0].role, 'assistant');
  assert.equal(aligned[0].tool_calls?.[0].id, 'call_1');
  assert.equal(aligned[1].role, 'tool');
  assert.equal(aligned[1].tool_call_id, 'call_1');
  assert.equal(aligned[2].role, 'assistant');
  assert.equal(aligned[2].tool_calls?.[0].id, 'call_2');
  assert.equal(aligned[3].role, 'tool');
  assert.equal(aligned[3].tool_call_id, 'call_2');
});
