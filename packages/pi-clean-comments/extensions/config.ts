import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CONFIG_DIR_NAME, getAgentDir } from '@earendil-works/pi-coding-agent';

// Config resolution: project file > user file > defaults, merged per key.

export type Enforcement = 'nudge' | 'gate';

type BashFileWrites = 'block' | 'off';

export interface CleanCommentsConfig {
  enforcement: Enforcement;
  threshold: number;
  allowAgentBypassRequest: boolean;
  bashFileWrites: BashFileWrites;
  bypassRequestTimeoutSeconds: number;
}

type PartialCleanCommentsConfig = Partial<CleanCommentsConfig>;

export const CONFIG_FILENAME = 'pi-clean-comments.json';

export const DEFAULT_CONFIG: CleanCommentsConfig = {
  enforcement: 'nudge',
  threshold: 2,
  allowAgentBypassRequest: false,
  bashFileWrites: 'block',
  bypassRequestTimeoutSeconds: 300,
};

export function getProjectConfigPath(cwd: string): string {
  return join(cwd, CONFIG_DIR_NAME, CONFIG_FILENAME);
}

export function getUserConfigPath(): string {
  return join(getAgentDir(), 'extensions', CONFIG_FILENAME);
}

function isEnforcement(value: unknown): value is Enforcement {
  return value === 'nudge' || value === 'gate';
}

function isBashFileWrites(value: unknown): value is BashFileWrites {
  return value === 'block' || value === 'off';
}

function isValidThreshold(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isValidTimeoutSeconds(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

// Drops malformed/wrong-type keys individually instead of rejecting the whole file.
async function readConfigFile(path: string): Promise<PartialCleanCommentsConfig> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }

  if (typeof parsed !== 'object' || parsed === null) return {};
  const record = parsed as Record<string, unknown>;

  const result: PartialCleanCommentsConfig = {};
  if (isEnforcement(record.enforcement)) result.enforcement = record.enforcement;
  if (isValidThreshold(record.threshold)) result.threshold = record.threshold;
  if (isBoolean(record.allowAgentBypassRequest)) {
    result.allowAgentBypassRequest = record.allowAgentBypassRequest;
  }
  if (isBashFileWrites(record.bashFileWrites)) result.bashFileWrites = record.bashFileWrites;
  if (isValidTimeoutSeconds(record.bypassRequestTimeoutSeconds)) {
    result.bypassRequestTimeoutSeconds = record.bypassRequestTimeoutSeconds;
  }
  return result;
}

export async function resolveCleanCommentsConfig(cwd: string): Promise<CleanCommentsConfig> {
  const [projectConfig, userConfig] = await Promise.all([
    readConfigFile(getProjectConfigPath(cwd)),
    readConfigFile(getUserConfigPath()),
  ]);

  return {
    enforcement: projectConfig.enforcement ?? userConfig.enforcement ?? DEFAULT_CONFIG.enforcement,
    threshold: projectConfig.threshold ?? userConfig.threshold ?? DEFAULT_CONFIG.threshold,
    allowAgentBypassRequest:
      projectConfig.allowAgentBypassRequest ??
      userConfig.allowAgentBypassRequest ??
      DEFAULT_CONFIG.allowAgentBypassRequest,
    bashFileWrites:
      projectConfig.bashFileWrites ?? userConfig.bashFileWrites ?? DEFAULT_CONFIG.bashFileWrites,
    bypassRequestTimeoutSeconds:
      projectConfig.bypassRequestTimeoutSeconds ??
      userConfig.bypassRequestTimeoutSeconds ??
      DEFAULT_CONFIG.bypassRequestTimeoutSeconds,
  };
}
