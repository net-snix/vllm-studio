"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Square } from "lucide-react";
import { ModelStopConfirm } from "@/components/model-stop-confirm";
import type { DashboardLayoutProps } from "@/components/dashboard/layout/dashboard-types";
import { useModelLifecycle } from "@/hooks/use-model-lifecycle";
import type { GPU, RecipeWithStatus } from "@/lib/types";
import { toGB, toGBFromMB } from "@/lib/formatters";

type DashboardModelRuntimeProps = {
  statusData: DashboardLayoutProps;
};

export function DashboardModelRuntime({ statusData }: DashboardModelRuntimeProps) {
  const runtime = buildRuntimeSummary(statusData);

  return (
    <section className="mb-3 rounded-[4px] border border-(--border)/70 bg-(--surface)/30 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] sm:px-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] tracking-[0.04em]">
            <span className={`h-1.5 w-1.5 ${runtime.running ? "bg-(--fg)" : "bg-(--dim)/55"}`} />
            <span className="font-medium uppercase tracking-[0.16em] text-(--dim)">
              {runtime.running ? "Active" : "Standby"}
            </span>
            {runtime.backend ? <RuntimeTag>{runtime.backend}</RuntimeTag> : null}
            {runtime.platform ? <RuntimeTag>{runtime.platform}</RuntimeTag> : null}
            {runtime.port ? (
              <span className="font-mono text-[10px] tabular-nums text-(--dim)/70">
                :{runtime.port}
              </span>
            ) : null}
          </div>
          <h2
            className="mt-1.5 min-w-0 text-[20px] font-semibold leading-tight text-(--fg) sm:text-[22px]"
            title={runtime.modelName}
          >
            <span className="line-clamp-2 break-words">{runtime.modelName}</span>
          </h2>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <HeaderStopButton running={runtime.running} />
          <ModelsDropdown
            recipes={statusData.recipes}
            currentRecipeId={statusData.currentRecipe?.id}
            lifecycleStatus={statusData.lifecycleStatus}
            onLaunch={statusData.onLaunch}
            onNewRecipe={statusData.onNewRecipe}
            onViewAll={statusData.onViewAll}
          />
          <RuntimeButton label="Logs" onClick={statusData.onNavigateLogs} />
          <RuntimeButton
            label={statusData.benchmarking ? "Run" : "Bench"}
            onClick={statusData.onBenchmark}
            disabled={!runtime.running || statusData.benchmarking}
          />
        </div>
      </div>

      <dl className="mt-4 grid w-full grid-cols-1 border-y border-(--border)/35 py-3 sm:grid-cols-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.9fr)_minmax(0,1.08fr)_minmax(0,0.55fr)_minmax(0,0.85fr)_minmax(0,0.9fr)]">
        <HeroMetric
          label="Decode"
          value={runtime.decode}
          unit="tok/s"
          detail={runtime.decodePeak}
        />
        <HeroMetric label="TTFT" value={runtime.ttft} unit="ms" detail={runtime.ttftPeak} />
        <HeroMetric
          label="Prefill"
          value={runtime.prefill}
          unit="t/s"
          detail={runtime.prefillPeak}
        />
        <CompactMetric label="Req" value={runtime.requests} />
        <CompactMetric label="VRAM" value={runtime.vram} />
        <CompactMetric label="Power" value={runtime.power} />
      </dl>

      <dl className="mt-2 grid gap-2 font-mono text-[10.5px] text-(--dim) sm:grid-cols-2 xl:grid-cols-4">
        <RuntimeStat label="Total tokens" value={runtime.totalTokens} />
        <RuntimeStat label="Prompt tokens" value={runtime.promptTokens} />
        <RuntimeStat label="Completion tokens" value={runtime.completionTokens} />
        <RuntimeStat label="Duration" value={runtime.duration} />
      </dl>
    </section>
  );
}

