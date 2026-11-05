// src/index.js
import { readFile as readFile2 } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname as dirname2, isAbsolute, join as join2 } from "node:path";
import { fileURLToPath } from "node:url";

// src/storage.js
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

// src/shared/schema.js
var SCHEMA_VERSION = 2;
var SOURCE_LANGUAGES = ["en", "zh"];
var TEXT_BLOCK_TYPES = /* @__PURE__ */ new Set(["heading", "paragraph"]);
var NEUTRAL_TYPES = /* @__PURE__ */ new Set(["equation", "figure", "code"]);
function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function has(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}
function text(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}
function pushTextError(object, key, where, errors, { required = true } = {}) {
  if (!has(object, key)) {
    if (required) errors.push(`${where}.${key} must be present (string or null)`);
    return;
  }
  const value = object[key];
  if (value !== null && typeof value !== "string") {
    errors.push(`${where}.${key} must be a string or null`);
  }
}
function validatePair(pair, where, errors) {
  if (!isObject(pair)) {
    errors.push(`${where} must be an object with original/translation`);
    return;
  }
  if (text(pair.original) === null) errors.push(`${where}.original must be a non-empty string`);
  pushTextError(pair, "translation", where, errors);
}
function validateBlock(block, where, errors) {
  if (!isObject(block)) {
    errors.push(`${where} must be an object`);
    return;
  }
  if (TEXT_BLOCK_TYPES.has(block.type)) {
    validatePair(block, where, errors);
    return;
  }
  if (block.type === "equation") {
    if (typeof block.display !== "string") errors.push(`${where}.display must be a string`);
    if (has(block, "note")) validatePair(block.note, `${where}.note`, errors);
    return;
  }
  if (block.type === "figure") {
    if (has(block, "caption")) validatePair(block.caption, `${where}.caption`, errors);
    const hasBody = isObject(block.diagram) || text(block.image) !== null;
    if (!hasBody && !has(block, "caption")) {
      errors.push(`${where} needs a diagram, an image or a caption`);
    }
    return;
  }
  if (block.type === "code") {
    if (typeof block.code !== "string") errors.push(`${where}.code must be a string`);
    return;
  }
  if (typeof block.type !== "string") errors.push(`${where}.type must be a string`);
}
function validateItemV2(item, where, errors) {
  if (!SOURCE_LANGUAGES.includes(item.sourceLanguage)) {
    errors.push(`${where}.sourceLanguage must be "en" or "zh"`);
  }
  if (!isObject(item.title)) {
    errors.push(`${where}.title must be { original, translation }`);
  } else {
    validatePair(item.title, `${where}.title`, errors);
  }
  if (has(item, "summary")) {
    if (!isObject(item.summary)) errors.push(`${where}.summary must be { original, translation }`);
    else pushTextError(item.summary, "translation", `${where}.summary`, errors);
  }
  if (!Array.isArray(item.blocks)) return;
  item.blocks.forEach((block, index) => validateBlock(block, `${where}.blocks[${index}]`, errors));
}
function validateItems(items, where, version, errors, seenIds) {
  items.forEach((item, itemIndex) => {
    const at = `${where}.items[${itemIndex}]`;
    if (!isObject(item)) {
      errors.push(`${at} must be an object`);
      return;
    }
    if (typeof item.id !== "string") {
      errors.push(`${at}.id must be a string`);
      return;
    }
    if (seenIds.has(item.id)) errors.push(`${at}.id is duplicated (${item.id})`);
    seenIds.add(item.id);
    if (!Array.isArray(item.blocks)) errors.push(`${at}.blocks must be an array`);
    const isV2 = version >= SCHEMA_VERSION || has(item, "sourceLanguage");
    if (isV2) validateItemV2(item, at, errors);
  });
}
function validateDigest(value) {
  const errors = [];
  if (!isObject(value)) return ["digest must be an object"];
  if (!Array.isArray(value.days)) return ["digest.days must be an array"];
  const version = Number(value.schemaVersion) || 1;
  const ids = /* @__PURE__ */ new Set();
  value.days.forEach((day, dayIndex) => {
    const dayAt = `days[${dayIndex}]`;
    if (!isObject(day)) {
      errors.push(`${dayAt} must be an object`);
      return;
    }
    if (typeof day.date !== "string") errors.push(`${dayAt}.date must be a string`);
    if (!Array.isArray(day.items)) {
      errors.push(`${dayAt}.items must be an array`);
      return;
    }
    validateItems(day.items, dayAt, version, errors, ids);
  });
  return errors;
}
function validateDayDigest(value) {
  const errors = [];
  if (!isObject(value)) return ["day digest must be an object"];
  if (typeof value.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) {
    errors.push("day digest.date must be YYYY-MM-DD");
  }
  if (!Array.isArray(value.items)) {
    errors.push("day digest.items must be an array");
    return errors;
  }
  const version = Number(value.schemaVersion) || 1;
  validateItems(value.items, "digest", version, errors, /* @__PURE__ */ new Set());
  return errors;
}
var BLOCK_TYPES = {
  text: [...TEXT_BLOCK_TYPES],
  neutral: [...NEUTRAL_TYPES]
};

