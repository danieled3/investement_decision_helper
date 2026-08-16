/**
 * UI controller: reads the form, runs the simulation in a worker, renders the
 * chart, the tiles and the table.
 *
 * The engine works in today's euros. The "euros of the day" view is produced by
 * scaling the percentile bands with the cumulative inflation factor (exact,
 * because scaling by a positive deterministic factor preserves percentile
 * order) and by reading the separately-tracked nominal path extrema out of the
 * engine result.
 */

import { createFanChart, createHistogram, euro, euroCompact, pct, signedPct } from "./chart.js";
import { DEFAULTS } from "./engine.js";
import { REGIMES, TAX_DEFAULTS, resolveTaxPlan, describeTaxPlan } from "./tax.js";

const $ = (id) => document.getElementById(id);

/* Plain counts get the same thin-space grouping as the euro amounts, so a
   European reader never has to guess whether a comma is a decimal point. */
const count = (n) => Math.round(n).toLocaleString("en-GB").replace(/,/g, "\u202f");

let DATA = null;
let worker = null;
let fallbackSimulate = null;
let fallbackWindows = null;
let fan = null;
let hist = null;
let lastResult = null;
let lastWindows = null;
let runToken = 0;
let view = "real"; // "real" | "nominal"
let showTable = false;

// ------------------------------------------------------------------ form state

const FIELDS = {
  initialRisky: "num",
  initialSafe: "num",
  monthlyRisky: "num",
  monthlySafe: "num",
  years: "int",
  terRisky: "pct",
  terSafe: "pct",
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
  gbpEur: "num",
};

function readForm() {
  const num = (id, min, max, dflt) => {
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
    equityYield: num("equityYield", 0, 10, 1.8) / 100,
    bondYield: num("bondYield", 0, 15, 3) / 100,
    wealthRate: num("wealthRate", 0, 3, 0.2) / 100,
    gbpEur: num("gbpEur", 0.5, 3, 1.15),
  });
  return {
    tax,
    initialRisky: num("initialRisky", 0, 1e9, 10000),
    initialSafe: num("initialSafe", 0, 1e9, 5000),
    monthlyRisky: num("monthlyRisky", 0, 1e7, 400),
    monthlySafe: num("monthlySafe", 0, 1e7, 100),
    years: Math.round(num("years", 1, 40, 10)),
    terRisky: num("terRisky", 0, 5, 0.2) / 100,
    terSafe: num("terSafe", 0, 5, 0.1) / 100,
    inflation: num("inflation", -5, 20, 2) / 100,
    eraStart,
    eraEnd,
    nPaths: parseInt($("nPaths").value, 10) || DEFAULTS.nPaths,
    blockMean: parseInt($("blockMean").value, 10) || DEFAULTS.blockMean,
    seed: Math.round(num("seed", 1, 2 ** 31 - 1, DEFAULTS.seed)),
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
  p.set("e", `${o.eraStart}-${o.eraEnd}`);
  p.set("v", view);
  p.set("i", (o.inflation * 100).toFixed(2));
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
  if (p.has("e") && [...$("era").options].some((o) => o.value === p.get("e"))) {
    $("era").value = p.get("e");
  }
  if (p.get("v") === "nominal") view = "nominal";
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
      setStatus("Running in this tab (worker unavailable) — the page may pause briefly.");
      run();
    };
    worker.postMessage({ type: "data", data: DATA });
  } catch (err) {
    worker = null;
  }

  wireControls();
  applyHash();
  syncViewButtons();
  syncTaxFields();
  run();
}

