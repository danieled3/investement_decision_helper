/**
 * Language switching, and every piece of formatting that depends on language.
 *
 * Two kinds of text need translating and they are handled differently:
 *
 *   1. Prose that sits in index.html. Those elements carry data-i18n="key".
 *      The English is left where it is, in the HTML, and is harvested into
 *      ORIGINAL the first time we look at the page; STRINGS only has to supply
 *      the Italian. That way the English page cannot be broken by a typo in a
 *      dictionary, and index.html still reads as a document.
 *
 *   2. Sentences built in JavaScript (tile notes, the tax rules, tooltips).
 *      Those have no home in the HTML, so STRINGS carries both languages.
 *
 * A blank `en` in STRINGS therefore means "take the English from the DOM".
 *
 * Some translated blocks contain <span id="..."> placeholders that app.js fills
 * with numbers from the dataset. Replacing innerHTML throws those away, so every
 * Italian string must keep the same ids, and every language change re-runs the
 * fillers. tests/verify.mjs checks the ids match, because a missing one would
 * silently blank a number on the page.
 *
 * This module must stay importable in Node — tax.js needs it and the test suite
 * imports tax.js — so nothing here touches the DOM until a function is called.
 */

import { STRINGS } from "./strings.js";

export const LANGS = ["en", "it"];

/** Names as each language calls itself, never translated. */
export const LANG_NAMES = { en: "English", it: "Italiano" };

let lang = "en";
const ORIGINAL = new Map(); // key -> English innerHTML harvested from the page
const listeners = new Set();

export function getLang() {
  return lang;
}

/**
 * Look up a string. `params` fills {placeholders}; values are inserted as-is,
 * so anything coming from user input must be formatted before it gets here.
 */
export function t(key, params = null) {
  const entry = STRINGS[key];
  let s = entry ? entry[lang] : undefined;
  if (s === undefined && lang !== "en") s = entry ? entry.en : undefined;
  if (s === undefined) s = ORIGINAL.get(key);
  if (s === undefined) {
    // Loud in the console, harmless on the page: better a visible key than a
    // silently empty sentence.
    if (typeof console !== "undefined") console.warn(`i18n: missing "${key}"`);
    return key;
  }
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m
  );
}

/** True when the current language has its own version of this key. */
export function has(key) {
  return Boolean(STRINGS[key] && STRINGS[key][lang] !== undefined);
}

// --------------------------------------------------------------- number format

/*
 * Thousands are separated by a narrow no-break space in both languages. That is
 * a deliberate choice rather than the local convention: "1.234" means one
 * thousand two hundred to an Italian reader and one point two three four to an
 * English one, and this page is read by both. The decimal separator, on the
 * other hand, is switched — "35,7%" is simply how a percentage is written in
 * Italian, and getting it wrong looks like a bug.
 */
const THIN = " ";

const decimalSep = () => (lang === "it" ? "," : ".");

/** A plain number with `d` decimals, in the current language's conventions. */
export function num(x, d = 0) {
  if (!Number.isFinite(x)) return "—";
  const neg = x < 0;
  const [int, frac] = Math.abs(x).toFixed(d).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
  return (neg ? "−" : "") + grouped + (frac ? decimalSep() + frac : "");
}

/** Whole counts: 100 000 journeys, 117 windows. */
export function count(n) {
  return num(Math.round(n), 0);
}

export function euro(x, decimals = 0) {
  if (!Number.isFinite(x)) return "—";
  return (x < 0 ? "−€" : "€") + num(Math.abs(x), decimals);
}

/** Short form for axis ticks and end labels: €12k, €1.4M. */
export function euroCompact(x) {
  if (!Number.isFinite(x)) return "—";
  const a = Math.abs(x);
  const sign = x < 0 ? "−" : "";
  if (a >= 1e6) return `${sign}€${num(a / 1e6, a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1000) return `${sign}€${num(a / 1000, a >= 10000 ? 0 : 1)}k`;
  return `${sign}€${num(Math.round(a), 0)}`;
}

export function pct(x, decimals = 1) {
  if (!Number.isFinite(x)) return "—";
  return `${num(x * 100, decimals)}%`;
}

export function signedPct(x, decimals = 1) {
  if (!Number.isFinite(x)) return "—";
  return (x >= 0 ? "+" : "−") + pct(Math.abs(x), decimals);
}

/**
 * A tax rate as a reader would write it: 26%, 12.5%, 8.75%, 0.20%. Trailing
 * zeros go, because "13%" for a 12.5% rate would simply be wrong; pass
 * forceDigits where a fixed number of decimals is the conventional spelling.
 */
export function ratePct(x, forceDigits = null) {
  if (forceDigits !== null) return pct(x, forceDigits);
  const raw = (x * 100).toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
  return pct(x, decimals);
}

/** A year range, e.g. 1900–2025. Same in both languages, but written once. */
export function yearRange(a, b) {
  return `${a}–${b}`;
}

// ------------------------------------------------------------------- the DOM

/**
 * Harvest the English out of the page. Called once, before anything can have
 * replaced it — so it must run before the first setLang.
 */
function harvest() {
  for (const node of document.querySelectorAll("[data-i18n]")) {
    const key = node.dataset.i18n;
    if (!ORIGINAL.has(key)) ORIGINAL.set(key, node.innerHTML);
  }
  if (!ORIGINAL.has("head.title")) ORIGINAL.set("head.title", document.title);
  const meta = document.querySelector('meta[name="description"]');
  if (meta && !ORIGINAL.has("head.description")) {
    ORIGINAL.set("head.description", meta.getAttribute("content"));
  }
}

/** Write the current language into every marked element. */
function applyStatic() {
  for (const node of document.querySelectorAll("[data-i18n]")) {
    const key = node.dataset.i18n;
    const next = lang === "en" ? ORIGINAL.get(key) : t(key);
    if (next !== undefined && node.innerHTML !== next) node.innerHTML = next;
  }
  document.documentElement.lang = lang;
  document.title = t("head.title");
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute("content", t("head.description"));
}

/**
 * Set the language and repaint. Everything that renders text from JavaScript
 * registers a listener, because applyStatic only knows about the prose.
 */
export function setLang(next, { remember = true } = {}) {
  if (!LANGS.includes(next)) return;
  lang = next;
  if (remember) {
    try {
      localStorage.setItem("idh.lang", next);
    } catch {
      /* private browsing: the URL still carries the choice */
    }
  }
  applyStatic();
  for (const fn of listeners) fn(lang);
}

export function onLangChange(fn) {
  listeners.add(fn);
}

/**
 * Decide which language to open in, in order of how deliberate the signal is:
 * an explicit ?l= in the shared link, then a remembered choice, then the
 * browser's own preference — so an Italian reader arriving cold gets Italian.
 */
export function initI18n(fromHash = null) {
  harvest();
  let chosen = null;
  if (fromHash && LANGS.includes(fromHash)) chosen = fromHash;
  if (!chosen) {
    try {
      const saved = localStorage.getItem("idh.lang");
      if (LANGS.includes(saved)) chosen = saved;
    } catch {
      /* ignore */
    }
  }
  if (!chosen) {
    const prefs = navigator.languages || [navigator.language || "en"];
    for (const p of prefs) {
      const base = String(p).toLowerCase().slice(0, 2);
      if (LANGS.includes(base)) {
        chosen = base;
        break;
      }
    }
  }
  // Remember only a deliberate choice; a browser-sniffed default should not
  // freeze, or the reader who switches back and forth gets confusing results.
  setLang(chosen || "en", { remember: Boolean(fromHash) });
  return lang;
}
