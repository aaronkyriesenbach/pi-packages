import { describe, expect, it, vi } from 'vitest';
import type { ToolResultEvent, ExtensionAPI } from '@earendil-works/pi-coding-agent';
import defaultExport, {
  appendNote,
  COMMENT_TOKENS,
  countCommentLines,
  extractAddedLines,
  getCommentTokens,
  isCommentLine,
  isShebang,
  messageFor,
} from '../extensions/index.js';

describe('getCommentTokens', () => {
  it('returns the token list for a known extension', () => {
    expect(getCommentTokens('foo.ts')).toEqual(['//']);
    expect(getCommentTokens('foo.py')).toEqual(['#']);
    expect(getCommentTokens('foo.php')).toEqual(['//', '#']);
    expect(getCommentTokens('foo.dart')).toEqual(['//']);
    expect(getCommentTokens('foo.ps1')).toEqual(['#']);
  });

  it('is case-insensitive on the extension', () => {
    expect(getCommentTokens('foo.TS')).toEqual(['//']);
  });

  it('returns undefined for an unknown extension', () => {
    expect(getCommentTokens('foo.unknown')).toBeUndefined();
  });

  it('returns undefined for a file with no extension', () => {
    expect(getCommentTokens('Makefile')).toBeUndefined();
  });
});

describe('isShebang', () => {
  it('is true only for a "#!" line at index 0', () => {
    expect(isShebang('#!/usr/bin/env bash', 0)).toBe(true);
  });

  it('is false for a "#!" line at a later index', () => {
    expect(isShebang('#!/usr/bin/env bash', 1)).toBe(false);
  });

  it('is false for a non-shebang line at index 0', () => {
    expect(isShebang('# just a comment', 0)).toBe(false);
  });
});

describe('isCommentLine', () => {
  it('is true when the trimmed line starts with a token', () => {
    expect(isCommentLine('  // hello', ['//'])).toBe(true);
  });

  it('is false for an empty or whitespace-only line', () => {
    expect(isCommentLine('', ['//'])).toBe(false);
    expect(isCommentLine('   ', ['//'])).toBe(false);
  });

  it('is false when the line does not start with any token', () => {
    expect(isCommentLine('const x = 1; // trailing', ['//'])).toBe(false);
  });

  it('checks every provided token', () => {
    expect(isCommentLine('# python style', ['//', '#'])).toBe(true);
  });
});

describe('countCommentLines', () => {
  it('counts comment lines, skipping blanks and non-comment lines', () => {
    const lines = ['// one', 'const x = 1;', '', '// two'];
    expect(countCommentLines(lines, ['//'])).toBe(2);
  });

  it('skips a shebang on the first line', () => {
    const lines = ['#!/usr/bin/env node', '# real comment'];
    expect(countCommentLines(lines, ['#'])).toBe(1);
  });

  it('does not skip a "#!" line when it is not first', () => {
    const lines = ['x = 1', '#!/not/a/shebang'];
    expect(countCommentLines(lines, ['#'])).toBe(1);
  });

  it('returns 0 for an empty line list', () => {
    expect(countCommentLines([], ['//'])).toBe(0);
  });

  it('handles a sparse array with an undefined element', () => {
    const lines: string[] = [];
    lines[1] = '// comment';
    expect(countCommentLines(lines, ['//'])).toBe(1);
  });
});

describe('extractAddedLines', () => {
  it('extracts only "+"-prefixed content lines, dropping the "+++" header', () => {
    const patch = [
      '--- a/foo.ts',
      '+++ b/foo.ts',
      '@@ -1,2 +1,3 @@',
      ' const x = 1;',
      '+// note',
      '-old',
    ].join('\n');
    expect(extractAddedLines(patch)).toEqual(['// note']);
  });

  it('returns an empty array when there are no added lines', () => {
    const patch = ['--- a/foo.ts', '+++ b/foo.ts', '@@ -1 +1 @@', '-old', ' unchanged'].join('\n');
    expect(extractAddedLines(patch)).toEqual([]);
  });
});

describe('messageFor', () => {
  it('uses singular phrasing for exactly one touched comment', () => {
    expect(messageFor(1)).toContain('(1 touched)');
    expect(messageFor(1)).toContain('Keep it only if');
  });

  it('uses plural phrasing for more than one touched comment', () => {
    expect(messageFor(3)).toContain('(3 touched)');
    expect(messageFor(3)).toContain('Keep only ones');
  });
});

describe('appendNote', () => {
  it('appends a text block to the existing content array without mutating it', () => {
    const original: ToolResultEvent['content'] = [{ type: 'text', text: 'original' }];
    const result = appendNote(original, 'a note');

    expect(result).toEqual([
      { type: 'text', text: 'original' },
      { type: 'text', text: '\na note' },
    ]);
    expect(original).toEqual([{ type: 'text', text: 'original' }]);
  });
});

describe('COMMENT_TOKENS', () => {
  it('is keyed by lowercase extension', () => {
    for (const ext of Object.keys(COMMENT_TOKENS)) {
      expect(ext).toBe(ext.toLowerCase());
    }
  });
});

type ToolResultHandler = (
  event: ToolResultEvent,
) => { content?: ToolResultEvent['content'] } | undefined;

