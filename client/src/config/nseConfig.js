/**
 * Central Configuration for Official NSE Indices (Frontend)
 * Total 64 Official Benchmarks covering Broad Market, Sectoral, Thematic/Strategy, and Fixed Income & Debt
 */

export const NSE_INDICES = [
  // --- BROAD MARKET BENCHMARKS (16) ---
  {
    id: "NIFTY 50",
    displayName: "NIFTY 50",
    officialName: "Nifty 50",
    apiName: "Nifty 50",
    category: "Broad Market",
    subCategory: "Large Cap",
    source: "NSE Indices",
    description: "Flagship Indian equity benchmark comprising 50 blue-chip companies"
  },
  {
    id: "NIFTY NEXT 50",
    displayName: "NIFTY Next 50",
    officialName: "Nifty Next 50",
    apiName: "Nifty Next 50",
    category: "Broad Market",
    subCategory: "Large Cap",
    source: "NSE Indices",
    description: "Next 50 large-cap companies ranked 51-100 by market capitalization"
  },
  {
    id: "NIFTY 100",
    displayName: "NIFTY 100",
    officialName: "Nifty 100",
    apiName: "Nifty 100",
    category: "Broad Market",
    subCategory: "Large Cap",
    source: "NSE Indices",
    description: "Top 100 companies representing the large-cap Indian equity market"
  },
  {
    id: "NIFTY 200",
    displayName: "NIFTY 200",
    officialName: "Nifty 200",
    apiName: "Nifty 200",
    category: "Broad Market",
    subCategory: "Large & Mid Cap",
    source: "NSE Indices",
    description: "Top 200 companies combining large and mid-cap stocks"
  },
  {
    id: "NIFTY 500",
    displayName: "NIFTY 500",
    officialName: "Nifty 500",
    apiName: "Nifty 500",
    category: "Broad Market",
    subCategory: "Total Market",
    source: "NSE Indices",
    description: "Broad-market benchmark comprising top 500 companies by market capitalization"
  },
  {
    id: "NIFTY 500 MULTICAP 50:25:25",
    displayName: "NIFTY 500 Multicap 50:25:25",
    officialName: "Nifty500 Multicap 50:25:25",
    apiName: "Nifty500 Multicap 50:25:25",
    category: "Broad Market",
    subCategory: "Multi Cap",
    source: "NSE Indices",
    description: "Multi-cap benchmark weighted 50% Large Cap, 25% Mid Cap, 25% Small Cap"
  },
  {
    id: "NIFTY MIDCAP 50",
    displayName: "NIFTY Midcap 50",
    officialName: "Nifty Midcap 50",
    apiName: "Nifty Midcap 50",
    category: "Broad Market",
    subCategory: "Mid Cap",
    source: "NSE Indices",
    description: "Top 50 mid-cap companies with highest liquidity and market cap"
  },
  {
    id: "NIFTY MIDCAP 100",
    displayName: "NIFTY Midcap 100",
    officialName: "Nifty Midcap 100",
    apiName: "Nifty Midcap 100",
    category: "Broad Market",
    subCategory: "Mid Cap",
    source: "NSE Indices",
    description: "Top 100 mid-cap companies ranked 101-200"
  },
  {
    id: "NIFTY MIDCAP 150",
    displayName: "NIFTY Midcap 150",
    officialName: "Nifty Midcap 150",
    apiName: "Nifty Midcap 150",
    category: "Broad Market",
    subCategory: "Mid Cap",
    source: "NSE Indices",
    description: "Official NSE broad mid-cap benchmark (companies ranked 101-250 as defined by SEBI/AMFI)"
  },
  {
    id: "NIFTY SMALLCAP 50",
    displayName: "NIFTY Smallcap 50",
    officialName: "Nifty Smallcap 50",
    apiName: "Nifty Smallcap 50",
    category: "Broad Market",
    subCategory: "Small Cap",
    source: "NSE Indices",
    description: "Top 50 small-cap companies ranked by average daily turnover and market cap"
  },
  {
    id: "NIFTY SMALLCAP 100",
    displayName: "NIFTY Smallcap 100",
    officialName: "Nifty Smallcap 100",
    apiName: "Nifty Smallcap 100",
    category: "Broad Market",
    subCategory: "Small Cap",
    source: "NSE Indices",
    description: "Top 100 small-cap companies ranked 251-350"
  },
  {
    id: "NIFTY SMALLCAP 250",
    displayName: "NIFTY Smallcap 250",
    officialName: "Nifty Smallcap 250",
    apiName: "Nifty Smallcap 250",
    category: "Broad Market",
    subCategory: "Small Cap",
    source: "NSE Indices",
    description: "Official NSE broad small-cap benchmark (companies ranked 251-500 as defined by SEBI/AMFI)"
  },
  {
    id: "NIFTY LARGEMIDCAP 250",
    displayName: "NIFTY LargeMidcap 250",
    officialName: "Nifty LargeMidcap 250",
    apiName: "Nifty LargeMidcap 250",
    category: "Broad Market",
    subCategory: "Large & Mid Cap",
    source: "NSE Indices",
    description: "Combines 100 large-cap and 150 mid-cap companies (50:50 weight)"
  },
  {
    id: "NIFTY MIDSMALLCAP 400",
    displayName: "NIFTY MidSmallcap 400",
    officialName: "Nifty MidSmallcap 400",
    apiName: "Nifty MidSmallcap 400",
    category: "Broad Market",
    subCategory: "Mid & Small Cap",
    source: "NSE Indices",
    description: "Combines midcap 150 and smallcap 250 universes"
  },
  {
    id: "NIFTY MICROCAP 250",
    displayName: "NIFTY Microcap 250",
    officialName: "Nifty Microcap 250",
    apiName: "Nifty Microcap 250",
    category: "Broad Market",
    subCategory: "Micro Cap",
    source: "NSE Indices",
    description: "Micro-cap benchmark comprising companies ranked 501-750"
  },
  {
    id: "NIFTY TOTAL MARKET",
    displayName: "NIFTY Total Market",
    officialName: "Nifty Total Market",
    apiName: "Nifty Total Market",
    category: "Broad Market",
    subCategory: "Total Market",
    source: "NSE Indices",
    description: "Tracks top 750 companies across large, mid, small, and micro caps"
  },

  // --- SECTORAL INDICES (15) ---
  {
    id: "NIFTY BANK",
    displayName: "NIFTY Bank",
    officialName: "Nifty Bank",
    apiName: "Nifty Bank",
    category: "Sectoral",
    subCategory: "Banking",
    source: "NSE Indices",
    description: "Flagship banking sector benchmark tracking leading Indian banks"
  },
  {
    id: "NIFTY AUTO",
    displayName: "NIFTY Auto",
    officialName: "Nifty Auto",
    apiName: "Nifty Auto",
    category: "Sectoral",
    subCategory: "Automobile",
    source: "NSE Indices",
    description: "Automobile sector benchmark tracking passenger cars, commercial vehicles, and auto ancillaries"
  },
  {
    id: "NIFTY FINANCIAL SERVICES",
    displayName: "NIFTY Financial Services",
    officialName: "Nifty Financial Services",
    apiName: "Nifty Financial Services",
    category: "Sectoral",
    subCategory: "Finance",
    source: "NSE Indices",
    description: "Tracks financial services including banks, NBFCs, insurance, and housing finance"
  },
  {
    id: "NIFTY FINANCIAL SERVICES 25/50",
    displayName: "NIFTY Fin Service 25/50",
    officialName: "Nifty Financial Services 25/50",
    apiName: "Nifty Financial Services 25/50",
    category: "Sectoral",
    subCategory: "Finance",
    source: "NSE Indices",
    description: "Financial services benchmark with 25% single stock cap and 50% group cap"
  },
  {
    id: "NIFTY FMCG",
    displayName: "NIFTY FMCG",
    officialName: "Nifty FMCG",
    apiName: "Nifty FMCG",
    category: "Sectoral",
    subCategory: "Consumer Goods",
    source: "NSE Indices",
    description: "Fast Moving Consumer Goods sector benchmark"
  },
  {
    id: "NIFTY IT",
    displayName: "NIFTY IT",
    officialName: "Nifty IT",
    apiName: "Nifty IT",
    category: "Sectoral",
    subCategory: "Information Technology",
    source: "NSE Indices",
    description: "Flagship Information Technology and software services benchmark"
  },
  {
    id: "NIFTY MEDIA",
    displayName: "NIFTY Media",
    officialName: "Nifty Media",
    apiName: "Nifty Media",
    category: "Sectoral",
    subCategory: "Media",
    source: "NSE Indices",
    description: "Media and entertainment sector benchmark"
  },
  {
    id: "NIFTY METAL",
    displayName: "NIFTY Metal",
    officialName: "Nifty Metal",
    apiName: "Nifty Metal",
    category: "Sectoral",
    subCategory: "Metals & Mining",
    source: "NSE Indices",
    description: "Metals, steel, and mining sector benchmark"
  },
  {
    id: "NIFTY PHARMA",
    displayName: "NIFTY Pharma",
    officialName: "Nifty Pharma",
    apiName: "Nifty Pharma",
    category: "Sectoral",
    subCategory: "Pharmaceuticals",
    source: "NSE Indices",
    description: "Pharmaceutical sector benchmark tracking active drug and formulation companies"
  },
  {
    id: "NIFTY HEALTHCARE",
    displayName: "NIFTY Healthcare",
    officialName: "Nifty Healthcare",
    apiName: "Nifty Healthcare",
    category: "Sectoral",
    subCategory: "Healthcare",
    source: "NSE Indices",
    description: "Healthcare, hospitals, diagnostics, and medical services benchmark"
  },
  {
    id: "NIFTY OIL & GAS",
    displayName: "NIFTY Oil & Gas",
    officialName: "Nifty Oil & Gas",
    apiName: "Nifty Oil & Gas",
    category: "Sectoral",
    subCategory: "Energy & Utilities",
    source: "NSE Indices",
    description: "Oil, gas, refining, and petroleum marketing companies"
  },
  {
    id: "NIFTY REALTY",
    displayName: "NIFTY Realty",
    officialName: "Nifty Realty",
    apiName: "Nifty Realty",
    category: "Sectoral",
    subCategory: "Real Estate",
    source: "NSE Indices",
    description: "Real estate and property development benchmark"
  },
  {
    id: "NIFTY CONSUMER DURABLES",
    displayName: "NIFTY Consumer Durables",
    officialName: "Nifty Consumer Durables",
    apiName: "Nifty Consumer Durables",
    category: "Sectoral",
    subCategory: "Consumer Durables",
    source: "NSE Indices",
    description: "Consumer electronics, home appliances, and white goods"
  },
  {
    id: "NIFTY PRIVATE BANK",
    displayName: "NIFTY Private Bank",
    officialName: "Nifty Private Bank",
    apiName: "Nifty Private Bank",
    category: "Sectoral",
    subCategory: "Banking",
    source: "NSE Indices",
    description: "Tracks leading private sector commercial banks"
  },
  {
    id: "NIFTY PSU BANK",
    displayName: "NIFTY PSU Bank",
    officialName: "Nifty PSU Bank",
    apiName: "Nifty PSU Bank",
    category: "Sectoral",
    subCategory: "Banking",
    source: "NSE Indices",
    description: "Public Sector Undertaking (government-owned) commercial banks"
  },

  // --- THEMATIC & STRATEGY INDICES (11) ---
  {
    id: "NIFTY COMMODITIES",
    displayName: "NIFTY Commodities",
    officialName: "Nifty Commodities",
    apiName: "Nifty Commodities",
    category: "Thematic",
    subCategory: "Commodities",
    source: "NSE Indices",
    description: "Companies involved in commodities, agriculture, chemicals, and mining"
  },
  {
    id: "NIFTY INDIA CONSUMPTION",
    displayName: "NIFTY Consumption",
    officialName: "Nifty India Consumption",
    apiName: "Nifty India Consumption",
    category: "Thematic",
    subCategory: "Consumption",
    source: "NSE Indices",
    description: "Domestic consumer goods, auto, retail, and hospitality theme"
  },
  {
    id: "NIFTY CPSE",
    displayName: "NIFTY CPSE",
    officialName: "Nifty CPSE",
    apiName: "Nifty CPSE",
    category: "Thematic",
    subCategory: "Public Sector",
    source: "NSE Indices",
    description: "Central Public Sector Enterprises under Government of India"
  },
  {
    id: "NIFTY ENERGY",
    displayName: "NIFTY Energy",
    officialName: "Nifty Energy",
    apiName: "Nifty Energy",
    category: "Thematic",
    subCategory: "Energy",
    source: "NSE Indices",
    description: "Energy sector including power generation, transmission, and petroleum"
  },
  {
    id: "NIFTY INFRASTRUCTURE",
    displayName: "NIFTY Infrastructure",
    officialName: "Nifty Infrastructure",
    apiName: "Nifty Infrastructure",
    category: "Thematic",
    subCategory: "Infrastructure",
    source: "NSE Indices",
    description: "Infrastructure, capital goods, construction, and logistics"
  },
  {
    id: "NIFTY MNC",
    displayName: "NIFTY MNC",
    officialName: "Nifty MNC",
    apiName: "Nifty MNC",
    category: "Thematic",
    subCategory: "Multinational",
    source: "NSE Indices",
    description: "Multinational corporations where foreign promoter shareholding exceeds 50%"
  },
  {
    id: "NIFTY PSE",
    displayName: "NIFTY PSE",
    officialName: "Nifty PSE",
    apiName: "Nifty PSE",
    category: "Thematic",
    subCategory: "Public Sector",
    source: "NSE Indices",
    description: "Public Sector Enterprises where central or state governments hold majority"
  },
  {
    id: "NIFTY SERVICES SECTOR",
    displayName: "NIFTY Services Sector",
    officialName: "Nifty Services Sector",
    apiName: "Nifty Services Sector",
    category: "Thematic",
    subCategory: "Services",
    source: "NSE Indices",
    description: "Services economy including IT, telecom, finance, and transport"
  },
  {
    id: "NIFTY INDIA DIGITAL",
    displayName: "NIFTY India Digital",
    officialName: "Nifty India Digital",
    apiName: "Nifty India Digital",
    category: "Thematic",
    subCategory: "Digital Theme",
    source: "NSE Indices",
    description: "Digital transformation, fintech, platform, and internet tech companies"
  },
  {
    id: "NIFTY INDIA MANUFACTURING",
    displayName: "NIFTY Manufacturing",
    officialName: "Nifty India Manufacturing",
    apiName: "Nifty India Manufacturing",
    category: "Thematic",
    subCategory: "Manufacturing",
    source: "NSE Indices",
    description: "Make-in-India manufacturing theme across capital goods, autos, and chemicals"
  },
  {
    id: "NIFTY DIVIDEND OPPORTUNITIES 50",
    displayName: "NIFTY Dividend Opp 50",
    officialName: "Nifty Dividend Opportunities 50",
    apiName: "Nifty Dividend Opportunities 50",
    category: "Strategy",
    subCategory: "Dividend Yield",
    source: "NSE Indices",
    description: "High dividend-yielding companies with strong fundamental track record"
  },
  // --- FIXED INCOME & DEBT BENCHMARKS (22) ---
  {
    id: "NIFTY CORPORATE BOND INDEX A-II",
    displayName: "NIFTY Corporate Bond Index A-II",
    officialName: "Nifty Corporate Bond Index A-II",
    apiName: "Nifty Corporate Bond Index A-II",
    category: "Debt",
    subCategory: "Corporate Bond",
    benchmarkCode: "NSE_D_1378",
    source: "NSE Indices",
    description: "SEBI Tier 1 benchmark for corporate bond mutual funds (PRC Class A-II)",
    isFixedIncomeFactsheet: true,
    factsheetYield: 0.0748
  },
  {
    id: "NIFTY CORPORATE BOND INDEX",
    displayName: "NIFTY Corporate Bond Index",
    officialName: "Nifty Corporate Bond Index",
    apiName: "Nifty Corporate Bond Index",
    category: "Debt",
    subCategory: "Corporate Bond",
    benchmarkCode: "NSE_D_177",
    source: "NSE Indices",
    description: "Broad benchmark representing the Indian corporate bond market",
    isFixedIncomeFactsheet: true,
    factsheetYield: 0.0784
  },
  {
    id: "NIFTY CREDIT RISK BOND INDEX",
    displayName: "NIFTY Credit Risk Bond Index",
    officialName: "Nifty Credit Risk Bond Index",
    apiName: "Nifty Credit Risk Bond Index",
    category: "Debt",
    subCategory: "Credit Risk",
    benchmarkCode: "NSE_D_161",
    source: "NSE Indices",
    description: "SEBI benchmark for credit risk funds tracking AA and below corporate bonds",
    isFixedIncomeFactsheet: true,
    factsheetYield: 0.0834
  },
  {
    id: "NIFTY BANKING & PSU DEBT INDEX",
    displayName: "NIFTY Banking & PSU Debt Index",
    officialName: "Nifty Banking & PSU Debt Index",
    apiName: "Nifty Banking & PSU Debt Index",
    category: "Debt",
    subCategory: "Banking & PSU",
    benchmarkCode: "NSE_D_172",
    source: "NSE Indices",
    description: "SEBI benchmark for banking and public sector undertaking debt mutual funds",
    isFixedIncomeFactsheet: true,
    factsheetYield: 0.0738
  },
  {
    id: "NIFTY COMPOSITE DEBT INDEX",
    displayName: "NIFTY Composite Debt Index",
    officialName: "Nifty Composite Debt Index",
    apiName: "Nifty Composite Debt Index",
    category: "Debt",
    subCategory: "Composite Debt",
    benchmarkCode: "NSE_D_214",
    source: "NSE Indices",
    description: "Comprehensive benchmark tracking government securities and corporate bonds",
    isFixedIncomeFactsheet: true,
    factsheetYield: 0.0748
  },
  {
    id: "NIFTY MEDIUM TO LONG DURATION DEBT INDEX",
    displayName: "NIFTY Medium to Long Duration Debt Index",
    officialName: "Nifty Medium to Long Duration Debt Index",
    apiName: "Nifty Medium to Long Duration Debt Index",
    category: "Debt",
    subCategory: "Medium to Long Duration",
    benchmarkCode: "NSE_D_210",
    source: "NSE Indices",
    description: "SEBI benchmark for medium to long duration debt funds (Macaulay 4-7 yrs)",
    isFixedIncomeFactsheet: true,
    factsheetYield: 0.0739
  },
  {
    id: "NIFTY LONG DURATION DEBT INDEX",
    displayName: "NIFTY Long Duration Debt Index",
    officialName: "Nifty Long Duration Debt Index",
    apiName: "Nifty Long Duration Debt Index",
    category: "Debt",
    subCategory: "Long Duration",
    benchmarkCode: "NSE_D_322",
    source: "NSE Indices",
    description: "SEBI benchmark for long duration debt funds (Macaulay > 7 yrs)",
    isFixedIncomeFactsheet: true,
    factsheetYield: 0.0746
  },
  {
    id: "NIFTY MEDIUM DURATION DEBT INDEX",
    displayName: "NIFTY Medium Duration Debt Index",
    officialName: "Nifty Medium Duration Debt Index",
    apiName: "Nifty Medium Duration Debt Index",
    category: "Debt",
    subCategory: "Medium Duration",
    benchmarkCode: "NSE_D_169",
    source: "NSE Indices",
    description: "SEBI benchmark for medium duration debt funds (Macaulay 3-4 yrs)",
    isFixedIncomeFactsheet: true,
    factsheetYield: 0.0761
  },
  {
    id: "NIFTY SHORT DURATION DEBT INDEX",
    displayName: "NIFTY Short Duration Debt Index",
    officialName: "Nifty Short Duration Debt Index",
    apiName: "Nifty Short Duration Debt Index",
    category: "Debt",
    subCategory: "Short Duration",
    benchmarkCode: "NSE_D_170",
    source: "NSE Indices",
    description: "SEBI benchmark for short duration debt funds (Macaulay 1-3 yrs)",
    isFixedIncomeFactsheet: true,
    factsheetYield: 0.0737
  },
  {
    id: "NIFTY LOW DURATION DEBT INDEX",
    displayName: "NIFTY Low Duration Debt Index",
    officialName: "Nifty Low Duration Debt Index",
    apiName: "Nifty Low Duration Debt Index",
    category: "Debt",
    subCategory: "Low Duration",
    benchmarkCode: "NSE_D_173",
    source: "NSE Indices",
    description: "SEBI benchmark for low duration debt funds (Macaulay 6-12 months)",
    isFixedIncomeFactsheet: true,
    factsheetYield: 0.0727
  },
  {
    id: "NIFTY ULTRA SHORT DURATION DEBT INDEX",
    displayName: "NIFTY Ultra Short Duration Debt Index",
    officialName: "Nifty Ultra Short Duration Debt Index",
    apiName: "Nifty Ultra Short Duration Debt Index",
    category: "Debt",
    subCategory: "Ultra Short Duration",
    benchmarkCode: "NSE_D_208",
    source: "NSE Indices",
    description: "SEBI benchmark for ultra short duration debt funds (Macaulay 3-6 months)",
    isFixedIncomeFactsheet: true,
    factsheetYield: 0.0735
  },
  {
    id: "NIFTY MONEY MARKET INDEX",
    displayName: "NIFTY Money Market Index",
    officialName: "Nifty Money Market Index",
    apiName: "Nifty Money Market Index",
    category: "Debt",
    subCategory: "Money Market",
    benchmarkCode: "NSE_D_310",
    source: "NSE Indices",
    description: "SEBI benchmark for money market mutual funds (Maturity up to 1 yr)",
    isFixedIncomeFactsheet: true,
    factsheetYield: 0.0707
  },
  {
    id: "NIFTY LIQUID INDEX",
    displayName: "NIFTY Liquid Index",
    officialName: "Nifty Liquid Index",
    apiName: "Nifty Liquid Index",
    category: "Debt",
    subCategory: "Liquid",
    benchmarkCode: "NSE_D_345",
    source: "NSE Indices",
    description: "SEBI benchmark for liquid mutual funds (Maturity up to 91 days)",
    isFixedIncomeFactsheet: true,
    factsheetYield: 0.0690
  },
  {
    id: "NIFTY 1D RATE INDEX",
    displayName: "NIFTY 1D Rate Index",
    officialName: "Nifty 1D rate index",
    apiName: "Nifty 1D rate index",
    category: "Debt",
    subCategory: "Overnight",
    benchmarkCode: "NSE_D_442",
    source: "NSE Indices",
    description: "Tracks overnight risk-free call rate and TREPS returns"
  },
  {
    id: "NIFTY 10 YR BENCHMARK G-SEC",
    displayName: "NIFTY 10 yr Benchmark G-Sec",
    officialName: "Nifty 10 yr Benchmark G-Sec",
    apiName: "Nifty 10 yr Benchmark G-Sec",
    category: "Debt",
    subCategory: "Gilt / Sovereign",
    benchmarkCode: "NSE_D_19",
    source: "NSE Indices",
    description: "Tracks the performance of the current 10-year on-the-run Government of India bond"
  },
  {
    id: "NIFTY COMPOSITE G-SEC INDEX",
    displayName: "NIFTY Composite G-sec Index",
    officialName: "Nifty Composite G-sec Index",
    apiName: "Nifty Composite G-sec Index",
    category: "Debt",
    subCategory: "Gilt / Sovereign",
    benchmarkCode: "NSE_D_9",
    source: "NSE Indices",
    description: "Comprehensive benchmark tracking sovereign Government of India securities across maturities"
  },
  {
    id: "NIFTY 8-13 YR G-SEC",
    displayName: "NIFTY 8-13 yr G-Sec",
    officialName: "Nifty 8-13 yr G-Sec",
    apiName: "Nifty 8-13 yr G-Sec",
    category: "Debt",
    subCategory: "Gilt / Sovereign",
    benchmarkCode: "NSE_D_1",
    source: "NSE Indices",
    description: "Tracks Government of India bonds with residual maturity between 8 and 13 years"
  },
  {
    id: "NIFTY 4-8 YR G-SEC INDEX",
    displayName: "NIFTY 4-8 yr G-Sec Index",
    officialName: "Nifty 4-8 yr G-Sec Index",
    apiName: "Nifty 4-8 yr G-Sec Index",
    category: "Debt",
    subCategory: "Gilt / Sovereign",
    benchmarkCode: "NSE_D_6",
    source: "NSE Indices",
    description: "Tracks Government of India bonds with residual maturity between 4 and 8 years"
  },
  {
    id: "NIFTY 10 YEAR SDL INDEX",
    displayName: "NIFTY 10 Year SDL Index",
    officialName: "Nifty 10 Year SDL Index",
    apiName: "Nifty 10 Year SDL Index",
    category: "Debt",
    subCategory: "State Development Loan",
    benchmarkCode: "NSE_D_16",
    source: "NSE Indices",
    description: "Tracks 10-year State Development Loans issued by Indian State Governments"
  },
  {
    id: "NIFTY 5YR BENCHMARK G-SEC INDEX",
    displayName: "NIFTY 5yr Benchmark G-sec Index",
    officialName: "Nifty 5yr Benchmark G-sec Index",
    apiName: "Nifty 5yr Benchmark G-sec Index",
    category: "Debt",
    subCategory: "Gilt / Sovereign",
    benchmarkCode: "NSE_D_364",
    source: "NSE Indices",
    description: "Tracks the performance of the current 5-year on-the-run Government of India bond"
  },
  {
    id: "NIFTY 11-15 YR G-SEC INDEX",
    displayName: "NIFTY 11-15 yr G-Sec Index",
    officialName: "Nifty 11-15 yr G-Sec Index",
    apiName: "Nifty 11-15 yr G-Sec Index",
    category: "Debt",
    subCategory: "Gilt / Sovereign",
    benchmarkCode: "NSE_D_7",
    source: "NSE Indices",
    description: "Tracks Government of India bonds with residual maturity between 11 and 15 years"
  },
  {
    id: "NIFTY 15 YR AND ABOVE G-SEC INDEX",
    displayName: "NIFTY 15 yr and above G-Sec Index",
    officialName: "Nifty 15 yr and above G-Sec Index",
    apiName: "Nifty 15 yr and above G-Sec Index",
    category: "Debt",
    subCategory: "Gilt / Sovereign",
    benchmarkCode: "NSE_D_8",
    source: "NSE Indices",
    description: "Tracks long-term Government of India bonds with residual maturity of 15 years or more"
  }
];
