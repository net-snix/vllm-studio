import type { Hono } from "hono";
import type { AppContext } from "../../types/context";
import { buildSseHeaders, streamAsyncStrings } from "../../http/sse";
import { collectLinuxDashboardSnapshot } from "./linux-dashboard-collector";
import {
  LinuxDashboardTelemetry,
  type LinuxDashboardTelemetryEvent,
} from "./linux-dashboard-telemetry";
import { scheduleHostShutdown } from "./host-shutdown";

const telemetryByContext = new WeakMap<AppContext, LinuxDashboardTelemetry>();

const getTelemetry = (context: AppContext): LinuxDashboardTelemetry => {
  const existing = telemetryByContext.get(context);
  if (existing) return existing;
  const telemetry = new LinuxDashboardTelemetry(() =>
    collectLinuxDashboardSnapshot(context),
  );
  telemetryByContext.set(context, telemetry);
  return telemetry;
};

const telemetryEventToSse = (event: LinuxDashboardTelemetryEvent): string => {
  if (event.type === "snapshot") {
    return [
      `id: ${Date.parse(event.snapshot.collected_at)}`,
      "event: linux-dashboard",
      `data: ${JSON.stringify(event.snapshot)}`,
      "",
      "",
    ].join("\n");
  }

  return [
    `id: ${Date.now()}`,
    "event: linux-dashboard-error",
    `data: ${JSON.stringify({ message: event.message, timestamp: event.timestamp })}`,
    "",
    "",
  ].join("\n");
};

export const registerLinuxDashboardRoutes = (app: Hono, context: AppContext): void => {
  app.get("/linux-dashboard", async (ctx) => {
    const snapshot = await getTelemetry(context).getSnapshot();
    return ctx.json(snapshot);
  });

  app.get("/linux-dashboard/stream", async (ctx) => {
    const signal = ctx.req.raw.signal;
    const telemetry = getTelemetry(context);
    const stream = streamAsyncStrings(
      (async function* (): AsyncGenerator<string> {
        for await (const event of telemetry.subscribe(signal)) {
          yield telemetryEventToSse(event);
        }
      })(),
    );
    return new Response(stream, {
      headers: buildSseHeaders(),
    });
  });

  app.post("/linux-dashboard/shutdown", (ctx) => {
    const result = scheduleHostShutdown();
    if (!result.success) {
      return ctx.json({ success: false, error: result.error }, { status: 500 });
    }
    context.logger.warn("Host shutdown requested from dashboard");
    return ctx.json({
      success: true,
      message: "Shutdown scheduled",
      command: result.command,
    });
  });
};
