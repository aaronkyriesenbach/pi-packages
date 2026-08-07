import { describe, expect, it, vi } from 'vitest';
import type { ToolResultEvent, ExtensionAPI } from '@earendil-works/pi-coding-agent';
import defaultExport, {
  appendNote,
  COMMENT_TOKENS,
  commentSeverityFor,
  extractAddedLines,
  findAddedCommentHits,
  findCommentHits,
  formatBlock,
  getCommentTokens,
  groupCommentBlocks,
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

describe('findCommentHits', () => {
  it('finds comment lines, skipping blanks and non-comment lines, tagged with 1-based line numbers', () => {
    const lines = ['// one', 'const x = 1;', '', '// two'];
    expect(findCommentHits(lines, ['//'])).toEqual([
      { line: 1, text: '// one' },
      { line: 4, text: '// two' },
    ]);
  });

  it('skips a shebang on the first line', () => {
    const lines = ['#!/usr/bin/env node', '# real comment'];
    expect(findCommentHits(lines, ['#'])).toEqual([{ line: 2, text: '# real comment' }]);
  });

  it('does not skip a "#!" line when it is not first', () => {
    const lines = ['x = 1', '#!/not/a/shebang'];
    expect(findCommentHits(lines, ['#'])).toEqual([{ line: 2, text: '#!/not/a/shebang' }]);
  });

  it('returns an empty array for an empty line list', () => {
    expect(findCommentHits([], ['//'])).toEqual([]);
  });
});

describe('extractAddedLines', () => {
  it('extracts "+"-prefixed content lines with their new-file line number, dropping the "+++" header', () => {
    const patch = [
      '--- a/foo.ts',
      '+++ b/foo.ts',
      '@@ -1,2 +1,3 @@',
      ' const x = 1;',
      '+// note',
      '-old',
    ].join('\n');
    expect(extractAddedLines(patch)).toEqual([{ lineNumber: 2, text: '// note' }]);
  });

  it('advances the line cursor past unchanged context lines', () => {
    const patch = [
      '--- a/foo.ts',
      '+++ b/foo.ts',
      '@@ -1,3 +1,4 @@',
      ' const a = 1;',
      ' const b = 2;',
      '+// note',
      ' const c = 3;',
    ].join('\n');
    expect(extractAddedLines(patch)).toEqual([{ lineNumber: 3, text: '// note' }]);
  });

  it('returns an empty array when there are no added lines', () => {
    const patch = ['--- a/foo.ts', '+++ b/foo.ts', '@@ -1 +1 @@', '-old', ' unchanged'].join('\n');
    expect(extractAddedLines(patch)).toEqual([]);
  });

  it('ignores content lines that appear before any hunk header', () => {
    const patch = ['--- a/foo.ts', '+++ b/foo.ts', '+// no preceding hunk header'].join('\n');
    expect(extractAddedLines(patch)).toEqual([]);
  });
});

describe('findAddedCommentHits', () => {
  it('filters patch lines down to added comment lines', () => {
    const patchLines = [
      { lineNumber: 5, text: 'const x = 1;' },
      { lineNumber: 6, text: '// a gotcha' },
    ];
    expect(findAddedCommentHits(patchLines, ['//'])).toEqual([{ line: 6, text: '// a gotcha' }]);
  });

  it("skips a shebang added as the file's first line", () => {
    const patchLines = [{ lineNumber: 1, text: '#!/usr/bin/env node' }];
    expect(findAddedCommentHits(patchLines, ['#'])).toEqual([]);
  });
});

describe('groupCommentBlocks', () => {
  it('groups contiguous hits into a single block', () => {
    const hits = [
      { line: 5, text: '// one' },
      { line: 6, text: '// two' },
      { line: 7, text: '// three' },
    ];
    expect(groupCommentBlocks(hits)).toEqual([
      { startLine: 5, endLine: 7, lines: ['// one', '// two', '// three'] },
    ]);
  });

  it('keeps non-contiguous hits as separate blocks', () => {
    const hits = [
      { line: 1, text: '// a' },
      { line: 10, text: '// b' },
    ];
    expect(groupCommentBlocks(hits)).toEqual([
      { startLine: 1, endLine: 1, lines: ['// a'] },
      { startLine: 10, endLine: 10, lines: ['// b'] },
    ]);
  });

  it('sorts out-of-order hits before grouping', () => {
    const hits = [
      { line: 6, text: '// two' },
      { line: 5, text: '// one' },
    ];
    expect(groupCommentBlocks(hits)).toEqual([
      { startLine: 5, endLine: 6, lines: ['// one', '// two'] },
    ]);
  });

  it('returns an empty array for no hits', () => {
    expect(groupCommentBlocks([])).toEqual([]);
  });
});

describe('commentSeverityFor', () => {
  it('is "single" for exactly one line', () => {
    expect(commentSeverityFor(1)).toBe('single');
  });

  it('is "short" for two to four lines', () => {
    expect(commentSeverityFor(2)).toBe('short');
    expect(commentSeverityFor(4)).toBe('short');
  });

  it('is "long" for five or more lines', () => {
    expect(commentSeverityFor(5)).toBe('long');
    expect(commentSeverityFor(20)).toBe('long');
  });
});

describe('formatBlock', () => {
  it('labels and locates a single-line block, and picks a "single"-tier instruction', () => {
    const output = formatBlock('foo.ts', {
      startLine: 42,
      endLine: 42,
      lines: ['// increment the counter'],
    });
    expect(output).toContain('foo.ts:42 (1-line comment):');
    expect(output).toContain('  foo.ts:42: // increment the counter');
    expect(output).toContain('non-obvious why/gotcha');
  });

  it('labels and locates a short block, and picks a "short"-tier instruction', () => {
    const output = formatBlock('foo.ts', {
      startLine: 10,
      endLine: 11,
      lines: ['// one', '// two'],
    });
    expect(output).toContain('foo.ts:10-11 (2-line comment block):');
    expect(output).toContain('  foo.ts:10: // one');
    expect(output).toContain('  foo.ts:11: // two');
    expect(output).toContain('delete it now.');
  });

  it('labels and locates a long block, and picks a "long"-tier instruction', () => {
    const lines = ['// 1', '// 2', '// 3', '// 4', '// 5'];
    const output = formatBlock('foo.ts', { startLine: 1, endLine: 5, lines });
    expect(output).toContain('foo.ts:1-5 (5-line comment block):');
    expect(output).toContain('right now.');
  });

  it('is deterministic for the same file path and block', () => {
    const block = { startLine: 12, endLine: 12, lines: ['// a gotcha'] };
    expect(formatBlock('foo.ts', block)).toBe(formatBlock('foo.ts', block));
  });

  it('can pick a different variant for differently-touched blocks', () => {
    const a = formatBlock('foo.ts', { startLine: 1, endLine: 1, lines: ['// x'] });
    const b = formatBlock('foo.ts', { startLine: 2, endLine: 2, lines: ['// x'] });
    expect(a).not.toBe(b);
  });
});

describe('messageFor', () => {
  it('reports one block for a single comment line, tagged with "single" severity', () => {
    const message = messageFor('foo.ts', [{ line: 42, text: '// increment the counter' }]);
    expect(message).toContain('<comment-check required severity="single">');
    expect(message).toContain('1 new comment in foo.ts');
    expect(message).toContain('foo.ts:42 (1-line comment):');
    expect(message).toContain('  foo.ts:42: // increment the counter');
    expect(message).toContain('</comment-check>');
  });

  it('groups contiguous hits into one block, tagged with "short" severity', () => {
    const message = messageFor('foo.ts', [
      { line: 3, text: '// one' },
      { line: 4, text: '// two' },
    ]);
    expect(message).toContain('<comment-check required severity="short">');
    expect(message).toContain('1 new comment in foo.ts');
    expect(message).toContain('foo.ts:3-4 (2-line comment block):');
  });

  it('reports separate blocks for non-contiguous hits, tagged with the highest severity present', () => {
    const message = messageFor('foo.ts', [
      { line: 1, text: '// a' },
      { line: 20, text: '// b1' },
      { line: 21, text: '// b2' },
      { line: 22, text: '// b3' },
      { line: 23, text: '// b4' },
      { line: 24, text: '// b5' },
    ]);
    expect(message).toContain('<comment-check required severity="long">');
    expect(message).toContain('2 new comments in foo.ts');
    expect(message).toContain('foo.ts:1 (1-line comment):');
    expect(message).toContain('foo.ts:20-24 (5-line comment block):');
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
    const patch = ['--- a/foo.ts', '+++ b/foo.ts', '@@ -1 +1 @@', '+const x = 1;'].join('\n');
    const result = getHandler()(buildEditResult({ details: { patch } }));
    expect(result).toBeUndefined();
  });

  it('appends a note for a single added comment line, tagged with "single" severity', () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const patch = ['--- a/foo.ts', '+++ b/foo.ts', '@@ -1 +1,2 @@', '+// one comment'].join('\n');
    const result = getHandler()(buildEditResult({ details: { patch } }));
    const content = requireContent(result);
    expect(content).toHaveLength(2);
    expect(textOf(content[0])).toBe('ok');
    expect(textOf(content[1])).toContain('severity="single"');
    expect(textOf(content[1])).toContain('1 new comment in foo.ts');
    expect(textOf(content[1])).toContain('foo.ts:1 (1-line comment):');
    expect(textOf(content[1])).toContain('  foo.ts:1: // one comment');
  });

  it('groups two contiguous added comment lines into a single "short" block', () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const patch = ['--- a/foo.ts', '+++ b/foo.ts', '@@ -1 +1,3 @@', '+// one', '+// two'].join(
      '\n',
    );
    const result = getHandler()(buildEditResult({ details: { patch } }));
    const content = requireContent(result);
    expect(textOf(content[1])).toContain('severity="short"');
    expect(textOf(content[1])).toContain('1 new comment in foo.ts');
    expect(textOf(content[1])).toContain('foo.ts:1-2 (2-line comment block):');
    expect(textOf(content[1])).toContain('  foo.ts:1: // one');
    expect(textOf(content[1])).toContain('  foo.ts:2: // two');
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

  it('reports two separate single-line blocks for non-contiguous comments in a write body', () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const result = getHandler()(
      buildWriteResult({ input: { path: 'foo.ts', content: '// a\nconst x = 1;\n// b' } }),
    );
    const content = requireContent(result);
    expect(textOf(content[1])).toContain('severity="single"');
    expect(textOf(content[1])).toContain('2 new comments in foo.ts');
    expect(textOf(content[1])).toContain('foo.ts:1 (1-line comment):');
    expect(textOf(content[1])).toContain('  foo.ts:1: // a');
    expect(textOf(content[1])).toContain('foo.ts:3 (1-line comment):');
    expect(textOf(content[1])).toContain('  foo.ts:3: // b');
  });

  it('escalates severity and wording for a long comment block in a write body', () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const body = ['// 1', '// 2', '// 3', '// 4', '// 5', 'const x = 1;'].join('\n');
    const result = getHandler()(buildWriteResult({ input: { path: 'foo.ts', content: body } }));
    const content = requireContent(result);
    expect(textOf(content[1])).toContain('severity="long"');
    expect(textOf(content[1])).toContain('foo.ts:1-5 (5-line comment block):');
    expect(textOf(content[1])).toContain('right now.');
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
