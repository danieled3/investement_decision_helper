/**
 * UI controller: reads the form, runs the simulation in a worker, renders the
 * chart, the tiles and the table.
 *
 * The engine works in real terms — "today's buying power" on the page. The nominal view
 * the page opens in, "future euros", is produced by scaling the percentile bands
 * with the cumulative inflation factor (exact, because scaling by a positive
 * deterministic factor preserves percentile order) and by reading the
 * separately-tracked nominal path extrema out of the engine result.
 */

import { createFanChart, createHistogram } from "./chart.js";
import { DEFAULTS } from "./engine.js";
import {
  t, num, count, euro, pct, signedPct, ratePct,
  initI18n, setLang, getLang, onLangChange, setCurrency, currency,
} from "./i18n.js";
import {
  REGIMES, TAX_DEFAULTS, resolveTaxPlan, describeTaxPlan,
  planLabel, planShort, planCountry,
} from "./tax.js";

const $ = (id) => document.getElementById(id);

let DATA = null;
let worker = null;
let fallbackSimulate = null;
let fallbackWindows = null;
let fan = null;
let hist = null;
let lastResult = null;
let lastWindows = null;
let runToken = 0;
/* "nominal" leads because it is the number the reader will actually see on a
   statement; "real" is one click away and the engine works in it either way. */
let view = "nominal"; // "nominal" | "real"
let showTable = false;

// ------------------------------------------------------------------ form state

const FIELDS = {
  initialRisky: "num",
  initialSafe: "num",
  monthlyRisky: "num",
  monthlySafe: "num",
  years: "int",
  bondMaturity: "int",
  advisorOn: "bool",
  advisorFee: "pct",
  terRisky: "pct",
  inflation: "pct",
  era: "str",
  nPaths: "int",
  blockMean: "int",
  seed: "int",
  intraYear: "bool",
  taxCountry: "str",
  taxFund: "str",
  taxWrapper: "str",
  taxBand: "str",
  equityYield: "pct",
  bondYield: "pct",
  wealthRate: "pct",
};

function readForm() {
  const field = (id, min, max, dflt) => {
    const v = parseFloat($(id).value);
    if (!Number.isFinite(v)) return dflt;
    return Math.max(min, Math.min(max, v));
  };
  const [eraStart, eraEnd] = $("era").value.split("-").map(Number);
  // The plan is resolved here rather than in the engine so that the worker
  // receives plain numbers and the UI can describe exactly what it applied.
  const tax = resolveTaxPlan({
    country: $("taxCountry").value,
    band: $("taxBand").value,
    wrapper: $("taxWrapper").value,
    fundType: $("taxFund").value,
    equityYield: field("equityYield", 0, 10, 1.8) / 100,
    bondYield: field("bondYield", 0, 15, 3) / 100,
    wealthRate: field("wealthRate", 0, 3, 0.2) / 100,
  });
  return {
    tax,
    initialRisky: field("initialRisky", 0, 1e9, 10000),
    initialSafe: field("initialSafe", 0, 1e9, 5000),
    monthlyRisky: field("monthlyRisky", 0, 1e7, 400),
    monthlySafe: field("monthlySafe", 0, 1e7, 100),
    years: Math.round(field("years", 1, 40, 10)),
    // How long each government bond runs before it matures and is replaced.
    bondMaturity: Math.round(field("bondMaturity", 1, 10, 10)),
    // The percentage stays in the box when the flag is cleared, so that unticking
    // and re-ticking does not lose it — but a cleared flag must mean zero.
    advisorFee: $("advisorOn").checked ? field("advisorFee", 0, 5, 1) / 100 : 0,
    terRisky: field("terRisky", 0, 5, 0.2) / 100,
    inflation: field("inflation", -5, 20, 2) / 100,
    eraStart,
    eraEnd,
    nPaths: parseInt($("nPaths").value, 10) || DEFAULTS.nPaths,
    blockMean: parseInt($("blockMean").value, 10) || DEFAULTS.blockMean,
    seed: Math.round(field("seed", 1, 2 ** 31 - 1, DEFAULTS.seed)),
    intraYear: $("intraYear").checked,
  };
}

// ------------------------------------------------------------- URL sharing

function writeHash(o) {
  const p = new URLSearchParams();
  p.set("ir", o.initialRisky);
  p.set("is", o.initialSafe);
  p.set("mr", o.monthlyRisky);
  p.set("ms", o.monthlySafe);
  p.set("y", o.years);
  if (o.bondMaturity !== 10) p.set("bm", o.bondMaturity);
  p.set("e", `${o.eraStart}-${o.eraEnd}`);
  p.set("v", view);
  p.set("l", getLang());
  p.set("i", (o.inflation * 100).toFixed(2));
  // Absent rather than zero when nobody is paid, so the ordinary link stays short.
  if (o.advisorFee > 0) p.set("af", (o.advisorFee * 100).toFixed(2));
  p.set("c", $("taxCountry").value);
  if ($("taxCountry").value === "it") p.set("f", $("taxFund").value);
  if ($("taxCountry").value === "gb") {
    p.set("b", $("taxBand").value);
    p.set("w", $("taxWrapper").value);
  }
  history.replaceState(null, "", `#${p.toString()}`);
}

