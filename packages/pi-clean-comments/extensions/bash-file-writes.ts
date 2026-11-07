interface InterpreterWriteRule {
  interpreter: RegExp;
  writes: RegExp[];
}

interface Heredoc {
  delimiter: string;
  stripsTabs: boolean;
}

const HEREDOC_OPERATOR = /(?<!<)<<(-?)\s*(?:'([^'\n]+)'|"([^"\n]+)"|\\?([A-Za-z_][\w-]*))/g;

const PATH_TOKEN = String.raw`(?:"([^"]*)"|'([^']*)'|([^\s;&|<>()"'` + '`' + String.raw`]+))`;

const REDIRECT_SINK = new RegExp(String.raw`(?<![<>&\d])>>?(?![>&|(])\s*` + PATH_TOKEN, 'g');

const TEE_SINK = new RegExp(String.raw`(?<![\w./-])tee(?:\s+-[\w-]+)*\s+` + PATH_TOKEN, 'g');

function parseHeredocs(line: string): Heredoc[] {
  return [...line.matchAll(HEREDOC_OPERATOR)].map((match) => ({
    delimiter: match[2] ?? match[3] ?? match[4] ?? '',
    stripsTabs: match[1] === '-',
  }));
}

function isTerminator(line: string, heredoc: Heredoc): boolean {
  const withoutCr = line.replace(/\r$/, '');
  return (heredoc.stripsTabs ? withoutCr.replace(/^\t+/, '') : withoutCr) === heredoc.delimiter;
}

function findSinkTargets(line: string): string[] {
  return [...line.matchAll(REDIRECT_SINK), ...line.matchAll(TEE_SINK)]
    .map((match) => match[1] ?? match[2] ?? match[3])
    .filter((target): target is string => target !== undefined && target !== '');
}

export function findHeredocFileTargets(command: string): string[] {
  const lines = command.split('\n');
  const targets: string[] = [];

  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? '';
    index++;

    const heredocs = parseHeredocs(line);
    if (heredocs.length === 0) continue;

    let allTerminated = true;
    for (const heredoc of heredocs) {
      let terminatorIndex = -1;
      for (let i = index; i < lines.length; i++) {
        if (isTerminator(lines[i] ?? '', heredoc)) {
          terminatorIndex = i;
          break;
        }
      }
      if (terminatorIndex === -1) {
        allTerminated = false;
        index = lines.length;
        break;
      }
      index = terminatorIndex + 1;
    }

    if (allTerminated) targets.push(...findSinkTargets(line));
  }

  return targets;
}

// Interpreter scripts name their targets through variables (`p = 'a.ts'; open(p, 'w')`), so
// instead of resolving the path we look for any write call plus any path-like string literal.
// This over-blocks scripts that read one file and write another, which costs the agent a retry.
const INTERPRETER_WRITE_RULES: InterpreterWriteRule[] = [
  {
    interpreter: /\bpython[\d.]*\b/,
    writes: [
      /\bopen\s*\([^\n]*?['"][rwabxt+]*[wax+][rwabxt+]*['"]\s*[,)]/,
      /\.write_(?:text|bytes)\s*\(/,
    ],
  },
  {
    interpreter: /\b(?:node|bun|deno|tsx)\b/,
    writes: [/\b(?:writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream)\s*\(/],
  },
  {
    interpreter: /\bruby\b/,
    writes: [/\b(?:File|IO)\.(?:write|binwrite)\s*\(/, /\bFile\.open\s*\([^\n]*?['"][wa]\+?b?['"]/],
  },
];

// Scanned per quote type, not as one alternation: `python -c "open('a.ts', 'w')"` nests single-quoted
// literals inside a double-quoted shell argument, and an alternation would swallow them whole.
const STRING_LITERALS = [/'([^'\n]*)'/g, /"([^"\n]*)"/g, /`([^`\n]*)`/g];

const PATH_LITERAL = /^(?![a-z][a-z\d+.-]*:\/\/)[^\s*?<>|{}]+\.[A-Za-z][\w]*$/i;

function findPathLiterals(command: string): string[] {
  return STRING_LITERALS.flatMap((pattern) => [...command.matchAll(pattern)])
    .filter((match) => PATH_LITERAL.test(match[1] ?? ''))
    .sort((a, b) => a.index - b.index)
    .map((match) => match[1] ?? '');
}

export function findInterpreterFileTargets(command: string): string[] {
  const writesFiles = INTERPRETER_WRITE_RULES.some(
    ({ interpreter, writes }) =>
      interpreter.test(command) && writes.some((write) => write.test(command)),
  );
  return writesFiles ? findPathLiterals(command) : [];
}

export function findBashFileWriteTargets(command: string): string[] {
  return [...findHeredocFileTargets(command), ...findInterpreterFileTargets(command)];
}
