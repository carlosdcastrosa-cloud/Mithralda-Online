// ---------------------------------------------------------------------------
// CAS-177 — Backup static host: the SINGLE source of truth for cache headers.
//
// The game is a pile of fixed-name static files. The ONLY thing that makes a
// redeploy reach a returning player is the CAS-58 bootstrap:
//   * index.html fetches version.json with cache:'no-store' on every boot,
//   * reads build = content-hash of the whole tree,
//   * injects an import map routing every module + asset to `?v=<build>`.
//
// So a correct backup host needs exactly three header classes:
//   1. version.json   -> no-store           (the freshness lever; must hit net)
//   2. *.html         -> no-cache           (revalidate so the bootstrap reruns)
//   3. everything else-> immutable, 1y      (always requested with ?v=<build>,
//                                            and build-id is a global content
//                                            hash, so the URL changes whenever
//                                            bytes change -> safe to cache hard)
//
// This module is consumed by tools/backup-host-serve.mjs (the local production-
// faithful prototype) AND emitted, rule-for-rule, into hosting/_headers,
// hosting/netlify.toml and hosting/nginx.conf so the live host enforces the
// IDENTICAL policy. Keep them in sync by regenerating: `npm run backup-host`.
// ---------------------------------------------------------------------------
import { extname } from "node:path";

export const NO_STORE = "no-store";
export const NO_CACHE = "no-cache";
export const IMMUTABLE = "public, max-age=31536000, immutable";

// Return the Cache-Control value for a request path (path only, no query).
export function cacheControlFor(pathname) {
  const p = pathname.toLowerCase();
  if (p === "/version.json" || p.endsWith("/version.json")) return NO_STORE;
  if (p.endsWith(".html") || p === "/" || p === "") return NO_CACHE;
  return IMMUTABLE;
}

export const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".mjs":  "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4":  "video/mp4",
  ".csv":  "text/csv; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
};

export function mimeFor(filePath) {
  return MIME[extname(filePath).toLowerCase()] || "application/octet-stream";
}
