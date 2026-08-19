#!/usr/bin/env python3
"""
Build the historical return dataset used by the Investment Decision Helper.

Output: ../data/returns.json  — annual REAL (inflation-adjusted) total returns for
  1) a global equity portfolio  ("world ETF" proxy)
  2) a euro-area government bond portfolio ("euro bond ETF" proxy, kept for the
     historical tables and for validating the held-to-maturity model)
  plus euro-area consumer price inflation, so the app can show nominal euros too,
  plus the euro-area government bond YIELD CURVE (a short anchor and the 10-year
  point), which is what the app actually simulates the bond sleeve with.

Why the yields are here
-----------------------
The app does not hold a bond ETF. It buys ONE government bond, holds it to
maturity, and buys another when it matures. That is a completely different risk:
a bond held to maturity has no price risk at all, because you never sell it — you
get the face value back. What you lock in on the day you buy is the YIELD, and
what the money is worth at the end depends only on inflation over the holding
period. So the simulation needs the yield that was on offer in each historical
year, not the total return of a fund that marks to market every day.

Both endpoints of the curve are shipped so the app can price any maturity the
user picks; see MATURITY INTERPOLATION below.

Sources
-------
1900-2020  Jordà-Schularick-Taylor Macrohistory Database, release 6.
           Òscar Jordà, Moritz Schularick, Alan M. Taylor (2017),
           "Macrofinancial History and the New Business Cycle Facts".
           Fields: eq_tr (equity total return), bond_tr (long govt bond total
           return), bond_rate (long govt bond YIELD), stir (short-term interest
           rate, per cent), cpi, rgdpmad (real GDP p.c.), pop. All nominal,
           local currency. https://www.macrohistory.net/database/

2021-2025  Equity : iShares Core MSCI World UCITS ETF (IWDA.AS), EUR, accumulating.
           Bonds  : iShares Core EUR Govt Bond UCITS ETF (IEGA.AS), EUR,
                    dividend-adjusted close (total return).
           Both from Yahoo Finance daily adjusted closes, last trading day of year.
           Inflation: Eurostat prc_hicp_aind, euro-area annual average HICP index.
           Yields  : Eurostat irt_lt_mcby_a (euro-area 10-year benchmark
                    government bond yield, annual average) and irt_st_a with
                    int_rt=IRT_M3 (euro-area 3-month rate, annual average).

Method
------
* Real return per country/year: (1 + nominal_total_return) / (1 + cpi_inflation) - 1
* World equity  = weighted mean of real equity returns across all JST countries
                  that report equity data (16 of 18; Canada & Ireland have none).
* Euro bonds    = weighted mean of real bond returns across euro-area members.
* Weights       = LAGGED real GDP (rgdpmad * pop), renormalised each year over the
                  countries actually reporting. Lagged so no look-ahead bias.
                  GDP is used because long-run market-capitalisation weights do not
                  exist back to 1900; this is standard in long-horizon studies.
* Inflation     = same GDP-weighted mean of euro-area country CPI inflation.
* Yields        = same GDP-weighted mean of euro-area country yields. Weighting a
                  yield is not the same thing as weighting a return, but a GDP
                  weight across eight neighbouring sovereigns is the same kind of
                  average an actual euro benchmark index takes, and it is the only
                  way to get one euro-area number back to 1900.

MATURITY INTERPOLATION
----------------------
JST gives two points on the curve: a short rate (`stir`, treated as the 0.25-year
point) and the long government bond yield (`bond_rate`, treated as the 10-year
point). The app lets the user pick 1, 2, 3, 5 or 10 years, so the yield for
maturity M is interpolated LINEARLY IN MATURITY between those two:

    y(M) = y_short + (M - 0.25) / (10 - 0.25) * (y_long - y_short)

That is an approximation of the shape of the curve between the two ends, and it
is done in the app rather than here so the interpolation is visible in the code
the user can read. M = 10 therefore uses the real long-yield data unchanged, and
short maturities inherit the real short-rate data; only the middle is modelled.

WHY A DISCOUNT FACTOR, NOT AN INFLATION RATE
--------------------------------------------
The bond the app holds earns a fixed nominal yield; what erodes it is inflation.
The naive way — divide one euro-area average yield by one euro-area average
inflation — is WRONG, because the euro-area inflation average is dominated by the
1923 German hyperinflation and would show every euro bond losing ~100% that year,
when in fact only German bonds were wiped out. So the real return is formed the
same way the equity series is: per country, then GDP-weighted. Algebraically, for
a locked nominal yield y,

    weighted real return = SUM_c w_c * [ (1+y) / (1+infl_c) - 1 ]
                         = (1+y) * SUM_c w_c/(1+infl_c)  -  1
                         = (1+y) * D  -  1

so the per-year number that answers it is the GDP-WEIGHTED INFLATION DISCOUNT
FACTOR D = SUM_c w_c/(1+infl_c). A hyperinflating member contributes ~0 to D at
its own weight, which caps the damage at that weight instead of dragging the
whole average to zero. `infl_discount` below is D. (A single weighted yield
replaces the per-country yields, which is exact up to the tiny covariance between
yield spreads and inflation across neighbouring sovereigns.)

WHAT D IS AND IS NOT USED FOR
-----------------------------
D answers a HISTORICAL question: what did a bond locking yield y actually earn in
real terms, given the inflation that really happened that year. The
`*_bond_hold_real_*` statistics printed and shipped below are computed that way,
and over 1900-2025 they are dominated by the interwar inflations — which is the
honest historical answer, and the reason the euro figure is negative.

The APP does not deflate by D. It cannot coherently: the page already asks the
user for one assumed inflation rate and uses it to convert between "today's
buying power" and "future euros", so deflating the bond by historical inflation
as well would count inflation twice — and would produce the impossible result of
a NOMINAL loss on a bond whose cash flows are fixed. Held to maturity the nominal
return IS the locked yield; the engine's real return is therefore
(1+y)/(1+assumed inflation)-1, and the bond carries no inflation *risk* in the
model, only reinvestment risk on maturities shorter than the horizon (plus
default, which the model does not price at all). See js/engine.js.

Run:  python3 build_dataset.py
"""

