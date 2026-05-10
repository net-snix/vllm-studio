export type LinuxDashboardHealth = "ok" | "warning" | "critical" | "unknown";
export type LinuxDashboardAlertSeverity = "info" | "warning" | "critical";

export interface LinuxDashboardAlert {
  severity: LinuxDashboardAlertSeverity;
  source: string;
  message: string;
}

export interface LinuxDashboardGpu {
  index: number;
  name: string;
  uuid: string | null;
  pci_bus_id: string | null;
  utilization_percent: number | null;
  memory_total_bytes: number;
  memory_used_bytes: number;
  memory_used_percent: number | null;
  temperature_c: number | null;
  memory_temperature_c: number | null;
  fan_percent: number | null;
  power_draw_watts: number | null;
  power_limit_watts: number | null;
  status: LinuxDashboardHealth;
}

export interface LinuxDashboardDisk {
  path: string;
  label: string;
  mounted: boolean;
  device: string | null;
  device_model: string | null;
  device_size: string | null;
  filesystem: string | null;
  mountpoint: string | null;
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  used_percent: number | null;
  status: LinuxDashboardHealth;
}

export interface LinuxDashboardService {
  id: string;
  name: string;
  port: number;
  status: "running" | "stopped";
  description: string;
}

export interface LinuxDashboardContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string;
}

export interface LinuxDashboardThermal {
  chip: string;
  label: string;
  value_c: number;
}

export interface LinuxDashboardFan {
  chip: string;
  label: string;
  rpm: number;
}

export interface LinuxDashboardSnapshot {
  collected_at: string;
  host: {
    hostname: string;
    platform: string;
    kernel: string;
    arch: string;
    uptime_seconds: number;
    load_average: [number, number, number];
    cpu_cores: number;
    cpu_model: string | null;
    cpu_physical_cores: number;
    cpu_threads: number;
    target: "controller-host";
  };
  cpu: {
    usage_percent: number | null;
    cores: number;
    load_percent_1m: number | null;
    power_draw_watts: number | null;
  };
  memory: {
    total_bytes: number;
    available_bytes: number;
    used_bytes: number;
    used_percent: number;
    swap_total_bytes: number;
    swap_used_bytes: number;
  };
  gpus: LinuxDashboardGpu[];
  disks: LinuxDashboardDisk[];
  fans: LinuxDashboardFan[];
  thermals: LinuxDashboardThermal[];
  services: LinuxDashboardService[];
  containers: LinuxDashboardContainer[];
  docker_error: string | null;
  alerts: LinuxDashboardAlert[];
}
