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

// src/client/styles.css
var styles_default = "/* dsh-paper-reader: native DSH panel styles.\n   Colors come from the host theme tokens, so the page follows the active\n   DSH light/dark theme without its own theme switch. Reading typography uses\n   serif stacks for prose and the host code font for data. */\n\n.pr-root {\n  --pr-bg: var(--dsw-alias-bg-base, #0c0e12);\n  --pr-panel: var(--dsw-alias-bg-layer-1, #12151c);\n  --pr-panel-2: var(--dsw-alias-bg-layer-2, #171b24);\n  --pr-border: var(--dsw-alias-border-l2, #232936);\n  --pr-border-strong: var(--dsw-alias-border-l4, #313a4a);\n  --pr-text: var(--dsw-alias-label-primary, #e6e9ef);\n  --pr-text-2: var(--dsw-alias-label-secondary, #c9d0dc);\n  --pr-muted: var(--dsw-alias-label-tertiary, #98a2b3);\n  --pr-faint: var(--dsw-alias-label-caption, #6b7484);\n  --pr-accent: var(--dsw-static-deepseek-500, #4176e6);\n  --pr-accent-soft: color-mix(in srgb, var(--pr-accent) 14%, transparent);\n  --pr-serif-en: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif;\n  --pr-serif-zh: 'Songti SC', 'STSong', 'Noto Serif CJK SC', 'Source Han Serif SC', SimSun, serif;\n  --pr-mono: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Consolas, monospace);\n  --pr-ui: var(--dsw-font-family, system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif);\n\n  position: relative;\n  display: flex;\n  flex-direction: column;\n  height: 100%;\n  min-height: 0;\n  overflow: hidden;\n  background: var(--pr-bg);\n  color: var(--pr-text);\n  font-family: var(--pr-ui);\n  font-size: 13px;\n  line-height: 1.5;\n  box-sizing: border-box;\n}\n\n.pr-root *,\n.pr-root *::before,\n.pr-root *::after {\n  box-sizing: border-box;\n}\n\n.pr-root :focus-visible {\n  outline: 2px solid color-mix(in srgb, var(--pr-accent) 60%, transparent);\n  outline-offset: 1px;\n}\n\n.pr-root button {\n  font-family: inherit;\n  color: inherit;\n}\n\n/* ------------------------------------------------------------------ */\n/* Top bar                                                             */\n/* ------------------------------------------------------------------ */\n\n.pr-top {\n  flex: none;\n  height: 52px;\n  display: flex;\n  align-items: center;\n  gap: 14px;\n  padding: 0 14px;\n  border-bottom: 1px solid var(--pr-border);\n  background: var(--pr-panel);\n}\n\n.pr-brand {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  min-width: 0;\n  white-space: nowrap;\n}\n\n.pr-brand-mark {\n  width: 26px;\n  height: 26px;\n  display: inline-grid;\n  place-items: center;\n  border-radius: 7px;\n  color: var(--pr-accent);\n  background: var(--pr-accent-soft);\n}\n\n.pr-brand-name {\n  font-size: 14px;\n  font-weight: 600;\n  letter-spacing: .01em;\n}\n\n.pr-demo {\n  font-size: 10px;\n  letter-spacing: .08em;\n  padding: 1px 6px;\n  border-radius: 4px;\n  color: var(--pr-muted);\n  border: 1px solid var(--pr-border-strong);\n}\n\n.pr-status {\n  flex: 1;\n  min-width: 0;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  color: var(--pr-muted);\n  font-size: 12px;\n}\n\n.pr-status-dot {\n  flex: none;\n  width: 6px;\n  height: 6px;\n  border-radius: 50%;\n  background: #4caf7d;\n  box-shadow: 0 0 0 3px color-mix(in srgb, #4caf7d 18%, transparent);\n}\n\n.pr-status-text {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.pr-top-actions {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n}\n\n.pr-icon-btn {\n  width: 30px;\n  height: 30px;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  padding: 0;\n  border: 1px solid transparent;\n  border-radius: 8px;\n  background: transparent;\n  color: var(--pr-muted);\n  cursor: pointer;\n}\n\n.pr-icon-btn:hover {\n  background: var(--pr-panel-2);\n  color: var(--pr-text);\n}\n\n.pr-icon-btn.is-active {\n  color: var(--pr-accent);\n  background: var(--pr-accent-soft);\n}\n\n.pr-ghost-btn {\n  height: 30px;\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  padding: 0 10px;\n  border: 1px solid var(--pr-border);\n  border-radius: 8px;\n  background: transparent;\n  color: var(--pr-text-2);\n  font-size: 12px;\n  cursor: pointer;\n}\n\n.pr-ghost-btn:hover:not(:disabled) {\n  background: var(--pr-panel-2);\n  border-color: var(--pr-border-strong);\n}\n\n.pr-ghost-btn:disabled {\n  opacity: .55;\n  cursor: default;\n}\n\n.pr-spin {\n  display: inline-flex;\n  animation: pr-spin .8s linear infinite;\n}\n\n/* ------------------------------------------------------------------ */\n/* Workspace + sidebar                                                 */\n/* ------------------------------------------------------------------ */\n\n.pr-workspace {\n  position: relative;\n  flex: 1;\n  min-height: 0;\n  display: flex;\n  container-type: inline-size;\n}\n\n.pr-sidebar {\n  width: 320px;\n  flex: none;\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n  border-right: 1px solid var(--pr-border);\n  background: var(--pr-panel);\n}\n\n.pr-sidebar.is-collapsed {\n  display: none;\n}\n\n.pr-sidebar-head {\n  flex: none;\n  display: flex;\n  flex-direction: column;\n  gap: 9px;\n  padding: 12px 12px 8px;\n}\n\n.pr-search {\n  position: relative;\n  display: flex;\n  align-items: center;\n  height: 34px;\n  padding: 0 8px 0 30px;\n  border: 1px solid var(--pr-border);\n  border-radius: 8px;\n  background: var(--pr-panel-2);\n}\n\n.pr-search:focus-within {\n  border-color: color-mix(in srgb, var(--pr-accent) 55%, var(--pr-border));\n  box-shadow: 0 0 0 3px var(--pr-accent-soft);\n}\n\n.pr-search input {\n  flex: 1;\n  min-width: 0;\n  height: 100%;\n  border: 0;\n  background: transparent;\n  color: var(--pr-text);\n  font: inherit;\n  font-size: 13px;\n  outline: none;\n}\n\n.pr-search input::placeholder {\n  color: var(--pr-faint);\n}\n\n.pr-search input::-webkit-search-cancel-button {\n  display: none;\n}\n\n.pr-search-icon {\n  position: absolute;\n  left: 9px;\n  display: inline-flex;\n  color: var(--pr-faint);\n}\n\n.pr-search-clear {\n  display: inline-grid;\n  place-items: center;\n  width: 20px;\n  height: 20px;\n  padding: 0;\n  border: 0;\n  border-radius: 4px;\n  background: transparent;\n  color: var(--pr-faint);\n  cursor: pointer;\n}\n\n.pr-search-clear:hover {\n  color: var(--pr-text);\n  background: var(--pr-panel);\n}\n\n.pr-kbd {\n  font-family: var(--pr-mono);\n  font-size: 10px;\n  line-height: 16px;\n  padding: 0 4px;\n  border: 1px solid var(--pr-border);\n  border-radius: 4px;\n  color: var(--pr-faint);\n}\n\n.pr-filters {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 5px;\n}\n\n.pr-chip {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  height: 25px;\n  padding: 0 9px;\n  border: 1px solid var(--pr-border);\n  border-radius: 999px;\n  background: transparent;\n  color: var(--pr-muted);\n  font-size: 11.5px;\n  white-space: nowrap;\n  cursor: pointer;\n}\n\n.pr-chip:hover {\n  color: var(--pr-text);\n  border-color: var(--pr-border-strong);\n}\n\n.pr-chip.is-active {\n  color: var(--pr-accent);\n  border-color: color-mix(in srgb, var(--pr-accent) 38%, transparent);\n  background: var(--pr-accent-soft);\n}\n\n.pr-chip-count {\n  font-size: 10px;\n  opacity: .7;\n  font-variant-numeric: tabular-nums;\n}\n\n.pr-chip-mark.is-active {\n  color: #c9a227;\n  border-color: color-mix(in srgb, #c9a227 45%, transparent);\n  background: color-mix(in srgb, #c9a227 14%, transparent);\n}\n\n.pr-result-line {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  font-size: 11px;\n  color: var(--pr-faint);\n}\n\n.pr-link-btn {\n  padding: 0;\n  border: 0;\n  background: none;\n  color: var(--pr-accent);\n  font-size: 11.5px;\n  cursor: pointer;\n}\n\n.pr-link-btn:hover {\n  text-decoration: underline;\n}\n\n.pr-feed {\n  flex: 1;\n  min-height: 0;\n  overflow-y: auto;\n  padding: 0 8px 10px;\n}\n\n.pr-day + .pr-day {\n  margin-top: 2px;\n}\n\n.pr-day-head {\n  position: sticky;\n  top: 0;\n  z-index: 1;\n  width: 100%;\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  padding: 8px 6px;\n  border: 0;\n  background: color-mix(in srgb, var(--pr-panel) 92%, transparent);\n  backdrop-filter: blur(8px);\n  color: var(--pr-muted);\n  text-align: left;\n  cursor: pointer;\n}\n\n.pr-chev {\n  flex: none;\n  color: var(--pr-faint);\n  transition: transform .15s ease;\n}\n\n.pr-chev-open {\n  transform: rotate(90deg);\n}\n\n.pr-day-name {\n  font-size: 12px;\n  font-weight: 600;\n  color: var(--pr-text-2);\n}\n\n.pr-day-sub {\n  font-size: 10.5px;\n  color: var(--pr-faint);\n}\n\n.pr-day-count {\n  margin-left: auto;\n  padding: 1px 6px;\n  border-radius: 999px;\n  background: var(--pr-panel-2);\n  font-size: 10px;\n  color: var(--pr-faint);\n  font-variant-numeric: tabular-nums;\n}\n\n.pr-day-items {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  padding-bottom: 6px;\n}\n\n.pr-item {\n  position: relative;\n  padding: 9px 10px 10px;\n  border: 1px solid transparent;\n  border-radius: 9px;\n  cursor: pointer;\n}\n\n.pr-item:hover {\n  background: var(--pr-panel-2);\n}\n\n.pr-item.is-active {\n  background: var(--pr-accent-soft);\n  border-color: color-mix(in srgb, var(--pr-accent) 32%, transparent);\n}\n\n.pr-item.is-active::before {\n  content: '';\n  position: absolute;\n  left: 0;\n  top: 10px;\n  bottom: 10px;\n  width: 2px;\n  border-radius: 2px;\n  background: var(--pr-accent);\n}\n\n.pr-item-head {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  min-height: 16px;\n  margin-bottom: 5px;\n}\n\n.pr-source {\n  flex: none;\n  width: 16px;\n  height: 16px;\n  display: inline-grid;\n  place-items: center;\n  border: 1px solid var(--pr-border);\n  border-radius: 4px;\n  background: var(--pr-panel-2);\n  color: var(--pr-text-2);\n  font-size: 9px;\n  font-weight: 700;\n  line-height: 1;\n}\n\n.pr-source-claude {\n  color: #c4643f;\n  border-color: color-mix(in srgb, #d97757 28%, transparent);\n  background: color-mix(in srgb, #d97757 13%, transparent);\n}\n\n.pr-item-time {\n  font-size: 10.5px;\n  color: var(--pr-faint);\n  font-variant-numeric: tabular-nums;\n}\n\n.pr-pill {\n  padding: 1px 4px;\n  border-radius: 3px;\n  color: #b07d2a;\n  background: color-mix(in srgb, #b07d2a 13%, transparent);\n  font-size: 9.5px;\n  line-height: 1.4;\n}\n\n.pr-item-mark {\n  margin-left: auto;\n  color: #c9a227;\n  font-size: 10px;\n}\n\n.pr-unread {\n  flex: none;\n  width: 6px;\n  height: 6px;\n  margin-left: auto;\n  border-radius: 50%;\n  background: var(--pr-accent);\n}\n\n.pr-item-title-zh {\n  display: -webkit-box;\n  -webkit-line-clamp: 2;\n  -webkit-box-orient: vertical;\n  overflow: hidden;\n  color: var(--pr-text);\n  font-size: 13px;\n  font-weight: 600;\n  line-height: 1.45;\n}\n\n.pr-item.is-read .pr-item-title-zh {\n  color: var(--pr-text-2);\n  font-weight: 500;\n}\n\n.pr-item-title-en {\n  margin-top: 2px;\n  overflow: hidden;\n  color: var(--pr-faint);\n  font-family: var(--pr-serif-en);\n  font-size: 11px;\n  line-height: 1.4;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n}\n\n.pr-item-meta {\n  margin-top: 6px;\n  display: flex;\n  align-items: center;\n  gap: 5px;\n  overflow: hidden;\n  color: var(--pr-faint);\n  font-size: 10.5px;\n  white-space: nowrap;\n}\n\n.pr-dir {\n  padding: 0 5px;\n  border: 1px solid color-mix(in srgb, var(--pr-dir-color) 35%, transparent);\n  border-radius: 999px;\n  background: color-mix(in srgb, var(--pr-dir-color) 10%, transparent);\n  color: var(--pr-dir-color);\n  font-size: 10px;\n  line-height: 16px;\n}\n\n.pr-dot {\n  color: var(--pr-border-strong);\n}\n\n.pr-item-venue {\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.pr-feed-empty {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  gap: 8px;\n  padding: 40px 16px;\n  color: var(--pr-faint);\n  font-size: 12px;\n  text-align: center;\n}\n\n.pr-feed-empty p {\n  margin: 0;\n}\n\n.pr-sidebar-foot {\n  flex: none;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  padding: 8px 12px;\n  border-top: 1px solid var(--pr-border);\n  color: var(--pr-faint);\n  font-size: 10.5px;\n}\n\n/* ------------------------------------------------------------------ */\n/* Reader shell                                                        */\n/* ------------------------------------------------------------------ */\n\n.pr-reader {\n  flex: 1;\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n  background: var(--pr-bg);\n}\n\n.pr-reader-bar {\n  flex: none;\n  min-height: 44px;\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 0 12px;\n  border-bottom: 1px solid var(--pr-border);\n}\n\n.pr-reader-context {\n  flex: 1;\n  min-width: 0;\n  overflow: hidden;\n  color: var(--pr-faint);\n  font-size: 11.5px;\n  font-variant-numeric: tabular-nums;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n}\n\n.pr-reader-context span {\n  color: var(--pr-text-2);\n}\n\n.pr-mobile-only {\n  display: none;\n}\n\n.pr-mode {\n  display: inline-flex;\n  align-items: center;\n  gap: 2px;\n  padding: 2px;\n  border: 1px solid var(--pr-border);\n  border-radius: 999px;\n  background: var(--pr-panel-2);\n}\n\n.pr-mode-btn {\n  height: 26px;\n  padding: 0 11px;\n  border: 0;\n  border-radius: 999px;\n  background: transparent;\n  color: var(--pr-muted);\n  font-size: 11.5px;\n  white-space: nowrap;\n  cursor: pointer;\n}\n\n.pr-mode-btn:hover {\n  color: var(--pr-text);\n}\n\n.pr-mode-btn.is-active {\n  background: var(--pr-bg);\n  color: var(--pr-text);\n  box-shadow: 0 1px 2px rgba(0, 0, 0, .18);\n}\n\n.pr-star.is-active {\n  color: #c9a227;\n}\n\n.pr-star:disabled {\n  opacity: .4;\n  cursor: default;\n}\n\n.pr-progress {\n  flex: none;\n  height: 2px;\n}\n\n.pr-progress-bar {\n  height: 100%;\n  width: 0;\n  background: var(--pr-accent);\n  opacity: .7;\n  transition: width .12s linear;\n}\n\n.pr-scroll {\n  flex: 1;\n  min-height: 0;\n  overflow-y: auto;\n}\n\n/* ------------------------------------------------------------------ */\n/* Paper                                                               */\n/* ------------------------------------------------------------------ */\n\n.pr-paper {\n  max-width: 1120px;\n  margin: 0 auto;\n  padding: 34px clamp(20px, 3.4vw, 48px) 110px;\n}\n\n.pr-paper-head {\n  margin-bottom: 26px;\n  padding-bottom: 22px;\n  border-bottom: 1px solid var(--pr-border);\n}\n\n.pr-kicker {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 6px;\n  color: var(--pr-muted);\n  font-size: 11.5px;\n}\n\n.pr-chip-inline {\n  padding: 0 5px;\n  border: 1px solid var(--pr-border);\n  border-radius: 4px;\n  color: var(--pr-faint);\n  font-size: 10px;\n  line-height: 16px;\n}\n\n.pr-title-zh {\n  margin: 12px 0 6px;\n  color: var(--pr-text);\n  font-size: clamp(22px, 2.1vw, 28px);\n  font-weight: 650;\n  line-height: 1.35;\n  letter-spacing: .01em;\n}\n\n.pr-title-en {\n  margin: 0 0 12px;\n  color: var(--pr-muted);\n  font-family: var(--pr-serif-en);\n  font-size: 15px;\n  font-style: italic;\n  font-weight: 400;\n  line-height: 1.5;\n}\n\n.pr-title-en-hero {\n  margin-top: 12px;\n  color: var(--pr-text);\n  font-size: clamp(22px, 2.1vw, 28px);\n  font-style: normal;\n  font-weight: 600;\n  line-height: 1.35;\n}\n\n.pr-meta {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 6px;\n  color: var(--pr-faint);\n  font-size: 11.5px;\n}\n\n.pr-origin {\n  display: inline-flex;\n  align-items: center;\n  gap: 3px;\n  margin-left: 2px;\n  color: var(--pr-accent);\n  text-decoration: none;\n}\n\n.pr-origin:hover {\n  text-decoration: underline;\n}\n\n.pr-summary {\n  margin-top: 16px;\n  padding: 11px 14px;\n  border-left: 2px solid var(--pr-accent);\n  border-radius: 0 8px 8px 0;\n  background: var(--pr-accent-soft);\n}\n\n.pr-summary-label {\n  display: block;\n  margin-bottom: 3px;\n  color: var(--pr-accent);\n  font-size: 10px;\n  letter-spacing: .14em;\n}\n\n.pr-summary p {\n  margin: 0;\n  color: var(--pr-text-2);\n  font-size: 13px;\n  line-height: 1.75;\n}\n\n.pr-notice {\n  margin-top: 12px;\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 6px 10px;\n  border: 1px dashed var(--pr-border-strong);\n  border-radius: 8px;\n  color: var(--pr-muted);\n  font-size: 11.5px;\n}\n\n.pr-demo-note {\n  margin-top: 12px;\n  color: var(--pr-faint);\n  font-size: 11px;\n  line-height: 1.6;\n}\n\n.pr-demo-note code {\n  font-family: var(--pr-mono);\n  font-size: 10.5px;\n}\n\n/* ------------------------------------------------------------------ */\n/* Reading modes                                                       */\n/* ------------------------------------------------------------------ */\n\n.pr-legend {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);\n  gap: clamp(24px, 4cqw, 48px);\n  margin-bottom: 4px;\n  padding-bottom: 6px;\n  border-bottom: 1px solid var(--pr-border);\n  color: var(--pr-faint);\n  font-size: 10px;\n  letter-spacing: .16em;\n}\n\n.pr-pair {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);\n  gap: clamp(24px, 4cqw, 48px);\n  padding: 13px 0;\n  border-top: 1px solid color-mix(in srgb, var(--pr-border) 55%, transparent);\n}\n\n.pr-pair:first-of-type {\n  border-top: 0;\n}\n\n.pr-pair:hover {\n  background: color-mix(in srgb, var(--pr-panel-2) 42%, transparent);\n}\n\n.pr-pair-heading {\n  margin-top: 8px;\n  padding-top: 26px;\n  border-top: 1px solid var(--pr-border);\n}\n\n.pr-pair-heading h2,\n.pr-pair-heading h3 {\n  margin: 0;\n  color: var(--pr-text);\n  font-size: 16px;\n  font-weight: 650;\n  letter-spacing: .01em;\n  line-height: 1.45;\n}\n\n.pr-col p {\n  margin: 0;\n}\n\n.pr-col-en p {\n  color: var(--pr-text-2);\n  font-family: var(--pr-serif-en);\n  font-size: 16px;\n  line-height: 1.82;\n}\n\n.pr-col-zh p {\n  color: var(--pr-text);\n  font-family: var(--pr-serif-zh);\n  font-size: 16.5px;\n  line-height: 1.95;\n}\n\n.pr-body[data-mode='zh'],\n.pr-body[data-mode='en'] {\n  max-width: 760px;\n  margin: 0 auto;\n}\n\n.pr-single-paragraph {\n  margin: 0 0 18px;\n  color: var(--pr-text);\n  font-family: var(--pr-serif-zh);\n  font-size: 16.5px;\n  line-height: 1.95;\n}\n\n.pr-body[data-mode='en'] .pr-single-paragraph {\n  color: var(--pr-text-2);\n  font-family: var(--pr-serif-en);\n  font-size: 16px;\n  line-height: 1.85;\n}\n\n.pr-single-heading {\n  margin: 30px 0 14px;\n  color: var(--pr-text);\n  font-size: 18px;\n  font-weight: 650;\n  line-height: 1.4;\n}\n\n.pr-body[data-mode='zh'] .pr-single-heading {\n  font-family: var(--pr-serif-zh);\n}\n\n.pr-body[data-mode='en'] .pr-single-heading {\n  font-family: var(--pr-serif-en);\n}\n\n.pr-pending {\n  display: flex;\n  flex-direction: column;\n  gap: 7px;\n  padding-top: 3px;\n}\n\n.pr-skeleton {\n  height: 10px;\n  width: 100%;\n  border-radius: 4px;\n  background: linear-gradient(90deg, var(--pr-panel-2) 25%, var(--pr-panel) 37%, var(--pr-panel-2) 63%);\n  background-size: 400% 100%;\n  animation: pr-shimmer 1.4s ease infinite;\n}\n\n.pr-skeleton-short {\n  width: 62%;\n}\n\n.pr-pending-label {\n  color: var(--pr-faint);\n  font-size: 11px;\n}\n\n.pr-missing p {\n  margin: 0;\n  color: var(--pr-text-2);\n}\n\n.pr-missing span {\n  display: inline-block;\n  margin-top: 4px;\n  color: var(--pr-faint);\n  font-size: 10.5px;\n}\n\n/* Full-width blocks: equations, figures, code share one column in \u5BF9\u7167 mode. */\n\n.pr-equation {\n  margin: 22px 0;\n  padding: 16px 20px;\n  border: 1px solid var(--pr-border);\n  border-radius: 10px;\n  background: var(--pr-panel);\n  overflow-x: auto;\n}\n\n.pr-eq-line {\n  display: flex;\n  align-items: baseline;\n  gap: 16px;\n  color: var(--pr-text);\n  font-family: 'Cambria Math', 'STIX Two Math', Cambria, serif;\n  font-size: 17px;\n  line-height: 1.5;\n}\n\n.pr-eq-display {\n  flex: 1;\n  min-width: 0;\n}\n\n.pr-eq-label {\n  color: var(--pr-faint);\n  font-size: 12px;\n}\n\n.pr-eq-detail {\n  margin-top: 6px;\n  color: var(--pr-muted);\n  font-family: 'Cambria Math', 'STIX Two Math', Cambria, serif;\n  font-size: 13.5px;\n}\n\n.pr-eq-note {\n  display: grid;\n  gap: 3px;\n  margin-top: 12px;\n  padding-top: 9px;\n  border-top: 1px dashed var(--pr-border);\n  color: var(--pr-muted);\n  font-size: 11.5px;\n  line-height: 1.65;\n}\n\n.pr-eq-note-en {\n  color: var(--pr-faint);\n  font-family: var(--pr-serif-en);\n}\n\n.pr-figure {\n  margin: 24px 0;\n  padding: 16px 18px;\n  border: 1px solid var(--pr-border);\n  border-radius: 10px;\n  background: var(--pr-panel);\n}\n\n.pr-diagram {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 6px;\n  padding: 6px 2px 10px;\n}\n\n.pr-diagram-step-wrap {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n}\n\n.pr-diagram-step {\n  padding: 6px 10px;\n  border: 1px solid color-mix(in srgb, var(--pr-accent) 30%, var(--pr-border));\n  border-radius: 7px;\n  background: var(--pr-accent-soft);\n  color: var(--pr-text-2);\n  font-size: 12px;\n  white-space: nowrap;\n}\n\n.pr-diagram-arrow {\n  color: var(--pr-faint);\n}\n\n.pr-figure-caption {\n  display: grid;\n  gap: 3px;\n  color: var(--pr-muted);\n  font-size: 11.5px;\n  line-height: 1.65;\n}\n\n.pr-code {\n  margin: 20px 0;\n  padding: 14px 16px;\n  border: 1px solid var(--pr-border);\n  border-radius: 8px;\n  background: var(--pr-panel-2);\n  overflow-x: auto;\n  color: var(--pr-text-2);\n  font-family: var(--pr-mono);\n  font-size: 12.5px;\n  line-height: 1.6;\n}\n\n.pr-paper-end {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  margin-top: 34px;\n  padding-top: 18px;\n  border-top: 1px solid var(--pr-border);\n  color: var(--pr-faint);\n  font-size: 12px;\n}\n\n.pr-primary-btn {\n  height: 32px;\n  padding: 0 14px;\n  border: 1px solid color-mix(in srgb, var(--pr-accent) 45%, transparent);\n  border-radius: 8px;\n  background: var(--pr-accent);\n  color: #fff;\n  font-size: 12px;\n  cursor: pointer;\n}\n\n.pr-primary-btn:hover:not(:disabled) {\n  filter: brightness(1.06);\n}\n\n.pr-primary-btn:disabled {\n  opacity: .5;\n  cursor: default;\n}\n\n/* ------------------------------------------------------------------ */\n/* Outline                                                             */\n/* ------------------------------------------------------------------ */\n\n.pr-outline {\n  width: 208px;\n  flex: none;\n  display: flex;\n  flex-direction: column;\n  border-left: 1px solid var(--pr-border);\n  background: var(--pr-panel);\n}\n\n.pr-outline-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  padding: 10px 8px 8px 14px;\n  border-bottom: 1px solid var(--pr-border);\n  color: var(--pr-faint);\n  font-size: 10.5px;\n  letter-spacing: .14em;\n}\n\n.pr-outline-nav {\n  display: flex;\n  flex-direction: column;\n  gap: 1px;\n  padding: 8px;\n  overflow-y: auto;\n}\n\n.pr-outline-link {\n  padding: 6px 8px;\n  border: 0;\n  border-left: 2px solid transparent;\n  border-radius: 6px;\n  background: transparent;\n  color: var(--pr-muted);\n  font-size: 12px;\n  line-height: 1.4;\n  text-align: left;\n  cursor: pointer;\n}\n\n.pr-outline-link:hover {\n  background: var(--pr-panel-2);\n  color: var(--pr-text);\n}\n\n.pr-outline-link.is-sub {\n  padding-left: 18px;\n  font-size: 11.5px;\n}\n\n.pr-outline-link.is-active {\n  border-left-color: var(--pr-accent);\n  background: var(--pr-accent-soft);\n  color: var(--pr-accent);\n}\n\n.pr-outline-empty {\n  margin: 14px;\n  color: var(--pr-faint);\n  font-size: 11.5px;\n  line-height: 1.6;\n}\n\n/* ------------------------------------------------------------------ */\n/* States                                                              */\n/* ------------------------------------------------------------------ */\n\n.pr-loading,\n.pr-error,\n.pr-reader-empty {\n  flex: 1;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  gap: 10px;\n  padding: 40px;\n  color: var(--pr-muted);\n  font-size: 13px;\n  text-align: center;\n}\n\n.pr-reader-empty {\n  height: 100%;\n  min-height: 320px;\n}\n\n.pr-reader-empty svg {\n  width: 32px;\n  height: 32px;\n  color: var(--pr-faint);\n}\n\n.pr-reader-empty p {\n  margin: 0;\n  color: var(--pr-text-2);\n}\n\n.pr-reader-empty span {\n  color: var(--pr-faint);\n  font-size: 11.5px;\n}\n\n.pr-spinner {\n  width: 18px;\n  height: 18px;\n  border: 2px solid var(--pr-border-strong);\n  border-top-color: var(--pr-accent);\n  border-radius: 50%;\n  animation: pr-spin .8s linear infinite;\n}\n\n.pr-error-title {\n  color: var(--pr-text);\n  font-size: 15px;\n  font-weight: 600;\n}\n\n.pr-error-text {\n  margin: 0;\n  color: var(--pr-muted);\n  font-family: var(--pr-mono);\n  font-size: 12px;\n}\n\n.pr-error-hint {\n  margin: 0;\n  color: var(--pr-faint);\n  font-size: 12px;\n}\n\n.pr-error-hint code {\n  font-family: var(--pr-mono);\n  font-size: 11px;\n}\n\n.pr-toast {\n  position: absolute;\n  left: 50%;\n  bottom: 22px;\n  z-index: 50;\n  max-width: min(520px, 86%);\n  padding: 8px 14px;\n  border: 1px solid var(--pr-border-strong);\n  border-radius: 8px;\n  background: var(--pr-panel);\n  color: var(--pr-text);\n  font-size: 12px;\n  box-shadow: 0 8px 24px rgba(0, 0, 0, .18);\n  transform: translateX(-50%);\n}\n\n@keyframes pr-spin {\n  to { transform: rotate(360deg); }\n}\n\n@keyframes pr-shimmer {\n  0% { background-position: 100% 0; }\n  100% { background-position: 0 0; }\n}\n\n/* ------------------------------------------------------------------ */\n/* Narrow page container                                               */\n/* ------------------------------------------------------------------ */\n\n@container (max-width: 1120px) {\n  .pr-outline {\n    position: absolute;\n    top: 0;\n    right: 0;\n    bottom: 0;\n    z-index: 20;\n    box-shadow: -8px 0 24px rgba(0, 0, 0, .12);\n  }\n}\n\n@container (max-width: 820px) {\n  .pr-legend {\n    display: none;\n  }\n\n  .pr-pair {\n    grid-template-columns: minmax(0, 1fr);\n    gap: 8px;\n    padding: 14px 0;\n  }\n\n  .pr-pair-heading {\n    gap: 2px;\n    padding-top: 22px;\n  }\n\n  .pr-col-zh p {\n    color: var(--pr-text-2);\n    font-size: 16px;\n  }\n\n  .pr-paper {\n    padding-top: 24px;\n  }\n}\n\n/* Viewport-level mode: the DSH sidebar plus a right panel can make the page\n   narrower than the viewport, so pair stacking stays on the container query\n   while the drawer follows the window. */\n@media (max-width: 900px) {\n  .pr-sidebar {\n    position: absolute;\n    top: 0;\n    bottom: 0;\n    left: 0;\n    z-index: 30;\n    width: min(86%, 330px);\n    transform: translateX(-100%);\n    border-right: 1px solid var(--pr-border);\n    box-shadow: 8px 0 24px rgba(0, 0, 0, .18);\n    transition: transform .18s ease;\n  }\n\n  .pr-sidebar.is-drawer-open {\n    transform: translateX(0);\n  }\n\n  .pr-sidebar.is-collapsed {\n    display: flex;\n  }\n\n  .pr-scrim {\n    position: absolute;\n    inset: 0;\n    z-index: 25;\n    background: var(--dsw-alias-bg-mask-2, rgba(0, 0, 0, .28));\n  }\n\n  .pr-mobile-only {\n    display: inline-flex;\n  }\n\n  .pr-status,\n  .pr-reader-context {\n    display: none;\n  }\n\n  .pr-top {\n    gap: 8px;\n  }\n\n  .pr-mode-btn {\n    padding: 0 9px;\n    font-size: 11px;\n  }\n\n  .pr-paper {\n    padding-top: 22px;\n  }\n}\n\n@media print {\n  .pr-top,\n  .pr-sidebar,\n  .pr-outline,\n  .pr-reader-bar,\n  .pr-progress {\n    display: none;\n  }\n\n  .pr-root,\n  .pr-workspace,\n  .pr-reader,\n  .pr-scroll {\n    height: auto;\n    overflow: visible;\n  }\n}\n";

