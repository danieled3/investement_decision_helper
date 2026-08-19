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
 * 4. A financial consultant's fee, if one is set: a percentage of the whole
 *    balance, taken out once a year, pro rata from both sleeves so the split is
 *    untouched. It is charged like the funds' own fee — it lowers the balance,
 *    and therefore the eventual gain, rather than being modelled as a sale.
 * 5. Tax, if a country is selected. See js/tax.js for the rules; the order in
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
 * simulation needs.
 *
 * The equity sleeve is a world ETF and still swings within the year, so its
 * log-return volatility is measured for the Brownian bridge. The bond sleeve is
 * now a single government bond held to maturity — no price risk — so instead of
 * a return series it needs the yield curve you can lock in (the short and 10-year
 * points) and the inflation discount factor that erodes it. Those come from the
 * `bond_hold` block for the requested currency ("eur" for none/Italy, "gbp" for
 * the UK); everything else is the same for both.
 */
export function prepareEra(data, eraStart, eraEnd, currency = "eur") {
  const hold = (data.bond_hold && data.bond_hold[currency]) || null;
  const eq = [];
  const bd = [];
  const years = [];
  const yShort = [];
  const yLong = [];
  const disc = [];
  for (let i = 0; i < data.years.length; i++) {
    const y = data.years[i];
    if (y < eraStart || y > eraEnd) continue;
    years.push(y);
    eq.push(data.equity_real[i]);
    bd.push(data.bond_real[i]);
    if (hold) {
      yShort.push(hold.yield_short[i]);
      yLong.push(hold.yield_long[i]);
      disc.push(hold.infl_discount[i]);
    } else {
      // No held-to-maturity curve in this dataset (the synthetic fixtures the
      // test suite builds). Reproduce the plain bond_real return exactly: a zero
      // locked yield times a discount of (1 + return) leaves the return itself,
      // for any maturity, so those tests keep their old meaning.
      yShort.push(0);
      yLong.push(0);
      disc.push(1 + data.bond_real[i]);
    }
  }
  const eqLog = eq.map((r) => Math.log1p(r));
  const sdEq = stdev(eqLog);

  const n = eqLog.length;
  const mE = eqLog.reduce((a, b) => a + b, 0) / n;

  // The held-to-maturity real return each year is (1+yield)*discount-1. Measured
  // here with the yield locked one year (a rolling bond) purely to report the
  // sleeve's own average and volatility; the real simulation locks it for the
  // whole maturity the user picks. Falls back to the ETF series if a build
  // predates the bond_hold block.
  const holdReal = hold
    ? disc.map((d, i) => (1 + yLong[Math.max(0, i - 1)]) * d - 1)
    : bd.slice();
  const holdLog = holdReal.map((r) => Math.log1p(Math.max(-0.999999, r)));
  const mB = holdLog.reduce((a, b) => a + b, 0) / n;

  // Correlation between the equity return and the held-to-maturity bond return,
  // still worth showing: it is why holding both smooths the ride.
  const mEr = eq.reduce((a, b) => a + b, 0) / n;
  const mBr = holdReal.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let vE = 0;
  let vB = 0;
  for (let i = 0; i < n; i++) {
    const de = eq[i] - mEr;
    const db = holdReal[i] - mBr;
    cov += de * db;
    vE += de * de;
    vB += db * db;
  }
  const correlation = vE > 0 && vB > 0 ? cov / Math.sqrt(vE * vB) : 0;

  return {
    years,
    equity: Float64Array.from(eq),
    bonds: Float64Array.from(bd), // ETF total return — historical tables only
    // held-to-maturity bond inputs (empty if the dataset lacks the block)
    yShort: Float64Array.from(yShort),
    yLong: Float64Array.from(yLong),
    disc: Float64Array.from(disc),
    hasHold: !!hold,
    n,
    // monthly log-return vol implied by the annual equity vol
    sigmaMonthlyEq: sdEq / Math.sqrt(12),
    annualisedEq: Math.exp(mE) - 1,
    annualisedBond: Math.exp(mB) - 1,
    volEq: stdev(eq),
    volBond: stdev(holdReal),
    correlation,
  };
}

/**
 * The yield on offer for a bond of maturity `M` years in the historical year at
 * `idx`, interpolated linearly in maturity between the short (0.25y) and 10-year
 * points of that year's curve. This is the number you lock in when you buy.
 */
export function lockedYield(era, idx, M) {
  const m = Math.max(0.25, Math.min(10, M));
  const frac = (m - 0.25) / (10 - 0.25);
  return era.yShort[idx] + frac * (era.yLong[idx] - era.yShort[idx]);
}

