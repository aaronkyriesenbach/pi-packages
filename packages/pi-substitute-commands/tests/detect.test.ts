import { describe, expect, it } from 'vitest';
import { findBlockableInvocations } from '../extensions/detect.js';

describe('findBlockableInvocations', () => {
  it('detects a bare disallowed command', () => {
    expect(findBlockableInvocations('grep TODO src')).toEqual([
      { command: 'grep', replacement: 'rg' },
    ]);
  });

  it('detects each command in the grep family', () => {
    for (const command of ['grep', 'egrep', 'fgrep', 'zgrep']) {
      expect(findBlockableInvocations(`${command} TODO .`)).toEqual([
        { command, replacement: 'rg' },
      ]);
    }
  });

  it('detects a bare find invocation', () => {
    expect(findBlockableInvocations('find . -name "*.ts"')).toEqual([
      { command: 'find', replacement: 'fd' },
    ]);
  });

  it('detects a disallowed command chained via ;', () => {
    expect(findBlockableInvocations('ls; grep TODO .')).toEqual([
      { command: 'grep', replacement: 'rg' },
    ]);
  });

  it('detects a disallowed command chained via &&', () => {
    expect(findBlockableInvocations('ls && grep TODO .')).toEqual([
      { command: 'grep', replacement: 'rg' },
    ]);
  });

  it('detects a disallowed command chained via ||', () => {
    expect(findBlockableInvocations('grep TODO . || true')).toEqual([
      { command: 'grep', replacement: 'rg' },
    ]);
  });

  it('detects a disallowed command chained via |', () => {
    expect(findBlockableInvocations('cat file.txt | grep TODO')).toEqual([
      { command: 'grep', replacement: 'rg' },
    ]);
  });

  it('detects find piped into a non-wrapper command', () => {
    expect(findBlockableInvocations('find . -type f | sort')).toEqual([
      { command: 'find', replacement: 'fd' },
    ]);
  });

  it('reports both the top-level find and the xargs-wrapped grep in find . | xargs grep TODO', () => {
    const result = findBlockableInvocations('find . | xargs grep TODO');
    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        { command: 'find', replacement: 'fd' },
        { command: 'grep', replacement: 'rg' },
      ]),
    );
  });

  it('dedupes multiple occurrences of the same disallowed command', () => {
    expect(findBlockableInvocations('grep foo .; grep bar .')).toEqual([
      { command: 'grep', replacement: 'rg' },
    ]);
  });

  it('reports multiple distinct disallowed commands, deduped', () => {
    const result = findBlockableInvocations('find . -name x; grep TODO .');
    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        { command: 'find', replacement: 'fd' },
        { command: 'grep', replacement: 'rg' },
      ]),
    );
  });

  it('never blocks git grep', () => {
    expect(findBlockableInvocations('git grep TODO .')).toEqual([]);
  });

  it('never blocks git grep chained with other commands', () => {
    expect(findBlockableInvocations('ls && git grep TODO . || true')).toEqual([]);
  });

  it('never blocks the git-grep binary form', () => {
    expect(findBlockableInvocations('git-grep TODO .')).toEqual([]);
  });

  it('does not treat a bare git invocation (no grep subcommand) as blockable', () => {
    expect(findBlockableInvocations('git status')).toEqual([]);
  });

  it('does not treat git with no arguments as blockable', () => {
    expect(findBlockableInvocations('git')).toEqual([]);
  });

  it('does not treat a nameless command (redirection only) as blockable', () => {
    expect(findBlockableInvocations('> out.txt')).toEqual([]);
  });

  it('does not block a compound statement with no Command Position hit (e.g. a subshell)', () => {
    expect(findBlockableInvocations('(echo hi)')).toEqual([]);
  });

  it('does not block find/grep appearing only as an argument', () => {
    expect(findBlockableInvocations('echo "don\'t grep for this"')).toEqual([]);
    expect(findBlockableInvocations('echo find')).toEqual([]);
  });

  it('does not block find/grep inside a quoted string', () => {
    expect(findBlockableInvocations('echo "please run find or grep later"')).toEqual([]);
  });

  it('returns an empty array for a command with nothing disallowed', () => {
    expect(findBlockableInvocations('ls -la && echo done')).toEqual([]);
  });

  it('fails open (returns an empty array) when unbash reports a parse error', () => {
    expect(findBlockableInvocations('find . -name "unterminated')).toEqual([]);
  });
});

