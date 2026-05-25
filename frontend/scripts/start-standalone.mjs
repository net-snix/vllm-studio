import { cpSync, existsSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
  stdio: "inherit",
  env: {
    ...process.env,
    VLLM_STUDIO_AGENT_CWD: process.env.VLLM_STUDIO_AGENT_CWD || resolve(projectRoot, ".."),
  },
});

server.on("exit", (code) => process.exit(code ?? 0));
