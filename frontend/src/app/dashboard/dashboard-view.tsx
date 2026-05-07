"use client";

import { useMemo } from "react";
import { RefreshCw } from "lucide-react";
import type { DashboardLayoutProps } from "@/components/dashboard/layout/dashboard-types";
import type {
  LinuxDashboardAlert,
  LinuxDashboardHealth,
  LinuxDashboardSnapshot,
} from "@/lib/types";
import { formatBytes, formatPercent, formatUptime } from "./dashboard-format";
import {
  formatCpuTopology,
  formatGpuGb,
  formatGpuPower,
  GpuTelemetry,
  SystemOverview,
} from "./dashboard-charts";
import type { DashboardHistoryPoint } from "./dashboard-history";
import {
  AlertStrip,
  ContainersTable,
  DiskRow,
  Section,
  Sensors,
  ServiceGrid,
} from "./dashboard-system-sections";

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
      <div className="mx-auto max-w-[118rem] px-5 py-5 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-7 2xl:px-10">
        <header className="px-1 pt-1">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] tracking-[0.04em]">
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
              <h1 className="mt-1.5 truncate text-[24px] font-semibold leading-tight tracking-[-0.01em] text-(--fg)">
                {data?.host.hostname ?? "Linux host"}
              </h1>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <label className="inline-flex h-9 items-center gap-2 border border-(--border) px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-(--dim) hover:bg-(--fg)/5">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(event) => onAutoRefreshChange(event.target.checked)}
                  className="h-3 w-3 border-(--border) bg-transparent"
                />
                Auto
              </label>
              <button
                onClick={onRefresh}
                className="inline-flex h-9 items-center gap-2 border border-(--border) px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-(--fg) hover:bg-(--fg)/5"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>

          {summary ? (
            <dl className="mt-6 grid w-full grid-cols-2 border-b border-(--border)/45 pb-6 sm:grid-cols-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,0.85fr)_minmax(0,0.9fr)_minmax(0,0.9fr)]">
              <MetricColumn label="CPU" value={summary.cpu} unit="%" detail={summary.cpuDetail} />
              <MetricColumn
                label="Memory"
                value={summary.memory}
                unit="%"
                detail={summary.memoryDetail}
              />
              <MetricColumn label="VRAM" value={summary.vram} detail={summary.vramDetail} />
              <CompactMetric label="GPUs" value={summary.gpus} detail={summary.gpuUtil} />
              <CompactMetric label="Power" value={summary.power} detail={summary.powerDetail} />
              <CompactMetric label="Uptime" value={summary.uptime} detail={summary.collectedAt} />
            </dl>
          ) : null}
        </header>

        {error ? (
          <div className="mt-4 border border-(--err)/35 px-3 py-2 font-mono text-[11px] text-(--err)">
            {error}
          </div>
        ) : null}

        {data ? (
          <main className="mt-7 space-y-7">
            {visibleAlerts.length > 0 ? <AlertStrip alerts={visibleAlerts} /> : null}

            <SystemOverview data={data} history={history} status={topStatus} />
            <GpuTelemetry data={data} history={history} />

            <Section title="Disks" meta={`${data.disks.length} mounts`}>
              <div>
                {data.disks.map((disk) => (
                  <DiskRow key={disk.path} disk={disk} />
                ))}
              </div>
            </Section>

            <div className="grid gap-7 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <Section title="Services" meta="local ports">
                <ServiceGrid
                  services={data.services}
                  runtimeSummary={statusData.runtimeSummary}
                  knownBackendIds={knownBackendIds(statusData)}
                  activeBackend={statusData.currentProcess?.backend}
                />
              </Section>

              <Section title="Sensors" meta="hwmon">
                <Sensors data={data} />
              </Section>
            </div>

            <Section title="Containers" meta={data.docker_error ? "docker unavailable" : "docker"}>
              <ContainersTable data={data} />
            </Section>
          </main>
        ) : null}
      </div>
    </div>
  );
}

