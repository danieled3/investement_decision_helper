/**
 * Web Worker wrapper around the simulation engine.
 *
 * 50,000 paths x 120 months is tens of millions of steps; running it on the main
 * thread would freeze the page. The worker keeps the UI responsive and reports
 * progress so the user can see the run happening.
 */

import { simulate, historicalWindows } from "./engine.js";

let data = null;

self.onmessage = (ev) => {
  const msg = ev.data;

  if (msg.type === "data") {
    data = msg.data;
    self.postMessage({ type: "ready" });
    return;
  }

  if (msg.type === "run") {
    if (!data) {
      self.postMessage({ type: "error", message: "Dataset not loaded yet." });
      return;
    }
    try {
      const t0 = performance.now();
      let lastSent = -1;
      const result = simulate(data, msg.opts, (p) => {
        const pctDone = Math.floor(p * 100);
        if (pctDone !== lastSent) {
          lastSent = pctDone;
          self.postMessage({ type: "progress", value: p });
        }
      });
      // Every real, consecutive window in the era — no randomness at all.
      const windows = historicalWindows(data, msg.opts).map((w) => ({
        startYear: w.startYear,
        endYear: w.endYear,
        final: w.final,
        lowest: w.lowest,
        maxDrawdown: w.maxDrawdown,
        path: w.path,
      }));
      result.elapsedMs = performance.now() - t0;
      self.postMessage({ type: "result", result, windows, token: msg.token });
    } catch (err) {
      self.postMessage({
        type: "error",
        message: err && err.message ? err.message : String(err),
        token: msg.token,
      });
    }
  }
};
