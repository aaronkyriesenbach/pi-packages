import path from 'node:path';

const HASH = ['#'];
const HASH_OR_SEMICOLON = ['#', ';'];

const CONTAINER_BUILD_FILE = /^(?:(?:docker|container)file(?:\..+)?|.+\.(?:docker|container)file)$/;

const FILENAME_COMMENT_TOKENS: Record<string, string[]> = {
  '.dockerignore': HASH,
  '.containerignore': HASH,
  makefile: HASH,
  gnumakefile: HASH,
  justfile: HASH,
  '.justfile': HASH,
  vagrantfile: HASH,
  gemfile: HASH,
  rakefile: HASH,
  jenkinsfile: ['//'],
  '.gitignore': HASH,
  '.gitattributes': HASH,
  '.env': HASH,
  '.bashrc': HASH,
  '.zshrc': HASH,
  '.profile': HASH,
  '.npmrc': HASH_OR_SEMICOLON,
  '.editorconfig': HASH_OR_SEMICOLON,
};

const FILENAME_COMMENT_PATTERNS: { pattern: RegExp; tokens: string[] }[] = [
  { pattern: CONTAINER_BUILD_FILE, tokens: HASH },
  { pattern: /^\.env\..+$/, tokens: HASH },
];

export function getFilenameCommentTokens(filePath: string): string[] | undefined {
  const name = path.basename(filePath).toLowerCase();
  const exact = FILENAME_COMMENT_TOKENS[name];
  if (exact) return exact;
  return FILENAME_COMMENT_PATTERNS.find(({ pattern }) => pattern.test(name))?.tokens;
}

export interface FunctionalCommentRule {
  pattern: RegExp;
  maxLineIndex?: number;
}

const DOCKERFILE_DIRECTIVE: FunctionalCommentRule = {
  pattern: /^\s*#\s*(?:syntax|escape|check)\s*=/i,
  maxLineIndex: 2,
};

const JUSTFILE_RECIPE_SHEBANG: FunctionalCommentRule = { pattern: /^\s+#!/ };

export function getFunctionalCommentRule(filePath: string): FunctionalCommentRule | undefined {
  const name = path.basename(filePath).toLowerCase();
  if (CONTAINER_BUILD_FILE.test(name)) return DOCKERFILE_DIRECTIVE;
  if (name === 'justfile' || name === '.justfile' || name.endsWith('.just')) {
    return JUSTFILE_RECIPE_SHEBANG;
  }
  return undefined;
}

export function isFunctionalComment(
  line: string,
  lineIndex: number,
  rule: FunctionalCommentRule | undefined,
): boolean {
  if (!rule) return false;
  if (rule.maxLineIndex !== undefined && lineIndex > rule.maxLineIndex) return false;
  return rule.pattern.test(line);
}