function onWorkerMessage(ev) {
  const m = ev.data;
  if (m.type === "ready") return;
  if (m.type === "progress") {
    setStatus(`Simulating… ${Math.round(m.value * 100)}%`);
    return;
  }
  if (m.type === "error") {
    setStatus(`Could not run: ${m.message}`);
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
  setStatus("Simulating…");
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
  btn.textContent = dark ? "Light mode" : "Dark mode";
  btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
}

function updatePlanSummary(o) {
  const start = o.initialRisky + o.initialSafe;
  const monthly = o.monthlyRisky + o.monthlySafe;
  $("sumStart").textContent = euro(start);
  $("sumMonthly").textContent = euro(monthly);
  $("sumHorizon").textContent = `${o.years} years`;
  $("sumTotal").textContent = euro(start + monthly * o.years * 12);
  $("taxSummary").textContent = describeTaxPlan(o.tax);
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
    $("toggleTable").textContent = showTable ? "Hide the numbers" : "Show the numbers";
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

  $("resetBtn").addEventListener("click", () => {
    $("initialRisky").value = 10000;
    $("initialSafe").value = 5000;
    $("monthlyRisky").value = 400;
    $("monthlySafe").value = 100;
    $("years").value = 10;
    $("terRisky").value = 0.2;
    $("terSafe").value = 0.1;
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
    $("gbpEur").value = String(TAX_DEFAULTS.gbpEur);
    syncTaxFields(true);
    run();
  });
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
  $("inflationField").hidden = view !== "nominal";
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
  for (const id of ["equityYield", "bondYield", "wealthRate", "gbpEur"]) {
    $(id).closest(".field").hidden = !advanced;
  }
  if (advanced) {
    $("gbpEur").closest(".field").hidden = c !== "gb";
  }
  if (countryChanged) {
    const r = REGIMES[c] || REGIMES.none;
    $("wealthRate").value = (r.wealthRate * 100).toFixed(2).replace(/\.?0+$/, "");
  }
}

// ------------------------------------------------------------------ rendering

function unitLabel() {
  return view === "real" ? "today's euros" : "euros of the day";
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
  return { label: `Real ${w.startYear}–${w.endYear}`, path, window: w };
}

function render() {
  const r = lastResult;
  if (!r) return;
  document.body.classList.remove("busy");
  const v = projectResult(r);
  const o = r.opts;
  const overlay = pickOverlay(v);

  // ---------------------------------------------------------------- headline
  const plan = v.tax.plan;
  $("heroValue").textContent = euro(v.final.p50);
  $("heroUnit").textContent = unitLabel();
  $("taxPill").textContent = v.tax.enabled
    ? `after ${plan.short}`
    : plan.id === "gb_isa"
      ? "tax-free inside an ISA"
      : "before any tax";
  $("taxPill").title = v.tax.enabled
    ? `What you would keep after ${plan.label} — the balance minus the tax that selling would trigger.`
    : "No tax has been deducted from any figure on this page.";
  const multiple = v.final.p50 / v.totalPaidIn;
  $("heroNote").textContent =
    `after ${o.years} years you would have paid in ${euro(v.totalPaidIn)} — ` +
    `that is ${multiple.toFixed(2)}× your money back` +
    (view === "real" ? ", already adjusted for inflation" : "") +
    (v.tax.enabled ? `, and already after ${plan.short}` : ", before any tax");

  // ---------------------------------------------------------------- tiles
  setTile("tileP1", euro(v.final.p1), `1 chance in 100 of ending below this`);
  setTile("tileP5", euro(v.final.p5), `5 chances in 100 of ending below this`);
  setTile("tileP95", euro(v.final.p95), `5 chances in 100 of ending above this`);
  setTile("tileP99", euro(v.final.p99), `1 chance in 100 of ending above this`);
  setTile("tilePaidIn", euro(v.totalPaidIn), `${euro(o.initialRisky + o.initialSafe)} now + ${euro(o.monthlyRisky + o.monthlySafe)}/month`);
  setTile(
    "tileBelow",
    pct(v.probBelowPaidIn, 1),
    `chance of ending with less than you paid in`
  );

  // ---------------------------------------------------------- the bumpy road
  setTile("tileLow1", euro(v.lowest.p1), "in the unluckiest 1 case in 100");
  setTile("tileLow5", euro(v.lowest.p5), "in the unluckiest 5 cases in 100");
  setTile("tileLowMed", euro(v.lowest.p50), "in the typical case");
  setTile("tileHigh50", euro(v.highest.p50), "in the typical case");
  setTile("tileHigh95", euro(v.highest.p95), "in the luckiest 5 cases in 100");
  setTile("tileHigh99", euro(v.highest.p99), "in the luckiest 1 case in 100");
  setTile("tileDD50", pct(v.drawdown.p50, 0), "typical worst fall from a peak");
  setTile("tileDD95", pct(v.drawdown.p95, 0), "worst fall in 5 cases in 100");
  setTile("tileDD99", pct(v.drawdown.p99, 0), "worst fall in 1 case in 100");
  setTile(
    "tileGap1",
    euro(v.worstGap.p1),
    "worst that your balance ever sat below the money you had paid in, 1 case in 100"
  );
  setTile(
    "tileGap50",
    euro(v.worstGap.p50),
    "the same figure in the typical case (0 means it never went underwater)"
  );

  $("lowestExplain").textContent =
    `The lowest point is measured month by month along every one of the ` +
    `${count(o.nPaths)} simulated journeys, so it includes falls that ` +
    `happen in the middle of a year and recover before the year ends.`;

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
  $("allocNote").textContent =
    `${pct(riskyShare, 0)} of the money you put in goes to the risky part, ` +
    `${pct(1 - riskyShare, 0)} to the safer part.`;

  setStatus(
    `${count(o.nPaths)} simulated journeys · ` +
    `${lastWindows.length} real historical ${o.years}-year windows · ` +
    `${(r.elapsedMs / 1000).toFixed(1)}s · seed ${o.seed} (same inputs always give the same answer)`
  );
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
    items.push(`<li><span class="key-rect" style="background:${c("--band-99")}"></span>99 out of 100 outcomes land in here</li>`);
  }
  if ($("band95").checked) {
    items.push(`<li><span class="key-rect" style="background:${c("--band-95")}"></span>95 out of 100</li>`);
  }
  if ($("band50").checked) {
    items.push(`<li><span class="key-rect" style="background:${c("--band-50")}"></span>50 out of 100 (the everyday range)</li>`);
  }
  items.push(`<li><span class="key-line" style="background:${c("--median")};height:3px"></span>Middle outcome</li>`);
  items.push(`<li><span class="key-line" style="background:${c("--series-2")}"></span>Money you paid in</li>`);
  if (overlay) {
    items.push(`<li><span class="key-line" style="background:${c("--series-3")}"></span>${overlay.label} (what actually happened)</li>`);
  }
  $("fanLegend").innerHTML = items.join("");
}

