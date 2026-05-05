import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

export function getAgentDataDir(): string {
  const candidates = [
    process.env.VLLM_STUDIO_DATA_DIR,
    path.join(process.cwd(), "data"),
    path.join(process.cwd(), "..", "data"),
    path.join(process.cwd(), "frontend", "data"),
    path.join(homedir(), ".vllm-studio"),
    path.join(tmpdir(), "vllm-studio"),
  ].filter((dir): dir is string => Boolean(dir));

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0] ?? path.join(tmpdir(), "vllm-studio");
}

export function getPiAgentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || path.join(getAgentDataDir(), "pi-agent");
}

export function getPiSessionsRoot(): string {
  return path.join(getPiAgentDir(), "sessions");
}
