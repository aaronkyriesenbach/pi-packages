import type { ExtensionAPI, ToolResultEvent } from '@earendil-works/pi-coding-agent';
import { isEditToolResult, isWriteToolResult } from '@earendil-works/pi-coding-agent';
import path from 'node:path';

/**
 * Nudges the agent to reconsider every comment it touches (adds or edits).
 *
 * Trigger: fires once per Edit/Write tool call that touches at least one
 * comment line. Detection is purely structural (comment-token matching per
 * file extension) — no NLP classification, no allowlist, so it can't miss a
 * comment style it wasn't trained to recognize. The default framing is
 * "delete unless it earns its place" per project AGENTS.md policy.
 *
 * The note quotes back each added comment's file:line and text rather than
 * just a count, groups contiguous comment lines into blocks, and scales
 * both wording and the tag's severity attribute by block length — a 1-line
 * comment gets a light sanity check, a 10-line block gets told it's almost
 * never required. A generic "N touched" reminder is easy to skim past on
 * the tenth occurrence; the agent's own words quoted back at it, sized to
 * how much it actually wrote, are harder to wave off.
 */

// One primary comment token set per file extension. Extend as needed.
export const COMMENT_TOKENS: Record<string, string[]> = {
  ts: ['//'],
  tsx: ['//'],
  js: ['//'],
  jsx: ['//'],
  mjs: ['//'],
  cjs: ['//'],
  go: ['//'],
  rs: ['//'],
  java: ['//'],
  c: ['//'],
  h: ['//'],
  cpp: ['//'],
  hpp: ['//'],
  cc: ['//'],
  cs: ['//'],
  swift: ['//'],
  kt: ['//'],
  kts: ['//'],
  scala: ['//'],
  dart: ['//'],
  m: ['//'],
  php: ['//', '#'],
  py: ['#'],
  rb: ['#'],
  sh: ['#'],
  bash: ['#'],
  zsh: ['#'],
  ps1: ['#'],
  yaml: ['#'],
  yml: ['#'],
  toml: ['#'],
  pl: ['#'],
  r: ['#'],
  ex: ['#'],
  exs: ['#'],
  sql: ['--'],
  lua: ['--'],
  hs: ['--'],
  lisp: [';'],
  clj: [';'],
  cljs: [';'],
  el: [';'],
};

export function getCommentTokens(filePath: string): string[] | undefined {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return COMMENT_TOKENS[ext];
}

export function isShebang(line: string, lineIndex: number): boolean {
  return lineIndex === 0 && line.startsWith('#!');
}

export function isCommentLine(line: string, tokens: string[]): boolean {
  const trimmed = line.trim();
  if (trimmed === '') return false;
  return tokens.some((token) => trimmed.startsWith(token));
}

export interface PatchLine {
  /** 1-based line number in the new (post-edit) file. */
  lineNumber: number;
  text: string;
}

export interface CommentHit {
  /** 1-based line number in the file the comment lives in. */
  line: number;
  text: string;
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Extract new-side (+) lines from a unified diff patch, paired with their
 * 1-based line number in the resulting file. Context and removed lines
 * advance/skip the line cursor without being returned; the "+++ b/path"
 * and hunk header lines are structural and never content.
 */
export function extractAddedLines(patch: string): PatchLine[] {
  const added: PatchLine[] = [];
  let cursor: number | undefined;
  for (const rawLine of patch.split('\n')) {
    if (rawLine.startsWith('+++') || rawLine.startsWith('---')) continue;
    const hunkMatch = HUNK_HEADER.exec(rawLine);
    if (hunkMatch) {
      cursor = Number(hunkMatch[1]);
      continue;
    }
    // Content lines can only be interpreted once a hunk header has set the cursor.
    if (cursor === undefined) continue;
    if (rawLine.startsWith('+')) {
      added.push({ lineNumber: cursor, text: rawLine.slice(1) });
      cursor++;
    } else if (rawLine.startsWith('-')) {
      // Removed line: doesn't exist in the new file, cursor doesn't advance.
    } else {
      // Unchanged context line: still consumes a line number in the new file.
      cursor++;
    }
  }
  return added;
}

/** Filter patch lines down to added comment lines, tagged with their line number. */
export function findAddedCommentHits(patchLines: PatchLine[], tokens: string[]): CommentHit[] {
  const hits: CommentHit[] = [];
  for (const { lineNumber, text } of patchLines) {
    if (isShebang(text, lineNumber - 1)) continue;
    if (isCommentLine(text, tokens)) hits.push({ line: lineNumber, text: text.trim() });
  }
  return hits;
}

/** Filter whole-file lines down to comment lines, tagged with their line number. */
export function findCommentHits(lines: string[], tokens: string[]): CommentHit[] {
  const hits: CommentHit[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || isShebang(line, i)) continue;
    if (isCommentLine(line, tokens)) hits.push({ line: i + 1, text: line.trim() });
  }
  return hits;
}

export interface CommentBlock {
  /** 1-based line number of the block's first line. */
  startLine: number;
  /** 1-based line number of the block's last line. */
  endLine: number;
  /** Trimmed comment text, one entry per line, in order. */
  lines: string[];
}