function HeaderStopButton({ running }: { running: boolean }) {
  const { stop } = useModelLifecycle();
  if (!running) return null;

  return (
    <ModelStopConfirm
      onStop={stop}
      trigger={({ open, stopping }) => (
        <button
          type="button"
          onClick={open}
          disabled={stopping}
          className="inline-flex h-8 items-center gap-1.5 rounded-[3px] px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-(--err) hover:bg-(--err)/10 disabled:opacity-40"
          title="Stop model"
        >
          <Square className="h-3 w-3" fill="currentColor" />
          {stopping ? "Stopping" : "Stop"}
        </button>
      )}
    />
  );
}

function ModelsDropdown({
  recipes,
  currentRecipeId,
  lifecycleStatus,
  onLaunch,
  onNewRecipe,
  onViewAll,
}: {
  recipes: RecipeWithStatus[];
  currentRecipeId?: string;
  lifecycleStatus: DashboardLayoutProps["lifecycleStatus"];
  onLaunch: (id: string) => Promise<void>;
  onNewRecipe?: () => void;
  onViewAll?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);

  // eslint-disable-next-line no-restricted-syntax -- The dropdown needs a scoped document listener only while open so outside clicks close it.
  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const query = filter.trim().toLowerCase();
  const filtered = query
    ? recipes.filter(
        (recipe) =>
          recipe.name.toLowerCase().includes(query) || recipe.id.toLowerCase().includes(query),
      )
    : recipes;
  const visible = filtered.slice(0, query ? 8 : 6);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 items-center gap-1.5 rounded-[3px] border border-(--border)/70 px-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-(--fg) hover:border-(--border) hover:bg-(--fg)/5"
      >
        Models
        <ChevronDown className="h-3 w-3" />
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-1 w-[min(22rem,calc(100vw-2rem))] rounded-[4px] border border-(--border) bg-(--surface) shadow-lg">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] border-b border-(--border)">
            <input
              autoFocus
              type="text"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Search models"
              className="min-w-0 bg-transparent px-2.5 py-1.5 font-mono text-xs text-(--fg) placeholder:text-(--dim)/60 focus:outline-none"
            />
            {onNewRecipe ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onNewRecipe();
                }}
                className="border-l border-(--border) px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-(--dim) hover:bg-(--fg)/5 hover:text-(--fg)"
              >
                New
              </button>
            ) : null}
          </div>
          <div className="max-h-[18rem] overflow-auto">
            {visible.length === 0 ? (
              <div className="px-2.5 py-2 font-mono text-[10.5px] text-(--dim)">
                No models found.
              </div>
            ) : null}
            {visible.map((recipe) => {
              const current = recipe.id === currentRecipeId;
              const running = recipe.status === "running";
              const disabled = lifecycleStatus === "starting" || current;
              return (
                <button
                  key={recipe.id}
                  type="button"
                  disabled={disabled}
                  onClick={async () => {
                    setOpen(false);
                    await onLaunch(recipe.id);
                  }}
                  className={`flex w-full items-center gap-2 border-b border-(--border)/60 px-2.5 py-1.5 text-left last:border-b-0 ${current ? "bg-(--fg)/8" : "hover:bg-(--fg)/5"} ${disabled && !current ? "cursor-not-allowed opacity-30" : ""}`}
                >
                  <span
                    className={`h-3 w-0.5 shrink-0 ${current ? "bg-(--fg)" : running ? "bg-(--hl2)" : "bg-(--dim)/40"}`}
                  />
                  <span
                    className="min-w-0 flex-1 truncate font-mono text-xs text-(--fg)"
                    title={recipe.name}
                  >
                    {recipe.name}
                  </span>
                  {running ? <span className="h-1.5 w-1.5 bg-(--hl2)" /> : null}
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-(--dim)">
                    tp{recipe.tp || recipe.tensor_parallel_size}
                  </span>
                </button>
              );
            })}
          </div>
          {onViewAll && filtered.length > visible.length ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onViewAll();
              }}
              className="block w-full border-t border-(--border) px-2.5 py-1.5 text-left font-mono text-[10px] text-(--dim) hover:bg-(--fg)/5 hover:text-(--fg)"
            >
              {query ? `${filtered.length - visible.length} more` : `View all ${recipes.length}`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function RuntimeButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="inline-flex h-8 items-center rounded-[3px] border border-(--border)/70 px-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-(--dim) hover:border-(--border) hover:bg-(--fg)/5 hover:text-(--fg) disabled:cursor-not-allowed disabled:opacity-30"
    >
      {label}
    </button>
  );
}

function RuntimeTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="border border-(--border)/70 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-(--dim)/80">
      {children}
    </span>
  );
}

function HeroMetric({
  label,
  value,
  unit,
  detail,
}: {
  label: string;
  value: string | null;
  unit: string;
  detail?: string;
}) {
  return (
    <div className="min-w-0 overflow-hidden border-b border-(--border)/30 py-2 sm:border-r sm:border-b-0 sm:px-3 sm:first:pl-0 xl:px-5 xl:first:pl-0 xl:last:border-r-0">
      <dt className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-(--dim)">
        {label}
      </dt>
      <dd className="mt-2 flex min-w-0 items-baseline gap-1.5 font-mono tabular-nums">
        <span className="min-w-0 truncate text-[30px] font-light leading-none text-(--fg)">
          {value ?? "0"}
        </span>
        {value ? <span className="shrink-0 text-[11px] text-(--dim)">{unit}</span> : null}
      </dd>
      <div className="mt-1 min-h-[0.9rem] truncate font-mono text-[10.5px] tabular-nums text-(--dim)">
        {detail ?? "\u00a0"}
      </div>
    </div>
  );
}

function CompactMetric({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0 overflow-hidden border-b border-(--border)/30 py-2 font-mono tabular-nums sm:border-r sm:border-b-0 sm:px-3 xl:px-4 xl:last:border-r-0">
      <dt className="truncate text-[9.5px] uppercase tracking-[0.14em] text-(--dim)">{label}</dt>
      <dd
        className="mt-4 truncate text-[13px] leading-none text-(--fg)/90"
        title={value ?? undefined}
      >
        {value ?? "0"}
      </dd>
    </div>
  );
}

function RuntimeStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 border-t border-(--border)/25 pt-1">
      <dt className="truncate uppercase tracking-[0.12em]">{label}</dt>
      <dd className="truncate text-(--fg)" title={value}>
        {value}
      </dd>
    </div>
  );
}

