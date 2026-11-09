import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
const root = process.cwd();
const benchmark = process.argv.includes("--benchmark");
const port = Number(process.env.PORT ?? 8025);
const token = randomBytes(16).toString("hex");
let offline = false;
const denied = [];
const context = {
  token,
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  dirty: Boolean(
    execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(),
  ),
  node: process.version,
  startedAt: new Date().toISOString(),
  lockContract:
    "Run this foreground process under the shared benchmark_lock.py wrapper",
  threads: 1,
};
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".wasm": "application/wasm",
};
const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, `http://127.0.0.1:${port}`).pathname;
  const send = (status, body, type = "text/plain") => {
    res.writeHead(status, {
      "Content-Type": type,
      "Cache-Control": "no-store",
    });
    res.end(body);
  };
  try {
    if (path.startsWith("/api/")) {
      if (!benchmark) return send(403, "Benchmark harness disabled");
      if (path === "/api/context" && req.method === "GET")
        return send(200, JSON.stringify(context), "application/json");
      if (
        req.headers["x-run-token"] !== token ||
        req.headers.origin !== `http://127.0.0.1:${port}`
      )
        return send(403, "Invalid origin or token");
      if (path === "/api/offline" && req.method === "POST") {
        offline = true;
        return send(200, "Static origin disabled");
      }
      if (path === "/api/report" && req.method === "POST") {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 2000000) return send(413, "Too large");
        }
        const report = JSON.parse(body);
        if (!report.finishedAt || report.context?.token !== token)
          return send(400, "Incomplete report");
        report.harness = {
          staticOutage: offline,
          deniedRequests: denied,
          receivedAt: new Date().toISOString(),
        };
        await mkdir("evidence", { recursive: true });
        const filename = `evidence/browser-${Date.now()}.json`;
        await writeFile(filename, JSON.stringify(report, null, 2) + "\n");
        send(200, "Saved");
        console.log(
          `Saved ${filename}. Browser workload complete; releasing server and lock.`,
        );
        server.close();
        server.closeIdleConnections();
        clearTimeout(timeout);
        return;
      }
      return send(404, "Unknown API");
    }
    if (offline) {
      denied.push({ path, at: new Date().toISOString() });
      return send(503, "Origin static outage for offline verification");
    }
    const file =
      path === "/" ? "index.html" : decodeURIComponent(path.slice(1));
    if (
      !["index.html", "sw.js"].includes(file) &&
      !["src/", "public/", "data/"].some((prefix) => file.startsWith(prefix))
    )
      return send(404, "Not found");
    const absolute = resolve(root, file);
    if (!absolute.startsWith(root + "/") || file.includes(".."))
      return send(403, "Forbidden");
    send(
      200,
      await readFile(absolute),
      types[extname(file)] ?? "application/octet-stream",
    );
  } catch (error) {
    send(
      error.code === "ENOENT" ? 404 : 500,
      error.code === "ENOENT" ? "Not found" : "Request failed",
    );
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Open http://127.0.0.1:${port} ${benchmark ? "and click Run fixed browser evaluation. Lock must remain held." : ""}`,
  ),
);
const timeout = setTimeout(
  () => {
    console.error("Harness timeout: no complete report");
    server.close();
    server.closeAllConnections();
    process.exitCode = 1;
  },
  benchmark ? 20 * 60 * 1000 : 24 * 60 * 60 * 1000,
);
