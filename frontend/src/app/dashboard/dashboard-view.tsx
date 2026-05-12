"use client";

import { useMemo } from "react";
import { RefreshCw } from "lucide-react";
import type { DashboardLayoutProps } from "@/components/dashboard/layout/dashboard-types";
import type {
  LinuxDashboardAlert,
  LinuxDashboardHealth,
  LinuxDashboardSnapshot,
} from "@/lib/types";
import { formatBytes, formatUptime } from "./dashboard-format";
import { formatGpuGb, formatGpuPower, GpuTelemetry, SystemOverview } from "./dashboard-charts";
import { type DashboardHistoryPoint } from "./dashboard-history";
import {
  AlertStrip,
  ContainersTable,
  BackendsTable,
  DisksTable,
  Section,
  Sensors,
  ServicesTable,
} from "./dashboard-system-sections";
import { HostPowerConfirm } from "./host-power-confirm";

type LinuxDashboardViewProps = {
  data: LinuxDashboardSnapshot | null;
  history: DashboardHistoryPoint[];
  statusData: DashboardLayoutProps;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  autoRefresh: boolean;
  onAutoRefreshChange: (value: boolean) => void;
  onRefresh: () => void;
  onRestart: () => Promise<void>;
  onShutdown: () => Promise<void>;
};

export function LinuxDashboardView({
  data,
  history,
  statusData,
  loading,
  refreshing,
  error,
  autoRefresh,
  onAutoRefreshChange,
  onRefresh,
  onRestart,
  onShutdown,
}: LinuxDashboardViewProps) {
  const visibleAlerts = useMemo(
    () => (data ? data.alerts.filter((alert) => !isFanHwmonAlert(alert)) : []),
    [data],
  );
  const topStatus = useMemo<LinuxDashboardHealth>(() => {
    if (!data) return "unknown";
    if (visibleAlerts.some((alert) => alert.severity === "critical")) return "critical";
    if (visibleAlerts.some((alert) => alert.severity === "warning")) return "warning";
    return "ok";
  }, [data, visibleAlerts]);
  const summary = data ? buildSummary(data, history) : null;

  if (loading && !data) {
    return (
      <div className="flex min-h-full items-center justify-center bg-(--bg) font-mono text-xs text-(--dim)">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        Loading dashboard...
      </div>
    );
  }

  return (
    <div className="min-h-full bg-(--bg) text-(--fg)">
      <div className="mx-auto max-w-[1600px] px-3 py-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-4 lg:px-5">
        <header>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] tracking-[0.04em]">
                <span className={`h-1.5 w-1.5 ${statusDotClass(topStatus)}`} />
                <span className="font-medium uppercase tracking-[0.16em] text-(--dim)">
                  {topStatus === "ok" ? "Active" : topStatus}
                </span>
                <Tag>linux</Tag>
                <Tag>{data?.host.arch ?? "host"}</Tag>
                {data ? (
                  <span className="text-[10px] tabular-nums text-(--dim)/70">
                    {data.host.platform} {data.host.kernel}
                  </span>
                ) : null}
              </div>
              <h1 className="mt-1 truncate text-[22px] font-semibold leading-tight text-(--fg)">
                {data?.host.hostname ?? "Linux host"}
              </h1>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <label className="inline-flex h-8 items-center gap-2 border border-(--border) px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-(--dim) hover:bg-(--fg)/5">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(event) => onAutoRefreshChange(event.target.checked)}
                  className="h-3 w-3 border-(--border) bg-transparent accent-(--fg)"
                />
                Auto
              </label>
              <button
                onClick={onRefresh}
                className="inline-flex h-8 items-center gap-2 border border-(--border) px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-(--fg) hover:bg-(--fg)/5"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </button>
              <HostPowerConfirm
                action="restart"
                onConfirm={onRestart}
                trigger={({ open, running }) => (
                  <button
                    onClick={open}
                    disabled={running}
                    className="inline-flex h-8 items-center border border-(--border) px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-(--err) hover:bg-(--err)/10 disabled:opacity-40"
                  >
                    {running ? "Restarting..." : "Restart"}
                  </button>
                )}
              />
              <HostPowerConfirm
                action="shutdown"
                onConfirm={onShutdown}
                trigger={({ open, running }) => (
                  <button
                    onClick={open}
                    disabled={running}
                    className="inline-flex h-8 items-center border border-(--border) px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-(--err) hover:bg-(--err)/10 disabled:opacity-40"
                  >
                    {running ? "Shutting..." : "Shut down"}
                  </button>
                )}
              />
            </div>
          </div>

          {summary ? (
            <dl className="mt-4 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.82fr)]">
              <MetricCard label="CPU" value={summary.cpu} unit="%" detailWrap />
              <MetricCard label="Memory" value={summary.memory} />
              <MetricCard label="VRAM" value={summary.vram} />
              <MetricCard label="System Power" value={summary.power} compactValue />
              <MetricCard label="Uptime" value={summary.uptime} />
            </dl>
          ) : null}
        </header>

        {error ? (
          <div className="mt-4 border border-(--err)/35 px-3 py-2 font-mono text-[11px] text-(--err)">
            {error}
          </div>
        ) : null}

        {data ? (
          <main className="mt-3 space-y-2.5">
            {visibleAlerts.length > 0 ? <AlertStrip alerts={visibleAlerts} /> : null}

            <SystemOverview data={data} history={history} status={topStatus} />
            <GpuTelemetry data={data} history={history} />

            <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1.36fr)_minmax(0,0.84fr)_minmax(0,0.98fr)_minmax(0,1.18fr)]">
              <Section title="Disks">
                <DisksTable disks={data.disks} />
              </Section>
              <Section title="Services">
                <ServicesTable services={data.services} />
              </Section>

              <Section title="Backends">
                <BackendsTable
                  runtimeSummary={statusData.runtimeSummary}
                  knownBackendIds={knownBackendIds(statusData)}
                  activeBackend={statusData.currentProcess?.backend}
                />
              </Section>

              <Section title="Sensors / Thermals">
                <Sensors data={data} />
              </Section>
            </div>

            <Section title="Containers">
              <ContainersTable data={data} />
            </Section>
          </main>
        ) : null}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  unit,
  detail,
  detailWrap = false,
  compactValue = false,
}: {
  label: string;
  value: string | null;
  unit?: string;
  detail?: string;
  detailWrap?: boolean;
  compactValue?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-[4px] border border-(--border)/70 bg-(--surface)/35 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-(--dim)/80">{label}</dt>
      <dd className="mt-2 flex min-w-0 items-baseline gap-1.5 font-mono tabular-nums">
        <span
          className={`min-w-0 font-light text-(--fg)/95 ${
            compactValue
              ? "whitespace-normal break-words text-[17px] leading-tight"
              : "truncate text-[22px] leading-none"
          }`}
        >
          {value ?? "n/a"}
        </span>
        {unit ? <span className="shrink-0 text-[11px] text-(--dim)/70">{unit}</span> : null}
      </dd>
      <div className="mt-2 min-w-0">
        <span
          className={`block min-w-0 font-mono text-[10.5px] text-(--dim)/70 ${
            detailWrap ? "whitespace-normal break-words leading-snug" : "truncate"
          }`}
          title={detail}
        >
          {detail ?? "\u00a0"}
        </span>
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="border border-(--border) px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-(--dim)/80">
      {children}
    </span>
  );
}

