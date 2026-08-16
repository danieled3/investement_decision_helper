/**
 * Block-length calibration study.
 *
 * The block bootstrap has one free parameter: the mean block length. Too short
 * and it shreds the multi-year persistence in markets (bear markets that grind
 * on, inflation regimes that last a decade), which UNDERSTATES tail risk. Too
 * long and it just replays history with fewer effective samples.
 *
 * The principled way to choose it: pick the block length whose simulated spread
 * of 10-year outcomes matches the spread actually observed in real overlapping
 * 10-year windows. This script measures that.
 *
 *   node tests/calibrate_blocks.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { simulate, historicalWindows, percentileSorted } from "../js/engine.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(HERE, "../data/returns.json"), "utf8"));

const sd = (xs) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

// Lump sum, no contributions, no costs: isolates the return process itself.
const base = {
  initialRisky: 1, initialSafe: 0, monthlyRisky: 0, monthlySafe: 0,
  terRisky: 0, terSafe: 0, eraStart: 1900, eraEnd: 2025, intraYear: false,
};

for (const horizon of [10, 20]) {
  const w = historicalWindows(data, { ...base, years: horizon });
  const histLog = w.map((x) => Math.log(x.final));
  const histSd = sd(histLog);
  const finals = w.map((x) => x.final).sort((a, b) => a - b);

  console.log(
    `\n=== ${horizon}-YEAR HORIZON, 100% equity, ${w.length} real overlapping windows ===`
  );
  console.log(
    `  real windows : sd(log wealth) ${histSd.toFixed(4)}   ` +
      `worst ${finals[0].toFixed(2)}x   median ${percentileSorted(finals, 50).toFixed(2)}x   ` +
      `best ${finals[finals.length - 1].toFixed(2)}x`
  );
  console.log(
    `\n  ${"block".padStart(6)} ${"sd(log)".padStart(9)} ${"vs real".padStart(9)}` +
      ` ${"p1".padStart(8)} ${"p50".padStart(8)} ${"p99".padStart(8)}` +
      ` ${"pctile of worst real".padStart(21)}`
  );

  for (const blockMean of [1, 2, 3, 4, 5, 7, 10, 15, 20]) {
    const r = simulate(data, {
      ...base, years: horizon, blockMean, nPaths: 200000, seed: 99,
    });
    // rebuild the terminal distribution to locate the worst real window in it
    const finalsSim = [];
    // (percentiles come back from simulate(); for the locator we re-derive from bands)
    const simSd = Math.log(r.final.p50) - Math.log(r.final.p1);
    void finalsSim;

    // approximate sd of log wealth from percentiles (p84/p16 spread)
    // use the exact band data at the final point instead:
    const p16 = r.bands[25][r.nPts - 1]; // not exactly 16, so use 25/75 IQR
    const p84 = r.bands[75][r.nPts - 1];
    const sdApprox = (Math.log(p84) - Math.log(p16)) / 1.349; // IQR -> sd for lognormal
    void simSd;

    console.log(
      `  ${String(blockMean).padStart(6)} ${sdApprox.toFixed(4).padStart(9)}` +
        ` ${((sdApprox / histSd - 1) * 100).toFixed(1).padStart(8)}%` +
        ` ${r.final.p1.toFixed(2).padStart(8)} ${r.final.p50.toFixed(2).padStart(8)}` +
        ` ${r.final.p99.toFixed(2).padStart(8)}` +
        ` ${(finals[0] < r.final.p1 ? "below sim p1" : "inside sim range").padStart(21)}`
    );
  }
}

// How persistent are these series really? Autocorrelation tells us whether long
// blocks are even justified.
console.log("\n=== AUTOCORRELATION of annual real returns, 1900-2025 ===");
for (const [name, key] of [["equity", "equity_real"], ["bonds", "bond_real"]]) {
  const x = data[key];
  const m = x.reduce((a, b) => a + b, 0) / x.length;
  const denom = x.reduce((a, b) => a + (b - m) ** 2, 0);
  const acf = [];
  for (let lag = 1; lag <= 5; lag++) {
    let num = 0;
    for (let i = lag; i < x.length; i++) num += (x[i] - m) * (x[i - lag] - m);
    acf.push(num / denom);
  }
  console.log(
    `  ${name.padEnd(7)} ` +
      acf.map((v, i) => `lag${i + 1} ${v >= 0 ? "+" : ""}${v.toFixed(3)}`).join("  ")
  );
}
console.log(
  "\n  Interpretation: |acf| below ~0.18 is not distinguishable from zero at n=126\n" +
    "  (2/sqrt(126) = 0.178). Significant negative lag-1 = mean reversion.\n"
);
