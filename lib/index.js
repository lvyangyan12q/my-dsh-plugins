// src/index.js
import { readFile as readFile2 } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname as dirname3, isAbsolute, join as join3 } from "node:path";
import { fileURLToPath } from "node:url";

// src/storage.js
import { mkdir, readFile, readdir, unlink as unlink2 } from "node:fs/promises";
import { dirname as dirname2, join as join2 } from "node:path";

// src/shared/date.js
var DAY_MS = 864e5;
function isDigestDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = /* @__PURE__ */ new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function dateOnly(value) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? "").trim());
  return match ? match[1] : null;
}
function shiftDate(date, days) {
  const base = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(base)) return date;
  return new Date(base + days * DAY_MS).toISOString().slice(0, 10);
}

// src/shared/fs.js
import { randomUUID } from "node:crypto";
import { rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

// src/shared/blocks.js
var TEXT_BLOCK_TYPES = Object.freeze(["heading", "paragraph"]);
var NEUTRAL_BLOCK_TYPES = Object.freeze(["equation", "figure", "code", "table"]);
var TEXT = new Set(TEXT_BLOCK_TYPES);
var NEUTRAL = new Set(NEUTRAL_BLOCK_TYPES);

// src/shared/schema.js
var SCHEMA_VERSION = 2;
var SOURCE_LANGUAGES = ["en", "zh"];
var TEXT_TYPES = new Set(TEXT_BLOCK_TYPES);
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
  if (TEXT_TYPES.has(block.type)) {
    validatePair(block, where, errors);
    return;
  }
  if (block.type === "equation") {
    if (typeof block.display !== "string") errors.push(`${where}.display must be a string`);
    if (has(block, "mathml") && (typeof block.mathml !== "string" || !block.mathml.startsWith("<math"))) {
      errors.push(`${where}.mathml must be a serialized MathML string`);
    }
    if (has(block, "note")) validatePair(block.note, `${where}.note`, errors);
    return;
  }
  if (block.type === "figure") {
    if (has(block, "caption")) validatePair(block.caption, `${where}.caption`, errors);
    if (has(block, "svg") && (typeof block.svg !== "string" || !block.svg.startsWith("<svg"))) {
      errors.push(`${where}.svg must be a serialized SVG string`);
    }
    const hasBody = isObject(block.diagram) || text(block.image) !== null || text(block.svg) !== null;
    if (!hasBody && !has(block, "caption")) {
      errors.push(`${where} needs a diagram, an image, svg or a caption`);
    }
    return;
  }
  if (block.type === "table") {
    if (has(block, "caption")) validatePair(block.caption, `${where}.caption`, errors);
    const rowsOk = Array.isArray(block.rows) && block.rows.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === "string"));
    if (!rowsOk) errors.push(`${where}.rows must be an array of string arrays`);
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
  neutral: [...NEUTRAL_BLOCK_TYPES]
};

// src/storage.js
var MAX_DAY_BYTES = 8 * 1024 * 1024;
var MAX_RUN_BYTES = 1024 * 1024;
var RETENTION_DAYS = 30;
var INDEX_SCHEMA_VERSION = 2;
var DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.json$/;
function storageError(code, message, status, extra = {}) {
  return Object.assign(new Error(message), { code, status }, extra);
}
function storagePaths(root) {
  const digestDir = join2(root, "digest");
  const runsDir = join2(root, "runs");
  return {
    root,
    digestDir,
    runsDir,
    indexPath: join2(root, "index.json"),
    dayPath: (date) => join2(digestDir, `${date}.json`),
    runPath: (date) => join2(runsDir, `${date}.json`)
  };
}
async function readIndex({ root }) {
  const { indexPath } = storagePaths(root);
  let text3;
  try {
    text3 = await readFile(indexPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return { index: null, missing: true };
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(text3);
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
  let text3;
  try {
    text3 = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw storageError("digest_missing", `no digest is stored for ${date}`, 404);
    }
    throw error;
  }
  const bytes = Buffer.byteLength(text3, "utf8");
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
    parsed = JSON.parse(text3);
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
async function readLatestRun({ root }) {
  const { runsDir } = storagePaths(root);
  let names;
  try {
    names = await readdir(runsDir);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  let latest = null;
  for (const name2 of names) {
    const match = DAY_FILE.exec(name2);
    if (!match) continue;
    if (latest === null || match[1] > latest) latest = match[1];
  }
  if (latest === null) return null;
  const path = storagePaths(root).runPath(latest);
  let text3;
  try {
    text3 = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  let record;
  try {
    record = JSON.parse(text3);
  } catch {
    throw storageError("run_invalid", `run record for ${latest} is not valid JSON`, 422);
  }
  return { date: latest, record, path };
}

// src/shared/markup.js
var VOID_ELEMENTS = /* @__PURE__ */ new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);
var RAW_TEXT_ELEMENTS = /* @__PURE__ */ new Set(["script", "style"]);
var NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\xA0",
  hellip: "\u2026",
  mdash: "\u2014",
  ndash: "\u2013",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201C",
  rdquo: "\u201D",
  middot: "\xB7",
  times: "\xD7",
  copy: "\xA9"
};
function decodeEntities(text3) {
  return String(text3).replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 1114111 ? String.fromCodePoint(code) : match;
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body] : match;
  });
}
function findTagEnd(source, start) {
  let quote = "";
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ">") return index;
  }
  return -1;
}
function parseAttributes(source) {
  const attributes = {};
  if (!source) return attributes;
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const name2 = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    attributes[name2] = decodeEntities(value);
  }
  return attributes;
}
function appendText(node, text3) {
  if (!text3) return;
  const children = node.children;
  if (typeof children[children.length - 1] === "string") {
    children[children.length - 1] += text3;
  } else {
    children.push(text3);
  }
}
function parseMarkup(source, { html = true } = {}) {
  const text3 = String(source ?? "");
  const root = { name: "#document", attributes: {}, children: [] };
  const stack = [root];
  let index = 0;
  const current = () => stack[stack.length - 1];
  const pushText = (raw, { decode = true } = {}) => {
    appendText(current(), decode ? decodeEntities(raw) : raw);
  };
  while (index < text3.length) {
    const open = text3.indexOf("<", index);
    if (open === -1) {
      pushText(text3.slice(index));
      break;
    }
    if (open > index) pushText(text3.slice(index, open));
    if (text3.startsWith("<!--", open)) {
      const end2 = text3.indexOf("-->", open + 4);
      index = end2 === -1 ? text3.length : end2 + 3;
      continue;
    }
    if (text3.startsWith("<![CDATA[", open)) {
      const end2 = text3.indexOf("]]>", open + 9);
      pushText(text3.slice(open + 9, end2 === -1 ? text3.length : end2), { decode: false });
      index = end2 === -1 ? text3.length : end2 + 3;
      continue;
    }
    if (text3[open + 1] === "!" || text3[open + 1] === "?") {
      const end2 = text3.indexOf(">", open + 2);
      index = end2 === -1 ? text3.length : end2 + 1;
      continue;
    }
    const end = findTagEnd(text3, open + 1);
    if (end === -1) {
      pushText(text3.slice(open));
      break;
    }
    const raw = text3.slice(open + 1, end);
    index = end + 1;
    if (raw.startsWith("/")) {
      const name3 = raw.slice(1).trim().toLowerCase();
      for (let depth = stack.length - 1; depth > 0; depth -= 1) {
        if (stack[depth].name === name3) {
          stack.length = depth;
          break;
        }
      }
      continue;
    }
    const selfClosing = /\/\s*$/.test(raw);
    const body = selfClosing ? raw.replace(/\/\s*$/, "") : raw;
    const separator = body.search(/\s/);
    const name2 = (separator === -1 ? body : body.slice(0, separator)).toLowerCase();
    if (!name2) continue;
    const node = {
      name: name2,
      attributes: parseAttributes(separator === -1 ? "" : body.slice(separator)),
      children: []
    };
    current().children.push(node);
    if (selfClosing || html && VOID_ELEMENTS.has(name2)) continue;
    if (html && RAW_TEXT_ELEMENTS.has(name2)) {
      const closing = text3.toLowerCase().indexOf(`</${name2}`, index);
      const rawBody = closing === -1 ? text3.slice(index) : text3.slice(index, closing);
      if (rawBody) node.children.push(decodeEntities(rawBody));
      if (closing === -1) {
        index = text3.length;
      } else {
        const closeEnd = text3.indexOf(">", closing);
        index = closeEnd === -1 ? text3.length : closeEnd + 1;
      }
      continue;
    }
    stack.push(node);
  }
  return root;
}
function isElement(value) {
  return Boolean(value) && typeof value === "object" && typeof value.name === "string";
}
function localName(name2) {
  const text3 = String(name2 ?? "");
  const colon = text3.indexOf(":");
  return (colon === -1 ? text3 : text3.slice(colon + 1)).toLowerCase();
}
function attr(node, name2) {
  if (!isElement(node)) return null;
  const key = String(name2).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(node.attributes, key)) return node.attributes[key];
  for (const [attribute, value] of Object.entries(node.attributes)) {
    if (localName(attribute) === localName(key)) return value;
  }
  return null;
}
function classesOf(node) {
  const value = attr(node, "class");
  return typeof value === "string" ? value.split(/\s+/).filter(Boolean) : [];
}
function hasClass(node, name2) {
  return classesOf(node).includes(name2);
}
function hasAnyClass(node, names) {
  const classes = classesOf(node);
  return names.some((name2) => classes.includes(name2));
}
function childrenOf(node, name2) {
  if (!isElement(node)) return [];
  const elements = node.children.filter(isElement);
  if (name2 === void 0) return elements;
  const wanted = localName(name2);
  return elements.filter((child) => localName(child.name) === wanted);
}
function findFirst(node, predicate) {
  if (!isElement(node)) return null;
  if (predicate(node)) return node;
  for (const child of node.children) {
    if (!isElement(child)) continue;
    const found = findFirst(child, predicate);
    if (found) return found;
  }
  return null;
}
function findAll(node, predicate, found = []) {
  if (!isElement(node)) return found;
  if (predicate(node)) found.push(node);
  for (const child of node.children) {
    if (isElement(child)) findAll(child, predicate, found);
  }
  return found;
}
function textOf(node) {
  if (typeof node === "string") return node;
  if (!isElement(node)) return "";
  return node.children.map(textOf).join("");
}
function collapse(text3) {
  return String(text3 ?? "").replace(/\s+/g, " ").trim();
}
var MATHML_TAGS = /* @__PURE__ */ new Set([
  "math",
  "mrow",
  "mi",
  "mn",
  "mo",
  "mtext",
  "mspace",
  "mfrac",
  "msqrt",
  "mroot",
  "msub",
  "msup",
  "msubsup",
  "munder",
  "mover",
  "munderover",
  "mmultiscripts",
  "mprescripts",
  "none",
  "mtable",
  "mtr",
  "mtd",
  "mlabeledtr",
  "mstyle",
  "mpadded",
  "menclose",
  "maction",
  "semantics",
  "annotation",
  "annotation-xml",
  "mglyph"
]);
var MATHML_ATTRS = /* @__PURE__ */ new Set([
  "display",
  "mathvariant",
  "stretchy",
  "fence",
  "separator",
  "lspace",
  "rspace",
  "displaystyle",
  "scriptlevel",
  "columnalign",
  "rowalign",
  "columnlines",
  "rowlines",
  "columnspacing",
  "rowspacing",
  "frame",
  "framespacing",
  "notation",
  "width",
  "height",
  "depth",
  "linethickness",
  "accent",
  "accentunder",
  "largeop",
  "movablelimits",
  "symmetric",
  "minsize",
  "maxsize",
  "form",
  "mathcolor",
  "mathbackground",
  "xmlns",
  "encoding"
]);
function escapeHtml(text3) {
  return String(text3).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function escapeAttribute(text3) {
  return escapeHtml(text3).replaceAll('"', "&quot;");
}
function serializeMathml(node) {
  if (!isElement(node) || localName(node.name) !== "math") return "";
  const walk = (current) => {
    if (typeof current === "string") return escapeHtml(current);
    if (!isElement(current)) return "";
    const tag = localName(current.name);
    const body = current.children.map(walk).join("");
    if (!MATHML_TAGS.has(tag)) return body;
    if (tag === "annotation" || tag === "annotation-xml") return "";
    const attributes = Object.entries(current.attributes).filter(([name2]) => MATHML_ATTRS.has(localName(name2))).map(([name2, value]) => ` ${localName(name2)}="${escapeAttribute(value)}"`).join("");
    return `<${tag}${attributes}>${body}</${tag}>`;
  };
  return walk(node);
}
function serializeInline(node) {
  if (typeof node === "string") return escapeHtml(node);
  if (!isElement(node)) return "";
  if (localName(node.name) === "math") return serializeMathml(node);
  return node.children.map(serializeInline).join("");
}
var SVG_TAGS = /* @__PURE__ */ new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "defs",
  "clipPath",
  "use",
  "symbol",
  "marker",
  "linearGradient",
  "radialGradient",
  "stop",
  "pattern",
  "title",
  "desc"
]);
var SVG_ATTRS = /* @__PURE__ */ new Set([
  "viewBox",
  "width",
  "height",
  "x",
  "y",
  "x1",
  "x2",
  "y1",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "d",
  "points",
  "transform",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "opacity",
  "clip-path",
  "clip-rule",
  "id",
  "class",
  "preserveAspectRatio",
  "markerWidth",
  "markerHeight",
  "refX",
  "refY",
  "orient",
  "offset",
  "stop-color",
  "stop-opacity",
  "href",
  "role",
  "aria-label"
]);
var SVG_TAG_CASE = {
  svg: "svg",
  g: "g",
  path: "path",
  rect: "rect",
  circle: "circle",
  ellipse: "ellipse",
  line: "line",
  polyline: "polyline",
  polygon: "polygon",
  text: "text",
  tspan: "tspan",
  defs: "defs",
  clippath: "clipPath",
  use: "use",
  symbol: "symbol",
  marker: "marker",
  lineargradient: "linearGradient",
  radialgradient: "radialGradient",
  stop: "stop",
  pattern: "pattern",
  title: "title",
  desc: "desc"
};
var SVG_ATTR_CASE = {
  viewbox: "viewBox",
  preserveaspectratio: "preserveAspectRatio",
  markerwidth: "markerWidth",
  markerheight: "markerHeight",
  refx: "refX",
  refy: "refY",
  gradientunits: "gradientUnits",
  patternunits: "patternUnits",
  patterncontentunits: "patternContentUnits",
  clippathunits: "clipPathUnits"
};
var SVG_ATTR_NAMES = new Set([...SVG_ATTRS].map((name2) => name2.toLowerCase()));
function serializeSvg(node) {
  if (!isElement(node) || localName(node.name) !== "svg") return "";
  const walk = (current) => {
    if (typeof current === "string") return escapeHtml(current);
    if (!isElement(current)) return "";
    const rawTag = localName(current.name);
    if (!SVG_TAGS.has(rawTag)) return "";
    const tag = SVG_TAG_CASE[rawTag] ?? rawTag;
    const body = current.children.map(walk).join("");
    const attributes = Object.entries(current.attributes).filter(([name2]) => SVG_ATTR_NAMES.has(localName(name2))).filter(([name2, value]) => name2 !== "href" || String(value).startsWith("#")).map(([name2, value]) => {
      const canonical = SVG_ATTR_CASE[name2] ?? name2;
      return ` ${canonical}="${escapeAttribute(value)}"`;
    }).join("");
    return `<${tag}${attributes}>${body}</${tag}>`;
  };
  return walk(node);
}

