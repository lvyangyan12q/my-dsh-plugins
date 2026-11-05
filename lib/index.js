// src/index.js
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

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
    day.items.forEach((item, itemIndex) => {
      const at = `${dayAt}.items[${itemIndex}]`;
      if (!isObject(item)) {
        errors.push(`${at} must be an object`);
        return;
      }
      if (typeof item.id !== "string") {
        errors.push(`${at}.id must be a string`);
        return;
      }
      if (ids.has(item.id)) errors.push(`${at}.id is duplicated (${item.id})`);
      ids.add(item.id);
      if (!Array.isArray(item.blocks)) errors.push(`${at}.blocks must be an array`);
      const isV2 = version >= SCHEMA_VERSION || has(item, "sourceLanguage");
      if (isV2) validateItemV2(item, at, errors);
    });
  });
  return errors;
}
var BLOCK_TYPES = {
  text: [...TEXT_BLOCK_TYPES],
  neutral: [...NEUTRAL_TYPES]
};

// src/index.js
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
function digestProblem(value) {
  const problems = validateDigest(value);
  return problems.length > 0 ? problems[0] : null;
}
async function readDigest(ctx) {
  const path = resolveDigestPath(ctx);
  let text2;
  try {
    text2 = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    const sample = JSON.parse(await readFile(SAMPLE_PATH, "utf8"));
    return { ...sample, demo: true, digestPath: path };
  }
  if (Buffer.byteLength(text2, "utf8") > MAX_BYTES) {
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