function renderTable() {
  const r = lastResult;
  if (!r) return;
  const v = projectResult(r);
  const overlay = pickOverlay(v);
  const head =
    `<tr><th>Year</th><th>Worst 1 in 100</th><th>Worst 5 in 100</th>` +
    `<th>Lower everyday</th><th>Middle</th><th>Upper everyday</th>` +
    `<th>Best 5 in 100</th><th>Best 1 in 100</th><th>Paid in</th>` +
    (overlay ? `<th>${overlay.label}</th>` : "") +
    `</tr>`;
  const rows = [];
  for (let yr = 0; yr <= r.opts.years; yr++) {
    const t = yr * 12;
    rows.push(
      `<tr><td>${yr}</td>` +
      [1, 5, 25, 50, 75, 95, 99].map((p) => `<td>${euro(v.bands[p][t])}</td>`).join("") +
      `<td>${euro(v.paidIn[t])}</td>` +
      (overlay ? `<td>${euro(overlay.path[t])}</td>` : "") +
      `</tr>`
    );
  }
  $("tableView").innerHTML =
    `<div class="table-wrap"><table><caption class="skip">Portfolio value by year, in ${unitLabel()}</caption>` +
    `<thead>${head}</thead><tbody>${rows.join("")}</tbody></table></div>` +
    `<p class="sub" style="margin-top:10px">All figures in ${unitLabel()}. ` +
    `"Everyday range" is the middle half of outcomes (25th to 75th out of 100).</p>`;
}

/* Rates read better without trailing zeros — 26%, 12.5%, 8.75% — except where a
   fixed number of decimals is the conventional way to write them (0.20%). */
const rate = (x, forceDigits = null) => {
  if (forceDigits !== null) return `${(x * 100).toFixed(forceDigits)}%`;
  const s = (x * 100).toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return `${s}%`;
};