// src/shared/direction.js
var DIRECTION_RULES = [
  {
    direction: "agent",
    words: ["agent", "agentic", "tool use", "tool-use", "multi-agent", "multiagent", "autonomous agent", "\u667A\u80FD\u4F53", "\u5DE5\u5177\u8C03\u7528"]
  },
  {
    direction: "reasoning",
    words: ["reasoning", "chain-of-thought", "chain of thought", "theorem", "logic", "test-time", "inference-time", "\u63A8\u7406", "\u601D\u7EF4\u94FE"]
  },
  {
    direction: "training",
    words: ["pretrain", "pre-train", "training", "fine-tun", "fine tun", "rlhf", "distillation", "distill", "scaling law", "data mixture", "\u8BAD\u7EC3", "\u5FAE\u8C03", "\u84B8\u998F"]
  },
  {
    direction: "alignment",
    words: ["alignment", "safety", "preference optimization", "jailbreak", "reward model", "rlaif", "red team", "\u5BF9\u9F50", "\u5B89\u5168"]
  },
  {
    direction: "architecture",
    words: ["architecture", "mixture-of-experts", "mixture of experts", "moe", "attention", "transformer", "kernel", "quantization", "efficient inference", "\u67B6\u6784", "\u6A21\u578B", "\u53C2\u6570"]
  }
];
function classifyDirection({ title = "", summary = "" } = {}) {
  const haystack = `${title}
${summary}`.toLowerCase();
  for (const rule of DIRECTION_RULES) {
    if (rule.words.some((word) => haystack.includes(word))) return rule.direction;
  }
  return "architecture";
}
function matchedWords({ title = "", summary = "" } = {}) {
  const haystack = `${title}
${summary}`.toLowerCase();
  const words = [];
  for (const rule of DIRECTION_RULES) {
    for (const word of rule.words) {
      if (haystack.includes(word) && !words.includes(word)) words.push(word);
    }
  }
  return words.slice(0, 4);
}

// src/shared/http.js
async function fetchText(fetchImpl, url, {
  timeoutMs = 2e4,
  userAgent,
  accept = "text/html",
  headers = {}
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (typeof timer.unref === "function") timer.unref();
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        accept,
        ...userAgent ? { "user-agent": userAgent } : {},
        ...headers
      }
    });
    const text3 = typeof response.text === "function" ? await response.text() : "";
    return { response, text: text3 };
  } finally {
    clearTimeout(timer);
  }
}

// src/sources/validation.js
function configError(message) {
  return Object.assign(new Error(message), { code: "config_invalid", exitCode: 2, status: 400 });
}
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function assertStringList(value, key, path, { allowEmpty = true } = {}) {
  if (!Array.isArray(value)) throw configError(`${path}: ${key} must be an array of strings`);
  if (value.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) {
    throw configError(`${path}: ${key} must only contain non-empty strings`);
  }
  if (!allowEmpty && value.length === 0) throw configError(`${path}: ${key} must not be empty`);
}
function assertPositive(value, key, path) {
  if (!Number.isFinite(value) || value <= 0) throw configError(`${path}: ${key} must be a positive number`);
}
function assertUrl(value, key, path) {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value)) {
    throw configError(`${path}: ${key} must be an http(s) URL`);
  }
}