function buildRuntimeSummary(statusData: DashboardLayoutProps) {
  const metrics = statusData.metrics;
  const currentProcess = statusData.currentProcess;
  const currentRecipe = statusData.currentRecipe;
  const running = Boolean(currentProcess);
  const modelName =
    currentRecipe?.name ||
    currentProcess?.served_model_name ||
    currentProcess?.model_path?.split("/").pop() ||
    "No model loaded";

  const fallbackPower = sumPositive(statusData.gpus.map((gpu) => gpu.power_draw));
  const fallbackPowerLimit = sumPositive(statusData.gpus.map((gpu) => gpu.power_limit));
  const fallbackVramUsed = sumPositive(statusData.gpus.map(gpuUsedGb));
  const fallbackVramTotal = sumPositive(statusData.gpus.map(gpuTotalGb));

  const decode = firstPositive(
    metrics?.generation_throughput,
    metrics?.session_avg_generation,
    metrics?.session_peak_generation_throughput,
    metrics?.session_peak_generation,
    metrics?.peak_generation_tps,
  );
  const prefill = firstPositive(
    metrics?.prompt_throughput,
    metrics?.session_avg_prefill,
    metrics?.session_peak_prompt_throughput,
    metrics?.session_peak_prefill,
    metrics?.peak_prefill_tps,
  );
  const ttft = firstPositive(
    metrics?.avg_ttft_ms,
    metrics?.session_peak_ttft_ms,
    metrics?.peak_ttft_ms,
  );
  const decodePeak = firstPositive(
    metrics?.session_peak_generation_throughput,
    metrics?.session_peak_generation,
    metrics?.peak_generation_tps,
  );
  const prefillPeak = firstPositive(
    metrics?.session_peak_prompt_throughput,
    metrics?.session_peak_prefill,
    metrics?.peak_prefill_tps,
  );
  const ttftPeak = firstPositive(metrics?.session_peak_ttft_ms, metrics?.peak_ttft_ms);

  const totalPower = firstPositive(metrics?.current_power_watts, fallbackPower);
  const powerLimit = firstPositive(metrics?.power_limit_watts, fallbackPowerLimit);
  const vramUsed = firstPositive(metrics?.vram_used_gb, fallbackVramUsed);
  const vramTotal = firstPositive(metrics?.vram_capacity_gb, fallbackVramTotal);
  const runningRequests = normalizeCount(metrics?.running_requests);
  const peakRequests = normalizeCount(metrics?.session_peak_running_requests) || runningRequests;

  return {
    running,
    modelName,
    backend: currentProcess?.backend ?? currentRecipe?.backend ?? null,
    platform: statusData.platformKind,
    port: statusData.inferencePort || currentProcess?.port || null,
    decode: formatNumberMetric(decode, 1),
    ttft: formatNumberMetric(ttft, 0),
    prefill: formatNumberMetric(prefill, 1),
    decodePeak: formatPeak(decodePeak, 1),
    ttftPeak: formatPeak(ttftPeak, 0, " ms"),
    prefillPeak: formatPeak(prefillPeak, 1),
    requests: `${runningRequests}/${peakRequests}`,
    vram: formatRatio(vramUsed, vramTotal, "G", 1),
    power: formatRatio(totalPower, powerLimit, "W", 0),
    totalTokens: tokenTotalMetric(metrics),
    promptTokens: tokenMetric(metrics?.prompt_tokens_total),
    completionTokens: tokenMetric(metrics?.generation_tokens_total),
    duration: durationMetric(metrics?.latency_avg),
  };
}

function firstPositive(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function normalizeCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

function formatNumberMetric(value: number | null, digits: number): string | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value.toFixed(digits)
    : null;
}

function formatPeak(value: number | null, digits: number, suffix = ""): string | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? `peak ${value.toFixed(digits)}${suffix}`
    : undefined;
}

function formatRatio(
  value: number | null,
  total: number | null,
  unit: string,
  valueDigits: number,
): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  if (typeof total !== "number" || !Number.isFinite(total) || total <= 0) return null;
  return `${value.toFixed(valueDigits)}/${total.toFixed(0)}${unit}`;
}

function tokenMetric(...values: Array<number | undefined>): string {
  const value = values.find(
    (item) => typeof item === "number" && Number.isFinite(item) && item >= 0,
  );
  return typeof value === "number" ? Math.round(value).toLocaleString() : "unavailable";
}

function tokenTotalMetric(metrics: DashboardLayoutProps["metrics"]): string {
  const explicit = tokenMetric(metrics?.total_tokens, metrics?.tokens_total);
  if (explicit !== "unavailable") return explicit;
  if (
    typeof metrics?.prompt_tokens_total === "number" &&
    typeof metrics.generation_tokens_total === "number"
  ) {
    return tokenMetric(metrics.prompt_tokens_total + metrics.generation_tokens_total);
  }
  return "unavailable";
}

function durationMetric(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "unavailable";
  return value > 1000 ? `${(value / 1000).toFixed(2)}s` : `${value.toFixed(0)}ms`;
}

function gpuUsedGb(gpu: GPU): number {
  if (gpu.memory_used_mb != null) return toGBFromMB(gpu.memory_used_mb);
  return toGB(gpu.memory_used);
}

function gpuTotalGb(gpu: GPU): number {
  if (gpu.memory_total_mb != null) return toGBFromMB(gpu.memory_total_mb);
  return toGB(gpu.memory_total);
}

function sumPositive(values: Array<number | null | undefined>): number | null {
  const total = values.reduce<number>(
    (sum, value) =>
      typeof value === "number" && Number.isFinite(value) && value > 0 ? sum + value : sum,
    0,
  );
  return total > 0 ? total : null;
}
