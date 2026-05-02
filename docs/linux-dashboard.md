---
summary: Linux Dashboard operator view for host, GPU, disk, service, container, and sensor snapshots.
read_when:
  - Editing the Dashboard tab.
  - Changing controller host telemetry routes.
  - Debugging missing Linux/GPU/fan/disk stats in the frontend.
---

# Linux Dashboard

The `Dashboard` tab reads `GET /linux-dashboard` through the normal frontend
proxy. The controller returns a read-only snapshot of the machine where the
controller is running.

In the remote-host deployment flow, the frontend and controller run on the same
Linux host. The Dashboard page therefore shows telemetry for the GPU server
without SSHing elsewhere or requiring a browser-side direct connection to the
controller.

Collected data:

- CPU load and sampled utilization from `/proc/stat` when available.
- Memory and swap from `/proc/meminfo`.
- NVIDIA GPU telemetry from `nvidia-smi`, with fallback to the existing GPU helper.
- Disk usage for configured mount points, including backing device identity from
  `findmnt`/`lsblk`. Set `VLLM_STUDIO_DASHBOARD_DISKS` to a comma-separated
  list of `label:/path` entries, for example `root:/,models:/models`.
- Fan and thermal readings exposed under `/sys/class/hwmon`.
- Local service port checks for model API, frontend, Grafana, Prometheus, SearXNG, and Infisical.
- Configured inference backends in the Dashboard Services panel.
- Running Docker containers from `docker ps`.

The Dashboard page keeps a short in-browser rolling history of polled snapshots
to draw CPU usage and one utilization graph per GPU. The controller endpoint
still returns a single read-only snapshot per request.

The endpoint does not install exporters, change fan curves, start services, or
SSH elsewhere. Prometheus/Grafana remains the longer-term monitoring stack from
`plan-linux-dashboard.md`.