/** Group comment hits into contiguous runs — a 10-line comment is one block, not 10. */
export function groupCommentBlocks(hits: CommentHit[]): CommentBlock[] {
  const sorted = [...hits].sort((a, b) => a.line - b.line);
  const blocks: CommentBlock[] = [];
  for (const hit of sorted) {
    const last = blocks[blocks.length - 1];
    if (last && hit.line === last.endLine + 1) {
      last.endLine = hit.line;
      last.lines.push(hit.text);
    } else {
      blocks.push({ startLine: hit.line, endLine: hit.line, lines: [hit.text] });
    }
  }
  return blocks;
}

export type CommentSeverity = 'single' | 'short' | 'long';

/**
 * A single line rarely needs more than a sanity check. A short block already
 * risks narrating instead of explaining. A long block is the case the
 * original "delete unless it earns its place" policy most needs teeth for,
 * so it gets the most demanding bar: justify every line or cut it down hard.
 */
export function commentSeverityFor(lineCount: number): CommentSeverity {
  if (lineCount <= 1) return 'single';
  if (lineCount <= 4) return 'short';
  return 'long';
}

const SEVERITY_RANK: Record<CommentSeverity, number> = { single: 0, short: 1, long: 2 };

function maxSeverity(blocks: CommentBlock[]): CommentSeverity {
  let max: CommentSeverity = 'single';
  for (const block of blocks) {
    const tier = commentSeverityFor(block.lines.length);
    if (SEVERITY_RANK[tier] > SEVERITY_RANK[max]) max = tier;
  }
  return max;
}

// Rotated deterministically per block (by a hash of what was touched, not
// randomness) so a fixed instruction sentence doesn't become an identical
// string the agent has learned to pattern-match past by the tenth occurrence
// in a session.
const TIER_INSTRUCTIONS: Record<CommentSeverity, readonly string[]> = {
  single: [
    "Make sure you actually need this — if it doesn't state a non-obvious why/gotcha the code can't show itself, delete it now.",
    'One line, one chance to earn its place: does it state a non-obvious why/gotcha? If not, cut it now.',
  ],
  short: [
    "Multi-line comments rarely earn their place. Justify why this can't be a single line, or delete it now.",
    'Before keeping all of this: could it be one line, or nothing? Cut it down or delete it now.',
  ],
  long: [
    'Comment blocks this long are almost never required. Give a specific, concrete reason every single line is necessary — or cut it down to 2 lines or fewer, right now.',
    'This reads like documentation, not a comment. Justify each line explicitly, or compress it to at most 2 lines, right now.',
  ],
};

function pickInstruction(tier: CommentSeverity, seed: number): string {
  const variants = TIER_INSTRUCTIONS[tier];
  const instruction = variants[seed % variants.length];
  if (!instruction) throw new Error('TIER_INSTRUCTIONS entries must not be empty');
  return instruction;
}

export function formatBlock(filePath: string, block: CommentBlock): string {
  const lineCount = block.lines.length;
  const tier = commentSeverityFor(lineCount);
  const seed =
    filePath.length + block.startLine + block.lines.reduce((sum, line) => sum + line.length, 0);
  const instruction = pickInstruction(tier, seed);
  const label = lineCount === 1 ? '1-line comment' : `${lineCount.toFixed(0)}-line comment block`;
  const location =
    lineCount === 1
      ? `${filePath}:${block.startLine.toFixed(0)}`
      : `${filePath}:${block.startLine.toFixed(0)}-${block.endLine.toFixed(0)}`;
  const quoted = block.lines
    .map((text, i) => `  ${filePath}:${(block.startLine + i).toFixed(0)}: ${text}`)
    .join('\n');
  return [`${location} (${label}):`, quoted, instruction].join('\n');
}

export function messageFor(filePath: string, hits: CommentHit[]): string {
  const blocks = groupCommentBlocks(hits);
  const noun = blocks.length === 1 ? '1 new comment' : `${blocks.length.toFixed(0)} new comments`;
  const body = blocks.map((block) => formatBlock(filePath, block)).join('\n\n');
  return [
    `<comment-check required severity="${maxSeverity(blocks)}">`,
    `${noun} in ${filePath} need justification before you continue:`,
    '',
    body,
    '</comment-check>',
  ].join('\n');
}

export function appendNote(
  content: ToolResultEvent['content'],
  note: string,
): ToolResultEvent['content'] {
  return [...content, { type: 'text', text: `\n${note}` }];
}

export default function (pi: ExtensionAPI): void {
  pi.on('tool_result', (event) => {
    if (event.isError) return undefined;

    if (isEditToolResult(event)) {
      const filePath = event.input.path;
      if (typeof filePath !== 'string') return undefined;
      const tokens = getCommentTokens(filePath);
      if (!tokens) return undefined;

      const patch = event.details?.patch;
      if (!patch) return undefined;

      const hits = findAddedCommentHits(extractAddedLines(patch), tokens);
      if (hits.length === 0) return undefined;

      return { content: appendNote(event.content, messageFor(filePath, hits)) };
    }

    if (isWriteToolResult(event)) {
      const filePath = event.input.path;
      const fileContent = event.input.content;
      if (typeof filePath !== 'string' || typeof fileContent !== 'string') return undefined;
      const tokens = getCommentTokens(filePath);
      if (!tokens) return undefined;

      // Write supplies the full file body, so every line in it was authored
      // this call — no diffing needed, just scan the whole thing.
      const hits = findCommentHits(fileContent.split('\n'), tokens);
      if (hits.length === 0) return undefined;

      return { content: appendNote(event.content, messageFor(filePath, hits)) };
    }

    return undefined;
  });
}
