import type { LinuxDashboardGpu, LinuxDashboardHealth, LinuxDashboardSnapshot } from "@/lib/types";
import {
  formatBytes,
  formatPercent,
  formatTemp,
  formatUptime,
  healthClasses,
} from "./dashboard-format";
import type { DashboardHistoryPoint, DashboardUsageSample } from "./dashboard-history";
import { getCpuUsageSamples, getCpuUsageSeries, getGpuUsageSamples } from "./dashboard-history";
import { Meter, Section } from "./dashboard-system-sections";

const CHART_WIDTH = 280;
const CHART_HEIGHT = 92;
const CHART_PAD = 8;
const CHART_WINDOW_MS = 3 * 60 * 1000;
const GPU_MEMORY_GRAY = "color-mix(in srgb, var(--fg) 55%, transparent)";

const clampPercent = (value: number): number => Math.max(0, Math.min(100, value));

const latestNumber = (values: Array<number | null | undefined>): number | null => {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
};

const maxNumber = (values: Array<number | null | undefined>): number | null => {
  const valid = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  return valid.length > 0 ? Math.max(...valid) : null;
};

const formatRange = (history: DashboardHistoryPoint[]): string => {
  if (history.length < 2) return "collecting";
  const first = history[0];
  const last = history.at(-1);
  if (!first || !last) return "collecting";
  const format = (time: number): string =>
    new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${format(first.time)} - ${format(last.time)}`;
};

type ChartPoint = {
  x: number;
  y: number;
};

const latestSampleTime = (samples: DashboardUsageSample[]): number | null => {
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const time = samples[index]?.time;
    if (typeof time === "number" && Number.isFinite(time)) return time;
  }
  return null;
};

const samplesInWindow = (samples: DashboardUsageSample[]): DashboardUsageSample[] => {
  const end = latestSampleTime(samples);
  if (end == null) return [];
  const start = end - CHART_WINDOW_MS;
  return samples.filter((sample) => sample.time >= start && sample.time <= end);
};

const toChartPoints = (samples: DashboardUsageSample[]): ChartPoint[] => {
  const end = latestSampleTime(samples);
  if (end == null) return [];
  const start = end - CHART_WINDOW_MS;

  return samples.flatMap((sample): ChartPoint[] => {
    const value = sample.value;
    if (typeof value !== "number" || !Number.isFinite(value)) return [];
    if (!Number.isFinite(sample.time) || sample.time < start || sample.time > end) return [];
    const x = CHART_PAD + ((sample.time - start) / CHART_WINDOW_MS) * (CHART_WIDTH - CHART_PAD * 2);
    const y = CHART_PAD + ((100 - clampPercent(value)) / 100) * (CHART_HEIGHT - CHART_PAD * 2);
    return [{ x, y }];
  });
};

const buildLinePath = (points: ChartPoint[]): string => {
  if (points.length === 0) return "";
  if (points.length === 1) return "";
  const [first, ...rest] = points;
  return rest.reduce((path, point, index) => {
    const previous = points[index];
    return `${path} L ${point.x} ${previous.y} L ${point.x} ${point.y}`;
  }, `M ${first.x} ${first.y}`);
};

function UsageLineChart({
  samples,
  accent,
  className = "h-24 w-full overflow-visible",
}: {
  samples: DashboardUsageSample[];
  accent: string;
  className?: string;
}) {
  const points = toChartPoints(samples);
  const linePath = buildLinePath(points);
  const bottom = CHART_HEIGHT - CHART_PAD;
  const areaPath =
    points.length > 1
      ? `${linePath} L ${points.at(-1)?.x ?? CHART_PAD} ${bottom} L ${points[0].x} ${bottom} Z`
      : "";

  return (
    <svg
      role="img"
      aria-label="Usage history graph"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      className={className}
      preserveAspectRatio="none"
    >
      {[0, 25, 50, 75, 100].map((mark) => {
        const y = CHART_PAD + ((100 - mark) / 100) * (CHART_HEIGHT - CHART_PAD * 2);
        return (
          <line
            key={mark}
            x1={CHART_PAD}
            x2={CHART_WIDTH - CHART_PAD}
            y1={y}
            y2={y}
            stroke="var(--border)"
            strokeDasharray={mark === 0 ? undefined : "3 5"}
            strokeWidth="1"
          />
        );
      })}
      {areaPath ? <path d={areaPath} fill={accent} opacity="0.12" /> : null}
      {points.length === 1 ? (
        <circle cx={points[0].x} cy={points[0].y} r="1.4" fill={accent} />
      ) : linePath ? (
        <path
          d={linePath}
          fill="none"
          stroke={accent}
          strokeLinecap="square"
          strokeLinejoin="miter"
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
        />
      ) : (
        <text x="50%" y="50%" textAnchor="middle" className="fill-(--dim) text-[10px]">
          waiting for samples
        </text>
      )}
    </svg>
  );
}

function UsageGraphCard({
  title,
  subtitle,
  samples,
  current,
  status = "unknown",
  accent,
  children,
  frame = true,
  stretchChart = false,
  showStats = true,
}: {
  title: string;
  subtitle: string;
  samples: DashboardUsageSample[];
  current: number | null;
  status?: LinuxDashboardHealth;
  accent: string;
  children?: React.ReactNode;
  frame?: boolean;
  stretchChart?: boolean;
  showStats?: boolean;
}) {
  const visibleSamples = samplesInWindow(samples);
  const visibleValues = visibleSamples.map((sample) => sample.value);
  const peak = maxNumber(visibleValues);

  return (
    <div
      className={`min-w-0 overflow-hidden ${stretchChart ? "flex h-full flex-col" : ""} ${
        frame ? "border border-(--border) bg-(--bg) p-3" : "p-0"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-mono text-sm text-(--fg)">{title}</div>
          <div className="mt-1 truncate font-mono text-[11px] text-(--dim)">{subtitle}</div>
        </div>
        <span
          className={`shrink-0 border px-2 py-1 font-mono text-[11px] ${healthClasses[status]}`}
        >
          {formatPercent(current)}
        </span>
      </div>
      <div className={stretchChart ? "mt-3 min-h-40 flex-1" : "mt-3"}>
        <UsageLineChart
          samples={visibleSamples}
          accent={accent}
          className={stretchChart ? "h-full min-h-40 w-full overflow-visible" : undefined}
        />
      </div>
      {showStats && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <TinyMetric label="Now" value={formatPercent(current)} />
          <TinyMetric label="Peak" value={formatPercent(peak)} />
          <TinyMetric label="Samples" value={String(visibleSamples.length)} />
        </div>
      )}
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

function CpuUsageGraph({
  data,
  history,
}: {
  data: LinuxDashboardSnapshot;
  history: DashboardHistoryPoint[];
}) {
  const samples = getCpuUsageSamples(history);
  const visibleValues = samplesInWindow(samples).map((sample) => sample.value);
  const current = latestNumber(visibleValues) ?? data.cpu.usage_percent ?? data.cpu.load_percent_1m;
  const status = (current ?? 0) >= 92 ? "critical" : (current ?? 0) >= 80 ? "warning" : "ok";

  return (
    <UsageGraphCard
      title="CPU Usage"
      subtitle={`${formatCpuTopology(data)} / load ${data.host.load_average.join(" / ")}`}
      samples={samples}
      current={current}
      status={status}
      accent="var(--hl1)"
      stretchChart
      showStats={false}
    />
  );
}

function GpuUsageGraph({
  gpu,
  history,
  compact = false,
  frame = true,
}: {
  gpu: LinuxDashboardGpu;
  history: DashboardHistoryPoint[];
  compact?: boolean;
  frame?: boolean;
}) {
  const samples = getGpuUsageSamples(history, gpu);
  const visibleValues = samplesInWindow(samples).map((sample) => sample.value);
  const current = latestNumber(visibleValues) ?? gpu.utilization_percent;

  return (
    <UsageGraphCard
      title={`GPU ${gpu.index}`}
      subtitle={gpu.name}
      samples={samples}
      current={current}
      status={gpu.status}
      accent={GPU_MEMORY_GRAY}
      frame={frame}
      showStats={false}
    >
      {!compact && (
        <div className="space-y-3">
          <MetricLine
            label="VRAM"
            value={`${formatBytes(gpu.memory_used_bytes)} / ${formatBytes(gpu.memory_total_bytes)}`}
          >
            <Meter value={gpu.memory_used_percent} status={gpu.status} />
          </MetricLine>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <TinyMetric label="Temp" value={formatTemp(gpu.temperature_c)} />
            <TinyMetric label="Fan" value={formatPercent(gpu.fan_percent)} />
            <TinyMetric
              label="Power"
              value={formatGpuPower(gpu.power_draw_watts, gpu.power_limit_watts)}
            />
          </div>
        </div>
      )}
    </UsageGraphCard>
  );
}

function MetricLine({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between gap-3 text-xs">
        <span className="text-(--dim)">{label}</span>
        <span className="font-mono tabular-nums">{value}</span>
      </div>
      {children}
    </div>
  );
}

function TinyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-(--border) bg-(--surface) px-2 py-2">
      <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-(--dim)">{label}</div>
      <div className="mt-1 truncate font-mono text-xs tabular-nums">{value}</div>
    </div>
  );
}

