import { homedir } from "node:os";
import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI, ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey } from "@earendil-works/pi-tui";

import { isNewerVersion, shouldCheckForUpdates } from "./lib/updates";
import { resolveDeclared } from "./lib/packages";
import type {
  AutoUpdateConfig,
  PackageFilter,
  PackageInfo,
  PackageJson,
  Settings,
} from "./lib/types";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

function settingsPath(): string {
  return join(homedir(), ".pi", "agent", "settings.json");
}

function npmDir(): string {
  return join(homedir(), ".pi", "agent", "npm", "node_modules");
}

function cacheDir(): string {
  return join(homedir(), ".pi", "agent", ".extmgr-cache");
}

async function readSettings(): Promise<Settings> {
  try {
    const raw = await readFile(settingsPath(), "utf-8");
    return JSON.parse(raw) as Settings;
  } catch {
    return {};
  }
}

async function writeSettings(settings: Settings): Promise<void> {
  await writeFile(
    settingsPath(),
    JSON.stringify(settings, null, 2) + "\n",
    "utf-8",
  );
}

async function readPackageJson(pkgName: string): Promise<PackageJson | null> {
  const pkgPath = join(npmDir(), pkgName, "package.json");
  try {
    const raw = await readFile(pkgPath, "utf-8");
    return JSON.parse(raw) as PackageJson;
  } catch {
    return null;
  }
}

async function readAutoUpdateConfig(): Promise<AutoUpdateConfig> {
  const defaults: AutoUpdateConfig = {
    intervalMs: 3600000,
    enabled: true,
    displayText: "1 hour",
    nextCheck: 0,
  };
  try {
    const raw = await readFile(join(cacheDir(), "auto-update.json"), "utf-8");
    return { ...defaults, ...(JSON.parse(raw) as Partial<AutoUpdateConfig>) };
  } catch {
    return defaults;
  }
}

async function writeAutoUpdateConfig(config: AutoUpdateConfig): Promise<void> {
  await mkdir(cacheDir(), { recursive: true });
  await writeFile(
    join(cacheDir(), "auto-update.json"),
    JSON.stringify(config, null, 2) + "\n",
    "utf-8",
  );
}

