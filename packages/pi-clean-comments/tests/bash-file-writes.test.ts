import { describe, expect, it } from 'vitest';
import {
  findBashFileWriteTargets,
  findHeredocFileTargets,
  findInterpreterFileTargets,
} from '../extensions/bash-file-writes.js';

describe('findHeredocFileTargets', () => {
  it.each([
    ["cat > ci.yaml <<'EOF'\na: 1\nEOF", ['ci.yaml']],
    ['cat > ci.yaml <<EOF\na: 1\nEOF', ['ci.yaml']],
    ['cat <<EOF > src/a.ts\nconst a = 1;\nEOF', ['src/a.ts']],
    ["cat >> deploy.sh <<'EOF'\necho hi\nEOF", ['deploy.sh']],
    ["cat <<'EOF' | tee x.py\nprint(1)\nEOF", ['x.py']],
    ['tee -a x.py <<EOF\nprint(1)\nEOF', ['x.py']],
    ['sudo tee /etc/app.yaml <<EOF\na: 1\nEOF', ['/etc/app.yaml']],
    ['cd sub && cat > f.yml <<EOF\na: 1\nEOF', ['f.yml']],
    ['cat > "my file.yaml" <<EOF\na: 1\nEOF', ['my file.yaml']],
    ["cat > 'a.yaml' <<EOF\na: 1\nEOF", ['a.yaml']],
    ['cat <<-EOF > a.yaml\n\ta: 1\n\tEOF', ['a.yaml']],
    ['cat > a.yaml <<EOF\na: 1\nEOF\ncat > b.yaml <<EOF\nb: 1\nEOF', ['a.yaml', 'b.yaml']],
    ['cat>a.yaml<<EOF\na: 1\nEOF', ['a.yaml']],
    ['cat <<EOF > >(tee x.yaml)\nhi\nEOF', ['x.yaml']],
  ])('finds the file target of %j', (command, expected) => {
    expect(findHeredocFileTargets(command)).toEqual(expected);
  });

  it.each([
    ['ls'],
    ['cat file.yaml | grep x'],
    ['cat in.yaml > out.yaml'],
    ['echo hi > out.yaml'],
    ['python - <<EOF\nprint(1)\nEOF'],
    ['kubectl apply -f - <<EOF\na: 1\nEOF'],
    ['git commit -m "$(cat <<\'EOF\'\nfeat: add thing\nEOF\n)"'],
    ['cat <<EOF >&2\nwarn\nEOF'],
    ['cat <<EOF 2> err.log\nhi\nEOF'],
    ['cat <<EOF &> all.log\nhi\nEOF'],
    ['grep x <<< "a > b.yaml"'],
  ])('finds no target for %j', (command) => {
    expect(findHeredocFileTargets(command)).toEqual([]);
  });

  it('ignores redirect-looking text inside a heredoc body', () => {
    const command = ['cat <<EOF', 'echo hi > nested.yaml', 'EOF'].join('\n');
    expect(findHeredocFileTargets(command)).toEqual([]);
  });

  it('ignores a heredoc operator with no terminator line', () => {
    expect(findHeredocFileTargets('echo "x <<EOF" > a.yaml')).toEqual([]);
  });

  it('does not match a terminator that is merely prefixed by the delimiter', () => {
    const command = 'cat > a.yaml <<EOF\nEOFX\n';
    expect(findHeredocFileTargets(command)).toEqual([]);
  });

  it('reports variable-based targets so the caller can decide what to do with them', () => {
    expect(findHeredocFileTargets('cat > "$OUT/x.yaml" <<EOF\na: 1\nEOF')).toEqual(['$OUT/x.yaml']);
  });

  it('handles several heredocs on one line', () => {
    const command = 'cat > a.yaml <<ONE; cat <<TWO\none\nONE\ntwo\nTWO';
    expect(findHeredocFileTargets(command)).toEqual(['a.yaml']);
  });
});

describe('findInterpreterFileTargets', () => {
  it.each([
    [`python3 -c "open('a.ts', 'w').write('x')"`, ['a.ts']],
    ["python - <<'E'\np='a.ts'; s=open(p).read()\nopen(p,'w').write(s)\nE", ['a.ts']],
    [`python3 -c "open('a.ts', mode='w')"`, ['a.ts']],
    [`python3 -c "open('a.ts', 'ab')"`, ['a.ts']],
    [`python3 -c "open(os.path.join(d, 'a.ts'), 'w')"`, ['a.ts']],
    [`uv run python -c "Path('src/a.ts').write_text('x')"`, ['src/a.ts']],
    [`python3 -c "Path('a.bin').write_bytes(b'')"`, ['a.bin']],
    [`node -e "fs.writeFileSync('a.ts', 'x')"`, ['a.ts']],
    [`bun -e "await fs.promises.appendFile('a.sh', 'x')"`, ['a.sh']],
    ['node -e "fs.createWriteStream(`a.ts`)"', ['a.ts']],
    [`ruby -e "File.write('a.rb', 'x')"`, ['a.rb']],
    [`ruby -e "File.open('a.rb', 'w') { |f| f << 1 }"`, ['a.rb']],
  ])('finds the path literals in %j', (command, expected) => {
    expect(findInterpreterFileTargets(command)).toEqual(expected);
  });

  it('finds every path literal in a multi-file script, in source order', () => {
    const command = [
      "cd apps/arr && python3 - <<'E'",
      "p='configarr.ts'; s=open(p).read()",
      `s=s.replace('''a(\n  "api-key",\n)''','''b''')`,
      "open(p,'w').write(s)",
      "p='configarr.config.ts'; s=open(p).read()",
      `s=s.replace('  nzbgeek: "K",\\n','  nzbLife: "L",\\n')`,
      "open(p,'w').write(s)",
      'E',
    ].join('\n');
    expect(findInterpreterFileTargets(command)).toEqual(['configarr.ts', 'configarr.config.ts']);
  });

  it.each([
    ['a read-only python script', `python3 -c "print(open('a.ts').read())"`],
    ['a python script that does not write', `python3 -c "print('a.ts')"`],
    ['a write with no path literal', `python3 -c "open(sys.argv[1], 'w')"`],
    ['a write call with no interpreter', `echo "open('a.ts', 'w')"`],
    ["another language's write call", `python3 -c "fs.writeFileSync('a.ts')"`],
    ['a url literal', `python3 -c "open(p, 'w'); u = 'https://example.com/a.ts'"`],
    ['a glob literal', `python3 -c "open(p, 'w'); g = 'src/*.ts'"`],
    ['a non-path literal', `python3 -c "open(p, 'w'); s = 'hello world.'"`],
    ['pytest', 'python3 -m pytest tests/test_a.py'],
  ])('finds nothing for %s', (_label, command) => {
    expect(findInterpreterFileTargets(command)).toEqual([]);
  });
});

describe('findBashFileWriteTargets', () => {
  it('combines heredoc and interpreter targets', () => {
    const command = `cat > a.yaml <<EOF\nx\nEOF\npython3 -c "open('b.ts', 'w')"`;
    expect(findBashFileWriteTargets(command)).toEqual(['a.yaml', 'b.ts']);
  });
});
