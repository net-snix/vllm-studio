import type { LinuxDashboardGpu, LinuxDashboardHealth, LinuxDashboardSnapshot } from "@/lib/types";
import { formatBytes, formatPercent, formatTemp } from "./dashboard-format";
import type { DashboardHistoryPoint, DashboardUsageSample } from "./dashboard-history";
import { getCpuUsageSamples, getGpuUsageSamples } from "./dashboard-history";
import { Meter, Section } from "./dashboard-system-sections";

const CHART_WIDTH = 360;
const CHART_HEIGHT = 96;
const CHART_PAD = 6;
const CHART_WINDOW_MS = 30 * 60 * 1000;
const COMPACT_CHART_WINDOW_MS = 10 * 60 * 1000;

type ChartPoint = {
  x: number;
  y: number;
};

type ChartScale = "percent" | "active";

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

const latestSampleTime = (samples: DashboardUsageSample[]): number | null => {
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const time = samples[index]?.time;
    if (typeof time === "number" && Number.isFinite(time)) return time;
  }
  return null;
};

const samplesInWindow = (
  samples: DashboardUsageSample[],
  windowMs: number,
): DashboardUsageSample[] => {
  const end = latestSampleTime(samples);
  if (end == null) return [];
  const start = end - windowMs;
  return samples.filter((sample) => sample.time >= start && sample.time <= end);
};

const chartScaleMax = (samples: DashboardUsageSample[], scale: ChartScale): number => {
  if (scale === "percent") return 100;
  const values = samples
    .map((sample) => sample.value)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const peak = values.length > 0 ? Math.max(...values) : 0;
  if (peak <= 10) return 10;
  if (peak <= 25) return 25;
  if (peak <= 50) return 50;
  return 100;
};

const toChartPoints = (
  samples: DashboardUsageSample[],
  scaleMax: number,
  windowMs: number,
): ChartPoint[] => {
  const visibleSamples = samples.flatMap((sample): Array<{ time: number; value: number }> => {
    if (
      typeof sample.value !== "number" ||
      !Number.isFinite(sample.value) ||
      !Number.isFinite(sample.time)
    ) {
      return [];
    }
    return [{ time: sample.time, value: sample.value }];
  });
  const first = visibleSamples[0];
  const last = visibleSamples.at(-1);
  if (!first || !last) return [];
  const elapsed = last.time - first.time;
  const start = elapsed >= windowMs ? last.time - windowMs : first.time;
  const end = start + windowMs;
  const timeSpan = Math.max(end - start, 1);

  return visibleSamples.flatMap((sample): ChartPoint[] => {
    const value = sample.value;
    const x = CHART_PAD + ((sample.time - start) / timeSpan) * (CHART_WIDTH - CHART_PAD * 2);
    const y =
      CHART_PAD +
      ((scaleMax - Math.min(scaleMax, Math.max(0, value))) / scaleMax) *
        (CHART_HEIGHT - CHART_PAD * 2);
    return [{ x, y }];
  });
};

const buildLinePath = (points: ChartPoint[]): string => {
  if (points.length < 2) return "";
  const [first, ...rest] = points;
  return rest.reduce((path, point) => `${path} L ${point.x} ${point.y}`, `M ${first.x} ${first.y}`);
};

function UsageLineChart({
  samples,
  stroke = "var(--fg)",
  muted = false,
  scale = "percent",
  windowMs = CHART_WINDOW_MS,
}: {
  samples: DashboardUsageSample[];
  stroke?: string;
  muted?: boolean;
  scale?: ChartScale;
  windowMs?: number;
}) {
  const visibleSamples = samplesInWindow(samples, windowMs);
  const scaleMax = chartScaleMax(visibleSamples, scale);
  const points = toChartPoints(visibleSamples, scaleMax, windowMs);
  const linePath = buildLinePath(points);

  return (
    <svg
      role="img"
      aria-label="Usage history graph"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      className="h-full min-h-24 w-full overflow-visible"
      preserveAspectRatio="none"
    >
      {[25, 50, 75].map((mark) => {
        const value = (mark / 100) * scaleMax;
        const y = CHART_PAD + ((scaleMax - value) / scaleMax) * (CHART_HEIGHT - CHART_PAD * 2);
        return (
          <line
            key={mark}
            x1={0}
            x2={CHART_WIDTH}
            y1={y}
            y2={y}
            stroke="var(--border)"
            strokeOpacity="0.35"
            strokeWidth="1"
          />
        );
      })}
      {linePath ? (
        <path
          d={linePath}
          fill="none"
          stroke={stroke}
          strokeLinecap="square"
          strokeLinejoin="miter"
          strokeOpacity={muted ? 0.34 : 0.78}
          strokeWidth={muted ? 1.4 : 2.1}
          vectorEffect="non-scaling-stroke"
        />
      ) : (
        <text x="50%" y="50%" textAnchor="middle" className="fill-(--dim) text-[10px]">
          collecting samples
        </text>
      )}
    </svg>
  );
}

