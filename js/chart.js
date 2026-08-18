/**
 * Charts, drawn as plain SVG. No libraries, no CDN — the whole page must work
 * as static files on GitHub Pages.
 *
 * Two forms:
 *   createFanChart      percentile fan over time (the main chart)
 *   createHistogram     distribution of the 117 real historical decades
 *
 * Colour rules follow the validated palette: likelihood bands use one blue hue
 * as a light-to-dark sequential ramp (they encode *magnitude of likelihood*, not
 * identity), while genuinely different things — your portfolio, the money you
 * paid in, a real historical decade — take fixed categorical slots.
 */

import { t, euro, euroCompact } from "./i18n.js";

const SVG = "http://www.w3.org/2000/svg";

// ---------------------------------------------------------------- scale helper

/** "Nice" axis ticks covering [0, max] with roughly `target` steps. */
function niceTicks(max, target = 6) {
  if (!(max > 0)) return { ticks: [0, 1], top: 1 };
  const raw = max / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);
  return { ticks, top };
}

function el(name, attrs = {}, parent = null) {
  const n = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== null && v !== undefined) n.setAttribute(k, String(v));
  }
  if (parent) parent.appendChild(n);
  return n;
}

function cssVar(node, name) {
  return getComputedStyle(node).getPropertyValue(name).trim();
}

// ============================================================== the fan chart

/**
 * @param {HTMLElement} root  container; the chart and tooltip are created inside
 * @returns {{update: (model:object)=>void, destroy: ()=>void}}
 *
 * model = {
 *   nPts, months,                 // number of points, x in months
 *   bands: {1,5,25,50,75,95,99},  // arrays of length nPts
 *   paidIn: number[],             // arrays of length nPts
 *   overlay: {label, path} | null,
 *   showBands: {p99: bool, p95: bool, p50: bool},
 *   unitLabel: string             // "today's euros" / "euros of the day"
 * }
 */
