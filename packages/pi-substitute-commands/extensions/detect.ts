import { parse } from 'unbash';
import type { Command, Node, Word } from 'unbash';
import { EXEC_TERMINATORS, WRAPPER_SPECS, type WrapperSpec } from './wrapper-specs.js';

/**
 * A single Blockable Invocation: a disallowed command name found in Command
 * Position, paired with its recommended replacement.
 */
export interface BlockableInvocation {
  command: string;
  replacement: string;
}

/**
 * Substitution Pair table: blocked command name -> recommended replacement.
 * Adding a new pair is the only change needed to disallow another command.
 */
const SUBSTITUTION_TABLE: Readonly<Record<string, string>> = {
  find: 'fd',
  grep: 'rg',
  egrep: 'rg',
  fgrep: 'rg',
  zgrep: 'rg',
};

const ASSIGNMENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*=/;

/**
 * A resolved Command Position: a command name paired with the words that
 * follow it. Mirrors `Command.name`/`Command.suffix`, but can also describe
 * a sub-command exposed by Wrapper Unwrapping, which has no `Command` node
 * of its own.
 */
interface Invocation {
  name: string;
  words: readonly Word[];
}

/**
 * `git grep`/`git-grep` invokes git's own pattern search, not the standalone
 * `grep` binary, and is exempt regardless of subsequent arguments.
 */
function isGitGrepExemption(name: string, words: readonly Word[]): boolean {
  if (name === 'git-grep') return true;
  return name === 'git' && words[0]?.value === 'grep';
}

/**
 * Resolves a Passthrough wrapper's real sub-command: skips the wrapper's own
 * flags (and, for wrappers that allow it, leading `NAME=VALUE` assignments)
 * to find the first word in Command Position, treating every word after it
 * as that sub-command's own words.
 */
function resolvePassthrough(
  spec: { flagsWithArg: ReadonlySet<string>; allowAssignments: boolean },
  words: readonly Word[],
): Invocation | undefined {
  let index = words.length;
  let skipNext = false;
  for (const [i, word] of words.entries()) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    const value = word.value;
    if (spec.allowAssignments && ASSIGNMENT_PATTERN.test(value)) continue;
    if (value.startsWith('-')) {
      skipNext = !value.includes('=') && spec.flagsWithArg.has(value);
      continue;
    }
    index = i;
    break;
  }

  const nameWord = words[index];
  if (nameWord === undefined) return undefined;
  return { name: nameWord.value, words: words.slice(index + 1) };
}

/**
 * Resolves a Flag wrapper's nested script: the word immediately following
 * the wrapper's flag (e.g. `-c`), if present.
 */
function resolveFlagWrapperScript(
  spec: { flag: string },
  words: readonly Word[],
): string | undefined {
  const flagIndex = words.findIndex((word) => word.value === spec.flag);
  if (flagIndex === -1) return undefined;
  return words[flagIndex + 1]?.value;
}

/**
 * Resolves an Exec wrapper's real sub-command: the words between its
 * keyword (e.g. `-exec`) and either a terminator word or, for wrappers that
 * don't require one, the end of the argument list.
 */
function resolveExecWrapper(
  spec: { keywords: ReadonlySet<string>; requiresTerminator: boolean },
  words: readonly Word[],
): Invocation | undefined {
  const keywordIndex = words.findIndex((word) => spec.keywords.has(word.value));
  if (keywordIndex === -1) return undefined;

  const start = keywordIndex + 1;
  let terminatorIndex = words.findIndex(
    (word, index) => index >= start && EXEC_TERMINATORS.has(word.value),
  );
  if (terminatorIndex === -1) {
    if (spec.requiresTerminator) return undefined;
    terminatorIndex = words.length;
  }

  const subWords = words.slice(start, terminatorIndex);
  const nameWord = subWords[0];
  if (nameWord === undefined) return undefined;
  return { name: nameWord.value, words: subWords.slice(1) };
}

/**
 * Fails open locally: a nested script that `unbash` can't confidently parse
 * (e.g. a malformed `bash -c` argument) contributes no findings of its own,
 * without discarding findings already recorded elsewhere in the command.
 */
function walkScriptSource(source: string, found: Map<string, string>): void {
  try {
    const script = parse(source);
    if (script.errors && script.errors.length > 0) return;
    for (const statement of script.commands) walk(statement, found);
  } catch {
    // Fail open: this nested script contributes nothing.
  }
}

function handleWrapper(
  spec: WrapperSpec,
  words: readonly Word[],
  found: Map<string, string>,
): void {
  switch (spec.kind) {
    case 'passthrough': {
      const sub = resolvePassthrough(spec, words);
      if (sub) checkInvocation(sub.name, sub.words, found);
      return;
    }
    case 'flag': {
      const script = resolveFlagWrapperScript(spec, words);
      if (script !== undefined) walkScriptSource(script, found);
      return;
    }
    case 'exec': {
      const sub = resolveExecWrapper(spec, words);
      if (sub) checkInvocation(sub.name, sub.words, found);
      return;
    }
  }
}

/**
 * Checks a resolved Command Position: records it if it's a directly blocked
 * command, and recurses into Wrapper Unwrapping if it's a supported wrapper
 * (a command can be both, e.g. `find` is blocked and is also an Exec
 * wrapper via `-exec`/`-ok`).
 */
function checkInvocation(name: string, words: readonly Word[], found: Map<string, string>): void {
  if (isGitGrepExemption(name, words)) return;

  const replacement = SUBSTITUTION_TABLE[name];
  if (replacement !== undefined) found.set(name, replacement);

  const wrapper = WRAPPER_SPECS[name];
  if (wrapper !== undefined) handleWrapper(wrapper, words, found);
}

function checkCommand(command: Command, found: Map<string, string>): void {
  const name = command.name?.value;
  if (name === undefined) return;

  checkInvocation(name, command.suffix, found);
}

/**
 * Walks Command Position for the chaining forms this ticket covers
 * (`;`, `&&`, `||`, `|`, and bare statements). Deliberately does not recurse
 * into command substitutions, subshells, or other compound structures —
 * those are later tickets' scope. Wrapper Unwrapping (`sudo`, `xargs`,
 * `bash -c`, `find -exec`, etc.) is handled separately, from Command
 * Position outward, once a Command node is reached.
 */
function walk(node: Node, found: Map<string, string>): void {
  switch (node.type) {
    case 'Statement':
      walk(node.command, found);
      return;
    case 'Pipeline':
    case 'AndOr':
      for (const child of node.commands) walk(child, found);
      return;
    case 'Command':
      checkCommand(node, found);
      return;
    default:
      return;
  }
}

/**
 * Finds every distinct Blockable Invocation (deduped by blocked command
 * name) in `command`. Fails open — returns an empty array — whenever
 * `unbash` reports parse errors or throws, since static parsing can't verify
 * anything about a command it can't confidently parse.
 */
export function findBlockableInvocations(command: string): BlockableInvocation[] {
  try {
    const script = parse(command);
    if (script.errors && script.errors.length > 0) return [];

    const found = new Map<string, string>();
    for (const statement of script.commands) walk(statement, found);
    return [...found.entries()].map(([blockedCommand, replacement]) => ({
      command: blockedCommand,
      replacement,
    }));
  } catch {
    return [];
  }
}
