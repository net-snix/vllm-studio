import { cpSync, existsSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHUTDOWN_GRACE_MS = 1_000;

const thisFile = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(thisFile), "..");
const standaloneRoot = resolve(projectRoot, ".next", "standalone");

if (!existsSync(standaloneRoot)) {
  console.error('Missing ".next/standalone". Run "npm run build" first.');
  process.exit(1);
}

const copyDirectory = (from, to) => {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
};

const frontendStandalone = resolve(standaloneRoot, "frontend");
const rootServer = resolve(standaloneRoot, "server.js");
const frontendServer = resolve(frontendStandalone, "server.js");
let serverRoot = standaloneRoot;

if (existsSync(frontendServer)) {
  console.log("Detected nested frontend standalone server.");
  serverRoot = frontendStandalone;
} else if (!existsSync(rootServer)) {
  console.error(
    `Missing standalone server.js in ${standaloneRoot} or ${frontendStandalone}. Run "npm run build" first.`,
  );
  process.exit(1);
}

console.log(`Starting server from: ${serverRoot}`);

copyDirectory(resolve(projectRoot, "public"), resolve(serverRoot, "public"));
copyDirectory(resolve(projectRoot, ".next", "static"), resolve(serverRoot, ".next", "static"));

const server = spawn("node", ["server.js"], {
  cwd: serverRoot,
  detached: true,
  stdio: "inherit",
  env: {
    ...process.env,
    LOCAL_STUDIO_AGENT_CWD: process.env.LOCAL_STUDIO_AGENT_CWD || resolve(projectRoot, ".."),
  },
});

let isShuttingDown = false;

const signalServer = (signal) => {
  if (!server.pid) {
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

const stopServer = (signal) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`Received ${signal}; stopping standalone server.`);

  const forceStop = setTimeout(() => {
    console.warn(`Standalone server did not stop within ${SHUTDOWN_GRACE_MS}ms; forcing exit.`);
    signalServer("SIGKILL");
    process.exit(0);
  }, SHUTDOWN_GRACE_MS);
  forceStop.unref();

  if (server.exitCode !== null || server.killed) {
    process.exit(0);
  }

  if (!signalServer("SIGTERM")) {
    process.exit(0);
  }
};

process.once("SIGINT", () => stopServer("SIGINT"));
process.once("SIGTERM", () => stopServer("SIGTERM"));

server.on("exit", (code, signal) => {
  if (signal && isShuttingDown) {
    process.exit(0);
  }

  process.exit(code ?? 0);
});
