import { describe, expect, it } from "bun:test";
import type { LinuxDashboardSnapshot } from "./linux-dashboard-types";
import { LinuxDashboardTelemetry } from "./linux-dashboard-telemetry";

const snapshot = (index: number): LinuxDashboardSnapshot => ({
  collected_at: new Date(1_800_000_000_000 + index * 1_000).toISOString(),
  host: {
    hostname: "test-host",
    platform: "linux",
    kernel: "test",
    arch: "x64",
    uptime_seconds: index,
    load_average: [0, 0, 0],
    cpu_cores: 1,
    cpu_model: "Test CPU",
    cpu_physical_cores: 1,
    cpu_threads: 1,
    target: "controller-host",
  },
  cpu: {
    usage_percent: index,
    cores: 1,
    load_percent_1m: index,
    power_draw_watts: null,
  },
  memory: {
    total_bytes: 1,
    available_bytes: 1,
    used_bytes: 0,
    used_percent: 0,
    swap_total_bytes: 0,
    swap_used_bytes: 0,
  },
  gpus: [],
  disks: [],
  fans: [],
  thermals: [],
  services: [],
  containers: [],
  docker_error: null,
  alerts: [],
});

describe("linux dashboard telemetry", () => {
  it("shares one collection loop across subscribers", async () => {
    let collections = 0;
    const telemetry = new LinuxDashboardTelemetry(async () => {
      collections += 1;
      return snapshot(collections);
    }, { intervalMs: 10 });
    const abort = new AbortController();
    const first = telemetry.subscribe(abort.signal);
    const second = telemetry.subscribe(abort.signal);

    const [firstEvent, secondEvent] = await Promise.all([
      first.next(),
      second.next(),
    ]);
    abort.abort();
    await first.return(undefined);
    await second.return(undefined);

    expect(firstEvent.value?.type).toBe("snapshot");
    expect(secondEvent.value?.type).toBe("snapshot");
    expect(collections).toBe(1);
  });
});