function buildSummary(data: LinuxDashboardSnapshot, history: DashboardHistoryPoint[]) {
  const latestHistory = history.at(-1);
  const cpuValue =
    latestHistory?.cpu_usage_percent ?? data.cpu.usage_percent ?? data.cpu.load_percent_1m ?? null;
  const totalVramUsed = data.gpus.reduce((sum, gpu) => sum + gpu.memory_used_bytes, 0);
  const totalVram = data.gpus.reduce((sum, gpu) => sum + gpu.memory_total_bytes, 0);
  const gpuPower = sumFinite(data.gpus.map((gpu) => gpu.power_draw_watts));
  const cpuPowerLabel =
    data.cpu.power_draw_watts == null
      ? "CPU n/a"
      : `CPU ${formatGpuPower(data.cpu.power_draw_watts, undefined)}`;
  const gpuPowerLabel = gpuPower == null ? "GPU n/a" : `GPU ${formatGpuPower(gpuPower, undefined)}`;

  return {
    cpu: cpuValue == null ? null : String(Math.round(cpuValue)),
    memory: `${formatGpuGb(data.memory.used_bytes)}/${formatGpuGb(data.memory.total_bytes)}`,
    vram: `${formatGpuGb(totalVramUsed)}/${formatGpuGb(totalVram)}`,
    power: `${cpuPowerLabel}/${gpuPowerLabel}`,
    uptime: formatUptime(data.host.uptime_seconds),
  };
}

function isFanHwmonAlert(alert: LinuxDashboardAlert): boolean {
  const message = alert.message.toLowerCase();
  return message.includes("fan rpm") && message.includes("hwmon");
}

function knownBackendIds(statusData: DashboardLayoutProps): string[] {
  const values = new Set<string>();
  if (statusData.currentProcess?.backend) values.add(statusData.currentProcess.backend);
  for (const recipe of statusData.recipes) {
    if (recipe.backend) values.add(recipe.backend);
  }
  return [...values].sort((left, right) => {
    if (left === statusData.currentProcess?.backend) return -1;
    if (right === statusData.currentProcess?.backend) return 1;
    return left.localeCompare(right);
  });
}

function statusDotClass(status: LinuxDashboardHealth): string {
  if (status === "critical") return "bg-(--err)";
  if (status === "warning") return "bg-(--hl3)";
  if (status === "ok") return "bg-(--hl2)";
  return "bg-(--dim)/55";
}

function sumFinite(values: Array<number | null | undefined>): number | null {
  const total = values.reduce<number>(
    (sum, value) => (typeof value === "number" && Number.isFinite(value) ? sum + value : sum),
    0,
  );
  return total > 0 ? total : null;
}
