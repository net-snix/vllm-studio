import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getApiSettings, type ApiSettings } from "@/lib/api-settings";
import { resolveDataDir } from "@/lib/data-dir";
import {
  modelsWithRecipeToolCapabilities,
  normalizeOpenAIModels,
  modelsToPiModels,
  type AgentModel,
  type BackendRecipeListItem,
} from "./models";
import { normalizeBackendUrl } from "./pi-runtime-helpers";

const PROVIDER_ID = "vllm-studio";

async function fetchModelsFromBackend(settings: ApiSettings): Promise<AgentModel[]> {
  const backendUrl = normalizeBackendUrl(settings.backendUrl);
  const headers: HeadersInit = { Accept: "application/json" };
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
  const response = await fetch(`${backendUrl}/v1/models`, { headers, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`/v1/models failed with HTTP ${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  return normalizeOpenAIModels(payload && typeof payload === "object" ? payload : {});
}

async function fetchRecipesFromBackend(settings: ApiSettings): Promise<BackendRecipeListItem[]> {
  const backendUrl = normalizeBackendUrl(settings.backendUrl);
  const headers: HeadersInit = { Accept: "application/json" };
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
  const response = await fetch(`${backendUrl}/recipes`, { headers, cache: "no-store" });
  if (!response.ok) return [];
  const payload = (await response.json()) as unknown;
  return Array.isArray(payload)
    ? payload.filter(
        (item): item is BackendRecipeListItem =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

async function writePiModelsConfig(settings: ApiSettings, models: AgentModel[]): Promise<string> {
  const dataDir = resolveDataDir();
  const agentDir = path.join(dataDir, "pi-agent");
  await mkdir(agentDir, { recursive: true });
  await chmod(agentDir, 0o700).catch(() => undefined);

  const backendUrl = normalizeBackendUrl(settings.backendUrl);
  const config = {
    providers: {
      [PROVIDER_ID]: {
        baseUrl: `${backendUrl}/v1`,
        api: "openai-completions",
        apiKey: settings.apiKey || "vllm-studio",
        authHeader: Boolean(settings.apiKey),
        compat: {
          supportsDeveloperRole: false,
          supportsReasoningEffort: false,
        },
        models: modelsToPiModels(models),
      },
    },
  };

  const modelsPath = path.join(agentDir, "models.json");
  await writeFile(modelsPath, JSON.stringify(config, null, 2), "utf-8");
  await chmod(modelsPath, 0o600).catch(() => undefined);
  return agentDir;
}

export async function refreshPiModels(): Promise<{ models: AgentModel[]; agentDir: string }> {
  const settings = await getApiSettings();
  const [models, recipes] = await Promise.all([
    fetchModelsFromBackend(settings),
    fetchRecipesFromBackend(settings).catch(() => []),
  ]);
  const modelsWithTools = modelsWithRecipeToolCapabilities(models, recipes);
  const agentDir = await writePiModelsConfig(settings, modelsWithTools);
  return { models: modelsWithTools, agentDir };
}
