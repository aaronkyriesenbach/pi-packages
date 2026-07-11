import { homedir } from "node:os";
import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

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

// ---------------------------------------------------------------------------
// Shared package-listing helper (factored from duplicated patterns)
// ---------------------------------------------------------------------------

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
// Extension entry point
// ---------------------------------------------------------------------------

export default function piExtmgr(pi: ExtensionAPI) {
  const sessionDisabled = new Set<string>();

  // -----------------------------------------------------------------------
  // Tool: pkg_list
  // -----------------------------------------------------------------------
  pi.registerTool({
    name: "pkg_list",
    label: "List Packages",
    description:
      "List all installed Pi packages with their version, enabled/disabled state, and resource types (extensions, skills, prompts, themes).",
    promptSnippet: "List installed Pi packages and their state",
    promptGuidelines: [
      "Use pkg_list to show installed Pi packages when the user asks about their extensions or packages.",
    ],
    parameters: Type.Object({
      filter: Type.Optional(
        Type.String({
          description: "Optional filter: 'enabled', 'disabled', or 'all'",
        }),
      ),
    }),

    async execute(_toolCallId, params) {
      const settings = await readSettings();
      const entries = settings.packages ?? [];
      const result: PackageInfo[] = [];

      for (const entry of entries) {
        const pkg = await resolvePackageEntry(entry, sessionDisabled);
        if (pkg) result.push(pkg);
      }

      let filtered = result;
      if (params.filter === "enabled")
        filtered = result.filter((p) => p.enabled);
      if (params.filter === "disabled")
        filtered = result.filter((p) => !p.enabled);

      const text = filtered
        .map((p) => {
          const status = p.enabled ? "✓ enabled" : "✗ disabled";
          const resTypes: string[] = [];
          if (p.resources.extensions.length) resTypes.push("ext");
          if (p.resources.skills.length) resTypes.push("skills");
          if (p.resources.prompts.length) resTypes.push("prompts");
          if (p.resources.themes.length) resTypes.push("themes");
          const res = resTypes.length ? ` (${resTypes.join(", ")})` : "";
          return `${status} | ${p.name}@${p.version}${res}`;
        })
        .join("\n");

      return {
        content: [
          { type: "text", text: text || "No packages installed." },
        ],
        details: { packages: filtered },
      };
    },
  });

  // -----------------------------------------------------------------------
  // Tool: pkg_toggle
  // -----------------------------------------------------------------------
  pi.registerTool({
    name: "pkg_toggle",
    label: "Toggle Package",
    description:
      "Enable or disable an installed Pi package. Can persist across sessions (modifies settings.json) or apply only to the current session.",
    promptSnippet: "Enable or disable an installed Pi package",
    promptGuidelines: [
      "Use pkg_toggle to enable or disable Pi packages when the user asks to manage their packages.",
      "Set persist: true to make the change permanent across sessions. Set persist: false for a temporary per-session toggle.",
    ],
    parameters: Type.Object({
      package: Type.String({
        description:
          "Package source specifier, e.g. 'npm:pi-lens' or the package name 'pi-lens'",
      }),
      enabled: Type.Boolean({
        description: "True to enable, false to disable",
      }),
      persist: Type.Optional(
        Type.Boolean({
          description:
            "True to persist in settings.json (survives restarts). False for per-session only. Default: true.",
        }),
      ),
    }),

    async execute(_toolCallId, params) {
      const persist = params.persist !== false;
      const source = params.package.startsWith("npm:")
        ? params.package
        : `npm:${params.package}`;

      if (persist) {
        const settings = await readSettings();
        const currentIdx = (settings.packages ?? []).findIndex((entry) =>
          typeof entry === "string"
            ? entry === source
            : entry.source === source,
        );

        if (currentIdx === -1) {
          return {
            content: [
              {
                type: "text",
                text: `Package "${params.package}" not found in settings.`,
              },
            ],
            details: {},
          };
        }

        const entry = settings.packages![currentIdx];
        const isCurrentlyEnabled =
          typeof entry === "string" || !isAllResourcesEmpty(entry);

        if (params.enabled && !isCurrentlyEnabled) {
          settings.packages![currentIdx] = source;
          sessionDisabled.delete(source);
        } else if (!params.enabled && isCurrentlyEnabled) {
          settings.packages![currentIdx] = {
            source,
            extensions: [],
            skills: [],
            prompts: [],
            themes: [],
          };
        }

        await writeSettings(settings);

        return {
          content: [
            {
              type: "text",
              text: `${params.package} is now ${params.enabled ? "enabled" : "disabled"} (persistent).`,
            },
          ],
          details: {},
        };
      }

      // Per-session only
      if (params.enabled) {
        sessionDisabled.delete(source);
      } else {
        sessionDisabled.add(source);
      }

      return {
        content: [
          {
            type: "text",
            text: `${params.package} is now ${params.enabled ? "enabled" : "disabled"} (this session only).`,
          },
        ],
        details: {},
      };
    },
  });

  // -----------------------------------------------------------------------
  // Tool: pkg_check_updates
  // -----------------------------------------------------------------------
  pi.registerTool({
    name: "pkg_check_updates",
    label: "Check Updates",
    description:
      "Check if newer versions of installed Pi packages are available from npm.",
    promptSnippet: "Check for updates to installed Pi packages",
    promptGuidelines: [
      "Use pkg_check_updates to check if any installed Pi packages have updates available.",
    ],
    parameters: Type.Object({
      package: Type.Optional(
        Type.String({
          description:
            "Check a specific package. If omitted, checks all installed packages.",
        }),
      ),
    }),

    async execute(_toolCallId, params) {
      const settings = await readSettings();
      const entries = settings.packages ?? [];

      const toCheck = params.package
        ? entries.filter((e) => {
            const s = typeof e === "string" ? e : e.source;
            return s === params.package || s === `npm:${params.package}`;
          })
        : entries;

      const updates: Array<{
        name: string;
        current: string;
        latest: string;
      }> = [];
      const upToDate: string[] = [];
      const errors: string[] = [];

      for (const entry of toCheck) {
        const source = typeof entry === "string" ? entry : entry.source;
        if (!source.startsWith("npm:")) continue;
        const name = source.slice(4);

        const pkgJson = await readPackageJson(name);
        const current = pkgJson?.version;
        if (!current) {
          errors.push(`${name}: could not determine current version`);
          continue;
        }

        const latest = await getLatestVersion(name);
        if (!latest) {
          errors.push(`${name}: could not check npm registry`);
          continue;
        }

        if (isNewerVersion(current, latest)) {
          updates.push({ name, current, latest });
        } else {
          upToDate.push(`${name}@${current}`);
        }
      }

      const lines: string[] = [];
      if (updates.length) {
        lines.push("Updates available:");
        for (const u of updates) {
          lines.push(`  ${u.name}: ${u.current} → ${u.latest}`);
        }
        lines.push("");
      }
      if (upToDate.length) {
        lines.push(`Up to date: ${upToDate.join(", ")}`);
        lines.push("");
      }
      if (errors.length) {
        lines.push(`Errors: ${errors.join("; ")}`);
      }
      if (!updates.length && !upToDate.length && !errors.length) {
        lines.push("No packages found.");
      }

      return {
        content: [{ type: "text", text: lines.join("\n").trim() }],
        details: { updates, upToDate, errors },
      };
    },
  });

  // -----------------------------------------------------------------------
  // session_start: auto-update check
  // -----------------------------------------------------------------------
  pi.on("session_start", async (_event, ctx) => {
    try {
      const config = await readAutoUpdateConfig();
      if (!shouldCheckForUpdates(config)) return;

      const settings = await readSettings();
      const npmPackages = (settings.packages ?? []).filter((e) => {
        const s = typeof e === "string" ? e : e.source;
        return s.startsWith("npm:");
      });

      if (npmPackages.length === 0) {
        config.nextCheck = Date.now() + config.intervalMs;
        await writeAutoUpdateConfig(config);
        return;
      }

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

      config.nextCheck = Date.now() + config.intervalMs;
      await writeAutoUpdateConfig(config);

      if (updates.length === 0) return;

      const updateLines = updates
        .map((u) => `  ${u.name}: ${u.current} → ${u.latest}`)
        .join("\n");

      if (ctx.hasUI) {
        await ctx.ui.notify(
          `${updates.length} package update(s) available. Run \`pi update --extensions\` to apply.\n${updateLines}`,
          "info",
        );
      }
    } catch {
      // Silently skip auto-update errors
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