import json
import urllib.request
import datetime as dt
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).parent
OUT = HERE.parent / "data" / "returns.json"

# Euro-area members used for the "euro government bond" proxy.
# JST has no return data for Ireland, so it is absent despite being a member.
EURO_AREA = [
    "Germany", "France", "Italy", "Spain", "Netherlands",
    "Belgium", "Portugal", "Finland",
]

# ---------------------------------------------------------------- JST 1900-2020


def weighted_series(df, value_col, countries=None):
    """GDP-weighted mean of `value_col` per year, renormalised over reporters."""
    d = df if countries is None else df[df.country.isin(countries)]
    rows = []
    for year, grp in d.groupby("year"):
        g = grp[grp[value_col].notna() & grp.w.notna() & (grp.w > 0)]
        if g.empty:
            continue
        w = g.w / g.w.sum()
        rows.append(
            {
                "year": int(year),
                value_col: float((g[value_col] * w).sum()),
                "n": int(len(g)),
            }
        )
    return pd.DataFrame(rows)


def build_jst():
    df = pd.read_excel(HERE / "JSTdatasetR6.xlsx", sheet_name="Sheet1")

    # Real GDP level (comparable across countries): GDP p.c. in 1990 Int$ x population
    df["gdp_real"] = df.rgdpmad * df["pop"]

    df = df.sort_values(["country", "year"])
    # Inflation from CPI, and LAGGED weight (no look-ahead)
    df["infl"] = df.groupby("country").cpi.pct_change(fill_method=None)
    df["w"] = df.groupby("country").gdp_real.shift(1)

    # Real total returns
    df["eq_real"] = (1 + df.eq_tr) / (1 + df.infl) - 1
    df["bd_real"] = (1 + df.bond_tr) / (1 + df.infl) - 1

    # Nominal yields, as decimals. `bond_rate` is already a decimal in JST;
    # `stir` is quoted in per cent. Negative short rates are real (2015-2021), so
    # they are left alone rather than floored.
    df["y_long"] = df.bond_rate
    df["y_short"] = df.stir / 100.0

    # The inflation discount factor 1/(1+infl) is what gets GDP-weighted, not the
    # inflation rate itself — see WHY A DISCOUNT FACTOR above.
    df["disc"] = 1.0 / (1.0 + df.infl)

    d = df[(df.year >= 1900) & (df.year <= 2020)]

    eq = weighted_series(d, "eq_real").rename(columns={"n": "n_eq"})
    bd = weighted_series(d, "bd_real", EURO_AREA).rename(columns={"n": "n_bd"})
    inf = weighted_series(d, "infl", EURO_AREA).rename(columns={"n": "n_inf"})
    yl = weighted_series(d, "y_long", EURO_AREA).rename(columns={"n": "n_yl"})
    ys = weighted_series(d, "y_short", EURO_AREA).rename(columns={"n": "n_ys"})
    disc = weighted_series(d, "disc", EURO_AREA).rename(columns={"n": "n_disc"})

    euro = (
        eq.merge(bd, on="year")
        .merge(inf, on="year")
        .merge(yl, on="year")
        .merge(ys, on="year")
        .merge(disc, on="year")
    )

    # UK is a single country, so "GDP-weighting" is a no-op: its own yields, its
    # own inflation. World equity is shared, so the UK frame carries only what the
    # euro-area frame cannot supply — a sterling bond and sterling inflation.
    uk = df[(df.country == "UK") & (df.year >= 1900) & (df.year <= 2020)][
        ["year", "infl", "disc", "y_long", "y_short"]
    ].copy()
    uk["year"] = uk.year.astype(int)

    return euro, uk, df


