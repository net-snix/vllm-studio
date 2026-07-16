import { AsyncQueue, delay } from "../../../core/async";
import type { LinuxDashboardSnapshot } from "./linux-dashboard-types";

const DEFAULT_INTERVAL_MS = 1_000;
const SUBSCRIBER_QUEUE_SIZE = 2;

export type LinuxDashboardTelemetryEvent =
  | { type: "snapshot"; snapshot: LinuxDashboardSnapshot }
  | { type: "error"; message: string; timestamp: string };

export type LinuxDashboardTelemetryOptions = {
  intervalMs?: number;
};

type SnapshotCollector = () => Promise<LinuxDashboardSnapshot>;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Long-lived dashboard telemetry publisher shared by all dashboard clients. */
export class LinuxDashboardTelemetry {
  private readonly collectSnapshot: SnapshotCollector;
  private readonly intervalMs: number;
  private readonly subscribers = new Set<
    AsyncQueue<LinuxDashboardTelemetryEvent>
  >();
  private latest: LinuxDashboardSnapshot | null = null;
  private inFlight: Promise<LinuxDashboardSnapshot> | null = null;
  private running = false;

  /**
   * Create a dashboard telemetry publisher.
   * @param collectSnapshot Snapshot collector used by the shared loop.
   * @param options Runtime tuning.
   */
  public constructor(
    collectSnapshot: SnapshotCollector,
    options: LinuxDashboardTelemetryOptions = {},
  ) {
    this.collectSnapshot = collectSnapshot;
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  }

  /** Latest successfully collected snapshot, when one exists. */
  public get latestSnapshot(): LinuxDashboardSnapshot | null {
    return this.latest;
  }

  /**
   * Return a fresh-enough snapshot for one-shot HTTP clients.
   * @returns Latest cached snapshot or a newly collected snapshot.
   */
  public async getSnapshot(): Promise<LinuxDashboardSnapshot> {
    if (this.latest) {
      const ageMs = Date.now() - Date.parse(this.latest.collected_at);
      if (Number.isFinite(ageMs) && ageMs < this.intervalMs * 2) {
        return this.latest;
      }
    }
    return this.collectOnce();
  }

  /**
   * Subscribe to pushed dashboard telemetry events.
   * @param signal Optional cancellation signal from the HTTP request.
   * @returns Async dashboard telemetry event stream.
   */
  public async *subscribe(
    signal?: AbortSignal,
  ): AsyncGenerator<LinuxDashboardTelemetryEvent> {
    const queue = new AsyncQueue<LinuxDashboardTelemetryEvent>(
      SUBSCRIBER_QUEUE_SIZE,
    );
    this.subscribers.add(queue);

    if (this.latest) {
      queue.push({ type: "snapshot", snapshot: this.latest });
    }
    this.start();

    try {
      while (!signal?.aborted) {
        let event: LinuxDashboardTelemetryEvent;
        try {
          event = await queue.shift(signal);
        } catch {
          break;
        }
        yield event;
      }
    } finally {
      queue.close();
      this.subscribers.delete(queue);
      if (this.subscribers.size === 0) {
        this.running = false;
      }
    }
  }

  /** Start the shared collection loop when it is not already running. */
  private start(): void {
    if (this.running) return;
    this.running = true;
    void this.runLoop();
  }

  /** Run one serialized collection loop for all active subscribers. */
  private async runLoop(): Promise<void> {
    while (this.running) {
      const startedAt = Date.now();
      try {
        await this.collectOnce();
      } catch {
        // collectOnce already published the error to active subscribers.
      }
      const elapsedMs = Date.now() - startedAt;
      await delay(Math.max(100, this.intervalMs - elapsedMs));
    }
  }

  /** Collect one snapshot, coalescing concurrent callers. */
  private async collectOnce(): Promise<LinuxDashboardSnapshot> {
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.collectSnapshot()
      .then((snapshot) => {
        this.latest = snapshot;
        this.publish({ type: "snapshot", snapshot });
        return snapshot;
      })
      .catch((error: unknown) => {
        this.publish({
          type: "error",
          message: errorMessage(error),
          timestamp: new Date().toISOString(),
        });
        throw error;
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }

  /**
   * Publish a telemetry event to active subscribers.
   * @param event Telemetry event to enqueue.
   */
  private publish(event: LinuxDashboardTelemetryEvent): void {
    for (const subscriber of this.subscribers) {
      subscriber.push(event);
    }
  }
}