export function createFanChart(root) {
  root.classList.add("chart-box");
  const svg = el("svg", { class: "chart", role: "img" });
  root.appendChild(svg);

  const tip = document.createElement("div");
  tip.className = "tooltip";
  tip.setAttribute("aria-hidden", "true");
  root.appendChild(tip);

  const live = document.createElement("div");
  live.className = "skip";
  live.setAttribute("aria-live", "polite");
  root.appendChild(live);

  let model = null;
  let geom = null;
  let hoverIdx = null;

  function layout() {
    const W = Math.max(320, root.clientWidth || 640);
    const H = Math.round(Math.min(480, Math.max(280, W * 0.52)));
    const m = { top: 14, right: W < 560 ? 16 : 84, bottom: 44, left: W < 560 ? 48 : 66 };
    return { W, H, m, iw: W - m.left - m.right, ih: H - m.top - m.bottom };
  }

  function render() {
    if (!model) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const { W, H, m, iw, ih } = layout();
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);

    const nPts = model.nPts;
    const months = nPts - 1;

    // ---- scales. Money charts get a zero baseline so a dip reads at true
    //      proportion; a truncated axis would exaggerate every wobble.
    let maxV = 0;
    const top99 = model.showBands.p99 ? model.bands[99] : model.bands[95];
    for (let t = 0; t < nPts; t++) {
      if (top99[t] > maxV) maxV = top99[t];
      if (model.paidIn[t] > maxV) maxV = model.paidIn[t];
    }
    if (model.overlay) for (const v of model.overlay.path) if (v > maxV) maxV = v;

    const { ticks, top } = niceTicks(maxV, ih > 340 ? 7 : 5);
    const x = (t) => m.left + (t / months) * iw;
    const y = (v) => m.top + ih - (v / top) * ih;
    geom = { x, y, m, iw, ih, months, W };

    // ---- gridlines + y labels
    const gGrid = el("g", {}, svg);
    for (const v of ticks) {
      el("line", {
        class: "gridline", x1: m.left, x2: m.left + iw,
        y1: y(v).toFixed(1), y2: y(v).toFixed(1),
      }, gGrid);
      el("text", {
        class: "tick-label", x: m.left - 8, y: y(v) + 4, "text-anchor": "end",
      }, gGrid).textContent = euroCompact(v);
    }

    // ---- x axis: one tick per year
    const gx = el("g", {}, svg);
    el("line", {
      class: "axisline", x1: m.left, x2: m.left + iw,
      y1: m.top + ih, y2: m.top + ih,
    }, gx);
    const yearsTotal = Math.round(months / 12);
    const everyN = yearsTotal > 16 ? 5 : yearsTotal > 11 ? 2 : 1;
    for (let yr = 0; yr <= yearsTotal; yr++) {
      if (yr % everyN !== 0 && yr !== yearsTotal) continue;
      const px = x(yr * 12);
      el("line", {
        class: "axisline", x1: px, x2: px, y1: m.top + ih, y2: m.top + ih + 4,
      }, gx);
      el("text", {
        class: "tick-label", x: px, y: m.top + ih + 17, "text-anchor": "middle",
      }, gx).textContent = yr;
    }
    el("text", {
      class: "axis-title", x: m.left + iw / 2, y: H - 6, "text-anchor": "middle",
    }, gx).textContent = t("js.chart.xTitle");

    // ---- bands, widest first so narrower ones sit on top
    const bandArea = (loKey, hiKey, fill) => {
      const lo = model.bands[loKey];
      const hi = model.bands[hiKey];
      let d = `M${x(0).toFixed(2)},${y(hi[0]).toFixed(2)}`;
      for (let t = 1; t < nPts; t++) d += `L${x(t).toFixed(2)},${y(hi[t]).toFixed(2)}`;
      for (let t = nPts - 1; t >= 0; t--) d += `L${x(t).toFixed(2)},${y(lo[t]).toFixed(2)}`;
      d += "Z";
      el("path", { d, fill, stroke: "none" }, svg);
    };
    if (model.showBands.p99) bandArea(1, 99, cssVar(root, "--band-99"));
    if (model.showBands.p95) bandArea(5, 95, cssVar(root, "--band-95"));
    if (model.showBands.p50) bandArea(25, 75, cssVar(root, "--band-50"));

    const linePath = (arr) => {
      let d = `M${x(0).toFixed(2)},${y(arr[0]).toFixed(2)}`;
      for (let t = 1; t < arr.length; t++) d += `L${x(t).toFixed(2)},${y(arr[t]).toFixed(2)}`;
      return d;
    };

    // ---- money paid in (categorical slot 2)
    el("path", {
      d: linePath(model.paidIn), fill: "none",
      stroke: cssVar(root, "--series-2"), "stroke-width": 2,
      "stroke-linejoin": "round",
    }, svg);

    // ---- a real historical decade, if one is selected (slot 3)
    if (model.overlay) {
      el("path", {
        d: linePath(model.overlay.path), fill: "none",
        stroke: cssVar(root, "--series-3"), "stroke-width": 2,
        "stroke-linejoin": "round",
      }, svg);
    }

    // ---- the median, on top: darkest step of the same blue as the bands
    el("path", {
      d: linePath(model.bands[50]), fill: "none",
      stroke: cssVar(root, "--median"), "stroke-width": 2.5,
      "stroke-linejoin": "round",
    }, svg);

    // ---- selective direct labels at the right edge, nudged apart on collision
    if (m.right > 60) {
      const labels = [
        { v: model.bands[50][nPts - 1], text: euroCompact(model.bands[50][nPts - 1]), color: cssVar(root, "--median") },
        { v: model.paidIn[nPts - 1], text: euroCompact(model.paidIn[nPts - 1]), color: cssVar(root, "--series-2") },
      ];
      if (model.showBands.p99) {
        labels.push({ v: model.bands[99][nPts - 1], text: euroCompact(model.bands[99][nPts - 1]), color: cssVar(root, "--text-muted") });
        labels.push({ v: model.bands[1][nPts - 1], text: euroCompact(model.bands[1][nPts - 1]), color: cssVar(root, "--text-muted") });
      }
      labels.sort((a, b) => b.v - a.v);
      let prevY = -Infinity;
      for (const L of labels) {
        let py = y(L.v) + 4;
        if (py - prevY < 14) py = prevY + 14;
        prevY = py;
        el("text", {
          class: "end-label", x: m.left + iw + 6, y: py, fill: L.color,
        }, svg).textContent = L.text;
      }
    }

    // ---- hover layer
    const gHover = el("g", { "pointer-events": "none" }, svg);
    const cross = el("line", {
      class: "axisline", y1: m.top, y2: m.top + ih, opacity: 0,
      stroke: cssVar(root, "--text-secondary"),
    }, gHover);
    const dots = [];
    const mkDot = (color) =>
      el("circle", {
        r: 4.5, fill: color, stroke: cssVar(root, "--surface-1"),
        "stroke-width": 2, opacity: 0,
      }, gHover);
    dots.push(mkDot(cssVar(root, "--median")));
    dots.push(mkDot(cssVar(root, "--series-2")));
    if (model.overlay) dots.push(mkDot(cssVar(root, "--series-3")));

    const hit = el("rect", {
      x: m.left, y: m.top, width: iw, height: ih, fill: "transparent",
      style: "cursor:crosshair",
    }, svg);

    function show(idx) {
      hoverIdx = idx;
      const px = x(idx);
      cross.setAttribute("x1", px);
      cross.setAttribute("x2", px);
      cross.setAttribute("opacity", 0.45);

      const series = [
        { k: t("js.chart.median"), v: model.bands[50][idx], c: cssVar(root, "--median") },
        { k: t("js.chart.paidIn"), v: model.paidIn[idx], c: cssVar(root, "--series-2") },
      ];
      if (model.overlay) {
        series.push({ k: model.overlay.label, v: model.overlay.path[idx], c: cssVar(root, "--series-3") });
      }
      series.forEach((s, i) => {
        dots[i].setAttribute("cx", px);
        dots[i].setAttribute("cy", y(s.v));
        dots[i].setAttribute("opacity", 1);
      });

      const yr = Math.floor(idx / 12);
      const mo = idx % 12;
      const when = idx === 0
        ? t("js.chart.today")
        : mo
          ? t("js.chart.yearMonth", { y: yr, m: mo })
          : t("js.chart.year", { y: yr });

      let rows = "";
      if (model.showBands.p99) {
        rows += `<div class="tt-row"><span class="tt-k"><span class="tt-line" style="background:${cssVar(root, "--band-99")};height:9px;border-radius:2px"></span>${t("js.chart.range99")}</span><span class="tt-v">${euroCompact(model.bands[1][idx])} – ${euroCompact(model.bands[99][idx])}</span></div>`;
      }
      if (model.showBands.p95) {
        rows += `<div class="tt-row"><span class="tt-k"><span class="tt-line" style="background:${cssVar(root, "--band-95")};height:9px;border-radius:2px"></span>${t("js.chart.range95")}</span><span class="tt-v">${euroCompact(model.bands[5][idx])} – ${euroCompact(model.bands[95][idx])}</span></div>`;
      }
      for (const s of series) {
        rows += `<div class="tt-row"><span class="tt-k"><span class="tt-line" style="background:${s.c}"></span>${s.k}</span><span class="tt-v">${euro(s.v)}</span></div>`;
      }
      tip.innerHTML = `<div class="tt-head">${when} &middot; ${model.unitLabel}</div>${rows}`;
      tip.classList.add("on");

      const tw = tip.offsetWidth || 210;
      let left = px + 14;
      if (left + tw > W - 4) left = px - tw - 14;
      tip.style.left = `${Math.max(2, left)}px`;
      tip.style.top = `${Math.max(2, m.top + 4)}px`;

      live.textContent = t("js.chart.live", {
        when,
        med: euro(model.bands[50][idx]),
        lo: euro(model.bands[1][idx]),
        hi: euro(model.bands[99][idx]),
      });
    }

    function hide() {
      hoverIdx = null;
      cross.setAttribute("opacity", 0);
      for (const d of dots) d.setAttribute("opacity", 0);
      tip.classList.remove("on");
    }

    const idxFromEvent = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.round(((px - m.left) / iw) * months);
      return Math.max(0, Math.min(months, i));
    };

    hit.addEventListener("pointermove", (ev) => show(idxFromEvent(ev)));
    hit.addEventListener("pointerdown", (ev) => show(idxFromEvent(ev)));
    hit.addEventListener("pointerleave", hide);

    // keyboard access to the same readout
    svg.setAttribute("tabindex", "0");
    svg.setAttribute("aria-label", t("js.chart.aria", {
      years: yearsTotal,
      med: euro(model.bands[50][nPts - 1]),
      lo: euro(model.bands[1][nPts - 1]),
      hi: euro(model.bands[99][nPts - 1]),
    }));
    svg.onkeydown = (ev) => {
      const cur = hoverIdx === null ? months : hoverIdx;
      if (ev.key === "ArrowRight") { show(Math.min(months, cur + (ev.shiftKey ? 12 : 1))); ev.preventDefault(); }
      else if (ev.key === "ArrowLeft") { show(Math.max(0, cur - (ev.shiftKey ? 12 : 1))); ev.preventDefault(); }
      else if (ev.key === "Home") { show(0); ev.preventDefault(); }
      else if (ev.key === "End") { show(months); ev.preventDefault(); }
      else if (ev.key === "Escape") hide();
    };
    svg.onblur = hide;
  }

  const ro = new ResizeObserver(() => render());
  ro.observe(root);

  return {
    update(next) { model = next; render(); },
    destroy() { ro.disconnect(); },
  };
}

