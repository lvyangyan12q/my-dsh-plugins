window.__ModuleLoader__.load({ id: 'dsh-paper-reader', factory: (require) => { var module = { exports: {} }; var exports = module.exports;

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.jsx
var index_exports = {};
__export(index_exports, {
  PaperReaderPage: () => PaperReaderPage,
  PaperReaderPanelIcon: () => PaperReaderPanelIcon,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");

// src/shared/date.js
function dateOnly(value) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? "").trim());
  return match ? match[1] : null;
}
function localDate(date = /* @__PURE__ */ new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// src/shared/blocks.js
var TEXT_BLOCK_TYPES = Object.freeze(["heading", "paragraph"]);
var NEUTRAL_BLOCK_TYPES = Object.freeze(["equation", "figure", "code"]);
var TEXT = new Set(TEXT_BLOCK_TYPES);
var NEUTRAL = new Set(NEUTRAL_BLOCK_TYPES);

// src/shared/schema.js
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
function isTranslationState(value) {
  return value === "pending" || value === "complete" || value === "partial";
}
function stateFor(explicit, translation) {
  if (isTranslationState(explicit)) return explicit;
  return translation ? "complete" : "pending";
}
function isPair(value) {
  return isObject(value) && (has(value, "original") || has(value, "translation"));
}
function toPair(value, legacy = {}) {
  if (isPair(value)) {
    const translation2 = text(value.translation);
    return {
      original: text(value.original),
      translation: translation2,
      translationState: stateFor(value.translationState, translation2)
    };
  }
  const translation = text(legacy.translation);
  return {
    original: text(legacy.original),
    translation,
    translationState: stateFor(legacy.state, translation)
  };
}
function toOptionalPair(value, legacy = {}) {
  if (isPair(value)) return toPair(value);
  if (text(legacy.original) || text(legacy.translation)) return toPair(void 0, legacy);
  return null;
}
function normalizeBlock(raw) {
  if (!isObject(raw)) return null;
  switch (raw.type) {
    case "heading": {
      const pair = toPair(raw, { original: raw.en, translation: raw.zh, state: raw.zhState });
      if (!pair.original && !pair.translation) return null;
      return { type: "heading", level: Number(raw.level) || 1, ...pair };
    }
    case "paragraph": {
      const pair = toPair(raw, { original: raw.en, translation: raw.zh, state: raw.zhState });
      if (!pair.original && !pair.translation) return null;
      return { type: "paragraph", ...pair };
    }
    case "equation": {
      return {
        type: "equation",
        display: typeof raw.display === "string" ? raw.display : "",
        detail: typeof raw.detail === "string" ? raw.detail : "",
        label: text(raw.label),
        note: toOptionalPair(raw.note, { original: raw.noteEn, translation: raw.noteZh })
      };
    }
    case "figure": {
      const caption = toOptionalPair(raw.caption, { original: raw.captionEn, translation: raw.captionZh });
      const diagram = isObject(raw.diagram) ? {
        title: text(raw.diagram.title),
        steps: Array.isArray(raw.diagram.steps) ? raw.diagram.steps.filter((step) => typeof step === "string") : []
      } : null;
      if (!caption && !diagram && !text(raw.image)) return null;
      return { type: "figure", diagram, image: text(raw.image), caption };
    }
    case "code": {
      if (typeof raw.code !== "string") return null;
      return { type: "code", code: raw.code, language: text(raw.language) };
    }
    default:
      return null;
  }
}
function normalizeReadingMinutes(value) {
  if (value === null || value === void 0) return null;
  const minutes = Number(value);
  return Number.isFinite(minutes) ? minutes : null;
}
function normalizeExcerptReason(value) {
  if (!isObject(value)) return null;
  const code = text(value.code);
  const message = text(value.message);
  if (!code && !message) return null;
  return {
    code: code ?? "excerpt",
    message: message ?? "\u4EC5\u663E\u793A\u8282\u9009",
    detail: text(value.detail)
  };
}
function normalizeItem(raw) {
  if (!isObject(raw) || typeof raw.id !== "string" || raw.id.length === 0) return null;
  const sourceLanguage = raw.sourceLanguage === "zh" ? "zh" : "en";
  const title = toPair(raw.title, { original: raw.titleEn, translation: raw.titleZh });
  if (!title.original && !title.translation) return null;
  const summary = toPair(raw.summary, { original: raw.summaryEn, translation: raw.summaryZh });
  const blocks = Array.isArray(raw.blocks) ? raw.blocks.map(normalizeBlock).filter(Boolean) : [];
  const pairs = blocks.filter((block) => TEXT_TYPES.has(block.type));
  const total = pairs.length;
  const done = pairs.filter((block) => Boolean(block.translation)).length;
  const explicit = raw.translationState ?? raw.translation?.status;
  const derived = total === 0 || done === total ? "complete" : done === 0 ? "pending" : "partial";
  const translationState = isTranslationState(explicit) ? explicit : derived;
  const publishedAt = text(raw.publishedAt);
  return {
    id: raw.id,
    // `source`/`published` are read as v1 aliases; only `sourceId` and
    // `publishedAt` are written by the pipeline.
    sourceId: text(raw.sourceId) ?? text(raw.source),
    sourceLanguage,
    title,
    summary,
    authors: Array.isArray(raw.authors) ? raw.authors.filter((author) => typeof author === "string") : [],
    org: text(raw.org),
    venue: text(raw.venue),
    publishedAt,
    published: dateOnly(publishedAt) ?? text(raw.published),
    collectedAt: text(raw.collectedAt),
    direction: text(raw.direction),
    tags: Array.isArray(raw.tags) ? raw.tags.filter((tag) => typeof tag === "string") : [],
    readingMinutes: normalizeReadingMinutes(raw.readingMinutes),
    excerpt: raw.excerpt === true,
    excerptReason: normalizeExcerptReason(raw.excerptReason),
    url: text(raw.url),
    bookmarked: raw.bookmarked === true,
    read: raw.read === true,
    blocks,
    translationState,
    translation: { status: translationState, done, total }
  };
}
function normalizeDigest(digest) {
  if (!isObject(digest)) return null;
  if (Array.isArray(digest.days)) {
    const days = [];
    for (const day of digest.days) {
      if (!isObject(day) || typeof day.date !== "string") continue;
      const items = Array.isArray(day.items) ? day.items.map(normalizeItem).filter(Boolean) : [];
      days.push({ ...day, items });
    }
    return {
      ...digest,
      schemaVersion: Number(digest.schemaVersion) || 1,
      days
    };
  }
  if (typeof digest.date === "string" && Array.isArray(digest.items)) {
    const items = digest.items.map(normalizeItem).filter(Boolean);
    return {
      ...digest,
      schemaVersion: Number(digest.schemaVersion) || 1,
      days: [{ date: digest.date, generatedAt: digest.generatedAt, run: digest.run, items }]
    };
  }
  return null;
}
function pickText(pair, sourceLanguage, targetLanguage) {
  if (!isObject(pair)) return { text: null, fallback: false };
  const original = text(pair.original);
  const translation = text(pair.translation);
  const wantsOriginal = (sourceLanguage === "zh" ? "zh" : "en") === targetLanguage;
  const preferred = wantsOriginal ? original : translation;
  const secondary = wantsOriginal ? translation : original;
  if (preferred) return { text: preferred, fallback: false };
  if (secondary) return { text: secondary, fallback: true };
  return { text: null, fallback: false };
}
function otherLanguage(language) {
  return language === "zh" ? "en" : "zh";
}
var BLOCK_TYPES = {
  text: [...TEXT_BLOCK_TYPES],
  neutral: [...NEUTRAL_BLOCK_TYPES]
};

// src/client/data.js
var STORAGE_KEY = "dsh-paper-reader:v1";
var MODE_IDS = ["both", "zh", "en"];
var DEFAULT_PREFS = {
  mode: "both",
  direction: "all",
  source: "all",
  bookmarksOnly: false,
  activeId: null,
  read: [],
  bookmarks: [],
  collapsed: [],
  sidebarCollapsed: false,
  outlineOpen: false
};
var WEEKDAYS = ["\u5468\u65E5", "\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D"];
function readStoredPrefs(storage = globalThis.localStorage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { prefs: { ...DEFAULT_PREFS }, stored: false };
    const value = JSON.parse(raw);
    const prefs = { ...DEFAULT_PREFS, ...value && typeof value === "object" ? value : {} };
    prefs.mode = MODE_IDS.includes(prefs.mode) ? prefs.mode : "both";
    prefs.direction = typeof prefs.direction === "string" ? prefs.direction : "all";
    prefs.source = typeof prefs.source === "string" ? prefs.source : "all";
    prefs.activeId = typeof prefs.activeId === "string" ? prefs.activeId : null;
    for (const key of ["read", "bookmarks", "collapsed"]) {
      prefs[key] = Array.isArray(prefs[key]) ? prefs[key].filter((entry) => typeof entry === "string") : [];
    }
    prefs.bookmarksOnly = prefs.bookmarksOnly === true;
    prefs.sidebarCollapsed = prefs.sidebarCollapsed === true;
    prefs.outlineOpen = prefs.outlineOpen === true;
    return { prefs, stored: true };
  } catch {
    return { prefs: { ...DEFAULT_PREFS }, stored: false };
  }
}
function flattenDigest(digest) {
  if (!digest || !Array.isArray(digest.days)) return [];
  const items = [];
  for (const day of digest.days) {
    if (!day || typeof day.date !== "string" || !Array.isArray(day.items)) continue;
    for (const item of day.items) if (item && typeof item.id === "string") items.push({ ...item, dayDate: day.date });
  }
  return items;
}
function mergeDays(previous, incoming) {
  const byDate = new Map(previous.map((day) => [day.date, day]));
  for (const day of incoming) {
    if (day && typeof day.date === "string") byDate.set(day.date, day);
  }
  return [...byDate.values()].sort((left, right) => left.date < right.date ? 1 : left.date > right.date ? -1 : 0);
}
function parseDate(value) {
  const date = /* @__PURE__ */ new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}
function dayLabel(dateStr, refStr) {
  const date = parseDate(dateStr);
  const ref = parseDate(refStr);
  if (!date) return { name: dateStr, sub: "" };
  const diff = ref ? Math.round((ref.getTime() - date.getTime()) / 864e5) : 99;
  const dateLabel = `${date.getMonth() + 1} \u6708 ${date.getDate()} \u65E5`;
  const weekday = WEEKDAYS[date.getDay()];
  if (diff >= 0 && diff < 3) return { name: ["\u4ECA\u5929", "\u6628\u5929", "\u524D\u5929"][diff], sub: `${dateLabel} \xB7 ${weekday}` };
  return { name: dateLabel, sub: weekday };
}
function matchesQuery(item, query) {
  if (!query) return true;
  const haystack = [
    item.title?.original,
    item.title?.translation,
    item.summary?.original,
    item.summary?.translation,
    item.org,
    item.venue,
    ...Array.isArray(item.authors) ? item.authors : [],
    ...Array.isArray(item.tags) ? item.tags : []
  ].filter((value) => typeof value === "string").join(" ").toLowerCase();
  return haystack.includes(query);
}
function applyBaseFilters(items, {
  query = "",
  bookmarksOnly = false,
  bookmarks = [],
  source = "all"
} = {}) {
  const normalized = String(query ?? "").trim().toLowerCase();
  const marked = new Set(bookmarks);
  const searched = items.filter((item) => matchesQuery(item, normalized) && (!bookmarksOnly || marked.has(item.id)));
  const visible = source === "all" ? searched : searched.filter((item) => item.sourceId === source);
  return { searched, visible };
}
function countBy(items, key, { allId = "all" } = {}) {
  const counts = /* @__PURE__ */ new Map([[allId, items.length]]);
  for (const item of items) {
    const value = item?.[key];
    if (typeof value !== "string") continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

// src/client/styles.css
var styles_default = `/* dsh-paper-reader: native DSH panel styles.\r
   Colors come from the host theme tokens, so the page follows the active\r
   DSH light/dark theme without its own theme switch. Reading typography uses\r
   serif stacks for prose and the host code font for data. */\r
\r
.pr-root {\r
  --pr-bg: var(--dsw-alias-bg-base, #0c0e12);\r
  --pr-panel: var(--dsw-alias-bg-layer-1, #12151c);\r
  --pr-panel-2: var(--dsw-alias-bg-layer-2, #171b24);\r
  --pr-border: var(--dsw-alias-border-l2, #232936);\r
  --pr-border-strong: var(--dsw-alias-border-l4, #313a4a);\r
  --pr-text: var(--dsw-alias-label-primary, #e6e9ef);\r
  --pr-text-2: var(--dsw-alias-label-secondary, #c9d0dc);\r
  --pr-muted: var(--dsw-alias-label-tertiary, #98a2b3);\r
  --pr-faint: var(--dsw-alias-label-caption, #6b7484);\r
  --pr-accent: var(--dsw-static-deepseek-500, #4176e6);\r
  --pr-accent-soft: color-mix(in srgb, var(--pr-accent) 14%, transparent);\r
  --pr-serif-en: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif;\r
  --pr-serif-zh: 'Songti SC', 'STSong', 'Noto Serif CJK SC', 'Source Han Serif SC', SimSun, serif;\r
  --pr-mono: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Consolas, monospace);\r
  --pr-ui: var(--dsw-font-family, system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif);\r
\r
  position: relative;\r
  display: flex;\r
  flex-direction: column;\r
  height: 100%;\r
  min-height: 0;\r
  overflow: hidden;\r
  background: var(--pr-bg);\r
  color: var(--pr-text);\r
  font-family: var(--pr-ui);\r
  font-size: 13px;\r
  line-height: 1.5;\r
  box-sizing: border-box;\r
}\r
\r
.pr-root *,\r
.pr-root *::before,\r
.pr-root *::after {\r
  box-sizing: border-box;\r
}\r
\r
.pr-root :focus-visible {\r
  outline: 2px solid color-mix(in srgb, var(--pr-accent) 60%, transparent);\r
  outline-offset: 1px;\r
}\r
\r
.pr-root button {\r
  font-family: inherit;\r
  color: inherit;\r
}\r
\r
/* ------------------------------------------------------------------ */\r
/* Top bar                                                             */\r
/* ------------------------------------------------------------------ */\r
\r
.pr-top {\r
  flex: none;\r
  height: 52px;\r
  display: flex;\r
  align-items: center;\r
  gap: 14px;\r
  padding: 0 14px;\r
  border-bottom: 1px solid var(--pr-border);\r
  background: var(--pr-panel);\r
}\r
\r
.pr-brand {\r
  display: flex;\r
  align-items: center;\r
  gap: 8px;\r
  min-width: 0;\r
  white-space: nowrap;\r
}\r
\r
.pr-brand-mark {\r
  width: 26px;\r
  height: 26px;\r
  display: inline-grid;\r
  place-items: center;\r
  border-radius: 7px;\r
  color: var(--pr-accent);\r
  background: var(--pr-accent-soft);\r
}\r
\r
.pr-brand-name {\r
  font-size: 14px;\r
  font-weight: 600;\r
  letter-spacing: .01em;\r
}\r
\r
.pr-demo {\r
  font-size: 10px;\r
  letter-spacing: .08em;\r
  padding: 1px 6px;\r
  border-radius: 4px;\r
  color: var(--pr-muted);\r
  border: 1px solid var(--pr-border-strong);\r
}\r
\r
.pr-status {\r
  flex: 1;\r
  min-width: 0;\r
  display: flex;\r
  align-items: center;\r
  gap: 8px;\r
  color: var(--pr-muted);\r
  font-size: 12px;\r
}\r
\r
.pr-status-dot {\r
  flex: none;\r
  width: 6px;\r
  height: 6px;\r
  border-radius: 50%;\r
  background: #4caf7d;\r
  box-shadow: 0 0 0 3px color-mix(in srgb, #4caf7d 18%, transparent);\r
}\r
\r
.pr-status-text {\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
/* One-line degradation notice: which sources a proxy failure skipped. */\r
.pr-proxy-notice {\r
  flex: none;\r
  display: flex;\r
  align-items: flex-start;\r
  gap: 8px;\r
  padding: 9px 20px;\r
  border-bottom: 1px solid color-mix(in srgb, #d9a441 32%, transparent);\r
  background: color-mix(in srgb, #d9a441 11%, transparent);\r
  color: color-mix(in srgb, #d9a441 62%, var(--pr-text));\r
  font-size: 12px;\r
  line-height: 1.5;\r
}\r
\r
.pr-proxy-notice-dot {\r
  flex: none;\r
  width: 6px;\r
  height: 6px;\r
  margin-top: 6px;\r
  border-radius: 50%;\r
  background: #d9a441;\r
}\r
\r
.pr-proxy-notice-text strong {\r
  margin-right: 2px;\r
  font-weight: 600;\r
  color: var(--pr-text);\r
}\r
\r
/* Latest run: time, counts, duration, token budget, failed/skipped sources. */\r
.pr-run-status {\r
  flex: none;\r
  display: flex;\r
  flex-direction: column;\r
  gap: 4px;\r
  padding: 8px 20px;\r
  border-bottom: 1px solid var(--pr-border);\r
  background: var(--pr-panel-2);\r
  color: var(--pr-muted);\r
  font-size: 12px;\r
  line-height: 1.5;\r
}\r
\r
.pr-run-status.is-failed {\r
  border-bottom-color: color-mix(in srgb, #c95b5b 38%, transparent);\r
  background: color-mix(in srgb, #c95b5b 9%, var(--pr-panel-2));\r
}\r
\r
.pr-run-status-main {\r
  display: flex;\r
  flex-wrap: wrap;\r
  align-items: center;\r
  gap: 6px;\r
}\r
\r
.pr-run-status-title {\r
  font-weight: 600;\r
  color: var(--pr-text);\r
}\r
\r
.pr-run-status-badge {\r
  flex: none;\r
  padding: 0 6px;\r
  border-radius: 4px;\r
  font-size: 10px;\r
  border: 1px solid var(--pr-border-strong);\r
}\r
\r
.pr-run-status-ok {\r
  color: #3f8f63;\r
  border-color: color-mix(in srgb, #3f8f63 45%, transparent);\r
}\r
\r
.pr-run-status-partial {\r
  color: #b07d2a;\r
  border-color: color-mix(in srgb, #b07d2a 45%, transparent);\r
}\r
\r
.pr-run-status-failed {\r
  color: #c95b5b;\r
  border-color: color-mix(in srgb, #c95b5b 45%, transparent);\r
}\r
\r
.pr-run-status-meta {\r
  color: var(--pr-muted);\r
}\r
\r
.pr-run-status-line {\r
  display: flex;\r
  flex-wrap: wrap;\r
  align-items: baseline;\r
  gap: 4px;\r
}\r
\r
.pr-run-status-failed {\r
  color: color-mix(in srgb, #c95b5b 72%, var(--pr-text));\r
}\r
\r
.pr-run-status-skipped {\r
  color: color-mix(in srgb, #d9a441 72%, var(--pr-text));\r
}\r
\r
.pr-run-status-label {\r
  flex: none;\r
  font-weight: 600;\r
}\r
\r
.pr-run-status-source {\r
  white-space: normal;\r
}\r
\r
.pr-run-status-reason {\r
  opacity: .86;\r
}\r
\r
.pr-run-status-fallback {\r
  color: var(--pr-muted);\r
}\r
\r
.pr-run-status-token.is-warn {\r
  color: #b07d2a;\r
}\r
\r
.pr-run-status-error {\r
  flex: none;\r
  padding: 8px 20px;\r
  border-bottom: 1px solid var(--pr-border);\r
  background: color-mix(in srgb, #d9a441 9%, transparent);\r
  color: color-mix(in srgb, #d9a441 68%, var(--pr-text));\r
  font-size: 12px;\r
  line-height: 1.5;\r
}\r
\r
.pr-top-actions {\r
  display: flex;\r
  align-items: center;\r
  gap: 4px;\r
}\r
\r
.pr-icon-btn {\r
  width: 30px;\r
  height: 30px;\r
  display: inline-flex;\r
  align-items: center;\r
  justify-content: center;\r
  padding: 0;\r
  border: 1px solid transparent;\r
  border-radius: 8px;\r
  background: transparent;\r
  color: var(--pr-muted);\r
  cursor: pointer;\r
}\r
\r
.pr-icon-btn:hover {\r
  background: var(--pr-panel-2);\r
  color: var(--pr-text);\r
}\r
\r
.pr-icon-btn.is-active {\r
  color: var(--pr-accent);\r
  background: var(--pr-accent-soft);\r
}\r
\r
.pr-ghost-btn {\r
  height: 30px;\r
  display: inline-flex;\r
  align-items: center;\r
  gap: 6px;\r
  padding: 0 10px;\r
  border: 1px solid var(--pr-border);\r
  border-radius: 8px;\r
  background: transparent;\r
  color: var(--pr-text-2);\r
  font-size: 12px;\r
  cursor: pointer;\r
}\r
\r
.pr-ghost-btn:hover:not(:disabled) {\r
  background: var(--pr-panel-2);\r
  border-color: var(--pr-border-strong);\r
}\r
\r
.pr-ghost-btn:disabled {\r
  opacity: .55;\r
  cursor: default;\r
}\r
\r
.pr-spin {\r
  display: inline-flex;\r
  animation: pr-spin .8s linear infinite;\r
}\r
\r
/* ------------------------------------------------------------------ */\r
/* Workspace + sidebar                                                 */\r
/* ------------------------------------------------------------------ */\r
\r
.pr-workspace {\r
  position: relative;\r
  flex: 1;\r
  min-height: 0;\r
  display: flex;\r
  container-type: inline-size;\r
}\r
\r
.pr-sidebar {\r
  width: 320px;\r
  flex: none;\r
  min-width: 0;\r
  display: flex;\r
  flex-direction: column;\r
  border-right: 1px solid var(--pr-border);\r
  background: var(--pr-panel);\r
}\r
\r
.pr-sidebar.is-collapsed {\r
  display: none;\r
}\r
\r
.pr-sidebar-head {\r
  flex: none;\r
  display: flex;\r
  flex-direction: column;\r
  gap: 9px;\r
  padding: 12px 12px 8px;\r
}\r
\r
.pr-search {\r
  position: relative;\r
  display: flex;\r
  align-items: center;\r
  height: 34px;\r
  padding: 0 8px 0 30px;\r
  border: 1px solid var(--pr-border);\r
  border-radius: 8px;\r
  background: var(--pr-panel-2);\r
}\r
\r
.pr-search:focus-within {\r
  border-color: color-mix(in srgb, var(--pr-accent) 55%, var(--pr-border));\r
  box-shadow: 0 0 0 3px var(--pr-accent-soft);\r
}\r
\r
.pr-search input {\r
  flex: 1;\r
  min-width: 0;\r
  height: 100%;\r
  border: 0;\r
  background: transparent;\r
  color: var(--pr-text);\r
  font: inherit;\r
  font-size: 13px;\r
  outline: none;\r
}\r
\r
.pr-search input::placeholder {\r
  color: var(--pr-faint);\r
}\r
\r
.pr-search input::-webkit-search-cancel-button {\r
  display: none;\r
}\r
\r
.pr-search-icon {\r
  position: absolute;\r
  left: 9px;\r
  display: inline-flex;\r
  color: var(--pr-faint);\r
}\r
\r
.pr-search-clear {\r
  display: inline-grid;\r
  place-items: center;\r
  width: 20px;\r
  height: 20px;\r
  padding: 0;\r
  border: 0;\r
  border-radius: 4px;\r
  background: transparent;\r
  color: var(--pr-faint);\r
  cursor: pointer;\r
}\r
\r
.pr-search-clear:hover {\r
  color: var(--pr-text);\r
  background: var(--pr-panel);\r
}\r
\r
.pr-kbd {\r
  font-family: var(--pr-mono);\r
  font-size: 10px;\r
  line-height: 16px;\r
  padding: 0 4px;\r
  border: 1px solid var(--pr-border);\r
  border-radius: 4px;\r
  color: var(--pr-faint);\r
}\r
\r
.pr-filters {\r
  display: flex;\r
  flex-wrap: wrap;\r
  gap: 5px;\r
}\r
\r
.pr-chip {\r
  display: inline-flex;\r
  align-items: center;\r
  gap: 5px;\r
  height: 25px;\r
  padding: 0 9px;\r
  border: 1px solid var(--pr-border);\r
  border-radius: 999px;\r
  background: transparent;\r
  color: var(--pr-muted);\r
  font-size: 11.5px;\r
  white-space: nowrap;\r
  cursor: pointer;\r
}\r
\r
.pr-chip:hover {\r
  color: var(--pr-text);\r
  border-color: var(--pr-border-strong);\r
}\r
\r
.pr-chip.is-active {\r
  color: var(--pr-accent);\r
  border-color: color-mix(in srgb, var(--pr-accent) 38%, transparent);\r
  background: var(--pr-accent-soft);\r
}\r
\r
.pr-chip-count {\r
  font-size: 10px;\r
  opacity: .7;\r
  font-variant-numeric: tabular-nums;\r
}\r
\r
.pr-chip-mark.is-active {\r
  color: #c9a227;\r
  border-color: color-mix(in srgb, #c9a227 45%, transparent);\r
  background: color-mix(in srgb, #c9a227 14%, transparent);\r
}\r
\r
.pr-result-line {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 8px;\r
  font-size: 11px;\r
  color: var(--pr-faint);\r
}\r
\r
.pr-link-btn {\r
  padding: 0;\r
  border: 0;\r
  background: none;\r
  color: var(--pr-accent);\r
  font-size: 11.5px;\r
  cursor: pointer;\r
}\r
\r
.pr-link-btn:hover {\r
  text-decoration: underline;\r
}\r
\r
.pr-feed {\r
  flex: 1;\r
  min-height: 0;\r
  overflow-y: auto;\r
  padding: 0 8px 10px;\r
}\r
\r
.pr-day + .pr-day {\r
  margin-top: 2px;\r
}\r
\r
.pr-day-head {\r
  position: sticky;\r
  top: 0;\r
  z-index: 1;\r
  width: 100%;\r
  display: flex;\r
  align-items: center;\r
  gap: 6px;\r
  padding: 8px 6px;\r
  border: 0;\r
  background: color-mix(in srgb, var(--pr-panel) 92%, transparent);\r
  backdrop-filter: blur(8px);\r
  color: var(--pr-muted);\r
  text-align: left;\r
  cursor: pointer;\r
}\r
\r
.pr-chev {\r
  flex: none;\r
  color: var(--pr-faint);\r
  transition: transform .15s ease;\r
}\r
\r
.pr-chev-open {\r
  transform: rotate(90deg);\r
}\r
\r
.pr-day-name {\r
  font-size: 12px;\r
  font-weight: 600;\r
  color: var(--pr-text-2);\r
}\r
\r
.pr-day-sub {\r
  font-size: 10.5px;\r
  color: var(--pr-faint);\r
}\r
\r
.pr-day-count {\r
  margin-left: auto;\r
  padding: 1px 6px;\r
  border-radius: 999px;\r
  background: var(--pr-panel-2);\r
  font-size: 10px;\r
  color: var(--pr-faint);\r
  font-variant-numeric: tabular-nums;\r
}\r
\r
.pr-day-items {\r
  display: flex;\r
  flex-direction: column;\r
  gap: 2px;\r
  padding-bottom: 6px;\r
}\r
\r
.pr-item {\r
  position: relative;\r
  padding: 9px 10px 10px;\r
  border: 1px solid transparent;\r
  border-radius: 9px;\r
  cursor: pointer;\r
}\r
\r
.pr-item:hover {\r
  background: var(--pr-panel-2);\r
}\r
\r
.pr-item.is-active {\r
  background: var(--pr-accent-soft);\r
  border-color: color-mix(in srgb, var(--pr-accent) 32%, transparent);\r
}\r
\r
.pr-item.is-active::before {\r
  content: '';\r
  position: absolute;\r
  left: 0;\r
  top: 10px;\r
  bottom: 10px;\r
  width: 2px;\r
  border-radius: 2px;\r
  background: var(--pr-accent);\r
}\r
\r
.pr-item-head {\r
  display: flex;\r
  align-items: center;\r
  gap: 6px;\r
  min-height: 16px;\r
  margin-bottom: 5px;\r
}\r
\r
.pr-source {\r
  flex: none;\r
  width: 16px;\r
  height: 16px;\r
  display: inline-grid;\r
  place-items: center;\r
  border: 1px solid var(--pr-border);\r
  border-radius: 4px;\r
  background: var(--pr-panel-2);\r
  color: var(--pr-text-2);\r
  font-size: 9px;\r
  font-weight: 700;\r
  line-height: 1;\r
}\r
\r
.pr-source-claude {\r
  color: #c4643f;\r
  border-color: color-mix(in srgb, #d97757 28%, transparent);\r
  background: color-mix(in srgb, #d97757 13%, transparent);\r
}\r
\r
.pr-item-time {\r
  font-size: 10.5px;\r
  color: var(--pr-faint);\r
  font-variant-numeric: tabular-nums;\r
}\r
\r
.pr-pill {\r
  padding: 1px 4px;\r
  border-radius: 3px;\r
  color: #b07d2a;\r
  background: color-mix(in srgb, #b07d2a 13%, transparent);\r
  font-size: 9.5px;\r
  line-height: 1.4;\r
}\r
\r
.pr-pill-excerpt {\r
  color: #7a6a52;\r
  background: color-mix(in srgb, #7a6a52 12%, transparent);\r
}\r
\r
.pr-item-mark {\r
  margin-left: auto;\r
  color: #c9a227;\r
  font-size: 10px;\r
}\r
\r
.pr-unread {\r
  flex: none;\r
  width: 6px;\r
  height: 6px;\r
  margin-left: auto;\r
  border-radius: 50%;\r
  background: var(--pr-accent);\r
}\r
\r
.pr-item-title-zh {\r
  display: -webkit-box;\r
  -webkit-line-clamp: 2;\r
  -webkit-box-orient: vertical;\r
  overflow: hidden;\r
  color: var(--pr-text);\r
  font-size: 13px;\r
  font-weight: 600;\r
  line-height: 1.45;\r
}\r
\r
.pr-item.is-read .pr-item-title-zh {\r
  color: var(--pr-text-2);\r
  font-weight: 500;\r
}\r
\r
.pr-item-title-en {\r
  margin-top: 2px;\r
  overflow: hidden;\r
  color: var(--pr-faint);\r
  font-family: var(--pr-serif-en);\r
  font-size: 11px;\r
  line-height: 1.4;\r
  white-space: nowrap;\r
  text-overflow: ellipsis;\r
}\r
\r
.pr-item-meta {\r
  margin-top: 6px;\r
  display: flex;\r
  align-items: center;\r
  gap: 5px;\r
  overflow: hidden;\r
  color: var(--pr-faint);\r
  font-size: 10.5px;\r
  white-space: nowrap;\r
}\r
\r
.pr-dir {\r
  padding: 0 5px;\r
  border: 1px solid color-mix(in srgb, var(--pr-dir-color) 35%, transparent);\r
  border-radius: 999px;\r
  background: color-mix(in srgb, var(--pr-dir-color) 10%, transparent);\r
  color: var(--pr-dir-color);\r
  font-size: 10px;\r
  line-height: 16px;\r
}\r
\r
.pr-dot {\r
  color: var(--pr-border-strong);\r
}\r
\r
.pr-item-venue {\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
}\r
\r
.pr-feed-empty {\r
  display: flex;\r
  flex-direction: column;\r
  align-items: center;\r
  gap: 8px;\r
  padding: 40px 16px;\r
  color: var(--pr-faint);\r
  font-size: 12px;\r
  text-align: center;\r
}\r
\r
.pr-feed-empty p {\r
  margin: 0;\r
}\r
\r
/* ------------------------------------------------------------------ */\r
/* History                                                             */\r
/* ------------------------------------------------------------------ */\r
\r
.pr-history-more {\r
  display: flex;\r
  align-items: center;\r
  justify-content: center;\r
  margin: 8px 12px 14px;\r
  padding: 7px 10px;\r
  border: 1px dashed var(--pr-border-strong);\r
  border-radius: 8px;\r
  background: transparent;\r
  color: var(--pr-muted);\r
  font-size: 11.5px;\r
  cursor: pointer;\r
}\r
\r
.pr-history-more:hover:not(:disabled) {\r
  color: var(--pr-text-2);\r
  border-color: var(--pr-accent);\r
}\r
\r
.pr-history-more:disabled {\r
  opacity: .6;\r
  cursor: default;\r
}\r
\r
.pr-day-error {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 8px;\r
  margin: 6px 12px;\r
  padding: 8px 10px;\r
  border: 1px solid color-mix(in srgb, #b56b6b 40%, transparent);\r
  border-radius: 8px;\r
  background: color-mix(in srgb, #b56b6b 8%, transparent);\r
  color: var(--pr-muted);\r
  font-size: 11px;\r
}\r
\r
.pr-day-error-body {\r
  display: flex;\r
  flex-direction: column;\r
  gap: 2px;\r
  min-width: 0;\r
}\r
\r
.pr-day-error-date {\r
  color: var(--pr-text-2);\r
  font-variant-numeric: tabular-nums;\r
}\r
\r
.pr-day-error-msg {\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.pr-empty {\r
  flex: 1;\r
  display: flex;\r
  flex-direction: column;\r
  align-items: center;\r
  justify-content: center;\r
  gap: 10px;\r
  padding: 40px;\r
  color: var(--pr-muted);\r
  font-size: 13px;\r
  text-align: center;\r
}\r
\r
.pr-empty-mark svg {\r
  width: 32px;\r
  height: 32px;\r
  color: var(--pr-faint);\r
}\r
\r
.pr-empty-title {\r
  color: var(--pr-text);\r
  font-size: 15px;\r
  font-weight: 600;\r
}\r
\r
.pr-empty-text {\r
  margin: 0;\r
  max-width: 460px;\r
  color: var(--pr-faint);\r
  font-size: 12px;\r
  line-height: 1.6;\r
}\r
\r
.pr-empty-text code {\r
  font-family: var(--pr-mono);\r
  font-size: 11px;\r
}\r
\r
.pr-sidebar-foot {\r
  flex: none;\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 8px;\r
  padding: 8px 12px;\r
  border-top: 1px solid var(--pr-border);\r
  color: var(--pr-faint);\r
  font-size: 10.5px;\r
}\r
\r
/* ------------------------------------------------------------------ */\r
/* Reader shell                                                        */\r
/* ------------------------------------------------------------------ */\r
\r
.pr-reader {\r
  flex: 1;\r
  min-width: 0;\r
  display: flex;\r
  flex-direction: column;\r
  background: var(--pr-bg);\r
}\r
\r
.pr-reader-bar {\r
  flex: none;\r
  min-height: 44px;\r
  display: flex;\r
  align-items: center;\r
  gap: 10px;\r
  padding: 0 12px;\r
  border-bottom: 1px solid var(--pr-border);\r
}\r
\r
.pr-reader-context {\r
  flex: 1;\r
  min-width: 0;\r
  overflow: hidden;\r
  color: var(--pr-faint);\r
  font-size: 11.5px;\r
  font-variant-numeric: tabular-nums;\r
  white-space: nowrap;\r
  text-overflow: ellipsis;\r
}\r
\r
.pr-reader-context span {\r
  color: var(--pr-text-2);\r
}\r
\r
.pr-mobile-only {\r
  display: none;\r
}\r
\r
.pr-mode {\r
  display: inline-flex;\r
  align-items: center;\r
  gap: 2px;\r
  padding: 2px;\r
  border: 1px solid var(--pr-border);\r
  border-radius: 999px;\r
  background: var(--pr-panel-2);\r
}\r
\r
.pr-mode-btn {\r
  height: 26px;\r
  padding: 0 11px;\r
  border: 0;\r
  border-radius: 999px;\r
  background: transparent;\r
  color: var(--pr-muted);\r
  font-size: 11.5px;\r
  white-space: nowrap;\r
  cursor: pointer;\r
}\r
\r
.pr-mode-btn:hover {\r
  color: var(--pr-text);\r
}\r
\r
.pr-mode-btn.is-active {\r
  background: var(--pr-bg);\r
  color: var(--pr-text);\r
  box-shadow: 0 1px 2px rgba(0, 0, 0, .18);\r
}\r
\r
.pr-star.is-active {\r
  color: #c9a227;\r
}\r
\r
.pr-star:disabled {\r
  opacity: .4;\r
  cursor: default;\r
}\r
\r
.pr-progress {\r
  flex: none;\r
  height: 2px;\r
}\r
\r
.pr-progress-bar {\r
  height: 100%;\r
  width: 0;\r
  background: var(--pr-accent);\r
  opacity: .7;\r
  transition: width .12s linear;\r
}\r
\r
.pr-scroll {\r
  flex: 1;\r
  min-height: 0;\r
  overflow-y: auto;\r
}\r
\r
/* ------------------------------------------------------------------ */\r
/* Paper                                                               */\r
/* ------------------------------------------------------------------ */\r
\r
.pr-paper {\r
  max-width: 1120px;\r
  margin: 0 auto;\r
  padding: 34px clamp(20px, 3.4vw, 48px) 110px;\r
}\r
\r
.pr-paper-head {\r
  margin-bottom: 26px;\r
  padding-bottom: 22px;\r
  border-bottom: 1px solid var(--pr-border);\r
}\r
\r
.pr-kicker {\r
  display: flex;\r
  flex-wrap: wrap;\r
  align-items: center;\r
  gap: 6px;\r
  color: var(--pr-muted);\r
  font-size: 11.5px;\r
}\r
\r
.pr-chip-inline {\r
  padding: 0 5px;\r
  border: 1px solid var(--pr-border);\r
  border-radius: 4px;\r
  color: var(--pr-faint);\r
  font-size: 10px;\r
  line-height: 16px;\r
}\r
\r
.pr-title-flag {\r
  margin-left: 8px;\r
  padding: 0 5px;\r
  border: 1px dashed var(--pr-border-strong);\r
  border-radius: 4px;\r
  color: var(--pr-faint);\r
  font-family: inherit;\r
  font-size: 10px;\r
  font-style: normal;\r
  font-weight: 400;\r
  vertical-align: middle;\r
}\r
\r
.pr-title-zh {\r
  margin: 12px 0 6px;\r
  color: var(--pr-text);\r
  font-size: clamp(22px, 2.1vw, 28px);\r
  font-weight: 650;\r
  line-height: 1.35;\r
  letter-spacing: .01em;\r
}\r
\r
.pr-title-en {\r
  margin: 0 0 12px;\r
  color: var(--pr-muted);\r
  font-family: var(--pr-serif-en);\r
  font-size: 15px;\r
  font-style: italic;\r
  font-weight: 400;\r
  line-height: 1.5;\r
}\r
\r
.pr-title-en-hero {\r
  margin-top: 12px;\r
  color: var(--pr-text);\r
  font-size: clamp(22px, 2.1vw, 28px);\r
  font-style: normal;\r
  font-weight: 600;\r
  line-height: 1.35;\r
}\r
\r
.pr-meta {\r
  display: flex;\r
  flex-wrap: wrap;\r
  align-items: center;\r
  gap: 6px;\r
  color: var(--pr-faint);\r
  font-size: 11.5px;\r
}\r
\r
.pr-origin {\r
  display: inline-flex;\r
  align-items: center;\r
  gap: 3px;\r
  margin-left: 2px;\r
  color: var(--pr-accent);\r
  text-decoration: none;\r
}\r
\r
.pr-origin:hover {\r
  text-decoration: underline;\r
}\r
\r
.pr-summary {\r
  margin-top: 16px;\r
  padding: 11px 14px;\r
  border-left: 2px solid var(--pr-accent);\r
  border-radius: 0 8px 8px 0;\r
  background: var(--pr-accent-soft);\r
}\r
\r
.pr-summary-label {\r
  display: block;\r
  margin-bottom: 3px;\r
  color: var(--pr-accent);\r
  font-size: 10px;\r
  letter-spacing: .14em;\r
}\r
\r
.pr-summary p {\r
  margin: 0;\r
  color: var(--pr-text-2);\r
  font-size: 13px;\r
  line-height: 1.75;\r
}\r
\r
.pr-notice {\r
  margin-top: 12px;\r
  display: flex;\r
  align-items: center;\r
  gap: 10px;\r
  padding: 6px 10px;\r
  border: 1px dashed var(--pr-border-strong);\r
  border-radius: 8px;\r
  color: var(--pr-muted);\r
  font-size: 11.5px;\r
}\r
\r
/* Why an item is only an excerpt: the reader must not mistake the RSS dek for\r
   the article body (OpenAI without a proxy, per-source extraction failure). */\r
.pr-excerpt-notice {\r
  display: flex;\r
  align-items: baseline;\r
  gap: 8px;\r
  margin-top: 10px;\r
  padding: 7px 10px;\r
  border: 1px dashed color-mix(in srgb, #d9a441 52%, transparent);\r
  border-radius: 8px;\r
  background: color-mix(in srgb, #d9a441 8%, transparent);\r
  color: var(--pr-text-2);\r
  font-size: 12px;\r
  line-height: 1.6;\r
}\r
\r
.pr-excerpt-mark {\r
  flex: none;\r
  padding: 0 5px;\r
  border-radius: 3px;\r
  background: color-mix(in srgb, #d9a441 22%, transparent);\r
  color: color-mix(in srgb, #d9a441 72%, var(--pr-text));\r
  font-size: 10px;\r
  line-height: 16px;\r
}\r
\r
.pr-excerpt-text {\r
  min-width: 0;\r
}\r
\r
.pr-excerpt-detail {\r
  color: var(--pr-faint);\r
}\r
\r
.pr-demo-note {\r
  margin-top: 12px;\r
  color: var(--pr-faint);\r
  font-size: 11px;\r
  line-height: 1.6;\r
}\r
\r
.pr-demo-note code {\r
  font-family: var(--pr-mono);\r
  font-size: 10.5px;\r
}\r
\r
/* ------------------------------------------------------------------ */\r
/* Reading modes                                                       */\r
/* ------------------------------------------------------------------ */\r
\r
.pr-legend {\r
  display: grid;\r
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);\r
  gap: clamp(24px, 4cqw, 48px);\r
  margin-bottom: 4px;\r
  padding-bottom: 6px;\r
  border-bottom: 1px solid var(--pr-border);\r
  color: var(--pr-faint);\r
  font-size: 10px;\r
  letter-spacing: .16em;\r
}\r
\r
.pr-pair {\r
  display: grid;\r
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);\r
  gap: clamp(24px, 4cqw, 48px);\r
  padding: 13px 0;\r
  border-top: 1px solid color-mix(in srgb, var(--pr-border) 55%, transparent);\r
}\r
\r
.pr-pair:first-of-type {\r
  border-top: 0;\r
}\r
\r
.pr-pair:hover {\r
  background: color-mix(in srgb, var(--pr-panel-2) 42%, transparent);\r
}\r
\r
.pr-pair-heading {\r
  margin-top: 8px;\r
  padding-top: 26px;\r
  border-top: 1px solid var(--pr-border);\r
}\r
\r
.pr-pair-heading h2,\r
.pr-pair-heading h3 {\r
  margin: 0;\r
  color: var(--pr-text);\r
  font-size: 16px;\r
  font-weight: 650;\r
  letter-spacing: .01em;\r
  line-height: 1.45;\r
}\r
\r
.pr-col p {\r
  margin: 0;\r
}\r
\r
.pr-col-en p {\r
  color: var(--pr-text-2);\r
  font-family: var(--pr-serif-en);\r
  font-size: 16px;\r
  line-height: 1.82;\r
}\r
\r
.pr-col-zh p {\r
  color: var(--pr-text);\r
  font-family: var(--pr-serif-zh);\r
  font-size: 16.5px;\r
  line-height: 1.95;\r
}\r
\r
.pr-body[data-mode='zh'],\r
.pr-body[data-mode='en'] {\r
  max-width: 760px;\r
  margin: 0 auto;\r
}\r
\r
.pr-single-paragraph {\r
  margin: 0 0 18px;\r
  color: var(--pr-text);\r
  font-family: var(--pr-serif-zh);\r
  font-size: 16.5px;\r
  line-height: 1.95;\r
}\r
\r
.pr-body[data-mode='en'] .pr-single-paragraph {\r
  color: var(--pr-text-2);\r
  font-family: var(--pr-serif-en);\r
  font-size: 16px;\r
  line-height: 1.85;\r
}\r
\r
.pr-single-heading {\r
  margin: 30px 0 14px;\r
  color: var(--pr-text);\r
  font-size: 18px;\r
  font-weight: 650;\r
  line-height: 1.4;\r
}\r
\r
.pr-body[data-mode='zh'] .pr-single-heading {\r
  font-family: var(--pr-serif-zh);\r
}\r
\r
.pr-body[data-mode='en'] .pr-single-heading {\r
  font-family: var(--pr-serif-en);\r
}\r
\r
.pr-pending {\r
  display: flex;\r
  flex-direction: column;\r
  gap: 7px;\r
  padding-top: 3px;\r
}\r
\r
.pr-skeleton {\r
  height: 10px;\r
  width: 100%;\r
  border-radius: 4px;\r
  background: linear-gradient(90deg, var(--pr-panel-2) 25%, var(--pr-panel) 37%, var(--pr-panel-2) 63%);\r
  background-size: 400% 100%;\r
  animation: pr-shimmer 1.4s ease infinite;\r
}\r
\r
.pr-skeleton-short {\r
  width: 62%;\r
}\r
\r
.pr-pending-label {\r
  color: var(--pr-faint);\r
  font-size: 11px;\r
}\r
\r
.pr-missing p {\r
  margin: 0;\r
  color: var(--pr-text-2);\r
}\r
\r
.pr-missing h2,\r
.pr-missing h3 {\r
  margin: 0;\r
  color: var(--pr-text);\r
}\r
\r
.pr-missing span {\r
  display: inline-block;\r
  margin-top: 4px;\r
  color: var(--pr-faint);\r
  font-size: 10.5px;\r
}\r
\r
/* The "untranslated, showing the original" marker, wherever it appears. */\r
.pr-fallback {\r
  display: inline-block;\r
  margin-top: 4px;\r
  color: var(--pr-faint);\r
  font-size: 10.5px;\r
  font-weight: 400;\r
}\r
\r
/* Full-width blocks: equations, figures, code share one column in \u5BF9\u7167 mode. */\r
\r
.pr-equation {\r
  margin: 22px 0;\r
  padding: 16px 20px;\r
  border: 1px solid var(--pr-border);\r
  border-radius: 10px;\r
  background: var(--pr-panel);\r
  overflow-x: auto;\r
}\r
\r
.pr-eq-line {\r
  display: flex;\r
  align-items: baseline;\r
  gap: 16px;\r
  color: var(--pr-text);\r
  font-family: 'Cambria Math', 'STIX Two Math', Cambria, serif;\r
  font-size: 17px;\r
  line-height: 1.5;\r
}\r
\r
.pr-eq-display {\r
  flex: 1;\r
  min-width: 0;\r
}\r
\r
.pr-eq-label {\r
  color: var(--pr-faint);\r
  font-size: 12px;\r
}\r
\r
.pr-eq-detail {\r
  margin-top: 6px;\r
  color: var(--pr-muted);\r
  font-family: 'Cambria Math', 'STIX Two Math', Cambria, serif;\r
  font-size: 13.5px;\r
}\r
\r
.pr-eq-note {\r
  display: grid;\r
  gap: 3px;\r
  margin-top: 12px;\r
  padding-top: 9px;\r
  border-top: 1px dashed var(--pr-border);\r
  color: var(--pr-muted);\r
  font-size: 11.5px;\r
  line-height: 1.65;\r
}\r
\r
.pr-eq-note-en {\r
  color: var(--pr-faint);\r
  font-family: var(--pr-serif-en);\r
}\r
\r
.pr-figure {\r
  margin: 24px 0;\r
  padding: 16px 18px;\r
  border: 1px solid var(--pr-border);\r
  border-radius: 10px;\r
  background: var(--pr-panel);\r
}\r
\r
.pr-diagram {\r
  display: flex;\r
  flex-wrap: wrap;\r
  align-items: center;\r
  gap: 6px;\r
  padding: 6px 2px 10px;\r
}\r
\r
.pr-diagram-step-wrap {\r
  display: inline-flex;\r
  align-items: center;\r
  gap: 6px;\r
}\r
\r
.pr-diagram-step {\r
  padding: 6px 10px;\r
  border: 1px solid color-mix(in srgb, var(--pr-accent) 30%, var(--pr-border));\r
  border-radius: 7px;\r
  background: var(--pr-accent-soft);\r
  color: var(--pr-text-2);\r
  font-size: 12px;\r
  white-space: nowrap;\r
}\r
\r
.pr-diagram-arrow {\r
  color: var(--pr-faint);\r
}\r
\r
.pr-figure-image {\r
  display: block;\r
  max-width: 100%;\r
  margin: 4px 0 10px;\r
  border-radius: 6px;\r
}\r
\r
.pr-figure-caption {\r
  display: grid;\r
  gap: 3px;\r
  color: var(--pr-muted);\r
  font-size: 11.5px;\r
  line-height: 1.65;\r
}\r
\r
.pr-figure-caption-en {\r
  color: var(--pr-faint);\r
  font-family: var(--pr-serif-en);\r
}\r
\r
.pr-code {\r
  margin: 20px 0;\r
  padding: 14px 16px;\r
  border: 1px solid var(--pr-border);\r
  border-radius: 8px;\r
  background: var(--pr-panel-2);\r
  overflow-x: auto;\r
  color: var(--pr-text-2);\r
  font-family: var(--pr-mono);\r
  font-size: 12.5px;\r
  line-height: 1.6;\r
}\r
\r
.pr-paper-end {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 12px;\r
  margin-top: 34px;\r
  padding-top: 18px;\r
  border-top: 1px solid var(--pr-border);\r
  color: var(--pr-faint);\r
  font-size: 12px;\r
}\r
\r
.pr-primary-btn {\r
  height: 32px;\r
  padding: 0 14px;\r
  border: 1px solid color-mix(in srgb, var(--pr-accent) 45%, transparent);\r
  border-radius: 8px;\r
  background: var(--pr-accent);\r
  color: #fff;\r
  font-size: 12px;\r
  cursor: pointer;\r
}\r
\r
.pr-primary-btn:hover:not(:disabled) {\r
  filter: brightness(1.06);\r
}\r
\r
.pr-primary-btn:disabled {\r
  opacity: .5;\r
  cursor: default;\r
}\r
\r
/* ------------------------------------------------------------------ */\r
/* Outline                                                             */\r
/* ------------------------------------------------------------------ */\r
\r
.pr-outline {\r
  width: 208px;\r
  flex: none;\r
  display: flex;\r
  flex-direction: column;\r
  border-left: 1px solid var(--pr-border);\r
  background: var(--pr-panel);\r
}\r
\r
.pr-outline-head {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  padding: 10px 8px 8px 14px;\r
  border-bottom: 1px solid var(--pr-border);\r
  color: var(--pr-faint);\r
  font-size: 10.5px;\r
  letter-spacing: .14em;\r
}\r
\r
.pr-outline-nav {\r
  display: flex;\r
  flex-direction: column;\r
  gap: 1px;\r
  padding: 8px;\r
  overflow-y: auto;\r
}\r
\r
.pr-outline-link {\r
  padding: 6px 8px;\r
  border: 0;\r
  border-left: 2px solid transparent;\r
  border-radius: 6px;\r
  background: transparent;\r
  color: var(--pr-muted);\r
  font-size: 12px;\r
  line-height: 1.4;\r
  text-align: left;\r
  cursor: pointer;\r
}\r
\r
.pr-outline-link:hover {\r
  background: var(--pr-panel-2);\r
  color: var(--pr-text);\r
}\r
\r
.pr-outline-link.is-sub {\r
  padding-left: 18px;\r
  font-size: 11.5px;\r
}\r
\r
.pr-outline-link.is-active {\r
  border-left-color: var(--pr-accent);\r
  background: var(--pr-accent-soft);\r
  color: var(--pr-accent);\r
}\r
\r
.pr-outline-empty {\r
  margin: 14px;\r
  color: var(--pr-faint);\r
  font-size: 11.5px;\r
  line-height: 1.6;\r
}\r
\r
/* ------------------------------------------------------------------ */\r
/* States                                                              */\r
/* ------------------------------------------------------------------ */\r
\r
.pr-loading,\r
.pr-error,\r
.pr-reader-empty {\r
  flex: 1;\r
  display: flex;\r
  flex-direction: column;\r
  align-items: center;\r
  justify-content: center;\r
  gap: 10px;\r
  padding: 40px;\r
  color: var(--pr-muted);\r
  font-size: 13px;\r
  text-align: center;\r
}\r
\r
.pr-reader-empty {\r
  height: 100%;\r
  min-height: 320px;\r
}\r
\r
.pr-reader-empty svg {\r
  width: 32px;\r
  height: 32px;\r
  color: var(--pr-faint);\r
}\r
\r
.pr-reader-empty p {\r
  margin: 0;\r
  color: var(--pr-text-2);\r
}\r
\r
.pr-reader-empty span {\r
  color: var(--pr-faint);\r
  font-size: 11.5px;\r
}\r
\r
.pr-spinner {\r
  width: 18px;\r
  height: 18px;\r
  border: 2px solid var(--pr-border-strong);\r
  border-top-color: var(--pr-accent);\r
  border-radius: 50%;\r
  animation: pr-spin .8s linear infinite;\r
}\r
\r
.pr-error-title {\r
  color: var(--pr-text);\r
  font-size: 15px;\r
  font-weight: 600;\r
}\r
\r
.pr-error-text {\r
  margin: 0;\r
  color: var(--pr-muted);\r
  font-family: var(--pr-mono);\r
  font-size: 12px;\r
}\r
\r
.pr-error-hint {\r
  margin: 0;\r
  color: var(--pr-faint);\r
  font-size: 12px;\r
}\r
\r
.pr-error-hint code {\r
  font-family: var(--pr-mono);\r
  font-size: 11px;\r
}\r
\r
.pr-toast {\r
  position: absolute;\r
  left: 50%;\r
  bottom: 22px;\r
  z-index: 50;\r
  max-width: min(520px, 86%);\r
  padding: 8px 14px;\r
  border: 1px solid var(--pr-border-strong);\r
  border-radius: 8px;\r
  background: var(--pr-panel);\r
  color: var(--pr-text);\r
  font-size: 12px;\r
  box-shadow: 0 8px 24px rgba(0, 0, 0, .18);\r
  transform: translateX(-50%);\r
}\r
\r
@keyframes pr-spin {\r
  to { transform: rotate(360deg); }\r
}\r
\r
@keyframes pr-shimmer {\r
  0% { background-position: 100% 0; }\r
  100% { background-position: 0 0; }\r
}\r
\r
/* ------------------------------------------------------------------ */\r
/* Narrow page container                                               */\r
/* ------------------------------------------------------------------ */\r
\r
@container (max-width: 1120px) {\r
  .pr-outline {\r
    position: absolute;\r
    top: 0;\r
    right: 0;\r
    bottom: 0;\r
    z-index: 20;\r
    box-shadow: -8px 0 24px rgba(0, 0, 0, .12);\r
  }\r
}\r
\r
@container (max-width: 820px) {\r
  .pr-legend {\r
    display: none;\r
  }\r
\r
  .pr-pair {\r
    grid-template-columns: minmax(0, 1fr);\r
    gap: 8px;\r
    padding: 14px 0;\r
  }\r
\r
  .pr-pair-heading {\r
    gap: 2px;\r
    padding-top: 22px;\r
  }\r
\r
  .pr-col-zh p {\r
    color: var(--pr-text-2);\r
    font-size: 16px;\r
  }\r
\r
  .pr-paper {\r
    padding-top: 24px;\r
  }\r
}\r
\r
/* Viewport-level mode: the DSH sidebar plus a right panel can make the page\r
   narrower than the viewport, so pair stacking stays on the container query\r
   while the drawer follows the window. */\r
@media (max-width: 900px) {\r
  .pr-sidebar {\r
    position: absolute;\r
    top: 0;\r
    bottom: 0;\r
    left: 0;\r
    z-index: 30;\r
    width: min(86%, 330px);\r
    transform: translateX(-100%);\r
    border-right: 1px solid var(--pr-border);\r
    box-shadow: 8px 0 24px rgba(0, 0, 0, .18);\r
    transition: transform .18s ease;\r
  }\r
\r
  .pr-sidebar.is-drawer-open {\r
    transform: translateX(0);\r
  }\r
\r
  .pr-sidebar.is-collapsed {\r
    display: flex;\r
  }\r
\r
  .pr-scrim {\r
    position: absolute;\r
    inset: 0;\r
    z-index: 25;\r
    background: var(--dsw-alias-bg-mask-2, rgba(0, 0, 0, .28));\r
  }\r
\r
  .pr-mobile-only {\r
    display: inline-flex;\r
  }\r
\r
  .pr-status,\r
  .pr-reader-context {\r
    display: none;\r
  }\r
\r
  .pr-top {\r
    gap: 8px;\r
  }\r
\r
  .pr-mode-btn {\r
    padding: 0 9px;\r
    font-size: 11px;\r
  }\r
\r
  .pr-paper {\r
    padding-top: 22px;\r
  }\r
}\r
\r
@media print {\r
  .pr-top,\r
  .pr-sidebar,\r
  .pr-outline,\r
  .pr-reader-bar,\r
  .pr-progress {\r
    display: none;\r
  }\r
\r
  .pr-root,\r
  .pr-workspace,\r
  .pr-reader,\r
  .pr-scroll {\r
    height: auto;\r
    overflow: visible;\r
  }\r
}\r
`;

// src/client/index.jsx
var import_jsx_runtime = require("react/jsx-runtime");
var STORAGE_KEY2 = "dsh-paper-reader:v1";
var PANEL_ID = "paper-reader";
var INDEX_URL = "/api/paper-reader/index";
var STATUS_URL = "/api/paper-reader/status";
var DIGEST_URL = "/api/paper-reader/digest";
var PAGE_DAYS = 7;
var MAX_HISTORY_DAYS = 30;
var MODES = [
  { id: "both", label: "\u4E2D\u82F1\u5BF9\u7167", short: "\u5BF9\u7167" },
  { id: "zh", label: "\u4EC5\u4E2D\u6587" },
  { id: "en", label: "English" }
];
var LANGUAGE_LABELS = { en: "English", zh: "\u4E2D\u6587" };
var DIRECTION_COLORS = {
  agent: "#8b7cf6",
  reasoning: "#3f9fb0",
  training: "#b07d2a",
  alignment: "#3f8f63",
  architecture: "#b56b6b"
};
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function clockTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
var SOURCE_REASON_LABELS = {
  source_failed: "\u6293\u53D6\u5931\u8D25",
  source_skipped: "\u5DF2\u8DF3\u8FC7",
  proxy_unconfigured: "\u672A\u914D\u7F6E\u4EE3\u7406",
  proxy_invalid: "\u4EE3\u7406\u5730\u5740\u65E0\u6548",
  proxy_env_disabled: "\u4EE3\u7406\u73AF\u5883\u53D8\u91CF\u672A\u542F\u7528",
  proxy_transport_missing: "\u7F3A\u5C11\u4EE3\u7406\u4F20\u8F93\u5C42",
  proxy_auth: "\u4EE3\u7406\u8BA4\u8BC1\u5931\u8D25",
  proxy_timeout: "\u4EE3\u7406\u8FDE\u63A5\u8D85\u65F6",
  proxy_unreachable: "\u4EE3\u7406\u4E0D\u53EF\u8FBE",
  proxy_http: "\u4EE3\u7406\u5065\u5EB7\u68C0\u67E5\u5931\u8D25"
};
var RUN_STATUS_LABELS = { ok: "\u6210\u529F", partial: "\u90E8\u5206\u5931\u8D25", failed: "\u5931\u8D25", unknown: "\u672A\u77E5" };
function formatDuration(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0) return "\u2014";
  const totalSeconds = Math.round(ms / 1e3);
  if (totalSeconds < 60) return `${totalSeconds} \u79D2`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes} \u5206 ${seconds} \u79D2` : `${minutes} \u5206`;
}
function sourceLabel(source) {
  return source?.label ?? source?.id ?? "\u672A\u77E5\u6765\u6E90";
}
function sourceReason(source) {
  const code = typeof source?.code === "string" ? source.code : "";
  if (code && SOURCE_REASON_LABELS[code]) return SOURCE_REASON_LABELS[code];
  if (typeof source?.reason === "string" && source.reason && source.reason !== code) return source.reason;
  if (typeof source?.error === "string" && source.error) return source.error;
  return "\u539F\u56E0\u672A\u77E5";
}
function issuesOf(status, name) {
  if (Array.isArray(status?.[name])) return status[name];
  const want = name === "failedSources" ? "failed" : "skipped";
  return (Array.isArray(status?.sources) ? status.sources : []).filter((source) => source?.status === want);
}
function RunSourceIssue({ source }) {
  const detail = source?.error && source.error !== sourceReason(source) ? source.error : "";
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "pr-run-status-source", title: detail || sourceReason(source), children: [
    sourceLabel(source),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "pr-run-status-reason", children: [
      "\uFF08",
      sourceReason(source),
      "\uFF09"
    ] })
  ] });
}
function sourceLanguageOf(item) {
  return item?.sourceLanguage === "zh" ? "zh" : "en";
}
function targetLanguageOf(mode) {
  return mode === "en" ? "en" : "zh";
}
function languageLabel(language) {
  return LANGUAGE_LABELS[language] ?? language;
}
function authorLine(authors) {
  if (!Array.isArray(authors) || authors.length === 0) return "";
  if (authors.length <= 3) return authors.join("\u3001");
  return `${authors.slice(0, 3).join("\u3001")} \u7B49 ${authors.length} \u4EBA`;
}
var SVG = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true
};
function IconSearch() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { ...SVG, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "11", cy: "11", r: "7" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m20 20-3.2-3.2" })
  ] });
}
function IconChevron({ open }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { ...SVG, className: open ? "pr-chev pr-chev-open" : "pr-chev", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m9 6 6 6-6 6" }) });
}
function IconStar({ filled }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { ...SVG, fill: filled ? "currentColor" : "none", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9Z" }) });
}
function IconRefresh() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { ...SVG, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M20 11a8 8 0 1 0-2.3 6.3" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M20 5v6h-6" })
  ] });
}
function IconOutline() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { ...SVG, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4 6h10M4 12h10M4 18h7" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M18 5v14" })
  ] });
}
function IconSidebar() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { ...SVG, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: "3", y: "4", width: "18", height: "16", rx: "2" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M9 4v16" })
  ] });
}
function IconMenu() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { ...SVG, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4 7h16M4 12h16M4 17h16" }) });
}
function IconClose() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { ...SVG, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m6 6 12 12M18 6 6 18" }) });
}
function IconBook() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { ...SVG, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4 5.5v15" })
  ] });
}
function IconLink() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { ...SVG, width: 13, height: 13, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M14 4h6v6" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M20 4 11 13" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" })
  ] });
}
function renderMath(text2) {
  const source = typeof text2 === "string" ? text2 : "";
  const regex = /(\^\{[^}]*\}|_\{[^}]*\})/;
  const nodes = [];
  let rest = source;
  let key = 0;
  while (true) {
    const match = regex.exec(rest);
    if (!match) break;
    if (match.index > 0) nodes.push(rest.slice(0, match.index));
    const token = match[0];
    const content = token.slice(2, -1);
    nodes.push(token[0] === "^" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("sup", { children: content }, `sup-${key++}`) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("sub", { children: content }, `sub-${key++}`));
    rest = rest.slice(match.index + token.length);
  }
  if (rest) nodes.push(rest);
  return nodes;
}
function SourceBadge({ source }) {
  const id = source?.id ?? "x";
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `pr-source pr-source-${id}`, title: source?.label ?? id, children: (source?.short ?? id).slice(0, 1) });
}
function PendingParagraph() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-pending", "aria-label": "\u8BE5\u6BB5\u7FFB\u8BD1\u751F\u6210\u4E2D", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-skeleton" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-skeleton pr-skeleton-short" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-pending-label", children: "\u7FFB\u8BD1\u751F\u6210\u4E2D\u2026" })
  ] });
}
function UntranslatedNote() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-fallback", children: "\u672A\u7FFB\u8BD1\uFF0C\u663E\u793A\u539F\u6587" });
}
function TranslatedText({ block }) {
  if (block.translation) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: block.translation });
  if (block.translationState === "pending") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PendingParagraph, {});
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-missing", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: block.original }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(UntranslatedNote, {})
  ] });
}
function SingleLanguageText({ pair, sourceLanguage, targetLanguage, headingLevel = 0, anchor }) {
  const picked = pickText(pair, sourceLanguage, targetLanguage);
  if (!picked.text) return null;
  const Tag = headingLevel > 0 ? headingLevel <= 2 ? "h2" : "h3" : "p";
  const className = headingLevel > 0 ? "pr-single-heading" : "pr-single-paragraph";
  if (!picked.fallback) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Tag, { className, ...anchor, children: picked.text });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-missing", ...anchor, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Tag, { className, children: picked.text }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(UntranslatedNote, {})
  ] });
}
function UnreadDot() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-unread", title: "\u672A\u8BFB" });
}
function PaperReaderPage() {
  const stored = (0, import_react.useRef)(readStoredPrefs());
  const [prefs, setPrefs] = (0, import_react.useState)(stored.current.prefs);
  const [days, setDays] = (0, import_react.useState)([]);
  const [dayErrors, setDayErrors] = (0, import_react.useState)([]);
  const [indexInfo, setIndexInfo] = (0, import_react.useState)(null);
  const [meta, setMeta] = (0, import_react.useState)({
    ready: false,
    demo: false,
    legacy: false,
    digestPath: null,
    directions: null,
    sources: null
  });
  const [loadState, setLoadState] = (0, import_react.useState)("loading");
  const [loadError, setLoadError] = (0, import_react.useState)("");
  const [runStatus, setRunStatus] = (0, import_react.useState)(null);
  const [runStatusError, setRunStatusError] = (0, import_react.useState)("");
  const [refreshing, setRefreshing] = (0, import_react.useState)(false);
  const [loadingMore, setLoadingMore] = (0, import_react.useState)(false);
  const [query, setQuery] = (0, import_react.useState)("");
  const [drawerOpen, setDrawerOpen] = (0, import_react.useState)(false);
  const [toast, setToast] = (0, import_react.useState)("");
  const [progress, setProgress] = (0, import_react.useState)(0);
  const [activeHeading, setActiveHeading] = (0, import_react.useState)(-1);
  const searchRef = (0, import_react.useRef)(null);
  const scrollRef = (0, import_react.useRef)(null);
  const restoreBlockRef = (0, import_react.useRef)(null);
  const rafRef = (0, import_react.useRef)(0);
  const toastTimerRef = (0, import_react.useRef)(0);
  const seededRef = (0, import_react.useRef)(false);
  const digestRef = (0, import_react.useRef)(null);
  const update = (0, import_react.useCallback)((patch) => setPrefs((previous) => ({ ...previous, ...patch })), []);
  const showToast = (0, import_react.useCallback)((message) => {
    setToast(message);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2800);
  }, []);
  (0, import_react.useEffect)(() => () => {
    window.clearTimeout(toastTimerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);
  const fetchJson = (0, import_react.useCallback)(async (url) => {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store"
    });
    if (!response.ok) {
      let detail = "";
      try {
        const body = await response.json();
        detail = body?.message ? `\uFF1A${body.message}` : "";
      } catch {
      }
      throw new Error(`HTTP ${response.status}${detail}`);
    }
    return response.json();
  }, []);
  const fetchDay = (0, import_react.useCallback)(async (date) => {
    const data = await fetchJson(`${DIGEST_URL}/${date}`);
    const normalized = normalizeDigest(data);
    if (!normalized) throw new Error("\u6570\u636E\u683C\u5F0F\u65E0\u6548");
    return normalized;
  }, [fetchJson]);
  const applyResults = (0, import_react.useCallback)((results, { replace = false } = {}) => {
    const loaded = [];
    const failures = [];
    for (const result of results) {
      if (result.error) failures.push({ date: result.date, message: errorMessage(result.error) });
      else loaded.push(...result.value.days);
    }
    setDays((previous) => {
      if (!replace) return mergeDays(previous, loaded);
      const touched = new Set(results.map((result) => result.date));
      return mergeDays(previous.filter((day) => touched.has(day.date)), loaded);
    });
    setDayErrors((previous) => {
      const byDate = new Map(previous.map((entry) => [entry.date, entry]));
      for (const failure of failures) byDate.set(failure.date, failure);
      for (const day of loaded) byDate.delete(day.date);
      return [...byDate.values()].sort((left, right) => left.date < right.date ? 1 : left.date > right.date ? -1 : 0);
    });
    const declared = results.flatMap((result) => !result.error && Array.isArray(result.value?.sources) ? result.value.sources : []);
    if (declared.length > 0) {
      setMeta((previous) => {
        const byId = new Map((previous.sources ?? []).map((source) => [source.id, source]));
        for (const source of declared) {
          if (source && typeof source.id === "string") byId.set(source.id, source);
        }
        return { ...previous, sources: [...byId.values()] };
      });
    }
    return loaded;
  }, []);
  const loadRunStatus = (0, import_react.useCallback)(async () => {
    try {
      const data = await fetchJson(STATUS_URL);
      const latest = data && typeof data === "object" ? data.latest : null;
      setRunStatus(latest && typeof latest === "object" ? latest : null);
      setRunStatusError("");
    } catch (error) {
      setRunStatusError(errorMessage(error));
    }
  }, [fetchJson]);
  const load = (0, import_react.useCallback)(async (isRefresh) => {
    if (isRefresh) setRefreshing(true);
    else {
      setLoadState("loading");
      setLoadError("");
    }
    try {
      let indexData;
      try {
        indexData = await fetchJson(INDEX_URL);
      } catch (error) {
        throw new Error(`\u7D22\u5F15\u8BFB\u53D6\u5931\u8D25\uFF1A${errorMessage(error)}`);
      }
      void loadRunStatus();
      const indexed = Array.isArray(indexData?.days) ? indexData.days.filter((day) => day && typeof day.date === "string") : [];
      if (indexed.length === 0) {
        const normalized = normalizeDigest(await fetchJson(DIGEST_URL));
        if (!normalized) throw new Error("\u6570\u636E\u683C\u5F0F\u65E0\u6548");
        setIndexInfo(null);
        setMeta({
          ready: true,
          demo: normalized.demo === true,
          legacy: true,
          digestPath: normalized.digestPath ?? null,
          directions: Array.isArray(normalized.directions) ? normalized.directions : null,
          sources: Array.isArray(normalized.sources) ? normalized.sources : null
        });
        setDays(normalized.days);
        setDayErrors([]);
        setLoadState("ready");
        return;
      }
      const history = indexed.slice(0, MAX_HISTORY_DAYS);
      setIndexInfo({ ...indexData, days: history });
      setMeta({
        ready: true,
        demo: indexData.demo === true,
        legacy: false,
        digestPath: indexData.indexPath ?? null,
        directions: null,
        sources: null
      });
      const wanted = history.slice(0, PAGE_DAYS).map((day) => day.date);
      const results = await Promise.all(wanted.map((date) => fetchDay(date).then(
        (value) => ({ date, value }),
        (error) => ({ date, error })
      )));
      applyResults(results, { replace: true });
      setLoadState("ready");
    } catch (error) {
      if (isRefresh && digestRef.current) {
        showToast(`\u5237\u65B0\u5931\u8D25\uFF1A${errorMessage(error)}`);
      } else {
        setLoadError(errorMessage(error));
        setLoadState("error");
      }
    } finally {
      setRefreshing(false);
    }
  }, [applyResults, fetchDay, fetchJson, loadRunStatus, showToast]);
  (0, import_react.useEffect)(() => {
    void load(false);
  }, [load]);
  (0, import_react.useEffect)(() => {
    try {
      localStorage.setItem(STORAGE_KEY2, JSON.stringify(prefs));
    } catch {
    }
  }, [prefs]);
  const digest = (0, import_react.useMemo)(() => {
    if (!meta.ready) return null;
    const flat = flattenDigest({ days });
    const sourceMap = /* @__PURE__ */ new Map();
    const directionIds = /* @__PURE__ */ new Set();
    for (const item of flat) {
      if (typeof item.sourceId === "string" && !sourceMap.has(item.sourceId)) {
        sourceMap.set(item.sourceId, {
          id: item.sourceId,
          label: item.sourceId,
          short: item.sourceId.slice(0, 1).toUpperCase()
        });
      }
      if (typeof item.direction === "string") directionIds.add(item.direction);
    }
    return {
      schemaVersion: 2,
      demo: meta.demo,
      legacy: meta.legacy,
      updatedAt: indexInfo?.updatedAt ?? null,
      digestPath: meta.digestPath,
      days,
      directions: meta.directions ?? [...directionIds].map((id) => ({ id, label: id })),
      sources: meta.sources ?? [...sourceMap.values()]
    };
  }, [days, indexInfo, meta]);
  (0, import_react.useEffect)(() => {
    digestRef.current = digest;
  }, [digest]);
  const items = (0, import_react.useMemo)(() => flattenDigest(digest), [digest]);
  const sourceById = (0, import_react.useMemo)(() => {
    const map = /* @__PURE__ */ new Map();
    for (const source of digest?.sources ?? []) map.set(source.id, source);
    return map;
  }, [digest]);
  const directions = (0, import_react.useMemo)(() => {
    const declared = Array.isArray(digest?.directions) ? digest.directions : [];
    return [{ id: "all", label: "\u5168\u90E8" }, ...declared.filter((direction) => direction && typeof direction.id === "string")];
  }, [digest]);
  const directionById = (0, import_react.useMemo)(() => new Map(directions.map((direction) => [direction.id, direction])), [directions]);
  const attemptedDates = (0, import_react.useMemo)(() => /* @__PURE__ */ new Set([
    ...days.map((day) => day.date),
    ...dayErrors.map((entry) => entry.date)
  ]), [days, dayErrors]);
  const historyDays = (0, import_react.useMemo)(() => indexInfo?.days ?? [], [indexInfo]);
  const remainingDays = (0, import_react.useMemo)(
    () => historyDays.filter((day) => !attemptedDates.has(day.date)),
    [historyDays, attemptedDates]
  );
  const proxyNotice = (0, import_react.useMemo)(() => {
    const newest = days[0];
    const sources = Array.isArray(newest?.run?.sources) ? newest.run.sources : [];
    return {
      date: newest?.date ?? null,
      sources: sources.filter((source) => source && source.status === "skipped")
    };
  }, [days]);
  const runFailedSources = (0, import_react.useMemo)(() => issuesOf(runStatus, "failedSources"), [runStatus]);
  const runSkippedSources = (0, import_react.useMemo)(() => issuesOf(runStatus, "skippedSources"), [runStatus]);
  const runTranslation = runStatus?.translation ?? null;
  const loadOlder = (0, import_react.useCallback)(async () => {
    if (loadingMore || remainingDays.length === 0) return;
    const wanted = remainingDays.slice(0, PAGE_DAYS).map((day) => day.date);
    setLoadingMore(true);
    try {
      const results = await Promise.all(wanted.map((date) => fetchDay(date).then(
        (value) => ({ date, value }),
        (error) => ({ date, error })
      )));
      applyResults(results);
    } finally {
      setLoadingMore(false);
    }
  }, [applyResults, fetchDay, loadingMore, remainingDays]);
  const retryDay = (0, import_react.useCallback)(async (date) => {
    const result = await fetchDay(date).then(
      (value) => ({ date, value }),
      (error) => ({ date, error })
    );
    applyResults([result]);
  }, [applyResults, fetchDay]);
  (0, import_react.useEffect)(() => {
    if (!digest) return;
    setPrefs((previous) => {
      const known = new Set(items.map((item) => item.id));
      let next = previous;
      if (!previous.activeId || !known.has(previous.activeId)) {
        next = { ...next, activeId: items[0]?.id ?? null };
      }
      if (!seededRef.current) {
        seededRef.current = true;
        if (!stored.current.stored) {
          next = {
            ...next,
            read: items.filter((item) => item.read === true).map((item) => item.id),
            bookmarks: items.filter((item) => item.bookmarked === true).map((item) => item.id)
          };
        }
        if (next.activeId && !next.read.includes(next.activeId)) next = { ...next, read: [...next.read, next.activeId] };
      }
      return next;
    });
  }, [digest, items]);
  const activeItem = (0, import_react.useMemo)(() => items.find((item) => item.id === prefs.activeId) ?? null, [items, prefs.activeId]);
  const activeLanguage = sourceLanguageOf(activeItem);
  const translationLanguage = otherLanguage(activeLanguage);
  const targetLanguage = targetLanguageOf(prefs.mode);
  const zhTitle = activeItem ? pickText(activeItem.title, activeLanguage, "zh") : { text: null, fallback: false };
  const enTitle = activeItem ? pickText(activeItem.title, activeLanguage, "en") : { text: null, fallback: false };
  const summaryPick = activeItem ? pickText(activeItem.summary, activeLanguage, targetLanguage) : { text: null, fallback: false };
  const normalizedQuery = query.trim().toLowerCase();
  const base = (0, import_react.useMemo)(() => applyBaseFilters(items, {
    query: normalizedQuery,
    bookmarksOnly: prefs.bookmarksOnly,
    bookmarks: prefs.bookmarks,
    source: prefs.source
  }), [items, normalizedQuery, prefs.bookmarksOnly, prefs.bookmarks, prefs.source]);
  const sourceCounts = (0, import_react.useMemo)(() => countBy(base.searched, "sourceId"), [base.searched]);
  const counts = (0, import_react.useMemo)(() => countBy(base.visible, "direction"), [base.visible]);
  const visibleItems = (0, import_react.useMemo)(
    () => base.visible.filter((item) => prefs.direction === "all" || item.direction === prefs.direction),
    [base.visible, prefs.direction]
  );
  const sourceChoices = (0, import_react.useMemo)(() => {
    const present = new Set(items.map((item) => item.sourceId).filter(Boolean));
    const declared = (Array.isArray(digest?.sources) ? digest.sources : []).filter((source) => source && typeof source.id === "string" && present.has(source.id));
    const known = new Set(declared.map((source) => source.id));
    const extra = [...present].filter((id) => !known.has(id)).map((id) => ({ id, label: id, short: id.slice(0, 1).toUpperCase() }));
    return [{ id: "all", label: "\u5168\u90E8\u6765\u6E90" }, ...declared, ...extra];
  }, [digest, items]);
  const groups = (0, import_react.useMemo)(() => {
    const byDate = new Map(visibleItems.map((item) => [item.dayDate, []]));
    for (const item of visibleItems) byDate.get(item.dayDate).push(item);
    const referenceDate = digest?.days?.[0]?.date ?? "";
    return (digest?.days ?? []).filter((day) => byDate.has(day.date)).map((day) => ({
      date: day.date,
      label: dayLabel(day.date, referenceDate),
      items: byDate.get(day.date)
    }));
  }, [digest, visibleItems]);
  const unreadCount = (0, import_react.useMemo)(() => items.filter((item) => !prefs.read.includes(item.id)).length, [items, prefs.read]);
  const bookmarkedCount = prefs.bookmarks.length;
  const activeVisibleIndex = visibleItems.findIndex((item) => item.id === prefs.activeId);
  const headings = (0, import_react.useMemo)(() => {
    if (!activeItem) return [];
    const language = sourceLanguageOf(activeItem);
    const target = targetLanguageOf(prefs.mode);
    const out = [];
    activeItem.blocks.forEach((block, index) => {
      if (block && block.type === "heading") {
        const label = pickText(block, language, target).text;
        out.push({ index, level: Number(block.level) || 1, label: label || "\u672A\u547D\u540D\u5C0F\u8282" });
      }
    });
    return out;
  }, [activeItem, prefs.mode]);
  const selectItem = (id) => {
    setPrefs((previous) => ({
      ...previous,
      activeId: id,
      read: previous.read.includes(id) ? previous.read : [...previous.read, id]
    }));
    setDrawerOpen(false);
  };
  const toggleDay = (date) => {
    setPrefs((previous) => ({
      ...previous,
      collapsed: previous.collapsed.includes(date) ? previous.collapsed.filter((entry) => entry !== date) : [...previous.collapsed, date]
    }));
  };
  const toggleBookmark = () => {
    if (!activeItem) return;
    const id = activeItem.id;
    setPrefs((previous) => ({
      ...previous,
      bookmarks: previous.bookmarks.includes(id) ? previous.bookmarks.filter((entry) => entry !== id) : [...previous.bookmarks, id]
    }));
  };
  const currentBlockIndex = () => {
    const container = scrollRef.current;
    if (!container) return null;
    const top = container.getBoundingClientRect().top + 12;
    let current = null;
    for (const element of container.querySelectorAll("[data-block]")) {
      if (element.getBoundingClientRect().top <= top) current = Number(element.getAttribute("data-block"));
      else break;
    }
    return current;
  };
  const changeMode = (mode) => {
    if (mode === prefs.mode) return;
    restoreBlockRef.current = currentBlockIndex();
    update({ mode });
  };
  const move = (delta) => {
    if (visibleItems.length === 0) return;
    const current = visibleItems.findIndex((item) => item.id === prefs.activeId);
    const index = current < 0 ? 0 : Math.min(visibleItems.length - 1, Math.max(0, current + delta));
    selectItem(visibleItems[index].id);
  };
  const scrollToBlock = (index) => {
    const container = scrollRef.current;
    const element = container?.querySelector(`[data-block="${index}"]`);
    if (!container || !element) return;
    container.scrollTop += element.getBoundingClientRect().top - container.getBoundingClientRect().top - 12;
  };
  const clearFilters = () => {
    setQuery("");
    update({ direction: "all", source: "all", bookmarksOnly: false });
  };
  const retryTranslation = () => {
    showToast("\u7FFB\u8BD1\u7531\u6BCF\u65E5 agent \u751F\u6210\uFF1B\u7F3A\u5931\u6BB5\u843D\u4F1A\u5728\u4E0B\u6B21\u6293\u53D6\u65F6\u8865\u9F50\u3002");
  };
  (0, import_react.useLayoutEffect)(() => {
    const container = scrollRef.current;
    if (container) container.scrollTop = 0;
    setProgress(0);
    setActiveHeading(-1);
  }, [prefs.activeId]);
  (0, import_react.useLayoutEffect)(() => {
    const anchor = restoreBlockRef.current;
    restoreBlockRef.current = null;
    const container = scrollRef.current;
    if (anchor === null || !container) return;
    const element = container.querySelector(`[data-block="${anchor}"]`);
    if (!element) return;
    container.scrollTop += element.getBoundingClientRect().top - container.getBoundingClientRect().top - 12;
  }, [prefs.mode]);
  const handleScroll = () => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const container = scrollRef.current;
      if (!container) return;
      const max = container.scrollHeight - container.clientHeight;
      setProgress(max > 0 ? Math.min(1, Math.max(0, container.scrollTop / max)) : 0);
      const top = container.getBoundingClientRect().top + 16;
      let current = -1;
      for (const heading of headings) {
        const element = container.querySelector(`[data-block="${heading.index}"]`);
        if (element && element.getBoundingClientRect().top <= top) current = heading.index;
      }
      setActiveHeading(current);
    });
  };
  (0, import_react.useEffect)(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const typing = target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (event.defaultPrevented) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        update({ sidebarCollapsed: !prefs.sidebarCollapsed });
        return;
      }
      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (typing) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "1") changeMode("both");
      else if (event.key === "2") changeMode("zh");
      else if (event.key === "3") changeMode("en");
      else if (event.key.toLowerCase() === "j") {
        event.preventDefault();
        move(1);
      } else if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        move(-1);
      } else if (event.key.toLowerCase() === "b") toggleBookmark();
      else if (event.key === "Escape") {
        if (query) setQuery("");
        else if (drawerOpen) setDrawerOpen(false);
        else searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
  if (loadState === "loading") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pr-root", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-loading", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-spinner" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u6B63\u5728\u8BFB\u53D6\u6700\u8FD1 7 \u5929\u2026" })
    ] }) });
  }
  if (loadState === "error") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pr-root", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-error", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pr-error-title", children: "\u65E0\u6CD5\u8BFB\u53D6\u8BBA\u6587\u5217\u8868" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "pr-error-text", children: loadError }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "pr-error-hint", children: [
        "\u6570\u636E\u6765\u81EA ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "$DSH_HOME/paper-reader/index.json" }),
        " \u4E0E",
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "digest/YYYY-MM-DD.json" }),
        "\uFF1B\u6CA1\u6709\u7D22\u5F15\u65F6\u56DE\u9000\u5230 ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "digest.json" }),
        " \u6216\u5185\u7F6E\u793A\u4F8B\u3002"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "pr-primary-btn", onClick: () => void load(false), children: "\u91CD\u8BD5" })
    ] }) });
  }
  if (items.length === 0 && !digest?.demo && dayErrors.length === 0 && !runStatus && !runStatusError) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pr-root", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-empty", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-empty-mark", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconBook, {}) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pr-empty-title", children: "\u8FD8\u6CA1\u6709\u6293\u53D6\u6570\u636E" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "pr-empty-text", children: [
        "\u6BCF\u65E5\u6293\u53D6\u8FD0\u884C\u540E\uFF0C\u6309\u5929 digest \u4F1A\u5199\u5165 ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "$DSH_HOME/paper-reader/digest/" }),
        "\uFF0C\u8FD9\u91CC\u4F1A\u81EA\u52A8\u51FA\u73B0\u6700\u8FD1 7 \u5929\u3002"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "pr-primary-btn", onClick: () => void load(false), children: "\u91CD\u65B0\u8BFB\u53D6" })
    ] }) });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-root", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: "pr-top", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-brand", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-brand-mark", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconBook, {}) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-brand-name", children: "\u8BBA\u6587\u9605\u8BFB" }),
        digest.demo && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-demo", title: "\u5F53\u524D\u4E3A\u5185\u7F6E\u793A\u4F8B\u6570\u636E\uFF1Bagent \u5199\u5165\u6309\u5929 digest \u540E\u81EA\u52A8\u5207\u6362", children: "\u793A\u4F8B\u6570\u636E" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-status", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-status-dot" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-status-text", children: historyDays.length > 0 ? `\u6BCF\u65E5 09:00 \u6293\u53D6 \xB7 \u5DF2\u52A0\u8F7D ${days.length}/${historyDays.length} \u5929 \xB7 ${items.length} \u7BC7 \xB7 ${unreadCount} \u672A\u8BFB` : `\u6BCF\u65E5 09:00 \u6293\u53D6 \xB7 ${items.length} \u7BC7 \xB7 ${unreadCount} \u672A\u8BFB` })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-top-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "pr-icon-btn",
            onClick: () => {
              const narrow = typeof window.matchMedia === "function" && window.matchMedia("(max-width: 900px)").matches;
              if (narrow) setDrawerOpen(true);
              else update({ sidebarCollapsed: !prefs.sidebarCollapsed });
            },
            title: "\u5C55\u5F00 / \u6536\u8D77\u5217\u8868\uFF08Ctrl+B\uFF09",
            "aria-label": "\u5C55\u5F00\u6216\u6536\u8D77\u5217\u8868",
            children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconSidebar, {})
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: prefs.outlineOpen ? "pr-icon-btn is-active" : "pr-icon-btn",
            onClick: () => update({ outlineOpen: !prefs.outlineOpen }),
            title: "\u672C\u6587\u5927\u7EB2",
            "aria-label": "\u5207\u6362\u672C\u6587\u5927\u7EB2",
            "aria-pressed": prefs.outlineOpen,
            children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconOutline, {})
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "button",
          {
            type: "button",
            className: "pr-ghost-btn",
            onClick: () => void load(true),
            disabled: refreshing,
            title: "\u91CD\u65B0\u8BFB\u53D6 digest.json",
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: refreshing ? "pr-spin" : void 0, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconRefresh, {}) }),
              refreshing ? "\u5237\u65B0\u4E2D" : "\u5237\u65B0"
            ]
          }
        )
      ] })
    ] }),
    runStatus && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "div",
      {
        className: runStatus.status === "failed" ? "pr-run-status is-failed" : "pr-run-status",
        role: "status",
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-run-status-main", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-run-status-title", children: "\u6700\u8FD1\u4E00\u6B21\u8FD0\u884C" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `pr-run-status-badge pr-run-status-${runStatus.status ?? "unknown"}`, children: RUN_STATUS_LABELS[runStatus.status] ?? runStatus.status ?? "\u672A\u77E5" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "pr-run-status-meta", children: [
              runStatus.date ?? "",
              " ",
              clockTime(runStatus.finishedAt ?? runStatus.startedAt)
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-dot", children: "\xB7" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
              runStatus.items ?? 0,
              " \u7BC7"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-dot", children: "\xB7" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
              "\u8017\u65F6 ",
              formatDuration(runStatus.durationMs)
            ] }),
            runTranslation && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-dot", children: "\xB7" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "pr-run-status-token", children: [
                "\u7FFB\u8BD1 ",
                runTranslation.tokensUsed ?? "\u2014",
                " / ",
                runTranslation.tokenBudget ?? "\u2014",
                " tokens"
              ] }),
              runTranslation.pendingItems > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "pr-run-status-token", children: [
                runTranslation.pendingItems,
                " \u7BC7\u5F85\u7FFB\u8BD1"
              ] }),
              runTranslation.budgetExceeded && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-run-status-token is-warn", children: "\u5DF2\u8FBE\u6BCF\u65E5\u9884\u7B97" })
            ] })
          ] }),
          runFailedSources.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-run-status-line pr-run-status-failed", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-run-status-label", children: "\u5931\u8D25" }),
            runFailedSources.map((source, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
              index > 0 ? "\u3001" : "",
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RunSourceIssue, { source })
            ] }, `failed-${source.id ?? index}`))
          ] }),
          runSkippedSources.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-run-status-line pr-run-status-skipped", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-run-status-label", children: "\u8DF3\u8FC7" }),
            runSkippedSources.map((source, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
              index > 0 ? "\u3001" : "",
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RunSourceIssue, { source })
            ] }, `skipped-${source.id ?? index}`))
          ] }),
          runStatus.status === "failed" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pr-run-status-line pr-run-status-fallback", children: "\u8FD9\u6B21\u8FD0\u884C\u6CA1\u6709\u5199\u5165 digest\uFF0C\u7EE7\u7EED\u663E\u793A\u4E0A\u4E00\u4EFD\u53EF\u8BFB\u5185\u5BB9\u3002" })
        ]
      }
    ),
    runStatusError && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-run-status-error", role: "status", children: [
      "\u8FD0\u884C\u72B6\u6001\u8BFB\u53D6\u5931\u8D25\uFF1A",
      runStatusError,
      "\uFF08\u4ECD\u663E\u793A\u5DF2\u52A0\u8F7D\u7684 digest\uFF09"
    ] }),
    proxyNotice.sources.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-proxy-notice", role: "status", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-proxy-notice-dot", "aria-hidden": "true" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "pr-proxy-notice-text", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: proxyNotice.date === localDate() ? "\u4ECA\u65E5" : proxyNotice.date }),
        "\u56E0\u4EE3\u7406\u4E0D\u53EF\u7528\u8DF3\u8FC7\uFF1A",
        proxyNotice.sources.map((source, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          index > 0 ? "\u3001" : "",
          source.label ?? source.id,
          source.reason ? `\uFF08${source.reason}\uFF09` : ""
        ] }, source.id ?? index))
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-workspace", children: [
      drawerOpen && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pr-scrim", onClick: () => setDrawerOpen(false) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "aside",
        {
          className: [
            "pr-sidebar",
            prefs.sidebarCollapsed && !drawerOpen ? "is-collapsed" : "",
            drawerOpen ? "is-drawer-open" : ""
          ].filter(Boolean).join(" "),
          "aria-label": "\u6BCF\u65E5\u8BBA\u6587\u5217\u8868",
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-sidebar-head", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-search", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-search-icon", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconSearch, {}) }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "input",
                  {
                    ref: searchRef,
                    type: "search",
                    value: query,
                    onChange: (event) => setQuery(event.target.value),
                    placeholder: "\u641C\u7D22\u6807\u9898\u3001\u4F5C\u8005\u3001\u5173\u952E\u8BCD",
                    "aria-label": "\u641C\u7D22\u8BBA\u6587"
                  }
                ),
                query ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "pr-search-clear", onClick: () => setQuery(""), "aria-label": "\u6E05\u9664\u641C\u7D22", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconClose, {}) }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("kbd", { className: "pr-kbd", children: "/" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-filters", role: "toolbar", "aria-label": "\u6309\u65B9\u5411\u7B5B\u9009", children: [
                directions.map((direction) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                  "button",
                  {
                    type: "button",
                    className: prefs.direction === direction.id ? "pr-chip is-active" : "pr-chip",
                    onClick: () => update({ direction: direction.id }),
                    "aria-pressed": prefs.direction === direction.id,
                    children: [
                      direction.label,
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-chip-count", children: counts.get(direction.id) ?? 0 })
                    ]
                  },
                  direction.id
                )),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                  "button",
                  {
                    type: "button",
                    className: prefs.bookmarksOnly ? "pr-chip pr-chip-mark is-active" : "pr-chip pr-chip-mark",
                    onClick: () => update({ bookmarksOnly: !prefs.bookmarksOnly }),
                    "aria-pressed": prefs.bookmarksOnly,
                    title: "\u53EA\u770B\u6536\u85CF",
                    children: [
                      "\u2605 \u6536\u85CF ",
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-chip-count", children: bookmarkedCount })
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pr-filters pr-source-filters", role: "toolbar", "aria-label": "\u6309\u6765\u6E90\u7B5B\u9009", children: sourceChoices.map((source) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "button",
                {
                  type: "button",
                  "data-source-filter": source.id,
                  className: prefs.source === source.id ? "pr-chip is-active" : "pr-chip",
                  onClick: () => update({ source: source.id }),
                  "aria-pressed": prefs.source === source.id,
                  title: source.label,
                  children: [
                    source.label,
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-chip-count", children: sourceCounts.get(source.id) ?? 0 })
                  ]
                },
                source.id
              )) }),
              (normalizedQuery || prefs.direction !== "all" || prefs.source !== "all" || prefs.bookmarksOnly) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-result-line", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                  visibleItems.length,
                  " \u7BC7\u5339\u914D"
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "pr-link-btn", onClick: clearFilters, children: "\u6E05\u9664\u7B5B\u9009" })
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-feed", role: "listbox", "aria-label": "\u8BBA\u6587\u5217\u8868", children: [
              groups.length === 0 && items.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-feed-empty", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u6CA1\u6709\u5339\u914D\u7684\u8BBA\u6587" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "pr-link-btn", onClick: clearFilters, children: "\u6E05\u9664\u641C\u7D22\u4E0E\u7B5B\u9009" })
              ] }),
              groups.map((group) => {
                const expanded = normalizedQuery || prefs.direction !== "all" || prefs.source !== "all" || prefs.bookmarksOnly ? true : !prefs.collapsed.includes(group.date);
                return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "pr-day", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                    "button",
                    {
                      type: "button",
                      className: "pr-day-head",
                      onClick: () => toggleDay(group.date),
                      "aria-expanded": expanded,
                      children: [
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconChevron, { open: expanded }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-day-name", children: group.label.name }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-day-sub", children: group.label.sub }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-day-count", children: group.items.length })
                      ]
                    }
                  ),
                  expanded && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pr-day-items", role: "group", "aria-label": group.label.name, children: group.items.map((item) => {
                    const source = sourceById.get(item.sourceId) ?? { id: item.sourceId ?? "x", label: item.sourceId ?? "X", short: "X" };
                    const direction = directionById.get(item.direction) ?? { label: item.direction ?? "\u672A\u5206\u7C7B" };
                    const itemLanguage = sourceLanguageOf(item);
                    const itemTitleZh = pickText(item.title, itemLanguage, "zh");
                    const itemTitleEn = pickText(item.title, itemLanguage, "en");
                    const read = prefs.read.includes(item.id);
                    const bookmarked = prefs.bookmarks.includes(item.id);
                    const active = prefs.activeId === item.id;
                    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                      "div",
                      {
                        role: "option",
                        tabIndex: 0,
                        "aria-selected": active,
                        className: [
                          "pr-item",
                          active ? "is-active" : "",
                          read ? "is-read" : ""
                        ].filter(Boolean).join(" "),
                        onClick: () => selectItem(item.id),
                        onKeyDown: (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            selectItem(item.id);
                          }
                        },
                        children: [
                          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-item-head", children: [
                            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SourceBadge, { source }),
                            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-item-time", children: clockTime(item.collectedAt) }),
                            item.excerpt && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-pill pr-pill-excerpt", children: "\u8282\u9009" }),
                            item.translationState !== "complete" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-pill", children: "\u7FFB\u8BD1\u4E2D" }),
                            bookmarked && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-item-mark", title: "\u5DF2\u6536\u85CF", children: "\u2605" }),
                            !read && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(UnreadDot, {})
                          ] }),
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pr-item-title-zh", children: itemTitleZh.text }),
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pr-item-title-en", children: itemTitleEn.text }),
                          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-item-meta", children: [
                            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                              "span",
                              {
                                className: "pr-dir",
                                style: { "--pr-dir-color": DIRECTION_COLORS[item.direction] ?? "var(--pr-muted)" },
                                children: direction.label
                              }
                            ),
                            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-dot", children: "\xB7" }),
                            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                              item.readingMinutes ?? "\u2014",
                              " \u5206\u949F"
                            ] }),
                            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-dot", children: "\xB7" }),
                            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-item-venue", children: item.venue })
                          ] })
                        ]
                      },
                      item.id
                    );
                  }) })
                ] }, group.date);
              }),
              dayErrors.map((error) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-day-error", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-day-error-body", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-day-error-date", children: error.date }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-day-error-msg", children: error.message })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "pr-link-btn pr-day-retry", onClick: () => void retryDay(error.date), children: "\u91CD\u8BD5" })
              ] }, `error-${error.date}`)),
              remainingDays.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  type: "button",
                  className: "pr-history-more",
                  onClick: () => void loadOlder(),
                  disabled: loadingMore,
                  children: loadingMore ? "\u52A0\u8F7D\u4E2D\u2026" : `\u52A0\u8F7D\u66F4\u65E9\uFF08\u8FD8\u6709 ${remainingDays.length} \u5929\uFF09`
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-sidebar-foot", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u6BCF\u65E5 09:00 \u7531 agent \u6293\u53D6 \xB7 \u5DF2\u53BB\u91CD" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "pr-link-btn", onClick: () => showToast(digest.demo ? "\u5F53\u524D\u662F\u5185\u7F6E\u793A\u4F8B\uFF1Bagent \u5199\u5165\u6309\u5929 digest \u540E\u81EA\u52A8\u5207\u6362\u3002" : `\u6570\u636E\u6587\u4EF6\uFF1A${digest.digestPath ?? "$DSH_HOME/paper-reader/index.json"}`), children: "\u6570\u636E\u6765\u6E90" })
            ] })
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", { className: "pr-reader", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-reader-bar", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "pr-icon-btn pr-mobile-only", onClick: () => setDrawerOpen(true), "aria-label": "\u6253\u5F00\u8BBA\u6587\u5217\u8868", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconMenu, {}) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pr-reader-context", children: activeItem ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: Math.max(0, activeVisibleIndex) + 1 }),
            " / ",
            visibleItems.length || items.length,
            " \xB7 \u5DF2\u8BFB ",
            prefs.read.length,
            "/",
            items.length
          ] }) : "\u672A\u9009\u62E9\u8BBA\u6587" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pr-mode", role: "tablist", "aria-label": "\u9605\u8BFB\u6A21\u5F0F", children: MODES.map((mode) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              role: "tab",
              "aria-selected": prefs.mode === mode.id,
              className: prefs.mode === mode.id ? "pr-mode-btn is-active" : "pr-mode-btn",
              onClick: () => changeMode(mode.id),
              title: `${mode.label}\uFF08\u5FEB\u6377\u952E ${mode.id === "both" ? 1 : mode.id === "zh" ? 2 : 3}\uFF09`,
              children: mode.label
            },
            mode.id
          )) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: activeItem && prefs.bookmarks.includes(activeItem.id) ? "pr-icon-btn pr-star is-active" : "pr-icon-btn pr-star",
              onClick: toggleBookmark,
              disabled: !activeItem,
              title: "\u6536\u85CF\uFF08B\uFF09",
              "aria-label": "\u6536\u85CF\u5F53\u524D\u8BBA\u6587",
              "aria-pressed": Boolean(activeItem && prefs.bookmarks.includes(activeItem.id)),
              children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconStar, { filled: Boolean(activeItem && prefs.bookmarks.includes(activeItem.id)) })
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pr-progress", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pr-progress-bar", style: { width: `${Math.round(progress * 100)}%` } }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-scroll", ref: scrollRef, onScroll: handleScroll, children: [
          !activeItem && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-reader-empty", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconBook, {}),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u4ECE\u5DE6\u4FA7\u9009\u62E9\u4E00\u7BC7\u8BBA\u6587\u5F00\u59CB\u9605\u8BFB" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u6309 / \u641C\u7D22\uFF0C\u6309 J / K \u5207\u6362\u4E0A\u4E00\u7BC7\u3001\u4E0B\u4E00\u7BC7" })
          ] }),
          activeItem && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", { className: "pr-paper", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: "pr-paper-head", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-kicker", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SourceBadge, { source: sourceById.get(activeItem.sourceId) ?? { id: "x", short: "X", label: "X" } }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: sourceById.get(activeItem.sourceId)?.label ?? activeItem.sourceId }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-dot", children: "\xB7" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: (directionById.get(activeItem.direction) ?? { label: activeItem.direction }).label }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-dot", children: "\xB7" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                  "\u6536\u96C6\u4E8E ",
                  clockTime(activeItem.collectedAt)
                ] }),
                activeItem.excerpt && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-chip-inline", children: "\u8282\u9009" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-chip-inline", "data-source-language": activeLanguage, children: activeLanguage === "zh" ? "\u4E2D\u6587\u539F\u6587" : "\u82F1\u6587\u539F\u6587" })
              ] }),
              activeItem.excerpt && activeItem.excerptReason && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-excerpt-notice", role: "note", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-excerpt-mark", children: "\u8282\u9009" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "pr-excerpt-text", children: [
                  activeItem.excerptReason.message,
                  activeItem.excerptReason.detail && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "pr-excerpt-detail", children: [
                    "\uFF08",
                    activeItem.excerptReason.detail,
                    "\uFF09"
                  ] })
                ] })
              ] }),
              prefs.mode !== "en" && zhTitle.text && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h1", { className: "pr-title-zh", children: [
                zhTitle.text,
                zhTitle.fallback && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-title-flag", children: "\u672A\u7FFB\u8BD1" })
              ] }),
              prefs.mode !== "zh" && enTitle.text && enTitle.text !== zhTitle.text && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: prefs.mode === "en" ? "pr-title-en pr-title-en-hero" : "pr-title-en", children: [
                enTitle.text,
                enTitle.fallback && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-title-flag", children: "\u672A\u7FFB\u8BD1" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-meta", children: [
                activeItem.authors?.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: authorLine(activeItem.authors) }),
                activeItem.org && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-dot", children: "\xB7" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: activeItem.org })
                ] }),
                activeItem.venue && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-dot", children: "\xB7" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: activeItem.venue })
                ] }),
                activeItem.published && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-dot", children: "\xB7" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: activeItem.published })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-dot", children: "\xB7" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                  activeItem.readingMinutes ?? "\u2014",
                  " \u5206\u949F"
                ] }),
                activeItem.url && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", { className: "pr-origin", href: activeItem.url, target: "_blank", rel: "noreferrer", children: [
                  "\u539F\u6587 ",
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconLink, {})
                ] })
              ] }),
              summaryPick.text && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-summary", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-summary-label", children: prefs.mode === "en" ? "Summary" : "\u5BFC\u8BFB" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: summaryPick.text }),
                summaryPick.fallback && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(UntranslatedNote, {})
              ] }),
              activeItem.translationState !== "complete" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-notice", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                  "\u7FFB\u8BD1\u8FDB\u884C\u4E2D \xB7 ",
                  activeItem.translation.done ?? "\u2014",
                  "/",
                  activeItem.translation.total ?? "\u2014",
                  " \u6BB5"
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "pr-link-btn", onClick: retryTranslation, children: "\u91CD\u8BD5" })
              ] }),
              digest.demo && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-demo-note", children: [
                "\u5F53\u524D\u663E\u793A\u5185\u7F6E\u793A\u4F8B\u3002agent \u5199\u5165 ",
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "$DSH_HOME/paper-reader/digest/YYYY-MM-DD.json" }),
                " \u540E\uFF0C\u8FD9\u91CC\u4F1A\u81EA\u52A8\u6362\u6210\u771F\u5B9E\u6293\u53D6\u7ED3\u679C\u3002"
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-body", "data-mode": prefs.mode, "data-source-language": activeLanguage, children: [
              prefs.mode === "both" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-legend", "aria-hidden": "true", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                  "\u539F\u6587 \xB7 ",
                  languageLabel(activeLanguage)
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                  "\u8BD1\u6587 \xB7 ",
                  languageLabel(translationLanguage)
                ] })
              ] }),
              activeItem.blocks.map((block, index) => {
                if (!block || typeof block !== "object") return null;
                const anchor = { "data-block": index, "data-block-type": block.type, id: `pr-b-${index}` };
                const originalColumn = `pr-col pr-col-${activeLanguage} pr-col-original`;
                const translationColumn = `pr-col pr-col-${translationLanguage} pr-col-translation`;
                if (block.type === "heading") {
                  const level = Number(block.level) || 1;
                  const HeadingTag = level <= 2 ? "h2" : "h3";
                  if (prefs.mode === "both") {
                    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-pair pr-pair-heading", ...anchor, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: originalColumn, "data-column": "original", "data-lang": activeLanguage, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeadingTag, { children: block.original }) }),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: translationColumn, "data-column": "translation", "data-lang": translationLanguage, children: block.translation ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeadingTag, { children: block.translation }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PendingParagraph, {}) })
                    ] }, index);
                  }
                  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                    SingleLanguageText,
                    {
                      pair: block,
                      sourceLanguage: activeLanguage,
                      targetLanguage,
                      headingLevel: level,
                      anchor
                    },
                    index
                  );
                }
                if (block.type === "paragraph") {
                  if (prefs.mode === "both") {
                    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-pair", ...anchor, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: originalColumn, "data-column": "original", "data-lang": activeLanguage, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: block.original }) }),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: translationColumn, "data-column": "translation", "data-lang": translationLanguage, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TranslatedText, { block }) })
                    ] }, index);
                  }
                  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                    SingleLanguageText,
                    {
                      pair: block,
                      sourceLanguage: activeLanguage,
                      targetLanguage,
                      anchor
                    },
                    index
                  );
                }
                if (block.type === "equation") {
                  const notePick = pickText(block.note, activeLanguage, targetLanguage);
                  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figure", { className: "pr-equation", ...anchor, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-eq-line", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-eq-display", children: renderMath(block.display) }),
                      block.label && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-eq-label", children: block.label })
                    ] }),
                    block.detail && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pr-eq-detail", children: renderMath(block.detail) }),
                    block.note && prefs.mode === "both" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figcaption", { className: "pr-eq-note", children: [
                      block.note.original && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: block.note.original }),
                      block.note.translation && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-eq-note-en", children: block.note.translation })
                    ] }),
                    block.note && prefs.mode !== "both" && notePick.text && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figcaption", { className: "pr-eq-note", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: notePick.text }),
                      notePick.fallback && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(UntranslatedNote, {})
                    ] })
                  ] }, index);
                }
                if (block.type === "figure") {
                  const steps = Array.isArray(block.diagram?.steps) ? block.diagram.steps : [];
                  const captionPick = pickText(block.caption, activeLanguage, targetLanguage);
                  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figure", { className: "pr-figure", ...anchor, children: [
                    steps.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pr-diagram", role: "img", "aria-label": block.diagram?.title ?? "\u6D41\u7A0B\u56FE", children: steps.map((step, stepIndex) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "pr-diagram-step-wrap", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-diagram-step", children: step }),
                      stepIndex < steps.length - 1 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-diagram-arrow", "aria-hidden": "true", children: "\u2192" })
                    ] }, `${step}-${stepIndex}`)) }),
                    block.image && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", { className: "pr-figure-image", src: block.image, alt: block.diagram?.title ?? "" }),
                    block.caption && prefs.mode === "both" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figcaption", { className: "pr-figure-caption", children: [
                      block.caption.original && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: block.caption.original }),
                      block.caption.translation && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-figure-caption-en", children: block.caption.translation })
                    ] }),
                    block.caption && prefs.mode !== "both" && captionPick.text && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figcaption", { className: "pr-figure-caption", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: captionPick.text }),
                      captionPick.fallback && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(UntranslatedNote, {})
                    ] })
                  ] }, index);
                }
                if (block.type === "code") {
                  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { className: "pr-code", ...anchor, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: block.code }) }, index);
                }
                return null;
              }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("footer", { className: "pr-paper-end", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u5DF2\u8BFB\u5B8C\u672C\u6587" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "pr-primary-btn", onClick: () => move(1), disabled: visibleItems.length <= 1, children: "\u4E0B\u4E00\u7BC7\uFF08J\uFF09" })
              ] })
            ] })
          ] })
        ] })
      ] }),
      prefs.outlineOpen && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", { className: "pr-outline", "aria-label": "\u672C\u6587\u5927\u7EB2", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-outline-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u5927\u7EB2" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "pr-icon-btn", onClick: () => update({ outlineOpen: false }), "aria-label": "\u5173\u95ED\u5927\u7EB2", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconClose, {}) })
        ] }),
        headings.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", { className: "pr-outline-nav", children: headings.map((heading) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: [
              "pr-outline-link",
              heading.level > 2 ? "is-sub" : "",
              activeHeading === heading.index ? "is-active" : ""
            ].filter(Boolean).join(" "),
            onClick: () => scrollToBlock(heading.index),
            children: heading.label
          },
          heading.index
        )) }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "pr-outline-empty", children: "\u672C\u6587\u6682\u65E0\u5C0F\u8282\u6807\u9898" })
      ] })
    ] }),
    toast && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pr-toast", role: "status", children: toast })
  ] });
}
function PaperReaderPanelIcon({ size = 16 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.7",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4 5.5v15" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M8 7h8M8 10.5h5" })
      ]
    }
  );
}
function installStyles() {
  if (document.getElementById("dsh-paper-reader-styles")) return;
  const tag = document.createElement("style");
  tag.id = "dsh-paper-reader-styles";
  tag.textContent = styles_default;
  document.head.appendChild(tag);
}
var inject = ["slots"];
function apply(ctx) {
  installStyles();
  ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
    name: "sidebar.panellist",
    id: PANEL_ID,
    order: 20,
    label: "\u8BBA\u6587\u9605\u8BFB"
  }, PaperReaderPanelIcon));
  ctx.slots.inject("main", () => ctx.slots.register({
    name: "main",
    key: PANEL_ID
  }, PaperReaderPage));
}

return module.exports; } });

