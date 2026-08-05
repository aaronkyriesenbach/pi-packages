import { parse } from 'unbash';
import type { Command, Node } from 'unbash';

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

/**
 * `git grep`/`git-grep` invokes git's own pattern search, not the standalone
 * `grep` binary, and is exempt regardless of subsequent arguments.
 */
function isGitGrepExemption(command: Command): boolean {
  const name = command.name?.value;
  if (name === 'git-grep') return true;
  return name === 'git' && command.suffix[0]?.value === 'grep';
}

function checkCommand(command: Command, found: Map<string, string>): void {
  if (isGitGrepExemption(command)) return;

  const name = command.name?.value;
  if (name === undefined) return;

  const replacement = SUBSTITUTION_TABLE[name];
  if (replacement !== undefined) found.set(name, replacement);
}

/**
 * Walks Command Position for the chaining forms this ticket covers
 * (`;`, `&&`, `||`, `|`, and bare statements). Deliberately does not recurse
 * into command substitutions, subshells, or other wrapper structures — those
 * are later tickets' scope.
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
