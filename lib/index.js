// src/index.js
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
var name = "dsh-paper-reader";
var inject = ["webServer"];
var DIGEST_ROUTE = "/api/paper-reader/digest";
var HEALTH_ROUTE = "/api/paper-reader/health";
var SAMPLE_PATH = fileURLToPath(new URL("../sample/digest.json", import.meta.url));
var MAX_BYTES = 8 * 1024 * 1024;
function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
    "x-content-type-options": "nosniff"
  });
  res.end(body);
}
function resolveDshHome(ctx) {
  try {
    const profile = ctx.get?.("profileContext");
    const dir = profile?.dir;
    if (typeof dir === "string" && isAbsolute(dir)) return dirname(dirname(dir));
  } catch {
  }
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}
function resolveDigestPath(ctx) {
  return join(resolveDshHome(ctx), "paper-reader", "digest.json");
}
function isValidDigest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (!Array.isArray(value.days)) return false;
  for (const day of value.days) {
    if (!day || typeof day !== "object" || typeof day.date !== "string" || !Array.isArray(day.items)) return false;
    for (const item of day.items) {
      if (!item || typeof item !== "object" || typeof item.id !== "string" || !Array.isArray(item.blocks)) return false;
    }
  }
  return true;
}
async function readDigest(ctx) {
  const path = resolveDigestPath(ctx);
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    const sample = JSON.parse(await readFile(SAMPLE_PATH, "utf8"));
    return { ...sample, demo: true, digestPath: path };
  }
  if (Buffer.byteLength(text, "utf8") > MAX_BYTES) {
    throw Object.assign(new Error("digest.json is larger than 8 MiB"), { status: 413 });
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw Object.assign(new Error("digest.json is not valid JSON"), { status: 422 });
  }
  if (!isValidDigest(parsed)) {
    throw Object.assign(new Error("digest.json does not match the paper-reader schema"), { status: 422 });
  }
  return { ...parsed, demo: false, digestPath: path };
}
function admissionStatus(ctx, req) {
  let connection;
  try {
    connection = ctx.get?.("connection");
  } catch {
    connection = void 0;
  }
  if (!connection || typeof connection.admit !== "function") return null;
  const result = connection.admit(req);
  if (result && typeof result === "object" && "rejection" in result) return result.rejection || 403;
  return null;
}
function apply(ctx) {
  ctx.effect(
    () => ctx.webServer.register({
      kind: "exact",
      path: HEALTH_ROUTE,
      handler: (_req, res) => json(res, 200, { ok: true, plugin: name })
    }),
    "dsh-paper-reader: health route"
  );
  ctx.effect(
    () => ctx.webServer.register({
      kind: "exact",
      path: DIGEST_ROUTE,
      handler: async (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          json(res, 405, { error: "method_not_allowed" });
          return;
        }
        const rejected = admissionStatus(ctx, req);
        if (rejected) {
          json(res, rejected, { error: "forbidden" });
          return;
        }
        try {
          const digest = await readDigest(ctx);
          if (req.method === "HEAD") {
            res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
            res.end();
            return;
          }
          json(res, 200, digest);
        } catch (error) {
          json(res, error?.status ?? 500, {
            error: "digest_unavailable",
            message: String(error?.message ?? error)
          });
        }
      }
    }),
    "dsh-paper-reader: digest route"
  );
}
export {
  apply,
  inject,
  name
};
