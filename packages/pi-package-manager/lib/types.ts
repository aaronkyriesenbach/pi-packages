export interface PackageInfo {
  /** Package name, e.g. "pi-lens" or "@juicesharp/rpiv-todo" */
  name: string;
  /** Source specifier, e.g. "npm:pi-lens" */
  source: string;
  /** Installed version from package.json */
  version: string;
  /** Whether the package is currently enabled (not filtered out in settings) */
  enabled: boolean;
  /** Resources provided by this package */
  resources: PackageResources;
  /** Whether an update is available (populated after update check) */
  updateAvailable?: boolean;
  /** Latest version from registry (populated after update check) */
  latestVersion?: string;
}

export interface PackageResources {
  extensions: string[];
  skills: string[];
  prompts: string[];
  themes: string[];
}

export interface Settings {
  packages?: (string | PackageFilter)[];
  [key: string]: unknown;
}

export interface PackageFilter {
  source: string;
  extensions?: string[];
  skills?: string[];
  prompts?: string[];
  themes?: string[];
}

export interface PackageJson {
  name: string;
  version: string;
  keywords?: string[];
  pi?: {
    extensions?: string[];
    skills?: string[];
    prompts?: string[];
    themes?: string[];
  };
}

export interface AutoUpdateConfig {
  intervalMs: number;
  enabled: boolean;
  displayText: string;
  nextCheck: number;
}