describe('findBlockableInvocations: Passthrough wrapper unwrapping', () => {
  it.each(['sudo', 'xargs', 'nice', 'nohup', 'env', 'strace'])(
    'blocks a disallowed command wrapped in %s',
    (wrapper) => {
      expect(findBlockableInvocations(`${wrapper} grep foo`)).toEqual([
        { command: 'grep', replacement: 'rg' },
      ]);
    },
  );

  it('blocks a disallowed command piped into xargs', () => {
    expect(findBlockableInvocations('printf "%s\\n" foo | xargs grep foo')).toEqual([
      { command: 'grep', replacement: 'rg' },
    ]);
  });

  it("skips sudo's own flag (and its argument) to find the real sub-command", () => {
    expect(findBlockableInvocations('sudo -u root grep foo')).toEqual([
      { command: 'grep', replacement: 'rg' },
    ]);
  });

  it("skips env's own boolean flag to find the real sub-command", () => {
    expect(findBlockableInvocations('env -i grep foo')).toEqual([
      { command: 'grep', replacement: 'rg' },
    ]);
  });

  it('skips env NAME=VALUE assignments to find the real sub-command', () => {
    expect(findBlockableInvocations('env FOO=bar grep foo')).toEqual([
      { command: 'grep', replacement: 'rg' },
    ]);
  });

  it('never blocks git grep nested inside a passthrough wrapper', () => {
    expect(findBlockableInvocations('sudo git grep TODO .')).toEqual([]);
  });

  it('returns an empty array when a passthrough wrapper has no sub-command', () => {
    expect(findBlockableInvocations('sudo -u root')).toEqual([]);
  });

  it('nests Wrapper Unwrapping through a doubly-wrapped command', () => {
    expect(findBlockableInvocations('sudo xargs grep foo')).toEqual([
      { command: 'grep', replacement: 'rg' },
    ]);
  });
});

describe('findBlockableInvocations: Flag wrapper unwrapping', () => {
  it.each(['bash', 'sh', 'zsh'])('unwraps a disallowed command inside %s -c', (shell) => {
    expect(findBlockableInvocations(`${shell} -c 'grep foo'`)).toEqual([
      { command: 'grep', replacement: 'rg' },
    ]);
  });

  it('unwraps a disallowed find invocation inside sh -c', () => {
    expect(findBlockableInvocations("sh -c 'find . -name x'")).toEqual([
      { command: 'find', replacement: 'fd' },
    ]);
  });

  it('never blocks git grep nested inside bash -c', () => {
    expect(findBlockableInvocations("bash -c 'git grep TODO .'")).toEqual([]);
  });

  it('returns an empty array when the flag wrapper has no -c flag', () => {
    expect(findBlockableInvocations('bash script.sh')).toEqual([]);
  });

  it('fails open locally when the nested -c script fails to parse', () => {
    expect(findBlockableInvocations("bash -c 'if [ 1 ]'")).toEqual([]);
  });

  it('fails open locally for the nested script but keeps other findings from the same command', () => {
    expect(findBlockableInvocations("grep foo .; bash -c 'if [ 1 ]'")).toEqual([
      { command: 'grep', replacement: 'rg' },
    ]);
  });
});

describe('findBlockableInvocations: Exec wrapper unwrapping', () => {
  it('blocks the nested command in find -exec ... ;', () => {
    expect(findBlockableInvocations('find . -exec grep {} \\;')).toEqual([
      { command: 'find', replacement: 'fd' },
      { command: 'grep', replacement: 'rg' },
    ]);
  });

  it('blocks the nested command in find -exec ... +', () => {
    expect(findBlockableInvocations('find . -exec grep {} +')).toEqual([
      { command: 'find', replacement: 'fd' },
      { command: 'grep', replacement: 'rg' },
    ]);
  });

  it('blocks the nested command in find -ok ... ;', () => {
    expect(findBlockableInvocations('find . -ok grep {} \\;')).toEqual([
      { command: 'find', replacement: 'fd' },
      { command: 'grep', replacement: 'rg' },
    ]);
  });

  it('does not unwrap find -exec when it has no terminator', () => {
    expect(findBlockableInvocations('find . -exec grep {}')).toEqual([
      { command: 'find', replacement: 'fd' },
    ]);
  });

  it('does not unwrap an exec wrapper with no words before its terminator', () => {
    expect(findBlockableInvocations('find . -exec \\;')).toEqual([
      { command: 'find', replacement: 'fd' },
    ]);
  });

  it('does not unwrap fd -x with no sub-command words', () => {
    expect(findBlockableInvocations('fd . -x')).toEqual([]);
  });

  it('blocks the nested command in fd -x with no terminator', () => {
    expect(findBlockableInvocations('fd . -x grep')).toEqual([
      { command: 'grep', replacement: 'rg' },
    ]);
  });

  it.each(['--exec', '-X', '--exec-batch'])('blocks the nested command in fd %s', (keyword) => {
    expect(findBlockableInvocations(`fd . ${keyword} grep`)).toEqual([
      { command: 'grep', replacement: 'rg' },
    ]);
  });

  it('never blocks git grep nested inside find -exec', () => {
    expect(findBlockableInvocations('find . -exec git grep TODO {} \\;')).toEqual([
      { command: 'find', replacement: 'fd' },
    ]);
  });
});