// src/client/index.jsx
var import_jsx_runtime = require("react/jsx-runtime");
var STORAGE_KEY = "dsh-paper-reader:v1";
var PANEL_ID = "paper-reader";
var MODES = [
  { id: "both", label: "\u4E2D\u82F1\u5BF9\u7167", short: "\u5BF9\u7167" },
  { id: "zh", label: "\u4EC5\u4E2D\u6587" },
  { id: "en", label: "English" }
];
var DIRECTION_COLORS = {
  agent: "#8b7cf6",
  reasoning: "#3f9fb0",
  training: "#b07d2a",
  alignment: "#3f8f63",
  architecture: "#b56b6b"
};
var WEEKDAYS = ["\u5468\u65E5", "\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D"];
var DEFAULT_PREFS = {
  mode: "both",
  direction: "all",
  bookmarksOnly: false,
  activeId: null,
  read: [],
  bookmarks: [],
  collapsed: [],
  sidebarCollapsed: false,
  outlineOpen: false
};
function readStoredPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { prefs: { ...DEFAULT_PREFS }, stored: false };
    const value = JSON.parse(raw);
    const prefs = { ...DEFAULT_PREFS, ...value && typeof value === "object" ? value : {} };
    prefs.mode = MODES.some((mode) => mode.id === prefs.mode) ? prefs.mode : "both";
    prefs.direction = typeof prefs.direction === "string" ? prefs.direction : "all";
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
function clockTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
function matchesQuery(item, query) {
  if (!query) return true;
  const haystack = [
    item.titleZh,
    item.titleEn,
    item.summaryZh,
    item.org,
    item.venue,
    ...Array.isArray(item.authors) ? item.authors : [],
    ...Array.isArray(item.tags) ? item.tags : []
  ].filter((value) => typeof value === "string").join(" ").toLowerCase();
  return haystack.includes(query);
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
function renderMath(text) {
  const source = typeof text === "string" ? text : "";
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
function ZhParagraph({ block }) {
  if (typeof block.zh === "string" && block.zh.length > 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: block.zh });
  if (block.zhState === "pending") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PendingParagraph, {});
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-missing", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: block.en }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u6682\u672A\u7FFB\u8BD1\uFF0C\u663E\u793A\u539F\u6587" })
  ] });
}
function UnreadDot() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-unread", title: "\u672A\u8BFB" });
}
function PaperReaderPage() {
  const stored = (0, import_react.useRef)(readStoredPrefs());
  const [prefs, setPrefs] = (0, import_react.useState)(stored.current.prefs);
  const [digest, setDigest] = (0, import_react.useState)(null);
  const [loadState, setLoadState] = (0, import_react.useState)("loading");
  const [loadError, setLoadError] = (0, import_react.useState)("");
  const [refreshing, setRefreshing] = (0, import_react.useState)(false);
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
  const load = (0, import_react.useCallback)(async (isRefresh) => {
    if (isRefresh) setRefreshing(true);
    else setLoadState("loading");
    try {
      const response = await fetch("/api/paper-reader/digest", {
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
      const data = await response.json();
      if (!data || !Array.isArray(data.days)) throw new Error("\u6570\u636E\u683C\u5F0F\u65E0\u6548");
      digestRef.current = data;
      setDigest(data);
      setLoadState("ready");
      setLoadError("");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isRefresh && digestRef.current) {
        showToast(`\u5237\u65B0\u5931\u8D25\uFF1A${message}`);
      } else {
        setLoadError(message);
        setLoadState("error");
      }
    } finally {
      setRefreshing(false);
    }
  }, [showToast]);
  (0, import_react.useEffect)(() => {
    void load(false);
  }, [load]);
  (0, import_react.useEffect)(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
    }
  }, [prefs]);
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
  const normalizedQuery = query.trim().toLowerCase();
  const baseItems = (0, import_react.useMemo)(() => items.filter(
    (item) => matchesQuery(item, normalizedQuery) && (!prefs.bookmarksOnly || prefs.bookmarks.includes(item.id))
  ), [items, normalizedQuery, prefs.bookmarksOnly, prefs.bookmarks]);
  const counts = (0, import_react.useMemo)(() => {
    const map = /* @__PURE__ */ new Map([["all", baseItems.length]]);
    for (const item of baseItems) map.set(item.direction, (map.get(item.direction) ?? 0) + 1);
    return map;
  }, [baseItems]);
  const visibleItems = (0, import_react.useMemo)(
    () => baseItems.filter((item) => prefs.direction === "all" || item.direction === prefs.direction),
    [baseItems, prefs.direction]
  );
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
    const out = [];
    activeItem.blocks.forEach((block, index) => {
      if (block && block.type === "heading") {
        const label = prefs.mode === "en" ? block.en ?? block.zh : block.zh ?? block.en;
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
    update({ direction: "all", bookmarksOnly: false });
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
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u6B63\u5728\u8BFB\u53D6\u6BCF\u65E5\u8BBA\u6587\u2026" })
    ] }) });
  }
  if (loadState === "error") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pr-root", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-error", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pr-error-title", children: "\u65E0\u6CD5\u8BFB\u53D6\u8BBA\u6587\u5217\u8868" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "pr-error-text", children: loadError }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "pr-error-hint", children: [
        "\u6570\u636E\u6765\u81EA ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "$DSH_HOME/paper-reader/digest.json" }),
        "\uFF1B\u6587\u4EF6\u7F3A\u5931\u65F6\u4F7F\u7528\u5185\u7F6E\u793A\u4F8B\u3002"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "pr-primary-btn", onClick: () => void load(false), children: "\u91CD\u8BD5" })
    ] }) });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-root", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: "pr-top", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-brand", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-brand-mark", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconBook, {}) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-brand-name", children: "\u8BBA\u6587\u9605\u8BFB" }),
        digest.demo && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-demo", title: "\u5F53\u524D\u4E3A\u5185\u7F6E\u793A\u4F8B\u6570\u636E\uFF1Bagent \u5199\u5165 digest.json \u540E\u81EA\u52A8\u5207\u6362", children: "\u793A\u4F8B\u6570\u636E" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-status", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-status-dot" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "pr-status-text", children: [
          "\u6BCF\u65E5 09:00 \u6293\u53D6 \xB7 X / Claude Blog \xB7 ",
          items.length,
          " \u7BC7 \xB7 ",
          unreadCount,
          " \u672A\u8BFB"
        ] })
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
              (normalizedQuery || prefs.direction !== "all" || prefs.bookmarksOnly) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-result-line", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                  visibleItems.length,
                  " \u7BC7\u5339\u914D"
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "pr-link-btn", onClick: clearFilters, children: "\u6E05\u9664\u7B5B\u9009" })
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-feed", role: "listbox", "aria-label": "\u8BBA\u6587\u5217\u8868", children: [
              groups.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-feed-empty", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u6CA1\u6709\u5339\u914D\u7684\u8BBA\u6587" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "pr-link-btn", onClick: clearFilters, children: "\u6E05\u9664\u641C\u7D22\u4E0E\u7B5B\u9009" })
              ] }),
              groups.map((group) => {
                const expanded = normalizedQuery || prefs.direction !== "all" || prefs.bookmarksOnly ? true : !prefs.collapsed.includes(group.date);
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
                            item.translation?.status === "partial" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-pill", children: "\u7FFB\u8BD1\u4E2D" }),
                            bookmarked && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-item-mark", title: "\u5DF2\u6536\u85CF", children: "\u2605" }),
                            !read && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(UnreadDot, {})
                          ] }),
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pr-item-title-zh", children: item.titleZh }),
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pr-item-title-en", children: item.titleEn }),
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
              })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-sidebar-foot", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u6BCF\u65E5 09:00 \u7531 agent \u6293\u53D6 \xB7 \u5DF2\u53BB\u91CD" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "pr-link-btn", onClick: () => showToast(digest.demo ? "\u5F53\u524D\u662F\u5185\u7F6E\u793A\u4F8B\uFF1Bagent \u5199\u5165 digest.json \u540E\u81EA\u52A8\u5207\u6362\u3002" : `\u6570\u636E\u6587\u4EF6\uFF1A${digest.digestPath ?? "digest.json"}`), children: "\u6570\u636E\u6765\u6E90" })
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
                activeItem.excerpt && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-chip-inline", children: "\u8282\u9009" })
              ] }),
              prefs.mode !== "en" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", { className: "pr-title-zh", children: activeItem.titleZh }),
              prefs.mode !== "zh" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: prefs.mode === "en" ? "pr-title-en pr-title-en-hero" : "pr-title-en", children: activeItem.titleEn }),
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
              prefs.mode !== "en" && activeItem.summaryZh && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-summary", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-summary-label", children: "\u5BFC\u8BFB" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: activeItem.summaryZh })
              ] }),
              activeItem.translation?.status === "partial" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-notice", children: [
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
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "$DSH_HOME/paper-reader/digest.json" }),
                " \u540E\uFF0C\u8FD9\u91CC\u4F1A\u81EA\u52A8\u6362\u6210\u771F\u5B9E\u6293\u53D6\u7ED3\u679C\u3002"
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-body", "data-mode": prefs.mode, children: [
              prefs.mode === "both" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-legend", "aria-hidden": "true", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u539F\u6587" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u4E2D\u6587" })
              ] }),
              activeItem.blocks.map((block, index) => {
                if (!block || typeof block !== "object") return null;
                const blockId = `pr-b-${index}`;
                const anchor = { "data-block": index, id: blockId };
                if (block.type === "heading") {
                  const level = Number(block.level) || 1;
                  const HeadingTag = level <= 2 ? "h2" : "h3";
                  if (prefs.mode === "both") {
                    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-pair pr-pair-heading", ...anchor, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pr-col pr-col-en", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeadingTag, { children: block.en }) }),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pr-col pr-col-zh", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeadingTag, { children: block.zh ?? block.en }) })
                    ] }, index);
                  }
                  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeadingTag, { className: "pr-single-heading", ...anchor, children: prefs.mode === "en" ? block.en ?? block.zh : block.zh ?? block.en }, index);
                }
                if (block.type === "paragraph") {
                  if (prefs.mode === "both") {
                    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-pair", ...anchor, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pr-col pr-col-en", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: block.en }) }),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pr-col pr-col-zh", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ZhParagraph, { block }) })
                    ] }, index);
                  }
                  if (prefs.mode === "en") {
                    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "pr-single-paragraph", ...anchor, children: block.en }, index);
                  }
                  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pr-single-paragraph", ...anchor, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ZhParagraph, { block }) }, index);
                }
                if (block.type === "equation") {
                  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figure", { className: "pr-equation", ...anchor, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "pr-eq-line", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-eq-display", children: renderMath(block.display) }),
                      block.label && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-eq-label", children: block.label })
                    ] }),
                    block.detail && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pr-eq-detail", children: renderMath(block.detail) }),
                    (block.noteZh || block.noteEn) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figcaption", { className: "pr-eq-note", children: [
                      prefs.mode !== "en" && block.noteZh && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: block.noteZh }),
                      prefs.mode !== "zh" && block.noteEn && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-eq-note-en", children: block.noteEn })
                    ] })
                  ] }, index);
                }
                if (block.type === "figure") {
                  const steps = Array.isArray(block.diagram?.steps) ? block.diagram.steps : [];
                  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figure", { className: "pr-figure", ...anchor, children: [
                    steps.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pr-diagram", role: "img", "aria-label": block.diagram?.title ?? "\u6D41\u7A0B\u56FE", children: steps.map((step, stepIndex) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "pr-diagram-step-wrap", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-diagram-step", children: step }),
                      stepIndex < steps.length - 1 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "pr-diagram-arrow", "aria-hidden": "true", children: "\u2192" })
                    ] }, `${step}-${stepIndex}`)) }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figcaption", { className: "pr-figure-caption", children: [
                      prefs.mode !== "zh" && block.captionEn && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: block.captionEn }),
                      prefs.mode !== "en" && block.captionZh && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: block.captionZh })
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
