/**
 * Verification suite for the simulation engine.
 *
 *   node tests/verify.mjs
 *
 * These are correctness proofs, not smoke tests. The engine is checked against
 * closed-form algebra where a closed form exists, and against statistical
 * identities where it does not.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  simulate,
  historicalWindows,
  prepareEra,
  percentileSorted,
  makeRng,
  DEFAULTS,
} from "../js/engine.js";
import {
  resolveTaxPlan,
  exitTaxNominal,
  incomeTaxNominal,
  planLabel,
  planShort,
  planCountry,
  describeTaxPlan,
} from "../js/tax.js";
import { STRINGS } from "../js/strings.js";
import { setLang, num } from "../js/i18n.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(HERE, "../data/returns.json"), "utf8"));

let pass = 0;
let fail = 0;

function check(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  \x1b[32mPASS\x1b[0m ${name}${detail ? "  " + detail : ""}`);
  } else {
    fail++;
    console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? "  " + detail : ""}`);
  }
}

const rel = (a, b) => Math.abs(a - b) / Math.max(1e-9, Math.abs(b));
const eur = (x) =>
  "€" + x.toLocaleString("en-US", { maximumFractionDigits: 0 });

// =====================================================================
console.log("\n1. CLOSED FORM — constant returns must match the annuity formula");
// =====================================================================
{
  // A synthetic dataset where every year is identical. The bootstrap then has
  // no choice, so the simulation becomes deterministic and must equal algebra.
  const r = 0.07;
  const rb = 0.03;
  const synth = {
    years: Array.from({ length: 30 }, (_, i) => 1900 + i),
    equity_real: Array(30).fill(r),
    bond_real: Array(30).fill(rb),
    inflation: Array(30).fill(0),
  };
  const opts = {
    initialRisky: 10000,
    initialSafe: 5000,
    monthlyRisky: 400,
    monthlySafe: 100,
    years: 10,
    terRisky: 0,
    terSafe: 0,
    eraStart: 1900,
    eraEnd: 1929,
    nPaths: 200,
    intraYear: false, // no bridge noise -> fully deterministic
  };
  const res = simulate(synth, opts);

  // closed form: V = V0*g^n + C*(g^n - 1)/(g - 1), contributions at month end
  const annuity = (v0, c, rate, n) => {
    const g = Math.pow(1 + rate, 1 / 12);
    return v0 * Math.pow(g, n) + c * ((Math.pow(g, n) - 1) / (g - 1));
  };
  const expected =
    annuity(opts.initialRisky, opts.monthlyRisky, r, 120) +
    annuity(opts.initialSafe, opts.monthlySafe, rb, 120);

  check(
    "median equals closed form",
    rel(res.final.p50, expected) < 1e-9,
    `sim ${eur(res.final.p50)} vs algebra ${eur(expected)}`
  );
  check(
    "all percentiles collapse to one value (zero variance)",
    rel(res.final.p1, res.final.p99) < 1e-9,
    `p1 ${eur(res.final.p1)} = p99 ${eur(res.final.p99)}`
  );
  check(
    "lowest point equals the starting balance when returns are always positive",
    rel(res.lowest.p50, opts.initialRisky + opts.initialSafe) < 1e-9,
    `${eur(res.lowest.p50)}`
  );
  check(
    "no drawdown when returns never fall",
    res.drawdown.p99 < 1e-12,
    `max DD ${(res.drawdown.p99 * 100).toFixed(6)}%`
  );
  check(
    "money paid in is exact",
    res.totalPaidIn === 15000 + 500 * 120,
    `${eur(res.totalPaidIn)}`
  );
}

// =====================================================================
console.log("\n2. COSTS — TER must reduce returns by the right amount");
// =====================================================================
{
  const synth = {
    years: Array.from({ length: 20 }, (_, i) => 1900 + i),
    equity_real: Array(20).fill(0.07),
    bond_real: Array(20).fill(0.07),
    inflation: Array(20).fill(0),
  };
  const base = {
    initialRisky: 10000, initialSafe: 0, monthlyRisky: 0, monthlySafe: 0,
    years: 10, eraStart: 1900, eraEnd: 1919, nPaths: 50, intraYear: false,
  };
  const free = simulate(synth, { ...base, terRisky: 0, terSafe: 0 });
  const paid = simulate(synth, { ...base, terRisky: 0.005, terSafe: 0.005 });
  // ten years of a 0.5% annual charge on the sleeve
  const expectedRatio = Math.pow(1 - 0.005, 10);
  check(
    "0.5% TER over 10y compounds to the exact expected drag",
    rel(paid.final.p50 / free.final.p50, expectedRatio) < 1e-9,
    `ratio ${(paid.final.p50 / free.final.p50).toFixed(6)} vs ${expectedRatio.toFixed(6)}`
  );
}

// =====================================================================
console.log("\n3. BROWNIAN BRIDGE — adds within-year swings, not within-year drift");
// =====================================================================
{
  // (a) Zero-variance era => the bridge is calibrated to zero vol, so it must
  //     add nothing at all. Confirms the bridge scales off measured volatility.
  const flat = {
    years: Array.from({ length: 20 }, (_, i) => 1900 + i),
    equity_real: Array(20).fill(0.07),
    bond_real: Array(20).fill(0.03),
    inflation: Array(20).fill(0),
  };
  const flatBase = {
    initialRisky: 10000, initialSafe: 10000, monthlyRisky: 0, monthlySafe: 0,
    years: 10, terRisky: 0, terSafe: 0, eraStart: 1900, eraEnd: 1919, nPaths: 2000,
  };
  const fOff = simulate(flat, { ...flatBase, intraYear: false });
  const fOn = simulate(flat, { ...flatBase, intraYear: true });
  check(
    "bridge vol is calibrated from data: a zero-variance era yields zero wobble",
    rel(fOn.final.p50, fOff.final.p50) < 1e-9 && fOn.drawdown.p99 < 1e-12,
    `terminal ${eur(fOn.final.p50)}, max DD ${(fOn.drawdown.p99 * 100).toFixed(4)}%`
  );

  // (b) Real data, lump sum. The bridge pins each year to its actual return, so
  //     the TERMINAL distribution must be unchanged, while the PATH gains
  //     realistic intra-year dips that an annual grid cannot represent.
  const realBase = {
    initialRisky: 10000, initialSafe: 0, monthlyRisky: 0, monthlySafe: 0,
    years: 10, terRisky: 0, terSafe: 0, eraStart: 1900, eraEnd: 2025,
    nPaths: 100000, seed: 5,
  };
  const rOff = simulate(data, { ...realBase, intraYear: false });
  const rOn = simulate(data, { ...realBase, intraYear: true });
  check(
    "terminal distribution unchanged by the bridge (median within 1%)",
    rel(rOn.final.p50, rOff.final.p50) < 0.01,
    `on ${eur(rOn.final.p50)} vs off ${eur(rOff.final.p50)}`
  );
  check(
    "terminal tails unchanged by the bridge (p1 within 3%)",
    rel(rOn.final.p1, rOff.final.p1) < 0.03,
    `on ${eur(rOn.final.p1)} vs off ${eur(rOff.final.p1)}`
  );
  check(
    "bridge deepens the typical drawdown (within-year dips become visible)",
    rOn.drawdown.p50 > rOff.drawdown.p50 + 0.02,
    `with bridge ${(rOn.drawdown.p50 * 100).toFixed(1)}% vs without ${(rOff.drawdown.p50 * 100).toFixed(1)}%`
  );
  check(
    "bridge lowers the worst dip reached along the way",
    rOn.lowest.p1 < rOff.lowest.p1,
    `with bridge ${eur(rOn.lowest.p1)} vs without ${eur(rOff.lowest.p1)}`
  );
}

// =====================================================================
console.log("\n4. BOOTSTRAP — must reproduce the historical distribution");
// =====================================================================
{
  const era = prepareEra(data, 1900, 2025);
  // A lump sum invested for one year, no costs: the median simulated growth
  // should match the historical median annual return closely.
  const one = simulate(data, {
    initialRisky: 1, initialSafe: 0, monthlyRisky: 0, monthlySafe: 0,
    years: 1, terRisky: 0, terSafe: 0, nPaths: 200000, intraYear: false,
  });
  const hist = Array.from(era.equity).sort((a, b) => a - b);
  const histMedian = percentileSorted(hist, 50);
  const histMean = hist.reduce((a, b) => a + b, 0) / hist.length;

  check(
    "1-year median growth matches historical median return",
    Math.abs(one.final.p50 - 1 - histMedian) < 0.01,
    `sim ${((one.final.p50 - 1) * 100).toFixed(2)}% vs history ${(histMedian * 100).toFixed(2)}%`
  );
  check(
    "1-year mean growth matches historical mean return",
    Math.abs(one.final.mean - 1 - histMean) < 0.005,
    `sim ${((one.final.mean - 1) * 100).toFixed(2)}% vs history ${(histMean * 100).toFixed(2)}%`
  );
  check(
    "1-year 1st percentile matches the historical left tail",
    Math.abs(one.final.p1 - 1 - percentileSorted(hist, 1)) < 0.03,
    `sim ${((one.final.p1 - 1) * 100).toFixed(1)}% vs history ${(percentileSorted(hist, 1) * 100).toFixed(1)}%`
  );
}

// =====================================================================
console.log("\n5. DETERMINISM & CONVERGENCE");
// =====================================================================
{
  const a = simulate(data, { nPaths: 20000, seed: 42 });
  const b = simulate(data, { nPaths: 20000, seed: 42 });
  check(
    "same seed reproduces results bit for bit",
    a.final.p1 === b.final.p1 && a.final.p99 === b.final.p99,
    `p1 ${eur(a.final.p1)}`
  );

  const c = simulate(data, { nPaths: 20000, seed: 7 });
  check(
    "different seed gives a different but close p1 (Monte Carlo noise is small)",
    a.final.p1 !== c.final.p1 && rel(a.final.p1, c.final.p1) < 0.05,
    `seed42 ${eur(a.final.p1)} vs seed7 ${eur(c.final.p1)} (${(rel(a.final.p1, c.final.p1) * 100).toFixed(2)}% apart)`
  );

  // percentile bands must never cross, at any point in time
  const res = simulate(data, { nPaths: 20000, seed: 1 });
  let crossings = 0;
  const ps = [1, 5, 25, 50, 75, 95, 99];
  for (let t = 0; t < res.nPts; t++) {
    for (let k = 1; k < ps.length; k++) {
      if (res.bands[ps[k]][t] < res.bands[ps[k - 1]][t] - 1e-6) crossings++;
    }
  }
  check("percentile bands never cross", crossings === 0, `${crossings} crossings`);

  let monotonePaidIn = true;
  for (let t = 1; t < res.nPts; t++) {
    if (res.paidIn[t] < res.paidIn[t - 1]) monotonePaidIn = false;
  }
  check("money-paid-in increases monotonically", monotonePaidIn);
  check(
    "lowest point never exceeds the median final value",
    res.lowest.p50 <= res.final.p50,
    `${eur(res.lowest.p50)} <= ${eur(res.final.p50)}`
  );
  check(
    "highest point is never below the final value percentile-wise",
    res.highest.p99 >= res.final.p99,
    `${eur(res.highest.p99)} >= ${eur(res.final.p99)}`
  );
}

// =====================================================================
console.log("\n6. HISTORICAL WINDOWS — hand-checked replay");
// =====================================================================
{
  const w = historicalWindows(data, {
    initialRisky: 1, initialSafe: 0, monthlyRisky: 0, monthlySafe: 0,
    years: 10, terRisky: 0, terSafe: 0, eraStart: 1900, eraEnd: 2025,
  });
  check(
    "117 real decades in 1900-2025",
    w.length === 117,
    `${w.length} windows, first ${w[0].startYear}-${w[0].endYear}, last ${w[w.length - 1].startYear}-${w[w.length - 1].endYear}`
  );

  // recompute one window by brute force from the raw series
  const idx0 = data.years.indexOf(1929);
  let manual = 1;
  for (let k = 0; k < 10; k++) manual *= 1 + data.equity_real[idx0 + k];
  const sim = w.find((x) => x.startYear === 1929);
  check(
    "1929-1938 decade matches a direct product of the annual returns",
    rel(sim.final, manual) < 1e-9,
    `replay ${sim.final.toFixed(6)}x vs manual ${manual.toFixed(6)}x`
  );

  const finals = w.map((x) => x.final).sort((a, b) => a - b);
  const worst = w.reduce((m, x) => (x.final < m.final ? x : m));
  const best = w.reduce((m, x) => (x.final > m.final ? x : m));
  console.log(
    `       real decades for 100% equity lump sum: worst ${worst.startYear} ` +
      `${worst.final.toFixed(2)}x, best ${best.startYear} ${best.final.toFixed(2)}x, ` +
      `median ${percentileSorted(finals, 50).toFixed(2)}x`
  );
  check(
    "every real decade is a positive multiple",
    finals[0] > 0,
    `worst ${finals[0].toFixed(3)}x`
  );
}

// =====================================================================
console.log("\n7. SANITY — bootstrap vs the real decades it is built from");
// =====================================================================
{
  const opts = {
    initialRisky: 10000, initialSafe: 0, monthlyRisky: 0, monthlySafe: 0,
    years: 10, terRisky: 0, terSafe: 0, eraStart: 1900, eraEnd: 2025,
    nPaths: 100000, intraYear: false,
  };
  const mc = simulate(data, opts);
  const w = historicalWindows(data, opts);
  const finals = w.map((x) => x.final).sort((a, b) => a - b);
  const histMed = percentileSorted(finals, 50);
  check(
    "bootstrap median within 8% of the real-decade median",
    rel(mc.final.p50, histMed) < 0.08,
    `bootstrap ${eur(mc.final.p50)} vs real decades ${eur(histMed)}`
  );
  // The single worst decade out of 117 heavily overlapping windows is roughly a
  // sub-1st-percentile event, so it belongs just OUTSIDE the simulated p1 —
  // close to it, but not far beyond. Far beyond would mean the bootstrap had
  // shredded the persistence that made that decade so bad.
  check(
    "worst real decade sits just beyond the simulated 1st percentile",
    finals[0] < mc.final.p1 && finals[0] > mc.final.p1 * 0.85,
    `worst real ${eur(finals[0])} vs sim p1 ${eur(mc.final.p1)} ` +
      `(${((finals[0] / mc.final.p1 - 1) * 100).toFixed(1)}%)`
  );
  // Calibration target: the simulated spread of 10-year outcomes must match the
  // spread of real overlapping windows. Verified at ±10% (measured: +1.6%).
  const sdOf = (xs) => {
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
  };
  const histSd = sdOf(w.map((x) => Math.log(x.final)));
  const simSd =
    (Math.log(mc.bands[75][mc.nPts - 1]) - Math.log(mc.bands[25][mc.nPts - 1])) /
    1.349;
  check(
    "simulated spread of 10y outcomes matches real windows within 10%",
    Math.abs(simSd / histSd - 1) < 0.1,
    `sim sd(log) ${simSd.toFixed(4)} vs real ${histSd.toFixed(4)} ` +
      `(${((simSd / histSd - 1) * 100).toFixed(1)}%)`
  );
  console.log(
    `       bootstrap p1 ${eur(mc.final.p1)} / p50 ${eur(mc.final.p50)} / p99 ${eur(mc.final.p99)}`
  );
}

// =====================================================================
console.log("\n8. DATA INTEGRITY");
// =====================================================================
{
  const n = data.years.length;
  check("series lengths agree",
    data.equity_real.length === n && data.bond_real.length === n && data.inflation.length === n,
    `${n} years`);
  let gaps = 0;
  for (let i = 1; i < n; i++) if (data.years[i] !== data.years[i - 1] + 1) gaps++;
  check("years are consecutive with no gaps", gaps === 0);
  check("no missing or non-finite returns",
    data.equity_real.every(Number.isFinite) && data.bond_real.every(Number.isFinite));
  check("no return below -100% (impossible)",
    data.equity_real.every((r) => r > -1) && data.bond_real.every((r) => r >= -1));
  check("covers 1900 to at least 2024",
    data.years[0] === 1900 && data.years[n - 1] >= 2024,
    `${data.years[0]}-${data.years[n - 1]}`);
  // spot-check famous years against the historical record
  const at = (y) => data.equity_real[data.years.indexOf(y)];
  check("2008 was the worst equity year in the sample",
    Math.min(...data.equity_real) === at(2008),
    `2008 ${(at(2008) * 100).toFixed(1)}%`);
  const bAt = (y) => data.bond_real[data.years.indexOf(y)];
  check("1923 German hyperinflation is the worst bond year",
    Math.min(...data.bond_real) === bAt(1923),
    `1923 ${(bAt(1923) * 100).toFixed(1)}%`);
  check("2022 bond crash is present and severe",
    bAt(2022) < -0.2,
    `2022 ${(bAt(2022) * 100).toFixed(1)}% real`);
}

// =====================================================================
console.log("\n9. RNG QUALITY");
// =====================================================================
{
  const rng = makeRng(12345);
  const N = 500000;
  let sum = 0;
  const buckets = new Array(10).fill(0);
  for (let i = 0; i < N; i++) {
    const u = rng();
    sum += u;
    buckets[Math.min(9, Math.floor(u * 10))]++;
  }
  check("uniform mean is 0.5", Math.abs(sum / N - 0.5) < 0.002, `${(sum / N).toFixed(5)}`);
  const expected = N / 10;
  const chi2 = buckets.reduce((a, b) => a + ((b - expected) ** 2) / expected, 0);
  check("decile histogram passes chi-square (9 df, 5% crit = 16.9)", chi2 < 16.9,
    `chi2 ${chi2.toFixed(2)}`);
}

// =====================================================================
console.log("\n10. NOMINAL VIEW — euros of the day");
// =====================================================================
{
  const base = {
    initialRisky: 10000, initialSafe: 5000, monthlyRisky: 400, monthlySafe: 100,
    years: 10, eraStart: 1900, eraEnd: 2025, nPaths: 30000, seed: 3,
  };
  const zero = simulate(data, { ...base, inflation: 0 });
  check(
    "with 0% inflation the nominal view is identical to the real view",
    zero.nominal.final.p50 === zero.final.p50 &&
      zero.nominal.lowest.p1 === zero.lowest.p1 &&
      zero.nominal.highest.p99 === zero.highest.p99 &&
      zero.nominal.drawdown.p99 === zero.drawdown.p99 &&
      zero.nominal.totalPaidIn === zero.totalPaidIn,
    `final ${eur(zero.final.p50)}, lowest ${eur(zero.lowest.p1)}`
  );

  const r = simulate(data, { ...base, inflation: 0.02 });
  const f10 = Math.pow(1.02, 10);
  check(
    "final values scale by exactly (1+i)^years",
    rel(r.nominal.final.p50, r.final.p50 * f10) < 1e-12 &&
      rel(r.nominal.final.p1, r.final.p1 * f10) < 1e-12,
    `real ${eur(r.final.p50)} -> nominal ${eur(r.nominal.final.p50)} (x${f10.toFixed(4)})`
  );
  check(
    "cumulative inflation factor is right at both ends",
    r.nominal.factor[0] === 1 && rel(r.nominal.factor[r.nPts - 1], f10) < 1e-12
  );
  // The extrema are tracked along the path, not rescaled. Because the inflation
  // factor rises monotonically from 1, the euros-of-the-day path can never dip
  // as low, nor fall as far from its peak, as the today's-euros path.
  check(
    "lowest point in euros of the day is never below the real lowest point",
    r.nominal.lowest.p1 >= r.lowest.p1 && r.nominal.lowest.p50 >= r.lowest.p50,
    `nominal ${eur(r.nominal.lowest.p1)} vs real ${eur(r.lowest.p1)}`
  );
  check(
    "drawdowns are shallower in euros of the day (inflation cushions the fall)",
    r.nominal.drawdown.p50 <= r.drawdown.p50 &&
      r.nominal.drawdown.p99 <= r.drawdown.p99,
    `nominal ${(r.nominal.drawdown.p99 * 100).toFixed(1)}% vs real ${(r.drawdown.p99 * 100).toFixed(1)}%`
  );
  check(
    "highest point in euros of the day is never below the real highest point",
    r.nominal.highest.p99 >= r.highest.p99,
    `nominal ${eur(r.nominal.highest.p99)} vs real ${eur(r.highest.p99)}`
  );
  // Contributions are constant in today's euros, so the actual payment rises
  // with inflation and the euros-of-the-day total paid in must be larger.
  const contribs = 500 * 120;
  check(
    "money paid in, in euros of the day, exceeds the real total but stays sane",
    r.nominal.totalPaidIn > r.totalPaidIn &&
      r.nominal.totalPaidIn < 15000 + contribs * f10,
    `${eur(r.nominal.totalPaidIn)} vs ${eur(r.totalPaidIn)} in today's euros`
  );
  check(
    "money paid in, in euros of the day, increases monotonically",
    r.nominal.paidIn.every((v, i) => i === 0 || v >= r.nominal.paidIn[i - 1])
  );
  check(
    "probability of ending below money paid in is reported for both views",
    Number.isFinite(r.probBelowPaidIn) && Number.isFinite(r.nominal.probBelowPaidIn),
    `real ${(r.probBelowPaidIn * 100).toFixed(1)}%, nominal ${(r.nominal.probBelowPaidIn * 100).toFixed(1)}%`
  );
}

// =====================================================================
console.log("\n11. TAX — closed-form checks in a constant-return world");
// =====================================================================
{
  // Every year identical + no within-year wobble => the simulation is fully
  // deterministic, so every tax figure can be checked against hand algebra.
  const mkSynth = (eq, bd) => ({
    years: Array.from({ length: 30 }, (_, i) => 1900 + i),
    equity_real: Array(30).fill(eq),
    bond_real: Array(30).fill(bd),
    inflation: Array(30).fill(0),
  });

  const base = {
    initialRisky: 10000,
    initialSafe: 0,
    monthlyRisky: 0,
    monthlySafe: 0,
    years: 1,
    terRisky: 0,
    terSafe: 0,
    inflation: 0,
    eraStart: 1900,
    eraEnd: 1929,
    nPaths: 64,
    blockMean: 5,
    intraYear: false,
    seed: 7,
  };
  const synth = mkSynth(0.1, 0.03);

  // ---- gross: 10 000 at +10% for a year, nothing taken ----
  const gross = simulate(synth, { ...base, tax: null });
  check(
    "with no country selected the result is untouched",
    rel(gross.final.p50, 11000) < 1e-9,
    `${eur(gross.final.p50)} (expected €11,000)`
  );
  const noneSel = simulate(synth, { ...base, tax: { country: "none" } });
  check(
    'tax:null and country "none" agree exactly',
    noneSel.final.p50 === gross.final.p50
  );
  check("no tax means the tax block reports nothing owed", !gross.tax.enabled && gross.tax.total.p50 === 0);

  // ---- Italy, accumulating ETF, stamp duty switched off ----
  // gain 1 000, substitute tax 26% => 260 owed, 10 740 left.
  const itNoBollo = resolveTaxPlan({ country: "it", wealthRate: 0 });
  const itA = simulate(synth, { ...base, tax: itNoBollo });
  check(
    "Italy: 26% of the gain on a share ETF, to the cent",
    rel(itA.final.p50, 10740) < 1e-9,
    `${eur(itA.final.p50)} (expected €10,740)`
  );
  check(
    "Italy: the whole bill falls at the sale, nothing yearly",
    rel(itA.tax.exit.p50, 260) < 1e-9 && itA.tax.yearly.p50 === 0,
    `exit ${eur(itA.tax.exit.p50)}, yearly ${eur(itA.tax.yearly.p50)}`
  );
  check(
    "Italy: an accumulating ETF is not touched until you sell",
    itA.tax.plan.taxesIncome === false
  );

  // ---- Italy: the euro government bond sleeve gets the 12.5% rate ----
  const itBond = simulate(synth, {
    ...base,
    initialRisky: 0,
    initialSafe: 10000,
    tax: itNoBollo,
  });
  // gain 300 at 12.5% => 37.50 owed
  check(
    "Italy: government bonds are taxed at 12.5%, not 26%",
    rel(itBond.final.p50, 10262.5) < 1e-9,
    `${eur(itBond.final.p50)} (expected €10,262.50)`
  );

  // ---- Italy: stamp duty is owed on the balance whatever happens ----
  const itFull = resolveTaxPlan({ country: "it" });
  const w = 0.002;
  const g = Math.pow(1.1, 1 / 12);
  let vExp = 10000;
  for (let m = 0; m < 12; m++) vExp = vExp * g * (1 - w / 12);
  const expFull = vExp - 0.26 * (vExp - 10000);
  const itB = simulate(synth, { ...base, tax: itFull });
  check(
    "Italy: 0.20% a year stamp duty, charged in monthly slices",
    rel(itB.final.p50, expFull) < 1e-9,
    `${eur(itB.final.p50)} (expected ${eur(expFull)})`
  );
  const lossYear = simulate(mkSynth(-0.2, -0.2), { ...base, tax: itFull });
  check(
    "Italy: stamp duty is still owed in a year when everything falls",
    lossYear.tax.yearly.p50 > 0 && lossYear.tax.exit.p50 === 0,
    `yearly ${eur(lossYear.tax.yearly.p50)}, exit ${eur(lossYear.tax.exit.p50)}`
  );

  // ---- Italy: a loss on one sleeve may NOT shelter a gain on the other ----
  const mixed = { ...base, initialRisky: 10000, initialSafe: 10000 };
  const itMixed = simulate(mkSynth(0.1, -0.05), { ...mixed, tax: itNoBollo });
  check(
    "Italy: an ETF loss cannot be set against an ETF gain",
    rel(itMixed.tax.exit.p50, 260) < 1e-9,
    `${eur(itMixed.tax.exit.p50)} owed although the bond sleeve lost €500`
  );
  const offsetPlan = { ...itNoBollo, lossOffset: true };
  const offset = simulate(mkSynth(0.1, -0.05), { ...mixed, tax: offsetPlan });
  check(
    "where losses DO offset, the same case owes 26% of only €500",
    rel(offset.tax.exit.p50, 130) < 1e-9,
    `${eur(offset.tax.exit.p50)}`
  );

  // ---- tax is charged on the nominal gain, so inflation makes it bite harder
  const flat = simulate(synth, { ...base, inflation: 0, tax: itNoBollo });
  const infl = simulate(synth, { ...base, inflation: 0.05, tax: itNoBollo });
  // nominal: 11 000 x 1.05 = 11 550, base 10 000, tax 403, real = 11 147/1.05
  const expInfl = (11000 * 1.05 - 0.26 * (11000 * 1.05 - 10000)) / 1.05;
  check(
    "tax is charged on the nominal gain, never adjusted for inflation",
    rel(infl.final.p50, expInfl) < 1e-9 && infl.final.p50 < flat.final.p50,
    `${eur(infl.final.p50)} with 5% inflation vs ${eur(flat.final.p50)} with none`
  );

  // ---- UK: the yearly tax-free amount can swallow a small gain whole ----
  const gb = simulate(synth, {
    ...base,
    tax: resolveTaxPlan({ country: "gb", band: "basic", equityYield: 0, bondYield: 0 }),
  });
  check(
    "UK: a €1,000 gain sits inside the £3,000 tax-free amount, so nothing is owed",
    gb.tax.exit.p50 === 0 && rel(gb.final.p50, 11000) < 1e-9,
    `${eur(gb.final.p50)}`
  );
  const gbBig = simulate(synth, {
    ...base,
    initialRisky: 200000,
    tax: resolveTaxPlan({ country: "gb", band: "higher", equityYield: 0, bondYield: 0 }),
  });
  // gain 20 000, less £3 000 x 1.15 = €3 450, at 24%
  const expGb = 220000 - 0.24 * (20000 - 3000 * 1.15);
  check(
    "UK higher rate: 24% on the gain above the tax-free amount",
    rel(gbBig.final.p50, expGb) < 1e-9,
    `${eur(gbBig.final.p50)} (expected ${eur(expGb)})`
  );
  const isa = simulate(synth, {
    ...base,
    initialRisky: 200000,
    tax: resolveTaxPlan({ country: "gb", wrapper: "isa" }),
  });
  check(
    "UK: inside an ISA nothing at all is taken",
    !isa.tax.enabled && rel(isa.final.p50, 220000) < 1e-9,
    `${eur(isa.final.p50)}`
  );

  // ---- UK: fund income is taxed every year even if the fund accumulates ----
  const gbInc = simulate(synth, {
    ...base,
    initialRisky: 500000,
    years: 3,
    tax: resolveTaxPlan({ country: "gb", band: "higher", equityYield: 0.02, bondYield: 0 }),
  });
  check(
    "UK: an accumulating fund's income is still taxed each year",
    gbInc.tax.yearly.p50 > 0,
    `${eur(gbInc.tax.yearly.p50)} paid along the way`
  );
  // income already taxed lifts the cost base, so the total taken must never
  // exceed taxing the whole gross gain once at the higher of the two rates.
  const grossRun = simulate(synth, { ...base, initialRisky: 500000, years: 3, tax: null });
  const grossGain = grossRun.final.p50 - 500000;
  check(
    "UK: income already taxed is not taxed a second time as a gain",
    gbInc.tax.total.p50 <= 0.4 * grossGain + 1e-6,
    `${eur(gbInc.tax.total.p50)} taken out of a ${eur(grossGain)} gain`
  );

  // ---- Italy: accumulating beats distributing, because tax is deferred ----
  const itAcc = simulate(synth, {
    ...base,
    initialRisky: 100000,
    years: 10,
    tax: resolveTaxPlan({ country: "it", fundType: "acc", equityYield: 0.02 }),
  });
  const itDist = simulate(synth, {
    ...base,
    initialRisky: 100000,
    years: 10,
    tax: resolveTaxPlan({ country: "it", fundType: "dist", equityYield: 0.02 }),
  });
  check(
    "Italy: an accumulating ETF beats a distributing one over ten years",
    itAcc.final.p50 > itDist.final.p50 && itDist.tax.yearly.p50 > 0,
    `${eur(itAcc.final.p50)} vs ${eur(itDist.final.p50)}`
  );

  // ---- structural invariants that must hold for any regime ----
  const real = {
    initialRisky: 10000,
    initialSafe: 5000,
    monthlyRisky: 400,
    monthlySafe: 100,
    years: 10,
    nPaths: 4000,
    seed: 99,
    intraYear: true,
  };
  const rGross = simulate(data, { ...real, tax: null });
  const rIt = simulate(data, { ...real, tax: resolveTaxPlan({ country: "it" }) });
  check(
    "after tax is never above gross, at every percentile and every month",
    [1, 5, 25, 50, 75, 95, 99].every((p) =>
      rIt.bands[p].every((v, t) => v <= rGross.bands[p][t] + 1e-6)
    )
  );
  check(
    "the cost of tax exceeds the tax paid, because charges stop compounding",
    rGross.final.p50 - rIt.final.p50 > rIt.tax.total.p50,
    `€${Math.round(rGross.final.p50 - rIt.final.p50)} lost vs €${Math.round(rIt.tax.total.p50)} handed over`
  );
  check(
    "tax makes ending up behind what you paid in more likely",
    rIt.probBelowPaidIn > rGross.probBelowPaidIn,
    `${(rIt.probBelowPaidIn * 100).toFixed(1)}% with tax vs ${(rGross.probBelowPaidIn * 100).toFixed(1)}% without`
  );
  check(
    "a higher rate always leaves less money",
    simulate(data, { ...real, tax: resolveTaxPlan({ country: "gb", band: "higher" }) }).final.p50 <
      simulate(data, { ...real, tax: resolveTaxPlan({ country: "gb", band: "basic" }) }).final.p50
  );
  check(
    "the money you paid in is unaffected by tax",
    rIt.totalPaidIn === rGross.totalPaidIn,
    eur(rIt.totalPaidIn)
  );
  check(
    "the share of the gain taken is a sane fraction",
    rIt.tax.shareOfGainAtMedian > 0.1 && rIt.tax.shareOfGainAtMedian < 0.6,
    `${(rIt.tax.shareOfGainAtMedian * 100).toFixed(1)}% of the profit`
  );

  // ---- the tax bill in euros of the day ----
  const noInf = simulate(data, { ...real, inflation: 0, tax: resolveTaxPlan({ country: "it" }) });
  check(
    "with no inflation the tax bill is the same in both units",
    rel(noInf.tax.nominal.total.p50, noInf.tax.total.p50) < 1e-12 &&
      rel(noInf.tax.nominal.yearly.p50, noInf.tax.yearly.p50) < 1e-12
  );
  const withInf = simulate(data, { ...real, inflation: 0.03, tax: resolveTaxPlan({ country: "it" }) });
  const endFactor = Math.pow(1.03, real.years);
  check(
    "the exit bill in euros of the day is the real one grown by inflation",
    rel(withInf.tax.nominal.exit.p50, withInf.tax.exit.p50 * endFactor) < 1e-9,
    `${eur(withInf.tax.nominal.exit.p50)} vs ${eur(withInf.tax.exit.p50)} today`
  );
  check(
    "the yearly charges in euros of the day are between the real total and the fully grown one",
    withInf.tax.nominal.yearly.p50 > withInf.tax.yearly.p50 &&
      withInf.tax.nominal.yearly.p50 < withInf.tax.yearly.p50 * endFactor,
    `${eur(withInf.tax.nominal.yearly.p50)} vs ${eur(withInf.tax.yearly.p50)} today`
  );

  // ---- the two independent implementations must agree ----
  // With constant returns and no within-year wobble the Monte Carlo and the
  // historical replay are both deterministic and must land on the same number,
  // which is what proves their duplicated tax code agrees.
  for (const sel of [null, { country: "it" }, { country: "gb", band: "higher" }, { country: "it", fundType: "dist" }]) {
    const plan = sel ? resolveTaxPlan(sel) : null;
    const opts = {
      ...base,
      initialSafe: 5000,
      monthlyRisky: 400,
      monthlySafe: 100,
      years: 10,
      inflation: 0.02,
      tax: plan,
    };
    const mc = simulate(synth, opts);
    const hw = historicalWindows(synth, opts);
    check(
      // The plan is a bag of numbers with no words in it — the words live in the
      // dictionary now — so name the case from the selection that produced it.
      `Monte Carlo and historical replay agree — ${
        sel ? Object.values(sel).join(" ") : "no tax"
      }`,
      rel(mc.final.p50, hw[0].final) < 1e-9,
      `${eur(mc.final.p50)} vs ${eur(hw[0].final)}`
    );
  }

  // ---- the pure exit-tax function, on its own ----
  const p = resolveTaxPlan({ country: "it", wealthRate: 0 });
  check(
    "exit tax on a pure loss is zero, not negative",
    exitTaxNominal(8000, 10000, 4000, 5000, p) === 0
  );
  check(
    "exit tax splits the two rates correctly",
    Math.abs(exitTaxNominal(11000, 10000, 5300, 5000, p) - (0.26 * 1000 + 0.125 * 300)) < 1e-9
  );
  const pAllow = resolveTaxPlan({ country: "gb", band: "higher", gbpEur: 1 });
  check(
    "the tax-free amount is used against the higher-taxed gain first",
    Math.abs(exitTaxNominal(14000, 10000, 5000, 5000, pAllow) - 0.24 * (4000 - 3000)) < 1e-9
  );
  check(
    "income inside the tax-free amount is not taxed",
    incomeTaxNominal(400, 0.3375, 500) === 0
  );
  check(
    "income above the tax-free amount is taxed only on the excess",
    Math.abs(incomeTaxNominal(1500, 0.3375, 500) - 0.3375 * 1000) < 1e-9
  );
  check(
    "an ISA plan resolves to no tax at all",
    resolveTaxPlan({ country: "gb", wrapper: "isa" }).enabled === false
  );
  check(
    "UK allowances are converted from pounds into euros",
    Math.abs(resolveTaxPlan({ country: "gb", gbpEur: 1.2 }).exitAllowance - 3600) < 1e-9
  );
}

// =====================================================================
console.log("\n12. CONSULTANT'S FEE — a yearly slice of the whole balance");
// =====================================================================
{
  // Constant returns, no bridge noise: the fee is then pure algebra, so every
  // figure the page shows can be checked against a hand-written formula.
  const R = 0.07;
  const synth = {
    years: Array.from({ length: 30 }, (_, i) => 1900 + i),
    equity_real: Array(30).fill(R),
    bond_real: Array(30).fill(R),
    inflation: Array(30).fill(0),
  };
  const base = {
    initialRisky: 10000, initialSafe: 0, monthlyRisky: 0, monthlySafe: 0,
    years: 10, terRisky: 0, terSafe: 0, eraStart: 1900, eraEnd: 1929,
    nPaths: 100, intraYear: false, inflation: 0,
    tax: resolveTaxPlan({ country: "none" }),
  };
  const fee = 0.01;
  const free = simulate(synth, base);
  const paid = simulate(synth, { ...base, advisorFee: fee });

  check(
    "no fee set means the result is bit-for-bit the old one",
    paid.advisor.enabled === false || free.final.p50 === simulate(synth, { ...base, advisorFee: 0 }).final.p50,
    `${eur(free.final.p50)}`
  );
  check(
    "a zero fee reports nothing paid and no drag",
    free.advisor.enabled === false && free.advisor.mean === 0 &&
      free.advisor.dragOnInitial === 0 && free.advisor.shareOfGainAtMean === 0
  );

  // One charge a year on the whole balance is the same as an extra annual cost
  // of the same size, so the ending value must be the TER identity all over
  // again: (1 - fee)^years of what it would otherwise have been.
  const expectedRatio = Math.pow(1 - fee, base.years);
  check(
    "1% a year for 10 years leaves exactly (1−fee)^years of the pot",
    rel(paid.final.p50 / free.final.p50, expectedRatio) < 1e-9,
    `ratio ${(paid.final.p50 / free.final.p50).toFixed(8)} vs ${expectedRatio.toFixed(8)}`
  );
  check(
    "the drag reported on money invested today is that identity, stated as a loss",
    rel(paid.advisor.dragOnInitial, 1 - expectedRatio) < 1e-12 &&
      rel(1 - paid.final.p50 / free.final.p50, paid.advisor.dragOnInitial) < 1e-9,
    `${(paid.advisor.dragOnInitial * 100).toFixed(4)}% off`
  );

  // Every yearly bill, added up by hand: at the end of year k the pot is
  // 10000·(1.07·(1−fee))^(k−1)·1.07, and the fee takes `fee` of it.
  let handTotal = 0;
  let pot = base.initialRisky;
  for (let y = 0; y < base.years; y++) {
    pot *= 1 + R;
    handTotal += pot * fee;
    pot -= pot * fee;
  }
  check(
    "the total handed over matches the year-by-year sum done by hand",
    rel(paid.advisor.mean, handTotal) < 1e-9,
    `sim ${eur(paid.advisor.mean)} vs algebra ${eur(handTotal)}`
  );
  check(
    "the pot left over matches the same hand calculation",
    rel(paid.final.p50, pot) < 1e-9,
    `${eur(paid.final.p50)} vs ${eur(pot)}`
  );
  check(
    "the fee quoted on today's pot is the rate times today's pot",
    paid.advisor.feeOnToday === base.initialRisky * fee &&
      paid.advisor.fee === fee,
    `${eur(paid.advisor.feeOnToday)}`
  );
  // Measured the same way as the tax ratio: the bill over the profit that was
  // actually made plus the bill itself. That is not the counterfactual profit —
  // it is smaller, because the money taken would have compounded too — so the
  // ratio understates the true cost, and the box says so in words.
  // Tolerance is 1e-6 rather than 1e-9 here alone: the ratio is anchored on the
  // MEAN ending value, which is averaged out of the single-precision fan the
  // chart is drawn from, so it carries about seven significant figures.
  check(
    "the share of the gain is the bill over the profit made before it was taken",
    rel(paid.advisor.gainBeforeAtMean, paid.final.p50 + handTotal - base.initialRisky) < 1e-6 &&
      rel(paid.advisor.shareOfGainAtMean,
        handTotal / (paid.final.p50 + handTotal - base.initialRisky)) < 1e-6,
    `${(paid.advisor.shareOfGainAtMean * 100).toFixed(2)}% of ${eur(paid.advisor.gainBeforeAtMean)}`
  );
  check(
    "that share is below the counterfactual one, as the box warns",
    paid.advisor.shareOfGainAtMean <
      (free.final.p50 - paid.final.p50) / (free.final.p50 - base.initialRisky),
    `${(paid.advisor.shareOfGainAtMean * 100).toFixed(2)}% vs ` +
      `${((free.final.p50 - paid.final.p50) / (free.final.p50 - base.initialRisky) * 100).toFixed(2)}% truly lost`
  );
  // The whole point of charging inside the loop rather than at the end: the pot
  // falls by more than the bills, because the money taken stops compounding.
  check(
    "the pot falls by more than the fees themselves (lost compounding)",
    free.final.p50 - paid.final.p50 > paid.advisor.mean * 1.0001,
    `${eur(free.final.p50 - paid.final.p50)} lost for ${eur(paid.advisor.mean)} paid`
  );

  // The split must survive the charge, otherwise the fee would quietly be a
  // rebalancing as well as a cost.
  const mixed = { ...base, initialRisky: 10000, initialSafe: 10000 };
  const mixedSynth = { ...synth, bond_real: Array(30).fill(0.02) };
  const mFree = simulate(mixedSynth, mixed);
  const mPaid = simulate(mixedSynth, { ...mixed, advisorFee: fee });
  check(
    "both sleeves are charged at the same rate, so the split is untouched",
    rel(mPaid.final.p50 / mFree.final.p50, expectedRatio) < 1e-9,
    `ratio ${(mPaid.final.p50 / mFree.final.p50).toFixed(8)}`
  );

  // Real data, real tax: the two engines must agree, the ordering must hold, and
  // the mean must sit above the median because the fee is largest where the
  // journey went well.
  const live = {
    initialRisky: 10000, initialSafe: 5000, monthlyRisky: 400, monthlySafe: 100,
    years: 15, terRisky: 0.002, terSafe: 0.001, eraStart: 1900, eraEnd: 2025,
    nPaths: 20000, seed: 7, inflation: 0.02,
    tax: resolveTaxPlan({ country: "it" }),
  };
  const lFree = simulate(data, live);
  const lPaid = simulate(data, { ...live, advisorFee: 0.01 });
  check(
    "on real data a fee always leaves less money, everywhere in the range",
    lPaid.final.p1 < lFree.final.p1 && lPaid.final.p50 < lFree.final.p50 &&
      lPaid.final.p99 < lFree.final.p99 && lPaid.highest.p50 < lFree.highest.p50 &&
      lPaid.lowest.p50 <= lFree.lowest.p50,
    `median ${eur(lPaid.final.p50)} vs ${eur(lFree.final.p50)}`
  );
  // The first bill only lands at the end of the first year, and on a plan this
  // shape the worst moment is in the first few months — so the lowest point the
  // page reports is untouched. Worth pinning down: it is the one figure a fee
  // legitimately does not move.
  check(
    "the lowest point is identical, because it happens before the first bill",
    lPaid.lowest.p1 === lFree.lowest.p1 && lPaid.lowest.p50 === lFree.lowest.p50,
    `${eur(lPaid.lowest.p1)}`
  );
  check(
    "the average bill is above the middle one — the fee is biggest when it went well",
    lPaid.advisor.mean > lPaid.advisor.p50 &&
      lPaid.advisor.p5 < lPaid.advisor.p50 && lPaid.advisor.p50 < lPaid.advisor.p95,
    `mean ${eur(lPaid.advisor.mean)} vs median ${eur(lPaid.advisor.p50)}`
  );
  check(
    "a lower balance also means a smaller tax bill — the fee is not taxed as a sale",
    lPaid.tax.total.p50 < lFree.tax.total.p50,
    `${eur(lPaid.tax.total.p50)} vs ${eur(lFree.tax.total.p50)}`
  );
  // Bills are paid at ten or fifteen different dates, so the euros-of-the-day
  // total must sit strictly between the real total and the fully-grown one.
  const fEnd = Math.pow(1 + live.inflation, live.years);
  check(
    "in euros of the day the fee total is between the real one and the fully grown one",
    lPaid.nominal.advisor.mean > lPaid.advisor.mean &&
      lPaid.nominal.advisor.mean < lPaid.advisor.mean * fEnd,
    `${eur(lPaid.nominal.advisor.mean)} vs ${eur(lPaid.advisor.mean)} today`
  );
  check(
    "the rate and the drag are ratios, so they are the same in both units",
    lPaid.advisor.dragOnInitial === 1 - Math.pow(0.99, live.years),
    `${(lPaid.advisor.dragOnInitial * 100).toFixed(2)}%`
  );

  // The historical overlay charges the fee too. If it did not, the line drawn on
  // the chart would be a different plan from the bands behind it.
  const hFree = historicalWindows(data, live);
  const hPaid = historicalWindows(data, { ...live, advisorFee: 0.01 });
  check(
    "the historical replay charges the same fee, window by window",
    hPaid.length === hFree.length &&
      hPaid.every((w, i) => w.final < hFree[i].final && w.advisorPaid > 0) &&
      hFree.every((w) => w.advisorPaid === 0),
    `${hPaid.length} windows, first pays ${eur(hPaid[0].advisorPaid)}`
  );
  // Same constant-return world, both engines: the closed form pins them together.
  const wFree = historicalWindows(synth, base)[0];
  const wPaid = historicalWindows(synth, { ...base, advisorFee: fee })[0];
  check(
    "both engines agree on the fee to the last cent",
    rel(wPaid.advisorPaid, handTotal) < 1e-9 &&
      rel(wPaid.final, paid.final.p50) < 1e-9 &&
      rel(wFree.final, free.final.p50) < 1e-9,
    `replay ${eur(wPaid.advisorPaid)} vs simulation ${eur(paid.advisor.mean)}`
  );
}

// =====================================================================
console.log("\n13. TRANSLATIONS — the page must say the same thing in Italian");
// =====================================================================
{
  const html = readFileSync(join(HERE, "../index.html"), "utf8");

  // ---- the English of every marked block, taken out of the document itself.
  // A regex cannot parse HTML in general, but it can find one element and count
  // its own tag name to the matching close, which is all that is needed here.
  const englishBlocks = new Map(); // key -> inner HTML
  const marker = /<([a-zA-Z][\w-]*)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>/g;
  for (let m; (m = marker.exec(html)); ) {
    const [openTag, tag, key] = m;
    if (openTag.endsWith("/>")) {
      englishBlocks.set(key, "");
      continue;
    }
    const open = new RegExp(`<${tag}\\b`, "g");
    const close = new RegExp(`</${tag}\\s*>`, "g");
    let depth = 1;
    let cursor = m.index + openTag.length;
    const start = cursor;
    while (depth > 0) {
      open.lastIndex = cursor;
      close.lastIndex = cursor;
      const o = open.exec(html);
      const c = close.exec(html);
      if (!c) break;
      if (o && o.index < c.index) {
        depth++;
        cursor = o.index + o[0].length;
      } else {
        depth--;
        cursor = c.index + c[0].length;
        if (depth === 0) englishBlocks.set(key, html.slice(start, c.index));
      }
    }
  }

  const keys = Object.keys(STRINGS);

  const noItalian = keys.filter((k) => typeof STRINGS[k].it !== "string" || !STRINGS[k].it.trim());
  check(
    "every string in the dictionary has an Italian version",
    noItalian.length === 0,
    noItalian.length ? noItalian.slice(0, 5).join(", ") : `${keys.length} entries`
  );

  const untranslated = [...englishBlocks.keys()].filter((k) => !STRINGS[k]);
  check(
    "every data-i18n block in the page has a dictionary entry",
    untranslated.length === 0,
    untranslated.length
      ? untranslated.slice(0, 5).join(", ")
      : `${englishBlocks.size} blocks on the page`
  );

  // js.* strings are built in JavaScript and have no English in the HTML to fall
  // back on, so they must carry their own.
  const jsKeys = keys.filter((k) => k.startsWith("js."));
  const noEnglish = jsKeys.filter((k) => typeof STRINGS[k].en !== "string" || !STRINGS[k].en.trim());
  check(
    "every JavaScript-built string carries its own English",
    noEnglish.length === 0,
    noEnglish.length ? noEnglish.slice(0, 5).join(", ") : `${jsKeys.length} entries`
  );

  const holes = (s) => new Set((s.match(/\{(\w+)\}/g) || []));
  const sameHoles = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
  const badHoles = jsKeys.filter((k) => !sameHoles(holes(STRINGS[k].en), holes(STRINGS[k].it)));
  check(
    "the two languages fill the same placeholders",
    badHoles.length === 0,
    badHoles.length ? badHoles.slice(0, 5).join(", ") : `${jsKeys.length} entries checked`
  );

  // ---- every {placeholder} must actually be filled by the code that asks for
  // the string. t() leaves an unknown name in place rather than throwing, so a
  // renamed argument shows up as a literal "{rate}" on the page — invisible to
  // every other check here, and to any test that does not read the sentence.
  {
    // Split an object literal on its top-level commas: quotes and nested
    // brackets must not be treated as separators.
    const topLevel = (s) => {
      const out = [];
      let depth = 0;
      let cur = "";
      let quote = null;
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (quote) {
          cur += c;
          if (c === quote && s[i - 1] !== "\\") quote = null;
          continue;
        }
        if (c === '"' || c === "'" || c === "`") quote = c;
        else if ("{[(".includes(c)) depth++;
        else if ("}])".includes(c)) depth--;
        else if (c === "," && depth === 0) {
          out.push(cur);
          cur = "";
          continue;
        }
        cur += c;
      }
      out.push(cur);
      return out;
    };

    const problems = [];
    let calls = 0;
    for (const file of ["app.js", "chart.js", "tax.js", "engine.js", "i18n.js"]) {
      const src = readFileSync(join(HERE, "../js", file), "utf8");
      const call = /\bt\(\s*"([^"]+)"\s*,\s*\{/g;
      for (let m; (m = call.exec(src)); ) {
        const key = m[1];
        let depth = 0;
        let end = -1;
        for (let i = call.lastIndex - 1; i < src.length; i++) {
          if (src[i] === "{") depth++;
          else if (src[i] === "}" && --depth === 0) {
            end = i;
            break;
          }
        }
        const given = new Set();
        let spread = false;
        for (const part of topLevel(src.slice(call.lastIndex, end))) {
          const named = part.match(/^\s*(?:"([^"]+)"|([A-Za-z_$][\w$]*))\s*:/);
          const shorthand = part.match(/^\s*([A-Za-z_$][\w$]*)\s*$/);
          if (named) given.add(named[1] || named[2]);
          else if (shorthand) given.add(shorthand[1]);
          else if (/^\s*\.\.\./.test(part)) spread = true;
        }
        const english = (STRINGS[key] && STRINGS[key].en) || englishBlocks.get(key);
        if (english === undefined) {
          problems.push(`${file}: no English for ${key}`);
          continue;
        }
        calls++;
        if (spread) continue; // the names cannot be known without running it
        const want = new Set([...english.matchAll(/\{(\w+)\}/g)].map((h) => h[1]));
        for (const name of want) {
          if (!given.has(name)) problems.push(`${file} ${key}: {${name}} never filled`);
        }
        for (const name of given) {
          if (!want.has(name)) problems.push(`${file} ${key}: ${name} unused`);
        }
      }
    }
    check(
      "every placeholder is filled by the code that asks for the string",
      problems.length === 0,
      problems.length ? problems.slice(0, 5).join("; ") : `${calls} parameterised calls`
    );
  }

  // app.js fills numbers into <span id> holes inside translated prose, so a
  // missing id in the Italian would silently blank a figure on the page.
  const ids = (s) => new Set((s.match(/\bid="([^"]+)"/g) || []));
  const lostIds = [];
  for (const [key, english] of englishBlocks) {
    const italian = STRINGS[key] && STRINGS[key].it;
    if (!italian) continue;
    const want = ids(english);
    const got = ids(italian);
    for (const id of want) if (!got.has(id)) lostIds.push(`${key}: ${id}`);
  }
  check(
    "every id the English fills survives into the Italian",
    lostIds.length === 0,
    lostIds.length ? lostIds.slice(0, 5).join(", ") : "all ids match"
  );

  // ---- formatting, and the words that come out of tax.js. Both need the module
  // to actually be in Italian, and setLang repaints the page, so stand up the
  // smallest possible document for it.
  const quiet = console.warn;
  globalThis.document = {
    querySelectorAll: () => [],
    querySelector: () => null,
    documentElement: {},
    title: "",
  };
  console.warn = () => {};
  try {
    setLang("it", { remember: false });
    const itNum = num(1234.5, 1);
    setLang("en", { remember: false });
    const enNum = num(1234.5, 1);
    check(
      "Italian writes the decimal comma, and both languages group with a thin space",
      /^1[  ]234,5$/.test(itNum) && /^1[  ]234\.5$/.test(enNum),
      `${itNum} / ${enNum}`
    );

    const sels = [
      { country: "it" },
      { country: "it", fundType: "dist" },
      { country: "gb", band: "higher" },
      { country: "gb", wrapper: "isa" },
      { country: "none" },
    ];
    const missing = [];
    for (const lang of ["en", "it"]) {
      setLang(lang, { remember: false });
      for (const sel of sels) {
        const plan = resolveTaxPlan(sel);
        const words = [
          planLabel(plan),
          planShort(plan),
          planCountry(plan),
          describeTaxPlan(plan),
        ];
        for (const w of words) {
          // t() returns the key itself when it cannot find the string
          if (!w || w.startsWith("js.")) missing.push(`${lang} ${plan.id}: ${w}`);
        }
      }
    }
    check(
      "every tax plan can be named and described in both languages",
      missing.length === 0,
      missing.length ? missing.slice(0, 5).join(", ") : `${sels.length * 2} plans named`
    );
  } finally {
    console.warn = quiet;
    delete globalThis.document;
  }
}

// =====================================================================
console.log(
  `\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}${pass} passed, ${fail} failed\x1b[0m\n`
);
process.exit(fail === 0 ? 0 : 1);
