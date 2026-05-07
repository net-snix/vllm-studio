import type { LinuxDashboardGpu, LinuxDashboardHealth, LinuxDashboardSnapshot } from "@/lib/types";
import { formatBytes, formatPercent, formatTemp } from "./dashboard-format";
import type { DashboardHistoryPoint, DashboardUsageSample } from "./dashboard-history";
import { getCpuUsageSamples, getGpuUsageSamples } from "./dashboard-history";
import { Meter, Section } from "./dashboard-system-sections";

const CHART_WIDTH = 360;
const CHART_HEIGHT = 96;
const CHART_PAD = 6;
const CHART_WINDOW_MS = 30 * 60 * 1000;

type ChartPoint = {
  x: number;
  y: number;
};

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
  if (points.length < 2) return "";
  const [first, ...rest] = points;
  return rest.reduce((path, point) => `${path} L ${point.x} ${point.y}`, `M ${first.x} ${first.y}`);
};

function UsageLineChart({
  samples,
  stroke = "var(--fg)",
  muted = false,
}: {
  samples: DashboardUsageSample[];
  stroke?: string;
  muted?: boolean;
}) {
  const points = toChartPoints(samplesInWindow(samples));
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
        const y = CHART_PAD + ((100 - mark) / 100) * (CHART_HEIGHT - CHART_PAD * 2);
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
    <Section title="Host telemetry" meta="last 30 minutes">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(21rem,0.65fr)]">
        <TrendPanel
          title="CPU usage"
          value={formatPercent(cpuCurrent)}
          detail={`${formatCpuTopology(data)}  load ${data.host.load_average.join(" / ")}`}
        >
          <UsageLineChart samples={cpuSamples} />
        </TrendPanel>
        <TrendPanel
          title="Memory"
          value={formatPercent(data.memory.used_percent)}
          detail={`${formatBytes(data.memory.used_bytes)} / ${formatBytes(data.memory.total_bytes)}`}
        >
          <UsageLineChart samples={memorySamples} stroke="var(--dim)" muted />
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
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-7 gap-y-2 font-mono text-[11px] tabular-nums">
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

          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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
}: {
  title: string;
  value: string;
  detail: string;
  children: React.ReactNode;
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
      <div className="h-32">{children}</div>
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
      <div className="h-28">
        <UsageLineChart samples={samples} />
      </div>
    </div>
  );
}

function GpuListTable({ gpus }: { gpus: LinuxDashboardGpu[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] font-mono text-[11px]">
        <thead>
          <tr className="border-b border-(--border)/35 uppercase tracking-[0.16em] text-(--dim)/55">
            {["GPU", "VRAM", "Util", "Temp", "Fan", "Power"].map((heading, index) => (
              <th
                key={heading}
                className={`py-2 font-medium ${index === 5 ? "text-right" : "text-left"}`}
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

function GpuMemoryRow({ gpu }: { gpu: LinuxDashboardGpu }) {
  return (
    <tr className="border-b border-(--border)/25 last:border-b-0">
      <td className="max-w-[18rem] py-1.5 text-(--fg)/82" title={gpu.name}>
        <span className="block truncate">
          G{gpu.index} <span className="text-(--dim)/55">{gpu.name}</span>
        </span>
      </td>
      <td className="w-[14rem] py-1.5">
        <div className="flex items-center gap-3">
          <div className="h-[2px] min-w-20 flex-1 bg-(--dim)/15">
            <div
              className="h-full bg-(--fg)/45"
              style={{ width: `${gpu.memory_used_percent ?? 0}%` }}
            />
          </div>
          <span className="whitespace-nowrap tabular-nums text-(--fg)/78">
            {formatGpuGb(gpu.memory_used_bytes)}
            <span className="text-(--dim)/55">/{formatGpuGb(gpu.memory_total_bytes)}</span>
          </span>
        </div>
      </td>
      <td className="whitespace-nowrap py-1.5 tabular-nums text-(--dim)/70">
        {formatPercent(gpu.utilization_percent)}
      </td>
      <td className="whitespace-nowrap py-1.5 tabular-nums text-(--dim)/70">
        {formatTemp(gpu.temperature_c)}
      </td>
      <td className="whitespace-nowrap py-1.5 tabular-nums text-(--dim)/70">
        {formatPercent(gpu.fan_percent)}
      </td>
      <td className="whitespace-nowrap py-1.5 text-right tabular-nums text-(--dim)/70">
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