export function SystemOverview({
  data,
  history,
}: {
  data: LinuxDashboardSnapshot;
  history: DashboardHistoryPoint[];
  status: LinuxDashboardHealth;
}) {
  const cpuSamples = getCpuUsageSamples(history);
  const cpuCurrent =
    latestNumber(cpuSamples.map((sample) => sample.value)) ??
    data.cpu.usage_percent ??
    data.cpu.load_percent_1m;
  const memorySamples = history.map((point) => ({
    time: point.time,
    value: point.memory_used_percent,
  }));

  return (
    <Section title="Host telemetry" meta="last 10 minutes">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <TrendPanel
          title="CPU usage"
          value={formatPercent(cpuCurrent)}
          detail={`${formatCpuTopology(data)}  load ${data.host.load_average.join(" / ")}`}
          size="large"
        >
          <UsageLineChart samples={cpuSamples} scale="active" windowMs={COMPACT_CHART_WINDOW_MS} />
        </TrendPanel>
        <TrendPanel
          title="Memory"
          value={formatPercent(data.memory.used_percent)}
          detail={`${formatBytes(data.memory.used_bytes)} / ${formatBytes(data.memory.total_bytes)}`}
          size="large"
        >
          <UsageLineChart
            samples={memorySamples}
            stroke="var(--dim)"
            muted
            windowMs={COMPACT_CHART_WINDOW_MS}
          />
        </TrendPanel>
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
  const totalPower = sumFinite(sortedGpus.map((gpu) => gpu.power_draw_watts));
  const totalPowerLimit = sumFinite(sortedGpus.map((gpu) => gpu.power_limit_watts));
  const avgUtil =
    sortedGpus.length > 0
      ? sortedGpus.reduce((sum, gpu) => sum + (gpu.utilization_percent ?? 0), 0) / sortedGpus.length
      : null;
  const maxTemp = maxNumber(sortedGpus.map((gpu) => gpu.temperature_c));
  const memPct = totalCap > 0 ? (totalUsed / totalCap) * 100 : null;

  return (
    <Section
      title={`GPUs ${sortedGpus.length}`}
      meta={`${formatGpuGb(totalUsed)}/${formatGpuGb(totalCap)}`}
    >
      {sortedGpus.length > 0 ? (
        <div className="space-y-3.5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10.5px] tabular-nums">
            <div className="flex min-w-[16rem] flex-1 items-center gap-3">
              <div className="h-[3px] min-w-24 flex-1 overflow-hidden bg-(--dim)/15">
                <div className="h-full bg-(--fg)/55" style={{ width: `${memPct ?? 0}%` }} />
              </div>
              <span className="text-(--fg)/85">
                {formatGpuGb(totalUsed)}
                <span className="text-(--dim)/60">/{formatGpuGb(totalCap)}</span>
              </span>
            </div>
            <Aggregate label="util" value={formatPercent(avgUtil)} />
            <Aggregate label="temp" value={formatTemp(maxTemp)} />
            <Aggregate label="pwr" value={formatGpuPower(totalPower, totalPowerLimit)} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {sortedGpus.map((gpu) => (
              <GpuGraph key={`${gpu.index}-${gpu.uuid ?? gpu.name}`} gpu={gpu} history={history} />
            ))}
          </div>

          <GpuListTable gpus={sortedGpus} />
        </div>
      ) : (
        <div className="font-mono text-[11px] text-(--dim)/65">No GPU telemetry available.</div>
      )}
    </Section>
  );
}

function TrendPanel({
  title,
  value,
  detail,
  children,
  size = "normal",
}: {
  title: string;
  value: string;
  detail: string;
  children: React.ReactNode;
  size?: "normal" | "large";
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-(--dim)/70">
            {title}
          </div>
          <div className="mt-1 truncate font-mono text-[11px] text-(--dim)/55">{detail}</div>
        </div>
        <div className="font-mono text-[12px] tabular-nums text-(--fg)/82">{value}</div>
      </div>
      <div className={size === "large" ? "h-36 sm:h-40" : "h-24 sm:h-28"}>{children}</div>
    </div>
  );
}

function GpuGraph({ gpu, history }: { gpu: LinuxDashboardGpu; history: DashboardHistoryPoint[] }) {
  const samples = getGpuUsageSamples(history, gpu);
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-3 font-mono">
        <div className="min-w-0">
          <div className="text-[9.5px] uppercase tracking-[0.18em] text-(--dim)/70">
            G{gpu.index}
          </div>
          <div className="mt-1 truncate text-[11px] text-(--dim)/60" title={gpu.name}>
            {gpu.name}
          </div>
        </div>
        <div className="text-[12px] tabular-nums text-(--fg)/82">
          {formatPercent(gpu.utilization_percent)}
        </div>
      </div>
      <div className="h-28 sm:h-32">
        <UsageLineChart samples={samples} scale="active" windowMs={COMPACT_CHART_WINDOW_MS} />
      </div>
    </div>
  );
}

