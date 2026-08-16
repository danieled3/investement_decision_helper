/**
 * Tax model.
 *
 * The investments themselves are the same wherever you live — one world share
 * ETF and one euro government bond ETF. The country you are tax-resident in
 * changes NOTHING about the returns; it only changes what the tax authority
 * takes, and when. So the whole country-specific part of the app lives here.
 *
 * There are exactly three ways money can be taken, and a correct model needs
 * all three because they bite at different times:
 *
 *   1. A yearly charge on the WHOLE balance, win or lose.
 *      Italy: imposta di bollo / IVAFE, 0.20% a year on the value of the
 *      holding, "dovuta ogni anno a prescindere dal risultato".
 *      UK: none.
 *
 *   2. A yearly tax on the INCOME the funds earn (dividends and coupons),
 *      even when the fund is an accumulating one that pays you nothing.
 *      UK: yes — a reporting fund's "excess reportable income" is taxable in
 *      the year it arises; share income at dividend rates, bond income at
 *      interest rates, each with its own allowance. The tax you pay this way
 *      is added to your cost base, so you are not taxed on it twice.
 *      Italy: only if the ETF DISTRIBUTES. An accumulating UCITS ETF is not
 *      taxed at all until you sell — this is the single biggest advantage of
 *      accumulating ETFs for an Italian investor.
 *
 *   3. A tax on the GAIN when you finally sell.
 *      Italy: 26% substitute tax, reduced to 12.5% on the part of the return
 *      coming from white-list government bonds — so a physically-replicated
 *      euro government bond ETF is taxed at ~12.5% and a world share ETF at
 *      26%. Losses on one ETF CANNOT be set against gains on another, because
 *      Italy files ETF gains as "redditi di capitale" and ETF losses as
 *      "redditi diversi" — two buckets that never talk to each other.
 *      UK: capital gains tax, 18% inside the basic-rate band and 24% above it,
 *      with a £3,000 tax-free amount each year; losses DO offset gains.
 *
 * Two further points that are easy to get wrong and that this model gets right:
 *
 *   * Tax is charged on the NOMINAL gain, not the real one. Inflation is not
 *     deducted anywhere. So the higher inflation is, the more of your real
 *     return the tax takes — and the engine therefore computes every tax figure
 *     in euros of the day, then converts back.
 *
 *   * Allowances (the UK's £3,000 and so on) are fixed cash amounts that are
 *     not being raised, so they shrink in real terms year after year. They are
 *     held constant in nominal euros here, which reproduces that drag.
 *
 * Everything below is a rate table plus arithmetic. Adding a country means
 * adding one entry to REGIMES — nothing else in the app needs to change.
 *
 * Not tax advice. Rates are those in force for the 2026 Italian year and the
 * 2026/27 UK year; your own position can differ.
 */

