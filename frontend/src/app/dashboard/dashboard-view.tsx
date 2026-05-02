"use client";

import { useMemo } from "react";
import { RefreshCw } from "lucide-react";
import type { DashboardLayoutProps } from "@/components/dashboard/layout/dashboard-types";
import type { LinuxDashboardAlert } from "@/lib/types";
import type { LinuxDashboardHealth, LinuxDashboardSnapshot } from "@/lib/types";
import { GpuTelemetry, SystemOverview } from "./dashboard-charts";
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
      <div className="mx-auto max-w-[118rem] space-y-4 px-4 py-4 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-6 2xl:px-10">
        <header className="grid gap-4 border border-(--border) bg-(--surface) px-3 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <h1 className="truncate font-mono text-xl tabular-nums text-(--fg) sm:text-2xl">
              {data?.host.hostname ?? "Linux host"}
            </h1>
            <div className="mt-1 truncate font-mono text-[11px] text-(--dim)">
              {data
                ? `${data.host.platform} ${data.host.kernel} / ${data.host.arch}`
                : "No snapshot"}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {data && (
              <span className="border border-(--border) bg-(--bg) px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-(--dim)">
                {topStatus}
              </span>
            )}
            <label className="inline-flex items-center gap-2 border border-(--border) bg-(--bg) px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-(--dim)">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(event) => onAutoRefreshChange(event.target.checked)}
                className="h-3 w-3 border-(--border) bg-(--surface)"
              />
              Auto
            </label>
            <button
              onClick={onRefresh}
              className="inline-flex items-center gap-2 border border-(--border) bg-(--bg) px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-(--fg) hover:bg-(--fg)/5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </header>

        {error && (
          <div className="border border-(--err)/40 bg-(--err)/10 px-4 py-3 text-sm text-(--err)">
            {error}
          </div>
        )}

        {data && (
          <>
            {visibleAlerts.length > 0 && <AlertStrip alerts={visibleAlerts} />}

            <SystemOverview data={data} history={history} status={topStatus} />
            <GpuTelemetry data={data} history={history} />

            <div className="space-y-5">
              <Section title="Disks">
                <div className="border border-(--border)">
                  {data.disks.map((disk) => (
                    <DiskRow key={disk.path} disk={disk} />
                  ))}
                </div>
              </Section>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
                <Section title="Sensors">
                  <Sensors data={data} />
                </Section>

                <Section title="Services">
                  <ServiceGrid
                    services={data.services}
                    runtimeSummary={statusData.runtimeSummary}
                    knownBackendIds={knownBackendIds(statusData)}
                    activeBackend={statusData.currentProcess?.backend}
                  />
                </Section>
              </div>

              <Section title="Containers">
                <ContainersTable data={data} />
              </Section>
            </div>
          </>
        )}
      </div>
    </div>
  );
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