// src/storage.js
var MAX_DAY_BYTES = 8 * 1024 * 1024;
var MAX_RUN_BYTES = 1024 * 1024;
var RETENTION_DAYS = 30;
var INDEX_SCHEMA_VERSION = 2;
function storageError(code, message, status, extra = {}) {
  return Object.assign(new Error(message), { code, status }, extra);
}
function isDigestDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = /* @__PURE__ */ new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function storagePaths(root) {
  const digestDir = join(root, "digest");
  const runsDir = join(root, "runs");
  return {
    root,
    digestDir,
    runsDir,
    indexPath: join(root, "index.json"),
    dayPath: (date) => join(digestDir, `${date}.json`),
    runPath: (date) => join(runsDir, `${date}.json`)
  };
}
async function readIndex({ root }) {
  const { indexPath } = storagePaths(root);
  let text2;
  try {
    text2 = await readFile(indexPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return { index: null, missing: true };
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(text2);
  } catch {
    throw storageError("index_invalid", "index.json is not valid JSON", 422);
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.days)) {
    throw storageError("index_invalid", "index.json must be an object with a days array", 422);
  }
  const days = parsed.days.filter((day) => day && isDigestDate(day.date));
  if (days.length !== parsed.days.length) {
    throw storageError("index_invalid", "index.json contains a day entry without a valid date", 422);
  }
  return {
    index: {
      ...parsed,
      schemaVersion: Number(parsed.schemaVersion) || INDEX_SCHEMA_VERSION,
      retentionDays: Number(parsed.retentionDays) || RETENTION_DAYS,
      days
    },
    missing: false
  };
}
async function readDayDigest({ root, date, maxBytes = MAX_DAY_BYTES }) {
  if (!isDigestDate(date)) {
    throw storageError("digest_invalid_date", "date must be a real YYYY-MM-DD date", 400);
  }
  const path = storagePaths(root).dayPath(date);
  let text2;
  try {
    text2 = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw storageError("digest_missing", `no digest is stored for ${date}`, 404);
    }
    throw error;
  }
  const bytes = Buffer.byteLength(text2, "utf8");
  if (bytes > maxBytes) {
    throw storageError(
      "digest_too_large",
      `digest for ${date} is ${bytes} bytes; the per-day limit is ${maxBytes}`,
      413,
      { bytes, maxBytes }
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(text2);
  } catch {
    throw storageError("digest_invalid", `digest for ${date} is not valid JSON`, 422);
  }
  if (parsed?.date !== date) {
    throw storageError("digest_invalid", `digest for ${date} carries a different date`, 422);
  }
  const problems = validateDayDigest(parsed);
  if (problems.length > 0) {
    throw storageError("digest_invalid", `digest for ${date} does not match the day contract: ${problems[0]}`, 422);
  }
  return { date, digest: parsed, path, bytes };
}

