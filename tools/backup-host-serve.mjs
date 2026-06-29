// ---------------------------------------------------------------------------
// CAS-177 — Production-faithful local static server for the backup host.
//
// Serves a static dir with the EXACT cache-header policy the live backup host
// must enforce (tools/backup-host-policy.mjs). This is the "prototype host" for
// the spike: we point a browser at it and prove the game boots and that a
// redeploy reaches a returning (cached) player — the CAS-58 failure mode — all
// without touching the live URL or spending a cent.
//
// Programmatic:  import { startBackupHost } from "./backup-host-serve.mjs"
// CLI:           node tools/backup-host-serve.mjs [dir] [port]
//                (dir defaults to deploy/backup-host, port to ephemeral)
// ---------------------------------------------------------------------------
import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { join, normalize } from "node:path";
import { ROOT } from "./harness.mjs";
import { cacheControlFor, mimeFor } from "./backup-host-policy.mjs";

export function startBackupHost(root = join(ROOT, "deploy", "backup-host"), port = 0) {
  const rootNorm = normalize(root);
  const server = http.createServer((req, res) => {
    try {
      let p = decodeURIComponent((req.url || "/").split("?")[0]);
      if (p === "/" || p === "") p = "/index.html";
      if (p === "/favicon.ico" && !existsSync(join(rootNorm, "favicon.ico"))) {
        res.writeHead(204, { "cache-control": cacheControlFor("/favicon.ico") }); res.end(); return;
      }
      const full = normalize(join(rootNorm, p));
      if (!full.startsWith(rootNorm) || !existsSync(full) || !statSync(full).isFile()) {
        res.writeHead(404, { "cache-control": "no-store" }); res.end("404"); return;
      }
      res.writeHead(200, {
        "content-type": mimeFor(full),
        "cache-control": cacheControlFor(p),
      });
      createReadStream(full).pipe(res);
    } catch {
      res.writeHead(500); res.end("500");
    }
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const { port: actual } = server.address();
      resolve({
        url: `http://127.0.0.1:${actual}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

// CLI mode
if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2] ? normalize(process.argv[2]) : join(ROOT, "deploy", "backup-host");
  const port = process.argv[3] ? Number(process.argv[3]) : 0;
  if (!existsSync(dir)) {
    console.error(`✖ ${dir} does not exist — run \`npm run backup-host-export\` first.`);
    process.exit(1);
  }
  const srv = await startBackupHost(dir, port);
  console.log(`backup-host serving ${dir}`);
  console.log(`  -> ${srv.url}   (Ctrl-C to stop)`);
}