function applyHash() {
  if (!location.hash || location.hash.length < 2) return;
  const p = new URLSearchParams(location.hash.slice(1));
  const set = (id, key) => {
    if (p.has(key)) $(id).value = p.get(key);
  };
  set("initialRisky", "ir");
  set("initialSafe", "is");
  set("monthlyRisky", "mr");
  set("monthlySafe", "ms");
  set("inflation", "i");
  if (p.has("y")) $("years").value = p.get("y");
  if (p.has("bm") && [...$("bondMaturity").options].some((o) => o.value === p.get("bm")))
    $("bondMaturity").value = p.get("bm");
  // A shared link carries the fee, and the fee implies the flag: a link that
  // arrived with a percentage in it but the box unticked would show one thing and
  // simulate another. Zero, or anything unreadable, leaves the flag clear.
  if (p.has("af")) {
    const fee = parseFloat(p.get("af"));
    if (Number.isFinite(fee) && fee > 0) {
      $("advisorFee").value = String(Math.min(5, fee));
      $("advisorOn").checked = true;
    }
  }
  if (p.has("e") && [...$("era").options].some((o) => o.value === p.get("e"))) {
    $("era").value = p.get("e");
  }
  if (p.get("v") === "real") view = "real";
  // Only accept values the select actually offers, so a hand-edited link cannot
  // leave a control showing something the simulation is not using.
  const pick = (id, key) => {
    if (p.has(key) && [...$(id).options].some((o) => o.value === p.get(key))) {
      $(id).value = p.get(key);
    }
  };
  pick("taxCountry", "c");
  pick("taxFund", "f");
  pick("taxBand", "b");
  pick("taxWrapper", "w");
}

// ------------------------------------------------------------------- plumbing

