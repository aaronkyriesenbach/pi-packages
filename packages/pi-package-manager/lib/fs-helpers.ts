import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AutoUpdateConfig, PackageJson, Settings } from './types';

const execFileAsync = promisify(execFile);

export { execFileAsync };

function settingsPath(): string {
  return join(homedir(), '.pi', 'agent', 'settings.json');
}

function npmDir(): string {
  return join(homedir(), '.pi', 'agent', 'npm', 'node_modules');
}

function settingsBackupPath(): string {
  return join(homedir(), '.pi', 'agent', 'settings-backup.json');
}

function autoUpdatePath(): string {
  return join(homedir(), '.pi', 'agent', 'auto-update.json');
}

export async function backupOriginalSettings(settings: Settings): Promise<void> {
  await writeFile(settingsBackupPath(), JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}

export async function restoreOriginalSettings(): Promise<void> {
  try {
    const raw = await readFile(settingsBackupPath(), 'utf-8');
    await writeSettings(JSON.parse(raw) as Settings);
    await rm(settingsBackupPath());
  } catch {
    // No backup or already restored
  }
}

export async function readSettings(): Promise<Settings> {
  try {
    const raw = await readFile(settingsPath(), 'utf-8');
    return JSON.parse(raw) as Settings;
  } catch {
    return {};
  }
}

export async function writeSettings(settings: Settings): Promise<void> {
  await writeFile(settingsPath(), JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}

export async function readPackageJson(pkgName: string): Promise<PackageJson | null> {
  const pkgPath = join(npmDir(), pkgName, 'package.json');
  try {
    const raw = await readFile(pkgPath, 'utf-8');
    return JSON.parse(raw) as PackageJson;
  } catch {
    return null;
  }
}

export async function readAutoUpdateConfig(): Promise<AutoUpdateConfig> {
  const defaults: AutoUpdateConfig = {
    intervalMs: 3600000,
    enabled: true,
    displayText: '1 hour',
    nextCheck: 0,
  };
  try {
    const raw = await readFile(join(autoUpdatePath()), 'utf-8');
    return { ...defaults, ...(JSON.parse(raw) as Partial<AutoUpdateConfig>) };
  } catch {
    return defaults;
  }
}

export async function writeAutoUpdateConfig(config: AutoUpdateConfig): Promise<void> {
  await writeFile(autoUpdatePath(), JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export async function getLatestVersion(pkgName: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('npm', ['view', pkgName, 'version'], {
      timeout: 15000,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}