function renderTax(v, o) {
  const t = v.tax;
  const plan = t.plan;
  const unit = unitLabel();

  if (!t.enabled) {
    $("taxIntro").textContent = plan.id === "gb_isa"
      ? "Inside an ISA the tax authority takes nothing at all: no tax on the income, " +
        "no tax on the gain, nothing yearly. Every figure on this page is what you keep."
      : "No tax is being deducted, so every figure on this page is a before-tax figure. " +
        "Pick Italy or the United Kingdom above to see what you would actually keep.";
    setTile("tileTaxTotal", euro(0), "nothing is being deducted");
    setTile("tileTaxYearly", euro(0), "nothing is being deducted");
    setTile("tileTaxExit", euro(0), "nothing is being deducted");
    setTile("tileTaxShare", "0%", "you keep the whole profit");
    $("taxRules").innerHTML = plan.id === "gb_isa"
      ? "<li>An ISA shelters everything inside it, so there is nothing to apply.</li>"
      : "<li>No country selected, so no rule is being applied.</li>";
    $("taxCallout").innerHTML = plan.id === "gb_isa"
      ? "<strong>Worth knowing.</strong> This is the strongest argument for filling an " +
        "ISA before an ordinary account: switch “Type of account” back and see how much " +
        "the same plan hands over when it is not sheltered."
      : "<strong>Try it.</strong> Choose a country above and every number on the page — " +
        "the headline, the bands, the lowest point, the biggest fall — becomes the " +
        "after-tax figure instead. The difference is usually larger than people expect.";
    return;
  }

  const gross = t.grossGainAtMedian;
  $("taxIntro").innerHTML =
    `Under <b>${plan.label}</b>, on the middle journey. All amounts in ${unit}. ` +
    `Every other figure on this page is already after this tax — the balance you could ` +
    `sell for, minus the tax that selling would trigger.`;

  setTile(
    "tileTaxTotal",
    euro(t.total.p50),
    `between ${euro(t.total.p5)} and ${euro(t.total.p95)} across the luckier and unluckier journeys`
  );
  setTile(
    "tileTaxYearly",
    euro(t.yearly.p50),
    plan.wealthRate > 0 || plan.taxesIncome
      ? `charges you cannot avoid by holding on — ${euro(t.yearly.p5)} to ${euro(t.yearly.p95)}`
      : "nothing is taken while you hold"
  );
  setTile(
    "tileTaxExit",
    euro(t.exit.p50),
    `the bill if you sold everything in the final month — ${euro(t.exit.p5)} to ${euro(t.exit.p95)}`
  );
  setTile(
    "tileTaxShare",
    pct(t.shareOfGainAtMedian, 1),
    `of the ${euro(gross)} profit you made before tax`
  );

  // ---- exactly which rules produced those numbers ----
  const rules = [];
  rules.push(
    `<li><b>${rate(plan.equityExit)}</b> on the gain of the share part and ` +
    `<b>${rate(plan.bondExit)}</b> on the gain of the bond part, charged when you sell.` +
    (plan.equityExit !== plan.bondExit
      ? " Government bonds get the gentler rate."
      : "") +
    `</li>`
  );
  if (plan.wealthRate > 0) {
    const firstYear = (o.initialRisky + o.initialSafe) * plan.wealthRate;
    rules.push(
      `<li><b>${rate(plan.wealthRate, 2)}</b> a year on the whole balance, owed whether ` +
      `you gained or lost — about ${euro(firstYear)} in the first year on your ` +
      `${euro(o.initialRisky + o.initialSafe)} starting pot, and more as the pot grows.</li>`
    );
  } else {
    rules.push(`<li>No yearly charge on the balance itself.</li>`);
  }
  if (plan.taxesIncome) {
    // Only mention an allowance that actually exists — the additional rate takes
    // the savings allowance away entirely, and "€0 free" reads like a bug.
    const allowances = [];
    if (plan.equityIncomeAllowance > 0) {
      allowances.push(`${euro(plan.equityIncomeAllowance)} of share income`);
    }
    if (plan.bondIncomeAllowance > 0) {
      allowances.push(`${euro(plan.bondIncomeAllowance)} of bond income`);
    }
    rules.push(
      `<li><b>${rate(plan.equityIncomeRate)}</b> a year on the dividends the share fund ` +
      `earns and <b>${rate(plan.bondIncomeRate)}</b> a year on the interest the bond fund ` +
      `earns` +
      (allowances.length
        ? `, with the first ${allowances.join(" and ")} free each year`
        : ", with no tax-free amount at this income level") +
      `. Assumed yields: ${rate(plan.equityYield, 1)} on shares, ` +
      `${rate(plan.bondYield, 1)} on bonds.` +
      (plan.id === "gb"
        ? " In the UK this is owed even though the fund reinvests the money and you never see it."
        : "") +
      `</li>`
    );
  } else {
    rules.push(
      `<li>Nothing is taxed while you hold: the funds reinvest their income and ` +
      `${plan.country} only taxes it when you finally sell. This is the single biggest ` +
      `advantage of an accumulating ETF here.</li>`
    );
  }
  if (plan.exitAllowance > 0) {
    rules.push(
      `<li>The first <b>${euro(plan.exitAllowance)}</b> of gain in a tax year is free, ` +
      `used against the more heavily taxed part first. It is a fixed cash amount, so ` +
      `inflation shrinks it a little every year.</li>`
    );
  }
  rules.push(
    plan.lossOffset
      ? `<li>A loss on one fund <b>can</b> be set against a gain on the other.</li>`
      : `<li>A loss on one fund <b>cannot</b> be set against a gain on the other: ` +
        `${plan.country} files ETF gains and ETF losses in two separate buckets ` +
        `(<em>redditi di capitale</em> and <em>redditi diversi</em>) that never meet.</li>`
  );
  rules.push(
    `<li>Tax is charged on the gain in plain euros, with no allowance for inflation — ` +
    `so raising the inflation assumption raises the tax bill even though nothing real ` +
    `has changed.</li>`
  );
  $("taxRules").innerHTML = rules.join("");

  const share = t.shareOfGainAtMedian;
  $("taxCallout").innerHTML =
    `<strong>The tax costs you more than the tax.</strong> On the middle journey you ` +
    `hand over ${euro(t.total.p50)}, which is ${pct(share, 0)} of the ${euro(gross)} ` +
    `profit you made. But your final total drops by <em>more</em> than ${euro(t.total.p50)}: ` +
    `every euro taken early is also a euro that can never grow again. Set the country to ` +
    `“nowhere” and compare the headline to see the full cost.`;
}

