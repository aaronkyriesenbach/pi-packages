import { describe, expect, it, vi } from 'vitest';
import type {
  ExtensionAPI,
  ToolCallEvent,
  ToolCallEventResult,
} from '@earendil-works/pi-coding-agent';
import defaultExport, { buildBlockReason } from '../extensions/index.js';

type ToolCallHandler = (event: ToolCallEvent) => ToolCallEventResult | undefined;

function buildFakeApi(): {
  pi: ExtensionAPI;
  onMock: ReturnType<typeof vi.fn>;
  getHandler: () => ToolCallHandler;
} {
  let handler: ToolCallHandler | undefined;
  const onMock = vi.fn((eventName: string, fn: ToolCallHandler): void => {
    if (eventName === 'tool_call') handler = fn;
  });
  const pi = { on: onMock } as unknown as ExtensionAPI;
  return {
    pi,
    onMock,
    getHandler: (): ToolCallHandler => {
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

  it('returns undefined for a non-bash tool call', () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const handler = getHandler();
    expect(
      handler(buildToolCallEvent({ toolName: 'edit', input: { path: 'a.ts' } })),
    ).toBeUndefined();
  });

  it('returns undefined for a bash tool call with nothing disallowed', () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const handler = getHandler();
    expect(handler(buildToolCallEvent({ input: { command: 'ls -la' } }))).toBeUndefined();
  });

  it('blocks a bash tool call containing a disallowed command', () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const handler = getHandler();
    const event = buildToolCallEvent({ input: { command: 'grep TODO .' } });
    const result = handler(event);
    expect(result).toEqual({
      block: true,
      reason: 'Blocked: this command uses disallowed command(s): `grep` (use `rg` instead).',
    });
  });

  it('blocks a bash tool call containing multiple disallowed commands, naming both', () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const handler = getHandler();
    const event = buildToolCallEvent({ input: { command: 'find . -name x; grep TODO .' } });
    const result = handler(event);
    expect(result).toEqual({
      block: true,
      reason:
        'Blocked: this command uses disallowed command(s): `find` (use `fd` instead), `grep` (use `rg` instead).',
    });
  });

  it('never mutates event.input when blocking', () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const handler = getHandler();
    const event = buildToolCallEvent({ input: { command: 'grep TODO .' } });
    const originalInput = { ...event.input };
    handler(event);
    expect(event.input).toEqual(originalInput);
  });
});

describe('buildBlockReason', () => {
  it('names a single disallowed command and its replacement', () => {
    expect(buildBlockReason([{ command: 'grep', replacement: 'rg' }])).toBe(
      'Blocked: this command uses disallowed command(s): `grep` (use `rg` instead).',
    );
  });

  it('names multiple disallowed commands and their replacements', () => {
    expect(
      buildBlockReason([
        { command: 'find', replacement: 'fd' },
        { command: 'grep', replacement: 'rg' },
      ]),
    ).toBe(
      'Blocked: this command uses disallowed command(s): `find` (use `fd` instead), `grep` (use `rg` instead).',
    );
  });
});
