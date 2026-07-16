import type { Backend, RuntimeTarget, ServeRuntime } from "@/lib/types";

const ENGINE_LABEL: Record<Backend, string> = {
  vllm: "vLLM",
  sglang: "SGLang",
  llamacpp: "llama.cpp",
  ds4: "DS4",
  exllamav3: "ExLlamaV3",
  mlx: "MLX",
};

export const runtimeId = (runtime: ServeRuntime): string => `${runtime.kind}:${runtime.ref}`;

export const defaultRuntimeForBackend = (backend: Backend): ServeRuntime =>
  backend === "ds4"
    ? { kind: "binary", ref: "ds4-server", label: "External DS4" }
    : backend === "exllamav3"
      ? { kind: "binary", ref: "exllamav3", label: "External ExLlamaV3" }
      : backend === "llamacpp"
        ? { kind: "binary", ref: "llama-server", label: "Managed llama.cpp" }
        : {
            kind: "managed_venv",
            ref: backend,
            label: `Managed ${ENGINE_LABEL[backend]}`,
          };

export const isManagedServeRuntimeTarget = (backend: Backend, target: RuntimeTarget): boolean =>
  target.backend === backend &&
  target.kind === "venv" &&
  Boolean(target.pythonPath?.includes(`/runtime/venvs/${backend}-latest/`));
