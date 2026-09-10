import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  EditToolCallEvent,
  ExtensionAPI,
  ExtensionContext,
  ToolCallEvent,
  ToolResultEvent,
  WriteToolCallEvent,
} from '@earendil-works/pi-coding-agent';

// Mirrors pi-package-manager's node:fs/promises mock pattern in its own tests.
const fsStore = vi.hoisted(() => new Map<string, string>());

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn((path: string): string => {
    const cached = fsStore.get(path);
    if (cached !== undefined) return cached;
    const err = new Error('ENOENT: no such file') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    throw err;
  }),
}));

import defaultExport, {
  appendNote,
  BLOCK_COMMENT_TOKENS,
  bypassWordingFor,
  COMMENT_TOKENS,
  commentSeverityFor,
  extractAddedLines,
  findAddedCommentHits,
  findBlockAwareCommentHits,
  findCommentHits,
  formatBlock,
  getBlockCommentDelimiters,
  getCommentTokens,
  groupCommentBlocks,
  isCommentLine,
  isShebang,
  messageFor,
  readFileContentOrUndefined,
  stripNoteFor,
  stripOverThresholdBlocks,
} from '../extensions/index.js';
import { getProjectConfigPath } from '../extensions/config.js';

const CWD = '/project';
const PROJECT_CONFIG_PATH = getProjectConfigPath(CWD);

function setGateConfig(
  overrides: { threshold?: number; allowAgentBypassRequest?: boolean } = {},
): void {
  fsStore.set(
    PROJECT_CONFIG_PATH,
    JSON.stringify({ enforcement: 'gate', threshold: 2, ...overrides }),
  );
}

beforeEach(() => {
  fsStore.clear();
  vi.clearAllMocks();
});

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

const BLOCK_COMMENT_EXTENSIONS = [
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'go',
  'rs',
  'java',
  'c',
  'h',
  'cpp',
  'hpp',
  'cc',
  'cs',
  'swift',
  'kt',
  'kts',
  'scala',
  'dart',
  'm',
  'php',
  'sql',
];

describe('BLOCK_COMMENT_TOKENS', () => {
  it('is keyed by lowercase extension', () => {
    for (const ext of Object.keys(BLOCK_COMMENT_TOKENS)) {
      expect(ext).toBe(ext.toLowerCase());
    }
  });

  it('registers `/* */` for exactly the 23 documented extensions', () => {
    expect(Object.keys(BLOCK_COMMENT_TOKENS).sort()).toEqual(BLOCK_COMMENT_EXTENSIONS.sort());
    for (const ext of BLOCK_COMMENT_EXTENSIONS) {
      expect(BLOCK_COMMENT_TOKENS[ext]).toEqual({ open: '/*', close: '*/' });
    }
  });

  it('does not register a block delimiter for extensions outside the list', () => {
    for (const ext of ['py', 'yaml', 'sh', 'rb', 'lua', 'hs']) {
      expect(BLOCK_COMMENT_TOKENS[ext]).toBeUndefined();
    }
  });
});

describe('getBlockCommentDelimiters', () => {
  it('returns the delimiter pair for a known extension', () => {
    expect(getBlockCommentDelimiters('foo.ts')).toEqual({ open: '/*', close: '*/' });
  });

  it('is case-insensitive on the extension', () => {
    expect(getBlockCommentDelimiters('foo.TS')).toEqual({ open: '/*', close: '*/' });
  });

  it('returns undefined for an extension with no registered block delimiter', () => {
    expect(getBlockCommentDelimiters('foo.py')).toBeUndefined();
    expect(getBlockCommentDelimiters('foo.yaml')).toBeUndefined();
  });

  it('returns undefined for a file with no extension', () => {
    expect(getBlockCommentDelimiters('Makefile')).toBeUndefined();
  });
});

const SLASH_STAR = { open: '/*', close: '*/' };