/**
 * The yield a bond of maturity `M` locks if you buy it today — the last year on
 * the curve. The tax model needs this too: held to maturity, the coupon the
 * taxman charges you on *is* this number, so the page's assumed bond yield can
 * follow the country and the maturity instead of sitting at a flat guess.
 * Returns null for a dataset with no `bond_hold` block.
 */
export function currentYield(data, currency, M) {
  const hold = data && data.bond_hold && data.bond_hold[currency];
  if (!hold) return null;
  return lockedYield(
    { yShort: hold.yield_short, yLong: hold.yield_long },
    hold.yield_short.length - 1,
    M,
  );
}

// --------------------------------------------------------------- simulation

export const DEFAULTS = {
  initialRisky: 10000,
  initialSafe: 5000,
  monthlyRisky: 400,
  monthlySafe: 100,
  years: 10,
  terRisky: 0.002, // 0.20% — typical world-equity ETF
  terSafe: 0, // a directly-held bond has no fund fee; kept for compatibility
  advisorFee: 0, // fraction of the whole balance paid to a consultant each year
  bondMaturity: 10, // years; the bond is held to maturity, then rolled into a new one
  currency: null, // "eur" / "gbp"; null derives it from the tax country
  eraStart: 1900,
  eraEnd: 2025,
  inflation: 0.02, // ECB target, used only for the nominal view
  nPaths: 100000,
  blockMean: 5,
  intraYear: true,
  seed: 20260816,
  tax: null, // null / {country:"none"} = gross; see js/tax.js
};

/** The bond's currency (and therefore which government issues it) follows the
 *  tax country: sterling gilts for the UK, euro government bonds otherwise.
 *  An ISA resolves to the id "gb_isa" — it is a wrapper around the same UK
 *  holdings, so it must match too, or sheltering the plan would silently swap
 *  the gilt for a bund while the page still priced everything in pounds. */