// ============================================================== the histogram

/**
 * Distribution of real historical outcomes. Bars are magnitude, so one hue.
 *
 * @param {HTMLElement} root
 * model = { items: [{startYear, endYear, final}], years, unitLabel }
 */
export function createHistogram(root) {
  root.classList.add("chart-box");
  const svg = el("svg", { class: "chart", role: "img" });
  root.appendChild(svg);
  const tip = document.createElement("div");
  tip.className = "tooltip";
  root.appendChild(tip);

  let model = null;

  function render() {
    if (!model || !model.items.length) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const W = Math.max(320, root.clientWidth || 640);
    const H = Math.round(Math.min(320, Math.max(220, W * 0.36)));
    const m = { top: 14, right: 12, bottom: 46, left: 40 };
    const iw = W - m.left - m.right;
    const ih = H - m.top - m.bottom;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);

    const vals = model.items.map((d) => d.final);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const nBins = Math.max(8, Math.min(26, Math.round(iw / 34)));
    const step = (hi - lo) / nBins || 1;
    const bins = Array.from({ length: nBins }, (_, i) => ({
      lo: lo + i * step, hi: lo + (i + 1) * step, items: [],
    }));
    for (const d of model.items) {
      let k = Math.floor((d.final - lo) / step);
      if (k >= nBins) k = nBins - 1;
      if (k < 0) k = 0;
      bins[k].items.push(d);
    }
    const maxCount = Math.max(...bins.map((b) => b.items.length));
    const { ticks, top } = niceTicks(maxCount, 4);

    const y = (c) => m.top + ih - (c / top) * ih;
    const bw = iw / nBins;

    const gGrid = el("g", {}, svg);
    for (const tv of ticks) {
      el("line", {
        class: "gridline", x1: m.left, x2: m.left + iw, y1: y(tv), y2: y(tv),
      }, gGrid);
      el("text", {
        class: "tick-label", x: m.left - 8, y: y(tv) + 4, "text-anchor": "end",
      }, gGrid).textContent = tv;
    }

    const fill = cssVar(root, "--series-1");
    bins.forEach((b, i) => {
      const c = b.items.length;
      if (!c) return;
      // 2px surface gap between adjacent bars, 4px rounded top, flat baseline
      const bx = m.left + i * bw + 1;
      const w = Math.max(1, bw - 2);
      const h = ih - (y(c) - m.top);
      const r = Math.min(4, w / 2, h);
      const yy = y(c);
      const d =
        `M${bx},${m.top + ih}L${bx},${yy + r}` +
        `Q${bx},${yy} ${bx + r},${yy}L${bx + w - r},${yy}` +
        `Q${bx + w},${yy} ${bx + w},${yy + r}L${bx + w},${m.top + ih}Z`;
      const p = el("path", { d, fill, style: "cursor:pointer" }, svg);

      p.addEventListener("pointerenter", () => {
        const names = b.items
          .slice(0, 6)
          .map((it) => `${it.startYear}–${it.endYear}`)
          .join(", ");
        tip.innerHTML =
          `<div class="tt-head">${euroCompact(b.lo)} – ${euroCompact(b.hi)}</div>` +
          `<div class="tt-row"><span class="tt-k">${t("js.hist.tipCount")}</span><span class="tt-v">${c}</span></div>` +
          `<div class="tt-row"><span class="tt-k" style="max-width:210px;white-space:normal">${names}${b.items.length > 6 ? t("js.hist.tipMore", { n: b.items.length - 6 }) : ""}</span></div>`;
        tip.classList.add("on");
        const tw = tip.offsetWidth || 200;
        let left = bx + bw / 2 - tw / 2;
        left = Math.max(2, Math.min(W - tw - 2, left));
        tip.style.left = `${left}px`;
        tip.style.top = `${Math.max(2, yy - 8)}px`;
      });
      p.addEventListener("pointerleave", () => tip.classList.remove("on"));
    });

    el("line", {
      class: "axisline", x1: m.left, x2: m.left + iw, y1: m.top + ih, y2: m.top + ih,
    }, svg);

    // x labels at the ends and the middle only — a label per bin would be noise
    const xat = (v) => m.left + ((v - lo) / (hi - lo || 1)) * iw;
    for (const v of [lo, (lo + hi) / 2, hi]) {
      el("text", {
        class: "tick-label", x: Math.max(m.left + 12, Math.min(m.left + iw - 12, xat(v))),
        y: m.top + ih + 17, "text-anchor": "middle",
      }, svg).textContent = euroCompact(v);
    }
    el("text", {
      class: "axis-title", x: m.left + iw / 2, y: H - 6, "text-anchor": "middle",
    }, svg).textContent = t("js.hist.xTitle", {
      years: model.years,
      unit: model.unitLabel,
    });

    svg.setAttribute("aria-label", t("js.hist.aria", {
      n: model.items.length,
      years: model.years,
      lo: euro(lo),
      hi: euro(hi),
    }));
  }

  const ro = new ResizeObserver(() => render());
  ro.observe(root);

  return {
    update(next) { model = next; render(); },
    destroy() { ro.disconnect(); },
  };
}
