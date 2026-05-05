<p align="center">
  <img src="frontend/public/icons/icon-512.png" alt="vLLM Studio icon" width="96" height="96">
</p>

<h1 align="center">vLLM Studio</h1>

<p align="center">
  A local-first control room for serving, testing, and operating open models on your own GPU workstation.
</p>

<p align="center">
  <a href="https://github.com/net-snix/vllm-studio/releases"><img alt="Release" src="https://img.shields.io/github/v/release/net-snix/vllm-studio?style=for-the-badge&color=3b82f6"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/net-snix/vllm-studio?style=for-the-badge&color=22c55e"></a>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-111111?style=for-the-badge&logo=nextdotjs">
  <img alt="Bun" src="https://img.shields.io/badge/Bun-controller-f9f1e1?style=for-the-badge&logo=bun&logoColor=111111">
  <img alt="GPU first" src="https://img.shields.io/badge/GPU-first-76b900?style=for-the-badge&logo=nvidia&logoColor=white">
</p>

<p align="center">
  <img src="docs/images/dashboard.png" alt="vLLM Studio dashboard" width="100%">
</p>

## What it does

vLLM Studio brings model recipes, runtime launches, agent sessions, usage stats,
and Linux host telemetry into one browser UI. It is designed for setups where
the controller and frontend run on the same GPU machine, while the browser can
connect from anywhere on a trusted private network.

- Launch and stop recipes for vLLM, SGLang, llama.cpp, and other local backends.
- Track GPU, CPU, memory, disk, service, container, fan, and thermal telemetry.
- Run browser-based agent sessions with project-scoped history and Pi session replay.
- Inspect usage by provider traffic or coding-agent JSONL sessions.
- Keep the model server private while exposing only the frontend you choose.

## Screenshots

### Model Recipes

<img src="docs/images/models.png" alt="vLLM Studio model recipes" width="100%">

### Usage Analytics

<img src="docs/images/usage.png" alt="vLLM Studio usage analytics" width="100%">

## Architecture

```text
Browser / desktop app
        |
        v
Next.js frontend  ->  Bun controller  ->  model backends
        |                    |              vLLM / SGLang / llama.cpp
        |                    |
        +--------------------+-> Linux host telemetry
```

The recommended deployment is intentionally simple:

- `controller/`: Bun backend for recipes, launches, proxying, metrics, usage, and telemetry.
- `frontend/`: Next.js UI for dashboard, models, agent sessions, settings, and usage.
- `cli/`: command-line access to controller workflows.
- `docs/`: operator notes for Linux dashboard and runtime behavior.
- `scripts/`: release, deployment, and validation helpers.

## Quick Start

Install dependencies and run the two services:

```bash
cd controller
bun install
bun src/main.ts
```

```bash
cd frontend
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

For production-style local serving, build the frontend and run the standalone
server:

```bash
cd frontend
npm run build
npm run start
```

## Health Checks

```bash
curl -sS http://localhost:8080/health
curl -I http://localhost:3000
```

## Useful Commands

```bash
# frontend
cd frontend
npm run lint
npm test
npm run build

# controller
cd controller
bun run typecheck
bun test
```

## Configuration

Core runtime configuration is environment-driven. Common values:

- `VLLM_STUDIO_HOST`: controller bind host.
- `VLLM_STUDIO_PORT`: controller port.
- `VLLM_STUDIO_API_KEY`: optional API key for private deployments.
- `VLLM_STUDIO_MODELS_DIR`: model storage root.
- `VLLM_STUDIO_DASHBOARD_DISKS`: comma-separated disk labels for dashboard cards.

See [Linux Dashboard](docs/linux-dashboard.md) for the telemetry endpoint and
operator view.

## Release Flow

Releases are tag and GitHub-release based. The semantic-release config creates
GitHub releases from conventional commits on `main`; manual releases should
target the exact commit being shipped and keep public notes free of local host
names, private paths, and private network details.
