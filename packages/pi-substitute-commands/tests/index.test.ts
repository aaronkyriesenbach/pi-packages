import { describe, expect, it, vi } from 'vitest';
import type { ExtensionAPI, ToolCallEvent } from '@earendil-works/pi-coding-agent';
import defaultExport from '../extensions/index.js';

function buildFakeApi(): {
  pi: ExtensionAPI;
  onMock: ReturnType<typeof vi.fn>;
  getHandler: () => (event: ToolCallEvent) => void;
} {
  let handler: ((event: ToolCallEvent) => void) | undefined;
  const onMock = vi.fn((eventName: string, fn: (event: ToolCallEvent) => void): void => {
    if (eventName === 'tool_call') handler = fn;
  });
  const pi = { on: onMock } as unknown as ExtensionAPI;
  return {
    pi,
    onMock,
    getHandler: (): ((event: ToolCallEvent) => void) => {
      if (!handler) throw new Error('tool_call handler was never registered');
      return handler;
    },
  };
}

function buildToolCallEvent(overrides: Partial<ToolCallEvent> = {}): ToolCallEvent {
  return {
    type: 'tool_call',
    toolCallId: 'call-1',
    toolName: 'bash',
    input: { command: 'ls' },
    ...overrides,
  };
}

describe('default export (extension factory)', () => {
  it('registers a tool_call handler', () => {
    const { pi, onMock } = buildFakeApi();
    defaultExport(pi);
    expect(onMock).toHaveBeenCalledWith('tool_call', expect.any(Function));
  });

  it('does not throw for bash tool calls', () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const handler = getHandler();
    expect(() => {
      handler(buildToolCallEvent({ toolName: 'bash' }));
    }).not.toThrow();
  });

  it('does not throw for non-bash tool calls', () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const handler = getHandler();
    expect(() => {
      handler(buildToolCallEvent({ toolName: 'edit' }));
    }).not.toThrow();
  });
});