function MetricColumn({
  label,
  value,
  unit,
  detail,
}: {
  label: string;
  value: string | null;
  unit?: string;
  detail?: string;
}) {
  return (
    <div className="min-w-0 border-r border-(--border)/35 px-4 py-2 first:pl-0 last:border-r-0">
      <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-(--dim)/75">{label}</dt>
      <dd className="mt-3 flex min-w-0 items-baseline gap-2 font-mono tabular-nums">
        <span className="truncate text-[24px] font-light leading-none text-(--fg)/92 sm:text-[34px]">
          {value ?? "n/a"}
        </span>
        {unit ? <span className="text-[12px] text-(--dim)/70">{unit}</span> : null}
      </dd>
      {detail ? (
        <div className="mt-2 truncate font-mono text-[11px] text-(--dim)/65" title={detail}>
          {detail}
        </div>
      ) : null}
    </div>
  );
}

function CompactMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | null;
  detail?: string;
}) {
  return (
    <div className="min-w-0 border-r border-(--border)/35 px-4 py-2 last:border-r-0">
      <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-(--dim)/75">{label}</dt>
      <dd className="mt-3 truncate font-mono text-[19px] tabular-nums text-(--fg)/88">
        {value ?? "n/a"}
      </dd>
      {detail ? (
        <div className="mt-2 truncate font-mono text-[11px] text-(--dim)/65" title={detail}>
          {detail}
        </div>
      ) : null}
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
  const avgGpuUtil =
    data.gpus.length > 0
      ? data.gpus.reduce((sum, gpu) => sum + (gpu.utilization_percent ?? 0), 0) / data.gpus.length
      : null;
  const totalPower = sumFinite([
    data.cpu.power_draw_watts,
    ...data.gpus.map((gpu) => gpu.power_draw_watts),
  ]);
  const totalPowerLimit = sumFinite(data.gpus.map((gpu) => gpu.power_limit_watts));
  const gpuPower = sumFinite(data.gpus.map((gpu) => gpu.power_draw_watts));
  const gpuCountLabel = `${data.gpus.length} GPU${data.gpus.length === 1 ? "" : "s"}`;
  const cpuPowerLabel =
    data.cpu.power_draw_watts == null
      ? "CPU n/a"
      : `CPU ${formatGpuPower(data.cpu.power_draw_watts, undefined)}`;
  const gpuPowerLabel =
    gpuPower == null ? "GPU n/a" : `GPU ${formatGpuPower(gpuPower, totalPowerLimit)}`;

  return {
    cpu: cpuValue == null ? null : String(Math.round(cpuValue)),
    cpuDetail: `${formatCpuTopology(data)} load ${data.host.load_average.join(" / ")}`,
    memory: String(Math.round(data.memory.used_percent)),
    memoryDetail: `${formatBytes(data.memory.used_bytes)} / ${formatBytes(data.memory.total_bytes)}`,
    vram: `${formatGpuGb(totalVramUsed)}/${formatGpuGb(totalVram)}`,
    vramDetail: `${gpuCountLabel} util ${formatPercent(avgGpuUtil)}`,
    gpus: String(data.gpus.length),
    gpuUtil: `util ${formatPercent(avgGpuUtil)}`,
    power: formatGpuPower(totalPower, undefined),
    powerDetail: `PC total ${cpuPowerLabel} + ${gpuPowerLabel}`,
    uptime: formatUptime(data.host.uptime_seconds),
    collectedAt: new Date(data.collected_at).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
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
  if (status === "ok") return "bg-(--fg)";
  return "bg-(--dim)/55";
}

function sumFinite(values: Array<number | null | undefined>): number | null {
  const total = values.reduce<number>(
    (sum, value) => (typeof value === "number" && Number.isFinite(value) ? sum + value : sum),
    0,
  );
  return total > 0 ? total : null;
}
