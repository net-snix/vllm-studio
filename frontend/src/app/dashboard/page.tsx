"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

const STREAM_RECONNECT_MS = 2_000;

const isLinuxDashboardSnapshot = (
  value: unknown,
): value is LinuxDashboardSnapshot => {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Record<string, unknown>;
  return (
    typeof snapshot["collected_at"] === "string" &&
    typeof snapshot["host"] === "object" &&
    snapshot["host"] !== null &&
    typeof snapshot["cpu"] === "object" &&
    snapshot["cpu"] !== null &&
    typeof snapshot["memory"] === "object" &&
    snapshot["memory"] !== null &&
    Array.isArray(snapshot["gpus"])
  );
};

export default function LinuxDashboardPage() {
  const statusData = useDashboardData();
  const [data, setData] = useState<LinuxDashboardSnapshot | null>(null);
  const [history, setHistory] = useState<DashboardHistoryPoint[]>(loadStoredDashboardHistory);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const hasSnapshotRef = useRef(false);

  const applySnapshot = useCallback((next: LinuxDashboardSnapshot) => {
    hasSnapshotRef.current = true;
    setData(next);
    setHistory((previous) => {
      const updated = appendDashboardHistory(previous, next);
      storeDashboardHistory(updated);
      return updated;
    });
  }, []);

  const load = useCallback(async (mode: "initial" | "refresh" = "refresh") => {
    try {
      if (mode === "initial") setLoading(true);
      setRefreshing(true);
      setError(null);
      const next = await api.getLinuxDashboard({ timeout: 12_000, retries: 0 });
      applySnapshot(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applySnapshot]);

  useEffect(() => {
    if (autoRefresh) return;
    if (!data) void load("initial");
  }, [autoRefresh, data, load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const abort = new AbortController();
    let reconnectId: number | null = null;

    const connect = async (): Promise<void> => {
      try {
        setRefreshing(true);
        setError(null);
        const stream = await api.streamLinuxDashboard({ signal: abort.signal });
        setRefreshing(false);
        for await (const event of stream) {
          if (abort.signal.aborted) break;
          if (event.event === "linux-dashboard") {
            if (isLinuxDashboardSnapshot(event.data)) {
              applySnapshot(event.data);
              setLoading(false);
              setError(null);
            }
            continue;
          }
          if (event.event === "linux-dashboard-error") {
            const message = event.data["message"];
            setError(
              typeof message === "string" ? message : "Dashboard stream failed",
            );
          }
        }
      } catch (err) {
        if (!abort.signal.aborted) {
          setError(err instanceof Error ? err.message : String(err));
          if (!hasSnapshotRef.current) void load("initial");
        }
      } finally {
        setRefreshing(false);
        if (!abort.signal.aborted) {
          reconnectId = window.setTimeout(
            () => void connect(),
            STREAM_RECONNECT_MS,
          );
        }
      }
    };

    void connect();

    return () => {
      if (reconnectId !== null) window.clearTimeout(reconnectId);
      abort.abort();
    };
  }, [applySnapshot, autoRefresh, load]);

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
      onShutdown={async () => {
        await api.shutdownHost();
      }}
    />
  );
}
