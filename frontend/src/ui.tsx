"use client";

import type { ReactNode } from "react";
import { Activity, RefreshCw } from "lucide-react";

interface RefreshButtonProps {
  onRefresh: () => void;
  loading?: boolean;
  className?: string;
}

export function RefreshButton({ onRefresh, loading = false, className = "" }: RefreshButtonProps) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={loading}
      className={`rounded-lg p-2 transition-colors hover:bg-(--surface) ${className}`}
    >
      <RefreshCw className={`h-4 w-4 text-(--dim) ${loading ? "animate-spin" : ""}`} />
    </button>
  );
}

interface PageStateOptions {
  loading: boolean;
  data: unknown;
  hasData: boolean;
  error?: string | null;
  onLoad: () => void;
}

export function PageState({ loading, data, hasData, error, onLoad }: PageStateOptions) {
  const isInitialLoading = loading && !hasData;

  if (isInitialLoading) {
    return (
      <div className="flex min-h-50 items-center justify-center bg-(--bg)">
        <Activity className="h-6 w-6 animate-pulse text-(--dim)" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex min-h-50 items-center justify-center bg-(--bg)">
        <div className="text-center">
          <p className="mb-4 text-(--err)">{error}</p>
          <button
            type="button"
            onClick={onLoad}
            className="rounded-lg border border-(--border) bg-(--surface) px-4 py-2 text-(--fg) transition-colors hover:bg-(--surface)"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return null;
}

interface ConfigRowOptions {
  label: string;
  value: string;
  icon?: ReactNode;
  truncate?: boolean;
  accent?: boolean;
}

export function ConfigRow({ label, value, icon, truncate = false, accent = false }: ConfigRowOptions) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 shrink-0 items-center gap-2 text-sm text-(--dim)">
        {icon}
        <span>{label}</span>
      </div>
      <span
        className={`flex-1 text-right font-mono text-xs sm:text-sm ${accent ? "text-(--hl2)" : "text-(--fg)"} ${truncate ? "truncate" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