function renderHistorical(v, overlay) {
  if (!lastWindows || !lastWindows.length) return;
  const f = v.factor;
  const items = lastWindows.map((w) => ({
    startYear: w.startYear,
    endYear: w.endYear,
    final: f ? w.final * f[f.length - 1] : w.final,
  }));
  hist.update({ items, unitLabel: unitLabel() });

  const sorted = [...items].sort((a, b) => a.final - b.final);
  const worst = sorted[0];
  const best = sorted[sorted.length - 1];
  const med = sorted[Math.floor(sorted.length / 2)];
  const nBelow = items.filter((x) => x.final < v.totalPaidIn).length;

  $("histSummary").innerHTML =
    `Every one of the <b>${items.length}</b> real ${lastResult.opts.years}-year stretches between ` +
    `${lastResult.era.start} and ${lastResult.era.end}, replayed with your exact plan. ` +
    `The worst was <b>${worst.startYear}–${worst.endYear}</b> (${euro(worst.final)}), ` +
    `the best <b>${best.startYear}–${best.endYear}</b> (${euro(best.final)}), ` +
    `and the middle one <b>${med.startYear}–${med.endYear}</b> (${euro(med.final)}). ` +
    `<b>${nBelow}</b> of them ended below the ${euro(v.totalPaidIn)} you would have paid in.`;

  // populate the overlay picker once per era/horizon change
  const sel = $("overlay");
  const wanted = `${lastResult.era.start}-${lastResult.era.end}-${lastResult.opts.years}`;
  if (sel.dataset.built !== wanted) {
    const keep = sel.value;
    sel.innerHTML =
      `<option value="none">none</option>` +
      `<option value="worst">the worst one that really happened</option>` +
      `<option value="median">the middle one</option>` +
      `<option value="best">the best one that really happened</option>` +
      lastWindows
        .map((w) => `<option value="${w.startYear}">starting in ${w.startYear} (${w.startYear}–${w.endYear})</option>`)
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
  setStatus(`Something went wrong: ${err.message}`);
  console.error(err);
});

void euroCompact;