/** Rates in force, as at August 2026. */
export const REGIMES = {
  none: {
    id: "none",
    label: "No tax — show the gross result",
    country: "—",
    short: "no tax",
    wealthRate: 0,
    equityExit: 0,
    bondExit: 0,
    equityIncomeRate: 0,
    bondIncomeRate: 0,
    equityIncomeAllowance: 0,
    bondIncomeAllowance: 0,
    exitAllowance: 0,
    lossOffset: true,
    basisUplift: "none",
    taxesIncome: false,
  },

  it: {
    id: "it",
    label: "Italy",
    country: "Italy",
    short: "Italian tax",
    // imposta di bollo sul deposito titoli (or IVAFE with a foreign broker)
    wealthRate: 0.002,
    // imposta sostitutiva: 26%, reduced to 12.5% on white-list government bonds
    equityExit: 0.26,
    bondExit: 0.125,
    // charged on distributions only; an accumulating ETF pays nothing yearly
    equityIncomeRate: 0.26,
    bondIncomeRate: 0.125,
    equityIncomeAllowance: 0,
    bondIncomeAllowance: 0,
    exitAllowance: 0,
    // "redditi di capitale" vs "redditi diversi": losses never offset gains
    lossOffset: false,
    basisUplift: "net",
    taxesIncome: false, // switched on by the distributing option
  },

  gb: {
    id: "gb",
    label: "United Kingdom",
    country: "the UK",
    short: "UK tax",
    wealthRate: 0,
    // capital gains tax, both sleeves
    equityExit: 0.18,
    bondExit: 0.18,
    // reporting-fund income: dividends for the share fund, interest for bonds
    equityIncomeRate: 0.0875,
    bondIncomeRate: 0.2,
    equityIncomeAllowance: 500, // dividend allowance, £
    bondIncomeAllowance: 1000, // personal savings allowance, £
    exitAllowance: 3000, // annual exempt amount, £
    lossOffset: true,
    basisUplift: "gross", // income already taxed lifts the cost base
    taxesIncome: true,
    allowanceCurrency: "gbp",
    bands: {
      basic: {
        label: "Basic rate (income under £50,270)",
        equityExit: 0.18,
        bondExit: 0.18,
        equityIncomeRate: 0.0875,
        bondIncomeRate: 0.2,
        bondIncomeAllowance: 1000,
        equityIncomeAllowance: 500,
      },
      higher: {
        label: "Higher rate (£50,270 – £125,140)",
        equityExit: 0.24,
        bondExit: 0.24,
        equityIncomeRate: 0.3375,
        bondIncomeRate: 0.4,
        bondIncomeAllowance: 500,
        equityIncomeAllowance: 500,
      },
      additional: {
        label: "Additional rate (over £125,140)",
        equityExit: 0.24,
        bondExit: 0.24,
        equityIncomeRate: 0.3935,
        bondIncomeRate: 0.45,
        bondIncomeAllowance: 0,
        equityIncomeAllowance: 500,
      },
    },
  },
};

export const TAX_DEFAULTS = {
  country: "it",
  band: "basic", // UK only
  wrapper: "taxable", // "taxable" | "isa" (UK only)
  fundType: "acc", // "acc" | "dist" (matters in Italy)
  equityYield: 0.018, // dividend yield of a world share ETF
  bondYield: 0.03, // running yield of a euro government bond ETF
  gbpEur: 1.15, // used only to express the UK allowances in euros
  wealthRate: null, // null = use the country default
};

/**
 * Turn the user's selection into the flat, cheap-to-read plan object the
 * simulation loop uses. Everything the loop needs is a plain number.
 */
export function resolveTaxPlan(sel = {}) {
  const s = { ...TAX_DEFAULTS, ...sel };
  const base = REGIMES[s.country] || REGIMES.none;

  // A UK ISA shelters everything: no income tax, no capital gains tax.
  const sheltered = base.id === "gb" && s.wrapper === "isa";
  if (base.id === "none" || sheltered) {
    return {
      enabled: false,
      id: sheltered ? "gb_isa" : "none",
      country: base.country,
      label: sheltered ? "United Kingdom — inside an ISA" : base.label,
      short: sheltered ? "no tax (ISA)" : "no tax",
      wealthRate: 0,
      equityExit: 0,
      bondExit: 0,
      equityIncomeRate: 0,
      bondIncomeRate: 0,
      equityIncomeAllowance: 0,
      bondIncomeAllowance: 0,
      exitAllowance: 0,
      lossOffset: true,
      basisUplift: "none",
      equityYield: 0,
      bondYield: 0,
      taxesIncome: false,
    };
  }

  const band = base.bands ? base.bands[s.band] || base.bands.basic : null;
  const r = { ...base, ...(band || {}) };

  // allowances are statutory pounds for the UK; convert once, here
  const fx = base.allowanceCurrency === "gbp" ? Math.max(0.1, s.gbpEur) : 1;

  // In Italy an accumulating ETF is not touched until you sell; a distributing
  // one is taxed on every payout as it lands.
  const taxesIncome = base.id === "it" ? s.fundType === "dist" : r.taxesIncome;

  const wealthRate = s.wealthRate === null || s.wealthRate === undefined
    ? r.wealthRate
    : s.wealthRate;

  return {
    enabled: true,
    id: base.id,
    country: base.country,
    label: band ? `${base.label} — ${band.label}` : base.label,
    short: base.short,
    band: band ? s.band : null,
    fundType: s.fundType,
    wealthRate,
    equityExit: r.equityExit,
    bondExit: r.bondExit,
    equityIncomeRate: taxesIncome ? r.equityIncomeRate : 0,
    bondIncomeRate: taxesIncome ? r.bondIncomeRate : 0,
    equityIncomeAllowance: taxesIncome ? r.equityIncomeAllowance * fx : 0,
    bondIncomeAllowance: taxesIncome ? r.bondIncomeAllowance * fx : 0,
    exitAllowance: r.exitAllowance * fx,
    lossOffset: r.lossOffset,
    basisUplift: taxesIncome ? r.basisUplift : "none",
    equityYield: taxesIncome ? s.equityYield : 0,
    bondYield: taxesIncome ? s.bondYield : 0,
    taxesIncome,
  };
}