async function getLatestVersion(pkgName: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("npm", ["view", pkgName, "version"], {
      timeout: 15000,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function resolvePackageEntry(
  entry: string | PackageFilter,
  sessionDisabled: Set<string>,
): Promise<PackageInfo | null> {
  const source = typeof entry === "string" ? entry : entry.source;
  if (!source.startsWith("npm:")) return null;
  const name = source.slice(4);

  const pkgJson = await readPackageJson(name);
  const enabled =
    typeof entry === "string"
      ? !sessionDisabled.has(source)
      : isFilterEnabled(entry) && !sessionDisabled.has(source);

  const resources =
    typeof entry === "string"
      ? {
          extensions: pkgJson?.pi?.extensions ?? [],
          skills: pkgJson?.pi?.skills ?? [],
          prompts: pkgJson?.pi?.prompts ?? [],
          themes: pkgJson?.pi?.themes ?? [],
        }
      : {
          extensions: resolveDeclared(
            pkgJson?.pi?.extensions ?? [],
            entry.extensions,
          ),
          skills: resolveDeclared(pkgJson?.pi?.skills ?? [], entry.skills),
          prompts: resolveDeclared(pkgJson?.pi?.prompts ?? [], entry.prompts),
          themes: resolveDeclared(pkgJson?.pi?.themes ?? [], entry.themes),
        };

  return {
    name,
    source,
    version: pkgJson?.version ?? "unknown",
    enabled,
    resources,
  };
}

// ---------------------------------------------------------------------------
// TUI component for /packages
// ---------------------------------------------------------------------------

class PackageListComponent {
  private packages: Array<PackageInfo & { _persistedEnabled?: boolean }>;
  private selectedIndex = 0;
  private settings: Settings;
  private autoUpdateEnabled: boolean;
  private theme: Theme;
  private onClose: (result: { settings: Settings; autoUpdateEnabled: boolean }) => void;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    packages: PackageInfo[],
    settings: Settings,
    autoUpdateEnabled: boolean,
    theme: Theme,
    onClose: (result: { settings: Settings; autoUpdateEnabled: boolean }) => void,
  ) {
    this.packages = packages.map((p) => ({
      ...p,
      _persistedEnabled: p.enabled,
    }));
    this.settings = settings;
    this.autoUpdateEnabled = autoUpdateEnabled;
    this.theme = theme;
    this.onClose = onClose;
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape")) {
      this.onClose({ settings: this.settings, autoUpdateEnabled: this.autoUpdateEnabled });
      return;
    }

    if (matchesKey(data, "enter") || matchesKey(data, "return")) {
      this.onClose({ settings: this.settings, autoUpdateEnabled: this.autoUpdateEnabled });
      return;
    }

    if (matchesKey(data, "j") || matchesKey(data, "down")) {
      if (this.packages.length === 0) return;
      this.selectedIndex = (this.selectedIndex + 1) % this.packages.length;
      this.invalidate();
      return;
    }

    if (matchesKey(data, "k") || matchesKey(data, "up")) {
      if (this.packages.length === 0) return;
      this.selectedIndex =
        (this.selectedIndex - 1 + this.packages.length) % this.packages.length;
      this.invalidate();
      return;
    }

    if (data === " ") {
      if (this.packages.length === 0) return;
      const pkg = this.packages[this.selectedIndex];
      pkg.enabled = !pkg.enabled;
      this.invalidate();
      return;
    }

    if (data === "p") {
      this.persistState();
      this.invalidate();
      return;
    }

    if (data === "u") {
      this.autoUpdateEnabled = !this.autoUpdateEnabled;
      this.invalidate();
      return;
    }
  }

  private persistState(): void {
    for (const pkg of this.packages) {
      const currentIdx = (this.settings.packages ?? []).findIndex((entry) =>
        typeof entry === "string"
          ? entry === pkg.source
          : entry.source === pkg.source,
      );
      if (currentIdx === -1) continue;

      const entry = this.settings.packages![currentIdx];
      const isCurrentlyEnabled =
        typeof entry === "string" || !isAllResourcesEmpty(entry);

      if (pkg.enabled && !isCurrentlyEnabled) {
        this.settings.packages![currentIdx] = pkg.source;
      } else if (!pkg.enabled && isCurrentlyEnabled) {
        this.settings.packages![currentIdx] = {
          source: pkg.source,
          extensions: [],
          skills: [],
          prompts: [],
          themes: [],
        };
      }
      pkg._persistedEnabled = pkg.enabled;
    }
  }

  private rowForPkg(index: number, pkg: PackageInfo & { _persistedEnabled?: boolean }): string {
    const th = this.theme;
    const isSelected = index === this.selectedIndex;
    const hasPending = pkg._persistedEnabled !== undefined &&
      pkg._persistedEnabled !== pkg.enabled;

    const cursor = isSelected ? th.fg("accent", ">") : " ";
    const status = pkg.enabled
      ? th.fg("success", "● enabled")
      : th.fg("dim", "○ disabled");
    const pending = hasPending ? th.fg("warning", " (unsaved)") : "";
    const res = [];
    if (pkg.resources.extensions.length) res.push("ext");
    if (pkg.resources.skills.length) res.push("skills");
    if (pkg.resources.prompts.length) res.push("prompts");
    if (pkg.resources.themes.length) res.push("themes");
    const resStr = res.length ? ` ${th.fg("dim", `(${res.join(", ")})`)}` : "";

    const nameLine = `${cursor} ${status} ${th.bold(pkg.name)}${th.fg("dim", `@${pkg.version}`)}${resStr}${pending}`;
    return nameLine;
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const th = this.theme;
    const lines: string[] = [];

    // Header
    lines.push("");
    const title = th.fg("accent", " Pi Packages ");
    const headerLine =
      th.fg("borderMuted", "─".repeat(3)) +
      title +
      th.fg("borderMuted", "─".repeat(Math.max(0, width - title.length - 6)));
    lines.push(headerLine);
    lines.push("");

    if (this.packages.length === 0) {
      lines.push(`  ${th.fg("dim", "No packages installed. Use `pi install <pkg>` to add one.")}`);
    } else {
      for (let i = 0; i < this.packages.length; i++) {
        lines.push(`  ${this.rowForPkg(i, this.packages[i])}`);
      }
    }

    // Auto-update section
    lines.push("");
    lines.push(
      `  ${
        this.autoUpdateEnabled
          ? th.fg("success", "● auto-update on")
          : th.fg("dim", "○ auto-update off")
      }`,
    );

    // Footer
    lines.push("");
    const keys = [
      `${th.fg("accent", "↑↓/jk")} navigate`,
      `${th.fg("accent", "space")} toggle`,
      `${th.fg("accent", "p")} save`,
      `${th.fg("accent", "u")} auto-update`,
      `${th.fg("accent", "enter")} close`,
      `${th.fg("accent", "esc")} cancel`,
    ];
    lines.push(`  ${keys.join(`  ${th.fg("borderMuted", "│")}  `)}`);
    lines.push("");

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function piExtmgr(pi: ExtensionAPI) {
  const sessionDisabled = new Set<string>();

  // -----------------------------------------------------------------------
  // Command: /packages
  // -----------------------------------------------------------------------
  pi.registerCommand("packages", {
    description: "Manage installed Pi packages — enable, disable, and configure auto-update",
    handler: async (_args, ctx: ExtensionCommandContext) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/packages requires interactive mode", "error");
        return;
      }

      const settings = await readSettings();
      const autoUpdateConfig = await readAutoUpdateConfig();
      const entries = settings.packages ?? [];
      const packages: PackageInfo[] = [];

      for (const entry of entries) {
        const pkg = await resolvePackageEntry(entry, sessionDisabled);
        if (pkg) packages.push(pkg);
      }

      await ctx.ui.custom<void>(
        (_tui, theme, _keybindings, done) => {
          return new PackageListComponent(
            packages,
            settings,
            autoUpdateConfig.enabled,
            theme,
            (result) => {
              // Persist settings on close (they were saved inline by 'p')
              writeSettings(result.settings).catch(() => {});
              // Persist auto-update config
              autoUpdateConfig.enabled = result.autoUpdateEnabled;
              writeAutoUpdateConfig(autoUpdateConfig).catch(() => {});
              done();
            },
          );
        },
      );
    },
  });

  // -----------------------------------------------------------------------
  // session_start: auto-update
  // -----------------------------------------------------------------------
  pi.on("session_start", async (_event, ctx) => {
    try {
      const config = await readAutoUpdateConfig();
      if (!shouldCheckForUpdates(config)) {
        return;
      }

      // Always schedule next check
      config.nextCheck = Date.now() + config.intervalMs;
      await writeAutoUpdateConfig(config);

      const settings = await readSettings();
      const npmPackages = (settings.packages ?? []).filter((e) => {
        const s = typeof e === "string" ? e : e.source;
        return s.startsWith("npm:");
      });

      if (npmPackages.length === 0) return;

      const updates: Array<{
        name: string;
        current: string;
        latest: string;
      }> = [];

      for (const entry of npmPackages) {
        const source = typeof entry === "string" ? entry : entry.source;
        const name = source.slice(4);
        const pkgJson = await readPackageJson(name);
        const current = pkgJson?.version;
        if (!current) continue;

        const latest = await getLatestVersion(name);
        if (latest && isNewerVersion(current, latest)) {
          updates.push({ name, current, latest });
        }
      }

      if (updates.length === 0) return;

      const updateList = updates
        .map((u) => `${u.name} ${u.current} → ${u.latest}`)
        .join(", ");

      if (ctx.hasUI) {
        ctx.ui.notify(
          `Auto-updating ${updates.length} package(s): ${updateList}`,
          "info",
        );

        // Run pi update
        try {
          await execFileAsync("pi", ["update", "--extensions"], {
            timeout: 120000,
            env: { ...process.env },
            cwd: ctx.cwd,
          });
          ctx.ui.notify("Packages updated. Restarting Pi…", "info");
          ctx.shutdown();
        } catch {
          // Update may have partially succeeded
          ctx.ui.notify("Package update failed. Run `pi update --extensions` manually.", "error");
        }
      }
    } catch {
      // Silently skip errors
    }
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isFilterEnabled(entry: PackageFilter): boolean {
  return !isAllResourcesEmpty(entry);
}

function isAllResourcesEmpty(entry: PackageFilter): boolean {
  return (
    entry.extensions?.length === 0 &&
    entry.skills?.length === 0 &&
    entry.prompts?.length === 0 &&
    entry.themes?.length === 0
  );
}