# ------------------------------------------------------------ recent 2021-2025


def yahoo_annual(symbol):
    """Calendar-year total return from daily dividend-adjusted closes."""
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
        "?range=20y&interval=1d&events=div%7Csplit"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    res = json.load(urllib.request.urlopen(req, timeout=60))["chart"]["result"][0]
    ts = res["timestamp"]
    adj = res["indicators"]["adjclose"][0]["adjclose"]

    last = {}
    for t, a in zip(ts, adj):
        if a is None:
            continue
        date = dt.datetime.fromtimestamp(t, dt.UTC).date()
        last[date.year] = (date, a)

    ret = {}
    for y in sorted(last):
        if y - 1 in last:
            ret[y] = last[y][1] / last[y - 1][1] - 1
    # Drop any incomplete current year (needs a late-December observation)
    today = dt.datetime.now(dt.UTC).date()
    for y in list(ret):
        if y == today.year and not (last[y][0].month == 12 and last[y][0].day >= 27):
            del ret[y]
    return ret, last


def eurostat_series(dataset, geo="EA", extra=""):
    """One annual Eurostat series for a geography, {year: value} in native units."""
    url = (
        "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/"
        f"{dataset}?format=JSON&lang=EN&geo={geo}&sinceTimePeriod=2015{extra}"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    js = json.load(urllib.request.urlopen(req, timeout=60))
    idx = js["dimension"]["time"]["category"]["index"]
    vals = {int(y): js["value"].get(str(i)) for y, i in idx.items()}
    # Eurostat sends 0 for a not-yet-published cell as often as it omits it; a
    # 0.00% ten-year yield is never real, so drop those too.
    return {y: v for y, v in vals.items() if v is not None and v != 0}


def eurostat_yields(geo="EA"):
    """10-year benchmark yield and 3-month rate for a geography, as decimals."""
    lng = eurostat_series("irt_lt_mcby_a", geo)
    sht = eurostat_series("irt_st_a", geo, "&int_rt=IRT_M3")
    return ({y: v / 100.0 for y, v in lng.items()},
            {y: v / 100.0 for y, v in sht.items()})


def eurostat_hicp(geo="EA"):
    """Annual average HICP index for a geography -> annual inflation rate."""
    vals = eurostat_series(
        "prc_hicp_aind", geo, "&unit=INX_A_AVG&coicop=CP00"
    )
    infl = {}
    for y in sorted(vals):
        if y - 1 in vals:
            infl[y] = vals[y] / vals[y - 1] - 1
    return infl


def worldbank_cpi_inflation(iso3, first=2015, last=2025):
    """Annual CPI inflation for a country from the World Bank. Eurostat's HICP
    series for the UK stops in 2019 (Brexit), but UK gilt yields run to 2024, so
    the recent UK real return needs a CPI source that is still current."""
    url = (f"https://api.worldbank.org/v2/country/{iso3}/indicator/FP.CPI.TOTL"
           f"?format=json&date={first}:{last}&per_page=100")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    rows = json.load(urllib.request.urlopen(req, timeout=60))[1]
    idx = {int(r["date"]): r["value"] for r in rows if r["value"] is not None}
    return {y: idx[y] / idx[y - 1] - 1 for y in sorted(idx) if y - 1 in idx}


# ------------------------------------------------------------------------ main


def main():
    euro, uk, raw = build_jst()
    print(f"JST rows {euro.year.min()}-{euro.year.max()}  ({len(euro)} years)")
    print(f"  countries per year: equity {euro.n_eq.min()}-{euro.n_eq.max()}, "
          f"euro bonds {euro.n_bd.min()}-{euro.n_bd.max()}")

    # Yahoo rate-limits hard (HTTP 429) and it is the only source here with no
    # archive behind it. Losing it must not silently rewrite the recent years with
    # something worse, so a failed fetch falls back to the real returns already in
    # the last build and says so loudly.
    prior = json.loads(OUT.read_text()) if OUT.exists() else None
    try:
        eq_nom, _ = yahoo_annual("IWDA.AS")
        bd_nom, _ = yahoo_annual("IEGA.AS")
        yahoo_ok = True
    except Exception as exc:  # noqa: BLE001 - any failure means "use the fallback"
        print(f"\n!! Yahoo unavailable ({exc}); reusing the recent years already "
              f"in {OUT.name}")
        eq_nom, bd_nom, yahoo_ok = {}, {}, False
        if prior is None:
            raise SystemExit("no previous returns.json to fall back on")

    infl = eurostat_hicp("EA")
    y_long_recent, y_short_recent = eurostat_yields("EA")
    # UK gilt yields are still published on Eurostat; UK consumer prices are not
    # (Brexit), so those come from the World Bank instead.
    uk_yl_recent, uk_ys_recent = eurostat_yields("UK")
    uk_infl_recent = worldbank_cpi_inflation("GBR")

    if yahoo_ok:
        recent_years = [y for y in range(2021, 2026)
                        if y in eq_nom and y in bd_nom and y in infl]
    else:
        recent_years = [y for y in range(2021, 2026) if y in prior["years"]]
    print(f"Recent years spliced: {recent_years}")
    print(f"UK recent yields available: {sorted(uk_yl_recent)}")

    # ---- validate the splice on the overlap where BOTH sources exist ----
    print("\n=== SPLICE VALIDATION: JST vs ETF, real returns, overlap ===")
    print(f"{'year':>5} {'eq JST':>9} {'eq ETF':>9} | {'bd JST':>9} {'bd ETF':>9}")
    ov_eq_j, ov_eq_e, ov_bd_j, ov_bd_e = [], [], [], []
    for y in sorted(set(eq_nom) & set(bd_nom) & set(infl) & set(euro.year)):
        r = euro[euro.year == y].iloc[0]
        e_etf = (1 + eq_nom[y]) / (1 + infl[y]) - 1
        b_etf = (1 + bd_nom[y]) / (1 + infl[y]) - 1
        print(f"{y:>5} {r.eq_real:>8.1%} {e_etf:>9.1%} | {r.bd_real:>8.1%} {b_etf:>9.1%}")
        ov_eq_j.append(r.eq_real); ov_eq_e.append(e_etf)
        ov_bd_j.append(r.bd_real); ov_bd_e.append(b_etf)
    if ov_eq_j:
        print(f"\n  equity  mean JST {np.mean(ov_eq_j):+.2%} vs ETF {np.mean(ov_eq_e):+.2%}"
              f"   corr {np.corrcoef(ov_eq_j, ov_eq_e)[0,1]:.3f}")
        print(f"  bonds   mean JST {np.mean(ov_bd_j):+.2%} vs ETF {np.mean(ov_bd_e):+.2%}"
              f"   corr {np.corrcoef(ov_bd_j, ov_bd_e)[0,1]:.3f}")

    # ---- assemble the shared, world-equity columns ----
    years, eq, bd, cpi, src = [], [], [], [], []
    for _, r in euro.iterrows():
        years.append(int(r.year)); eq.append(r.eq_real); bd.append(r.bd_real)
        cpi.append(r.infl); src.append("jst")
    prior_idx = {y: i for i, y in enumerate(prior["years"])} if prior else {}
    for y in recent_years:
        years.append(y)
        if yahoo_ok:
            eq.append((1 + eq_nom[y]) / (1 + infl[y]) - 1)
            bd.append((1 + bd_nom[y]) / (1 + infl[y]) - 1)
            cpi.append(infl[y])
        else:
            i = prior_idx[y]
            eq.append(prior["equity_real"][i]); bd.append(prior["bond_real"][i])
            cpi.append(prior["inflation"][i])
        src.append("etf")

    eq = np.array(eq); bd = np.array(bd); cpi = np.array(cpi)

    def fill_forward(arr, name):
        """Carry the last known value over any gap; back-fill a leading gap."""
        holes = int(np.isnan(arr).sum())
        if holes:
            print(f"  !! {holes} missing {name} year(s) filled by carrying forward")
        last = np.nan
        for i in range(len(arr)):
            if np.isnan(arr[i]):
                arr[i] = last
            else:
                last = arr[i]
        first = next((v for v in arr if not np.isnan(v)), 0.0)
        arr[np.isnan(arr)] = first
        return arr

    def build_region(name, jst_frame, jst_geo_infl, yl_recent, ys_recent, geo_infl_recent):
        """One region's bond curve + inflation discount, aligned to `years`.

        `jst_frame` is a DataFrame indexed by year with y_long, y_short, disc.
        The recent tail (2021+) comes from Eurostat; where a region's recent data
        stops early (UK gilts are only published through 2024), the series is
        carried forward so it stays aligned to the shared `years` axis.
        """
        by_year = jst_frame.set_index("year")
        yl, ys, disc = [], [], []
        for y in years:
            if y in by_year.index:
                r = by_year.loc[y]
                yl.append(float(r.y_long)); ys.append(float(r.y_short))
                disc.append(float(r.disc))
            elif y in yl_recent:
                yl.append(yl_recent[y])
                ys.append(ys_recent.get(y, float("nan")))
                # recent discount factor is 1/(1+inflation) for the single geo
                disc.append(1.0 / (1.0 + geo_infl_recent[y])
                            if y in geo_infl_recent else float("nan"))
            else:
                yl.append(float("nan")); ys.append(float("nan"))
                disc.append(float("nan"))
        yl = fill_forward(np.array(yl, float), f"{name} long yield")
        ys = fill_forward(np.array(ys, float), f"{name} short yield")
        disc = fill_forward(np.array(disc, float), f"{name} inflation discount")
        return yl, ys, disc

    euro_frame = euro[["year", "y_long", "y_short", "disc"]]
    uk_frame = uk[["year", "y_long", "y_short", "disc"]]
    eu_yl, eu_ys, eu_disc = build_region(
        "euro", euro_frame, infl, y_long_recent, y_short_recent, infl)
    uk_yl, uk_ys, uk_disc = build_region(
        "uk", uk_frame, uk_infl_recent, uk_yl_recent, uk_ys_recent, uk_infl_recent)

    def ann(x):
        return float(np.exp(np.mean(np.log1p(x))) - 1)

    def htm_stats(yl, disc):
        """Held-to-maturity real return with an annual re-lock, for reporting."""
        locked = np.concatenate([[yl[0]], yl[:-1]])  # last year's yield locked in
        real = (1 + locked) * disc - 1
        return ann(real), float(np.std(real, ddof=1)), float(real.min())

    eu_htm = htm_stats(eu_yl, eu_disc)
    uk_htm = htm_stats(uk_yl, uk_disc)

    stats = {
        "equity_real_cagr": ann(eq),
        "bond_real_cagr": ann(bd),
        "equity_real_vol": float(np.std(eq, ddof=1)),
        "bond_real_vol": float(np.std(bd, ddof=1)),
        "correlation": float(np.corrcoef(eq, bd)[0, 1]),
        "inflation_cagr": ann(cpi),
        "equity_worst_year": float(eq.min()),
        "equity_best_year": float(eq.max()),
        "bond_worst_year": float(bd.min()),
        "bond_best_year": float(bd.max()),
        # The bond sleeve the app actually simulates, per region: buy at the yield
        # on offer, hold to maturity, get the face value back. Real return is the
        # locked yield eroded by the inflation that turned up — computed the honest
        # per-country way (the discount factor), so no hyperinflation artifact.
        "euro_bond_yield_long_last": float(eu_yl[-1]),
        "euro_bond_yield_short_last": float(eu_ys[-1]),
        "euro_bond_hold_real_cagr": eu_htm[0],
        "euro_bond_hold_real_vol": eu_htm[1],
        "euro_bond_hold_worst_year": eu_htm[2],
        "uk_bond_yield_long_last": float(uk_yl[-1]),
        "uk_bond_yield_short_last": float(uk_ys[-1]),
        "uk_bond_hold_real_cagr": uk_htm[0],
        "uk_bond_hold_real_vol": uk_htm[1],
        "uk_bond_hold_worst_year": uk_htm[2],
    }

    print("\n=== FULL-SAMPLE REAL STATS "
          f"({years[0]}-{years[-1]}, {len(years)} years) ===")
    print(f"  world equity : CAGR {stats['equity_real_cagr']:+.2%}  "
          f"vol {stats['equity_real_vol']:.1%}  "
          f"worst {stats['equity_worst_year']:+.1%} best {stats['equity_best_year']:+.1%}")
    print(f"  euro bond ETF: CAGR {stats['bond_real_cagr']:+.2%}  "
          f"vol {stats['bond_real_vol']:.1%}  (tables only)")
    # These two lines are the HISTORICAL answer (deflated by the inflation that
    # actually happened, interwar spikes included), not what the app simulates:
    # the app deflates the locked yield by the user's single assumed inflation.
    print(f"  euro bond HELD to maturity: CAGR {eu_htm[0]:+.2%}  vol {eu_htm[1]:.1%}  "
          f"worst {eu_htm[2]:+.1%}   yields now {eu_ys[-1]:.2%}/{eu_yl[-1]:.2%}")
    print(f"  UK   bond HELD to maturity: CAGR {uk_htm[0]:+.2%}  vol {uk_htm[1]:.1%}  "
          f"worst {uk_htm[2]:+.1%}   yields now {uk_ys[-1]:.2%}/{uk_yl[-1]:.2%}")
    print("    (^ real return vs the inflation that actually happened; the app "
          "instead deflates by the assumed inflation, so at 2% the euro bond is "
          f"{(1 + eu_yl[-1]) / 1.02 - 1:+.2%} and the gilt "
          f"{(1 + uk_yl[-1]) / 1.02 - 1:+.2%} a year real)")

    def region_payload(yl, ys, disc):
        return {
            "yield_short": [round(float(v), 6) for v in ys],
            "yield_long": [round(float(v), 6) for v in yl],
            "infl_discount": [round(float(v), 6) for v in disc],
        }

    payload = {
        "meta": {
            "built": dt.datetime.now(dt.UTC).strftime("%Y-%m-%d"),
            "first_year": years[0],
            "last_year": years[-1],
            "n_years": len(years),
            "basis": "annual real (inflation-adjusted) total returns",
            "equity": "Global equity portfolio, GDP-weighted across 16 advanced "
                      "economies (JST 1900-2020), spliced to iShares Core MSCI "
                      "World UCITS ETF (2021+). Real returns are currency-neutral "
                      "over the long run, so the same series serves both regions",
            "bonds": "Euro-area long government bond ETF total return, GDP-weighted "
                     "across 8 member states (JST 1900-2020), spliced to iShares "
                     "Core EUR Govt Bond UCITS ETF (2021+). A marked-to-market "
                     "fund; kept for the historical tables only, NOT simulated",
            "bond_hold": "What the app simulates: one government bond bought at the "
                         "yield on offer and held to maturity. Per region it ships "
                         "the short and 10-year yields plus a GDP-weighted inflation "
                         "discount factor D = SUM w/(1+infl). Held to maturity the "
                         "cash flows are fixed, so the NOMINAL return is the locked "
                         "yield y itself; the app deflates it by the single assumed "
                         "inflation the user sets, NOT by D. D is used only for the "
                         "*_bond_hold_real_* statistics below, which answer the "
                         "separate historical question 'what did a rolled bond earn "
                         "in real terms given the inflation that actually happened' "
                         "-- (1+y)*D-1 per year, hyperinflations included. Euro = 8 "
                         "euro-area members (JST + Eurostat, to 2025). UK = UK gilts "
                         "and UK prices (JST + Eurostat, to 2024; later years "
                         "carried forward)",
            "inflation": "Euro-area consumer prices, GDP-weighted CPI (to 2020), "
                         "Eurostat euro-area HICP (2021+)",
            "sources": [
                "Jordà, Schularick & Taylor, Macrohistory Database R6 "
                "(macrohistory.net/database)",
                "Yahoo Finance daily adjusted closes: IWDA.AS, IEGA.AS",
                "Eurostat prc_hicp_aind (euro-area & UK HICP, annual average)",
                "Eurostat irt_lt_mcby_a (10-year benchmark bond yield, EA & UK)",
                "Eurostat irt_st_a, int_rt=IRT_M3 (3-month rate, EA & UK)",
            ],
        },
        "stats": stats,
        "years": years,
        "equity_real": [round(float(v), 6) for v in eq],
        "bond_real": [round(float(v), 6) for v in bd],
        "inflation": [round(float(v), 6) for v in cpi],
        "source_tag": src,
        # Per-region held-to-maturity bond inputs. The engine picks the block by the
        # selected country's currency: "eur" for none/Italy, "gbp" for the UK.
        "bond_hold": {
            "eur": region_payload(eu_yl, eu_ys, eu_disc),
            "gbp": region_payload(uk_yl, uk_ys, uk_disc),
        },
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=1))
    print(f"\nwrote {OUT}  ({OUT.stat().st_size/1024:.1f} KB)")


if __name__ == "__main__":
    main()
