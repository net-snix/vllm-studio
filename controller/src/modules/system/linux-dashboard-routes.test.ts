import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import type { AppContext } from "../../types/context";
import { registerLinuxDashboardRoutes } from "./linux-dashboard-routes";

describe("linux dashboard routes", () => {
  it("returns a host snapshot", async () => {
    const app = new Hono();
    const context = {
      config: {
        inference_port: 8000,
      },
      logger: {
        debug: mock(() => undefined),
        info: mock(() => undefined),
        warn: mock(() => undefined),
        error: mock(() => undefined),
      },
    } as unknown as AppContext;

    registerLinuxDashboardRoutes(app, context);

    const response = await app.request("/linux-dashboard");
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("host");
    expect(body.host).toHaveProperty("hostname");
    expect(body.host).toHaveProperty("cpu_model");
    expect(body.host).toHaveProperty("cpu_physical_cores");
    expect(body.host).toHaveProperty("cpu_threads");
    expect(body).toHaveProperty("cpu");
    expect(body).toHaveProperty("memory");
    expect(Array.isArray(body.disks)).toBe(true);
    expect(body.disks[0]).toHaveProperty("device");
    expect(body.disks[0]).toHaveProperty("device_model");
    expect(Array.isArray(body.services)).toBe(true);
    expect(body.services).toContainEqual(
      expect.objectContaining({
        id: "lact",
        endpoint: "socket",
        status: expect.stringMatching(/^(running|stopped)$/),
      })
    );
    expect(Array.isArray(body.alerts)).toBe(true);
  });

  it("streams dashboard snapshots as SSE", async () => {
    const app = new Hono();
    const context = {
      config: {
        inference_port: 8000,
      },
      logger: {
        debug: mock(() => undefined),
        info: mock(() => undefined),
        warn: mock(() => undefined),
        error: mock(() => undefined),
      },
    } as unknown as AppContext;

    registerLinuxDashboardRoutes(app, context);

    const abort = new AbortController();
    const response = await app.request("/linux-dashboard/stream", {
      signal: abort.signal,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    const chunk = await reader?.read();
    abort.abort();
    await reader?.cancel().catch(() => undefined);

    const text = new TextDecoder().decode(chunk?.value);
    expect(text).toContain("event: linux-dashboard");
    expect(text).toContain('"host"');
  });
});
