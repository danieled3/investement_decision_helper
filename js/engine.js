/**
 * Simulation engine for the Investment Decision Helper.
 *
 * Pure ES module with no DOM dependency, so the same code runs in the browser,
 * in a Web Worker, and under Node for the test suite.
 *
 * Everything is computed in REAL (inflation-adjusted) euros, because the
 * underlying historical returns are real returns. The nominal view is produced
 * afterwards by inflating with an explicit assumed inflation rate.
 *
 * METHOD
 * ------
 * 1. Stationary block bootstrap (Politis & Romano 1994) over historical years.
 *    Blocks of random geometric length (mean `blockMean` years) are drawn from
 *    the chosen historical era and stitched together to form a synthetic decade.
 *    Equity and bond returns are always drawn from the SAME year, so their
 *    real-world correlation and every historical crisis pattern survive intact.
 * 2. Each annual return is converted to twelve monthly steps. With
 *    `intraYear` on, a Brownian bridge adds realistic within-year swings that
 *    still sum exactly to the year's actual return — this is what makes the
 *    "worst dip" figure honest, since a year can end flat after falling 30%.
 * 3. Contributions are added at each month end. Fund costs (TER) are charged
 *    annually against each sleeve.
 * 4. Tax, if a country is selected. See js/tax.js for the rules; the order in
 *    which the three kinds of tax bite is spelled out at the month loop below.
 *
 * All randomness comes from a seeded PRNG, so identical inputs always produce
 * identical output.
 */

import { resolveTaxPlan, exitTaxNominal, incomeTaxNominal } from "./tax.js";

// ---------------------------------------------------------------- randomness

/** mulberry32 — small, fast, well-distributed seeded PRNG. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box-Muller, with the spare value cached. */
function makeNormal(rng) {
  let spare = null;
  return function normal() {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u = 0;
    let v = 0;
    let s = 0;
    do {
      u = rng() * 2 - 1;
      v = rng() * 2 - 1;
      s = u * u + v * v;
    } while (s === 0 || s >= 1);
    const f = Math.sqrt((-2 * Math.log(s)) / s);
    spare = v * f;
    return u * f;
  };
}

// ------------------------------------------------------------------ helpers

