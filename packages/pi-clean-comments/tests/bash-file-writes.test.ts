import { describe, expect, it } from 'vitest';
import { findHeredocFileTargets } from '../extensions/bash-file-writes.js';

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
