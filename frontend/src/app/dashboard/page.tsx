"use client";

import { useCallback, useEffect, useState } from "react";
import { useDashboardData } from "@/components/dashboard/use-dashboard-data";
import api from "@/lib/api";
import type { LinuxDashboardSnapshot } from "@/lib/types";
import {
  appendDashboardHistory,
  loadStoredDashboardHistory,
  storeDashboardHistory,
  type DashboardHistoryPoint,
} from "./dashboard-history";
import { LinuxDashboardView } from "./dashboard-view";

const POLL_MS = 5_000;

export default function LinuxDashboardPage() {
  const statusData = useDashboardData();
  const [data, setData] = useState<LinuxDashboardSnapshot | null>(null);
  const [history, setHistory] = useState<DashboardHistoryPoint[]>(loadStoredDashboardHistory);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async (mode: "initial" | "refresh" = "refresh") => {
    try {
      if (mode === "initial") setLoading(true);
      setRefreshing(true);
      setError(null);
      const next = await api.getLinuxDashboard({ timeout: 12_000, retries: 0 });
      setData(next);
      setHistory((previous) => {
        const updated = appendDashboardHistory(previous, next);
        storeDashboardHistory(updated);
        return updated;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [autoRefresh, load]);

  return (
    <LinuxDashboardView
      data={data}
      history={history}
      statusData={statusData}
      loading={loading}
      refreshing={refreshing}
      error={error}
      autoRefresh={autoRefresh}
      onAutoRefreshChange={setAutoRefresh}
      onRefresh={() => void load()}
    />
  );
}
