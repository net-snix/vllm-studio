// CRITICAL
//
// Single source of truth for the user-data directory.
//
// Resolution order:
//   1. process.env.VLLM_STUDIO_DATA_DIR (set by the desktop main process to
//      Electron's userData path).
//   2. ~/.vllm-studio (dev/CLI default).

import { mkdirSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const SETTINGS_FILENAME = "api-settings.json";

let cachedDataDir: string | null = null;

export function resolveDataDir(): string {
  if (cachedDataDir) return cachedDataDir;

  const envDir = process.env.VLLM_STUDIO_DATA_DIR?.trim();
  const dir = envDir && envDir.length > 0 ? envDir : path.join(homedir(), ".vllm-studio");

  mkdirSync(dir, { recursive: true });
  try {
    chmodSync(dir, 0o700);
  } catch {
    // best-effort
  }

  cachedDataDir = dir;
  return dir;
}

export function resolveSettingsFilePath(): string {
  return path.join(resolveDataDir(), SETTINGS_FILENAME);
}

// Test helper. Not exported from index; only consumed by vitest setups.
export function __resetDataDirCacheForTests(): void {
  cachedDataDir = null;
}
