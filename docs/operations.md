---
summary: Runtime, access, service, and verification notes for Linux-hosted vLLM Studio installs.
read_when:
  - Deploying or restarting vLLM Studio on a Linux GPU host.
  - Debugging browser access to a remote-hosted web UI.
  - Changing model launch, recipe, GPU, or service behavior.
---

# Operations

## Architecture

Run vLLM Studio directly on the Linux GPU host:

```text
Browser
  |
  | private network URL or SSH tunnel
  v
Linux GPU host
  <repo-path>
    controller  127.0.0.1:8080  recipes, launches, GPU telemetry, API
    frontend    127.0.0.1:3000  Next.js web UI
    vLLM/SGLang 0.0.0.0:8000   managed inference backend when a recipe runs
```

The controller should run where the models, GPUs, `/proc`, `nvidia-smi`, and
launch processes are. Client machines should only need browser access.

## Paths

Keep machine-specific paths out of the repository. Configure them in private
operator notes or environment files.

Common local values:

- Repo path: `<repo-path>`
- Data path: `<repo-path>/data`
- SQLite DB: `<repo-path>/data/controller.db`
- Model logs: `<repo-path>/data/logs`
- Model root: `<model-root>`

## Services

Production-style installs should run the controller and frontend under the host
service manager, for example systemd.

Example service names:

- `vllm-studio-controller.service`
- `vllm-studio-frontend.service`

Useful checks:

```bash
systemctl status vllm-studio-controller --no-pager
systemctl status vllm-studio-frontend --no-pager
journalctl -u vllm-studio-controller -n 100 --no-pager
journalctl -u vllm-studio-frontend -n 100 --no-pager
```

## Access

Preferred access is a private-network URL that proxies or routes to the
frontend. If that is unavailable, use an SSH tunnel:

```bash
ssh -N -L 3300:127.0.0.1:3000 <linux-host>
```

Then open:

```text
http://127.0.0.1:3300
```

Binding the app to `127.0.0.1` on the Linux host and exposing it through a
private network proxy keeps the service off public interfaces.

## Health Checks

From the Linux host:

```bash
curl -sS http://127.0.0.1:8080/health
curl -sS http://127.0.0.1:8080/status
curl -sS http://127.0.0.1:8080/gpus
curl -I http://127.0.0.1:3000
```

When a model is running:

```bash
curl -sS http://127.0.0.1:8000/v1/models
```

## Model Launch Notes

Recipe GPU selection uses `CUDA_VISIBLE_DEVICES`. The controller sets
`CUDA_DEVICE_ORDER=PCI_BUS_ID` so device numbers match `nvidia-smi` ordering on
mixed-GPU hosts.

If a large recipe unexpectedly OOMs, check:

```bash
nvidia-smi
tail -n 120 <repo-path>/data/logs/<recipe-log>.log
```

## Dashboard Disk Config

The Linux Dashboard collects root disk telemetry by default. Add local mount
points with:

```bash
VLLM_STUDIO_DASHBOARD_DISKS="root:/,models:/models,training:/training"
```

Use labels such as `models` and `training` to enable the dashboard's higher
capacity thresholds without committing local paths to Git.
