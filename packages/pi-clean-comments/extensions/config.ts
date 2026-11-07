import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CONFIG_DIR_NAME, getAgentDir } from '@earendil-works/pi-coding-agent';

// Config resolution: project file > user file > defaults, merged per key.

export type Enforcement = 'nudge' | 'gate';

export interface CleanCommentsConfig {
  enforcement: Enforcement;
  threshold: number;
  allowAgentBypassRequest: boolean;
}

type PartialCleanCommentsConfig = Partial<CleanCommentsConfig>;

export const CONFIG_FILENAME = 'pi-clean-comments.json';

export const DEFAULT_CONFIG: CleanCommentsConfig = {
  enforcement: 'nudge',
  threshold: 2,
  allowAgentBypassRequest: false,
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

function isValidThreshold(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
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
  };
}