// src/sources/arxiv.js
var SOURCE_ID = "arxiv";
var DEFAULT_ARXIV_CONFIG = {
  enabled: true,
  useProxy: false,
  categories: ["cs.AI", "cs.CL", "cs.LG"],
  keywords: [],
  excludeKeywords: [],
  maxResults: 100,
  timeoutMs: 2e4,
  baseUrl: "https://export.arxiv.org/api/query",
  htmlBaseUrl: "https://arxiv.org/html",
  extractFullText: true,
  maxBlocks: 400,
  userAgent: "dsh-paper-reader/0.1 (+https://arxiv.org/help/api)"
};
var SKIP_TAGS = /* @__PURE__ */ new Set(["script", "style", "nav", "header", "footer", "aside", "form", "button", "svg"]);
var SKIP_CLASSES = [
  "ltx_page_header",
  "ltx_page_footer",
  "ltx_page_navbar",
  "ltx_bibliography",
  "ltx_biblist",
  "ltx_ERROR"
];
function sourceError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, sourceId: SOURCE_ID }, extra);
}
function withDefaults(config) {
  return { ...DEFAULT_ARXIV_CONFIG, ...config ?? {} };
}
function normalizeArxivId(value) {
  const text3 = String(value ?? "").trim();
  const match = /(?:arxiv\.org\/(?:abs|pdf)\/)?([a-z-]+(?:\.[A-Z]{2})?\/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?/i.exec(text3);
  if (match) return match[1].replace(/v\d+$/, "");
  return text3.replace(/^https?:\/\/[^/]+\//, "").replace(/v\d+$/, "");
}
function firstText(node, local) {
  return collapse(textOf(childrenOf(node, local)[0] ?? null));
}
function parseAtomFeed(xml) {
  const tree = parseMarkup(xml, { html: false });
  const feed = findFirst(tree, (node) => localName(node.name) === "feed");
  if (!feed) return [];
  return childrenOf(feed, "entry").map((entry) => {
    const rawId = firstText(entry, "id");
    const arxivId = normalizeArxivId(rawId);
    const published = firstText(entry, "published") || firstText(entry, "updated");
    const links = childrenOf(entry, "link");
    const alternate = links.find((link) => {
      const rel = attr(link, "rel");
      return !rel || rel === "alternate";
    });
    const href = alternate ? attr(alternate, "href") : null;
    return {
      arxivId,
      rawId,
      title: collapse(textOf(childrenOf(entry, "title")[0] ?? null)),
      summary: collapse(textOf(childrenOf(entry, "summary")[0] ?? null)),
      published,
      updated: firstText(entry, "updated"),
      authors: childrenOf(entry, "author").map((author) => collapse(textOf(childrenOf(author, "name")[0] ?? null))).filter(Boolean),
      // `arxiv:affiliation` is optional in the Atom feed; when present it is the
      // institution signal the `selection.institutions` allowlist reads.
      institutions: [...new Set(childrenOf(entry, "author").flatMap((author) => childrenOf(author, "affiliation")).map((affiliation) => collapse(textOf(affiliation))).filter(Boolean))],
      categories: childrenOf(entry, "category").map((category) => attr(category, "term")).filter(Boolean),
      primaryCategory: attr(childrenOf(entry, "primary_category")[0] ?? null, "term"),
      comment: firstText(entry, "comment"),
      journalRef: firstText(entry, "journal_ref"),
      doi: firstText(entry, "doi"),
      url: arxivId ? `https://arxiv.org/abs/${arxivId}` : href || rawId
    };
  });
}
function buildArxivQueryUrl({ baseUrl, categories = [], date, maxResults = 100 }) {
  const compact = String(date).replace(/-/g, "");
  const categoryQuery = categories.length > 0 ? categories.map((category) => `cat:${category}`).join(" OR ") : "all";
  const url = new URL(baseUrl || DEFAULT_ARXIV_CONFIG.baseUrl);
  url.searchParams.set("search_query", `(${categoryQuery}) AND submittedDate:[${compact}0000 TO ${compact}2359]`);
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", String(maxResults));
  url.searchParams.set("sortBy", "submittedDate");
  url.searchParams.set("sortOrder", "descending");
  return url.toString();
}
function toCandidate(entry) {
  const direction = classifyDirection(entry);
  return {
    id: `${SOURCE_ID}:${entry.arxivId}`,
    sourceId: SOURCE_ID,
    arxivId: entry.arxivId,
    sourceLanguage: "en",
    title: entry.title,
    summary: entry.summary,
    url: entry.url,
    publishedAt: entry.published || null,
    published: entry.published ? entry.published.slice(0, 10) : null,
    authors: entry.authors,
    institutions: entry.institutions ?? [],
    categories: entry.categories,
    primaryCategory: entry.primaryCategory,
    direction,
    tags: [.../* @__PURE__ */ new Set([...entry.categories, ...matchedWords(entry)])]
  };
}
function byPublishedDesc(left, right) {
  const a = Date.parse(left.publishedAt ?? "") || 0;
  const b = Date.parse(right.publishedAt ?? "") || 0;
  if (a !== b) return b - a;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}
async function listArxiv({ config, date, fetch: fetchImpl }) {
  const settings = withDefaults(config);
  const url = buildArxivQueryUrl({
    baseUrl: settings.baseUrl,
    categories: settings.categories,
    date,
    maxResults: settings.maxResults
  });
  let response;
  let text3;
  try {
    ({ response, text: text3 } = await fetchText(fetchImpl, url, {
      timeoutMs: settings.timeoutMs,
      userAgent: settings.userAgent,
      accept: "application/atom+xml, text/html;q=0.9, */*;q=0.1"
    }));
  } catch (error) {
    throw sourceError("arxiv_network", `arXiv API request failed: ${error?.message ?? error}`, { cause: error });
  }
  if (!response.ok) {
    throw sourceError("arxiv_http", `arXiv API answered HTTP ${response.status}`, { status: response.status });
  }
  if (!/<feed[\s>]/i.test(text3)) {
    throw sourceError("arxiv_invalid", "arXiv API did not return an Atom feed");
  }
  return parseAtomFeed(text3).filter((entry) => entry.arxivId).map(toCandidate).sort(byPublishedDesc);
}
function inlineText(node) {
  if (typeof node === "string") return node;
  if (!isElement(node)) return "";
  const tag = localName(node.name);
  if (SKIP_TAGS.has(tag) || hasAnyClass(node, SKIP_CLASSES)) return "";
  if (tag === "math") {
    const alttext = attr(node, "alttext");
    return alttext ? ` $${alttext}$ ` : ` ${textOf(node)} `;
  }
  if (tag === "br") return " ";
  if (tag === "img") {
    const alt = attr(node, "alt");
    return alt ? ` ${alt} ` : "";
  }
  return node.children.map(inlineText).join("");
}
function textBlocksOf(blocks) {
  return blocks.filter((block) => block.type === "heading" || block.type === "paragraph" || block.type === "code");
}
function pushHeading(node, blocks) {
  const tag = localName(node.name);
  if (tag === "h1" && hasClass(node, "ltx_title_document")) return;
  const level = tag === "h6" && hasClass(node, "ltx_title_abstract") ? 2 : Number(tag.slice(1)) || 2;
  const text3 = collapse(inlineText(node));
  if (!text3) return;
  blocks.push({ type: "heading", level, original: text3 });
}
function pushParagraph(node, blocks) {
  const text3 = collapse(inlineText(node));
  if (!text3) return;
  const inline = serializeInline(node);
  blocks.push({
    type: "paragraph",
    original: text3,
    .../<math[\s>]/.test(inline) ? { originalHtml: inline } : {}
  });
}
function pushEquation(node, blocks) {
  const math = findFirst(node, (child) => localName(child.name) === "math" && Boolean(attr(child, "alttext"))) ?? findFirst(node, (child) => localName(child.name) === "math");
  const display = collapse(attr(math, "alttext") || textOf(math));
  if (!display) return;
  const labelNode = findFirst(node, (child) => hasClass(child, "ltx_tag_equation") || hasClass(child, "ltx_tag"));
  const label = labelNode ? collapse(textOf(labelNode)) : "";
  const mathml = math ? serializeMathml(math) : "";
  blocks.push({
    type: "equation",
    display,
    detail: "",
    ...mathml ? { mathml } : {},
    ...label ? { label } : {}
  });
}
function resolveImage(src, baseUrl) {
  if (!src || src.startsWith("data:")) return null;
  try {
    return new URL(src, baseUrl).href;
  } catch {
    return src;
  }
}
function pushFigure(node, blocks, baseUrl) {
  const captionNode = findFirst(node, (child) => localName(child.name) === "figcaption" || hasClass(child, "ltx_caption"));
  const caption = captionNode ? collapse(textOf(captionNode)).replace(/^(?:Figure|Fig\.|Table)\s*\d+[:.]\s*/i, "") : "";
  const imageNode = findFirst(node, (child) => localName(child.name) === "img" && Boolean(attr(child, "src"))) ?? findFirst(node, (child) => localName(child.name) === "img" && Boolean(attr(child, "data-src"))) ?? findFirst(node, (child) => localName(child.name) === "object" && Boolean(attr(child, "data")));
  const rawImage = imageNode ? attr(imageNode, "src") || attr(imageNode, "data-src") || attr(imageNode, "data") : "";
  const image = rawImage ? resolveImage(rawImage, baseUrl) : null;
  const svgNode = findFirst(node, (child) => localName(child.name) === "svg");
  const svg = svgNode ? serializeSvg(svgNode) : "";
  if (!caption && !image && !svg) return;
  blocks.push({
    type: "figure",
    image,
    ...svg ? { svg } : {},
    ...caption ? { caption: { original: caption } } : {}
  });
}
function pushTable(node, blocks) {
  const captionNode = findFirst(node, (child) => localName(child.name) === "figcaption" || hasClass(child, "ltx_caption"));
  const caption = captionNode ? collapse(textOf(captionNode)).replace(/^(?:Table|Figure)\s*\d+[:.]\s*/i, "") : "";
  const tableNode = localName(node.name) === "table" ? node : findFirst(node, (child) => localName(child.name) === "table");
  if (!tableNode) return;
  const rows = findAll(tableNode, (child) => localName(child.name) === "tr").map((row) => {
    const cells = findAll(row, (child) => ["td", "th"].includes(localName(child.name)));
    return { header: cells.length > 0 && cells.every((cell) => localName(cell.name) === "th"), cells: cells.map((cell) => collapse(textOf(cell))) };
  }).filter((row) => row.cells.length > 0);
  if (rows.length === 0) return;
  const header = rows[0].header ? rows.shift().cells : [];
  blocks.push({
    type: "table",
    header,
    rows: rows.map((row) => row.cells),
    ...caption ? { caption: { original: caption } } : {}
  });
}
function pushCode(node, blocks) {
  const raw = textOf(node).replace(/\r\n?/g, "\n").replace(/^\s*\n/, "").replace(/\s+$/, "");
  if (!raw.trim()) return;
  let language = null;
  for (const candidate of [node, ...findAll(node, (child) => Boolean(attr(child, "class")))]) {
    const match = /(?:^|\s)language-([A-Za-z0-9_+#.-]+)/.exec(attr(candidate, "class") || "");
    if (match) {
      language = match[1].toLowerCase();
      break;
    }
  }
  blocks.push({ type: "code", code: raw, ...language ? { language } : {} });
}
function extractArticleBlocks(html, { maxBlocks = DEFAULT_ARXIV_CONFIG.maxBlocks, baseUrl = "" } = {}) {
  const tree = parseMarkup(html, { html: true });
  const article = findFirst(tree, (node) => localName(node.name) === "article") ?? findFirst(tree, (node) => localName(node.name) === "body") ?? tree;
  const blocks = [];
  const walk = (node) => {
    if (blocks.length >= maxBlocks) return;
    if (typeof node === "string") return;
    if (!isElement(node)) return;
    const tag = localName(node.name);
    if (SKIP_TAGS.has(tag) || hasAnyClass(node, SKIP_CLASSES)) return;
    if (tag === "pre" || hasClass(node, "ltx_verbatim")) {
      pushCode(node, blocks);
      return;
    }
    if (hasClass(node, "ltx_equation") || hasClass(node, "ltx_eqn_table") || tag === "math" && attr(node, "display") === "block") {
      pushEquation(node, blocks);
      return;
    }
    if (hasClass(node, "ltx_table") || tag === "table") {
      pushTable(node, blocks);
      return;
    }
    if (tag === "figure" || hasClass(node, "ltx_figure")) {
      pushFigure(node, blocks, baseUrl);
      return;
    }
    if (/^h[1-6]$/.test(tag)) {
      pushHeading(node, blocks);
      return;
    }
    if (tag === "p" || hasClass(node, "ltx_p")) {
      pushParagraph(node, blocks);
      return;
    }
    for (const child of node.children) walk(child);
  };
  walk(article);
  return blocks;
}
function excerptBlocks(candidate) {
  const blocks = [{ type: "heading", level: 2, original: "Abstract" }];
  const summary = collapse(candidate.summary ?? "");
  if (summary) blocks.push({ type: "paragraph", original: summary });
  const abstract = collapse(candidate.abstract ?? "");
  if (!summary && abstract) blocks.push({ type: "paragraph", original: abstract });
  return blocks;
}
async function extractArxivPaper({ candidate, config, fetch: fetchImpl }) {
  const settings = withDefaults(config);
  const fallback = (warning) => ({
    blocks: excerptBlocks(candidate),
    excerpt: true,
    warnings: warning ? [warning] : []
  });
  if (settings.extractFullText === false) return fallback();
  const arxivId = candidate.arxivId || normalizeArxivId(candidate.id);
  if (!arxivId) return fallback("the candidate has no arXiv id");
  const base = String(settings.htmlBaseUrl || DEFAULT_ARXIV_CONFIG.htmlBaseUrl).replace(/\/+$/, "");
  const url = `${base}/${encodeURIComponent(arxivId)}`;
  let response;
  let html;
  try {
    ({ response, text: html } = await fetchText(fetchImpl, url, { timeoutMs: settings.timeoutMs }));
  } catch (error) {
    return fallback(`arXiv HTML unavailable: ${error?.message ?? error}`);
  }
  if (!response.ok) {
    return fallback(`arXiv HTML answered HTTP ${response.status}`);
  }
  let blocks = [];
  try {
    blocks = extractArticleBlocks(html, { maxBlocks: settings.maxBlocks, baseUrl: url });
  } catch (error) {
    return fallback(`arXiv HTML could not be parsed: ${error?.message ?? error}`);
  }
  if (textBlocksOf(blocks).length < 2) {
    return fallback("arXiv HTML did not contain readable sections");
  }
  return { blocks, excerpt: false, warnings: [] };
}
function validateArxivConfig(config, path) {
  if (!isPlainObject(config)) throw configError(`${path}: sources.arxiv must be an object`);
  if (typeof config.enabled !== "boolean") throw configError(`${path}: sources.arxiv.enabled must be true or false`);
  assertStringList(config.categories, "sources.arxiv.categories", path);
  assertStringList(config.keywords, "sources.arxiv.keywords", path);
  assertStringList(config.excludeKeywords, "sources.arxiv.excludeKeywords", path);
  if (!Number.isInteger(config.maxResults) || config.maxResults <= 0) {
    throw configError(`${path}: sources.arxiv.maxResults must be a positive integer`);
  }
  if (typeof config.extractFullText !== "boolean") {
    throw configError(`${path}: sources.arxiv.extractFullText must be true or false`);
  }
  assertPositive(config.timeoutMs, "sources.arxiv.timeoutMs", path);
  if (!Number.isInteger(config.maxBlocks) || config.maxBlocks <= 0) {
    throw configError(`${path}: sources.arxiv.maxBlocks must be a positive integer`);
  }
  assertUrl(config.baseUrl, "sources.arxiv.baseUrl", path);
  assertUrl(config.htmlBaseUrl, "sources.arxiv.htmlBaseUrl", path);
}

// src/sources/deepseek.js
var SOURCE_ID2 = "deepseek";
var DEFAULT_DEEPSEEK_CONFIG = {
  enabled: true,
  useProxy: false,
  sitemapUrl: "https://api-docs.deepseek.com/sitemap.xml",
  baseUrl: "https://api-docs.deepseek.com",
  timeoutMs: 2e4,
  // A 09:00 run must still pick up what was published the previous evening.
  lookbackDays: 1,
  maxItems: 10,
  maxBlocks: 400,
  // Four-digit slugs (`news0725`) predate the `newsYYMMDD` form and belong to
  // the year the docs site launched. They only matter for backfills.
  legacyYear: 2024,
  userAgent: "dsh-paper-reader/0.1 (+https://api-docs.deepseek.com)"
};
var NEWS_PATH = /^\/news\/(news\d{4}|news\d{6})$/;
function sourceError2(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, sourceId: SOURCE_ID2 }, extra);
}
function withDefaults2(config) {
  return { ...DEFAULT_DEEPSEEK_CONFIG, ...config ?? {} };
}
function shiftDate2(date, days) {
  const value = /* @__PURE__ */ new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function isRealDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = /* @__PURE__ */ new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function dateFromSlug(slug, legacyYear = DEFAULT_DEEPSEEK_CONFIG.legacyYear) {
  const digits = String(slug ?? "").replace(/^news/, "");
  let year;
  let month;
  let day;
  if (/^\d{6}$/.test(digits)) {
    year = 2e3 + Number(digits.slice(0, 2));
    month = Number(digits.slice(2, 4));
    day = Number(digits.slice(4, 6));
  } else if (/^\d{4}$/.test(digits)) {
    year = Number(legacyYear);
    month = Number(digits.slice(0, 2));
    day = Number(digits.slice(2, 4));
  } else {
    return null;
  }
  const value = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isRealDate(value) ? value : null;
}
function parseDeepSeekSitemap(xml, { baseUrl, legacyYear } = {}) {
  const base = String(baseUrl || DEFAULT_DEEPSEEK_CONFIG.baseUrl).replace(/\/+$/, "");
  const year = legacyYear ?? DEFAULT_DEEPSEEK_CONFIG.legacyYear;
  const tree = parseMarkup(xml, { html: false });
  const entries = [];
  const seen = /* @__PURE__ */ new Set();
  for (const loc of findAll(tree, (node) => localName(node.name) === "loc")) {
    const raw = collapse(textOf(loc));
    if (!raw) continue;
    let url;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    const match = NEWS_PATH.exec(url.pathname);
    if (!match) continue;
    const slug = match[1];
    if (seen.has(slug)) continue;
    const published = dateFromSlug(slug, year);
    if (!published) continue;
    seen.add(slug);
    entries.push({
      slug,
      published,
      url: `${base}/news/${slug}`
    });
  }
  return entries;
}
function toCandidate2(entry) {
  return {
    id: `${SOURCE_ID2}:${entry.slug}`,
    sourceId: SOURCE_ID2,
    kind: "blog",
    sourceLanguage: "zh",
    slug: entry.slug,
    // The real title is only in the Markdown, which extraction reads; this is
    // the fallback a failure would show, never the normal digest title.
    title: `DeepSeek ${entry.published}`,
    summary: "",
    url: entry.url,
    // The slug carries a calendar day, not an instant: keep the date-only form
    // so the digest writes that day at midnight UTC instead of shifting it.
    publishedAt: entry.published,
    direction: "architecture",
    tags: [SOURCE_ID2, "news"]
  };
}
async function listDeepSeek({ config, date, fetch: fetchImpl }) {
  const settings = withDefaults2(config);
  const url = settings.sitemapUrl;
  if (typeof fetchImpl !== "function") {
    throw sourceError2("deepseek_fetch_missing", "no fetch implementation was provided");
  }
  let response;
  let text3;
  try {
    ({ response, text: text3 } = await fetchText(fetchImpl, url, {
      timeoutMs: settings.timeoutMs,
      userAgent: settings.userAgent,
      accept: "application/xml, text/xml;q=0.9, */*;q=0.1"
    }));
  } catch (error) {
    throw sourceError2("deepseek_network", `DeepSeek sitemap request failed: ${error?.message ?? error}`, { cause: error });
  }
  if (!response.ok) {
    throw sourceError2("deepseek_http", `DeepSeek sitemap answered HTTP ${response.status}`, { status: response.status });
  }
  if (!/<urlset[\s>]/i.test(text3)) {
    throw sourceError2("deepseek_invalid", "DeepSeek sitemap did not return a urlset");
  }
  const from = shiftDate2(date, -Math.max(0, Number(settings.lookbackDays) || 0));
  return parseDeepSeekSitemap(text3, settings).filter((entry) => entry.published >= from && entry.published <= date).sort((left, right) => left.published === right.published ? left.slug < right.slug ? -1 : left.slug > right.slug ? 1 : 0 : left.published < right.published ? 1 : -1).slice(0, Math.max(0, Number(settings.maxItems) || 0)).map(toCandidate2);
}
var CJK = /[\u2e80-\u9fff\uac00-\ud7af\uff00-\uffef]/;
function resolveImage2(src, baseUrl = DEFAULT_DEEPSEEK_CONFIG.baseUrl) {
  const value = String(src ?? "").trim();
  if (!value) return null;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}
function stripInline(text3) {
  let value = String(text3 ?? "");
  value = value.replace(/\\([\\`*_{}\[\]()#+\-.!>~@|])/g, "$1");
  value = value.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  value = value.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  value = value.replace(/<((?:https?|mailto):[^>\s]+)>/g, "$1");
  value = value.replace(/<\/?[a-zA-Z][^>]*>/g, "");
  value = value.replace(/`([^`]*)`/g, "$1");
  value = value.replace(/\*\*([^*]+)\*\*/g, "$1");
  value = value.replace(/__([^_]+)__/g, "$1");
  value = value.replace(/~~([^~]+)~~/g, "$1");
  value = value.replace(/(^|[\s(（【])[*_]([^*_\n]+)[*_](?=$|[\s)）】.,，。:：;；!！?？])/g, "$1$2");
  value = decodeEntities(value);
  return collapse(value);
}
function joinLines(lines) {
  let value = "";
  for (const line of lines) {
    const piece = String(line).trim();
    if (!piece) continue;
    if (!value) {
      value = piece;
      continue;
    }
    const left = value.slice(-1);
    const right = piece[0];
    value += (CJK.test(left) || CJK.test(right) ? "" : " ") + piece;
  }
  return value;
}
var HEADING_LINE = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
var RULE_LINE = /^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;
var IMAGE_LINE = /^\s*!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)\s*$/;
var LIST_LINE = /^\s{0,3}(?:[-*+]|\d+[.)])\s+(.*)$/;
var QUOTE_LINE = /^\s{0,3}>\s?(.*)$/;
var FENCE_LINE = /^\s{0,3}(```+|~~~+)\s*([^\s`]*)/;
function parseMarkdownBlocks(source, { maxBlocks = DEFAULT_DEEPSEEK_CONFIG.maxBlocks, baseUrl } = {}) {
  const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  const flush = () => {
    if (paragraph.length === 0) return;
    const text3 = stripInline(joinLines(paragraph));
    paragraph = [];
    if (text3 && blocks.length < maxBlocks) blocks.push({ type: "paragraph", original: text3 });
  };
  let index = 0;
  while (index < lines.length && blocks.length < maxBlocks) {
    const line = lines[index];
    const fence = FENCE_LINE.exec(line);
    if (fence) {
      flush();
      const language = fence[2] ? fence[2].toLowerCase() : null;
      const code = [];
      index += 1;
      while (index < lines.length) {
        if (/^\s{0,3}(```+|~~~+)\s*$/.test(lines[index])) {
          index += 1;
          break;
        }
        code.push(lines[index]);
        index += 1;
      }
      const text3 = code.join("\n").replace(/\s+$/, "");
      if (text3.trim() && blocks.length < maxBlocks) {
        blocks.push({ type: "code", code: text3, ...language ? { language } : {} });
      }
      continue;
    }
    const heading = HEADING_LINE.exec(line);
    if (heading) {
      flush();
      const text3 = stripInline(heading[2]);
      if (text3 && blocks.length < maxBlocks) {
        blocks.push({ type: "heading", level: heading[1].length, original: text3 });
      }
      index += 1;
      continue;
    }
    if (RULE_LINE.test(line)) {
      flush();
      index += 1;
      continue;
    }
    const image = IMAGE_LINE.exec(line);
    if (image) {
      flush();
      const src = resolveImage2(image[2], baseUrl);
      const alt = stripInline(image[1]);
      if (src && blocks.length < maxBlocks) {
        blocks.push({ type: "figure", image: src, ...alt ? { caption: { original: alt } } : {} });
      }
      index += 1;
      continue;
    }
    if (/^\s*$/.test(line)) {
      flush();
      index += 1;
      continue;
    }
    const item = LIST_LINE.exec(line);
    if (item) {
      flush();
      const text3 = stripInline(item[1]);
      if (text3 && blocks.length < maxBlocks) blocks.push({ type: "paragraph", original: text3 });
      index += 1;
      continue;
    }
    const quote = QUOTE_LINE.exec(line);
    paragraph.push(quote ? quote[1] : line);
    index += 1;
  }
  flush();
  return blocks.slice(0, maxBlocks);
}
var GAP_SCORE = -1;
var MISMATCH_SCORE = -4;
var HEADING_MISMATCH_SCORE = -6;
function pairScore(chinese, english) {
  if (chinese.type === "heading" && english.type === "heading") return 3;
  if (chinese.type === english.type) return 3;
  if (chinese.type === "heading" || english.type === "heading") return HEADING_MISMATCH_SCORE;
  return MISMATCH_SCORE;
}
function alignBlocks(chinese, english) {
  const rows = chinese.length;
  const cols = english.length;
  const scores = Array.from({ length: rows + 1 }, () => new Array(cols + 1).fill(0));
  const choices = Array.from({ length: rows + 1 }, () => new Array(cols + 1).fill(""));
  for (let i2 = 1; i2 <= rows; i2 += 1) scores[i2][0] = scores[i2 - 1][0] + GAP_SCORE;
  for (let j2 = 1; j2 <= cols; j2 += 1) scores[0][j2] = scores[0][j2 - 1] + GAP_SCORE;
  for (let i2 = 1; i2 <= rows; i2 += 1) {
    for (let j2 = 1; j2 <= cols; j2 += 1) {
      let best = scores[i2 - 1][j2 - 1] + pairScore(chinese[i2 - 1], english[j2 - 1]);
      let choice = "pair";
      const up = scores[i2 - 1][j2] + GAP_SCORE;
      if (up > best) {
        best = up;
        choice = "chinese";
      }
      const left = scores[i2][j2 - 1] + GAP_SCORE;
      if (left > best) {
        best = left;
        choice = "english";
      }
      scores[i2][j2] = best;
      choices[i2][j2] = choice;
    }
  }
  const alignment = [];
  let i = rows;
  let j = cols;
  while (i > 0 || j > 0) {
    const choice = i > 0 && j > 0 ? choices[i][j] : i > 0 ? "chinese" : "english";
    if (choice === "pair") {
      alignment.push({ chinese: chinese[i - 1], english: english[j - 1] });
      i -= 1;
      j -= 1;
    } else if (choice === "chinese") {
      alignment.push({ chinese: chinese[i - 1], english: null });
      i -= 1;
    } else {
      alignment.push({ chinese: null, english: english[j - 1] });
      j -= 1;
    }
  }
  return alignment.reverse();
}
function figureBlock(chinese, english) {
  const image = chinese?.image ?? english?.image ?? null;
  const block = { type: "figure", image };
  const original = chinese?.caption?.original;
  if (original) {
    block.caption = { original, translation: english?.caption?.original ?? null };
  }
  return block;
}
function combineBlocks(chinese, english) {
  if (!chinese) {
    return english.type === "code" ? { ...english } : null;
  }
  if (!english) {
    if (chinese.type === "heading" || chinese.type === "paragraph") {
      return { ...chinese, translation: null };
    }
    if (chinese.type === "figure") return figureBlock(chinese, null);
    return { ...chinese };
  }
  if (chinese.type === "heading" || chinese.type === "paragraph") {
    if (english.type !== chinese.type) return { ...chinese, translation: null };
    return {
      type: chinese.type,
      ...chinese.type === "heading" ? { level: chinese.level } : {},
      original: chinese.original,
      translation: english.original
    };
  }
  if (chinese.type === "code") {
    return {
      type: "code",
      code: chinese.code ?? english.code,
      ...chinese.language || english.language ? { language: chinese.language ?? english.language } : {}
    };
  }
  if (chinese.type === "figure") return figureBlock(chinese, english);
  return null;
}
function splitTitle(blocks) {
  const index = blocks.findIndex((block) => block.type === "heading" && block.level === 1);
  if (index === -1) return { title: null, body: blocks };
  return { title: blocks[index].original, body: [...blocks.slice(0, index), ...blocks.slice(index + 1)] };
}
function textBlocksOf2(blocks) {
  return blocks.filter((block) => block.type === "heading" || block.type === "paragraph");
}
async function extractDeepSeekArticle({ candidate, config, fetch: fetchImpl }) {
  const settings = withDefaults2(config);
  const slug = slugOf(candidate);
  if (!slug) {
    return { skip: true, finalized: true, warnings: ["the candidate carries no DeepSeek news slug"] };
  }
  const base = String(settings.baseUrl || DEFAULT_DEEPSEEK_CONFIG.baseUrl).replace(/\/+$/, "");
  const urls = {
    en: `${base}/news/${slug}.md`,
    zh: `${base}/zh-cn/news/${slug}.md`
  };
  const read = async (url) => {
    try {
      const { response, text: text3 } = await fetchText(fetchImpl, url, {
        timeoutMs: settings.timeoutMs,
        userAgent: settings.userAgent,
        accept: "text/markdown, text/plain;q=0.9, */*;q=0.1"
      });
      if (!response.ok) return { ok: false, status: response.status };
      if (typeof text3 !== "string" || text3.trim().length === 0) return { ok: false, status: response.status, empty: true };
      return { ok: true, text: text3 };
    } catch (error) {
      return { ok: false, error: error?.message ?? String(error) };
    }
  };
  const [englishPage, chinesePage] = await Promise.all([read(urls.en), read(urls.zh)]);
  const englishDoc = englishPage.ok ? splitTitle(parseMarkdownBlocks(englishPage.text, { maxBlocks: settings.maxBlocks, baseUrl: base })) : { title: null, body: [] };
  const chineseDoc = chinesePage.ok ? splitTitle(parseMarkdownBlocks(chinesePage.text, { maxBlocks: settings.maxBlocks, baseUrl: base })) : { title: null, body: [] };
  if (!englishPage.ok && !chinesePage.ok) {
    return {
      skip: true,
      finalized: true,
      warnings: [
        `DeepSeek pages are unavailable for ${slug} (English: ${describeFailure(englishPage)}, Chinese: ${describeFailure(chinesePage)})`
      ]
    };
  }
  const warnings = [];
  const chineseUsable = chinesePage.ok && Boolean(chineseDoc.title);
  if (!chineseUsable) {
    if (!englishPage.ok || !englishDoc.title) {
      return {
        skip: true,
        finalized: true,
        warnings: [`DeepSeek item ${slug} has neither a Chinese nor a usable English version`]
      };
    }
    if (!chinesePage.ok) {
      warnings.push(`Chinese Markdown is missing for ${slug}; kept the English page and marked it pending`);
    } else {
      warnings.push(`Chinese Markdown has no title for ${slug}; kept the English page and marked it pending`);
    }
    const blocks2 = englishDoc.body.map((block) => block.type === "heading" || block.type === "paragraph" ? { ...block, translation: null } : { ...block });
    const firstParagraph2 = blocks2.find((block) => block.type === "paragraph");
    return {
      finalized: true,
      excerpt: false,
      sourceLanguage: "en",
      title: { original: englishDoc.title, translation: null },
      summary: firstParagraph2 ? { original: firstParagraph2.original, translation: null } : null,
      blocks: blocks2.slice(0, settings.maxBlocks),
      translationState: "pending",
      direction: classifyDirectionFor(englishDoc.title, firstParagraph2?.original),
      warnings
    };
  }
  if (!englishPage.ok) {
    warnings.push(`English Markdown is missing for ${slug}; the Chinese original is kept without a translation`);
  }
  const alignment = alignBlocks(chineseDoc.body, englishDoc.body);
  const blocks = alignment.map((pair) => combineBlocks(pair.chinese, pair.english)).filter(Boolean);
  const droppedEnglish = alignment.filter((pair) => !pair.chinese && pair.english && pair.english.type !== "code").length;
  const chineseOnly = alignment.filter((pair) => pair.chinese && !pair.english).length;
  if (droppedEnglish > 0) {
    warnings.push(`${droppedEnglish} English block${droppedEnglish === 1 ? "" : "s"} have no Chinese counterpart in ${slug}; dropped`);
  }
  if (chineseOnly > 0) {
    warnings.push(`${chineseOnly} Chinese block${chineseOnly === 1 ? "" : "s"} have no English counterpart in ${slug}; left untranslated`);
  }
  const textBlocks = textBlocksOf2(blocks);
  const translated = textBlocks.filter((block) => Boolean(block.translation)).length;
  const translationState = textBlocks.length === 0 || translated === textBlocks.length ? "complete" : translated === 0 ? "pending" : "partial";
  const firstParagraph = blocks.find((block) => block.type === "paragraph");
  const summary = firstParagraph ? { original: firstParagraph.original, translation: firstParagraph.translation ?? null } : null;
  return {
    finalized: true,
    excerpt: false,
    sourceLanguage: "zh",
    title: {
      original: chineseDoc.title,
      translation: englishDoc.title ?? null
    },
    summary,
    blocks: blocks.slice(0, settings.maxBlocks),
    translationState,
    direction: classifyDirectionFor(chineseDoc.title, firstParagraph?.original),
    warnings
  };
}
function slugOf(candidate) {
  if (typeof candidate?.slug === "string" && candidate.slug.length > 0) return candidate.slug;
  const match = /\/(?:zh-cn\/)?news\/(news\d{4}|news\d{6})(?:\.md)?\/?$/.exec(String(candidate?.url ?? ""));
  return match ? match[1] : null;
}
function describeFailure(page) {
  if (page?.status) return `HTTP ${page.status}`;
  return page?.error ? String(page.error) : "unavailable";
}
function classifyDirectionFor(title, summary) {
  return classifyDirection({ title: title ?? "", summary: summary ?? "" });
}
function validateDeepSeekConfig(config, path) {
  if (!isPlainObject(config)) throw configError(`${path}: sources.deepseek must be an object`);
  if (typeof config.enabled !== "boolean") {
    throw configError(`${path}: sources.deepseek.enabled must be true or false`);
  }
  assertUrl(config.sitemapUrl, "sources.deepseek.sitemapUrl", path);
  assertUrl(config.baseUrl, "sources.deepseek.baseUrl", path);
  assertPositive(config.timeoutMs, "sources.deepseek.timeoutMs", path);
  if (!Number.isInteger(config.lookbackDays) || config.lookbackDays < 0) {
    throw configError(`${path}: sources.deepseek.lookbackDays must be a non-negative integer`);
  }
  if (!Number.isInteger(config.maxItems) || config.maxItems <= 0) {
    throw configError(`${path}: sources.deepseek.maxItems must be a positive integer`);
  }
  if (!Number.isInteger(config.maxBlocks) || config.maxBlocks <= 0) {
    throw configError(`${path}: sources.deepseek.maxBlocks must be a positive integer`);
  }
  if (!Number.isInteger(config.legacyYear) || config.legacyYear < 1990 || config.legacyYear > 2100) {
    throw configError(`${path}: sources.deepseek.legacyYear must be a four-digit year`);
  }
}

// src/sources/hf.js
var SOURCE_ID3 = "hf";
var DEFAULT_HF_CONFIG = {
  enabled: true,
  useProxy: true,
  baseUrl: "https://huggingface.co/api/daily_papers",
  maxItems: 50,
  timeoutMs: 2e4,
  userAgent: "dsh-paper-reader/0.1 (+https://huggingface.co)"
};
var DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
function sourceError3(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, sourceId: SOURCE_ID3 }, extra);
}
function withDefaults3(config) {
  return { ...DEFAULT_HF_CONFIG, ...config ?? {} };
}
function collapseText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
function buildDailyPapersUrl({ baseUrl, date, limit }) {
  if (typeof date !== "string" || !DATE_PATTERN.test(date)) {
    throw sourceError3("hf_date_required", `the HF daily list needs a YYYY-MM-DD date, got ${date}`);
  }
  const url = new URL(baseUrl || DEFAULT_HF_CONFIG.baseUrl);
  url.searchParams.set("date", date);
  if (Number.isInteger(limit) && limit > 0) url.searchParams.set("limit", String(limit));
  return url.toString();
}
function keywordList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((keyword) => collapseText(keyword).toLowerCase()).filter(Boolean);
}
function arxivIdOf(paper) {
  const raw = paper?.id;
  if (typeof raw !== "string" || raw.trim().length === 0) return "";
  const normalized = normalizeArxivId(raw);
  return /^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})$/.test(normalized) ? normalized : "";
}
function toCandidate3(entry) {
  const paper = entry.paper ?? entry;
  const arxivId = arxivIdOf(paper);
  if (!arxivId) return null;
  const title = collapseText(paper.title);
  const summary = collapseText(paper.summary);
  const aiSummary = collapseText(paper.ai_summary) || null;
  const aiKeywords = keywordList(paper.ai_keywords);
  const publishedAt = paper.publishedAt ?? entry.publishedAt ?? null;
  const direction = classifyDirection({ title, summary: `${summary}
${aiSummary ?? ""}` });
  return {
    id: `${SOURCE_ID3}:${arxivId}`,
    sourceId: SOURCE_ID3,
    kind: "paper",
    arxivId,
    sourceLanguage: "en",
    title,
    summary,
    aiSummary,
    aiKeywords,
    upvotes: Number(paper.upvotes) || 0,
    githubRepo: typeof paper.githubRepo === "string" && paper.githubRepo.trim().length > 0 ? paper.githubRepo.trim() : null,
    authors: Array.isArray(paper.authors) ? paper.authors.map((author) => collapseText(author?.name ?? author)).filter(Boolean) : [],
    url: `https://arxiv.org/abs/${arxivId}`,
    // HF lists the paper it recommends; the arXiv id is where its body lives.
    extractVia: "arxiv",
    publishedAt,
    published: publishedAt ? String(publishedAt).slice(0, 10) : null,
    direction,
    tags: [...new Set(aiKeywords)]
  };
}
function byUpvotesDesc(left, right) {
  if (left.upvotes !== right.upvotes) return right.upvotes - left.upvotes;
  const a = Date.parse(left.publishedAt ?? "") || 0;
  const b = Date.parse(right.publishedAt ?? "") || 0;
  if (a !== b) return b - a;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}
function parseDailyPapers(payload) {
  let parsed = payload;
  if (typeof payload === "string") {
    try {
      parsed = JSON.parse(payload);
    } catch {
      throw sourceError3("hf_invalid", "the HF daily list did not return JSON");
    }
  }
  if (!Array.isArray(parsed)) {
    throw sourceError3("hf_invalid", "the HF daily list did not return a JSON array");
  }
  return parsed.map(toCandidate3).filter(Boolean).sort(byUpvotesDesc);
}
async function listHf({ config, date, fetch: fetchImpl } = {}) {
  const settings = withDefaults3(config);
  const url = buildDailyPapersUrl({ baseUrl: settings.baseUrl, date, limit: settings.maxItems });
  if (typeof fetchImpl !== "function") {
    throw sourceError3("hf_fetch_missing", "no fetch implementation was provided");
  }
  let response;
  let text3;
  try {
    ({ response, text: text3 } = await fetchText(fetchImpl, url, {
      timeoutMs: settings.timeoutMs,
      userAgent: settings.userAgent,
      accept: "application/json, text/plain;q=0.9, */*;q=0.1"
    }));
  } catch (error) {
    if (error?.code === "hf_date_required") throw error;
    throw sourceError3("hf_network", `the HF daily list request failed: ${error?.message ?? error}`, { cause: error });
  }
  if (!response.ok) {
    throw sourceError3("hf_http", `the HF daily list answered HTTP ${response.status}`, { status: response.status });
  }
  return parseDailyPapers(text3);
}
function validateHfConfig(config, path) {
  if (!isPlainObject(config)) throw configError(`${path}: sources.hf must be an object`);
  assertUrl(config.baseUrl, "sources.hf.baseUrl", path);
  if (!Number.isInteger(config.maxItems) || config.maxItems <= 0) {
    throw configError(`${path}: sources.hf.maxItems must be a positive integer`);
  }
  assertPositive(config.timeoutMs, "sources.hf.timeoutMs", path);
}

// src/shared/url.js
function normalizeUrl(value) {
  try {
    const url = new URL(String(value));
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return String(value ?? "").trim().replace(/\/+$/, "");
  }
}
function slugFromUrl(value) {
  const text3 = String(value ?? "").trim();
  if (!text3) return "";
  try {
    const url = new URL(text3);
    const segments = url.pathname.split("/").filter(Boolean);
    return segments.length > 0 ? segments[segments.length - 1] : "";
  } catch {
    return "";
  }
}

// src/sources/blog.js
var SKIP_TAGS2 = /* @__PURE__ */ new Set([
  "script",
  "style",
  "nav",
  "header",
  "footer",
  "aside",
  "form",
  "button",
  "svg",
  "noscript",
  "template",
  "iframe"
]);
var SKIP_CLASSES2 = ["sr-only", "visually-hidden", "screen-reader-text"];
var ARTICLE_TYPES = /* @__PURE__ */ new Set(["article", "newsarticle", "blogposting", "techarticle", "report", "scholarlyarticle"]);
function slugToTitle(value) {
  const slug = String(value ?? "").replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop() ?? "";
  return slug.replace(/\.[a-z0-9]+$/i, "").split(/[-_]+/).filter(Boolean).map((word) => word.length <= 2 ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1)).join(" ");
}
function parseJsonLd(tree) {
  const entries = [];
  const visit = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value["@graph"])) {
      for (const item of value["@graph"]) visit(item);
      return;
    }
    entries.push(value);
  };
  for (const script of findAll(tree, (node) => localName(node.name) === "script" && /ld\+json/i.test(attr(node, "type") ?? ""))) {
    const raw = textOf(script).trim();
    if (!raw) continue;
    try {
      visit(JSON.parse(raw));
    } catch {
    }
  }
  return entries;
}
function typesOf(value) {
  const raw = value?.["@type"];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.filter((type) => typeof type === "string").map((type) => type.toLowerCase());
}
function stringOrNull(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
function nameOf(value) {
  if (typeof value === "string") return stringOrNull(value);
  if (value && typeof value === "object") return stringOrNull(value.name);
  return null;
}
function namesOf(value) {
  const list = Array.isArray(value) ? value : [value];
  return list.map(nameOf).filter(Boolean);
}
function urlOf(value) {
  if (typeof value === "string") return stringOrNull(value);
  if (value && typeof value === "object") return stringOrNull(value["@id"]) ?? stringOrNull(value.url);
  return null;
}
function articleMeta(entries) {
  const article = entries.find((entry) => typesOf(entry).some((type) => ARTICLE_TYPES.has(type))) ?? entries.find((entry) => stringOrNull(entry?.headline)) ?? {};
  return {
    title: stringOrNull(article.headline) ?? stringOrNull(article.name),
    description: stringOrNull(article.description),
    datePublished: dateOnly(article.datePublished),
    dateModified: dateOnly(article.dateModified),
    authors: namesOf(article.author),
    publisher: nameOf(article.publisher),
    url: urlOf(article.mainEntityOfPage) ?? stringOrNull(article.url)
  };
}
function fallbackTitle(tree) {
  const heading = findFirst(tree, (node) => localName(node.name) === "h1");
  const headingText = heading ? collapse(textOf(heading)) : "";
  if (headingText) return headingText;
  const title = findFirst(tree, (node) => localName(node.name) === "title");
  const titleText = title ? collapse(textOf(title)) : "";
  return titleText.split(/\s+[\\|—–-]\s+/)[0].trim();
}
function timeDate(tree) {
  const time = findFirst(tree, (node) => localName(node.name) === "time" && Boolean(attr(node, "datetime")));
  return time ? dateOnly(attr(time, "datetime")) : null;
}
function inlineText2(node) {
  if (typeof node === "string") return node;
  if (!isElement(node)) return "";
  const tag = localName(node.name);
  if (SKIP_TAGS2.has(tag) || hasAnyClass(node, SKIP_CLASSES2)) return "";
  if (tag === "br") return " ";
  if (tag === "img") {
    const alt = attr(node, "alt");
    return alt ? ` ${alt} ` : "";
  }
  if (tag === "math") {
    const alttext = attr(node, "alttext");
    return alttext ? ` $${alttext}$ ` : ` ${textOf(node)} `;
  }
  return node.children.map(inlineText2).join("");
}
function cleanCaption(value) {
  return collapse(value).replace(/^(?:Figure|Fig\.|Table)\s*\d+[:.]\s*/i, "");
}
function resolveImage3(src, baseUrl) {
  const raw = stringOrNull(src);
  if (!raw || raw.startsWith("data:")) return null;
  try {
    return new URL(raw, baseUrl || void 0).toString();
  } catch {
    return raw;
  }
}
function pushCode2(node, blocks) {
  const code = textOf(node).replace(/\r\n?/g, "\n").replace(/\s+$/, "");
  if (!code.trim()) return;
  let language = null;
  for (const candidate of [node, ...findAll(node, (child) => Boolean(attr(child, "class")))]) {
    const match = /(?:^|\s)language-([A-Za-z0-9_+#.-]+)/.exec(attr(candidate, "class") ?? "");
    if (match) {
      language = match[1].toLowerCase();
      break;
    }
  }
  blocks.push({ type: "code", code, ...language ? { language } : {} });
}
function extractBlogBlocks(root, {
  maxBlocks = 400,
  title = "",
  dedupeImages = false,
  baseUrl = null,
  // OpenAI's page is the same shape but keeps its own rules: the h1 is item
  // metadata (never a body block), headings go to h6 and only `<p>` is prose.
  skipH1 = false,
  headingLevels = 4,
  paragraphTags = ["p", "blockquote", "li"],
  codeBlockClass = true
} = {}) {
  const blocks = [];
  const seenImages = /* @__PURE__ */ new Set();
  const titleKey = collapse(title).toLowerCase();
  const headingPattern = new RegExp(`^h[1-${headingLevels}]$`);
  const pushHeading2 = (node) => {
    const text3 = collapse(inlineText2(node));
    if (!text3) return;
    const level = Number(localName(node.name).slice(1)) || 2;
    if (level === 1 && (skipH1 || text3.toLowerCase() === titleKey)) return;
    blocks.push({ type: "heading", level, original: text3 });
  };
  const pushParagraph2 = (node) => {
    const text3 = collapse(inlineText2(node));
    if (text3.length < 2) return;
    blocks.push({ type: "paragraph", original: text3 });
  };
  const pushFigure2 = (node) => {
    const captionNode = findFirst(node, (child) => localName(child.name) === "figcaption" || hasClass(child, "caption") || hasClass(child, "figure-caption"));
    const caption = captionNode ? cleanCaption(textOf(captionNode)) : "";
    const imageNode = findFirst(node, (child) => localName(child.name) === "img" && Boolean(attr(child, "src")));
    const image = imageNode ? resolveImage3(attr(imageNode, "src"), baseUrl) : null;
    if (dedupeImages && image) {
      if (seenImages.has(image)) return;
      seenImages.add(image);
    }
    if (!caption && !image) return;
    blocks.push({
      type: "figure",
      image,
      ...caption ? { caption: { original: caption } } : {}
    });
  };
  const walk = (node) => {
    if (blocks.length >= maxBlocks) return;
    if (!isElement(node)) return;
    const tag = localName(node.name);
    if (SKIP_TAGS2.has(tag) || hasAnyClass(node, SKIP_CLASSES2)) return;
    if (tag === "pre" || codeBlockClass && hasClass(node, "code-block")) {
      pushCode2(node, blocks);
      return;
    }
    if (tag === "figure") {
      pushFigure2(node, blocks);
      return;
    }
    if (headingPattern.test(tag)) {
      pushHeading2(node);
      return;
    }
    if (paragraphTags.includes(tag)) {
      pushParagraph2(node);
      return;
    }
    for (const child of node.children) walk(child);
  };
  walk(root);
  return blocks;
}

// src/sources/anthropic.js
var SOURCE_ID4 = "anthropic";
var DEFAULT_ANTHROPIC_CONFIG = {
  enabled: true,
  useProxy: false,
  sitemapUrl: "https://www.anthropic.com/sitemap.xml",
  prefixes: ["/news/", "/research/"],
  excludePaths: ["/page/"],
  recentDays: 30,
  maxCandidates: 12,
  maxSeenUrls: 1e3,
  timeoutMs: 2e4,
  maxBlocks: 400,
  extractFullText: true,
  userAgent: "dsh-paper-reader/0.1 (+https://www.anthropic.com)"
};
function sourceError4(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, sourceId: SOURCE_ID4 }, extra);
}
function withDefaults4(config) {
  return { ...DEFAULT_ANTHROPIC_CONFIG, ...config ?? {} };
}
function parseSitemap(xml) {
  const tree = parseMarkup(xml, { html: false });
  const entries = [];
  for (const node of findAll(tree, (item) => localName(item.name) === "url")) {
    const locNode = findAll(node, (item) => localName(item.name) === "loc")[0];
    const lastmodNode = findAll(node, (item) => localName(item.name) === "lastmod")[0];
    const loc = locNode ? textOf(locNode).trim() : "";
    if (!loc) continue;
    entries.push({ loc, lastmod: lastmodNode ? dateOnly(textOf(lastmodNode)) : null });
  }
  return entries;
}
function isArticleUrl(loc, settings) {
  let url;
  try {
    url = new URL(loc);
  } catch {
    return false;
  }
  const path = url.pathname.replace(/\/+$/, "");
  const roots = settings.prefixes.map((prefix) => prefix.replace(/\/+$/, ""));
  if (!roots.some((root) => path === root || path.startsWith(`${root}/`))) return false;
  if (settings.excludePaths.some((fragment) => path.includes(fragment))) return false;
  return !roots.includes(path);
}
function toCandidate4(entry) {
  const path = new URL(entry.loc).pathname.replace(/^\/+|\/+$/g, "");
  const title = slugToTitle(path);
  return {
    id: `${SOURCE_ID4}:${path}`,
    sourceId: SOURCE_ID4,
    kind: "blog",
    sourceLanguage: "en",
    title,
    summary: "",
    url: entry.loc,
    publishedAt: entry.lastmod ?? null,
    authors: [],
    direction: classifyDirection({ title }),
    tags: []
  };
}
async function listAnthropic({ config, date, fetch: fetchImpl, knownUrls = [] } = {}) {
  const settings = withDefaults4(config);
  let response;
  let text3;
  try {
    ({ response, text: text3 } = await fetchText(fetchImpl, settings.sitemapUrl, {
      timeoutMs: settings.timeoutMs,
      userAgent: settings.userAgent,
      accept: "application/xml, text/xml;q=0.9, */*;q=0.1"
    }));
  } catch (error) {
    throw sourceError4("anthropic_network", `Anthropic sitemap request failed: ${error?.message ?? error}`, { cause: error });
  }
  if (!response.ok) {
    throw sourceError4("anthropic_http", `Anthropic sitemap answered HTTP ${response.status}`, { status: response.status });
  }
  if (!/<(?:urlset|sitemapindex)[\s>]/i.test(text3)) {
    throw sourceError4("anthropic_invalid", "Anthropic sitemap did not return XML");
  }
  const matched = parseSitemap(text3).filter((entry) => isArticleUrl(entry.loc, settings));
  const discovered = matched.map((entry) => normalizeUrl(entry.loc));
  const known = new Set(Array.from(knownUrls ?? [], normalizeUrl));
  const fresh = matched.filter((entry) => !known.has(normalizeUrl(entry.loc)));
  const cutoff = shiftDate(date, -settings.recentDays);
  const recent = fresh.filter((entry) => !entry.lastmod || entry.lastmod >= cutoff).sort((left, right) => {
    if (left.lastmod !== right.lastmod) return String(right.lastmod ?? "").localeCompare(String(left.lastmod ?? ""));
    return left.loc.localeCompare(right.loc);
  }).slice(0, Math.max(0, settings.maxCandidates));
  return { candidates: recent.map(toCandidate4), discovered };
}
function findMain(tree) {
  return findAll(tree, (node) => localName(node.name) === "main" && (attr(node, "id") === "main-content" || (attr(node, "class") ?? "").split(/\s+/).includes("main-content")))[0] ?? null;
}
async function extractAnthropicArticle({ candidate, config, fetch: fetchImpl } = {}) {
  const settings = withDefaults4(config);
  if (settings.extractFullText === false) {
    throw sourceError4("anthropic_extract", "Anthropic full-text extraction is disabled");
  }
  const url = candidate?.url;
  if (typeof url !== "string" || url.length === 0) {
    throw sourceError4("anthropic_extract", "the candidate has no article URL");
  }
  if (typeof fetchImpl !== "function") {
    throw sourceError4("anthropic_network", "no fetch implementation was provided");
  }
  let response;
  let html;
  try {
    ({ response, text: html } = await fetchText(fetchImpl, url, {
      timeoutMs: settings.timeoutMs,
      userAgent: settings.userAgent
    }));
  } catch (error) {
    throw sourceError4("anthropic_network", `Anthropic article request failed: ${error?.message ?? error}`, { cause: error });
  }
  if (!response.ok) {
    throw sourceError4("anthropic_http", `Anthropic article answered HTTP ${response.status}`, { status: response.status });
  }
  const tree = parseMarkup(html, { html: true });
  const meta = articleMeta(parseJsonLd(tree));
  const main = findMain(tree);
  if (!main) throw sourceError4("anthropic_extract", "Anthropic article has no main#main-content");
  const title = meta.title ?? fallbackTitle(tree) ?? candidate.title;
  const blocks = extractBlogBlocks(main, {
    maxBlocks: settings.maxBlocks,
    title,
    dedupeImages: true,
    baseUrl: url
  });
  if (!blocks.some((block) => block.type === "paragraph")) {
    throw sourceError4("anthropic_extract", "Anthropic article has no readable paragraphs");
  }
  const summary = meta.description ?? candidate.summary ?? "";
  const published = meta.datePublished ?? timeDate(tree) ?? dateOnly(candidate.publishedAt) ?? null;
  return {
    blocks,
    excerpt: false,
    warnings: [],
    meta: {
      title,
      summary,
      authors: meta.authors.length > 0 ? meta.authors : candidate.authors ?? [],
      publishedAt: published ? `${published}T00:00:00.000Z` : candidate.publishedAt ?? null,
      direction: classifyDirection({ title, summary }),
      tags: [],
      url: meta.url ?? url,
      sourceLanguage: "en"
    }
  };
}
function validateAnthropicConfig(config, path) {
  if (!isPlainObject(config)) throw configError(`${path}: sources.anthropic must be an object`);
  assertUrl(config.sitemapUrl, "sources.anthropic.sitemapUrl", path);
  assertStringList(config.prefixes, "sources.anthropic.prefixes", path, { allowEmpty: false });
  assertStringList(config.excludePaths, "sources.anthropic.excludePaths", path);
  if (!Number.isInteger(config.recentDays) || config.recentDays <= 0) {
    throw configError(`${path}: sources.anthropic.recentDays must be a positive integer`);
  }
  if (!Number.isInteger(config.maxCandidates) || config.maxCandidates <= 0) {
    throw configError(`${path}: sources.anthropic.maxCandidates must be a positive integer`);
  }
  if (!Number.isInteger(config.maxSeenUrls) || config.maxSeenUrls <= 0) {
    throw configError(`${path}: sources.anthropic.maxSeenUrls must be a positive integer`);
  }
  assertPositive(config.timeoutMs, "sources.anthropic.timeoutMs", path);
  if (!Number.isInteger(config.maxBlocks) || config.maxBlocks <= 0) {
    throw configError(`${path}: sources.anthropic.maxBlocks must be a positive integer`);
  }
  if (typeof config.extractFullText !== "boolean") {
    throw configError(`${path}: sources.anthropic.extractFullText must be true or false`);
  }
}

// src/sources/kimi.js
var SOURCE_ID5 = "kimi";
var DEFAULT_KIMI_CONFIG = {
  enabled: true,
  useProxy: false,
  listUrl: "https://www.kimi.com/blog/",
  baseUrl: "https://www.kimi.com",
  recentDays: 30,
  maxCandidates: 20,
  timeoutMs: 2e4,
  maxBlocks: 400,
  extractFullText: true,
  userAgent: "dsh-paper-reader/0.1 (+https://www.kimi.com)"
};
function sourceError5(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, sourceId: SOURCE_ID5 }, extra);
}
function withDefaults5(config) {
  return { ...DEFAULT_KIMI_CONFIG, ...config ?? {} };
}
function kimiSlugOf(href, baseUrl = DEFAULT_KIMI_CONFIG.baseUrl) {
  let url;
  try {
    url = new URL(String(href), baseUrl);
  } catch {
    return null;
  }
  const match = /\/(?:en\/)?blog\/([^/?#]+)\/?$/.exec(url.pathname);
  return match ? match[1] : null;
}
function parseKimiList(html, { baseUrl = DEFAULT_KIMI_CONFIG.baseUrl } = {}) {
  const tree = parseMarkup(html, { html: true });
  const cards = [];
  let current = null;
  const walk = (node) => {
    if (!isElement(node)) return;
    const tag = localName(node.name);
    if (tag === "a") {
      const href = attr(node, "href");
      const slug = kimiSlugOf(href, baseUrl);
      if (slug) {
        const label = collapse(attr(node, "aria-label") ?? "");
        current = { slug, title: label || null, date: null };
        cards.push(current);
      }
    } else if (hasClass(node, "card-title")) {
      if (current && !current.title) current.title = collapse(textOf(node));
    } else if (hasClass(node, "card-date")) {
      if (current && !current.date) current.date = dateOnly(textOf(node));
    } else if (tag === "time" && attr(node, "datetime") && current && !current.date) {
      current.date = dateOnly(attr(node, "datetime"));
    }
    for (const child of node.children) walk(child);
  };
  walk(tree);
  const seen = /* @__PURE__ */ new Set();
  return cards.filter((card) => {
    if (seen.has(card.slug)) return false;
    seen.add(card.slug);
    return true;
  }).map((card) => ({
    ...card,
    title: card.title || slugToTitle(card.slug)
  }));
}
function toCandidate5(card, settings) {
  return {
    id: `${SOURCE_ID5}:${card.slug}`,
    sourceId: SOURCE_ID5,
    kind: "blog",
    sourceLanguage: "en",
    title: card.title,
    summary: "",
    url: `${String(settings.baseUrl).replace(/\/+$/, "")}/en/blog/${card.slug}`,
    publishedAt: card.date,
    authors: [],
    direction: classifyDirection({ title: card.title }),
    tags: []
  };
}
async function listKimi({ config, date, fetch: fetchImpl } = {}) {
  const settings = withDefaults5(config);
  let response;
  let html;
  try {
    ({ response, text: html } = await fetchText(fetchImpl, settings.listUrl, {
      timeoutMs: settings.timeoutMs,
      userAgent: settings.userAgent
    }));
  } catch (error) {
    throw sourceError5("kimi_network", `Kimi blog request failed: ${error?.message ?? error}`, { cause: error });
  }
  if (!response.ok) {
    throw sourceError5("kimi_http", `Kimi blog answered HTTP ${response.status}`, { status: response.status });
  }
  const cutoff = shiftDate(date, -settings.recentDays);
  const candidates = parseKimiList(html, { baseUrl: settings.baseUrl }).filter((card) => !card.date || card.date >= cutoff).sort((left, right) => {
    if (left.date !== right.date) return String(right.date ?? "").localeCompare(String(left.date ?? ""));
    return left.slug.localeCompare(right.slug);
  }).slice(0, Math.max(0, settings.maxCandidates)).map((card) => toCandidate5(card, settings));
  return { candidates, discovered: candidates.map((candidate) => candidate.url) };
}
function findMain2(tree) {
  return findAll(tree, (node) => localName(node.name) === "main" && hasClass(node, "layout-content"))[0] ?? null;
}
async function extractKimiArticle({ candidate, config, fetch: fetchImpl } = {}) {
  const settings = withDefaults5(config);
  if (settings.extractFullText === false) {
    throw sourceError5("kimi_extract", "Kimi full-text extraction is disabled");
  }
  const url = candidate?.url;
  if (typeof url !== "string" || url.length === 0) {
    throw sourceError5("kimi_extract", "the candidate has no article URL");
  }
  if (typeof fetchImpl !== "function") {
    throw sourceError5("kimi_network", "no fetch implementation was provided");
  }
  let response;
  let html;
  try {
    ({ response, text: html } = await fetchText(fetchImpl, url, {
      timeoutMs: settings.timeoutMs,
      userAgent: settings.userAgent
    }));
  } catch (error) {
    throw sourceError5("kimi_network", `Kimi article request failed: ${error?.message ?? error}`, { cause: error });
  }
  if (!response.ok) {
    throw sourceError5("kimi_http", `Kimi article answered HTTP ${response.status}`, { status: response.status });
  }
  const tree = parseMarkup(html, { html: true });
  const meta = articleMeta(parseJsonLd(tree));
  const main = findMain2(tree);
  if (!main) throw sourceError5("kimi_extract", "Kimi article has no main.layout-content");
  const title = meta.title ?? fallbackTitle(tree) ?? candidate.title;
  const blocks = extractBlogBlocks(main, {
    maxBlocks: settings.maxBlocks,
    title,
    dedupeImages: true,
    baseUrl: url
  });
  if (!blocks.some((block) => block.type === "paragraph")) {
    throw sourceError5("kimi_extract", "Kimi article has no readable paragraphs");
  }
  const summary = meta.description ?? candidate.summary ?? "";
  const published = meta.datePublished ?? dateOnly(candidate.publishedAt) ?? null;
  return {
    blocks,
    excerpt: false,
    warnings: [],
    meta: {
      title,
      summary,
      authors: meta.authors.length > 0 ? meta.authors : candidate.authors ?? [],
      publishedAt: published ? `${published}T00:00:00.000Z` : candidate.publishedAt ?? null,
      direction: classifyDirection({ title, summary }),
      tags: [],
      url: meta.url ?? url,
      sourceLanguage: "en"
    }
  };
}
function validateKimiConfig(config, path) {
  if (!isPlainObject(config)) throw configError(`${path}: sources.kimi must be an object`);
  assertUrl(config.listUrl, "sources.kimi.listUrl", path);
  assertUrl(config.baseUrl, "sources.kimi.baseUrl", path);
  if (!Number.isInteger(config.recentDays) || config.recentDays <= 0) {
    throw configError(`${path}: sources.kimi.recentDays must be a positive integer`);
  }
  if (!Number.isInteger(config.maxCandidates) || config.maxCandidates <= 0) {
    throw configError(`${path}: sources.kimi.maxCandidates must be a positive integer`);
  }
  assertPositive(config.timeoutMs, "sources.kimi.timeoutMs", path);
  if (!Number.isInteger(config.maxBlocks) || config.maxBlocks <= 0) {
    throw configError(`${path}: sources.kimi.maxBlocks must be a positive integer`);
  }
  if (typeof config.extractFullText !== "boolean") {
    throw configError(`${path}: sources.kimi.extractFullText must be true or false`);
  }
}

// src/sources/openai.js
var SOURCE_ID6 = "openai";
var DEFAULT_OPENAI_CONFIG = {
  // OpenAI ships opt-in: its RSS list is direct, but the article page is only
  // reachable through the user's proxy and the site terms for that fetch are
  // still being reviewed. Enable it with `sources.openai.enabled`.
  enabled: false,
  // `useProxy` marks the source as proxied (as ticket 05 records for OpenAI).
  // `extractViaProxy` narrows that to the article page: the RSS list stays
  // direct, and a missing proxy degrades to the RSS excerpt instead of
  // skipping the source.
  useProxy: true,
  extractViaProxy: true,
  rssUrl: "https://openai.com/news/rss.xml",
  timeoutMs: 2e4,
  maxItems: 40,
  extractFullText: true,
  maxBlocks: 300,
  userAgent: "dsh-paper-reader/0.1 (+https://openai.com/news/rss.xml)"
};
var EXCERPT_REASONS = {
  proxy_unavailable: "\u4EE3\u7406\u4E0D\u53EF\u7528\uFF0C\u4EC5\u663E\u793A RSS \u8282\u9009",
  full_text_disabled: "\u5DF2\u5173\u95ED\u5168\u6587\u62BD\u53D6\uFF0C\u4EC5\u663E\u793A RSS \u8282\u9009",
  http_403: "\u6587\u7AE0\u9875\u8FD4\u56DE 403\uFF0C\u4EC5\u663E\u793A RSS \u8282\u9009",
  http_error: "\u6587\u7AE0\u9875\u8FD4\u56DE\u9519\u8BEF\uFF0C\u4EC5\u663E\u793A RSS \u8282\u9009",
  network: "\u6587\u7AE0\u9875\u8BF7\u6C42\u5931\u8D25\uFF0C\u4EC5\u663E\u793A RSS \u8282\u9009",
  extract_failed: "\u6B63\u6587\u62BD\u53D6\u5931\u8D25\uFF0C\u4EC5\u663E\u793A RSS \u8282\u9009"
};
function sourceError6(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, sourceId: SOURCE_ID6 }, extra);
}
function withDefaults6(config) {
  return { ...DEFAULT_OPENAI_CONFIG, ...config ?? {} };
}
function plainText(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/<[a-z!/]/i.test(raw)) return collapse(textOf(parseMarkup(raw, { html: true })));
  return collapse(decodeEntities(raw));
}
function firstText2(node, name2) {
  return collapse(textOf(childrenOf(node, name2)[0] ?? null));
}
function parseRssFeed(xml) {
  const tree = parseMarkup(xml, { html: false });
  const channel = findFirst(tree, (node) => localName(node.name) === "channel") ?? tree;
  return childrenOf(channel, "item").map((item) => {
    const rawTitle = firstText2(item, "title");
    const linkNode = childrenOf(item, "link")[0] ?? null;
    const link = collapse(attr(linkNode, "href") ?? textOf(linkNode));
    const guid = firstText2(item, "guid");
    const published = firstText2(item, "pubDate") || firstText2(item, "dc:date");
    return {
      title: plainText(rawTitle),
      dek: plainText(firstText2(item, "description")),
      link: link || (/^https?:\/\//i.test(guid) ? guid : ""),
      guid,
      categories: childrenOf(item, "category").map((category) => collapse(textOf(category))).filter(Boolean),
      published
    };
  }).filter((entry) => entry.title.length > 0);
}
function isoDate(value) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}
function toCandidate6(entry) {
  const slug = slugFromUrl(entry.link) || entry.guid || entry.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const publishedAt = isoDate(entry.published);
  const summary = entry.dek;
  return {
    id: `${SOURCE_ID6}:${slug}`,
    sourceId: SOURCE_ID6,
    kind: "blog",
    sourceLanguage: "en",
    title: entry.title,
    summary,
    url: entry.link || null,
    publishedAt,
    published: publishedAt ? publishedAt.slice(0, 10) : null,
    authors: [],
    categories: entry.categories,
    venue: entry.categories[0] ? `OpenAI ${entry.categories[0]}` : "OpenAI",
    direction: classifyDirection({ title: entry.title, summary }),
    tags: [...new Set(entry.categories)]
  };
}
function byPublishedDesc2(left, right) {
  const a = Date.parse(left.publishedAt ?? "") || 0;
  const b = Date.parse(right.publishedAt ?? "") || 0;
  if (a !== b) return b - a;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}
async function listOpenAi({ config, fetch: fetchImpl } = {}) {
  const settings = withDefaults6(config);
  const url = settings.rssUrl || DEFAULT_OPENAI_CONFIG.rssUrl;
  let response;
  let text3;
  try {
    ({ response, text: text3 } = await fetchText(fetchImpl, url, {
      timeoutMs: settings.timeoutMs,
      userAgent: settings.userAgent,
      accept: "application/rss+xml, application/xml;q=0.9, text/html;q=0.8, */*;q=0.1"
    }));
  } catch (error) {
    throw sourceError6("openai_network", `OpenAI RSS request failed: ${error?.message ?? error}`, { cause: error });
  }
  if (!response.ok) {
    throw sourceError6("openai_http", `OpenAI RSS answered HTTP ${response.status}`, { status: response.status });
  }
  if (!/<rss[\s>]/i.test(text3) && !/<channel[\s>]/i.test(text3)) {
    throw sourceError6("openai_invalid", "OpenAI RSS did not return an RSS feed");
  }
  const limit = Number.isInteger(settings.maxItems) && settings.maxItems > 0 ? settings.maxItems : DEFAULT_OPENAI_CONFIG.maxItems;
  return parseRssFeed(text3).map(toCandidate6).filter((candidate) => candidate.title).sort(byPublishedDesc2).slice(0, limit);
}
function textBlocksOf3(blocks) {
  return blocks.filter((block) => block.type === "heading" || block.type === "paragraph");
}
function articleRoot(tree) {
  return findFirst(tree, (node) => localName(node.name) === "main") ?? findFirst(tree, (node) => localName(node.name) === "article") ?? findFirst(tree, (node) => localName(node.name) === "body") ?? tree;
}
function authorText(node) {
  const collect = (current) => {
    if (typeof current === "string") return current;
    if (!isElement(current)) return "";
    const tag = localName(current.name);
    if (tag === "time" || hasClass(current, "date") || hasClass(current, "timestamp")) return "";
    return current.children.map(collect).join("");
  };
  return collapse(collect(node));
}
function authorsOf(tree, main) {
  const names = [];
  const specific = findAll(main, (node) => attr(node, "rel") === "author" || hasClass(node, "author"));
  const bylines = specific.length > 0 ? [] : findAll(main, (node) => hasClass(node, "byline"));
  const metas = findAll(tree, (node) => localName(node.name) === "meta" && ["author", "article:author"].includes(attr(node, "name") ?? attr(node, "property")));
  for (const node of [...specific, ...bylines, ...metas]) {
    const value = localName(node.name) === "meta" ? collapse(attr(node, "content")) : authorText(node);
    if (value && !names.includes(value)) names.push(value);
  }
  return names;
}
function publishedAtOf(tree, main) {
  const timeNode = findFirst(main, (node) => localName(node.name) === "time");
  const declared = attr(timeNode, "datetime") || (timeNode ? textOf(timeNode) : "");
  const fromTime = isoDate(collapse(declared));
  if (fromTime) return fromTime;
  const meta = findFirst(tree, (node) => localName(node.name) === "meta" && ["article:published_time", "datePublished"].includes(attr(node, "property") ?? attr(node, "name")));
  return meta ? isoDate(attr(meta, "content")) : null;
}
function extractOpenAiPage(html, { maxBlocks = DEFAULT_OPENAI_CONFIG.maxBlocks } = {}) {
  const tree = parseMarkup(html, { html: true });
  const main = articleRoot(tree);
  const titleNode = findFirst(main, (node) => localName(node.name) === "h1");
  const blocks = extractBlogBlocks(main, {
    maxBlocks,
    skipH1: true,
    headingLevels: 6,
    paragraphTags: ["p"],
    codeBlockClass: false
  });
  return {
    title: titleNode ? collapse(textOf(titleNode)) : null,
    publishedAt: publishedAtOf(tree, main),
    authors: authorsOf(tree, main),
    blocks
  };
}
function openAiExcerptBlocks(candidate) {
  const dek = collapse(candidate?.summary ?? "");
  return dek ? [{ type: "paragraph", original: dek }] : [];
}
function degraded(candidate, code, detail = null) {
  const message = EXCERPT_REASONS[code] ?? EXCERPT_REASONS.extract_failed;
  return {
    blocks: openAiExcerptBlocks(candidate),
    excerpt: true,
    warnings: [detail ? `${message}\uFF08${detail}\uFF09` : message],
    excerptReason: { code, message, ...detail ? { detail: String(detail) } : {} }
  };
}
async function extractOpenAiArticle({ candidate, config, fetch: fetchImpl, proxy = null } = {}) {
  const settings = withDefaults6(config);
  if (settings.extractFullText === false) return degraded(candidate, "full_text_disabled");
  if (proxy && proxy.available === false) {
    return degraded(candidate, "proxy_unavailable", proxy.reason ?? proxy.error ?? proxy.code ?? null);
  }
  if (typeof candidate?.url !== "string" || candidate.url.length === 0) {
    return degraded(candidate, "extract_failed", "the candidate has no article URL");
  }
  let response;
  let html;
  try {
    ({ response, text: html } = await fetchText(fetchImpl, candidate.url, {
      timeoutMs: settings.timeoutMs,
      userAgent: settings.userAgent,
      accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1"
    }));
  } catch (error) {
    return degraded(candidate, "network", error?.message ?? error);
  }
  if (!response.ok) {
    if (response.status === 403) return degraded(candidate, "http_403");
    return degraded(candidate, "http_error", `HTTP ${response.status}`);
  }
  let page;
  try {
    page = extractOpenAiPage(html, { maxBlocks: settings.maxBlocks });
  } catch (error) {
    return degraded(candidate, "extract_failed", error?.message ?? error);
  }
  const paragraphs = page.blocks.filter((block) => block.type === "paragraph").length;
  if (textBlocksOf3(page.blocks).length < 2 || paragraphs === 0) {
    return degraded(candidate, "extract_failed", "the page did not contain readable sections");
  }
  return {
    blocks: page.blocks,
    excerpt: false,
    warnings: [],
    title: page.title || candidate.title,
    publishedAt: page.publishedAt || candidate.publishedAt || null,
    authors: page.authors
  };
}
function validateOpenAiConfig(config, path) {
  if (!isPlainObject(config)) throw configError(`${path}: sources.openai must be an object`);
  if (typeof config.enabled !== "boolean") throw configError(`${path}: sources.openai.enabled must be true or false`);
  if (typeof config.extractViaProxy !== "boolean") {
    throw configError(`${path}: sources.openai.extractViaProxy must be true or false`);
  }
  if (typeof config.extractFullText !== "boolean") {
    throw configError(`${path}: sources.openai.extractFullText must be true or false`);
  }
  assertUrl(config.rssUrl, "sources.openai.rssUrl", path);
  assertPositive(config.timeoutMs, "sources.openai.timeoutMs", path);
  if (!Number.isInteger(config.maxItems) || config.maxItems <= 0) {
    throw configError(`${path}: sources.openai.maxItems must be a positive integer`);
  }
  if (!Number.isInteger(config.maxBlocks) || config.maxBlocks <= 0) {
    throw configError(`${path}: sources.openai.maxBlocks must be a positive integer`);
  }
}

// src/sources/registry.js
var SOURCES = {
  arxiv: {
    id: "arxiv",
    kind: "paper",
    label: "arXiv",
    short: "A",
    defaults: DEFAULT_ARXIV_CONFIG,
    tracksSeen: false,
    onExtractFailure: "excerpt",
    list: listArxiv,
    extract: extractArxivPaper,
    validateConfig: validateArxivConfig
  },
  deepseek: {
    id: "deepseek",
    kind: "blog",
    label: "DeepSeek",
    short: "D",
    defaults: DEFAULT_DEEPSEEK_CONFIG,
    tracksSeen: false,
    onExtractFailure: "skip",
    list: listDeepSeek,
    extract: extractDeepSeekArticle,
    validateConfig: validateDeepSeekConfig
  },
  hf: {
    id: "hf",
    kind: "paper",
    label: "Hugging Face",
    short: "H",
    defaults: DEFAULT_HF_CONFIG,
    tracksSeen: false,
    onExtractFailure: "excerpt",
    list: listHf,
    validateConfig: validateHfConfig
  },
  anthropic: {
    id: "anthropic",
    kind: "blog",
    label: "Anthropic",
    short: "C",
    defaults: DEFAULT_ANTHROPIC_CONFIG,
    tracksSeen: true,
    onExtractFailure: "skip",
    list: listAnthropic,
    extract: extractAnthropicArticle,
    validateConfig: validateAnthropicConfig
  },
  kimi: {
    id: "kimi",
    kind: "blog",
    label: "Kimi",
    short: "K",
    defaults: DEFAULT_KIMI_CONFIG,
    tracksSeen: false,
    onExtractFailure: "skip",
    list: listKimi,
    extract: extractKimiArticle,
    validateConfig: validateKimiConfig
  },
  openai: {
    id: "openai",
    kind: "blog",
    label: "OpenAI",
    short: "O",
    defaults: DEFAULT_OPENAI_CONFIG,
    tracksSeen: false,
    onExtractFailure: "excerpt",
    list: listOpenAi,
    extract: extractOpenAiArticle,
    validateConfig: validateOpenAiConfig
  }
};
var SOURCE_IDS = Object.keys(SOURCES);

// src/status.js
var RUN_STATUS_SCHEMA_VERSION = 1;
var SOURCE_LABELS = Object.freeze(Object.fromEntries(
  Object.entries(SOURCES).map(([id, definition]) => [id, definition.label])
));
var SOURCE_FAILED_CODE = "source_failed";
var SOURCE_SKIPPED_CODE = "source_skipped";
function isObject2(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function text2(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}
function count(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}
function optionalCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
function sourceCode(source, status) {
  const declared = text2(source.code);
  if (declared) return declared;
  if (status === "failed") return SOURCE_FAILED_CODE;
  if (status === "skipped") return SOURCE_SKIPPED_CODE;
  return null;
}
function summarizeSource(source) {
  if (!isObject2(source) || typeof source.id !== "string" || source.id.length === 0) return null;
  const status = source.status === "ok" || source.status === "skipped" ? source.status : "failed";
  const code = sourceCode(source, status);
  return {
    id: source.id,
    label: text2(source.label) ?? SOURCE_LABELS[source.id] ?? source.id,
    status,
    items: count(source.items),
    code,
    reason: text2(source.reason) ?? code,
    error: text2(source.error)
  };
}
function summarizeTranslation(value) {
  if (!isObject2(value)) return null;
  return {
    status: text2(value.status),
    reason: text2(value.reason),
    model: text2(value.model),
    targetLanguage: text2(value.targetLanguage),
    tokensUsed: optionalCount(value.tokensUsed),
    tokenBudget: optionalCount(value.tokenBudget),
    budgetExceeded: value.budgetExceeded === true,
    pendingItems: optionalCount(value.pendingItems)
  };
}
function summarizeRun(record, { date = null, path = null } = {}) {
  if (!isObject2(record)) return null;
  const sources = (Array.isArray(record.sources) ? record.sources : []).map(summarizeSource).filter(Boolean);
  const failureSources = sources.filter((source) => source.status === "failed");
  const skippedSources = sources.filter((source) => source.status === "skipped");
  const status = record.status === "ok" || record.status === "partial" || record.status === "failed" ? record.status : "unknown";
  return {
    schemaVersion: RUN_STATUS_SCHEMA_VERSION,
    date: text2(record.date) ?? date,
    status,
    dryRun: record.dryRun === true,
    startedAt: text2(record.startedAt),
    finishedAt: text2(record.finishedAt),
    durationMs: optionalCount(record.durationMs),
    items: count(record.counts?.items),
    counts: {
      items: count(record.counts?.items),
      fullText: count(record.counts?.fullText),
      excerpt: count(record.counts?.excerpt),
      translated: count(record.counts?.translated),
      translationPending: count(record.counts?.translationPending)
    },
    sources,
    failedSources: failureSources,
    skippedSources,
    translation: summarizeTranslation(record.translation),
    runPath: path
  };
}
async function readRunStatus({ root }) {
  const latest = await readLatestRun({ root });
  return {
    schemaVersion: RUN_STATUS_SCHEMA_VERSION,
    source: latest ? "run" : null,
    date: latest?.date ?? null,
    latest: latest ? summarizeRun(latest.record, { date: latest.date, path: latest.path }) : null
  };
}

// src/index.js
var name = "dsh-paper-reader";
var inject = ["webServer"];
var INDEX_ROUTE = "/api/paper-reader/index";
var STATUS_ROUTE = "/api/paper-reader/status";
var DIGEST_ROUTE = "/api/paper-reader/digest";
var DIGEST_DATE_PREFIX = DIGEST_ROUTE;
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
    if (typeof dir === "string" && isAbsolute(dir)) return dirname3(dirname3(dir));
  } catch {
  }
  return process.env.DSH_HOME || join3(homedir(), ".dsh");
}
function resolveDataRoot(ctx) {
  return join3(resolveDshHome(ctx), "paper-reader");
}
function resolveDigestPath(ctx) {
  return join3(resolveDataRoot(ctx), "digest.json");
}
function digestProblem(value) {
  const problems = validateDigest(value);
  return problems.length > 0 ? problems[0] : null;
}
async function readLegacyDigest(ctx) {
  const path = resolveDigestPath(ctx);
  let text3;
  try {
    text3 = await readFile2(path, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    const sample = JSON.parse(await readFile2(SAMPLE_PATH, "utf8"));
    return { ...sample, demo: true, digestPath: path };
  }
  if (Buffer.byteLength(text3, "utf8") > MAX_DAY_BYTES) {
    throw Object.assign(new Error("digest.json is larger than 8 MiB"), { status: 413 });
  }
  let parsed;
  try {
    parsed = JSON.parse(text3);
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
  const base = `${DIGEST_ROUTE}/`;
  if (!pathname.startsWith(base)) return null;
  const rest = pathname.slice(base.length);
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
          indexPath: join3(dataRoot(), "index.json")
        };
      })
    }),
    "dsh-paper-reader: index route"
  );
  ctx.effect(
    () => ctx.webServer.register({
      kind: "exact",
      path: STATUS_ROUTE,
      handler: (req, res) => guard(ctx, req, res, async () => {
        try {
          return await readRunStatus({ root: dataRoot() });
        } catch (error) {
          throw Object.assign(new Error(String(error?.message ?? error)), {
            status: error?.status ?? 500,
            code: "status_unavailable"
          });
        }
      })
    }),
    "dsh-paper-reader: run status route"
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
