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