function GpuListTable({ gpus }: { gpus: LinuxDashboardGpu[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] table-fixed font-mono text-[11px]">
        <colgroup>
          <col className="w-[38%]" />
          <col className="w-[30%]" />
          <col className="w-[8%]" />
          <col className="w-[8%]" />
          <col className="w-[7%]" />
          <col className="w-[9%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-(--border)/35 uppercase tracking-[0.16em] text-(--dim)/55">
            {([
              ["GPU", "pr-6 text-left"],
              ["VRAM", "px-6 text-left"],
              ["Util", "px-4 text-right"],
              ["Temp", "px-4 text-right"],
              ["Fan", "px-4 text-right"],
              ["Power", "pl-4 text-right"],
            ] as const).map(([heading, alignClass]) => (
              <th key={heading} className={`py-2 font-medium ${alignClass}`}>
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

function GpuMemoryRow({ gpu }: { gpu: LinuxDashboardGpu }) {
  return (
    <tr className="border-b border-(--border)/25 last:border-b-0">
      <td className="py-1.5 pr-6 text-(--fg)/82" title={gpu.name}>
        <span className="block truncate">
          G{gpu.index} <span className="text-(--dim)/55">{gpu.name}</span>
        </span>
      </td>
      <td className="py-1.5 px-6">
        <div className="grid grid-cols-[minmax(6rem,1fr)_4.75rem] items-center gap-4">
          <div className="h-[2px] bg-(--dim)/15">
            <div
              className="h-full bg-(--fg)/45"
              style={{ width: `${gpu.memory_used_percent ?? 0}%` }}
            />
          </div>
          <span className="whitespace-nowrap text-right tabular-nums text-(--fg)/78">
            {formatGpuGb(gpu.memory_used_bytes)}
            <span className="text-(--dim)/55">/{formatGpuGb(gpu.memory_total_bytes)}</span>
          </span>
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-(--dim)/70">
        {formatPercent(gpu.utilization_percent)}
      </td>
      <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-(--dim)/70">
        {formatTemp(gpu.temperature_c)}
      </td>
      <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-(--dim)/70">
        {formatPercent(gpu.fan_percent)}
      </td>
      <td className="whitespace-nowrap py-1.5 pl-4 text-right tabular-nums text-(--dim)/70">
        {formatGpuPower(gpu.power_draw_watts, gpu.power_limit_watts)}
      </td>
    </tr>
  );
}

function Aggregate({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-[9px] uppercase tracking-[0.14em] text-(--dim)/55">{label}</span>
      <span className="text-(--fg)/85">{value}</span>
    </span>
  );
}

export function formatGpuGb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0G";
  const gb = bytes / 1024 ** 3;
  return `${gb >= 10 ? gb.toFixed(0) : gb.toFixed(1)}G`;
}

export function formatGpuPower(
  drawWatts: number | null | undefined,
  limitWatts: number | null | undefined,
): string {
  const current =
    typeof drawWatts === "number" && Number.isFinite(drawWatts) ? Math.round(drawWatts) : null;
  if (typeof limitWatts !== "number" || !Number.isFinite(limitWatts) || limitWatts <= 0) {
    return current == null ? "n/a" : `${current}W`;
  }
  const limit = Math.round(limitWatts);
  return current == null ? `n/a/${limit}W` : `${current}/${limit}W`;
}

export function formatCpuTopology(data: LinuxDashboardSnapshot): string {
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
