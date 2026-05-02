import type { Hono } from "hono";
import type { AppContext } from "../../types/context";
import { collectLinuxDashboardSnapshot } from "./linux-dashboard-collector";

export const registerLinuxDashboardRoutes = (app: Hono, context: AppContext): void => {
  app.get("/linux-dashboard", async (ctx) => {
    const snapshot = await collectLinuxDashboardSnapshot(context);
    return ctx.json(snapshot);
  });
};