export function currencyOf(o, plan) {
  if (o.currency) return o.currency;
  return plan && typeof plan.id === "string" && plan.id.startsWith("gb") ? "gbp" : "eur";
}

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
  const plan = planOf(o.tax);
  const currency = currencyOf(o, plan);
  const era = prepareEra(data, o.eraStart, o.eraEnd, currency);
  if (era.n < o.years) {
    throw new Error(
      `Era ${o.eraStart}-${o.eraEnd} has only ${era.n} years of data, ` +
        `need at least ${o.years}.`
    );
  }
  // Bond held to maturity: a whole number of years, never longer than the plan.
  const bondM = Math.max(1, Math.min(o.years, Math.round(o.bondMaturity)));
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

  // what the consultant was paid, per path, added up over the whole period —
  // once in today's euros and once in the euros of each billing date, for the
  // same reason the yearly taxes are counted twice (see below).
  const advPaid = new Float64Array(nPaths);
  const advPaidN = new Float64Array(nPaths);

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

  // Cost constants hoisted out of the hot loop.
  const advFee = Math.max(0, Math.min(1, o.advisorFee || 0));
  const advOn = advFee > 0;
  const taxOn = plan.enabled;
  const wMonthly = taxOn ? plan.wealthRate / 12 : 0;
  const yEqM = taxOn ? plan.equityYield / 12 : 0;
  const yBdM = taxOn ? plan.bondYield / 12 : 0;
  const upliftGross = plan.basisUplift === "gross";
  const upliftNet = plan.basisUplift === "net";

  // A single government bond held to maturity has fixed cash flows: its NOMINAL
  // return is simply the coupon it was bought at. Its real return is that coupon
  // eroded by inflation — and this model treats inflation as the one explicit,
  // fixed assumption (o.inflation), exactly as the "future euros" view does. So
  // the bond's real return is (1 + coupon) / (1 + inflation) - 1, deterministic
  // given the yield you locked. It carries NO inflation *risk* here, because
  // inflation is not resampled; the only uncertainty is the yield you can lock
  // when you buy or roll (reinvestment risk on short maturities), and default,
  // which neither Italy nor the UK has ever done on its own-currency debt and
  // which the model does not attempt to price.
  const invInfl = 1 / (1 + o.inflation);
  // The first bond is bought TODAY, so it locks today's yield (the most recent
  // year on the curve) with certainty. Later rolls land on a resampled future
  // year, which is where reinvestment risk comes from.
  const yieldToday = era.hasHold ? lockedYield(era, era.n - 1, bondM) : 0;

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
    let advisor = 0; // paid to the consultant so far, today's euros
    let advisorNom = 0; // the same, each bill in the euros of its own year

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
    // Yield fixed for the bond's life. The first bond is bought today, so it
    // locks today's yield with certainty (synthetic fixtures fall back to idx).
    let locked = era.hasHold ? yieldToday : lockedYield(era, idx, bondM);

    for (let y = 0; y < o.years; y++) {
      if (y > 0) {
        // stationary bootstrap: new random block, or continue the current one
        if (rng() < pNewBlock) idx = Math.floor(rng() * era.n);
        else idx = (idx + 1) % era.n;
      }
      // The bond matures every `bondM` years; the roll after the first buys the
      // next bond at whatever yield the resampled future year offers (this is
      // the reinvestment risk that short maturities carry). The first bond, at
      // y === 0, keeps the yield it was bought at today.
      if (y > 0 && y % bondM === 0) locked = lockedYield(era, idx, bondM);

      const rEq = netOfCosts(era.equity[idx], o.terRisky);
      const logEq = Math.log1p(Math.max(-0.999999, rEq));
      // Held to maturity there is no price swing: the nominal return is exactly
      // the locked coupon, so the real return is that coupon deflated by the
      // fixed assumed inflation — spread smoothly across the twelve months.
      const bondDeflator = era.hasHold ? invInfl : era.disc[idx];
      const rBd = (1 + locked) * bondDeflator - 1;
      const logBd = Math.log1p(Math.max(-0.999999, rBd));
      const stepB = logBd / 12;

      // ---- build the twelve monthly steps: equity swings, bond is smooth ----
      if (o.intraYear) {
        let sumE = 0;
        for (let m = 0; m < 12; m++) {
          const e = normal() * era.sigmaMonthlyEq;
          bridgeEq[m] = e;
          sumE += e;
        }
        // pin equity's twelve steps to sum exactly to the annual return
        const adjE = sumE / 12;
        for (let m = 0; m < 12; m++) {
          bridgeEq[m] = logEq / 12 + (bridgeEq[m] - adjE);
          bridgeBd[m] = stepB;
        }
      } else {
        const stepE = logEq / 12;
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

        // 2. the consultant's bill, once a year, on whatever the pot is worth
        //    then — pro rata from both sleeves, so the split is untouched.
        if (advOn && m === 11) {
          const aR = risky * advFee;
          const aS = safe * advFee;
          risky -= aR;
          safe -= aS;
          advisor += aR + aS;
          advisorNom += (aR + aS) * f;
        }

        if (taxOn) {
          // 3. the funds earn dividends and coupons on the capital invested.
          //    Accrued now, taxed at the end of the tax year.
          if (yEqM > 0) accR += risky * f * yEqM;
          if (yBdM > 0) accS += safe * f * yBdM;

          // 4. the yearly charge on the whole balance, in twelve small slices
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

        // 5. contribution lands at month end, so it earns no return this month.
        //    It is money already taxed, so it raises the cost base.
        risky += o.monthlyRisky;
        safe += o.monthlySafe;
        if (taxOn) {
          bR += o.monthlyRisky * f;
          bS += o.monthlySafe * f;

          // 6. end of the tax year: settle the tax on this year's income
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

        // 7. what you would actually walk away with if you sold this month:
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
    advPaid[i] = advisor;
    advPaidN[i] = advisorNom;

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

  // ------------------------------------------------------------- consultant
  // The AVERAGE bill leads, because a fee charged on the balance is biggest in
  // exactly the journeys that went well: the mean is pulled up by them, and the
  // median would flatter the arrangement. The range is kept for the detail box.
  const advisorSummary = (arr, meanFinalHere, paidInHere) => {
    let sum = 0;
    for (let i = 0; i < nPaths; i++) sum += arr[i];
    const meanAdv = sum / nPaths;
    const s = Float64Array.from(arr).sort();
    // Compared with the gain that was actually made plus the bill itself. Like
    // the tax ratio above it understates the real cost, because the money handed
    // over would also have gone on compounding.
    const gainBefore = meanFinalHere + meanAdv - paidInHere;
    return {
      mean: meanAdv,
      p5: q(s, 5),
      p50: q(s, 50),
      p95: q(s, 95),
      gainBeforeAtMean: gainBefore,
      shareOfGainAtMean: gainBefore > 0 ? meanAdv / gainBefore : 0,
    };
  };
  const meanFinalReal = mean[nPts - 1];

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
    advisor: {
      fee: advFee,
      enabled: advOn,
      // Exactly true, and the only honest way to state the cost *with* the lost
      // compounding in it: whatever was invested at the start ends this much
      // smaller than it would have, whatever the market did.
      dragOnInitial: 1 - Math.pow(1 - advFee, o.years),
      // The fee applied to the pot as it stands today: not a bill anyone will
      // ever receive — the first one lands a year later, on a bigger balance —
      // but the one figure a reader can check against their own statement.
      feeOnToday: start * advFee,
      ...advisorSummary(advPaid, meanFinalReal, totalPaidIn),
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
      advisor: advisorSummary(advPaidN, meanFinalReal * factorEnd, totalPaidInNom),
    },
    era: {
      start: o.eraStart,
      end: o.eraEnd,
      nYears: era.n,
      equityCagr: era.annualisedEq,
      // The bond is held to maturity, so its real "growth per year" is the real
      // yield you can lock today — the coupon less the assumed inflation — not a
      // volatile historical series. There is no market price to bounce, so its
      // year-to-year volatility and its correlation with equities are zero.
      bondCagr: era.hasHold ? (1 + yieldToday) * invInfl - 1 : era.annualisedBond,
      equityVol: era.volEq,
      bondVol: era.hasHold ? 0 : era.volBond,
      correlation: era.hasHold ? 0 : era.correlation,
    },
    bond: {
      currency,
      maturity: bondM,
      // the yield you would lock in today for that maturity, in this era
      yieldNow: lockedYield(era, era.n - 1, bondM),
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
  const currency = currencyOf(o, plan);
  const era = prepareEra(data, o.eraStart, o.eraEnd, currency);
  const bondM = Math.max(1, Math.min(o.years, Math.round(o.bondMaturity)));
  const out = [];
  const nMonths = Math.round(o.years * 12);

  const infFactor = new Float64Array(nMonths + 1);
  for (let t = 0; t <= nMonths; t++) infFactor[t] = Math.pow(1 + o.inflation, t / 12);

  const advFee = Math.max(0, Math.min(1, o.advisorFee || 0));
  const advOn = advFee > 0;
  const taxOn = plan.enabled;
  const wMonthly = taxOn ? plan.wealthRate / 12 : 0;
  const yEqM = taxOn ? plan.equityYield / 12 : 0;
  const yBdM = taxOn ? plan.bondYield / 12 : 0;
  const upliftGross = plan.basisUplift === "gross";
  const upliftNet = plan.basisUplift === "net";
  const invInfl = 1 / (1 + o.inflation); // held-to-maturity bond: see simulate()

  for (let s = 0; s + o.years <= era.n; s++) {
    let risky = o.initialRisky;
    let safe = o.initialSafe;
    let bR = o.initialRisky;
    let bS = o.initialSafe;
    let accR = 0;
    let accS = 0;
    let taxPaid = 0; // yearly charges only; the exit bill is added at the end
    let lastExit = 0;
    let advisor = 0; // paid to the consultant over the window, today's euros

    const path = new Array(nMonths + 1);
    path[0] = risky + safe;
    let lo = path[0];
    let peak = path[0];
    let dd = 0;

    let locked = lockedYield(era, s, bondM);
    for (let y = 0; y < o.years; y++) {
      const idx = s + y;
      if (y > 0 && y % bondM === 0) locked = lockedYield(era, idx, bondM);
      const rEq = netOfCosts(era.equity[idx], o.terRisky);
      // Held to maturity: nominal return is the locked coupon, so the real
      // return is that coupon deflated by the fixed assumed inflation.
      const bondDeflator = era.hasHold ? invInfl : era.disc[idx];
      const rBd = (1 + locked) * bondDeflator - 1;
      const stepE = Math.pow(1 + Math.max(-0.999999, rEq), 1 / 12);
      const stepB = Math.pow(1 + Math.max(-0.999999, rBd), 1 / 12);
      for (let m = 0; m < 12; m++) {
        // Identical order of events to the Monte Carlo above, so the two
        // sections of the page can never disagree about tax.
        const t = y * 12 + m + 1;
        const f = infFactor[t];
        risky *= stepE;
        safe *= stepB;

        if (advOn && m === 11) {
          const aR = risky * advFee;
          const aS = safe * advFee;
          risky -= aR;
          safe -= aS;
          advisor += aR + aS;
        }

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
      advisorPaid: advisor,
      path,
    });
  }
  return out;
}

/** Convert a real-euro figure at month t into nominal euros. */
export function toNominal(realValue, monthIndex, annualInflation) {
  return realValue * Math.pow(1 + annualInflation, monthIndex / 12);
}
