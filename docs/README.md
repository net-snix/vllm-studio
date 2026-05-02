# vLLM Studio Docs

## Start Here

- Operations and deployment: operations.md
- Linux dashboard: linux-dashboard.md
- Environment variables: ../`.env.example`
- LiteLLM config: `../config/litellm.yaml`

## Deployment model

For GPU workstations, run the controller and frontend directly on the Linux GPU
host. Use a browser from another machine through a private network URL or an SSH
tunnel. Keep hostnames, usernames, model roots, and other local operator details
in private machine notes, not in this repository.

## Module Docs

- Controller: ../controller/README.md
- Frontend: ../frontend/README.md
- Desktop app (Electron): desktop-electron.md
- CLI: ../cli/README.md
- Shared types: ../shared/README.md
