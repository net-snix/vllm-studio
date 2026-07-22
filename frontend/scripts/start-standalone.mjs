import { cpSync, existsSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHUTDOWN_GRACE_MS = 1_000;
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const standaloneRoot = resolve(projectRoot, ".next", "standalone");
const nestedRoot = resolve(standaloneRoot, "frontend");
const nestedServer = resolve(nestedRoot, "server.js");
const rootServer = resolve(standaloneRoot, "server.js");
const serverRoot = existsSync(nestedServer)
  ? nestedRoot
  : existsSync(rootServer)
    ? standaloneRoot
    : null;
const runtimeUrl = (
  process.env.LOCAL_STUDIO_AGENT_RUNTIME_URL || "http://127.0.0.1:8081"
).replace(/\/+$/, "");

function copyDirectory(from, to) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

async function runtimeHealthy() {
  try {
    const response = await fetch(`${runtimeUrl}/health`, { signal: AbortSignal.timeout(1_000) });
    if (!response.ok) return false;
    const payload = await response.json();
    return payload.service === "local-studio-agent-runtime";
  } catch {
    return false;
  }
}

async function waitForRuntime(child) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Agent runtime exited with code ${child.exitCode}`);
    if (await runtimeHealthy()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for agent runtime: ${runtimeUrl}`);
}

async function startRuntime() {
  if (await runtimeHealthy()) return null;
  const url = new URL(runtimeUrl);
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error(`Agent runtime is unavailable: ${runtimeUrl}`);
  }
  const entry = resolve(projectRoot, "..", "services", "agent-runtime", "dist", "standalone.mjs");
  if (!existsSync(entry)) throw new Error(`Missing agent runtime bundle: ${entry}`);
  const child = spawn(process.execPath, [entry], {
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: url.port || "8081",
      LOCAL_STUDIO_FRONTEND_BASE: `http://127.0.0.1:${process.env.PORT || "3000"}`,
    },
  });
  try {
    await waitForRuntime(child);
    return child;
  } catch (error) {
    if (child.exitCode === null) child.kill("SIGTERM");
    throw error;
  }
}

if (!existsSync(standaloneRoot)) {
  throw new Error('Missing ".next/standalone". Run "npm run build" first.');
}
if (!serverRoot) {
  throw new Error(
    `Missing standalone server.js in ${standaloneRoot} or ${nestedRoot}. Run "npm run build" first.`,
  );
}

console.log(`Starting server from: ${serverRoot}`);

copyDirectory(resolve(projectRoot, "public"), resolve(serverRoot, "public"));
copyDirectory(resolve(projectRoot, ".next", "static"), resolve(serverRoot, ".next", "static"));

const agentRuntime = await startRuntime();
const server = spawn(process.execPath, ["server.js"], {
  cwd: serverRoot,
  detached: true,
  stdio: "inherit",
  env: {
    ...process.env,
    LOCAL_STUDIO_AGENT_CWD: process.env.LOCAL_STUDIO_AGENT_CWD || resolve(projectRoot, ".."),
    LOCAL_STUDIO_AGENT_RUNTIME_URL: runtimeUrl,
  },
});

let isShuttingDown = false;
let runtimeExitCode = 0;
let requestedExitCode = null;
let forceStop = null;

function childStopped(child) {
  return !child || child.exitCode !== null || child.signalCode !== null;
}

const signalServer = (signal) => {
  if (!server.pid || childStopped(server)) {
    return false;
  }

  try {
    process.kill(-server.pid, signal);
    return true;
  } catch (error) {
    if (error && error.code === "ESRCH") {
      return false;
    }

    throw error;
  }
};

function signalOwnedRuntime(signal) {
  if (!agentRuntime || childStopped(agentRuntime)) return false;
  return agentRuntime.kill(signal);
}

function finishIfStopped() {
  if (requestedExitCode === null || !childStopped(server) || !childStopped(agentRuntime)) return;
  if (forceStop) clearTimeout(forceStop);
  process.exit(requestedExitCode);
}

const stopChildren = (reason, exitCode = 0) => {
  if (requestedExitCode === null) {
    requestedExitCode = exitCode;
  } else if (exitCode !== 0) {
    requestedExitCode = exitCode;
  }

  if (!isShuttingDown) {
    isShuttingDown = true;
    console.log(`Received ${reason}; stopping standalone services.`);
    signalOwnedRuntime("SIGTERM");
    signalServer("SIGTERM");

    forceStop = setTimeout(() => {
      console.warn(
        `Standalone services did not stop within ${SHUTDOWN_GRACE_MS}ms; forcing exit.`,
      );
      signalOwnedRuntime("SIGKILL");
      signalServer("SIGKILL");
      process.exit(requestedExitCode ?? 1);
    }, SHUTDOWN_GRACE_MS);
    forceStop.unref();
  }

  finishIfStopped();
};

process.once("SIGINT", () => stopChildren("SIGINT"));
process.once("SIGTERM", () => stopChildren("SIGTERM"));

server.on("exit", (code, signal) => {
  if (!isShuttingDown) stopChildren("standalone server exit", code ?? (signal ? 1 : 0));
  finishIfStopped();
});
agentRuntime?.on("exit", (code, signal) => {
  runtimeExitCode = code ?? (signal ? 1 : 0);
  if (!isShuttingDown) stopChildren("agent runtime exit", runtimeExitCode || 1);
  finishIfStopped();
});
