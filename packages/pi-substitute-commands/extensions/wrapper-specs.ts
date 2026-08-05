/**
 * The Wrapper Unwrapping table: every supported wrapper command, and the
 * shape-specific rules for locating the real sub-command it invokes.
 * Matches `pi-guard`'s `WRAPPER_COMMANDS` table.
 */

/**
 * Passthrough wrapper: everything after the wrapper's own flags (and, for
 * wrappers that allow it, leading `NAME=VALUE` assignments) is the real
 * command and its arguments.
 */
export interface PassthroughWrapperSpec {
  kind: 'passthrough';
  /** Flags that consume the following word as their own argument. */
  flagsWithArg: ReadonlySet<string>;
  /** Whether leading `NAME=VALUE` words (e.g. `env`'s) are also skipped. */
  allowAssignments: boolean;
}

/**
 * Flag wrapper: a single flag's argument word is itself a nested script,
 * parsed the same way as a top-level command.
 */
export interface FlagWrapperSpec {
  kind: 'flag';
  flag: string;
}

/**
 * Exec wrapper: the sub-command runs between a keyword and either a
 * terminator word (`;`, `\;`, or `+`) or, for wrappers that don't require
 * one, the end of the argument list.
 */
export interface ExecWrapperSpec {
  kind: 'exec';
  keywords: ReadonlySet<string>;
  requiresTerminator: boolean;
}

export type WrapperSpec = PassthroughWrapperSpec | FlagWrapperSpec | ExecWrapperSpec;

export const WRAPPER_SPECS: Readonly<Record<string, WrapperSpec>> = {
  sudo: {
    kind: 'passthrough',
    flagsWithArg: new Set(['-u', '-g', '-p', '-U', '-r', '-t', '-T', '-C']),
    allowAssignments: false,
  },
  xargs: {
    kind: 'passthrough',
    flagsWithArg: new Set(['-I', '-n', '-P', '-s', '-a', '-d', '-E', '-L', '-l']),
    allowAssignments: false,
  },
  nice: {
    kind: 'passthrough',
    flagsWithArg: new Set(['-n']),
    allowAssignments: false,
  },
  nohup: {
    kind: 'passthrough',
    flagsWithArg: new Set(),
    allowAssignments: false,
  },
  env: {
    kind: 'passthrough',
    flagsWithArg: new Set(['-u', '-C', '-S']),
    allowAssignments: true,
  },
  strace: {
    kind: 'passthrough',
    flagsWithArg: new Set(['-e', '-o', '-p', '-s', '-u', '-a', '-O']),
    allowAssignments: false,
  },
  bash: { kind: 'flag', flag: '-c' },
  sh: { kind: 'flag', flag: '-c' },
  zsh: { kind: 'flag', flag: '-c' },
  find: {
    kind: 'exec',
    keywords: new Set(['-exec', '-ok']),
    requiresTerminator: true,
  },
  fd: {
    kind: 'exec',
    keywords: new Set(['-x', '--exec', '-X', '--exec-batch']),
    requiresTerminator: false,
  },
};

/** Words that terminate an exec wrapper's sub-command argument span. */
export const EXEC_TERMINATORS: ReadonlySet<string> = new Set([';', '\\;', '+']);
