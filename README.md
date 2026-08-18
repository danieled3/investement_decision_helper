# Investment Decision Helper

**How much could my money become?** — a single-page web app that takes a split
between a world share ETF (the risky part) and a euro government bond ETF (the
safer part), and shows what history says could happen to it: the middle outcome,
the good outcomes, the bad ones, the lowest point along the way, and what the
taxman takes.

👉 **[Open the app](https://danieled3.github.io/investement_decision_helper/)**

It is deliberately written for somebody who does not know much about finance:
the whole first screen is your plan on the left and the answer — the amount, the
gain, the worst and best cases, the average, the chart — on the right, so
changing a number and seeing what it does needs no scrolling. Everything past
that is a box you can open, every number is explained in plain words, and there
is a glossary of every term used. Available in **English and Italian**.

---

## What it does

You enter an initial amount, a monthly amount, how those are split between the
two funds, and how many years you are investing for. It then answers:

- **The middle outcome** — what happened in the typical scenario, and beside it
  the **gain**: that amount minus everything you paid in, in euros and per cent.
- **The range** — the 1st, 5th, 25th, 75th, 95th and 99th percentile of outcomes,
  drawn as a fan chart, so you see the whole spread and not just one line. The
  worst 1 in 100, the average of every path and the best 1 in 100 lead the card.
- **The worst moment, not just the worst ending** — the lowest the pot fell to at
  any point along the way, and how far below the money you had paid in it went.
- **Future euros or today's buying power** — the page opens in **future euros**,
  the amount a statement would show on the day, because that is the number people
  expect to read; one click converts everything to what the money would actually
  buy at today's prices, without re-simulating. The switch sits next to your plan
  on the first screen, not behind an "advanced" heading, and a line underneath
  says in words what the chosen unit means, since a label alone cannot carry that
  difference.
- **A consultant's fee, if you pay one** — a percentage of *everything you hold*,
  taken out once a year. Tick the box next to your plan and every figure on the
  page becomes the after-fee one; its own section says how much went to them on
  average, what share of the profit that is, and — as plain arithmetic rather than
  a simulation — how much it takes off money invested today.
- **Tax** — Italy or the UK, computed properly (see below), or switched off to
  show the gross figures.
- **What actually happened** — every real historical window of that length,
  1900 onwards, listed so you can look up any individual decade.

The answer card is the whole app for most readers. It leads with the amount and
the gain, then the three numbers people actually ask for — the worst 1 in 100,
the average, the best 1 in 100 — then a quieter row: money paid in, the lowest
and highest points along the way, the chance of ending up behind. The chart is
under them, on the same screen. Move any amount and all of it moves. The
reasoning, the percentile table, the tax detail, the historical windows, the
method and the glossary are all collapsed boxes underneath.

Below 900px wide the two columns stack, plan first; on a phone the sleeve
explanations step aside and the two amounts sit side by side, so the answer is
one short scroll away rather than three.

## Where the numbers come from

`data/returns.json` holds 126 years of annual **real** (inflation-adjusted) total
returns, 1900–2025, built by `data-build/build_dataset.py`:

| Series | 1900–2020 | 2021–2025 |
|---|---|---|
| World shares | Jordà–Schularick–Taylor Macrohistory DB R6, GDP-weighted across the 16 advanced economies that report equity data | iShares Core MSCI World UCITS ETF (IWDA.AS), EUR |
| Euro government bonds | JST R6, GDP-weighted across 8 euro-area member states | iShares Core EUR Govt Bond UCITS ETF (IEGA.AS), EUR |
| Inflation | JST CPI, same GDP weights | Eurostat `prc_hicp_aind`, euro-area HICP |

Weights are **lagged** real GDP (`rgdpmad × pop`), renormalised each year over the
countries actually reporting, so there is no look-ahead bias. GDP weights are used
because long-run market-capitalisation weights do not exist back to 1900.

Long-run figures that fall out of that dataset: shares +6.2% a year real with 15.0%
volatility, euro government bonds −0.9% a year real with 10.7% volatility (the two
world wars and the inflations that followed them are brutal for bonds), correlation
+0.27, worst single year −40.1% for shares and −39.8% for bonds.

## How the simulation works

Two engines, shown side by side:

1. **Stationary block bootstrap** (Politis & Romano, 1994) — the main engine.
   It resamples *blocks* of consecutive years rather than single years, with
   geometrically-distributed block lengths, so momentum, crashes and multi-year
   inflations survive the resampling. Equity and bond years are always drawn
   **jointly**, which preserves the correlation between them.
2. **Historical overlay** — every actual window of the chosen length in the data
   (1900–2015 for a 10-year horizon, and so on), computed exactly, no resampling.
   If the bootstrap disagreed with these, the bootstrap would be wrong.

Inside a year, monthly paths are drawn with a **Brownian bridge** pinned to that
year's exact annual return, so monthly contributions are priced sensibly without
inventing extra annual variance. Randomness is a seeded `mulberry32` + Box–Muller,
so every run is reproducible from the URL.

## Tax

`js/tax.js` is the whole country-specific surface — adding a country means adding
one entry to `REGIMES`. Tax is computed **inside** the simulation, because a charge
paid in year 3 stops compounding for the remaining years, and always on the
**nominal** gain, because that is what tax authorities charge. Three channels:

| | Italy | UK |
|---|---|---|
| Yearly charge on the whole balance | 0.20% (imposta di bollo / IVAFE) | — |
| Yearly tax on fund income | only if the ETF distributes | yes — reporting-fund excess reportable income, at dividend/interest rates with their allowances |
| Tax on the gain at sale | 26%, reduced to 12.5% on white-list government bonds | CGT 18% / 24% by band, £3,000 annual exempt amount |
| Losses on one fund offset gains on the other | **no** (*redditi di capitale* vs *redditi diversi*) | yes |
| Tax-free wrapper | — | ISA |

The country you pick changes **only** the tax. The two funds are the same wherever
you live, so nothing else on the page depends on it.

Every figure in the chart — the bands, the lowest point, the drawdowns — is the
**after-tax liquidation value**: what you would actually keep if you sold on that
day.

## Languages

The page is written in English and translated into Italian. `js/i18n.js` holds the
machinery and every language-dependent formatter; `js/strings.js` holds the words.

The English is not duplicated in the dictionary: prose lives in `index.html` marked
with `data-i18n="key"` and is harvested from the document itself, so the English
page cannot be broken by a dictionary typo. Only sentences built in JavaScript
(tile notes, tax rules, tooltips) carry both languages, under `js.*` keys.

Numbers switch with the language — Italian writes `35,7%` — but thousands are
grouped with a narrow no-break space in both, because `1.234` means two different
things to the two readers. The choice is remembered, and it travels in the shared
link as `#l=it`.

## Running it locally

No build step, no dependencies, no CDN. It is ES modules and one Web Worker.

```sh
npm run serve      # python3 -m http.server 8123
open http://127.0.0.1:8123/
```

A file:// URL will not work — module workers need a real origin.

## Deploying

There is nothing to build, so GitHub Pages serves the repository as it stands:
**Settings → Pages → Source: Deploy from a branch → `main` → `/ (root)`**. The
committed `.nojekyll` stops Jekyll from touching the `js/` and `data/` folders.
A minute later the app is live at the link at the top of this file.

## Tests

```sh
npm test           # node tests/verify.mjs  →  125 checks
```

`tests/verify.mjs` is a correctness proof, not a smoke test. Among other things it
checks the bootstrap against closed-form results in constant-return worlds, that
the block bootstrap reproduces the historical mean and variance, that percentiles
are monotone at every month, that the real/nominal conversion is exact, and — for
tax — that every regime matches a hand-computed answer, that the after-tax value
never exceeds the gross value anywhere, that Italy's no-loss-offset rule really
costs what it should, that a UK ISA is identical to no tax, and that
`gross − net > total tax paid` (the missing part being the compounding the tax
destroyed). The last section checks the translations: that nothing is missing, that
both languages fill the same placeholders, and that every `<span id>` the code
writes a number into survives into the Italian — a lost id would silently blank a
figure on the page rather than fail loudly.

The consultant's fee gets its own section of the suite: that a zero fee changes
nothing, that 1% a year for ten years leaves exactly `(1 − fee)^years` of the pot,
that the total handed over matches a year-by-year sum done by hand, that the pot
falls by *more* than the fees (the compounding they destroyed), that both sleeves
are charged equally so the split is untouched, that the average bill exceeds the
median one, and that the Monte Carlo engine and the historical replay agree on the
fee to the cent.

`tests/calibrate_blocks.mjs` picks the bootstrap's mean block length by matching
the variance of real historical windows.

## Layout

```
index.html                 the page, and all the explanation
css/styles.css             styles, light and dark
js/app.js                  UI controller, URL state, rendering
js/engine.js               the simulation: bootstrap, bridge, percentiles, tax accounting
js/tax.js                  the whole country-specific tax model, rates included
js/chart.js                the fan chart and the histogram, hand-rolled SVG
js/worker.js               runs the engine off the main thread
js/i18n.js                 language switching and every localised formatter
js/strings.js              the Italian, and the JavaScript-built sentences
data/returns.json          the 126-year dataset the app loads
data-build/                the script that builds it, and the JST source file
tests/                     the proof suite
```

## Not financial or tax advice

This is a model of the past, not a forecast. Rates are those in force for the 2026
Italian year and the 2026/27 UK year. Your own position can differ. The page lists
what is deliberately *not* included.

MIT licensed.