describe('findBlockAwareCommentHits', () => {
  it('flags a single-line block comment on its own line', () => {
    const lines = ['/* a note */', 'const x = 1;'];
    expect(findBlockAwareCommentHits(lines, ['//'], SLASH_STAR)).toEqual([
      { line: 1, text: '/* a note */' },
    ]);
  });

  it('flags every line of a multi-line block, regardless of interior prefix', () => {
    const lines = ['/*', ' * line two', 'line three, no prefix', ' */', 'const x = 1;'];
    expect(findBlockAwareCommentHits(lines, ['//'], SLASH_STAR)).toEqual([
      { line: 1, text: '/*' },
      { line: 2, text: '* line two' },
      { line: 3, text: 'line three, no prefix' },
      { line: 4, text: '*/' },
    ]);
  });

  it('flags an unterminated block through to end of file', () => {
    const lines = ['/*', 'still open', 'still open too'];
    expect(findBlockAwareCommentHits(lines, ['//'], SLASH_STAR)).toEqual([
      { line: 1, text: '/*' },
      { line: 2, text: 'still open' },
      { line: 3, text: 'still open too' },
    ]);
  });

  it('does not flag a trailing block comment after code on the same line', () => {
    const lines = ['const x = 1; /* trailing */'];
    expect(findBlockAwareCommentHits(lines, ['//'], SLASH_STAR)).toEqual([]);
  });

  it('closes a nested block comment at the first close delimiter, not the outermost', () => {
    const lines = ['/* outer /* inner */ still outer */', 'const x = 1;'];
    expect(findBlockAwareCommentHits(lines, ['//'], SLASH_STAR)).toEqual([
      { line: 1, text: '/* outer /* inner */ still outer */' },
    ]);
  });

  it('flags a `/** JSDoc */`-shaped block identically to a plain block comment', () => {
    const lines = ['/**', ' * Does a thing.', ' */', 'function f() {}'];
    expect(findBlockAwareCommentHits(lines, ['//'], SLASH_STAR)).toEqual([
      { line: 1, text: '/**' },
      { line: 2, text: '* Does a thing.' },
      { line: 3, text: '*/' },
    ]);
  });

  it('still finds plain line-token comments outside of any block', () => {
    const lines = ['// a line comment', '/* a block */', '// another line comment'];
    expect(findBlockAwareCommentHits(lines, ['//'], SLASH_STAR)).toEqual([
      { line: 1, text: '// a line comment' },
      { line: 2, text: '/* a block */' },
      { line: 3, text: '// another line comment' },
    ]);
  });

  it('skips a shebang on the first line', () => {
    const lines = ['#!/usr/bin/env node', '/* a block */'];
    expect(findBlockAwareCommentHits(lines, ['//'], SLASH_STAR)).toEqual([
      { line: 2, text: '/* a block */' },
    ]);
  });

  it('returns an empty array for an empty line list', () => {
    expect(findBlockAwareCommentHits([], ['//'], SLASH_STAR)).toEqual([]);
  });
});

describe('readFileContentOrUndefined', () => {
  it('returns the file content on a successful read', async () => {
    fsStore.set('foo.ts', 'const x = 1;');
    await expect(readFileContentOrUndefined('foo.ts')).resolves.toBe('const x = 1;');
  });

  it('returns undefined, not a rejection, when the read throws', async () => {
    await expect(readFileContentOrUndefined('missing.ts')).resolves.toBeUndefined();
  });
});

type ToolResultHandler = (
  event: ToolResultEvent,
) => Promise<{ content?: ToolResultEvent['content'] } | undefined>;

type ToolCallHandler = (
  event: ToolCallEvent,
  ctx: ExtensionContext,
) => Promise<{ block?: boolean; reason?: string } | undefined>;

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
  getCallHandler: () => ToolCallHandler;
} {
  let handler: ToolResultHandler | undefined;
  let callHandler: ToolCallHandler | undefined;
  const onMock = vi.fn((eventName: string, fn: ToolResultHandler | ToolCallHandler): void => {
    if (eventName === 'tool_result') handler = fn as ToolResultHandler;
    if (eventName === 'tool_call') callHandler = fn as ToolCallHandler;
  });
  const pi = { on: onMock } as unknown as ExtensionAPI;
  return {
    pi,
    onMock,
    getHandler: (): ToolResultHandler => {
      if (!handler) throw new Error('tool_result handler was never registered');
      return handler;
    },
    getCallHandler: (): ToolCallHandler => {
      if (!callHandler) throw new Error('tool_call handler was never registered');
      return callHandler;
    },
  };
}

