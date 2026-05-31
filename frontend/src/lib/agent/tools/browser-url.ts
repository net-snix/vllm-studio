// Browser URL normalization for the embedded browser tool. Handles file://,
// relative paths under the project cwd, http(s), localhost, and a search-engine
// fallback for free-text input.

const SEARXNG_PORT = "8081";

import { sanitizeLocalFileUrl } from "@/lib/sanitize-embedded-browser-url";
import { DEFAULT_BROWSER_URL } from "./persistence";

function encodeFilePath(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, "/");
  const withLeadingSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return `file://${withLeadingSlash.split("/").map(encodeURIComponent).join("/")}`;
}

function resolveRelativeFilePath(cwd: string, value: string): string {
  const segments = `${cwd.replace(/\/+$/, "")}/${value}`.split("/");
  const resolved: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  return `/${resolved.join("/")}`;
}

function expandHomeFilePath(cwd: string, value: string): string | null {
  const homeMatch = cwd.match(/^(\/Users\/[^/]+|\/home\/[^/]+)(?:\/|$)/);
  if (!homeMatch) return null;
  return `${homeMatch[1]}${value.slice(1)}`;
}

function searchBaseUrl(): string {
  if (typeof window === "undefined") return "http://127.0.0.1:8081";
  const { protocol, hostname } = window.location;
  const safeProtocol = protocol === "https:" ? "https:" : "http:";
  return `${safeProtocol}//${hostname}:${SEARXNG_PORT}`;
}

export function buildSearchUrl(query: string): string {
  const url = new URL("/search", searchBaseUrl());
  url.searchParams.set("q", query);
  return url.toString();
}

export function normalizeBrowserInput(raw: string, cwd: string): string {
  const value = raw.trim();
  if (!value) return DEFAULT_BROWSER_URL;
  if (/^file:\/\//i.test(value)) {
    return sanitizeLocalFileUrl(value) ?? "";
  }
  if (value.startsWith("~/") && cwd) {
    const expanded = expandHomeFilePath(cwd, value);
    if (expanded) return encodeFilePath(expanded);
  }
  if (value.startsWith("/")) return encodeFilePath(value);
  if ((value.startsWith("./") || value.startsWith("../")) && cwd) {
    return encodeFilePath(resolveRelativeFilePath(cwd, value));
  }
  if (/^https?:\/\//i.test(value)) return value;
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?([/?#].*)?$/i.test(value)) {
    return `http://${value}`;
  }
  if (/^[\w.-]+:\d+([/?#].*)?$/.test(value)) {
    return `http://${value}`;
  }
  if (/^[\w-]+(\.[\w-]+)+([/:?#].*)?$/.test(value)) {
    return `https://${value}`;
  }
  if (value.includes("/") && cwd) {
    return encodeFilePath(resolveRelativeFilePath(cwd, value));
  }
  return buildSearchUrl(value);
}