export function SystemOverview({
  data,
  history,
  status,
}: {
  data: LinuxDashboardSnapshot;
  history: DashboardHistoryPoint[];
  status: LinuxDashboardHealth;
}) {
  const sampleRange = formatRange(history);
  const cpuValue =
    latestNumber(getCpuUsageSeries(history)) ?? data.cpu.usage_percent ?? data.cpu.load_percent_1m;
  const cpuModel = data.host.cpu_model ?? "Unknown CPU";
  const cpuTopology = formatCpuTopology(data);
  const totalPowerDraw = sumFinite([
    data.cpu.power_draw_watts,
    ...data.gpus.map((gpu) => gpu.power_draw_watts),
  ]);
  const powerDetail =
    data.cpu.power_draw_watts == null
      ? "GPU telemetry only; CPU power unavailable"
      : `CPU ${formatTotalPower(data.cpu.power_draw_watts)} + ${data.gpus.length} GPU${data.gpus.length === 1 ? "" : "s"}`;

  return (
    <Section title={`System / ${sampleRange}`}>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)]">
        <CpuUsageGraph data={data} history={history} />
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
          <OverviewMetric
            label="CPU"
            value={formatPercent(cpuValue)}
            detail={`${cpuModel} / ${cpuTopology}`}
            status={(cpuValue ?? 0) >= 92 ? "critical" : (cpuValue ?? 0) >= 80 ? "warning" : "ok"}
          />
          <OverviewMetric
            label="Power"
            value={formatTotalPower(totalPowerDraw)}
            detail={powerDetail}
            status="ok"
          />
          <OverviewMetric
            label="Memory"
            value={formatPercent(data.memory.used_percent)}
            detail={`${formatBytes(data.memory.used_bytes)} / ${formatBytes(data.memory.total_bytes)}`}
            status={data.memory.used_percent >= 85 ? "warning" : "ok"}
          />
          <OverviewMetric
            label="Uptime"
            value={formatUptime(data.host.uptime_seconds)}
            detail={new Date(data.collected_at).toLocaleTimeString()}
            status={status}
          />
        </div>
      </div>
    </Section>
  );
}

