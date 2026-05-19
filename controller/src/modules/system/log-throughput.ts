import { basename } from "node:path";
import { listLogFiles, resolveExistingLogPath, tailFileLines } from "../../core/log-files";
import type { AppContext } from "../../types/context";
import { isRecipeRunning } from "../models/recipes/recipe-matching";
import type { ProcessInfo, Recipe } from "../models/types";

const LOG_TAIL_LINES = 240;
const TOKENS_PER_SECOND_PATTERN = /([0-9]+(?:\.[0-9]+)?)\s*tokens\s+per\s+second/i;
const PROMPT_EVAL_PATTERN = /prompt eval time\s*=/i;
const EVAL_PATTERN = /(^|\s)eval time\s*=/i;
const DS4_PREFILL_PATTERN =
  /prefill chunk\s+\d+\/\d+.*?chunk=([0-9]+(?:\.[0-9]+)?)\s*t\/s\s+avg=([0-9]+(?:\.[0-9]+)?)\s*t\/s/i;
const DS4_DECODE_PATTERN =
  /gen=\d+.*?decoding\s+chunk=([0-9]+(?:\.[0-9]+)?)\s*t\/s\s+avg=([0-9]+(?:\.[0-9]+)?)\s*t\/s/i;
const DS4_PROMPT_DONE_PATTERN = /prompt done\s+([0-9]+(?:\.[0-9]+)?)s/i;

export interface RuntimeThroughputSample {
  promptTps: number;
  generationTps: number;
  ttftMs: number;
  sampleKey: string;
}

const parsePositiveNumber = (raw: string | undefined): number => {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

const parseTokensPerSecond = (line: string): number | null => {
  const match = line.match(TOKENS_PER_SECOND_PATTERN);
  if (!match?.[1]) return null;
  const value = parsePositiveNumber(match[1]);
  return value > 0 ? value : null;
};

export const parseLlamacppThroughputFromLines = (
  lines: string[]
): RuntimeThroughputSample | null => {
  if (lines.length === 0) return null;

  let promptLine = "";
  let evalLine = "";

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index] ?? "";
    if (!promptLine && PROMPT_EVAL_PATTERN.test(line)) {
      promptLine = line;
      continue;
    }
    if (!evalLine && EVAL_PATTERN.test(line) && !PROMPT_EVAL_PATTERN.test(line)) {
      evalLine = line;
    }
    if (promptLine && evalLine) break;
  }

  const promptTps = promptLine ? (parseTokensPerSecond(promptLine) ?? 0) : 0;
  const generationTps = evalLine ? (parseTokensPerSecond(evalLine) ?? 0) : 0;
  if (promptTps <= 0 && generationTps <= 0) return null;

  return {
    promptTps,
    generationTps,
    ttftMs: 0,
    sampleKey: `${promptLine}::${evalLine}`,
  };
};

export const parseDs4ThroughputFromLines = (lines: string[]): RuntimeThroughputSample | null => {
  if (lines.length === 0) return null;

  let prefillLine = "";
  let decodeLine = "";
  let promptDoneLine = "";
  let promptTps = 0;
  let generationTps = 0;
  let ttftMs = 0;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index] ?? "";

    if (!decodeLine) {
      const match = line.match(DS4_DECODE_PATTERN);
      if (match) {
        const chunkTps = parsePositiveNumber(match[1]);
        const avgTps = parsePositiveNumber(match[2]);
        generationTps = avgTps || chunkTps;
        decodeLine = line;
      }
    }

    if (!prefillLine) {
      const match = line.match(DS4_PREFILL_PATTERN);
      if (match) {
        const chunkTps = parsePositiveNumber(match[1]);
        const avgTps = parsePositiveNumber(match[2]);
        promptTps = avgTps || chunkTps;
        prefillLine = line;
      }
    }

    if (!promptDoneLine) {
      const match = line.match(DS4_PROMPT_DONE_PATTERN);
      if (match) {
        ttftMs = parsePositiveNumber(match[1]) * 1000;
        promptDoneLine = line;
      }
    }

    if (decodeLine && prefillLine && promptDoneLine) break;
  }

  if (promptTps <= 0 && generationTps <= 0 && ttftMs <= 0) return null;

  return {
    promptTps,
    generationTps,
    ttftMs,
    sampleKey: `${prefillLine}::${decodeLine}::${promptDoneLine}`,
  };
};

export const findRunningRecipeForProcess = (
  context: Pick<AppContext, "stores">,
  current: ProcessInfo
): Recipe | null => {
  const recipes = context.stores.recipeStore.list();
  return (
    recipes.find((recipe) =>
      isRecipeRunning(recipe, current, {
        allowCurrentContainsRecipePath: true,
      })
    ) ?? null
  );
};

export const getProcessModelId = (
  context: Pick<AppContext, "stores">,
  current: ProcessInfo
): string => {
  const recipe = findRunningRecipeForProcess(context, current);
  return (
    recipe?.served_model_name ??
    current.served_model_name ??
    current.model_path?.split("/").pop() ??
    "unknown"
  );
};

const resolveRuntimeLogPath = (
  context: Pick<AppContext, "config" | "stores">,
  current: ProcessInfo
): string | null => {
  const recipe = findRunningRecipeForProcess(context, current);
  const recipeLogPath = recipe ? resolveExistingLogPath(context.config.data_dir, recipe.id) : null;
  if (recipeLogPath) return recipeLogPath;

  const servedName = (current.served_model_name ?? "").toLowerCase();
  const modelBaseName = current.model_path ? basename(current.model_path).toLowerCase() : "";
  const entries = listLogFiles(context.config.data_dir).filter(
    (entry) => entry.sessionId !== "controller"
  );
  const byName =
    servedName.length > 0
      ? entries.find((entry) => entry.sessionId.toLowerCase().includes(servedName))
      : null;
  const byModel =
    modelBaseName.length > 0
      ? entries.find((entry) => entry.sessionId.toLowerCase().includes(modelBaseName))
      : null;

  return byName?.path ?? byModel?.path ?? entries[0]?.path ?? null;
};

const scrapeLogThroughput = (
  context: Pick<AppContext, "config" | "stores">,
  current: ProcessInfo,
  parser: (lines: string[]) => RuntimeThroughputSample | null
): RuntimeThroughputSample | null => {
  const logPath = resolveRuntimeLogPath(context, current);
  if (!logPath) return null;
  return parser(tailFileLines(logPath, LOG_TAIL_LINES));
};

export const scrapeLlamacppThroughput = (
  context: Pick<AppContext, "config" | "stores">,
  current: ProcessInfo
): RuntimeThroughputSample | null =>
  scrapeLogThroughput(context, current, parseLlamacppThroughputFromLines);

export const scrapeDs4Throughput = (
  context: Pick<AppContext, "config" | "stores">,
  current: ProcessInfo
): RuntimeThroughputSample | null =>
  scrapeLogThroughput(context, current, parseDs4ThroughputFromLines);
