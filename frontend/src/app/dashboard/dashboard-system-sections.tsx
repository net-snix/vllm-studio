"use client";

import { Activity, AlertTriangle, Server, Zap } from "lucide-react";
import type {
  LinuxDashboardAlert,
  LinuxDashboardDisk,
  LinuxDashboardHealth,
  LinuxDashboardService,
  LinuxDashboardSnapshot,
} from "@/lib/types";
import { alertClasses, formatBytes, formatPercent, serviceDot } from "./dashboard-format";

type BackendRuntimeSummary = {
  backends: Record<string, { installed: boolean; version?: string | null } | undefined>;
};

export function Meter({
  value,
  status = "ok",
}: {
  value: number | null | undefined;
  status?: LinuxDashboardHealth;
}) {
  const width =
    typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  const color =
    status === "critical" ? "bg-(--err)" : status === "warning" ? "bg-(--hl3)" : "bg-(--fg)/55";
  return (
    <div className="h-2 overflow-hidden bg-(--border)">
      <div className={`h-full ${color}`} style={{ width: `${width}%` }} />
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-(--border) bg-(--surface)">
      <div className="border-b border-(--border) px-3 py-1.5">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-(--dim)">{title}</h2>
      </div>
      <div className="px-3 py-3">{children}</div>
    </section>
  );
}

export function AlertStrip({ alerts }: { alerts: LinuxDashboardAlert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-2 border border-(--border) bg-(--surface) px-3 py-2 font-mono text-[11px] text-(--dim)">
        <Activity className="h-3.5 w-3.5" />
        <span className="uppercase tracking-[0.12em]">checks quiet</span>
      </div>
    );
  }

  return (
    <div className="grid gap-2 md:grid-cols-2">
      {alerts.slice(0, 4).map((alert) => (
        <div
          key={`${alert.source}-${alert.message}`}
          className={`flex items-center gap-2 border px-3 py-2 font-mono text-[11px] ${alertClasses[alert.severity]}`}
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 truncate">{alert.message}</span>
        </div>
      ))}
    </div>
  );
}

const DISK_TITLES: Record<string, string> = {
  root: "System disk",
  models: "Models disk",
  training: "Training disk",
};

function diskSubtitle(disk: LinuxDashboardDisk): string {
  if (!disk.mounted) return "missing";

  const hardware = [disk.device_model, disk.device_size].filter(Boolean).join(" ");
  const device = disk.device ?? "unknown device";
  const mount = disk.mountpoint ?? disk.path;
  const fs = disk.filesystem ?? "unknown fs";
  return [hardware || null, device, fs, `mounted at ${mount}`].filter(Boolean).join(" / ");
}

export function DiskRow({ disk }: { disk: LinuxDashboardDisk }) {
  return (
    <div className="grid gap-3 border-b border-(--border)/60 bg-(--bg) px-3 py-2.5 last:border-b-0 md:grid-cols-[minmax(0,1fr)_8rem_8rem_9rem] md:items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 ${statusDotClass(disk.status)}`} />
          <span className="font-mono text-sm">{DISK_TITLES[disk.label] ?? disk.label}</span>
        </div>
        <div
          className="mt-1 truncate font-mono text-[11px] text-(--dim)"
          title={diskSubtitle(disk)}
        >
          {diskSubtitle(disk)}
        </div>
      </div>
      <div className="font-mono text-xs tabular-nums text-(--fg)">
        {formatBytes(disk.free_bytes)} free
      </div>
      <div className="font-mono text-xs tabular-nums text-(--dim)">
        {formatPercent(disk.used_percent)} used
      </div>
      <Meter value={disk.used_percent} status={disk.status} />
    </div>
  );
}