export function GpuTelemetry({
  data,
  history,
}: {
  data: LinuxDashboardSnapshot;
  history: DashboardHistoryPoint[];
}) {
  const sortedGpus = [...data.gpus].sort((a, b) => b.memory_total_bytes - a.memory_total_bytes);
  const totalUsed = sortedGpus.reduce((sum, gpu) => sum + gpu.memory_used_bytes, 0);
  const totalCap = sortedGpus.reduce((sum, gpu) => sum + gpu.memory_total_bytes, 0);

  return (
    <Section
      title={`GPU · ${sortedGpus.length} · ${formatBytes(totalUsed)} / ${formatBytes(totalCap)}`}
    >
      {sortedGpus.length > 0 ? (
        <div className="space-y-3">
          <div className="grid gap-3 xl:grid-cols-2">
            {sortedGpus.map((gpu) => (
              <GpuTelemetryCard
                key={`${gpu.index}-${gpu.uuid ?? gpu.name}`}
                gpu={gpu}
                history={history}
              />
            ))}
          </div>
          <GpuListTable gpus={sortedGpus} />
        </div>
      ) : (
        <div className="flex min-h-48 items-center justify-center border border-dashed border-(--border) bg-(--bg) text-sm text-(--dim)">
          No GPU telemetry available.
        </div>
      )}
    </Section>
  );
}

