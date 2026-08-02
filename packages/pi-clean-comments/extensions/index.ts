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
  m: ['//'],
  php: ['//', '#'],
  py: ['#'],
  rb: ['#'],
  sh: ['#'],
  bash: ['#'],
  zsh: ['#'],
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

export function countCommentLines(lines: string[], tokens: string[]): number {
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || isShebang(line, i)) continue;
    if (isCommentLine(line, tokens)) count++;
  }
  return count;
}

/**
 * Extract new-side (+) lines from a unified diff patch, skipping the
 * "+++ b/path" file header (which also starts with "+").
 */
export function extractAddedLines(patch: string): string[] {
  const added: string[] = [];
  for (const rawLine of patch.split('\n')) {
    if (rawLine.startsWith('+++')) continue;
    if (rawLine.startsWith('+')) added.push(rawLine.slice(1));
  }
  return added;
}

export function messageFor(n: number): string {
  if (n === 1) {
    return "Comment check (1 touched): default is delete. Keep it only if it explains a non-obvious why/gotcha the code can't show itself — otherwise remove it or cut it to the minimum.";
  }
  return `Comment check (${n.toFixed(0)} touched): default is delete. Keep only ones that explain a non-obvious why/gotcha the code can't show itself — otherwise remove or cut each to the minimum.`;
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

      const n = countCommentLines(extractAddedLines(patch), tokens);
      if (n === 0) return undefined;

      return { content: appendNote(event.content, messageFor(n)) };
    }

    if (isWriteToolResult(event)) {
      const filePath = event.input.path;
      const fileContent = event.input.content;
      if (typeof filePath !== 'string' || typeof fileContent !== 'string') return undefined;
      const tokens = getCommentTokens(filePath);
      if (!tokens) return undefined;

      // Write supplies the full file body, so every line in it was authored
      // this call — no diffing needed, just scan the whole thing.
      const n = countCommentLines(fileContent.split('\n'), tokens);
      if (n === 0) return undefined;

      return { content: appendNote(event.content, messageFor(n)) };
    }

    return undefined;
  });
}
