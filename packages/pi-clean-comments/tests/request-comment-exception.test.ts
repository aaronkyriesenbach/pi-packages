import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditOperations, ExtensionContext } from '@earendil-works/pi-coding-agent';

import {
  createRequestCommentExceptionTool,
  REQUEST_COMMENT_EXCEPTION_CHOICES,
} from '../extensions/request-comment-exception.js';

const {
  approve: APPROVE,
  deny: DENY,
  requestChanges: REQUEST_CHANGES,
} = REQUEST_COMMENT_EXCEPTION_CHOICES;

function buildFakeOperations(fileContent: string): EditOperations & {
  writeFile: ReturnType<typeof vi.fn>;
} {
  return {
    access: vi.fn((): Promise<void> => Promise.resolve()),
    readFile: vi.fn((): Promise<Buffer> => Promise.resolve(Buffer.from(fileContent, 'utf-8'))),
    writeFile: vi.fn((): Promise<void> => Promise.resolve()),
  };
}

function buildFakeCtx(overrides: Partial<ExtensionContext> = {}): {
  ctx: ExtensionContext;
  select: ReturnType<typeof vi.fn>;
  input: ReturnType<typeof vi.fn>;
} {
  const select = vi.fn();
  const input = vi.fn();
  const ctx = {
    cwd: '/project',
    hasUI: true,
    ui: { select, confirm: vi.fn(), input, notify: vi.fn() },
    ...overrides,
  } as unknown as ExtensionContext;
  return { ctx, select, input };
}

function textOf(content: { type: string; text?: string }[]): string {
  const first = content[0];
  if (first?.type !== 'text' || !first.text) {
    throw new Error('expected text content');
  }
  return first.text;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('request_comment_exception', () => {
  it('rejects an empty reason before prompting the human', async () => {
    const operations = buildFakeOperations('// old\n');
    const tool = createRequestCommentExceptionTool({ operations });
    const { ctx, select } = buildFakeCtx();

    await expect(
      tool.execute(
        'call-1',
        { path: 'foo.ts', edits: [{ oldText: '// old', newText: '// new' }], reason: '   ' },
        undefined,
        undefined,
        ctx,
      ),
    ).rejects.toThrow(/non-empty reason/);

    expect(select).not.toHaveBeenCalled();
  });

  it('applies the edit through the built-in edit apply mechanism on approval', async () => {
    const operations = buildFakeOperations('// old\nconst x = 1;\n');
    const tool = createRequestCommentExceptionTool({ operations });
    const { ctx, select } = buildFakeCtx();
    select.mockResolvedValue(APPROVE);

    const result = await tool.execute(
      'call-1',
      {
        path: 'foo.ts',
        edits: [{ oldText: '// old', newText: '// old, kept on purpose' }],
        reason: 'This documents a non-obvious workaround.',
      },
      undefined,
      undefined,
      ctx,
    );

    expect(operations.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('foo.ts'),
      '// old, kept on purpose\nconst x = 1;\n',
    );
    expect(textOf(result.content)).toMatch(/Successfully replaced/);
  });

  it('fails the same way the built-in edit tool fails on a stale oldText', async () => {
    const operations = buildFakeOperations('// something else entirely\n');
    const tool = createRequestCommentExceptionTool({ operations });
    const { ctx, select } = buildFakeCtx();
    select.mockResolvedValue(APPROVE);

    await expect(
      tool.execute(
        'call-1',
        { path: 'foo.ts', edits: [{ oldText: '// old', newText: '// new' }], reason: 'Needed.' },
        undefined,
        undefined,
        ctx,
      ),
    ).rejects.toThrow();

    expect(operations.writeFile).not.toHaveBeenCalled();
  });

  it('denies without mutating the file when the human denies', async () => {
    const operations = buildFakeOperations('// old\n');
    const tool = createRequestCommentExceptionTool({ operations });
    const { ctx, select } = buildFakeCtx();
    select.mockResolvedValue(DENY);

    const result = await tool.execute(
      'call-1',
      { path: 'foo.ts', edits: [{ oldText: '// old', newText: '// new' }], reason: 'Needed.' },
      undefined,
      undefined,
      ctx,
    );

    expect(textOf(result.content)).toMatch(/denied/i);
    expect(operations.writeFile).not.toHaveBeenCalled();
  });

  it('treats a dismissed dialog (no answer) the same as a denial', async () => {
    const operations = buildFakeOperations('// old\n');
    const tool = createRequestCommentExceptionTool({ operations });
    const { ctx, select } = buildFakeCtx();
    select.mockResolvedValue(undefined);

    const result = await tool.execute(
      'call-1',
      { path: 'foo.ts', edits: [{ oldText: '// old', newText: '// new' }], reason: 'Needed.' },
      undefined,
      undefined,
      ctx,
    );

    expect(textOf(result.content)).toMatch(/denied/i);
    expect(operations.writeFile).not.toHaveBeenCalled();
  });

  it('returns the human feedback text when changes are requested, without mutating the file', async () => {
    const operations = buildFakeOperations('// old\n');
    const tool = createRequestCommentExceptionTool({ operations });
    const { ctx, select, input } = buildFakeCtx();
    select.mockResolvedValue(REQUEST_CHANGES);
    input.mockResolvedValue('Trim this to one line.');

    const result = await tool.execute(
      'call-1',
      { path: 'foo.ts', edits: [{ oldText: '// old', newText: '// new' }], reason: 'Needed.' },
      undefined,
      undefined,
      ctx,
    );

    expect(textOf(result.content)).toContain('Trim this to one line.');
    expect(operations.writeFile).not.toHaveBeenCalled();
  });

  it('tells the agent to try again when changes are requested with no feedback text', async () => {
    const operations = buildFakeOperations('// old\n');
    const tool = createRequestCommentExceptionTool({ operations });
    const { ctx, select, input } = buildFakeCtx();
    select.mockResolvedValue(REQUEST_CHANGES);
    input.mockResolvedValue(undefined);

    const result = await tool.execute(
      'call-1',
      { path: 'foo.ts', edits: [{ oldText: '// old', newText: '// new' }], reason: 'Needed.' },
      undefined,
      undefined,
      ctx,
    );

    expect(textOf(result.content)).toMatch(/try again/i);
    expect(operations.writeFile).not.toHaveBeenCalled();
  });

  it('falls back to real filesystem operations when none are supplied', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pi-clean-comments-'));
    const filePath = join(dir, 'foo.ts');
    writeFileSync(filePath, '// old\nconst x = 1;\n', 'utf-8');
    try {
      const tool = createRequestCommentExceptionTool();
      const { ctx, select } = buildFakeCtx({ cwd: dir });
      select.mockResolvedValue(APPROVE);

      await tool.execute(
        'call-1',
        {
          path: 'foo.ts',
          edits: [{ oldText: '// old', newText: '// old, kept on purpose' }],
          reason: 'This documents a non-obvious workaround.',
        },
        undefined,
        undefined,
        ctx,
      );

      expect(readFileSync(filePath, 'utf-8')).toBe('// old, kept on purpose\nconst x = 1;\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