async function boot() {
  // The language has to be settled before anything writes text, and before the
  // prose is replaced — initI18n harvests the English out of the page first.
  initI18n(new URLSearchParams(location.hash.slice(1)).get("l"));

  const res = await fetch("data/returns.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`could not load data/returns.json (${res.status})`);
  DATA = await res.json();

  fillDatasetFacts();

  fan = createFanChart($("fanChart"));
  hist = createHistogram($("histChart"));

  try {
    worker = new Worker("js/worker.js", { type: "module" });
    worker.onmessage = onWorkerMessage;
    worker.onerror = () => {
      worker = null;
      setStatus(t("js.status.noWorker"));
      run();
    };
    worker.postMessage({ type: "data", data: DATA });
  } catch (err) {
    worker = null;
  }

  onLangChange(onLanguageChanged);
  wireControls();
  applyHash();
  syncViewButtons();
  syncLangButtons();
  syncTaxFields();
  syncAdvisorFields();
  run();
}

function onWorkerMessage(ev) {
  const m = ev.data;
  if (m.type === "ready") return;
  if (m.type === "progress") {
    setStatus(t("js.status.simulatingPct", { pct: Math.round(m.value * 100) }));
    return;
  }
  if (m.type === "error") {
    setStatus(t("js.status.failed", { msg: m.message }));
    document.body.classList.remove("busy");
    return;
  }
  if (m.type === "result") {
    if (m.token !== runToken) return; // a newer run superseded this one
    lastResult = m.result;
    lastWindows = m.windows;
    render();
  }
}

async function runOnMainThread(opts) {
  if (!fallbackSimulate) {
    const mod = await import("./engine.js");
    fallbackSimulate = mod.simulate;
    fallbackWindows = mod.historicalWindows;
  }
  const t0 = performance.now();
  const result = fallbackSimulate(DATA, opts);
  result.elapsedMs = performance.now() - t0;
  lastResult = result;
  lastWindows = fallbackWindows(DATA, opts);
  render();
}

let runTimer = null;
function scheduleRun() {
  clearTimeout(runTimer);
  runTimer = setTimeout(run, 260);
}

function run() {
  if (!DATA) return;
  const opts = readForm();
  writeHash(opts);
  updatePlanSummary(opts);
  document.body.classList.add("busy");
  setStatus(t("js.status.simulating"));
  runToken++;
  if (worker) {
    worker.postMessage({ type: "run", opts, token: runToken });
  } else {
    // keep the UI paint before blocking the thread
    setTimeout(() => runOnMainThread(opts), 30);
  }
}

function setStatus(text) {
  $("status").textContent = text;
}

/* Is the page dark right now? An explicit choice wins; otherwise the system. */
function isDark() {
  const chosen = document.documentElement.getAttribute("data-theme");
  if (chosen === "dark") return true;
  if (chosen === "light") return false;
  return matchMedia("(prefers-color-scheme: dark)").matches;
}

/* The button says what it will DO, so it must not be hard-coded at load time. */
function syncThemeLabel() {
  const dark = isDark();
  const btn = $("themeToggle");
  btn.textContent = t(dark ? "js.theme.toLight" : "js.theme.toDark");
  btn.setAttribute("aria-label", t(dark ? "js.theme.ariaLight" : "js.theme.ariaDark"));
}

function updatePlanSummary(o) {
  const start = o.initialRisky + o.initialSafe;
  const monthly = o.monthlyRisky + o.monthlySafe;
  $("sumStart").textContent = euro(start);
  $("sumMonthly").textContent = euro(monthly);
  $("sumHorizon").textContent = t("js.years", { n: o.years });
  $("sumTotal").textContent = euro(start + monthly * o.years * 12);
  $("taxSummary").textContent = describeTaxPlan(o.tax);
  // The plan column says what the plan is, so the fee belongs here as well as in
  // its own box — and it says the euro figure, because a percentage of a balance
  // is the one charge people routinely read as "nearly nothing".
  const adv = $("advisorSummary");
  adv.hidden = o.advisorFee <= 0;
  if (o.advisorFee > 0) {
    adv.textContent = t("js.adv.planSummary", {
      rate: ratePct(o.advisorFee, 2),
      amount: euro(start * o.advisorFee),
    });
  }
}

// ------------------------------------------------------------------- controls

function wireControls() {
  for (const id of Object.keys(FIELDS)) {
    const node = $(id);
    if (!node) continue;
    const ev = node.tagName === "SELECT" || node.type === "checkbox" ? "change" : "input";
    node.addEventListener(ev, scheduleRun);
  }

  $("viewReal").addEventListener("click", () => setView("real"));
  $("viewNominal").addEventListener("click", () => setView("nominal"));

  // Tax changes the simulation itself — charges paid early stop compounding —
  // so unlike the real/nominal toggle these cannot be applied to a finished run.
  $("taxCountry").addEventListener("change", () => syncTaxFields(true));
  $("taxWrapper").addEventListener("change", () => syncTaxFields());

  $("advisorOn").addEventListener("change", () => syncAdvisorFields());

  for (const id of ["band99", "band95", "band50"]) {
    $(id).addEventListener("change", () => {
      if (lastResult) render();
    });
  }
  $("overlay").addEventListener("change", () => {
    if (lastResult) render();
  });

  $("toggleTable").addEventListener("click", () => {
    showTable = !showTable;
    $("tableView").hidden = !showTable;
    $("toggleTable").textContent = t(showTable ? "js.table.hide" : "js.table.show");
    $("toggleTable").setAttribute("aria-expanded", String(showTable));
    if (showTable && lastResult) renderTable();
  });

  const prefersDark = matchMedia("(prefers-color-scheme: dark)");
  syncThemeLabel();
  // If the reader never chose a theme, follow the system when it changes.
  prefersDark.addEventListener("change", () => {
    if (!document.documentElement.hasAttribute("data-theme")) {
      syncThemeLabel();
      if (lastResult) render();
    }
  });
  $("themeToggle").addEventListener("click", () => {
    document.documentElement.setAttribute("data-theme", isDark() ? "light" : "dark");
    syncThemeLabel();
    if (lastResult) render(); // colours are read from CSS variables
  });

  $("langEn").addEventListener("click", () => setLanguage("en"));
  $("langIt").addEventListener("click", () => setLanguage("it"));

  /*
   * A chart inside a closed <details> has no width, so it draws at zero size and
   * stays that way until something asks it to redraw. The ResizeObserver in
   * chart.js catches most of it, but opening a box is exactly the moment the
   * reader wants to see something, so redraw explicitly.
   */
  for (const box of document.querySelectorAll("details.card.box, #chartOptions")) {
    box.addEventListener("toggle", () => {
      if (box.open && lastResult) render();
    });
  }

  $("resetBtn").addEventListener("click", () => {
    $("initialRisky").value = 10000;
    $("initialSafe").value = 5000;
    $("monthlyRisky").value = 400;
    $("monthlySafe").value = 100;
    $("years").value = 10;
    $("bondMaturity").value = "10";
    $("advisorOn").checked = false;
    $("advisorFee").value = 1;
    syncAdvisorFields();
    $("terRisky").value = 0.2;
    $("inflation").value = 2;
    $("era").value = "1900-2025";
    $("nPaths").value = String(DEFAULTS.nPaths);
    $("blockMean").value = "5";
    $("seed").value = String(DEFAULTS.seed);
    $("intraYear").checked = true;
    $("taxCountry").value = TAX_DEFAULTS.country;
    $("taxFund").value = TAX_DEFAULTS.fundType;
    $("taxWrapper").value = TAX_DEFAULTS.wrapper;
    $("taxBand").value = TAX_DEFAULTS.band;
    $("equityYield").value = String(TAX_DEFAULTS.equityYield * 100);
    $("bondYield").value = String(TAX_DEFAULTS.bondYield * 100);
    syncTaxFields(true);
    run();
  });
}

/*
 * Changing language replaces the prose wholesale, which throws away every
 * <span id> the dataset numbers were written into — so the fillers have to run
 * again, and so does everything drawn from JavaScript.
 */
function setLanguage(next) {
  if (next === getLang()) return;
  setLang(next);
}

function syncLangButtons() {
  $("langEn").setAttribute("aria-pressed", String(getLang() === "en"));
  $("langIt").setAttribute("aria-pressed", String(getLang() === "it"));
}

function onLanguageChanged() {
  syncLangButtons();
  syncThemeLabel();
  $("toggleTable").textContent = t(showTable ? "js.table.hide" : "js.table.show");
  // applyStatic has just repainted the euro wording of the country-named labels,
  // so put the current country's back.
  refreshCountryLabels($("taxCountry").value === "gb");
  if (DATA) fillDatasetFacts();
  const opts = readForm();
  updatePlanSummary(opts);
  writeHash(opts);
  if (lastResult) render();
  else setStatus(t("js.status.simulating"));
}

function setView(v) {
  view = v;
  syncViewButtons();
  if (lastResult) render();
  const opts = readForm();
  writeHash(opts);
}

function syncViewButtons() {
  $("viewReal").setAttribute("aria-pressed", String(view === "real"));
  $("viewNominal").setAttribute("aria-pressed", String(view === "nominal"));
  // The inflation rate is only an input while it is being applied.
  $("inflationField").hidden = view !== "nominal";
  syncViewNote();
}

/**
 * The sentence under the toggle. Two words on a button cannot carry the
 * difference between a nominal and a real amount, so the chosen one is spelled
 * out — with the horizon and the inflation actually in use, since those are what
 * make the two figures differ.
 */
function syncViewNote() {
  $("viewNote").textContent = view === "nominal"
    ? t("js.view.note.nominal", {
      years: $("years").value,
      infl: ratePct(Number($("inflation").value) / 100),
    })
    : t("js.view.note.real");
}

/**
 * Show only the questions the chosen country actually needs, and move the
 * yearly-charge field to that country's statutory rate. Called on every country
 * change, so the advanced field never keeps a rate from a different country —
 * which would silently invent a tax that does not exist there.
 */
function syncTaxFields(countryChanged = false) {
  const c = $("taxCountry").value;
  const isa = c === "gb" && $("taxWrapper").value === "isa";
  // In Italy the accumulating/distributing choice decides whether income is
  // taxed yearly; in the UK a reporting fund is taxed on it either way.
  $("taxFundField").hidden = c !== "it";
  $("taxWrapperField").hidden = c !== "gb";
  $("taxBandField").hidden = c !== "gb" || isa;
  const advanced = c !== "none" && !isa;
  for (const id of ["equityYield", "bondYield", "wealthRate"]) {
    $(id).closest(".field").hidden = !advanced;
  }
  // The bond, and therefore the money, follows the country: sterling gilts for
  // the UK, euro government bonds otherwise.
  applyCurrency(c);
  if (countryChanged) {
    const r = REGIMES[c] || REGIMES.none;
    $("wealthRate").value = (r.wealthRate * 100).toFixed(2).replace(/\.?0+$/, "");
  }
}

/**
 * Switch the whole page between euros and pounds. Only the symbol and a handful
 * of country-named labels change; the world-equity real return is the same in
 * either currency, so the numbers themselves do not move for the equity sleeve.
 */
function applyCurrency(country) {
  const gbp = country === "gb";
  setCurrency(gbp ? "£" : "€");
  document.documentElement.setAttribute("data-currency", gbp ? "gbp" : "eur");
  // The little symbol in front of every money input.
  for (const span of document.querySelectorAll(".euro-input > span")) {
    span.textContent = currency();
  }
  refreshCountryLabels(gbp);
  // Swapping the bond note back to euros restores its "−25.1%" placeholder, so
  // the dataset facts have to be written into it again.
  if (DATA) fillDatasetFacts();
}

/**
 * Text that names the bond itself — euro government bonds vs UK gilts — depends
 * on the country, not just the language. Each such element carries the two i18n
 * keys; this resolves the right one through t() so it is translated too, and it
 * re-runs on a language change because applyStatic would otherwise put the euro
 * wording back.
 */
function refreshCountryLabels(gbp) {
  for (const el of document.querySelectorAll("[data-i18n-eur]")) {
    const key = el.getAttribute(gbp ? "data-i18n-gbp" : "data-i18n-eur");
    el.innerHTML = t(key);
  }
}

/**
 * Most readers pay nobody, so the percentage box only exists once the flag is
 * ticked — an input that cannot affect the answer should not be on the screen.
 * The value it holds is left alone, so unticking and re-ticking is not
 * destructive.
 */
function syncAdvisorFields() {
  $("advisorFeeRow").hidden = !$("advisorOn").checked;
}

// ------------------------------------------------------------------ rendering

function unitLabel() {
  // "today's buying power" names no currency, but "future euros" does — so the
  // nominal label has a sterling variant chosen by the current symbol.
  if (view === "real") return t("js.unit.real");
  return t(currency() === "£" ? "js.unit.nominal.gbp" : "js.unit.nominal");
}

/** Everything the view needs, already converted into the chosen unit. */
function projectResult(r) {
  const nPts = r.nPts;
  if (view === "real") {
    return {
      bands: r.bands,
      paidIn: r.paidIn,
      totalPaidIn: r.totalPaidIn,
      final: r.final,
      lowest: r.lowest,
      highest: r.highest,
      drawdown: r.drawdown,
      worstGap: r.worstGap,
      probBelowPaidIn: r.probBelowPaidIn,
      tax: r.tax,
      advisor: r.advisor,
      factor: null,
      nPts,
    };
  }
  const f = r.nominal.factor;
  const bands = {};
  for (const k of Object.keys(r.bands)) {
    bands[k] = r.bands[k].map((v, t) => v * f[t]);
  }
  return {
    bands,
    paidIn: r.nominal.paidIn,
    totalPaidIn: r.nominal.totalPaidIn,
    final: r.nominal.final,
    lowest: r.nominal.lowest,
    highest: r.nominal.highest,
    drawdown: r.nominal.drawdown,
    worstGap: r.nominal.worstGap,
    probBelowPaidIn: r.nominal.probBelowPaidIn,
    // the yearly charges are paid at many different dates, so the engine adds
    // them up in euros of the day as it goes rather than converting afterwards
    tax: { ...r.tax, ...r.tax.nominal },
    // Same reason as the tax: the consultant is paid on many different dates, so
    // the bills are added up in euros of the day inside the engine. The rate and
    // the drag on the initial pot are ratios, so they are the same in both units.
    advisor: { ...r.advisor, ...r.nominal.advisor },
    factor: f,
    nPts,
  };
}

function pickOverlay(v) {
  const choice = $("overlay").value;
  if (choice === "none" || !lastWindows || !lastWindows.length) return null;
  const sorted = [...lastWindows].sort((a, b) => a.final - b.final);
  let w = null;
  if (choice === "worst") w = sorted[0];
  else if (choice === "best") w = sorted[sorted.length - 1];
  else if (choice === "median") w = sorted[Math.floor(sorted.length / 2)];
  else w = lastWindows.find((x) => String(x.startYear) === choice) || null;
  if (!w) return null;
  const path = v.factor ? w.path.map((x, t) => x * v.factor[t]) : w.path.slice();
  return {
    label: t("js.overlay.label", { a: w.startYear, b: w.endYear }),
    path,
    window: w,
  };
}

function render() {
  const r = lastResult;
  if (!r) return;
  document.body.classList.remove("busy");
  syncViewNote(); // the horizon or the inflation rate may just have changed
  const v = projectResult(r);
  const o = r.opts;
  const overlay = pickOverlay(v);

  // ---------------------------------------------------------------- headline
  const plan = v.tax.plan;
  $("heroValue").textContent = euro(v.final.p50);
  $("heroUnit").textContent = unitLabel();
  $("taxPill").textContent = v.tax.enabled
    ? t("js.pill.after", { short: planShort(plan) })
    : t(plan.id === "gb_isa" ? "js.pill.isa" : "js.pill.none");
  $("taxPill").title = v.tax.enabled
    ? t("js.pill.titleAfter", { label: planLabel(plan) })
    : t("js.pill.titleNone");
  /* The profit, beside the total. It is the number people actually want and it
     was missing: a total of €92 349 says nothing until you know that €75 000 of
     it is your own money. Sign carried by the words, the figures and the colour,
     because a loss must not be able to read as a gain at a glance. */
  const gain = v.final.p50 - v.totalPaidIn;
  const up = gain >= 0;
  const gainEl = $("heroGain");
  gainEl.textContent = t(up ? "js.heroGain.up" : "js.heroGain.down", {
    amount: (up ? "+" : "−") + euro(Math.abs(gain)),
    pct: signedPct(v.totalPaidIn > 0 ? gain / v.totalPaidIn : 0, 0),
  });
  gainEl.classList.toggle("down", !up);
  gainEl.title = t("js.heroGain.title", {
    paid: euro(v.totalPaidIn),
    years: o.years,
    unit: unitLabel(),
  });

  /* The multiple belongs to the headline, not to the money paid in — saying
     "you paid in €75 000, that is 1.23× your money back" reads as if the
     €75 000 were the multiple. Name each figure once, then say what unit both
     are in. */
  const multiple = v.final.p50 / v.totalPaidIn;
  const monthly = o.monthlyRisky + o.monthlySafe;
  const plainTotal = o.initialRisky + o.initialSafe + monthly * o.years * 12;
  $("heroNote").textContent = t("js.heroNote", {
    years: o.years,
    paid: euro(v.totalPaidIn),
    mult: num(multiple, 2),
    unit: unitLabel(),
    taxClause: v.tax.enabled
      ? t("js.heroNote.after", { short: planShort(plan) })
      : t("js.heroNote.before"),
  }) + (view === "nominal" && monthly > 0
    ? t("js.heroNote.raised", { monthly: euro(monthly), plain: euro(plainTotal) })
    : "");

  // ---------------------------------------------------------------- tiles
  setTile("tileP1", euro(v.final.p1), t("js.note.below1"));
  setTile("tileP5", euro(v.final.p5), t("js.note.below5"));
  setTile("tileP25", euro(v.final.p25), t("js.note.below25"));
  setTile("tileP75", euro(v.final.p75), t("js.note.above25"));
  setTile("tileP95", euro(v.final.p95), t("js.note.above5"));
  setTile("tileP99", euro(v.final.p99), t("js.note.above1"));
  setTile("tilePaidIn", euro(v.totalPaidIn), t(
    view === "nominal" ? "js.note.paidInRaised" : "js.note.paidIn", {
      start: euro(o.initialRisky + o.initialSafe),
      monthly: euro(o.monthlyRisky + o.monthlySafe),
    }));
  setTile("tileBelow", pct(v.probBelowPaidIn, 1), t("js.note.below"));

  // The two path-extreme tiles in the summary card carry one figure each, and it
  // is the extreme the label promises rather than the typical journey: two
  // numbers in one tile, one of them the middle case, read as a contradiction.
  // Section 4 lays out the whole ranking for both.
  setTile("tileMinPath", euro(v.lowest.p1), t("js.note.minPath"));
  setTile("tileMaxPath", euro(v.highest.p99), t("js.note.maxPath"));

  // ---------------------------------------------------------- the bumpy road
  setTile("tileLow1", euro(v.lowest.p1), t("js.case.unlucky1"));
  setTile("tileLow5", euro(v.lowest.p5), t("js.case.unlucky5"));
  setTile("tileLowMed", euro(v.lowest.p50), t("js.case.typical"));
  setTile("tileHigh50", euro(v.highest.p50), t("js.case.typical"));
  setTile("tileHigh95", euro(v.highest.p95), t("js.case.lucky5"));
  setTile("tileHigh99", euro(v.highest.p99), t("js.case.lucky1"));
  setTile("tileDD50", pct(v.drawdown.p50, 0), t("js.note.dd50"));
  setTile("tileDD95", pct(v.drawdown.p95, 0), t("js.note.dd95"));
  setTile("tileDD99", pct(v.drawdown.p99, 0), t("js.note.dd99"));
  setTile("tileGap1", euro(v.worstGap.p1), t("js.note.gap1"));
  setTile("tileGap50", euro(v.worstGap.p50), t("js.note.gap50"));

  $("lowestExplain").textContent = t("js.lowestExplain", { n: count(o.nPaths) });

  // ---------------------------------------------------------------- the chart
  fan.update({
    nPts: v.nPts,
    bands: v.bands,
    paidIn: v.paidIn,
    overlay,
    showBands: {
      p99: $("band99").checked,
      p95: $("band95").checked,
      p50: $("band50").checked,
    },
    unitLabel: unitLabel(),
  });
  renderLegend(overlay);
  if (showTable) renderTable();

  // --------------------------------------------------------------- the tax bill
  renderTax(v, o);

  // ------------------------------------------------------------- the consultant
  renderAdvisor(v, o);

  // ------------------------------------------------------- historical section
  renderHistorical(v, overlay);

  // ---------------------------------------------------------------- era facts
  $("eraYears").textContent = `${r.era.start}–${r.era.end}`;
  $("eraN").textContent = r.era.nYears;
  $("eraEquityCagr").textContent = signedPct(r.era.equityCagr, 2);
  $("eraBondCagr").textContent = signedPct(r.era.bondCagr, 2);
  $("eraEquityVol").textContent = pct(r.era.equityVol, 1);
  $("eraBondVol").textContent = pct(r.era.bondVol, 1);
  $("eraCorr").textContent = r.era.correlation.toFixed(2);

  const alloc = o.initialRisky + o.initialSafe + (o.monthlyRisky + o.monthlySafe) * o.years * 12;
  const riskyShare = alloc > 0
    ? (o.initialRisky + o.monthlyRisky * o.years * 12) / alloc
    : 0;
  $("allocNote").textContent = t("js.allocNote", {
    risky: pct(riskyShare, 0),
    safe: pct(1 - riskyShare, 0),
  });

  setStatus(t("js.status.summary", {
    n: count(o.nPaths),
    w: count(lastWindows.length),
    years: o.years,
    sec: num(r.elapsedMs / 1000, 1),
    seed: o.seed,
  }));
}

function setTile(id, value, note) {
  const el = $(id);
  if (!el) return;
  el.querySelector(".v").textContent = value;
  const n = el.querySelector(".n");
  if (n) n.textContent = note;
}

function renderLegend(overlay) {
  const rootStyle = getComputedStyle(document.documentElement);
  const c = (name) => rootStyle.getPropertyValue(name).trim();
  const items = [];
  if ($("band99").checked) {
    items.push(`<li><span class="key-rect" style="background:${c("--band-99")}"></span>${t("js.legend.b99")}</li>`);
  }
  if ($("band95").checked) {
    items.push(`<li><span class="key-rect" style="background:${c("--band-95")}"></span>${t("js.legend.b95")}</li>`);
  }
  if ($("band50").checked) {
    items.push(`<li><span class="key-rect" style="background:${c("--band-50")}"></span>${t("js.legend.b50")}</li>`);
  }
  items.push(`<li><span class="key-line" style="background:${c("--median")};height:3px"></span>${t("js.legend.median")}</li>`);
  items.push(`<li><span class="key-line" style="background:${c("--series-2")}"></span>${t("js.legend.paidIn")}</li>`);
  if (overlay) {
    items.push(`<li><span class="key-line" style="background:${c("--series-3")}"></span>${t("js.legend.overlay", { label: overlay.label })}</li>`);
  }
  $("fanLegend").innerHTML = items.join("");
}

function renderTable() {
  const r = lastResult;
  if (!r) return;
  const v = projectResult(r);
  const overlay = pickOverlay(v);
  const cols = ["year", "worst1", "worst5", "lowerEveryday", "middle",
    "upperEveryday", "best5", "best1", "paidIn"];
  const head =
    `<tr>${cols.map((k) => `<th>${t(`js.th.${k}`)}</th>`).join("")}` +
    (overlay ? `<th>${overlay.label}</th>` : "") +
    `</tr>`;
  const rows = [];
  for (let yr = 0; yr <= r.opts.years; yr++) {
    const m = yr * 12;
    rows.push(
      `<tr><td>${yr}</td>` +
      [1, 5, 25, 50, 75, 95, 99].map((p) => `<td>${euro(v.bands[p][m])}</td>`).join("") +
      `<td>${euro(v.paidIn[m])}</td>` +
      (overlay ? `<td>${euro(overlay.path[m])}</td>` : "") +
      `</tr>`
    );
  }
  const unit = unitLabel();
  $("tableView").innerHTML =
    `<div class="table-wrap"><table><caption class="skip">${t("js.table.caption", { unit })}</caption>` +
    `<thead>${head}</thead><tbody>${rows.join("")}</tbody></table></div>` +
    `<p class="sub" style="margin-top:10px">${t("js.table.footnote", { unit })}</p>`;
}

function renderTax(v, o) {
  // `tx` not `t`: the imported translator owns that name everywhere else.
  const tx = v.tax;
  const plan = tx.plan;
  const unit = unitLabel();

  $("taxHint").textContent = tx.enabled ? planShort(plan) : t("js.pill.none");

  if (!tx.enabled) {
    const isa = plan.id === "gb_isa";
    $("taxIntro").textContent = t(isa ? "js.tax.intro.isa" : "js.tax.intro.none");
    setTile("tileTaxTotal", euro(0), t("js.tax.nothingDeducted"));
    setTile("tileTaxYearly", euro(0), t("js.tax.nothingDeducted"));
    setTile("tileTaxExit", euro(0), t("js.tax.nothingDeducted"));
    setTile("tileTaxShare", pct(0, 0), t("js.tax.keepAll"));
    $("taxRules").innerHTML = t(isa ? "js.tax.rules.isa" : "js.tax.rules.none");
    $("taxCallout").innerHTML = t(isa ? "js.tax.callout.isa" : "js.tax.callout.none");
    return;
  }

  const gross = tx.grossGainAtMedian;
  $("taxIntro").innerHTML = t("js.tax.intro", { label: planLabel(plan), unit });

  setTile("tileTaxTotal", euro(tx.total.p50), t("js.tax.note.total", {
    lo: euro(tx.total.p5),
    hi: euro(tx.total.p95),
  }));
  setTile(
    "tileTaxYearly",
    euro(tx.yearly.p50),
    plan.wealthRate > 0 || plan.taxesIncome
      ? t("js.tax.note.yearly", { lo: euro(tx.yearly.p5), hi: euro(tx.yearly.p95) })
      : t("js.tax.note.yearlyNone")
  );
  setTile("tileTaxExit", euro(tx.exit.p50), t("js.tax.note.exit", {
    lo: euro(tx.exit.p5),
    hi: euro(tx.exit.p95),
  }));
  setTile("tileTaxShare", pct(tx.shareOfGainAtMedian, 1), t("js.tax.note.share", {
    gross: euro(gross),
  }));

  // ---- exactly which rules produced those numbers ----
  const rules = [];
  rules.push(
    "<li>" +
    t("js.tax.rule.exit", {
      eq: ratePct(plan.equityExit),
      bd: ratePct(plan.bondExit),
    }) +
    (plan.equityExit !== plan.bondExit ? t("js.tax.rule.gentler") : "") +
    "</li>"
  );
  if (plan.wealthRate > 0) {
    const pot = o.initialRisky + o.initialSafe;
    rules.push("<li>" + t("js.tax.rule.wealth", {
      rate: ratePct(plan.wealthRate, 2),
      first: euro(pot * plan.wealthRate),
      pot: euro(pot),
    }) + "</li>");
  } else {
    rules.push("<li>" + t("js.tax.rule.noWealth") + "</li>");
  }
  if (plan.taxesIncome) {
    // Only mention an allowance that actually exists — the additional rate takes
    // the savings allowance away entirely, and "€0 free" reads like a bug.
    const allowances = [];
    if (plan.equityIncomeAllowance > 0) {
      allowances.push(t("js.tax.rule.allowShare", { amount: euro(plan.equityIncomeAllowance) }));
    }
    if (plan.bondIncomeAllowance > 0) {
      allowances.push(t("js.tax.rule.allowBond", { amount: euro(plan.bondIncomeAllowance) }));
    }
    rules.push("<li>" + t("js.tax.rule.income", {
      eqRate: ratePct(plan.equityIncomeRate),
      bdRate: ratePct(plan.bondIncomeRate),
      allowance: allowances.length
        ? t("js.tax.rule.allowWith", { list: allowances.join(t("js.and")) })
        : t("js.tax.rule.allowNone"),
      eqYield: ratePct(plan.equityYield, 1),
      bdYield: ratePct(plan.bondYield, 1),
      uk: plan.id === "gb" ? t("js.tax.rule.uk") : "",
    }) + "</li>");
  } else {
    rules.push("<li>" + t("js.tax.rule.noIncome", { country: planCountry(plan) }) + "</li>");
  }
  if (plan.exitAllowance > 0) {
    rules.push("<li>" + t("js.tax.rule.exitAllowance", {
      amount: euro(plan.exitAllowance),
    }) + "</li>");
  }
  rules.push(
    "<li>" +
    (plan.lossOffset
      ? t("js.tax.rule.lossYes")
      : t("js.tax.rule.lossNo", { country: planCountry(plan) })) +
    "</li>"
  );
  rules.push("<li>" + t("js.tax.rule.nominal") + "</li>");
  $("taxRules").innerHTML = rules.join("");

  $("taxCallout").innerHTML = t("js.tax.callout", {
    total: euro(tx.total.p50),
    share: pct(tx.shareOfGainAtMedian, 0),
    gross: euro(gross),
  });
}

/**
 * The consultant's fee. The figure that leads, here and in the answer card, is
 * the MEAN bill rather than the median: a percentage of the balance is largest in
 * exactly the journeys that went well, so the median would quietly flatter the
 * arrangement. The percentiles are given underneath, where there is room to say
 * what they are.
 */
function renderAdvisor(v, o) {
  const a = v.advisor;
  const on = a.enabled;
  const unit = unitLabel();

  // The fourth tile in the leading row, and the extra column it needs.
  $("tileAdvisor").hidden = !on;
  $("tilesLead").classList.toggle("with-advisor", on);

  if (!on) {
    $("advisorHint").textContent = t("js.adv.hint.none");
    $("advisorIntro").innerHTML = t("js.adv.intro.none");
    setTile("tileAdvTotal", euro(0), t("js.adv.note.none"));
    setTile("tileAdvShare", pct(0, 0), t("js.adv.note.none"));
    setTile("tileAdvDrag", pct(0, 0), t("js.adv.note.none"));
    $("advisorDragNote").textContent = "";
    $("advisorRules").innerHTML = t("js.adv.rules.none");
    $("advisorCallout").innerHTML = t("js.adv.callout.none");
    return;
  }

  const rate = ratePct(a.fee, 2);
  setTile(
    "tileAdvisor",
    euro(a.mean),
    a.gainBeforeAtMean > 0
      ? t("js.adv.leadNote", {
          share: pct(a.shareOfGainAtMean, 1),
          years: o.years,
        })
      : t("js.adv.leadNote.noProfit", { rate, years: o.years })
  );
  $("advisorHint").textContent = t("js.adv.hint", { rate, amount: euro(a.mean) });
  $("advisorIntro").innerHTML = t("js.adv.intro", {
    rate, years: o.years, unit, amount: euro(a.mean),
  });

  setTile("tileAdvTotal", euro(a.mean), t("js.adv.note.total", {
    med: euro(a.p50), lo: euro(a.p5), hi: euro(a.p95),
  }));
  setTile("tileAdvShare", pct(a.shareOfGainAtMean, 1), t("js.adv.note.share", {
    gross: euro(a.gainBeforeAtMean),
  }));
  setTile("tileAdvDrag", pct(a.dragOnInitial, 1), t("js.adv.note.drag", {
    years: o.years,
  }));
  $("advisorDragNote").innerHTML = t("js.adv.dragNote", {
    rate,
    years: o.years,
    drag: pct(a.dragOnInitial, 1),
    left: pct(1 - a.dragOnInitial, 1),
  });

  // ---- exactly what the model did, so the number can be checked ----
  const rules = [];
  rules.push("<li>" + t("js.adv.rule.basis", {
    rate,
    amount: euro(a.feeOnToday),
    pot: euro(o.initialRisky + o.initialSafe),
  }) + "</li>");
  rules.push("<li>" + t("js.adv.rule.once") + "</li>");
  rules.push("<li>" + t("js.adv.rule.prorata") + "</li>");
  rules.push("<li>" + t("js.adv.rule.compounding", { years: o.years }) + "</li>");
  rules.push("<li>" + t(v.tax.enabled ? "js.adv.rule.tax" : "js.adv.rule.taxOff") + "</li>");
  rules.push("<li>" + t("js.adv.rule.mean") + "</li>");
  $("advisorRules").innerHTML = rules.join("");

  $("advisorCallout").innerHTML = t("js.adv.callout", {
    amount: euro(a.mean),
    share: pct(a.shareOfGainAtMean, 0),
    years: o.years,
    unit,
  });
}

function renderHistorical(v, overlay) {
  if (!lastWindows || !lastWindows.length) return;
  const f = v.factor;
  const items = lastWindows.map((w) => ({
    startYear: w.startYear,
    endYear: w.endYear,
    final: f ? w.final * f[f.length - 1] : w.final,
  }));
  hist.update({ items, years: lastResult.opts.years, unitLabel: unitLabel() });

  const sorted = [...items].sort((a, b) => a.final - b.final);
  const worst = sorted[0];
  const best = sorted[sorted.length - 1];
  const med = sorted[Math.floor(sorted.length / 2)];
  const nBelow = items.filter((x) => x.final < v.totalPaidIn).length;

  const span = (w) => `${w.startYear}–${w.endYear}`;
  $("histSummary").innerHTML = t("js.hist.summary", {
    n: items.length,
    years: lastResult.opts.years,
    from: lastResult.era.start,
    to: lastResult.era.end,
    worst: span(worst),
    worstV: euro(worst.final),
    best: span(best),
    bestV: euro(best.final),
    med: span(med),
    medV: euro(med.final),
    nBelow,
    paidIn: euro(v.totalPaidIn),
  });

  // populate the overlay picker once per era/horizon change
  const sel = $("overlay");
  const wanted = `${lastResult.era.start}-${lastResult.era.end}-${lastResult.opts.years}-${getLang()}`;
  if (sel.dataset.built !== wanted) {
    const keep = sel.value;
    sel.innerHTML =
      `<option value="none">${t("js.overlay.none")}</option>` +
      `<option value="worst">${t("js.overlay.worst")}</option>` +
      `<option value="median">${t("js.overlay.median")}</option>` +
      `<option value="best">${t("js.overlay.best")}</option>` +
      lastWindows
        .map((w) => `<option value="${w.startYear}">${t("js.overlay.startingIn", {
          y: w.startYear, a: w.startYear, b: w.endYear,
        })}</option>`)
        .join("");
    sel.dataset.built = wanted;
    sel.value = [...sel.options].some((op) => op.value === keep) ? keep : "worst";
  }
  void overlay;
}

// ------------------------------------------------------------ static injection

function fillDatasetFacts() {
  const s = DATA.stats;
  const m = DATA.meta;
  // Several of these facts appear in more than one place in the prose, so the
  // setter takes a list of ids and quietly skips any that are absent.
  const put = (ids, text) => {
    for (const id of [].concat(ids)) {
      const el = $(id);
      if (el) el.textContent = text;
    }
  };
  put(["dsRange", "dsRange2", "dsRange3", "dsRange4", "dsRange5", "dsRange6"],
    `${m.first_year}–${m.last_year}`);
  put(["dsN", "dsN2", "dsN3"], String(m.n_years));
  put("dsBuilt", m.built);
  put(["dsEquityCagr", "dsEquityCagr2"], signedPct(s.equity_real_cagr, 2));
  put(["dsBondCagr", "dsBondCagr2"], signedPct(s.bond_real_cagr, 2));
  put("dsEquityVol", pct(s.equity_real_vol, 1));
  put("dsBondVol", pct(s.bond_real_vol, 1));
  put("dsCorr", s.correlation.toFixed(2));
  put(["dsEquityWorst", "dsEquityWorst2"], signedPct(s.equity_worst_year, 1));
  put("dsEquityBest", signedPct(s.equity_best_year, 1));
  put(["dsBondWorst", "dsBondWorst2"], signedPct(s.bond_worst_year, 1));
  put("dsBondBest", signedPct(s.bond_best_year, 1));

  const worstYearOf = (key) => {
    let bi = 0;
    for (let i = 1; i < DATA[key].length; i++) if (DATA[key][i] < DATA[key][bi]) bi = i;
    return DATA.years[bi];
  };
  put("dsEquityWorstYear", String(worstYearOf("equity_real")));
  put("dsBondWorstYear", String(worstYearOf("bond_real")));

  const i2022 = DATA.years.indexOf(2022);
  if (i2022 >= 0) {
    put("ds2022eq", signedPct(DATA.equity_real[i2022], 1));
    put(["ds2022bd", "ds2022bd2"], signedPct(DATA.bond_real[i2022], 1));
  }

  const nJst = DATA.source_tag.filter((t) => t === "jst").length;
  put(["dsSplice", "dsSplice2"], `${DATA.years[nJst - 1]}`);
  put(["dsSpliceFrom", "dsSpliceFrom2"], `${DATA.years[nJst]}`);

  // worst and best single years, listed for the "how bad can one year be" table
  const rank = (key, dir) =>
    DATA.years
      .map((y, i) => ({ y, r: DATA[key][i] }))
      .sort((a, b) => (dir < 0 ? a.r - b.r : b.r - a.r))
      .slice(0, 5);
  const tbody = $("worstYearsBody");
  if (tbody) {
    const eqW = rank("equity_real", -1);
    const bdW = rank("bond_real", -1);
    tbody.innerHTML = eqW
      .map(
        (e, i) =>
          `<tr><td>${i + 1}</td><td>${e.y}</td><td>${signedPct(e.r, 1)}</td>` +
          `<td>${bdW[i].y}</td><td>${signedPct(bdW[i].r, 1)}</td></tr>`
      )
      .join("");
  }
}

// --------------------------------------------------------------------- start

boot().catch((err) => {
  setStatus(t("js.status.crashed", { msg: err.message }));
  console.error(err);
});
