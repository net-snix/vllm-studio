import { basename } from "node:path";
import type { ProcessInfo, Recipe } from "../types";

export interface RecipeMatchOptions {
  allowCurrentContainsRecipePath?: boolean;
  allowEitherPathContains?: boolean;
}

const normalizeModelPath = (path: string): string => path.replace(/\/+$/, "");
const runtimeEnvironmentKeys = new Set(["CUDA_VISIBLE_DEVICES"]);

const getExtraArgument = (extraArguments: Record<string, unknown>, key: string): unknown => {
  if (Object.prototype.hasOwnProperty.call(extraArguments, key)) return extraArguments[key];
  const kebab = key.replace(/_/g, "-");
  if (Object.prototype.hasOwnProperty.call(extraArguments, kebab)) return extraArguments[kebab];
  const snake = key.replace(/-/g, "_");
  if (Object.prototype.hasOwnProperty.call(extraArguments, snake)) return extraArguments[snake];
  return undefined;
};

const collectRecipeRuntimeEnvironment = (recipe: Recipe): Record<string, string> => {
  const environment: Record<string, string> = {};
  const add = (key: string, value: unknown): void => {
    if (value === undefined || value === null) return;
    if (!key.startsWith("DS4_") && !runtimeEnvironmentKeys.has(key)) return;
    environment[key] = String(value);
  };

  for (const [key, value] of Object.entries(recipe.env_vars ?? {})) {
    add(key, value);
  }

  const extraEnvironment =
    recipe.extra_args["env_vars"] || recipe.extra_args["env-vars"] || recipe.extra_args["envVars"];
  if (extraEnvironment && typeof extraEnvironment === "object") {
    for (const [key, value] of Object.entries(extraEnvironment as Record<string, unknown>)) {
      add(key, value);
    }
  }

  const visibleDevices =
    getExtraArgument(recipe.extra_args, "visible_devices") ??
    getExtraArgument(recipe.extra_args, "CUDA_VISIBLE_DEVICES");
  add("CUDA_VISIBLE_DEVICES", visibleDevices);

  return environment;
};

const collectCurrentRuntimeEnvironment = (current: ProcessInfo): Record<string, string> => {
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(current.runtime_env ?? {})) {
    if (!key.startsWith("DS4_") && !runtimeEnvironmentKeys.has(key)) continue;
    environment[key] = String(value);
  }
  return environment;
};

const sameEnvironment = (left: Record<string, string>, right: Record<string, string>): boolean => {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (left[key] !== right[key]) return false;
  }
  return true;
};

const ds4BinaryMatches = (recipe: Recipe, current: ProcessInfo): boolean => {
  const recipeBinary = getExtraArgument(recipe.extra_args, "ds4_bin");
  if (typeof recipeBinary !== "string" || !recipeBinary.trim()) return true;
  if (!current.executable_path) return true;
  return normalizeModelPath(recipeBinary) === normalizeModelPath(current.executable_path);
};

const ds4RuntimeMatches = (recipe: Recipe, current: ProcessInfo): boolean => {
  if (recipe.backend !== "ds4" || current.backend !== "ds4") return true;
  if (!ds4BinaryMatches(recipe, current)) return false;
  if (!current.runtime_env) return true;
  return sameEnvironment(
    collectRecipeRuntimeEnvironment(recipe),
    collectCurrentRuntimeEnvironment(current)
  );
};

/**
 * Determine whether a running process matches a given recipe.
 * Matching order:
 * 1) served_model_name (case-insensitive)
 * 2) normalized exact model path
 * 3) optional contains-style path match (route-specific)
 * 4) model path basename
 * @param recipe - Recipe to match against.
 * @param current - Current process info.
 * @param options - Matching options.
 * @returns True if the process matches the recipe.
 */
export const isRecipeRunning = (
  recipe: Recipe,
  current: ProcessInfo,
  options: RecipeMatchOptions = {}
): boolean => {
  if (!ds4RuntimeMatches(recipe, current)) {
    return false;
  }

  const canonicalName = (recipe.served_model_name ?? "").toLowerCase();
  if (
    canonicalName &&
    current.served_model_name &&
    current.served_model_name.toLowerCase() === canonicalName
  ) {
    return true;
  }

  if (!current.model_path) {
    return false;
  }

  const recipePath = normalizeModelPath(recipe.model_path);
  const currentPath = normalizeModelPath(current.model_path);

  if (recipePath === currentPath) {
    return true;
  }

  if (options.allowEitherPathContains) {
    if (recipePath.includes(currentPath) || currentPath.includes(recipePath)) {
      return true;
    }
  } else if (options.allowCurrentContainsRecipePath) {
    if (currentPath.includes(recipePath)) {
      return true;
    }
  }

  return basename(recipePath) === basename(currentPath);
};