/**
 * Tax due if you sold everything right now, in euros of the day.
 *
 * `bR` / `bS` are the nominal cost bases of the two sleeves. Gains are per
 * sleeve because the two are taxed at different rates in Italy; whether a loss
 * on one may reduce the gain on the other is exactly the lossOffset flag.
 */
export function exitTaxNominal(riskyNom, bR, safeNom, bS, plan) {
  let gR = riskyNom - bR;
  let gS = safeNom - bS;

  if (plan.lossOffset) {
    // a real loss reduces the taxable gain on the other sleeve
    if (gR > 0 && gS < 0) {
      gR = gR + gS;
      gS = 0;
    } else if (gS > 0 && gR < 0) {
      gS = gS + gR;
      gR = 0;
    }
  }
  if (gR < 0) gR = 0;
  if (gS < 0) gS = 0;

  // The yearly tax-free amount is worth most against the higher-taxed gain,
  // which is where any sane taxpayer would put it.
  let allow = plan.exitAllowance;
  if (allow > 0) {
    const riskyFirst = plan.equityExit >= plan.bondExit;
    const first = riskyFirst ? "R" : "S";
    let g1 = first === "R" ? gR : gS;
    const used1 = Math.min(allow, g1);
    g1 -= used1;
    allow -= used1;
    if (first === "R") gR = g1;
    else gS = g1;
    let g2 = first === "R" ? gS : gR;
    const used2 = Math.min(allow, g2);
    g2 -= used2;
    if (first === "R") gS = g2;
    else gR = g2;
  }

  return gR * plan.equityExit + gS * plan.bondExit;
}

/** Yearly tax on income earned, after that income type's tax-free amount. */
export function incomeTaxNominal(accrued, rate, allowance) {
  const taxable = accrued - allowance;
  return taxable > 0 ? taxable * rate : 0;
}

/* A rate as a reader would write it: 26%, 12.5%, 8.75%, 0.20%. Trailing zeros
   are dropped, because "13%" for a 12.5% rate would simply be wrong. */
const asRate = (x, forceDigits = null) =>
  forceDigits !== null
    ? `${(x * 100).toFixed(forceDigits)}%`
    : `${(x * 100).toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}%`;

/* Thin spaces between thousands, matching the euro amounts everywhere else. */
const asEuro = (x) =>
  `€${Math.round(x).toLocaleString("en-GB").replace(/,/g, " ")}`;

/** One-line, plain-language description of what is being applied. */
export function describeTaxPlan(plan) {
  if (!plan.enabled) {
    return plan.id === "gb_isa"
      ? "Inside an ISA nothing is taxed: no tax on the income, no tax on the gain, nothing yearly."
      : "No tax is being applied — these are gross figures.";
  }
  const parts = [];
  parts.push(`${asRate(plan.equityExit)} on the gain of the share part`);
  parts.push(`${asRate(plan.bondExit)} on the gain of the bond part`);
  if (plan.wealthRate > 0) {
    parts.push(`${asRate(plan.wealthRate, 2)} a year on the whole balance`);
  }
  if (plan.taxesIncome) {
    parts.push(
      `${asRate(plan.equityIncomeRate)} a year on share income and ` +
        `${asRate(plan.bondIncomeRate)} a year on bond income`
    );
  }
  if (plan.exitAllowance > 0) {
    parts.push(`the first ${asEuro(plan.exitAllowance)} of gain in a year free`);
  }
  return `Applied: ${parts.join("; ")}.`;
}