function buildFakeCtx(overrides: Partial<ExtensionContext> = {}): ExtensionContext {
  return { cwd: CWD, hasUI: true, ...overrides } as unknown as ExtensionContext;
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

function buildWriteCall(overrides: Partial<WriteToolCallEvent> = {}): WriteToolCallEvent {
  return {
    type: 'tool_call',
    toolCallId: 'call-2',
    toolName: 'write',
    input: { path: 'foo.ts', content: '' },
    ...overrides,
  };
}

function buildEditCall(overrides: Partial<EditToolCallEvent> = {}): EditToolCallEvent {
  return {
    type: 'tool_call',
    toolCallId: 'call-1',
    toolName: 'edit',
    input: { path: 'foo.ts', edits: [] },
    ...overrides,
  };
}

describe('default export (extension factory)', () => {
  it('registers a tool_result handler', () => {
    const { pi, onMock } = buildFakeApi();
    defaultExport(pi);
    expect(onMock).toHaveBeenCalledWith('tool_result', expect.any(Function));
  });

  it('ignores error results', async () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const result = await getHandler()(buildEditResult({ isError: true }));
    expect(result).toBeUndefined();
  });

  it('ignores edit results whose path is not a string', async () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const result = await getHandler()(buildEditResult({ input: {} }));
    expect(result).toBeUndefined();
  });

  it('ignores edit results for an unrecognized extension', async () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const result = await getHandler()(buildEditResult({ input: { path: 'foo.unknown' } }));
    expect(result).toBeUndefined();
  });

  it('ignores edit results with no patch details', async () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const result = await getHandler()(buildEditResult({ details: undefined }));
    expect(result).toBeUndefined();
  });

  it('ignores edit results whose patch adds no comment lines', async () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const patch = ['--- a/foo.ts', '+++ b/foo.ts', '@@ -1 +1 @@', '+const x = 1;'].join('\n');
    const result = await getHandler()(buildEditResult({ details: { patch } }));
    expect(result).toBeUndefined();
  });

  it('appends a note for a single added comment line, tagged with "single" severity', async () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const patch = ['--- a/foo.ts', '+++ b/foo.ts', '@@ -1 +1,2 @@', '+// one comment'].join('\n');
    const result = await getHandler()(buildEditResult({ details: { patch } }));
    const content = requireContent(result);
    expect(content).toHaveLength(2);
    expect(textOf(content[0])).toBe('ok');
    expect(textOf(content[1])).toContain('severity="single"');
    expect(textOf(content[1])).toContain('1 new comment in foo.ts');
    expect(textOf(content[1])).toContain('foo.ts:1 (1-line comment):');
    expect(textOf(content[1])).toContain('  foo.ts:1: // one comment');
  });

  it('groups two contiguous added comment lines into a single "short" block', async () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const patch = ['--- a/foo.ts', '+++ b/foo.ts', '@@ -1 +1,3 @@', '+// one', '+// two'].join(
      '\n',
    );
    const result = await getHandler()(buildEditResult({ details: { patch } }));
    const content = requireContent(result);
    expect(textOf(content[1])).toContain('severity="short"');
    expect(textOf(content[1])).toContain('1 new comment in foo.ts');
    expect(textOf(content[1])).toContain('foo.ts:1-2 (2-line comment block):');
    expect(textOf(content[1])).toContain('  foo.ts:1: // one');
    expect(textOf(content[1])).toContain('  foo.ts:2: // two');
  });

  it('flags a block comment fully added within one edit patch', async () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const patch = [
      '--- a/foo.ts',
      '+++ b/foo.ts',
      '@@ -1 +1,4 @@',
      '+/*',
      '+ * a note',
      '+ */',
      ' const x = 1;',
    ].join('\n');
    fsStore.set('foo.ts', ['/*', ' * a note', ' */', 'const x = 1;'].join('\n'));
    const result = await getHandler()(buildEditResult({ details: { patch } }));
    const content = requireContent(result);
    expect(textOf(content[1])).toContain('foo.ts:1-3 (3-line comment block):');
    expect(textOf(content[1])).toContain('  foo.ts:1: /*');
    expect(textOf(content[1])).toContain('  foo.ts:2: * a note');
    expect(textOf(content[1])).toContain('  foo.ts:3: */');
  });

  it('flags an edit that appends a line into the middle of a pre-existing open block', async () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    // The block's open delimiter (line 1) predates this patch and never appears
    // in its hunk context; only line 3, the added interior line, is in the diff.
    const patch = [
      '--- a/foo.ts',
      '+++ b/foo.ts',
      '@@ -1,4 +1,5 @@',
      ' /*',
      ' * first',
      '+* newly added line',
      ' */',
      ' const x = 1;',
    ].join('\n');
    fsStore.set('foo.ts', ['/*', '* first', '* newly added line', '*/', 'const x = 1;'].join('\n'));
    const result = await getHandler()(buildEditResult({ details: { patch } }));
    const content = requireContent(result);
    expect(textOf(content[1])).toContain('foo.ts:3 (1-line comment):');
    expect(textOf(content[1])).toContain('  foo.ts:3: * newly added line');
  });

  it('falls back to patch-only detection when the post-edit disk read fails', async () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    // Same shape as the pre-existing-open-block case, but fsStore has no entry
    // for foo.ts, so the mocked readFile throws and the handler must fall back
    // to patch-only, line-token-only detection instead of reporting nothing.
    const patch = [
      '--- a/foo.ts',
      '+++ b/foo.ts',
      '@@ -1,4 +1,5 @@',
      ' /*',
      ' * first',
      '+* newly added line',
      ' */',
      ' const x = 1;',
    ].join('\n');
    const result = await getHandler()(buildEditResult({ details: { patch } }));
    expect(result).toBeUndefined();
  });

  it('uses patch-only detection for a language with no registered block delimiter', async () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const patch = ['--- a/foo.py', '+++ b/foo.py', '@@ -1 +1,2 @@', '+# a comment'].join('\n');
    const result = await getHandler()(
      buildEditResult({ input: { path: 'foo.py' }, details: { patch } }),
    );
    const content = requireContent(result);
    expect(textOf(content[1])).toContain('foo.py:1 (1-line comment):');
    expect(textOf(content[1])).toContain('  foo.py:1: # a comment');
  });

  it('ignores write results whose path is not a string', async () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const result = await getHandler()(buildWriteResult({ input: { content: '// x' } }));
    expect(result).toBeUndefined();
  });

  it('ignores write results whose content is not a string', async () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const result = await getHandler()(buildWriteResult({ input: { path: 'foo.ts' } }));
    expect(result).toBeUndefined();
  });

  it('ignores write results for an unrecognized extension', async () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const result = await getHandler()(
      buildWriteResult({ input: { path: 'foo.unknown', content: '// x' } }),
    );
    expect(result).toBeUndefined();
  });

  it('ignores write results whose content adds no comment lines', async () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const result = await getHandler()(
      buildWriteResult({ input: { path: 'foo.ts', content: 'const x = 1;' } }),
    );
    expect(result).toBeUndefined();
  });

  it('reports two separate single-line blocks for non-contiguous comments in a write body', async () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const result = await getHandler()(
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

  it('escalates severity and wording for a long comment block in a write body', async () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const body = ['// 1', '// 2', '// 3', '// 4', '// 5', 'const x = 1;'].join('\n');
    const result = await getHandler()(
      buildWriteResult({ input: { path: 'foo.ts', content: body } }),
    );
    const content = requireContent(result);
    expect(textOf(content[1])).toContain('severity="long"');
    expect(textOf(content[1])).toContain('foo.ts:1-5 (5-line comment block):');
    expect(textOf(content[1])).toContain('right now.');
  });

  it('flags a block comment written to a file with a registered block delimiter', async () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const body = ['/*', ' * Does a thing.', ' */', 'function f() {}'].join('\n');
    const result = await getHandler()(
      buildWriteResult({ input: { path: 'foo.ts', content: body } }),
    );
    const content = requireContent(result);
    expect(textOf(content[1])).toContain('severity="short"');
    expect(textOf(content[1])).toContain('1 new comment in foo.ts');
    expect(textOf(content[1])).toContain('foo.ts:1-3 (3-line comment block):');
    expect(textOf(content[1])).toContain('  foo.ts:1: /*');
    expect(textOf(content[1])).toContain('  foo.ts:2: * Does a thing.');
    expect(textOf(content[1])).toContain('  foo.ts:3: */');
  });

  it('does not flag a written file whose block comment trails code on the same line', async () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const result = await getHandler()(
      buildWriteResult({
        input: { path: 'foo.ts', content: 'const x = 1; /* trailing */' },
      }),
    );
    expect(result).toBeUndefined();
  });

  it('behaves byte-for-byte as today for a language with no registered block delimiter', async () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const result = await getHandler()(
      buildWriteResult({ input: { path: 'foo.py', content: '# a comment\nx = 1' } }),
    );
    const content = requireContent(result);
    expect(textOf(content[1])).toContain('foo.py:1 (1-line comment):');
    expect(textOf(content[1])).toContain('  foo.py:1: # a comment');
  });

  it('ignores other tool result types', async () => {
    const { pi, getHandler } = buildFakeApi();
    defaultExport(pi);
    const result = await getHandler()({
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

describe('stripOverThresholdBlocks', () => {
  it('returns undefined for an unrecognized extension', () => {
    expect(stripOverThresholdBlocks('foo.unknown', '// x', 2)).toBeUndefined();
  });

  it('strips a block whose line count exceeds the threshold', () => {
    const content = ['// 1', '// 2', '// 3', 'const x = 1;'].join('\n');
    const result = stripOverThresholdBlocks('foo.ts', content, 2);
    expect(result?.content).toBe('const x = 1;');
    expect(result?.strippedBlocks).toEqual([
      { startLine: 1, endLine: 3, lines: ['// 1', '// 2', '// 3'] },
    ]);
  });

  it('leaves a block at or under the threshold untouched', () => {
    const content = ['// 1', '// 2', 'const x = 1;'].join('\n');
    const result = stripOverThresholdBlocks('foo.ts', content, 2);
    expect(result?.content).toBe(content);
    expect(result?.strippedBlocks).toEqual([]);
  });

  it('strips only the over-threshold block, leaving unrelated code and other blocks in place', () => {
    const content = ['// short', 'const a = 1;', '// 1', '// 2', '// 3', 'const b = 2;'].join('\n');
    const result = stripOverThresholdBlocks('foo.ts', content, 2);
    expect(result?.content).toBe(['// short', 'const a = 1;', 'const b = 2;'].join('\n'));
    expect(result?.strippedBlocks).toEqual([
      { startLine: 3, endLine: 5, lines: ['// 1', '// 2', '// 3'] },
    ]);
  });

  it('is block-comment-aware, stripping every line of an over-threshold `/* */` block', () => {
    const content = ['/*', ' * 1', ' * 2', ' * 3', ' */', 'const x = 1;'].join('\n');
    const result = stripOverThresholdBlocks('foo.ts', content, 2);
    expect(result?.content).toBe('const x = 1;');
    expect(result?.strippedBlocks).toHaveLength(1);
    expect(result?.strippedBlocks[0]?.lines).toEqual(['/*', '* 1', '* 2', '* 3', '*/']);
  });

  it('uses line-token-only detection for an extension with no registered block delimiter', () => {
    const content = ['# 1', '# 2', '# 3', 'x = 1'].join('\n');
    const result = stripOverThresholdBlocks('foo.py', content, 2);
    expect(result?.content).toBe('x = 1');
    expect(result?.strippedBlocks).toEqual([
      { startLine: 1, endLine: 3, lines: ['# 1', '# 2', '# 3'] },
    ]);
  });
});

describe('bypassWordingFor', () => {
  it('returns undefined when bypass requests are not allowed', () => {
    expect(bypassWordingFor(false, true)).toBeUndefined();
    expect(bypassWordingFor(false, false)).toBeUndefined();
  });

  it('mentions request_comment_exception when allowed and a UI is available', () => {
    const wording = bypassWordingFor(true, true);
    expect(wording).toContain('request_comment_exception');
  });

  it('explains a human reviewer is unavailable when allowed but there is no UI', () => {
    const wording = bypassWordingFor(true, false);
    expect(wording).not.toContain('request_comment_exception');
    expect(wording).toContain('human reviewer');
  });
});

describe('stripNoteFor', () => {
  it('names the exact stripped lines', () => {
    const note = stripNoteFor(
      'foo.ts',
      [{ startLine: 1, endLine: 3, lines: ['// 1', '// 2', '// 3'] }],
      undefined,
    );
    expect(note).toContain('foo.ts:1-3:');
    expect(note).toContain('foo.ts:1: // 1');
    expect(note).toContain('foo.ts:2: // 2');
    expect(note).toContain('foo.ts:3: // 3');
  });

  it('appends the bypass wording when supplied', () => {
    const note = stripNoteFor(
      'foo.ts',
      [{ startLine: 1, endLine: 1, lines: ['// x'] }],
      'call request_comment_exception',
    );
    expect(note).toContain('call request_comment_exception');
  });

  it('omits any bypass wording when not supplied', () => {
    const note = stripNoteFor('foo.ts', [{ startLine: 1, endLine: 1, lines: ['// x'] }], undefined);
    expect(note).not.toContain('request_comment_exception');
  });

  it('pluralizes the block count for more than one stripped block', () => {
    const note = stripNoteFor(
      'foo.ts',
      [
        { startLine: 1, endLine: 3, lines: ['// 1', '// 2', '// 3'] },
        { startLine: 10, endLine: 12, lines: ['// a', '// b', '// c'] },
      ],
      undefined,
    );
    expect(note).toContain('2 comment blocks in foo.ts');
  });
});

describe('gate mode: tool_call strip + tool_result note', () => {
  it('registers a tool_call handler', () => {
    const { pi, onMock } = buildFakeApi();
    defaultExport(pi);
    expect(onMock).toHaveBeenCalledWith('tool_call', expect.any(Function));
  });

  it('ignores tool_call events for tools other than write/edit', async () => {
    setGateConfig({ threshold: 2 });
    const { pi, getCallHandler } = buildFakeApi();
    defaultExport(pi);

    const result = await getCallHandler()(
      { type: 'tool_call', toolCallId: 'call-3', toolName: 'bash', input: { command: 'ls' } },
      buildFakeCtx(),
    );
    expect(result).toBeUndefined();
  });

  it('leaves an edit call with no over-threshold block unmutated', async () => {
    setGateConfig({ threshold: 2 });
    const { pi, getCallHandler } = buildFakeApi();
    defaultExport(pi);

    const event = buildEditCall({
      input: { path: 'foo.ts', edits: [{ oldText: 'old', newText: '// 1\nconst x = 1;' }] },
    });
    const result = await getCallHandler()(event, buildFakeCtx());

    expect(result).toBeUndefined();
    expect(event.input).toEqual({
      path: 'foo.ts',
      edits: [{ oldText: 'old', newText: '// 1\nconst x = 1;' }],
    });
  });

  it('strips an over-threshold comment block from a write call before it executes', async () => {
    setGateConfig({ threshold: 2 });
    const { pi, getCallHandler } = buildFakeApi();
    defaultExport(pi);

    const body = ['// 1', '// 2', '// 3', 'const x = 1;'].join('\n');
    const event = buildWriteCall({ input: { path: 'foo.ts', content: body } });
    await getCallHandler()(event, buildFakeCtx());

    expect(event.input).toEqual({ path: 'foo.ts', content: 'const x = 1;' });
  });

  it('leaves an under-threshold comment block untouched and still nudges for it', async () => {
    setGateConfig({ threshold: 2 });
    const { pi, getCallHandler, getHandler } = buildFakeApi();
    defaultExport(pi);

    const body = ['// 1', '// 2', 'const x = 1;'].join('\n');
    const callEvent = buildWriteCall({ input: { path: 'foo.ts', content: body } });
    await getCallHandler()(callEvent, buildFakeCtx());
    expect(callEvent.input).toEqual({ path: 'foo.ts', content: body });

    const result = await getHandler()(
      buildWriteResult({ input: { path: 'foo.ts', content: body } }),
    );
    const content = requireContent(result);
    expect(content).toHaveLength(2);
    expect(textOf(content[1])).toContain('severity="short"');
    expect(textOf(content[1])).toContain('foo.ts:1-2 (2-line comment block):');
    expect(textOf(content[1])).not.toContain('comment-gate');
  });

  it('strips an over-threshold block while an unrelated code change in the same write still lands', async () => {
    setGateConfig({ threshold: 2 });
    const { pi, getCallHandler, getHandler } = buildFakeApi();
    defaultExport(pi);

    const body = ['// 1', '// 2', '// 3', 'const before = 1;', 'const after = 2;'].join('\n');
    const callEvent = buildWriteCall({ input: { path: 'foo.ts', content: body } });
    await getCallHandler()(callEvent, buildFakeCtx());

    const strippedContent = ['const before = 1;', 'const after = 2;'].join('\n');
    expect(callEvent.input).toEqual({ path: 'foo.ts', content: strippedContent });

    const result = await getHandler()(
      buildWriteResult({ input: { path: 'foo.ts', content: strippedContent } }),
    );
    const content = requireContent(result);
    expect(textOf(content[1])).toContain('comment-gate');
    expect(textOf(content[1])).toContain('foo.ts:1-3:');
    expect(textOf(content[1])).toContain('foo.ts:1: // 1');
    expect(textOf(content[1])).toContain('foo.ts:2: // 2');
    expect(textOf(content[1])).toContain('foo.ts:3: // 3');
  });

  it('strips an over-threshold block from an edit call while leaving the rest of newText untouched', async () => {
    setGateConfig({ threshold: 2 });
    const { pi, getCallHandler } = buildFakeApi();
    defaultExport(pi);

    const newText = ['// 1', '// 2', '// 3', 'const x = 1;'].join('\n');
    const event = buildEditCall({
      input: { path: 'foo.ts', edits: [{ oldText: 'old', newText }] },
    });
    await getCallHandler()(event, buildFakeCtx());

    expect(event.input).toEqual({
      path: 'foo.ts',
      edits: [{ oldText: 'old', newText: 'const x = 1;' }],
    });
  });

  it('does not strip anything under nudge mode, including the default with no config present', async () => {
    const { pi, getCallHandler } = buildFakeApi();
    defaultExport(pi);

    const body = ['// 1', '// 2', '// 3', 'const x = 1;'].join('\n');
    const event = buildWriteCall({ input: { path: 'foo.ts', content: body } });
    const result = await getCallHandler()(event, buildFakeCtx());

    expect(result).toBeUndefined();
    expect(event.input).toEqual({ path: 'foo.ts', content: body });
  });

  it('mentions request_comment_exception in the strip note when bypass is allowed and a UI is available', async () => {
    setGateConfig({ threshold: 2, allowAgentBypassRequest: true });
    const { pi, getCallHandler, getHandler } = buildFakeApi();
    defaultExport(pi);

    const body = ['// 1', '// 2', '// 3', 'const x = 1;'].join('\n');
    const callEvent = buildWriteCall({ input: { path: 'foo.ts', content: body } });
    await getCallHandler()(callEvent, buildFakeCtx({ hasUI: true }));

    const strippedContent = callEvent.input;
    const result = await getHandler()(
      buildWriteResult({ input: { path: 'foo.ts', content: strippedContent.content } }),
    );
    const content = requireContent(result);
    expect(textOf(content[content.length - 1])).toContain('request_comment_exception');
  });

  it('explains a human reviewer is unavailable when bypass is allowed but there is no UI', async () => {
    setGateConfig({ threshold: 2, allowAgentBypassRequest: true });
    const { pi, getCallHandler, getHandler } = buildFakeApi();
    defaultExport(pi);

    const body = ['// 1', '// 2', '// 3', 'const x = 1;'].join('\n');
    const callEvent = buildWriteCall({ input: { path: 'foo.ts', content: body } });
    await getCallHandler()(callEvent, buildFakeCtx({ hasUI: false }));

    const strippedContent = callEvent.input;
    const result = await getHandler()(
      buildWriteResult({ input: { path: 'foo.ts', content: strippedContent.content } }),
    );
    const content = requireContent(result);
    const note = textOf(content[content.length - 1]);
    expect(note).not.toContain('request_comment_exception');
    expect(note).toContain('human reviewer');
  });
});
