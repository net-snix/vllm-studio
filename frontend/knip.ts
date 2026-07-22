const config = {
  entry: [
    "src/app/**/{page,layout,route,error,global-error,loading,not-found,template,default}.{ts,tsx}",
    "desktop/main.ts",
    "desktop/preload.ts",
    "desktop/app-identity.ts",
    "desktop/resources/pi-extensions/*.ts",
    // Unit tests run via `bun test scripts` — the npm script no longer names a
    // file glob knip can pick entries from, so list them explicitly.
    "scripts/*.test.ts",
    "src/**/*.test.ts",
  ],
  project: ["src/**/*.{ts,tsx}", "desktop/**/*.{ts,tsx}", "scripts/*.{ts,tsx}"],
  ignore: [".next/**", "node_modules/**"],
  ignoreIssues: {
    "desktop/interfaces.ts": ["types"],
  },
  ignoreDependencies: [
    "tailwindcss",
    "postcss",
    "@local-studio/contracts",
    "@local-studio/agent-runtime",
    "@hono/node-server",
    "@modelcontextprotocol/sdk",
    "chromium-bidi",
    "playwright-core",
    "proper-lockfile",
    "semver",
    "@types/proper-lockfile",
    "@types/semver",
  ],
  ignoreExportsUsedInFile: true,
};

export default config;
