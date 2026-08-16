#!/usr/bin/env python3
"""
Build the historical return dataset used by the Investment Decision Helper.

Output: ../data/returns.json  — annual REAL (inflation-adjusted) total returns for
  1) a global equity portfolio  ("world ETF" proxy)
  2) a euro-area government bond portfolio ("euro bond" proxy)
  plus euro-area consumer price inflation, so the app can show nominal euros too.

Sources
-------
1900-2020  Jordà-Schularick-Taylor Macrohistory Database, release 6.
           Òscar Jordà, Moritz Schularick, Alan M. Taylor (2017),
           "Macrofinancial History and the New Business Cycle Facts".
           Fields: eq_tr (equity total return), bond_tr (long govt bond total
           return), cpi, rgdpmad (real GDP p.c.), pop. All nominal, local currency.
           https://www.macrohistory.net/database/

2021-2025  Equity : iShares Core MSCI World UCITS ETF (IWDA.AS), EUR, accumulating.
           Bonds  : iShares Core EUR Govt Bond UCITS ETF (IEGA.AS), EUR,
                    dividend-adjusted close (total return).
           Both from Yahoo Finance daily adjusted closes, last trading day of year.
           Inflation: Eurostat prc_hicp_aind, euro-area annual average HICP index.

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

    d = df[(df.year >= 1900) & (df.year <= 2020)]

    eq = weighted_series(d, "eq_real").rename(columns={"n": "n_eq"})
    bd = weighted_series(d, "bd_real", EURO_AREA).rename(columns={"n": "n_bd"})
    inf = weighted_series(d, "infl", EURO_AREA).rename(columns={"n": "n_inf"})

    out = eq.merge(bd, on="year").merge(inf, on="year")
    return out, df


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


def eurostat_hicp():
    """Euro-area annual average HICP index -> annual inflation rate."""
    url = (
        "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/"
        "prc_hicp_aind?format=JSON&lang=EN&unit=INX_A_AVG&coicop=CP00&geo=EA"
        "&sinceTimePeriod=2015"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    js = json.load(urllib.request.urlopen(req, timeout=60))
    idx = js["dimension"]["time"]["category"]["index"]
    years = {int(y): i for y, i in idx.items()}
    vals = {int(y): js["value"].get(str(i)) for y, i in years.items()}
    vals = {y: v for y, v in vals.items() if v is not None}
    infl = {}
    for y in sorted(vals):
        if y - 1 in vals:
            infl[y] = vals[y] / vals[y - 1] - 1
    return infl


# ------------------------------------------------------------------------ main


def main():
    jst, raw = build_jst()
    print(f"JST rows {jst.year.min()}-{jst.year.max()}  ({len(jst)} years)")
    print(f"  countries per year: equity {jst.n_eq.min()}-{jst.n_eq.max()}, "
          f"euro bonds {jst.n_bd.min()}-{jst.n_bd.max()}")

    eq_nom, eq_last = yahoo_annual("IWDA.AS")
    bd_nom, bd_last = yahoo_annual("IEGA.AS")
    infl = eurostat_hicp()

    recent_years = [y for y in range(2021, 2026)
                    if y in eq_nom and y in bd_nom and y in infl]
    print(f"Recent years spliced: {recent_years}")

    # ---- validate the splice on the overlap where BOTH sources exist ----
    print("\n=== SPLICE VALIDATION: JST vs ETF, real returns, overlap ===")
    print(f"{'year':>5} {'eq JST':>9} {'eq ETF':>9} | {'bd JST':>9} {'bd ETF':>9}")
    ov_eq_j, ov_eq_e, ov_bd_j, ov_bd_e = [], [], [], []
    for y in sorted(set(eq_nom) & set(bd_nom) & set(infl) & set(jst.year)):
        r = jst[jst.year == y].iloc[0]
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

    # ---- assemble final series ----
    years, eq, bd, cpi, src = [], [], [], [], []
    for _, r in jst.iterrows():
        years.append(int(r.year)); eq.append(r.eq_real); bd.append(r.bd_real)
        cpi.append(r.infl); src.append("jst")
    for y in recent_years:
        years.append(y)
        eq.append((1 + eq_nom[y]) / (1 + infl[y]) - 1)
        bd.append((1 + bd_nom[y]) / (1 + infl[y]) - 1)
        cpi.append(infl[y]); src.append("etf")

    eq = np.array(eq); bd = np.array(bd); cpi = np.array(cpi)

    def ann(x):
        return float(np.exp(np.mean(np.log1p(x))) - 1)

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
    }

    print("\n=== FULL-SAMPLE REAL STATS "
          f"({years[0]}-{years[-1]}, {len(years)} years) ===")
    print(f"  world equity : CAGR {stats['equity_real_cagr']:+.2%}  "
          f"vol {stats['equity_real_vol']:.1%}  "
          f"worst {stats['equity_worst_year']:+.1%} best {stats['equity_best_year']:+.1%}")
    print(f"  euro bonds   : CAGR {stats['bond_real_cagr']:+.2%}  "
          f"vol {stats['bond_real_vol']:.1%}  "
          f"worst {stats['bond_worst_year']:+.1%} best {stats['bond_best_year']:+.1%}")
    print(f"  correlation  : {stats['correlation']:+.3f}")
    print(f"  inflation    : {stats['inflation_cagr']:+.2%} p.a.")

    payload = {
        "meta": {
            "built": dt.datetime.now(dt.UTC).strftime("%Y-%m-%d"),
            "first_year": years[0],
            "last_year": years[-1],
            "n_years": len(years),
            "basis": "annual real (inflation-adjusted) total returns",
            "equity": "Global equity portfolio, GDP-weighted across 16 advanced "
                      "economies (JST 1900-2020), spliced to iShares Core MSCI "
                      "World UCITS ETF in EUR (2021+)",
            "bonds": "Euro-area long government bonds, GDP-weighted across 8 "
                     "member states (JST 1900-2020), spliced to iShares Core EUR "
                     "Govt Bond UCITS ETF (2021+)",
            "inflation": "Euro-area consumer prices, GDP-weighted CPI (to 2020), "
                         "Eurostat euro-area HICP (2021+)",
            "sources": [
                "Jordà, Schularick & Taylor, Macrohistory Database R6 "
                "(macrohistory.net/database)",
                "Yahoo Finance daily adjusted closes: IWDA.AS, IEGA.AS",
                "Eurostat prc_hicp_aind (euro-area HICP, annual average)",
            ],
        },
        "stats": stats,
        "years": years,
        "equity_real": [round(float(v), 6) for v in eq],
        "bond_real": [round(float(v), 6) for v in bd],
        "inflation": [round(float(v), 6) for v in cpi],
        "source_tag": src,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=1))
    print(f"\nwrote {OUT}  ({OUT.stat().st_size/1024:.1f} KB)")


if __name__ == "__main__":
    main()