// src/index.js
var name = "dsh-paper-reader";
var inject = ["webServer"];
var INDEX_ROUTE = "/api/paper-reader/index";
var DIGEST_ROUTE = "/api/paper-reader/digest";
var DIGEST_DATE_PREFIX = `${DIGEST_ROUTE}/`;
var HEALTH_ROUTE = "/api/paper-reader/health";
var SAMPLE_PATH = fileURLToPath(new URL("../sample/digest.json", import.meta.url));
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
    if (typeof dir === "string" && isAbsolute(dir)) return dirname2(dirname2(dir));
  } catch {
  }
  return process.env.DSH_HOME || join2(homedir(), ".dsh");
}
function resolveDataRoot(ctx) {
  return join2(resolveDshHome(ctx), "paper-reader");
}
function resolveDigestPath(ctx) {
  return join2(resolveDataRoot(ctx), "digest.json");
}
function digestProblem(value) {
  const problems = validateDigest(value);
  return problems.length > 0 ? problems[0] : null;
}
async function readLegacyDigest(ctx) {
  const path = resolveDigestPath(ctx);
  let text2;
  try {
    text2 = await readFile2(path, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    const sample = JSON.parse(await readFile2(SAMPLE_PATH, "utf8"));
    return { ...sample, demo: true, digestPath: path };
  }
  if (Buffer.byteLength(text2, "utf8") > MAX_DAY_BYTES) {
    throw Object.assign(new Error("digest.json is larger than 8 MiB"), { status: 413 });
  }
  let parsed;
  try {
    parsed = JSON.parse(text2);
  } catch {
    throw Object.assign(new Error("digest.json is not valid JSON"), { status: 422 });
  }
  const problem = digestProblem(parsed);
  if (problem) {
    throw Object.assign(new Error(`digest.json does not match the paper-reader schema: ${problem}`), { status: 422 });
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
async function guard(ctx, req, res, run) {
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
    const body = await run();
    if (req.method === "HEAD") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end();
      return;
    }
    json(res, 200, body);
  } catch (error) {
    json(res, error?.status ?? 500, {
      error: error?.code ?? "digest_unavailable",
      message: String(error?.message ?? error)
    });
  }
}
function requestedDate(req) {
  let pathname;
  try {
    pathname = new URL(req.url ?? "", "http://localhost").pathname;
  } catch {
    return null;
  }
  if (!pathname.startsWith(DIGEST_DATE_PREFIX)) return null;
  const rest = pathname.slice(DIGEST_DATE_PREFIX.length);
  return rest.length > 0 && !rest.includes("/") ? decodeURIComponent(rest) : null;
}
function apply(ctx) {
  const dataRoot = () => resolveDataRoot(ctx);
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
      path: INDEX_ROUTE,
      handler: (req, res) => guard(ctx, req, res, async () => {
        let index;
        let missing;
        try {
          ({ index, missing } = await readIndex({ root: dataRoot() }));
        } catch (error) {
          throw Object.assign(new Error(String(error?.message ?? error)), {
            status: error?.status ?? 500,
            code: "index_unavailable"
          });
        }
        return {
          schemaVersion: index?.schemaVersion ?? 2,
          retentionDays: index?.retentionDays ?? 30,
          updatedAt: index?.updatedAt ?? null,
          days: index?.days ?? [],
          missing,
          demo: false,
          indexPath: join2(dataRoot(), "index.json")
        };
      })
    }),
    "dsh-paper-reader: index route"
  );
  ctx.effect(
    () => ctx.webServer.register({
      kind: "prefix",
      path: DIGEST_DATE_PREFIX,
      handler: (req, res) => guard(ctx, req, res, async () => {
        const date = requestedDate(req);
        if (!date) {
          throw Object.assign(new Error("a date is required: /api/paper-reader/digest/YYYY-MM-DD"), {
            status: 400,
            code: "digest_invalid_date"
          });
        }
        const { digest, path, bytes } = await readDayDigest({ root: dataRoot(), date });
        return { ...digest, demo: false, digestPath: path, bytes };
      })
    }),
    "dsh-paper-reader: by-date digest route"
  );
  ctx.effect(
    () => ctx.webServer.register({
      kind: "exact",
      path: DIGEST_ROUTE,
      handler: (req, res) => guard(ctx, req, res, () => readLegacyDigest(ctx))
    }),
    "dsh-paper-reader: legacy digest route"
  );
}
export {
  apply,
  inject,
  name
};
