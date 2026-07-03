import { lstatSync, readdirSync, readlinkSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";

/** A symlink inside a bind-mounted directory whose target lives outside every mount. */
export interface EscapingSymlink {
  /** Absolute host path of the symlink itself. */
  link: string;
  /** Raw symlink target as stored on disk (may be relative). */
  target: string;
  /** Fully resolved host path, or null when the link is already dangling on the host. */
  resolved: string | null;
}

const isWithin = (path: string, root: string): boolean =>
  path === root || path.startsWith(root.endsWith(sep) ? root : root + sep);

const tryRealpath = (path: string): string | null => {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
};

/**
 * Scan a directory tree for symlinks that resolve outside all of the given
 * mount roots. Docker launches bind-mount only the recipe's model path (and
 * the speculative draft path), so such links dangle inside the container and
 * vLLM fails with misleading errors (e.g. a tokenizer load blamed on
 * ReasoningConfig). Missing or non-directory roots yield no findings — other
 * launch machinery reports those with its own errors.
 *
 * Symlinked directories are reported (when escaping) but never recursed into,
 * so link cycles cannot loop the scan.
 */
export const findEscapingSymlinks = (dir: string, mountRoots: string[]): EscapingSymlink[] => {
  const resolvedRoots = mountRoots
    .map((root) => tryRealpath(root))
    .filter((root): root is string => root !== null);
  const findings: EscapingSymlink[] = [];
  const walk = (current: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }
    for (const entry of entries) {
      const entryPath = join(current, entry);
      let stats;
      try {
        stats = lstatSync(entryPath);
      } catch {
        continue;
      }
      if (stats.isSymbolicLink()) {
        const resolved = tryRealpath(entryPath);
        if (resolved === null || !resolvedRoots.some((root) => isWithin(resolved, root))) {
          let target = "?";
          try {
            target = readlinkSync(entryPath);
          } catch {
            // keep the placeholder; the finding still names the link itself
          }
          findings.push({ link: entryPath, target, resolved });
        }
      } else if (stats.isDirectory()) {
        walk(entryPath);
      }
    }
  };
  const rootReal = tryRealpath(dir);
  if (rootReal === null) return findings;
  try {
    if (!lstatSync(rootReal).isDirectory()) return findings;
  } catch {
    return findings;
  }
  walk(rootReal);
  return findings;
};

/**
 * Fail-fast preflight for Docker bind mounts: throw an actionable error when
 * any mounted directory contains symlinks that would dangle inside the
 * container. Called before building the `docker run` command so the launch
 * fails with the real cause instead of a misleading in-container error.
 */
export const assertDockerMountsCoverSymlinks = (mountRoots: string[]): void => {
  const findings = mountRoots.flatMap((root) => findEscapingSymlinks(root, mountRoots));
  if (findings.length === 0) return;
  const lines = findings.map(({ link, target, resolved }) =>
    resolved === null
      ? `  - ${link} -> ${target} (dangling on host)`
      : `  - ${link} -> ${target} (resolves to ${resolved})`,
  );
  throw new Error(
    [
      "Docker launch preflight failed: the model directory contains symlinks that resolve outside the bind-mounted path(s), so they would dangle inside the container:",
      ...lines,
      "Replace these symlinks with hardlinks (`ln -f <target> <link>`) or copy the real files into the checkpoint directory, then relaunch.",
    ].join("\n"),
  );
};