export function ServiceGrid({
  services,
  runtimeSummary,
  knownBackendIds,
  activeBackend,
}: {
  services: LinuxDashboardService[];
  runtimeSummary?: BackendRuntimeSummary | null;
  knownBackendIds?: string[];
  activeBackend?: string | null;
}) {
  const backends = runtimeSummary
    ? Object.entries(runtimeSummary.backends).flatMap(([id, backend]) =>
        backend ? ([[id, backend]] as const) : [],
      )
    : [];
  const fallbackBackends = backends.length === 0 ? (knownBackendIds ?? []) : [];

  return (
    <div className="grid gap-4">
      <div className="space-y-2">
        <SectionLabel icon={Server} label="Services" />
        <div className="border border-(--border)">
          {services.map((service) => (
            <div
              key={service.id}
              className="flex items-center justify-between gap-3 border-b border-(--border)/60 bg-(--bg) px-3 py-2 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="truncate font-mono text-sm">{service.name}</div>
                <div className="font-mono text-[11px] text-(--dim)">
                  :{service.port} / {service.description}
                </div>
              </div>
              <div className="flex items-center gap-2 font-mono text-xs text-(--dim)">
                <span className={`h-2 w-2 ${serviceDot(service.status)}`} />
                {service.status}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <SectionLabel icon={Zap} label="Backends" />
        <div className="border border-(--border)">
          {backends.length === 0 && fallbackBackends.length === 0 && (
            <div className="bg-(--bg) px-3 py-2 text-sm text-(--dim)">No backend data yet.</div>
          )}
          {backends.map(([id, backend]) => {
            const running = activeBackend === id;
            const installed = backend.installed;
            return (
              <div
                key={id}
                className="flex items-center justify-between gap-3 border-b border-(--border)/60 bg-(--bg) px-3 py-2 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-sm uppercase tracking-[0.08em]">{id}</div>
                  <div className="truncate font-mono text-[11px] text-(--dim)">
                    {backend.version ?? "version unknown"}
                  </div>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs text-(--dim)">
                  <span
                    className={`h-2 w-2 ${
                      running ? "bg-(--fg)/55" : installed ? "bg-(--dim)" : "bg-(--border)"
                    }`}
                  />
                  {running ? "active" : installed ? "installed" : "missing"}
                </div>
              </div>
            );
          })}
          {fallbackBackends.map((id) => {
            const running = activeBackend === id;
            return (
              <div
                key={id}
                className="flex items-center justify-between gap-3 border-b border-(--border)/60 bg-(--bg) px-3 py-2 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-sm uppercase tracking-[0.08em]">{id}</div>
                  <div className="truncate font-mono text-[11px] text-(--dim)">
                    from recipes/status
                  </div>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs text-(--dim)">
                  <span className={`h-2 w-2 ${running ? "bg-(--fg)/55" : "bg-(--dim)"}`} />
                  {running ? "active" : "configured"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ContainersTable({ data }: { data: LinuxDashboardSnapshot }) {
  if (data.docker_error) {
    return <div className="text-sm text-(--dim)">Docker unavailable: {data.docker_error}</div>;
  }
  if (data.containers.length === 0) {
    return <div className="text-sm text-(--dim)">No running containers.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="font-mono text-[10px] uppercase tracking-[0.16em] text-(--dim)">
          <tr className="border-b border-(--border)">
            <th className="py-2 font-medium">Name</th>
            <th className="py-2 font-medium">Image</th>
            <th className="py-2 font-medium">State</th>
            <th className="py-2 font-medium">Ports</th>
          </tr>
        </thead>
        <tbody>
          {data.containers.map((container) => (
            <tr
              key={container.id || container.name}
              className="border-b border-(--border)/60 last:border-b-0"
            >
              <td className="max-w-[12rem] truncate py-2 font-mono">{container.name}</td>
              <td className="max-w-[16rem] truncate py-2 font-mono text-xs text-(--dim)">
                {container.image}
              </td>
              <td className="py-2">{container.state || container.status}</td>
              <td className="max-w-[18rem] truncate py-2 font-mono text-xs text-(--dim)">
                {container.ports || "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Sensors({ data }: { data: LinuxDashboardSnapshot }) {
  const thermals = [...data.thermals].sort((a, b) => b.value_c - a.value_c).slice(0, 8);
  const fans = [...data.fans].sort((a, b) => b.rpm - a.rpm).slice(0, 8);

  if (thermals.length === 0 && fans.length === 0) {
    return <div className="text-sm text-(--dim)">No hwmon fan or thermal readings exposed.</div>;
  }

  return (
    <div className="grid gap-4">
      <SensorGroup
        title="Thermals"
        empty="No thermal sensors exposed."
        rows={thermals.map((thermal, index) => ({
          key: `${thermal.chip}-${thermal.label}-${index}`,
          label: cleanSensorLabel(thermal.chip, thermal.label),
          value: `${Math.round(thermal.value_c)} C`,
          meter: Math.min(100, (thermal.value_c / 95) * 100),
          status: thermal.value_c >= 82 ? "warning" : "ok",
        }))}
      />
      <SensorGroup
        title="Fans"
        empty="No fan RPM sensors exposed."
        rows={fans.map((fan, index) => ({
          key: `${fan.chip}-${fan.label}-${index}`,
          label: cleanSensorLabel(fan.chip, fan.label),
          value: `${Math.round(fan.rpm)} RPM`,
          meter: null,
          status: "ok",
        }))}
      />
    </div>
  );
}

function SensorGroup({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: Array<{
    key: string;
    label: string;
    value: string;
    meter: number | null;
    status: LinuxDashboardHealth;
  }>;
  empty: string;
}) {
  return (
    <div className="space-y-2">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-(--dim)">{title}</div>
      {rows.length === 0 ? (
        <div className="text-sm text-(--dim)">{empty}</div>
      ) : (
        <div className="grid gap-2">
          {rows.map((row) => (
            <div
              key={row.key}
              className="grid gap-2 border border-(--border) bg-(--bg) px-3 py-2 text-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <span
                  className="min-w-0 truncate font-mono text-[11px] text-(--dim)"
                  title={row.label}
                >
                  {row.label}
                </span>
                <span className="font-mono tabular-nums">{row.value}</span>
              </div>
              {row.meter != null && <Meter value={row.meter} status={row.status} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionLabel({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-(--dim)">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
  );
}

function cleanSensorLabel(chip: string, label: string): string {
  const normalizedChip = chip.replace(/_/g, " ");
  const normalizedLabel = label.replace(/_/g, " ");
  return normalizedLabel.toLowerCase().startsWith(normalizedChip.toLowerCase())
    ? normalizedLabel
    : `${normalizedChip} / ${normalizedLabel}`;
}

function statusDotClass(status: LinuxDashboardHealth): string {
  if (status === "critical") return "bg-(--err)";
  if (status === "warning") return "bg-(--hl3)";
  if (status === "ok") return "bg-(--fg)";
  return "bg-(--dim)/55";
}