function OverviewMetric({
  label,
  value,
  detail,
  status,
}: {
  label: string;
  value: string;
  detail?: string;
  status: LinuxDashboardHealth;
}) {
  return (
    <div className="border border-(--border) bg-(--bg) px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-(--dim)">
            {label}
          </div>
          <div className="mt-2 truncate font-mono text-xl tabular-nums text-(--fg)">{value}</div>
          {detail ? (
            <div className="mt-1 truncate font-mono text-[11px] text-(--dim)" title={detail}>
              {detail}
            </div>
          ) : null}
        </div>
        <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 ${statusDotClass(status)}`} />
      </div>
    </div>
  );
}

function GpuTelemetryCard({
  gpu,
  history,
}: {
  gpu: LinuxDashboardGpu;
  history: DashboardHistoryPoint[];
}) {
  return (
    <div className="grid min-w-0 items-stretch gap-3 border border-(--border) bg-(--bg) p-3 md:grid-cols-[8rem_minmax(0,1fr)]">
      <GpuMemoryColumn gpu={gpu} />
      <GpuUsageGraph gpu={gpu} history={history} compact frame={false} />
    </div>
  );
}

function GpuListTable({ gpus }: { gpus: LinuxDashboardGpu[] }) {
  return (
    <div className="overflow-x-auto border border-(--border) bg-(--bg)">
      <table className="w-full min-w-[720px] text-xs">
        <thead>
          <tr className="border-b border-(--border)">
            {["GPU", "Util", "VRAM", "Temp", "Fan", "Power"].map((heading, index) => (
              <th
                key={heading}
                className={`px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-(--dim) ${
                  index === 5 ? "text-right" : "text-left"
                }`}
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {gpus.map((gpu) => (
            <GpuMemoryRow key={`${gpu.index}-${gpu.uuid ?? gpu.name}`} gpu={gpu} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GpuMemoryColumn({ gpu }: { gpu: LinuxDashboardGpu }) {
  const cells = 24;
  const active = Math.min(
    cells,
    Math.max(0, Math.round(((gpu.memory_used_percent ?? 0) / 100) * cells)),
  );

  return (
    <div
      className="flex h-full min-h-44 min-w-0 max-w-[7rem] flex-col overflow-hidden"
      title={gpu.name}
    >
      <div className="mb-1 flex items-center justify-between gap-1 font-mono text-[9px] text-(--dim)">
        <span className="truncate">G{gpu.index}</span>
        <span className="tabular-nums">{formatGpuGb(gpu.memory_total_bytes)}</span>
      </div>
      <div
        className="grid flex-1 gap-px"
        style={{ gridTemplateRows: `repeat(${cells}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: cells }, (_, index) => (
          <div key={index} className={index >= cells - active ? "bg-(--fg)/55" : "bg-(--dim)/15"} />
        ))}
      </div>
      <div className="mt-1 truncate font-mono text-[9px] tabular-nums text-(--dim)">
        {formatGpuGb(gpu.memory_used_bytes)}
      </div>
    </div>
  );
}

function GpuMemoryRow({ gpu }: { gpu: LinuxDashboardGpu }) {
  return (
    <tr className="border-b border-(--border)/40 last:border-b-0">
      <td className="max-w-[12rem] px-3 py-1.5 font-mono text-(--fg)" title={gpu.name}>
        <span className="block truncate">{gpu.name}</span>
      </td>
      <td className="px-3 py-1.5 font-mono tabular-nums text-(--fg)">
        {formatPercent(gpu.utilization_percent)}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 font-mono tabular-nums text-(--dim)">
        {formatGpuGb(gpu.memory_used_bytes)}/{formatGpuGb(gpu.memory_total_bytes)}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 font-mono tabular-nums text-(--dim)">
        {formatTemp(gpu.temperature_c)}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 font-mono tabular-nums text-(--dim)">
        {formatPercent(gpu.fan_percent)}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono tabular-nums text-(--dim)">
        {formatGpuPower(gpu.power_draw_watts, gpu.power_limit_watts)}
      </td>
    </tr>
  );
}

function statusDotClass(status: LinuxDashboardHealth): string {
  if (status === "critical") return "bg-(--err)";
  if (status === "warning") return "bg-(--hl3)";
  if (status === "ok") return "bg-(--fg)";
  return "bg-(--dim)/55";
}

function formatGpuGb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0G";
  const gb = bytes / 1024 ** 3;
  return `${gb >= 10 ? gb.toFixed(0) : gb.toFixed(1)}G`;
}

function formatGpuPower(
  drawWatts: number | null | undefined,
  limitWatts: number | null | undefined,
): string {
  const current =
    typeof drawWatts === "number" && Number.isFinite(drawWatts) ? Math.round(drawWatts) : null;
  if (typeof limitWatts !== "number" || !Number.isFinite(limitWatts) || limitWatts <= 0) {
    return current == null ? "n/a" : `${current}W`;
  }
  const limit = Math.round(limitWatts);
  return current == null ? `n/a/${limit}W` : `${current}W/${limit}W`;
}

function formatTotalPower(watts: number | null | undefined): string {
  return typeof watts === "number" && Number.isFinite(watts) ? `${Math.round(watts)}W` : "n/a";
}

function formatCpuTopology(data: LinuxDashboardSnapshot): string {
  const physicalCores = data.host.cpu_physical_cores || data.cpu.cores;
  const threads = data.host.cpu_threads || data.cpu.cores;
  return `${physicalCores} cores / ${threads} threads`;
}

function sumFinite(values: Array<number | null | undefined>): number | null {
  const total = values.reduce<number>(
    (sum, value) => (typeof value === "number" && Number.isFinite(value) ? sum + value : sum),
    0,
  );
  return total > 0 ? total : null;
}
