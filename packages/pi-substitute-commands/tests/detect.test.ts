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

  it('reports only the top-level grep in find . | xargs grep TODO', () => {
    // xargs wrapper unwrapping is out of scope for this ticket; only the
    // top-level find (not itself wrapped) is expected here.
    expect(findBlockableInvocations('find . | xargs grep TODO')).toEqual([
      { command: 'find', replacement: 'fd' },
    ]);
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