/** Percentile of an ALREADY SORTED array, linear interpolation. */
export function percentileSorted(sorted, p) {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const idx = (p / 100) * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

/** Net-of-cost return: charge the annual fund fee on the sleeve. */
function netOfCosts(r, ter) {
  return (1 + r) * (1 - ter) - 1;
}

/** Sample standard deviation of an array of numbers. */
function stdev(xs) {
  const n = xs.length;
  if (n < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / n;
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / (n - 1));
}

/**
 * Slice the dataset down to the requested era and precompute what the
 * simulation needs. Returns log-return volatilities used by the Brownian
 * bridge and the correlation between the two sleeves.
 */
export function prepareEra(data, eraStart, eraEnd) {
  const eq = [];
  const bd = [];
  const years = [];
  for (let i = 0; i < data.years.length; i++) {
    const y = data.years[i];
    if (y < eraStart || y > eraEnd) continue;
    years.push(y);
    eq.push(data.equity_real[i]);
    bd.push(data.bond_real[i]);
  }
  const eqLog = eq.map((r) => Math.log1p(r));
  const bdLog = bd.map((r) => Math.log1p(r));
  const sdEq = stdev(eqLog);
  const sdBd = stdev(bdLog);

  // correlation of annual log returns, used for the intra-year bridge
  const n = eqLog.length;
  const mE = eqLog.reduce((a, b) => a + b, 0) / n;
  const mB = bdLog.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  for (let i = 0; i < n; i++) cov += (eqLog[i] - mE) * (bdLog[i] - mB);
  cov /= n - 1;
  const rho = sdEq > 0 && sdBd > 0 ? cov / (sdEq * sdBd) : 0;

  return {
    years,
    equity: Float64Array.from(eq),
    bonds: Float64Array.from(bd),
    n,
    // monthly log-return vol implied by the annual vol
    sigmaMonthlyEq: sdEq / Math.sqrt(12),
    sigmaMonthlyBd: sdBd / Math.sqrt(12),
    rho: Math.max(-0.99, Math.min(0.99, rho)),
    annualisedEq: Math.exp(mE) - 1,
    annualisedBd: Math.exp(mB) - 1,
    volEq: stdev(eq),
    volBd: stdev(bd),
  };
}

// --------------------------------------------------------------- simulation

export const DEFAULTS = {
  initialRisky: 10000,
  initialSafe: 5000,
  monthlyRisky: 400,
  monthlySafe: 100,
  years: 10,
  terRisky: 0.002, // 0.20% — typical world-equity ETF
  terSafe: 0.001, // 0.10% — typical euro government bond ETF
  eraStart: 1900,
  eraEnd: 2025,
  inflation: 0.02, // ECB target, used only for the nominal view
  nPaths: 100000,
  blockMean: 5,
  intraYear: true,
  seed: 20260816,
  tax: null, // null / {country:"none"} = gross; see js/tax.js
};

/**
 * Accept either an already-resolved plan or a raw selection, so callers and
 * tests can pass whichever is convenient.
 */
function planOf(tax) {
  if (tax && typeof tax.enabled === "boolean") return tax;
  return resolveTaxPlan(tax || { country: "none" });
}

/**
 * Run the Monte Carlo.
 *
 * @param {object} data   parsed data/returns.json
 * @param {object} optsIn user inputs (see DEFAULTS)
 * @param {function} [onProgress] called with 0..1
 */
export function simulate(data, optsIn = {}, onProgress) {
  const o = { ...DEFAULTS, ...optsIn };
  const era = prepareEra(data, o.eraStart, o.eraEnd);
  if (era.n < o.years) {
    throw new Error(
      `Era ${o.eraStart}-${o.eraEnd} has only ${era.n} years of data, ` +
        `need at least ${o.years}.`
    );
  }

  const plan = planOf(o.tax);
  const nMonths = Math.round(o.years * 12);
  const nPts = nMonths + 1; // include month 0
  const nPaths = o.nPaths;

  const rng = makeRng(o.seed);
  const normal = makeNormal(rng);
  const pNewBlock = 1 / Math.max(1, o.blockMean);

  // fan[t * nPaths + i] = total value of path i at month t
  const fan = new Float32Array(nPts * nPaths);
  const finalV = new Float64Array(nPaths);
  const minV = new Float64Array(nPaths); // lowest balance ever reached
  const maxV = new Float64Array(nPaths); // highest balance ever reached
  const maxDD = new Float64Array(nPaths); // worst peak-to-trough drop, fraction
  const worstGap = new Float64Array(nPaths); // most negative (value - paid in)

  // The same four statistics measured in euros-of-the-day rather than in
  // today's euros. Percentile BANDS convert exactly by scaling (a positive,
  // deterministic factor preserves order), but the lowest point, the highest
  // point, the drawdown and the gap are extrema along the path — and inflation
  // moves *when* the extreme happens. So they are tracked separately instead of
  // being approximated after the fact.
  const minN = new Float64Array(nPaths);
  const maxN = new Float64Array(nPaths);
  const maxDDN = new Float64Array(nPaths);
  const worstGapN = new Float64Array(nPaths);

  // tax actually handed over, per path, split by when it was paid
  const taxYearly = new Float64Array(nPaths); // yearly charges, today's euros
  const taxExit = new Float64Array(nPaths); // the bill on the final sale
  // ...and the same two amounts in euros of the day. A yearly charge is paid in
  // instalments spread over the whole period, so no single inflation factor can
  // convert it afterwards: it has to be added up as it is charged.
  const taxYearlyN = new Float64Array(nPaths);
  const taxExitN = new Float64Array(nPaths);

  const start = o.initialRisky + o.initialSafe;
  const monthlyTotal = o.monthlyRisky + o.monthlySafe;

  // cumulative inflation factor: today's euros -> euros of month t
  const infFactor = new Float64Array(nPts);
  for (let t = 0; t < nPts; t++) infFactor[t] = Math.pow(1 + o.inflation, t / 12);

  // "money paid in" by month — deterministic, same for every path.
  // In today's-euro terms the monthly amount is constant, which means the user
  // raises the actual payment with inflation; the euros-of-the-day line
  // therefore grows by the same factor.
  const paidIn = new Float64Array(nPts);
  const paidInNom = new Float64Array(nPts);
  paidIn[0] = start;
  paidInNom[0] = start;
  for (let t = 1; t < nPts; t++) {
    paidIn[t] = paidIn[t - 1] + monthlyTotal;
    paidInNom[t] = paidInNom[t - 1] + monthlyTotal * infFactor[t];
  }

  const bridgeEq = new Float64Array(12);
  const bridgeBd = new Float64Array(12);
  const progressEvery = Math.max(1, Math.floor(nPaths / 50));

  // Tax constants hoisted out of the hot loop.
  const taxOn = plan.enabled;
  const wMonthly = taxOn ? plan.wealthRate / 12 : 0;
  const yEqM = taxOn ? plan.equityYield / 12 : 0;
  const yBdM = taxOn ? plan.bondYield / 12 : 0;
  const upliftGross = plan.basisUplift === "gross";
  const upliftNet = plan.basisUplift === "net";

  for (let i = 0; i < nPaths; i++) {
    let risky = o.initialRisky;
    let safe = o.initialSafe;
    let value = risky + safe;

    // Cost base for tax, in euros of the day (tax never adjusts for inflation).
    let bR = o.initialRisky;
    let bS = o.initialSafe;
    // Fund income accrued so far in the current tax year, euros of the day.
    let accR = 0;
    let accS = 0;
    let paidYearly = 0; // yearly charges handed over, in today's euros
    let lastExit = 0; // the exit bill if you sold at the last month, today's euros
    let paidYearlyNom = 0; // the same charges, each counted in the euros of its day
    let lastExitNom = 0; // the exit bill in euros of the final month

    let lo = value;
    let hi = value;
    let peak = value;
    let dd = 0;
    let gap = 0; // value - paidIn, tracked at its most negative

    let loN = value;
    let hiN = value;
    let peakN = value;
    let ddN = 0;
    let gapN = 0;

    fan[0 * nPaths + i] = value;

    // pick the first year of the bootstrap
    let idx = Math.floor(rng() * era.n);

    for (let y = 0; y < o.years; y++) {
      if (y > 0) {
        // stationary bootstrap: new random block, or continue the current one
        if (rng() < pNewBlock) idx = Math.floor(rng() * era.n);
        else idx = (idx + 1) % era.n;
      }

      const rEq = netOfCosts(era.equity[idx], o.terRisky);
      const rBd = netOfCosts(era.bonds[idx], o.terSafe);
      const logEq = Math.log1p(Math.max(-0.999999, rEq));
      const logBd = Math.log1p(Math.max(-0.999999, rBd));

      // ---- build the twelve monthly log returns for this year ----
      if (o.intraYear) {
        let sumE = 0;
        let sumB = 0;
        for (let m = 0; m < 12; m++) {
          const z1 = normal();
          const z2 = normal();
          const e = z1 * era.sigmaMonthlyEq;
          const b =
            (era.rho * z1 + Math.sqrt(1 - era.rho * era.rho) * z2) *
            era.sigmaMonthlyBd;
          bridgeEq[m] = e;
          bridgeBd[m] = b;
          sumE += e;
          sumB += b;
        }
        // pin each sleeve's twelve steps to sum exactly to the annual return
        const adjE = sumE / 12;
        const adjB = sumB / 12;
        for (let m = 0; m < 12; m++) {
          bridgeEq[m] = logEq / 12 + (bridgeEq[m] - adjE);
          bridgeBd[m] = logBd / 12 + (bridgeBd[m] - adjB);
        }
      } else {
        const stepE = logEq / 12;
        const stepB = logBd / 12;
        for (let m = 0; m < 12; m++) {
          bridgeEq[m] = stepE;
          bridgeBd[m] = stepB;
        }
      }

      // ---- walk the year month by month ----
      for (let m = 0; m < 12; m++) {
        const t = y * 12 + m + 1;
        const f = infFactor[t];

        // 1. the market moves (already net of the fund's TER)
        risky *= Math.exp(bridgeEq[m]);
        safe *= Math.exp(bridgeBd[m]);

        if (taxOn) {
          // 2. the funds earn dividends and coupons on the capital invested.
          //    Accrued now, taxed at the end of the tax year.
          if (yEqM > 0) accR += risky * f * yEqM;
          if (yBdM > 0) accS += safe * f * yBdM;

          // 3. the yearly charge on the whole balance, in twelve small slices
          //    (closer to the quarterly pro-rata way it is really billed than
          //    one year-end hit would be). Owed win or lose.
          if (wMonthly > 0) {
            const wR = risky * wMonthly;
            const wS = safe * wMonthly;
            risky -= wR;
            safe -= wS;
            paidYearly += wR + wS;
            paidYearlyNom += (wR + wS) * f;
          }
        }

        // 4. contribution lands at month end, so it earns no return this month.
        //    It is money already taxed, so it raises the cost base.
        risky += o.monthlyRisky;
        safe += o.monthlySafe;
        if (taxOn) {
          bR += o.monthlyRisky * f;
          bS += o.monthlySafe * f;

          // 5. end of the tax year: settle the tax on this year's income
          if (m === 11) {
            if (accR > 0) {
              const tR = incomeTaxNominal(accR, plan.equityIncomeRate, plan.equityIncomeAllowance);
              if (tR > 0) {
                risky -= tR / f;
                paidYearly += tR / f;
                paidYearlyNom += tR; // already an amount in euros of this month
              }
              // income already taxed must not be taxed again as a gain
              if (upliftGross) bR += accR;
              else if (upliftNet) bR += accR - tR;
              accR = 0;
            }
            if (accS > 0) {
              const tS = incomeTaxNominal(accS, plan.bondIncomeRate, plan.bondIncomeAllowance);
              if (tS > 0) {
                safe -= tS / f;
                paidYearly += tS / f;
                paidYearlyNom += tS;
              }
              if (upliftGross) bS += accS;
              else if (upliftNet) bS += accS - tS;
              accS = 0;
            }
          }
          if (risky < 0) risky = 0;
          if (safe < 0) safe = 0;
        }

        // 6. what you would actually walk away with if you sold this month:
        //    the balance minus the tax the sale itself would trigger.
        if (taxOn) {
          lastExitNom = exitTaxNominal(risky * f, bR, safe * f, bS, plan);
          lastExit = lastExitNom / f;
          value = risky + safe - lastExit;
        } else {
          value = risky + safe;
        }

        fan[t * nPaths + i] = value;

        if (value < lo) lo = value;
        if (value > hi) hi = value;
        if (value > peak) peak = value;
        const drop = peak > 0 ? 1 - value / peak : 0;
        if (drop > dd) dd = drop;
        const g = value - paidIn[t];
        if (g < gap) gap = g;

        const vN = value * infFactor[t];
        if (vN < loN) loN = vN;
        if (vN > hiN) hiN = vN;
        if (vN > peakN) peakN = vN;
        const dropN = peakN > 0 ? 1 - vN / peakN : 0;
        if (dropN > ddN) ddN = dropN;
        const gN = vN - paidInNom[t];
        if (gN < gapN) gapN = gN;
      }
    }

    finalV[i] = value;
    minV[i] = lo;
    maxV[i] = hi;
    maxDD[i] = dd;
    worstGap[i] = gap;
    minN[i] = loN;
    maxN[i] = hiN;
    maxDDN[i] = ddN;
    worstGapN[i] = gapN;
    taxYearly[i] = paidYearly;
    taxExit[i] = lastExit;
    taxYearlyN[i] = paidYearlyNom;
    taxExitN[i] = lastExitNom;

    if (onProgress && i % progressEvery === 0) onProgress(i / nPaths);
  }

  // ----------------------------------------------------------- percentiles
  const PCTS = [1, 5, 25, 50, 75, 95, 99];
  const bands = {};
  for (const p of PCTS) bands[p] = new Float64Array(nPts);
  const mean = new Float64Array(nPts);

  const col = new Float32Array(nPaths);
  for (let t = 0; t < nPts; t++) {
    col.set(fan.subarray(t * nPaths, (t + 1) * nPaths));
    let s = 0;
    for (let i = 0; i < nPaths; i++) s += col[i];
    mean[t] = s / nPaths;
    col.sort();
    for (const p of PCTS) bands[p][t] = percentileSorted(col, p);
    if (onProgress && t % 12 === 0) onProgress(0.9 + (0.1 * t) / nPts);
  }

  const sortedFinal = Float64Array.from(finalV).sort();
  const sortedMin = Float64Array.from(minV).sort();
  const sortedMax = Float64Array.from(maxV).sort();
  const sortedDD = Float64Array.from(maxDD).sort();
  const sortedGap = Float64Array.from(worstGap).sort();

  const sortedMinN = Float64Array.from(minN).sort();
  const sortedMaxN = Float64Array.from(maxN).sort();
  const sortedDDN = Float64Array.from(maxDDN).sort();
  const sortedGapN = Float64Array.from(worstGapN).sort();

  const totalPaidIn = paidIn[nPts - 1];
  const totalPaidInNom = paidInNom[nPts - 1];
  const factorEnd = infFactor[nPts - 1];
  let nLoss = 0;
  let nBelowPaid = 0;
  let nBelowPaidNom = 0;
  for (let i = 0; i < nPaths; i++) {
    if (finalV[i] < start) nLoss++;
    if (finalV[i] < totalPaidIn) nBelowPaid++;
    if (finalV[i] * factorEnd < totalPaidInNom) nBelowPaidNom++;
  }

  const q = (sorted, p) => percentileSorted(sorted, p);

  // ------------------------------------------------------------------- tax
  // The same summary is produced twice, once in today's euros and once in euros
  // of the day, because the yearly charges are paid at many different dates and
  // therefore cannot be converted with one factor after the fact.
  const taxSummary = (yearlyArr, exitArr, medFinalHere, paidInHere) => {
    const total = new Float64Array(nPaths);
    for (let i = 0; i < nPaths; i++) total[i] = yearlyArr[i] + exitArr[i];
    const sy = Float64Array.from(yearlyArr).sort();
    const se = Float64Array.from(exitArr).sort();
    const st = Float64Array.from(total).sort();
    // "Share of the gain taken", measured at the median: tax handed over
    // divided by the profit there would have been before it. This slightly
    // understates the true burden, because money taken early also stops
    // compounding — an effect no single ratio can capture.
    const medTax = q(st, 50);
    const grossGain = medFinalHere + medTax - paidInHere;
    return {
      yearly: { p5: q(sy, 5), p50: q(sy, 50), p95: q(sy, 95) },
      exit: { p5: q(se, 5), p50: q(se, 50), p95: q(se, 95) },
      total: { p5: q(st, 5), p50: q(st, 50), p95: q(st, 95) },
      grossGainAtMedian: grossGain,
      shareOfGainAtMedian: grossGain > 0 ? medTax / grossGain : 0,
    };
  };
  const medFinal = q(sortedFinal, 50);
  const realTax = taxSummary(taxYearly, taxExit, medFinal, totalPaidIn);

  return {
    opts: o,
    tax: {
      plan,
      enabled: plan.enabled,
      ...realTax,
      nominal: taxSummary(
        taxYearlyN,
        taxExitN,
        medFinal * factorEnd,
        totalPaidInNom
      ),
    },
    nMonths,
    nPts,
    paidIn: Array.from(paidIn),
    totalPaidIn,
    bands: Object.fromEntries(
      Object.entries(bands).map(([k, v]) => [k, Array.from(v)])
    ),
    mean: Array.from(mean),
    final: {
      p1: q(sortedFinal, 1),
      p5: q(sortedFinal, 5),
      p25: q(sortedFinal, 25),
      p50: q(sortedFinal, 50),
      p75: q(sortedFinal, 75),
      p95: q(sortedFinal, 95),
      p99: q(sortedFinal, 99),
      mean: mean[nPts - 1],
    },
    // lowest balance the portfolio ever touched along the way
    lowest: {
      p1: q(sortedMin, 1),
      p5: q(sortedMin, 5),
      p50: q(sortedMin, 50),
    },
    // highest balance touched along the way
    highest: {
      p50: q(sortedMax, 50),
      p95: q(sortedMax, 95),
      p99: q(sortedMax, 99),
    },
    drawdown: {
      p50: q(sortedDD, 50),
      p95: q(sortedDD, 95),
      p99: q(sortedDD, 99),
    },
    worstGap: {
      p1: q(sortedGap, 1),
      p5: q(sortedGap, 5),
      p50: q(sortedGap, 50),
    },
    probLossVsStart: nLoss / nPaths,
    probBelowPaidIn: nBelowPaid / nPaths,
    // Everything again in euros-of-the-day. Bands are obtained by scaling (see
    // the note above); the path extrema were tracked independently.
    nominal: {
      inflation: o.inflation,
      factor: Array.from(infFactor),
      paidIn: Array.from(paidInNom),
      totalPaidIn: totalPaidInNom,
      final: {
        p1: q(sortedFinal, 1) * factorEnd,
        p5: q(sortedFinal, 5) * factorEnd,
        p25: q(sortedFinal, 25) * factorEnd,
        p50: q(sortedFinal, 50) * factorEnd,
        p75: q(sortedFinal, 75) * factorEnd,
        p95: q(sortedFinal, 95) * factorEnd,
        p99: q(sortedFinal, 99) * factorEnd,
        mean: mean[nPts - 1] * factorEnd,
      },
      lowest: {
        p1: q(sortedMinN, 1),
        p5: q(sortedMinN, 5),
        p50: q(sortedMinN, 50),
      },
      highest: {
        p50: q(sortedMaxN, 50),
        p95: q(sortedMaxN, 95),
        p99: q(sortedMaxN, 99),
      },
      drawdown: {
        p50: q(sortedDDN, 50),
        p95: q(sortedDDN, 95),
        p99: q(sortedDDN, 99),
      },
      worstGap: {
        p1: q(sortedGapN, 1),
        p5: q(sortedGapN, 5),
        p50: q(sortedGapN, 50),
      },
      probBelowPaidIn: nBelowPaidNom / nPaths,
    },
    era: {
      start: o.eraStart,
      end: o.eraEnd,
      nYears: era.n,
      equityCagr: era.annualisedEq,
      bondCagr: era.annualisedBd,
      equityVol: era.volEq,
      bondVol: era.volBd,
      correlation: era.rho,
    },
  };
}

// ------------------------------------------------------- historical windows

/**
 * Replay the strategy through every real, consecutive historical window in the
 * era — no resampling, no randomness. With 1900-2025 and a 10-year horizon
 * that is 117 actual decades, each starting one year after the last.
 */
export function historicalWindows(data, optsIn = {}) {
  const o = { ...DEFAULTS, ...optsIn };
  const plan = planOf(o.tax);
  const era = prepareEra(data, o.eraStart, o.eraEnd);
  const out = [];
  const nMonths = Math.round(o.years * 12);

  const infFactor = new Float64Array(nMonths + 1);
  for (let t = 0; t <= nMonths; t++) infFactor[t] = Math.pow(1 + o.inflation, t / 12);

  const taxOn = plan.enabled;
  const wMonthly = taxOn ? plan.wealthRate / 12 : 0;
  const yEqM = taxOn ? plan.equityYield / 12 : 0;
  const yBdM = taxOn ? plan.bondYield / 12 : 0;
  const upliftGross = plan.basisUplift === "gross";
  const upliftNet = plan.basisUplift === "net";

  for (let s = 0; s + o.years <= era.n; s++) {
    let risky = o.initialRisky;
    let safe = o.initialSafe;
    let bR = o.initialRisky;
    let bS = o.initialSafe;
    let accR = 0;
    let accS = 0;
    let taxPaid = 0; // yearly charges only; the exit bill is added at the end
    let lastExit = 0;

    const path = new Array(nMonths + 1);
    path[0] = risky + safe;
    let lo = path[0];
    let peak = path[0];
    let dd = 0;

    for (let y = 0; y < o.years; y++) {
      const rEq = netOfCosts(era.equity[s + y], o.terRisky);
      const rBd = netOfCosts(era.bonds[s + y], o.terSafe);
      const stepE = Math.pow(1 + Math.max(-0.999999, rEq), 1 / 12);
      const stepB = Math.pow(1 + Math.max(-0.999999, rBd), 1 / 12);
      for (let m = 0; m < 12; m++) {
        // Identical order of events to the Monte Carlo above, so the two
        // sections of the page can never disagree about tax.
        const t = y * 12 + m + 1;
        const f = infFactor[t];
        risky *= stepE;
        safe *= stepB;

        if (taxOn) {
          if (yEqM > 0) accR += risky * f * yEqM;
          if (yBdM > 0) accS += safe * f * yBdM;
          if (wMonthly > 0) {
            const wR = risky * wMonthly;
            const wS = safe * wMonthly;
            risky -= wR;
            safe -= wS;
            taxPaid += wR + wS;
          }
        }

        risky += o.monthlyRisky;
        safe += o.monthlySafe;

        if (taxOn) {
          bR += o.monthlyRisky * f;
          bS += o.monthlySafe * f;
          if (m === 11) {
            if (accR > 0) {
              const tR = incomeTaxNominal(accR, plan.equityIncomeRate, plan.equityIncomeAllowance);
              if (tR > 0) {
                risky -= tR / f;
                taxPaid += tR / f;
              }
              if (upliftGross) bR += accR;
              else if (upliftNet) bR += accR - tR;
              accR = 0;
            }
            if (accS > 0) {
              const tS = incomeTaxNominal(accS, plan.bondIncomeRate, plan.bondIncomeAllowance);
              if (tS > 0) {
                safe -= tS / f;
                taxPaid += tS / f;
              }
              if (upliftGross) bS += accS;
              else if (upliftNet) bS += accS - tS;
              accS = 0;
            }
          }
          if (risky < 0) risky = 0;
          if (safe < 0) safe = 0;
        }

        let v;
        if (taxOn) {
          lastExit = exitTaxNominal(risky * f, bR, safe * f, bS, plan) / f;
          v = risky + safe - lastExit;
        } else {
          v = risky + safe;
        }
        path[t] = v;
        if (v < lo) lo = v;
        if (v > peak) peak = v;
        const drop = 1 - v / peak;
        if (drop > dd) dd = drop;
      }
    }

    out.push({
      startYear: era.years[s],
      endYear: era.years[s + o.years - 1],
      final: path[nMonths],
      lowest: lo,
      maxDrawdown: dd,
      taxYearly: taxPaid,
      taxExit: lastExit,
      taxPaid: taxPaid + lastExit,
      path,
    });
  }
  return out;
}

/** Convert a real-euro figure at month t into nominal euros. */
export function toNominal(realValue, monthIndex, annualInflation) {
  return realValue * Math.pow(1 + annualInflation, monthIndex / 12);
}
