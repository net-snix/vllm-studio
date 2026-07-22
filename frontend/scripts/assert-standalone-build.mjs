#!/usr/bin/env node
// Preflight guard for `desktop:dist` / `desktop:pack`.
//
// electron-builder copies the embedded Next server from `.next/standalone`
// (extraResources in desktop/electron-builder.yml). If `npm run build` did not
// produce a standalone server, electron-builder has been observed to log
// "file source doesn't exist from=.../.next/standalone" yet still exit 0 and
// ship a signed bundle that crashes at launch with "Missing standalone server
// build". Assert the source exists before electron-builder runs so the build
// fails here, loudly and early, instead of producing a broken artifact.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const standaloneBase = resolve(projectRoot, ".next", "standalone");
const candidates = [
  resolve(standaloneBase, "frontend", "server.js"),
  resolve(standaloneBase, "server.js"),
];
const runtimeRoots = [resolve(standaloneBase, "frontend"), standaloneBase];
const requiredRuntimeFiles = [
  "node_modules/@earendil-works/pi-coding-agent/node_modules/typebox/build/value/shared/union_priority_sort.mjs",
];
const dashboardManifestCandidates = runtimeRoots.map((root) =>
  resolve(root, ".next", "server", "app-paths-manifest.json"),
);

function filesUnder(directory) {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => resolve(entry.parentPath, entry.name));
}

function isRuntimeFile(file) {
  const path = relative(standaloneBase, file).replaceAll("\\", "/");
  return [
    "server.js",
    "package.json",
    ".next/",
    "public/",
    "node_modules/",
    "frontend/server.js",
    "frontend/package.json",
    "frontend/.next/",
    "frontend/public/",
    "frontend/node_modules/",
  ].some((prefix) => path === prefix || path.startsWith(prefix));
}

if (!candidates.some((candidate) => existsSync(candidate))) {
  throw new Error(`Missing standalone server: ${candidates.join(", ")}`);
}

for (const file of requiredRuntimeFiles) {
  if (!runtimeRoots.some((root) => existsSync(resolve(root, file)))) {
    throw new Error(`Missing standalone runtime dependency: ${file}`);
  }
}

const dashboardManifest = dashboardManifestCandidates.find((candidate) => existsSync(candidate));
if (!dashboardManifest) {
  throw new Error(
    `Missing standalone app paths manifest: ${dashboardManifestCandidates.join(", ")}`,
  );
}
const appPaths = JSON.parse(readFileSync(dashboardManifest, "utf8"));
if (typeof appPaths["/dashboard/page"] !== "string") {
  throw new Error("Standalone build is missing the Dashboard route");
}

const unexpected = filesUnder(standaloneBase).filter((file) => !isRuntimeFile(file));

if (unexpected.length > 0) {
  throw new Error(
    `Standalone build contains non-runtime files:\n${unexpected
      .map((file) => relative(standaloneBase, file))
      .join("\n")}`,
  );
}

console.log("  standalone server build is minimal");