function textOf(content: ToolResultEvent['content'][number] | undefined): string {
  if (content?.type !== 'text') throw new Error('expected text content');
  return content.text;
}

function requireContent(
  result: { content?: ToolResultEvent['content'] } | undefined,
): ToolResultEvent['content'] {
  if (!result?.content) throw new Error('expected a result with content');
  return result.content;
}

function buildFakeApi(): {
  pi: ExtensionAPI;
  onMock: ReturnType<typeof vi.fn>;
  getHandler: () => ToolResultHandler;
} {
  let handler: ToolResultHandler | undefined;
  const onMock = vi.fn((eventName: string, fn: ToolResultHandler): void => {
    if (eventName === 'tool_result') handler = fn;
  });
  const pi = { on: onMock } as unknown as ExtensionAPI;
  return {
    pi,
    onMock,
    getHandler: (): ToolResultHandler => {
      if (!handler) throw new Error('tool_result handler was never registered');
      return handler;
    },
  };
}

function buildEditResult(overrides: Partial<ToolResultEvent> = {}): ToolResultEvent {
  return {
    type: 'tool_result',
    toolCallId: 'call-1',
    toolName: 'edit',
    input: { path: 'foo.ts' },
    content: [{ type: 'text', text: 'ok' }],
    isError: false,
    details: { patch: '' },
    ...overrides,
  };
}

function buildWriteResult(overrides: Partial<ToolResultEvent> = {}): ToolResultEvent {
  return {
    type: 'tool_result',
    toolCallId: 'call-2',
    toolName: 'write',
    input: { path: 'foo.ts', content: '' },
    content: [{ type: 'text', text: 'ok' }],
    isError: false,
    details: undefined,
    ...overrides,
  };
}

describe('default export (extension factory)', () => {
  it('registers a tool_result handler', () => {
    const { pi, onMock } = buildFakeApi();
    defaultExport(pi);
    expect(onMock).toHaveBeenCalledWith('tool_result', expect.any(Function));
  });

  it('ignores error results', () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const result = getHandler()(buildEditResult({ isError: true }));
    expect(result).toBeUndefined();
  });

  it('ignores edit results whose path is not a string', () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const result = getHandler()(buildEditResult({ input: {} }));
    expect(result).toBeUndefined();
  });

  it('ignores edit results for an unrecognized extension', () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const result = getHandler()(buildEditResult({ input: { path: 'foo.unknown' } }));
    expect(result).toBeUndefined();
  });

  it('ignores edit results with no patch details', () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const result = getHandler()(buildEditResult({ details: undefined }));
    expect(result).toBeUndefined();
  });

  it('ignores edit results whose patch adds no comment lines', () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const patch = ['--- a/foo.ts', '+++ b/foo.ts', '+const x = 1;'].join('\n');
    const result = getHandler()(buildEditResult({ details: { patch } }));
    expect(result).toBeUndefined();
  });

  it('appends a singular note when an edit patch adds one comment line', () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const patch = ['--- a/foo.ts', '+++ b/foo.ts', '+// one comment'].join('\n');
    const result = getHandler()(buildEditResult({ details: { patch } }));
    const content = requireContent(result);
    expect(content).toHaveLength(2);
    expect(textOf(content[0])).toBe('ok');
    expect(textOf(content[1])).toContain('(1 touched)');
  });

  it('appends a plural note when an edit patch adds multiple comment lines', () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const patch = ['--- a/foo.ts', '+++ b/foo.ts', '+// one', '+// two'].join('\n');
    const result = getHandler()(buildEditResult({ details: { patch } }));
    const content = requireContent(result);
    expect(content).toHaveLength(2);
    expect(textOf(content[1])).toContain('(2 touched)');
  });

  it('ignores write results whose path is not a string', () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const result = getHandler()(buildWriteResult({ input: { content: '// x' } }));
    expect(result).toBeUndefined();
  });

  it('ignores write results whose content is not a string', () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const result = getHandler()(buildWriteResult({ input: { path: 'foo.ts' } }));
    expect(result).toBeUndefined();
  });

  it('ignores write results for an unrecognized extension', () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const result = getHandler()(
      buildWriteResult({ input: { path: 'foo.unknown', content: '// x' } }),
    );
    expect(result).toBeUndefined();
  });

  it('ignores write results whose content adds no comment lines', () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const result = getHandler()(
      buildWriteResult({ input: { path: 'foo.ts', content: 'const x = 1;' } }),
    );
    expect(result).toBeUndefined();
  });

  it('appends a note when a write body contains comment lines', () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const result = getHandler()(
      buildWriteResult({ input: { path: 'foo.ts', content: '// a\nconst x = 1;\n// b' } }),
    );
    const content = requireContent(result);
    expect(content).toHaveLength(2);
    expect(textOf(content[1])).toContain('(2 touched)');
  });

  it('ignores other tool result types', () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const result = getHandler()({
      type: 'tool_result',
      toolCallId: 'call-3',
      toolName: 'bash',
      input: {},
      content: [],
      isError: false,
      details: undefined,
    });
    expect(result).toBeUndefined();
  });
});
