import type { LinuxDashboardGpu, LinuxDashboardSnapshot } from "@/lib/types";

export type DashboardHistoryGpu = {
  key: string;
  index: number;
  name: string;
  utilization_percent: number | null;
  memory_used_percent: number | null;
  temperature_c: number | null;
  power_draw_watts: number | null;
};

export type DashboardHistoryPoint = {
  collected_at: string;
  time: number;
  cpu_usage_percent: number | null;
  cpu_load_percent: number | null;
  memory_used_percent: number;
  gpus: DashboardHistoryGpu[];
};

const DEFAULT_HISTORY_LIMIT = 96;
const DASHBOARD_HISTORY_STORAGE_KEY = "vllm-studio-dashboard-history";

export type DashboardUsageSample = {
  time: number;
  value: number | null;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isNullableFiniteNumber = (value: unknown): value is number | null =>
  value === null || isFiniteNumber(value);

const isHistoryGpu = (value: unknown): value is DashboardHistoryGpu => {
  if (!value || typeof value !== "object") return false;
  const gpu = value as Partial<DashboardHistoryGpu>;
  return (
    typeof gpu.key === "string" &&
    isFiniteNumber(gpu.index) &&
    typeof gpu.name === "string" &&
    isNullableFiniteNumber(gpu.utilization_percent) &&
    isNullableFiniteNumber(gpu.memory_used_percent) &&
    isNullableFiniteNumber(gpu.temperature_c) &&
    isNullableFiniteNumber(gpu.power_draw_watts)
  );
};

const isHistoryPoint = (value: unknown): value is DashboardHistoryPoint => {
  if (!value || typeof value !== "object") return false;
  const point = value as Partial<DashboardHistoryPoint>;
  return (
    typeof point.collected_at === "string" &&
    isFiniteNumber(point.time) &&
    isNullableFiniteNumber(point.cpu_usage_percent) &&
    isNullableFiniteNumber(point.cpu_load_percent) &&
    isFiniteNumber(point.memory_used_percent) &&
    Array.isArray(point.gpus) &&
    point.gpus.every(isHistoryGpu)
  );
};

export const dashboardGpuKey = (gpu: Pick<LinuxDashboardGpu, "index" | "name" | "uuid">): string =>
  gpu.uuid ?? `${gpu.index}:${gpu.name}`;

const finiteOrNull = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export const snapshotToHistoryPoint = (
  snapshot: LinuxDashboardSnapshot,
): DashboardHistoryPoint => ({
  collected_at: snapshot.collected_at,
  time: Date.parse(snapshot.collected_at),
  cpu_usage_percent: finiteOrNull(snapshot.cpu.usage_percent),
  cpu_load_percent: finiteOrNull(snapshot.cpu.load_percent_1m),
  memory_used_percent: snapshot.memory.used_percent,
  gpus: snapshot.gpus.map((gpu) => ({
    key: dashboardGpuKey(gpu),
    index: gpu.index,
    name: gpu.name,
    utilization_percent: finiteOrNull(gpu.utilization_percent),
    memory_used_percent: finiteOrNull(gpu.memory_used_percent),
    temperature_c: finiteOrNull(gpu.temperature_c),
    power_draw_watts: finiteOrNull(gpu.power_draw_watts),
  })),
});

export const appendDashboardHistory = (
  history: DashboardHistoryPoint[],
  snapshot: LinuxDashboardSnapshot,
  limit = DEFAULT_HISTORY_LIMIT,
): DashboardHistoryPoint[] => {
  const last = history.at(-1);
  if (last?.collected_at === snapshot.collected_at) return history;

  return [...history, snapshotToHistoryPoint(snapshot)].slice(-limit);
};

export const loadStoredDashboardHistory = (): DashboardHistoryPoint[] => {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(DASHBOARD_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isHistoryPoint).slice(-DEFAULT_HISTORY_LIMIT);
  } catch {
    return [];
  }
};

export const storeDashboardHistory = (history: DashboardHistoryPoint[]): void => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      DASHBOARD_HISTORY_STORAGE_KEY,
      JSON.stringify(history.slice(-DEFAULT_HISTORY_LIMIT)),
    );
  } catch {
    // Browser storage can be unavailable or full; live polling still works without persistence.
  }
};

export const getCpuUsageSeries = (history: DashboardHistoryPoint[]): Array<number | null> =>
  history.map((point) => point.cpu_usage_percent ?? point.cpu_load_percent);

export const getCpuUsageSamples = (history: DashboardHistoryPoint[]): DashboardUsageSample[] =>
  history.map((point) => ({
    time: point.time,
    value: point.cpu_usage_percent ?? point.cpu_load_percent,
  }));

export const getGpuUsageSeries = (
  history: DashboardHistoryPoint[],
  gpu: Pick<LinuxDashboardGpu, "index" | "name" | "uuid">,
): Array<number | null> => {
  const key = dashboardGpuKey(gpu);
  return history.map((point) => {
    const sample =
      point.gpus.find((entry) => entry.key === key) ??
      point.gpus.find((entry) => entry.index === gpu.index);
    return sample?.utilization_percent ?? null;
  });
};

export const getGpuUsageSamples = (
  history: DashboardHistoryPoint[],
  gpu: Pick<LinuxDashboardGpu, "index" | "name" | "uuid">,
): DashboardUsageSample[] => {
  const key = dashboardGpuKey(gpu);
  return history.map((point) => {
    const sample =
      point.gpus.find((entry) => entry.key === key) ??
      point.gpus.find((entry) => entry.index === gpu.index);
    return {
      time: point.time,
      value: sample?.utilization_percent ?? null,
    };
  });
};
