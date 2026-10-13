/**
 * FundPulse - AMFI Data Provider & Return Engine
 * 
 * Features:
 * 1. Complete Indian Mutual Fund scheme discovery (all categories and AMCs)
 * 2. Official AMFI Live AUM fetching & matching (sources daily AUM directly from AMFI)
 * 3. Regular / Direct plan pairing by scheme code
 * 4. Independent formula return calculation:
 *    Annualized Return = 4 * ((VT / V0)^(1 / (4 * T)) - 1) * 100
 *    where T = 1, 2, 3, 5, 10 years, V0 = historical NAV, VT = current NAV
 * 5. High-performance server-side caching of NAV time series
 * 6. Batch resolution for user's Custom Fund List
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { MASTER_ALLOWLIST, MASTER_CATEGORIES, CATEGORY_DISPLAY_ORDER } = require('../config/masterList');
const { fuzzyFilterSchemes } = require('../utils/fuzzySearch');

const CACHE_DIR = path.join(__dirname, '../cache');
const NAV_CACHE_FILE = path.join(CACHE_DIR, 'nav_history_cache.json');
const AUM_CACHE_FILE = path.join(CACHE_DIR, 'amfi_aum_cache.json');
const HIST_AUM_CACHE_FILE = path.join(CACHE_DIR, 'amfi_hist_aum_cache.json');
const NAVALL_CACHE_FILE = path.join(CACHE_DIR, 'navall_cache.txt');
const AMFI_CACHE_TTL = parseInt(process.env.AMFI_CACHE_TTL || '3600', 10); // 1 hour default (ensures freshly published NAVs are quickly reflected)

const CATEGORY_TO_AMFI_PAIRS = {
  'Large Cap': [{ category: 1, subCategory: 1 }],
  'Large & Mid Cap': [{ category: 1, subCategory: 2 }],
  'Flexi Cap': [{ category: 1, subCategory: 3 }],
  'Multi Cap': [{ category: 1, subCategory: 4 }],
  'Mid Cap': [{ category: 1, subCategory: 5 }],
  'Small Cap': [{ category: 1, subCategory: 6 }],
  'Value': [{ category: 1, subCategory: 7 }],
  'Contra': [{ category: 1, subCategory: 9 }],
  'ELSS': [{ category: 1, subCategory: 8 }],
  'Dividend Yield': [{ category: 1, subCategory: 10 }],
  'Focused': [{ category: 1, subCategory: 11 }],
  'Sectoral / Thematic': [
    { category: 1, subCategory: 12 },
    { category: 1, subCategory: 44 },
    { category: 1, subCategory: 45 }
  ],
  'Index Funds': [
    { category: 5, subCategory: 38 },
    { category: 5, subCategory: 39 }
  ],
  'Hybrid': [
    { category: 3, subCategory: 30 },
    { category: 3, subCategory: 31 },
    { category: 3, subCategory: 32 },
    { category: 3, subCategory: 33 },
    { category: 3, subCategory: 34 },
    { category: 3, subCategory: 35 },
    { category: 5, subCategory: 39 }
  ],
  'Debt / Liquid': [
    { category: 2, subCategory: 13 },
    { category: 2, subCategory: 14 },
    { category: 2, subCategory: 15 },
    { category: 2, subCategory: 16 },
    { category: 2, subCategory: 17 },
    { category: 2, subCategory: 18 },
    { category: 2, subCategory: 19 },
    { category: 2, subCategory: 20 },
    { category: 2, subCategory: 21 },
    { category: 2, subCategory: 22 },
    { category: 2, subCategory: 23 },
    { category: 2, subCategory: 24 },
    { category: 2, subCategory: 25 },
    { category: 2, subCategory: 26 },
    { category: 2, subCategory: 28 },
    { category: 2, subCategory: 29 }
  ],
  'Other': [
    { category: 4, subCategory: 36 },
    { category: 4, subCategory: 37 },
    { category: 5, subCategory: 39 }
  ]
};

// Helper for bounded-concurrency async mapping
async function pMap(items, mapper, concurrency = 12) {
  if (!items || items.length === 0) return [];
  const results = new Array(items.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await mapper(items[idx], idx);
    }
  }

  const workers = [];
  const workerCount = Math.min(concurrency, items.length);
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

// Parse DD-MM-YYYY or DD-MMM-YYYY or ISO (YYYY-MM-DD) date strings to Date object
function parseNavDate(dateStr) {
  if (!dateStr) return new Date(0);
  const str = String(dateStr).trim();
  const parts = str.split('-');
  if (parts.length === 3) {
    // Handle ISO YYYY-MM-DD format
    if (parts[0].length === 4) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      return new Date(year, month, day);
    }

    // Handle DD-MM-YYYY or DD-MMM-YYYY format
    const day = parseInt(parts[0], 10);
    const monthStr = parts[1];
    const year = parseInt(parts[2], 10);

    let month = parseInt(monthStr, 10) - 1;
    if (isNaN(month)) {
      const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      month = months.indexOf(monthStr.toLowerCase());
      if (month === -1) month = 0;
    }
    return new Date(year, month, day);
  }
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function formatAmfiDate(dateObj) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = months[dateObj.getMonth()];
  const year = dateObj.getFullYear();
  return `${day}-${month}-${year}`;
}

function cleanSchemeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    // Normalize compound category words and brand descriptors
    .replace(/\blarge\s*(&|and)\s*mid\s*cap\b/ig, 'largemidcap')
    .replace(/\blarge\s*(&|and)\s*midcap\b/ig, 'largemidcap')
    .replace(/\bmid\s*cap\b/ig, 'midcap')
    .replace(/\bsmall\s*cap\b/ig, 'smallcap')
    .replace(/\blarge\s*cap\b/ig, 'largecap')
    .replace(/\bmulti\s*cap\b/ig, 'multicap')
    .replace(/\bflexi\s*cap\b/ig, 'flexicap')
    .replace(/\btax\s*saver\b/ig, 'taxsaver')
    .replace(/\bblue\s*chip\b/ig, 'bluechip')
    .replace(/\bbalanced\s*advantage\b/ig, 'balancedadvantage')
    .replace(/\bmulti\s*asset\b/ig, 'multiasset')
    .replace(/\bfund\s*of\s*funds?\b/ig, 'fof')
    .replace(/\s*-\s*income\s*distribution\s*cum\s*capital\s*withdrawal\b/ig, ' ')
    .replace(/\bincome\s*distribution\s*cum\s*capital\s*withdrawal\b/ig, ' ')
    .replace(/\b(annual|monthly|quarterly|weekly|daily)\s+(idcw|dividend)\b/ig, ' ')
    .replace(/\b(idcw|dividend|bonus)\s*(payout|reinvestment|reinv)?\b/ig, ' ')
    .replace(/\b(payout|reinvestment|reinv)\b/ig, ' ')
    .replace(/\s*-\s*(direct|regular|institutional|retail|super\s*institutional)\s*(plan)?\b/ig, ' ')
    .replace(/\b(direct|regular)\s*plan\b/ig, ' ')
    .replace(/\b(growth\s*option|growth\s*plan|growth)\b/ig, ' ')
    .replace(/\bunclaimed\s*amounts\s*plan.*$/ig, ' ')
    .replace(/\b(option|plan)\b/ig, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Helper to determine scheme option type ('growth' | 'bonus' | 'idcw' | 'other')
 * STRICT RULE: Only classify as 'growth' if the scheme specifically has '- Growth' or option is Growth,
 * NOT just because 'growth' is part of the fund's brand name like 'Nippon India Growth Mid Cap Fund - Bonus Option'
 */
function determineSchemeOption(name) {
  if (!name) return 'other';
  const lower = name.toLowerCase().trim();

  // 1. If it specifies Bonus Option
  if (/\bbonus\b/i.test(lower)) {
    return 'bonus';
  }

  // 2. If it specifies IDCW Option or Dividend
  if (/\b(idcw|dividend|div)\b/i.test(lower)) {
    return 'idcw';
  }

  // 3. For Growth: Must specifically have "- Growth", "- Gr", "(Growth)", "(Gr)", "Growth Option", "Growth Plan",
  // or end with "- Growth" / "Growth" as the option suffix.
  // Avoid false matching when "Growth" is part of the fund's brand name (e.g. "Nippon India Growth Fund - Bonus Option").
  if (/(\s*-\s*growth\b|\s*-\s*gr\b|\bgrowth\s*option\b|\bgrowth\s*plan\b|\(growth\)|\(gr\)|\bregular\s+growth\b|\bdirect\s+growth\b|\s*-\s*growth\s*$|\bgrowth\s*$)/i.test(lower)) {
    return 'growth';
  }

  return 'other';
}

// User-specified formula: Annualized Return = 4 * ((VT / V0)^(1 / (4 * T)) - 1) * 100
function calculateFormulaReturn(V0, VT, T) {
  if (!V0 || !VT || V0 <= 0 || VT <= 0 || !T || T <= 0) return null;
  const ratio = VT / V0;
  const exponent = 1 / (4 * T);
  const val = 4 * (Math.pow(ratio, exponent) - 1);
  const result = val * 100;
  if (isNaN(result) || !isFinite(result)) return null;
  return Number(result.toFixed(2));
}

// User-specified Day Calculation formula:
// For D < 365 (< 1 Year): Simple / Absolute Return = ((VT - V0) / V0) * 100
// For D >= 365 (>= 1 Year): Quarterly Compounded Annualized Return = 4 * ((VT / V0)^(365 / (4 * D)) - 1) * 100
function calculateDayFormulaReturn(V0, VT, D) {
  if (!V0 || !VT || V0 <= 0 || VT <= 0 || !D || D <= 0) return null;
  let result;
  if (D < 365) {
    result = ((VT - V0) / V0) * 100;
  } else {
    const ratio = VT / V0;
    const exponent = 365 / (4 * D);
    const val = 4 * (Math.pow(ratio, exponent) - 1);
    result = val * 100;
  }
  if (isNaN(result) || !isFinite(result)) return null;
  return Number(result.toFixed(2));
}

function parseDaysList(customDays) {
  let daysList = [];
  if (Array.isArray(customDays)) {
    daysList = customDays.map(d => parseInt(d, 10)).filter(d => !isNaN(d) && d > 0);
  } else if (typeof customDays === 'string') {
    daysList = customDays
      .split(/[\s,]+/)
      .map(d => parseInt(d.trim(), 10))
      .filter(d => !isNaN(d) && d > 0);
  } else if (typeof customDays === 'number' && customDays > 0) {
    daysList = [customDays];
  }
  daysList = Array.from(new Set(daysList));
  if (daysList.length === 0) {
    daysList = [33, 50, 67];
  }
  return daysList;
}

function categorizeScheme(schemeCategory, schemeName) {
  const cat = (schemeCategory || '').toLowerCase();
  const name = (schemeName || '').toLowerCase();

  if (cat.includes('large & mid') || cat.includes('large and mid') || name.includes('large & mid') || name.includes('large and mid') || name.includes('vision')) return 'Large & Mid Cap';
  if (cat.includes('large cap') || name.includes('large cap') || name.includes('bluechip') || name.includes('frontline') || name.includes('top 100')) return 'Large Cap';
  if (cat.includes('mid cap') || name.includes('mid cap') || name.includes('midcap')) return 'Mid Cap';
  if (cat.includes('small cap') || name.includes('small cap') || name.includes('smallcap')) return 'Small Cap';
  if (cat.includes('multi cap') || name.includes('multi cap') || name.includes('multicap')) return 'Multi Cap';
  if (cat.includes('flexi cap') || name.includes('flexi cap') || name.includes('flexicap')) return 'Flexi Cap';
  if (cat.includes('value') || name.includes('value fund')) return 'Value';
  if (cat.includes('contra') || name.includes('contra')) return 'Contra';
  if (cat.includes('elss') || name.includes('elss') || name.includes('tax saver')) return 'ELSS';
  if (cat.includes('dividend yield') || name.includes('dividend yield')) return 'Dividend Yield';
  if (cat.includes('focused') || name.includes('focused')) return 'Focused';
  if (cat.includes('sectoral') || cat.includes('thematic') || name.includes('consumption') || name.includes('pharma') || name.includes('tech') || name.includes('banking') || name.includes('infra') || name.includes('innovation')) return 'Sectoral / Thematic';
  if (cat.includes('index') || cat.includes('etf') || name.includes('index') || name.includes('nifty') || name.includes('sensex') || name.includes('etf')) return 'Index Funds';
  if (cat.includes('hybrid') || cat.includes('arbitrage') || cat.includes('balanced') || name.includes('hybrid') || name.includes('balanced') || name.includes('arbitrage')) return 'Hybrid';
  if (cat.includes('liquid') || cat.includes('debt') || cat.includes('money market') || cat.includes('gilt') || cat.includes('overnight') || name.includes('liquid') || name.includes('overnight')) return 'Debt / Liquid';
  
  return 'Other';
}

class AmfiService {
  constructor() {
    this.masterSchemes = []; // Array of scheme objects
    this.schemeMap = new Map(); // id -> scheme object
    this.navHistoryCache = new Map(); // schemeCode -> { navList: [{date, nav}], timestamp }
    this.computedCache = new Map(); // cacheKey -> { data, timestamp }
    this.historicalAumCache = new Map(); // key `${dateStr}_${cat}_${subCat}` -> array of entries
    this.inFlightHistAumPromises = new Map();
    this.dateToEffectiveDateMap = new Map();
    this._saveCacheTimer = null;
    this._saveHistAumCacheTimer = null;
    // Initialize to yesterday's date dynamically
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    this.reportDate = formatAmfiDate(yesterday);
    this.lastUpdated = new Date().toISOString();
    this.isInitialized = false;
    this.inFlightInitPromise = null;
    this.inFlightPortalPromises = new Map();
    this.completedDateWindows = new Set();
    this.failedDateWindows = new Map(); // windowKey -> timestamp of failure (cooldown circuit breaker)
    this.inFlightMfapiPromises = new Map(); // schemeCode -> Promise (deduplicate concurrent MFAPI requests)

    // Load persistent NAV history cache from disk on startup
    this.loadDiskNavCache();
    // Load persistent historical AUM cache from disk on startup
    this.loadDiskHistAumCache();
  }

  loadDiskHistAumCache() {
    try {
      if (fs.existsSync(HIST_AUM_CACHE_FILE)) {
        const raw = fs.readFileSync(HIST_AUM_CACHE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          let count = 0;
          for (const [key, entries] of Object.entries(parsed)) {
            if (Array.isArray(entries)) {
              this.historicalAumCache.set(key, entries);
              count += entries.length;
            }
          }
          logger.info(`Loaded ${this.historicalAumCache.size} category-date snapshots with ${count} entries from historical AUM disk cache.`);
        }
      }
    } catch (err) {
      logger.warn(`Could not read historical AUM disk cache: ${err.message}`);
    }
  }

  scheduleHistAumCacheSave() {
    if (this._saveHistAumCacheTimer) return;
    this._saveHistAumCacheTimer = setTimeout(() => {
      this._saveHistAumCacheTimer = null;
      try {
        if (!fs.existsSync(CACHE_DIR)) {
          fs.mkdirSync(CACHE_DIR, { recursive: true });
        }
        const obj = {};
        for (const [key, val] of this.historicalAumCache.entries()) {
          obj[key] = val;
        }
        fs.writeFileSync(HIST_AUM_CACHE_FILE, JSON.stringify(obj), 'utf-8');
        logger.info(`Persisted ${this.historicalAumCache.size} historical AUM snapshots to disk cache.`);
      } catch (err) {
        logger.warn(`Failed to persist historical AUM cache to disk: ${err.message}`);
      }
    }, 4000);
  }

  loadDiskNavCache() {
    try {
      if (fs.existsSync(NAV_CACHE_FILE)) {
        const raw = fs.readFileSync(NAV_CACHE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          let count = 0;
          for (const [codeStr, entry] of Object.entries(parsed)) {
            const code = Number(codeStr);
            if (code && entry && Array.isArray(entry.navList)) {
              entry.navList.sort((a, b) => parseNavDate(b.date).getTime() - parseNavDate(a.date).getTime());
              this.navHistoryCache.set(code, entry);
              count++;
            }
          }
          logger.info(`Loaded ${count} schemes NAV history from disk cache.`);
        }
      }
    } catch (err) {
      logger.warn(`Could not read NAV history disk cache: ${err.message}`);
    }
  }

  scheduleNavCacheSave() {
    if (this._saveCacheTimer) return;
    this._saveCacheTimer = setTimeout(() => {
      this._saveCacheTimer = null;
      try {
        if (!fs.existsSync(CACHE_DIR)) {
          fs.mkdirSync(CACHE_DIR, { recursive: true });
        }
        const obj = {};
        for (const [code, val] of this.navHistoryCache.entries()) {
          obj[code] = val;
        }
        fs.writeFileSync(NAV_CACHE_FILE, JSON.stringify(obj), 'utf-8');
        logger.info(`Persisted ${this.navHistoryCache.size} schemes NAV history to disk cache.`);
      } catch (err) {
        logger.warn(`Failed to persist NAV history to disk: ${err.message}`);
      }
    }, 4000);
  }

  formatAUM(dailyAUM) {
    if (dailyAUM === null || dailyAUM === undefined || isNaN(dailyAUM)) {
      return 'N/A';
    }
    const num = Number(dailyAUM);
    if (num === 0) return 'N/A';
    const formattedNum = num.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return `₹${formattedNum} Cr`;
  }

  getAmfiPairsForScheme(scheme) {
    if (scheme.category && CATEGORY_TO_AMFI_PAIRS[scheme.category]) {
      return CATEGORY_TO_AMFI_PAIRS[scheme.category];
    }
    if (scheme.subCategoryId > 0 && scheme.subCategoryId <= 12) {
      return [{ category: 1, subCategory: scheme.subCategoryId }];
    }
    return [{ category: 1, subCategory: 1 }];
  }

  async fetchAmfiFundPerformancePair(dateStr, category, subCategory) {
    const cacheKey = `${dateStr}_${category}_${subCategory}`;
    if (this.historicalAumCache.has(cacheKey)) {
      const cached = this.historicalAumCache.get(cacheKey);
      if (Array.isArray(cached) && cached.length > 0) {
        return cached;
      }
    }

    if (this.inFlightHistAumPromises.has(cacheKey)) {
      return this.inFlightHistAumPromises.get(cacheKey);
    }

    const fetchPromise = (async () => {
      try {
        const parsedDate = parseNavDate(dateStr);
        if (isNaN(parsedDate.getTime()) || parsedDate.getTime() === 0) {
          return [];
        }

        // Try candidate date and roll back up to 6 days for weekends/market holidays
        for (let offset = 0; offset <= 6; offset++) {
          const cand = new Date(parsedDate);
          cand.setDate(parsedDate.getDate() - offset);
          const candStr = formatAmfiDate(cand);
          const candCacheKey = `${candStr}_${category}_${subCategory}`;

          if (this.historicalAumCache.has(candCacheKey)) {
            const cachedCand = this.historicalAumCache.get(candCacheKey);
            if (Array.isArray(cachedCand) && cachedCand.length > 0) {
              if (candStr !== dateStr) {
                this.historicalAumCache.set(cacheKey, cachedCand);
              }
              return cachedCand;
            }
          }

          const res = await fetch('https://www.amfiindia.com/gateway/pollingsebi/api/amfi/fundperformance', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Accept': 'application/json, text/plain, */*',
              'Origin': 'https://www.amfiindia.com',
              'Referer': 'https://www.amfiindia.com/polling/amfi/'
            },
            body: JSON.stringify({
              maturityType: 1,
              category,
              subCategory,
              mfid: 0,
              reportDate: candStr
            }),
            signal: AbortSignal.timeout(8000)
          });

          if (res.ok) {
            const json = await res.json();
            const list = json.data || [];
            if (list.length > 0) {
              const entries = [];
              list.forEach(item => {
                if (item.schemeName) {
                  const rawAum = (item.dailyAUM !== null && item.dailyAUM !== undefined && item.dailyAUM !== '')
                    ? item.dailyAUM
                    : ((item.preMonthAvgAUM !== null && item.preMonthAvgAUM !== undefined && item.preMonthAvgAUM !== '')
                      ? item.preMonthAvgAUM
                      : item.preMonthAUM);
                  const parsedAum = (rawAum !== null && rawAum !== undefined && rawAum !== '' && !isNaN(Number(rawAum))) ? Number(rawAum) : null;
                  entries.push({
                    rawName: item.schemeName,
                    cleanName: cleanSchemeName(item.schemeName),
                    dailyAUM: parsedAum,
                    benchmark: item.benchmark ? String(item.benchmark).trim() : 'N/A',
                    riskometerScheme: item.riskometerScheme ? String(item.riskometerScheme).trim() : 'N/A',
                    riskometerBenchmark: item.riskometerBenchmark ? String(item.riskometerBenchmark).trim() : 'N/A',
                    navDate: item.navDate ? String(item.navDate) : candStr,
                    navRegular: item.navRegular ? Number(item.navRegular) : null,
                    navDirect: item.navDirect ? Number(item.navDirect) : null,
                    preNavRegular: item.preNavRegular ? Number(item.preNavRegular) : null,
                    preNavDirect: item.preNavDirect ? Number(item.preNavDirect) : null,
                    return1YearRegular: item.return1YearRegular ? Number(item.return1YearRegular) : null,
                    return1YearDirect: item.return1YearDirect ? Number(item.return1YearDirect) : null,
                    return3YearRegular: item.return3YearRegular ? Number(item.return3YearRegular) : null,
                    return3YearDirect: item.return3YearDirect ? Number(item.return3YearDirect) : null,
                    return5YearRegular: item.return5YearRegular ? Number(item.return5YearRegular) : null,
                    return5YearDirect: item.return5YearDirect ? Number(item.return5YearDirect) : null,
                    return10YearRegular: item.return10YearRegular ? Number(item.return10YearRegular) : null,
                    return10YearDirect: item.return10YearDirect ? Number(item.return10YearDirect) : null,
                    benchmarkReturn1Year: item.return1YearBenchmark ? Number(item.return1YearBenchmark) : null,
                    benchmarkReturn3Year: item.return3YearBenchmark ? Number(item.return3YearBenchmark) : null,
                    benchmarkReturn5Year: item.return5YearBenchmark ? Number(item.return5YearBenchmark) : null,
                    benchmarkReturn10Year: item.return10YearBenchmark ? Number(item.return10YearBenchmark) : null
                  });
                }
              });

              if (entries.length > 0) {
                this.historicalAumCache.set(candCacheKey, entries);
                if (candStr !== dateStr) {
                  this.historicalAumCache.set(cacheKey, entries);
                }
                this.scheduleHistAumCacheSave();
                return entries;
              }
            }
          }
        }
      } catch (err) {
        logger.warn(`Failed to fetch AMFI Fund Performance for ${cacheKey}: ${err.message}`);
      } finally {
        this.inFlightHistAumPromises.delete(cacheKey);
      }
      return [];
    })();

    this.inFlightHistAumPromises.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  async resolveHistoricalAumForSchemes(targetDate, schemes) {
    if (!targetDate || !schemes || schemes.length === 0) {
      return null;
    }

    const parsedDate = parseNavDate(targetDate);
    if (isNaN(parsedDate.getTime()) || parsedDate.getTime() === 0) {
      return null;
    }

    const targetFormatted = formatAmfiDate(parsedDate);
    // If target date is on or after live report date (e.g. today or future), use live registry AUM directly
    if (this.reportDate) {
      const repDate = parseNavDate(this.reportDate);
      if (!isNaN(repDate.getTime()) && parsedDate.getTime() >= repDate.getTime()) {
        return null;
      }
    }

    // Determine needed pairs across schemes
    const pairMap = new Map();
    schemes.forEach(s => {
      const pairs = this.getAmfiPairsForScheme(s);
      pairs.forEach(p => {
        pairMap.set(`${p.category}_${p.subCategory}`, p);
      });
    });
    const neededPairs = Array.from(pairMap.values());
    if (neededPairs.length === 0) return null;

    // Fetch all needed pairs with bounded concurrency
    const allEntries = [];
    await pMap(neededPairs, async (p) => {
      const entries = await this.fetchAmfiFundPerformancePair(targetFormatted, p.category, p.subCategory);
      if (entries && entries.length > 0) {
        for (const e of entries) allEntries.push(e);
      }
    }, 6);

    if (allEntries.length === 0) return null;

    // Build indexing maps for sub-millisecond matching
    const cleanMap = new Map();
    const tokenIndex = new Map();
    const stopWords = new Set(['fund', 'direct', 'regular', 'plan', 'growth', 'option', 'scheme', 'series']);

    allEntries.forEach(a => {
      const cName = cleanSchemeName(a.rawName || a.schemeName || a.cleanName);
      a.cleanName = cName;
      cleanMap.set(cName, a);
      const tokens = cName.split(' ').filter(w => w.length > 2 && !stopWords.has(w));
      a._tokens = tokens;
      a._tokensSet = new Set(tokens);
      tokens.forEach(t => {
        if (!tokenIndex.has(t)) tokenIndex.set(t, []);
        tokenIndex.get(t).push(a);
      });
    });

    const findMatch = (displayName) => {
      if (!displayName) return null;
      const sClean = cleanSchemeName(displayName);
      if (cleanMap.has(sClean)) return cleanMap.get(sClean);

      const sTokens = sClean.split(' ').filter(w => w.length > 2 && !stopWords.has(w));
      if (sTokens.length >= 2) {
        const primaryToken = sTokens[0];
        const candidates = tokenIndex.get(primaryToken);
        if (candidates && candidates.length > 0) {
          const categoryTokens = ['largemidcap', 'largecap', 'midcap', 'smallcap', 'multicap', 'flexicap', 'elss', 'taxsaver', 'overnight', 'liquid', 'gilt', 'fof'];
          const sCatTokens = sTokens.filter(t => categoryTokens.includes(t));

          for (const a of candidates) {
            const aCatTokens = a._tokens.filter(t => categoryTokens.includes(t));
            if (sCatTokens.length > 0 && aCatTokens.length > 0 && sCatTokens[0] !== aCatTokens[0]) {
              continue;
            }
            if ((a.cleanName.length > 5 && sClean.includes(a.cleanName)) ||
                (sClean.length > 5 && a.cleanName.includes(sClean))) {
              return a;
            }
          }
          let best = null;
          let highestOverlap = 0;
          for (const a of candidates) {
            const aCatTokens = a._tokens.filter(t => categoryTokens.includes(t));
            if (sCatTokens.length > 0 && aCatTokens.length > 0 && sCatTokens[0] !== aCatTokens[0]) {
              continue;
            }
            let overlap = 0;
            for (const t of sTokens) {
              if (a._tokensSet.has(t)) overlap++;
            }
            const ratio = overlap / Math.max(sTokens.length, a._tokens.length);
            if (overlap >= 2 && ratio >= 0.55 && overlap > highestOverlap) {
              highestOverlap = overlap;
              best = a;
            }
          }
          if (best) return best;
        }
      }
      return null;
    };

    const resultMap = new Map();
    schemes.forEach(s => {
      const match = findMatch(s.displayName) || findMatch(s.amfiSchemeName);
      if (match) {
        resultMap.set(s.id, match);
      }
    });

    const effectiveDateStr = allEntries[0]?.navDate || targetFormatted;
    return {
      map: resultMap,
      effectiveDate: effectiveDateStr
    };
  }

  /**
   * Resolves the latest available mutual fund NAV date across India from authoritative feeds
   */
  async resolveLatestNavDate() {
    try {
      const res = await fetch('https://www.amfiindia.com/spages/NAVAll.txt', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(10000)
      });
      if (res.ok) {
        const text = await res.text();
        const lines = text.split('\n');
        for (let l of lines) {
          const parts = l.trim().split(';');
          if (parts.length >= 8 && parts[7]?.trim()) {
            return parts[7].trim();
          }
        }
      }
    } catch (err) {
      logger.warn(`Could not resolve latest NAV date from official AMFI NAVAll.txt: ${err.message}`);
    }
    return null;
  }

  /**
   * Fetch Live AUM, Benchmarks, and Riskometers directly from official AMFI Fund Performance endpoint
   */
  /**
   * Fetch Live AUM, Benchmarks, and Riskometers directly from official AMFI Fund Performance endpoint
   * Covers all 5 AMFI Categories: Equity, Debt, Hybrid, Solution Oriented, and Other (Index/ETFs/FoFs)
   */
  async fetchAmfiLiveAumData() {
    let diskCache = null;
    try {
      if (fs.existsSync(AUM_CACHE_FILE)) {
        const raw = fs.readFileSync(AUM_CACHE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.entries) && parsed.entries.length > 0) {
          diskCache = parsed;
          logger.info(`Loaded AMFI AUM disk cache with ${parsed.entries.length} schemes.`);
          const cacheAgeMs = Date.now() - new Date(parsed.savedAt || 0).getTime();
          if (parsed.entries.length >= 1500 && cacheAgeMs < 24 * 60 * 60 * 1000) {
            logger.info(`Using warm AMFI AUM disk cache with ${parsed.entries.length} schemes (saved ${Math.round(cacheAgeMs / 60000)}m ago).`);
            const latestNavDate = await this.resolveLatestNavDate();
            this.reportDate = latestNavDate || parsed.reportDate;
            return parsed.entries;
          }
        }
      }
    } catch (e) {
      logger.warn(`Could not read AMFI AUM disk cache: ${e.message}`);
    }

    const AMFI_QUERY_PAIRS = [
      // Category 1: Equity
      { category: 1, subCategory: 1 }, { category: 1, subCategory: 2 }, { category: 1, subCategory: 3 }, { category: 1, subCategory: 4 },
      { category: 1, subCategory: 5 }, { category: 1, subCategory: 6 }, { category: 1, subCategory: 7 }, { category: 1, subCategory: 8 },
      { category: 1, subCategory: 9 }, { category: 1, subCategory: 10 }, { category: 1, subCategory: 11 }, { category: 1, subCategory: 12 },
      { category: 1, subCategory: 44 }, { category: 1, subCategory: 45 },

      // Category 2: Debt (Liquid, Overnight, Gilt, Money Market, Corporate Bond, etc.)
      { category: 2, subCategory: 13 }, { category: 2, subCategory: 14 }, { category: 2, subCategory: 15 }, { category: 2, subCategory: 16 },
      { category: 2, subCategory: 17 }, { category: 2, subCategory: 18 }, { category: 2, subCategory: 19 }, { category: 2, subCategory: 20 },
      { category: 2, subCategory: 21 }, { category: 2, subCategory: 22 }, { category: 2, subCategory: 23 }, { category: 2, subCategory: 24 },
      { category: 2, subCategory: 25 }, { category: 2, subCategory: 26 }, { category: 2, subCategory: 28 }, { category: 2, subCategory: 29 },
      { category: 2, subCategory: 46 },

      // Category 3: Hybrid (Aggressive, Conservative, Arbitrage, Balanced Advantage, etc.)
      { category: 3, subCategory: 30 }, { category: 3, subCategory: 31 }, { category: 3, subCategory: 32 }, { category: 3, subCategory: 33 },
      { category: 3, subCategory: 34 }, { category: 3, subCategory: 35 }, { category: 3, subCategory: 40 },

      // Category 4: Solution Oriented (Children, Retirement)
      { category: 4, subCategory: 36 }, { category: 4, subCategory: 37 }, { category: 4, subCategory: 39 },

      // Category 5: Other (Index Funds, ETFs, FoFs)
      { category: 5, subCategory: 38 }, { category: 5, subCategory: 39 }
    ];

    const candidateDates = [];
    const today = new Date();
    for (let dayOffset = 0; dayOffset <= 6; dayOffset++) {
      const candidateDate = new Date(today);
      candidateDate.setDate(today.getDate() - dayOffset);
      candidateDates.push(formatAmfiDate(candidateDate));
    }

    const collectedMap = new Map();
    let resolvedDate = null;

    await pMap(AMFI_QUERY_PAIRS, async (p) => {
      for (const dateStr of candidateDates) {
        try {
          const res = await fetch('https://www.amfiindia.com/gateway/pollingsebi/api/amfi/fundperformance', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Origin': 'https://www.amfiindia.com',
              'Referer': 'https://www.amfiindia.com/polling/amfi/'
            },
            body: JSON.stringify({
              maturityType: 1,
              category: p.category,
              subCategory: p.subCategory,
              mfid: 0,
              reportDate: dateStr
            }),
            signal: AbortSignal.timeout(6000)
          });

          if (res.ok) {
            const json = await res.json();
            const list = json.data || [];
            if (list.length > 0) {
              if (!resolvedDate) resolvedDate = dateStr;
              list.forEach(item => {
                if (item.schemeName) {
                  const rawAum = (item.dailyAUM !== null && item.dailyAUM !== undefined && item.dailyAUM !== '')
                    ? item.dailyAUM
                    : ((item.preMonthAvgAUM !== null && item.preMonthAvgAUM !== undefined && item.preMonthAvgAUM !== '')
                      ? item.preMonthAvgAUM
                      : item.preMonthAUM);
                  const parsedAum = (rawAum !== null && rawAum !== undefined && rawAum !== '' && !isNaN(Number(rawAum))) ? Number(rawAum) : null;
                  collectedMap.set(item.schemeName, {
                    rawName: item.schemeName,
                    cleanName: cleanSchemeName(item.schemeName),
                    dailyAUM: parsedAum,
                    benchmark: item.benchmark ? String(item.benchmark).trim() : 'N/A',
                    riskometerScheme: item.riskometerScheme ? String(item.riskometerScheme).trim() : 'N/A',
                    navRegular: item.navRegular ? Number(item.navRegular) : null,
                    navDirect: item.navDirect ? Number(item.navDirect) : null
                  });
                }
              });
              break;
            }
          }
        } catch (err) {}
      }
    }, 6);

    let amfiEntries = Array.from(collectedMap.values());

    if (amfiEntries.length >= 1000) {
      try {
        if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(AUM_CACHE_FILE, JSON.stringify({
          savedAt: new Date().toISOString(),
          reportDate: resolvedDate,
          entries: amfiEntries
        }), 'utf-8');
        logger.info(`Persisted ${amfiEntries.length} complete AMFI AUM entries across all categories to disk cache.`);
      } catch (err) {
        logger.warn(`Failed to write AMFI AUM cache to disk: ${err.message}`);
      }
    } else if (diskCache && Array.isArray(diskCache.entries) && diskCache.entries.length > 0) {
      logger.info(`Using disk-cached ${diskCache.entries.length} AMFI AUM entries.`);
      amfiEntries = diskCache.entries;
      resolvedDate = diskCache.reportDate;
    }

    // Resolve latest published NAV date across Indian mutual funds
    const latestNavDate = await this.resolveLatestNavDate();
    if (latestNavDate) {
      this.reportDate = latestNavDate;
    } else if (resolvedDate) {
      this.reportDate = resolvedDate;
    }

    return amfiEntries;
  }

  /**
   * Initialize and build the master index of all Indian Mutual Fund schemes with real AMFI AUM
   */
  async initializeMasterRegistry() {
    if (this.isInitialized && this.masterSchemes.length > 0) return;

    if (this.inFlightInitPromise) {
      return this.inFlightInitPromise;
    }

    this.inFlightInitPromise = (async () => {
      logger.info('Initializing complete Indian Mutual Fund Master Scheme Registry...');
      const startTime = Date.now();

      try {
        // 1. Fetch live AMFI AUM dataset across all categories
        const amfiList = await this.fetchAmfiLiveAumData();

        // 2. Fetch full master scheme directory directly from official AMFI NAVAll.txt with persistent disk fallback
        let text = '';
        try {
          const res = await fetch('https://www.amfiindia.com/spages/NAVAll.txt', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            signal: AbortSignal.timeout(20000)
          });
          if (res.ok) {
            text = await res.text();
            if (text && text.length > 1000) {
              try {
                if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
                fs.writeFileSync(NAVALL_CACHE_FILE, text, 'utf-8');
              } catch (writeErr) {
                logger.warn(`Could not persist navall_cache.txt: ${writeErr.message}`);
              }
            }
          }
        } catch (fetchErr) {
          logger.warn(`Could not fetch live NAVAll.txt from AMFI: ${fetchErr.message}. Attempting disk cache fallback...`);
        }

        if (!text && fs.existsSync(NAVALL_CACHE_FILE)) {
          text = fs.readFileSync(NAVALL_CACHE_FILE, 'utf-8');
          logger.info(`Loaded master scheme list from disk cache (${NAVALL_CACHE_FILE}).`);
        }

        if (!text) throw new Error('Failed to retrieve master scheme list from AMFI and no disk cache available.');
        const lines = text.split('\n');
        const rawList = [];
        let currentCategory = '';
        let currentAmc = '';
        let detectedNavDate = null;

        for (let line of lines) {
          line = line.trim();
          if (!line) continue;

          if (line.startsWith('Open Ended Schemes') || line.startsWith('Close Ended Schemes') || line.startsWith('Interval Fund')) {
            currentCategory = line;
            continue;
          }

          if (line.endsWith('Mutual Fund') || line.includes('Mutual Fund')) {
            currentAmc = line;
            continue;
          }

          const parts = line.split(';');
          if (parts.length >= 6 && !isNaN(Number(parts[0]))) {
            const schemeCode = Number(parts[0]);
            const schemeName = parts[3]?.trim();
            const plan = parts[4]?.trim() || '';
            const option = parts[5]?.trim() || '';
            const nav = parseFloat(parts[6]) || null;
            const navDate = parts[7]?.trim() || '';

            if (schemeCode && schemeName) {
              if (navDate && !detectedNavDate) {
                detectedNavDate = navDate;
              }
              let fullName = schemeName;
              if (plan && !fullName.toLowerCase().includes(plan.toLowerCase())) {
                fullName += ` - ${plan}`;
              }
              if (option && !fullName.toLowerCase().includes(option.toLowerCase())) {
                fullName += ` - ${option}`;
              }

              rawList.push({
                schemeCode,
                schemeName: fullName,
                baseSchemeName: schemeName,
                plan,
                option,
                currentNav: nav,
                navDate,
                category: currentCategory,
                amc: currentAmc
              });
            }
          }
        }
        if (detectedNavDate) {
          this.reportDate = detectedNavDate;
        }

        logger.info(`Retrieved ${rawList.length} total raw schemes from official AMFI NAVAll.txt.`);

        const pairedMap = new Map();

        const stopWords = new Set([
          'fund', 'scheme', 'plan', 'growth', 'option', 'plus', 'direct', 'regular',
          'retail', 'institutional', 'idcw', 'dividend', 'income', 'distribution',
          'cum', 'capital', 'withdrawal', 'payout', 'reinvestment', 'reinv'
        ]);

        // Build cleanName -> amfiItem map for instant exact matching
        const cleanToAmfiMap = new Map();
        // Inverted index for fast candidate lookup by primary/brand token
        const amfiTokenIndex = new Map();
        const CATEGORY_TOKENS_SET = new Set(['largemidcap', 'largecap', 'midcap', 'smallcap', 'multicap', 'flexicap', 'elss', 'taxsaver', 'overnight', 'liquid', 'gilt', 'fof']);

        amfiList.forEach(a => {
          const cName = cleanSchemeName(a.rawName || a.schemeName || a.cleanName);
          a.cleanName = cName;
          if (!cleanToAmfiMap.has(cName)) {
            cleanToAmfiMap.set(cName, a);
          }
          a._tokens = cName.split(' ').filter(w => w.length > 2 && !stopWords.has(w));
          a._tokensSet = new Set(a._tokens);
          a._catToken = a._tokens.find(t => CATEGORY_TOKENS_SET.has(t)) || null;

          a._tokens.forEach(t => {
            if (!amfiTokenIndex.has(t)) {
              amfiTokenIndex.set(t, []);
            }
            amfiTokenIndex.get(t).push(a);
          });
        });

        // Build histCleanMap for instant O(1) historical snapshot fallback
        const histCleanMap = new Map();
        if (this.historicalAumCache && this.historicalAumCache.size > 0) {
          for (const entries of this.historicalAumCache.values()) {
            if (Array.isArray(entries)) {
              for (const e of entries) {
                const eClean = cleanSchemeName(e.rawName || e.schemeName || e.cleanName);
                if (!histCleanMap.has(eClean)) histCleanMap.set(eClean, e);
              }
            }
          }
        }

        // Sub-millisecond matching helper to associate scheme names with AMFI AUM records
        const findAmfiMatch = (displayName) => {
          if (!displayName) return null;
          const sClean = cleanSchemeName(displayName);

          // 1. Exact clean match
          if (cleanToAmfiMap.has(sClean)) return cleanToAmfiMap.get(sClean);

          // 2. Token-indexed candidate search
          const sTokens = sClean.split(' ').filter(w => w.length > 2 && !stopWords.has(w));
          if (sTokens.length >= 2) {
            const primaryToken = sTokens[0];
            const candidates = amfiTokenIndex.get(primaryToken);
            if (candidates && candidates.length > 0) {
              const sCatToken = sTokens.find(t => CATEGORY_TOKENS_SET.has(t)) || null;

              // Substring check on candidate subset
              for (const a of candidates) {
                if (sCatToken && a._catToken && sCatToken !== a._catToken) continue;
                if ((a.cleanName.length > 5 && sClean.includes(a.cleanName)) ||
                    (sClean.length > 5 && a.cleanName.includes(sClean))) {
                  return a;
                }
              }

              // Overlap check on candidate subset
              let best = null;
              let highestOverlap = 0;
              for (const a of candidates) {
                if (sCatToken && a._catToken && sCatToken !== a._catToken) continue;
                let overlap = 0;
                for (const t of sTokens) {
                  if (a._tokensSet.has(t)) overlap++;
                }
                const ratio = overlap / Math.max(sTokens.length, a._tokens.length);
                if (overlap >= 2 && ratio >= 0.50 && overlap > highestOverlap) {
                  highestOverlap = overlap;
                  best = a;
                }
              }
              if (best) return best;
            }
          }

          // 3. Fallback to historical AUM cache snapshots in O(1)
          if (histCleanMap.has(sClean)) return histCleanMap.get(sClean);

          return null;
        };

        // 1. Seed the 34 allowlist schemes to guarantee exact IDs, display names, and AMFI AUM
        MASTER_ALLOWLIST.forEach(allowItem => {
          const match = findAmfiMatch(allowItem.displayName) || findAmfiMatch(allowItem.amfiSchemeName);
          const aumVal = match && match.dailyAUM ? match.dailyAUM : (allowItem.seedAUM || null);

          const item = {
            id: allowItem.id,
            displayName: allowItem.displayName,
            amfiSchemeName: allowItem.amfiSchemeName,
            amcName: allowItem.amcName,
            category: allowItem.category,
            schemeOption: determineSchemeOption(allowItem.displayName),
            subCategoryId: allowItem.subCategoryId,
            regularSchemeCode: allowItem.regularSchemeCode || null,
            directSchemeCode: allowItem.directSchemeCode || null,
            dailyAUMRaw: aumVal,
            dailyAUMFormatted: this.formatAUM(aumVal),
            benchmark: (match && match.benchmark !== 'N/A') ? match.benchmark : (allowItem.seedBenchmark || 'NIFTY 500 TRI'),
            riskometerScheme: (match && match.riskometerScheme !== 'N/A') ? match.riskometerScheme : 'Very High',
            navRegular: (match && match.navRegular) ? match.navRegular : (allowItem.seedNavReg || 100.0),
            navDirect: (match && match.navDirect) ? match.navDirect : (allowItem.seedNavDir || 110.0),
            seedReturns: allowItem.seedReturns || null,
            amfiMatch: match || null
          };
          pairedMap.set(allowItem.id, item);
        });

        // Build code-to-item and cleanName-to-item maps for O(1) fast lookup
        const codeToItemMap = new Map();
        const allowlistCleanMap = new Map();

        pairedMap.forEach(item => {
          if (item.regularSchemeCode) codeToItemMap.set(Number(item.regularSchemeCode), item);
          if (item.directSchemeCode) codeToItemMap.set(Number(item.directSchemeCode), item);
          if (item.displayName) allowlistCleanMap.set(cleanSchemeName(item.displayName), item);
          if (item.amfiSchemeName) allowlistCleanMap.set(cleanSchemeName(item.amfiSchemeName), item);
        });

        // 2. Pair schemes dynamically across all AMCs and option types (Growth, Bonus, IDCW)
        rawList.forEach(s => {
          if (!s.schemeName || !s.schemeCode) return;
          const name = s.schemeName.trim();
          const isDirect = name.toLowerCase().includes('direct');
          const code = Number(s.schemeCode);

          // Check if this scheme code already belongs to an existing item (e.g. from allowlist)
          if (codeToItemMap.has(code)) {
            const existing = codeToItemMap.get(code);
            if (isDirect && !existing.directSchemeCode) {
              existing.directSchemeCode = code;
            } else if (!isDirect && !existing.regularSchemeCode) {
              existing.regularSchemeCode = code;
            }
            return;
          }
          
          // Generate clean base scheme name
          const baseName = name
            .replace(/\s*-\s*Direct\s*Plan\s*/ig, ' ')
            .replace(/\s*-\s*Regular\s*Plan\s*/ig, ' ')
            .replace(/\s*Direct\s*Plan\s*/ig, ' ')
            .replace(/\s*Regular\s*Plan\s*/ig, ' ')
            .replace(/\s*-\s*Direct\s*/ig, ' ')
            .replace(/\s*-\s*Regular\s*/ig, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          const slugId = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          const sClean = cleanSchemeName(baseName);

          // Check if slugId matches an existing item, or matches an allowlist item in O(1)
          let existing = pairedMap.get(slugId) || allowlistCleanMap.get(sClean);
          if (existing && !pairedMap.has(slugId)) {
            pairedMap.set(slugId, existing);
          }

          if (!existing) {
            const match = findAmfiMatch(baseName);
            // Extract AMC Name from scheme prefix
            const amcParts = baseName.split(' ');
            const amcName = amcParts.length > 2 ? `${amcParts[0]} ${amcParts[1]} Mutual Fund` : 'Mutual Fund';
            const cat = categorizeScheme('', baseName);
            const schemeOption = determineSchemeOption(baseName);
            const aumVal = match ? match.dailyAUM : null;

            const newItem = {
              id: slugId,
              displayName: baseName,
              amfiSchemeName: baseName,
              amcName,
              category: cat,
              schemeOption,
              subCategoryId: 0,
              regularSchemeCode: isDirect ? null : code,
              directSchemeCode: isDirect ? code : null,
              dailyAUMRaw: aumVal,
              dailyAUMFormatted: this.formatAUM(aumVal),
              benchmark: match ? match.benchmark : 'N/A',
              riskometerScheme: match ? match.riskometerScheme : 'N/A',
              navRegular: isDirect ? null : (s.currentNav || null),
              navDirect: isDirect ? (s.currentNav || null) : null,
              amfiMatch: match || null
            };

            pairedMap.set(slugId, newItem);
            codeToItemMap.set(code, newItem);
          } else {
            if (!existing.amfiMatch) existing.amfiMatch = findAmfiMatch(baseName);
            if (isDirect && !existing.directSchemeCode) {
              existing.directSchemeCode = code;
              if (!existing.navDirect && s.currentNav) existing.navDirect = s.currentNav;
              codeToItemMap.set(code, existing);
            } else if (!isDirect && !existing.regularSchemeCode) {
              existing.regularSchemeCode = code;
              if (!existing.navRegular && s.currentNav) existing.navRegular = s.currentNav;
              codeToItemMap.set(code, existing);
            }
          }
        });

        this.masterSchemes = Array.from(new Set(pairedMap.values()));
        this.schemeMap = pairedMap;
        this.isInitialized = true;
        this.lastUpdated = new Date().toISOString();

        logger.info(`Master Scheme Registry successfully built! Total paired schemes: ${this.masterSchemes.length} in ${Date.now() - startTime}ms.`);
      } catch (err) {
        logger.error('Failed to initialize master scheme registry:', err);
        // Fallback to allowlist
        this.masterSchemes = MASTER_ALLOWLIST.map(allowItem => ({
          id: allowItem.id,
          displayName: allowItem.displayName,
          amfiSchemeName: allowItem.amfiSchemeName,
          amcName: allowItem.amcName,
          category: allowItem.category,
          schemeOption: determineSchemeOption(allowItem.displayName),
          subCategoryId: allowItem.subCategoryId,
          regularSchemeCode: allowItem.regularSchemeCode || null,
          directSchemeCode: allowItem.directSchemeCode || null,
          dailyAUMRaw: allowItem.seedAUM || null,
          dailyAUMFormatted: this.formatAUM(allowItem.seedAUM || null),
          benchmark: allowItem.seedBenchmark || 'NIFTY 500 TRI',
          riskometerScheme: 'Very High',
          navRegular: allowItem.seedNavReg || 100.0,
          navDirect: allowItem.seedNavDir || 110.0,
          seedReturns: allowItem.seedReturns || null
        }));
        this.masterSchemes.forEach(s => this.schemeMap.set(s.id, s));
        this.isInitialized = true;
      } finally {
        this.inFlightInitPromise = null;
      }
    })();

    return this.inFlightInitPromise;
  }

  /**
   * Fetch and ingest an official AMFI date window for all schemes with in-flight promise deduplication
   */
  async fetchAmfiPortalDateWindow(fromStr, toStr) {
    const key = `${fromStr}_${toStr}`;
    if (this.completedDateWindows.has(key)) {
      return;
    }
    // Circuit breaker: If this window failed recently (within 5 minutes), avoid hammering AMFI repeatedly
    const lastFailed = this.failedDateWindows.get(key);
    if (lastFailed && (Date.now() - lastFailed < 5 * 60 * 1000)) {
      return;
    }
    if (this.inFlightPortalPromises.has(key)) {
      return this.inFlightPortalPromises.get(key);
    }

    const promise = (async () => {
      try {
        const url = `https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?frmdt=${fromStr}&todt=${toStr}`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          signal: AbortSignal.timeout(30000)
        });
        if (!res.ok) {
          this.failedDateWindows.set(key, Date.now());
          return;
        }

        const text = await res.text();
        const lines = text.split('\n');
        for (const l of lines) {
          const parts = l.split(';');
          if (parts.length >= 7 && !isNaN(Number(parts[0]))) {
            const sCode = Number(parts[0]);
            const nav = parseFloat(parts[6]);
            const date = parts[7]?.trim();
            if (!isNaN(nav) && date) {
              if (!this.navHistoryCache.has(sCode)) {
                this.navHistoryCache.set(sCode, { navList: [], timestamp: Date.now() });
              }
              const sEntry = this.navHistoryCache.get(sCode);
              if (Array.isArray(sEntry.navList) && !sEntry.navList.some(r => r.date === date)) {
                sEntry.navList.push({ date, nav });
              }
            }
          }
        }
        this.completedDateWindows.add(key);
        this.failedDateWindows.delete(key);
      } catch (err) {
        this.failedDateWindows.set(key, Date.now());
        logger.warn(`Error querying official AMFI portal for date range ${fromStr} to ${toStr}: ${err.message}`);
      } finally {
        this.inFlightPortalPromises.delete(key);
      }
    })();

    this.inFlightPortalPromises.set(key, promise);
    return promise;
  }

  /**
   * Fetch complete historical NAV series from high-speed MFAPI fallback
   * Endpoint: https://api.mfapi.in/mf/${schemeCode}
   */
  async fetchMfapiNavHistory(schemeCode) {
    const code = Number(schemeCode);
    if (!code) return [];

    if (this.inFlightMfapiPromises.has(code)) {
      return this.inFlightMfapiPromises.get(code);
    }

    const promise = (async () => {
      try {
        const url = `https://api.mfapi.in/mf/${code}`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          signal: AbortSignal.timeout(12000)
        });
        if (!res.ok) {
          logger.warn(`MFAPI returned HTTP ${res.status} for scheme ${code}`);
          return [];
        }

        const json = await res.json();
        if (!json || !Array.isArray(json.data) || json.data.length === 0) {
          return [];
        }

        const navList = [];
        for (const item of json.data) {
          const navVal = parseFloat(item.nav);
          if (!isNaN(navVal) && item.date) {
            const dObj = parseNavDate(item.date);
            if (dObj && dObj.getTime() > 0) {
              navList.push({
                date: formatAmfiDate(dObj),
                nav: navVal
              });
            }
          }
        }

        if (navList.length > 0) {
          navList.sort((a, b) => parseNavDate(b.date).getTime() - parseNavDate(a.date).getTime());

          const existing = this.navHistoryCache.get(code);
          let mergedList = navList;
          if (existing && Array.isArray(existing.navList)) {
            const map = new Map();
            existing.navList.forEach(r => map.set(r.date, r));
            navList.forEach(r => map.set(r.date, r));
            mergedList = Array.from(map.values()).sort((a, b) => parseNavDate(b.date).getTime() - parseNavDate(a.date).getTime());
          }

          this.navHistoryCache.set(code, {
            navList: mergedList,
            timestamp: Date.now()
          });
          this.scheduleNavCacheSave();
          logger.info(`Successfully fetched and cached ${mergedList.length} historical NAV records for scheme ${code} via MFAPI fallback.`);
          return mergedList;
        }
        return [];
      } catch (err) {
        logger.warn(`Failed to fetch NAV history from MFAPI for scheme ${code}: ${err.message}`);
        return [];
      } finally {
        this.inFlightMfapiPromises.delete(code);
      }
    })();

    this.inFlightMfapiPromises.set(code, promise);
    return promise;
  }

  /**
   * Fetch historical NAV records directly from official AMFI portal with automatic MFAPI fallback
   */
  async fetchOfficialAmfiNavHistory(code, minRequiredDate = null) {
    const codeStr = String(code);
    const targetDates = [];
    const anchorDate = minRequiredDate || this.reportDate;
    const anchor = parseNavDate(anchorDate);

    targetDates.push(anchor);
    [1, 2, 3, 5, 10].forEach(T => {
      const d = new Date(anchor);
      d.setFullYear(d.getFullYear() - T);
      targetDates.push(d);
    });
    [15, 30, 33, 45, 50, 60, 67, 180].forEach(D => {
      const d = new Date(anchor);
      d.setDate(d.getDate() - D);
      targetDates.push(d);
    });

    const cached = this.navHistoryCache.get(code);
    const fetchedMap = new Map();
    if (cached && Array.isArray(cached.navList)) {
      cached.navList.forEach(r => fetchedMap.set(r.date, r));
    }

    const missingTargets = targetDates.filter(tDate => {
      const sDate = new Date(tDate);
      sDate.setDate(sDate.getDate() - 10);
      const fromStr = formatAmfiDate(sDate);
      const toStr = formatAmfiDate(tDate);
      const windowKey = `${fromStr}_${toStr}`;

      // If this date window has already been downloaded and ingested across India,
      // and this scheme was not present, the fund did not exist on that date.
      if (this.completedDateWindows.has(windowKey)) {
        return false;
      }

      return !Array.from(fetchedMap.values()).some(r => {
        const rDate = parseNavDate(r.date);
        const diffDays = Math.abs((rDate - tDate) / (1000 * 60 * 60 * 24));
        return diffDays <= 7;
      });
    });

    if (missingTargets.length > 0) {
      let hadFailure = false;
      for (const tDate of missingTargets) {
        const sDate = new Date(tDate);
        sDate.setDate(sDate.getDate() - 10);
        const fromStr = formatAmfiDate(sDate);
        const toStr = formatAmfiDate(tDate);
        const windowKey = `${fromStr}_${toStr}`;

        // If circuit breaker is tripped for this window, skip attempting AMFI
        const lastFailed = this.failedDateWindows.get(windowKey);
        if (lastFailed && (Date.now() - lastFailed < 5 * 60 * 1000)) {
          hadFailure = true;
          continue;
        }

        await this.fetchAmfiPortalDateWindow(fromStr, toStr);
        if (this.failedDateWindows.has(windowKey)) {
          hadFailure = true;
        }
      }

      // Re-read updated records from cache after window fetch
      const updatedCache = this.navHistoryCache.get(code);
      if (updatedCache && Array.isArray(updatedCache.navList)) {
        updatedCache.navList.forEach(r => fetchedMap.set(r.date, r));
      }

      // Verify if all required target dates have been covered
      const stillMissing = targetDates.some(tDate => {
        return !Array.from(fetchedMap.values()).some(r => {
          const rDate = parseNavDate(r.date);
          const diffDays = Math.abs((rDate - tDate) / (1000 * 60 * 60 * 24));
          return diffDays <= 7;
        });
      });

      // If dates are missing or AMFI timed out, invoke high-speed MFAPI fallback
      if (stillMissing || hadFailure) {
        logger.info(`Invoking fast MFAPI fallback for scheme ${code} due to missing dates or AMFI portal timeout...`);
        const mfapiList = await this.fetchMfapiNavHistory(code);
        if (mfapiList && mfapiList.length > 0) {
          return mfapiList;
        }
      }
    }

    const navList = Array.from(fetchedMap.values()).sort((a, b) => parseNavDate(b.date) - parseNavDate(a.date));
    if (navList.length > 0) {
      this.navHistoryCache.set(code, {
        navList,
        timestamp: Date.now()
      });
      this.scheduleNavCacheSave();
    }
    return navList;
  }

  /**
   * Fetch historical NAV time series for a schemeCode with caching and MFAPI fallback
   * @param {number|string} schemeCode
   * @param {string|Date} minRequiredDate Optional minimum date that must be covered in the time series
   */
  async getNavHistory(schemeCode, minRequiredDate = null) {
    if (!schemeCode) return [];
    const code = Number(schemeCode);

    const now = Date.now();
    const cached = this.navHistoryCache.get(code);
    if (cached && Array.isArray(cached.navList) && cached.navList.length > 0) {
      if (!minRequiredDate) {
        return cached.navList;
      }
      const reqDate = parseNavDate(minRequiredDate);
      if (!reqDate || isNaN(reqDate.getTime()) || reqDate.getTime() === 0) {
        return cached.navList;
      }

      // Check if cached navList actually covers reqDate (i.e. has a record within 7 days of reqDate)
      const coversReqDate = cached.navList.some(r => {
        const rDate = parseNavDate(r.date);
        return Math.abs((rDate.getTime() - reqDate.getTime()) / (1000 * 60 * 60 * 24)) <= 7;
      });
      if (coversReqDate) {
        return cached.navList;
      }
    }

    try {
      const list = await this.fetchOfficialAmfiNavHistory(code, minRequiredDate);
      if (list && list.length > 0) {
        return list;
      }
    } catch (err) {
      logger.warn(`Failed to fetch official AMFI NAV history for scheme code ${code}: ${err.message}`);
    }

    // Direct fallback to MFAPI if AMFI returned empty or failed
    try {
      const mfapiList = await this.fetchMfapiNavHistory(code);
      if (mfapiList && mfapiList.length > 0) {
        return mfapiList;
      }
    } catch (mfErr) {
      logger.warn(`MFAPI fallback error for scheme code ${code}: ${mfErr.message}`);
    }

    if (cached) return cached.navList;
    return [];
  }

  /**
   * Calculate returns for a single plan (Regular or Direct)
   */
  async computeSinglePlanReturns(scheme, plan = 'regular', customDays = '33,50,67', startDate = null, endDate = null, asOfDate = null, histMatch = null) {
    const isDirect = plan.toLowerCase() === 'direct';
    const schemeCode = (isDirect ? scheme.directSchemeCode : scheme.regularSchemeCode) || scheme.regularSchemeCode || scheme.directSchemeCode;
    const daysList = parseDaysList(customDays);
    const targetAnchorDate = asOfDate || this.reportDate;

    if (schemeCode) {
      const cacheKey = `${schemeCode}_${isDirect ? 'dir' : 'reg'}_${daysList.join(',')}_${startDate || ''}_${endDate || ''}_${asOfDate || ''}`;
      const cached = this.computedCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < AMFI_CACHE_TTL * 1000)) {
        // Verify that cached computation navDate is not behind the target anchor date
        const targetReqDate = parseNavDate(targetAnchorDate);
        const cachedNavDate = parseNavDate(cached.data?.navDate);
        const isTargetCurrentOrFuture = this.reportDate && targetReqDate && targetReqDate.getTime() >= parseNavDate(this.reportDate).getTime();
        if (isTargetCurrentOrFuture || !targetReqDate || !cachedNavDate || cachedNavDate.getTime() >= targetReqDate.getTime()) {
          return cached.data;
        }
      }
    }

    // Default return object
    const resultReturns = {
      return1Yr: null,
      return2Yr: null,
      return3Yr: null,
      return5Yr: null,
      return10Yr: null,
      dayReturns: {},
      customDaysList: daysList,
      customDays: daysList[0] || 33,
      currentNav: isDirect ? scheme.navDirect : scheme.navRegular,
      navDate: this.reportDate,
      planUsed: isDirect ? 'Direct' : 'Regular'
    };

    // Initialize all custom day returns
    daysList.forEach(d => {
      resultReturns[`return_${d}d`] = null;
      resultReturns.dayReturns[d] = null;
    });

    // If seed returns are available for predefined benchmark items and no asOfDate, use as immediate fallback
    if (scheme.seedReturns && !asOfDate) {
      const sr = isDirect ? scheme.seedReturns.direct : scheme.seedReturns.regular;
      if (sr) {
        resultReturns.return1Yr = sr.r1;
        resultReturns.return2Yr = sr.r2;
        resultReturns.return3Yr = sr.r3;
        resultReturns.return5Yr = sr.r5;
        resultReturns.return10Yr = sr.r10;
        resultReturns.currentNav = sr.nav;
      }
    }

    if (!schemeCode) {
      return resultReturns;
    }

    const navList = await this.getNavHistory(schemeCode, targetAnchorDate);
    if (!navList || navList.length === 0) {
      return resultReturns;
    }

    // Ensure navList is strictly sorted descending by date (newest first)
    const sortedNavList = [...navList].sort((a, b) => parseNavDate(b.date).getTime() - parseNavDate(a.date).getTime());

    // Determine anchor valuation NAV (latest or as-of-date)
    let latestObj = sortedNavList[0];
    if (asOfDate) {
      const targetValDate = parseNavDate(asOfDate);
      if (!isNaN(targetValDate.getTime()) && targetValDate.getTime() > 0) {
        // Find latest available NAV on or before target valuation date
        const found = sortedNavList.find(item => parseNavDate(item.date).getTime() <= targetValDate.getTime());
        if (found) {
          latestObj = found;
        } else {
          // If no record preceding or matching targetValDate, fall back to latest available record
          latestObj = sortedNavList[0];
        }
      }
    }

    if (!latestObj) {
      const fallbackNav = (histMatch && (isDirect ? histMatch.navDirect : histMatch.navRegular))
        ? (isDirect ? histMatch.navDirect : histMatch.navRegular)
        : (isDirect ? scheme.navDirect : scheme.navRegular);
      resultReturns.currentNav = fallbackNav;
      resultReturns.navDate = asOfDate ? formatAmfiDate(parseNavDate(asOfDate)) : this.reportDate;
      return resultReturns;
    }

    const VT = Number(latestObj.nav);
    const latestDate = parseNavDate(latestObj.date);

    resultReturns.currentNav = VT;
    resultReturns.navDate = latestObj.date;

    // Yearly formula returns calculated backwards from valuation date
    const periods = [
      { key: 'return1Yr', T: 1 },
      { key: 'return2Yr', T: 2 },
      { key: 'return3Yr', T: 3 },
      { key: 'return5Yr', T: 5 },
      { key: 'return10Yr', T: 10 }
    ];

    periods.forEach(({ key, T }) => {
      const targetDate = new Date(latestDate);
      targetDate.setFullYear(targetDate.getFullYear() - T);

      // Find closest available preceding NAV date
      const v0Record = sortedNavList.find(item => parseNavDate(item.date).getTime() <= targetDate.getTime());
      if (v0Record) {
        const V0 = Number(v0Record.nav);
        resultReturns[key] = calculateFormulaReturn(V0, VT, T);
      } else {
        resultReturns[key] = null;
      }
    });

    // Custom Days formula returns calculated backwards from valuation date
    daysList.forEach((D) => {
      const targetDate = new Date(latestDate);
      targetDate.setDate(targetDate.getDate() - D);
      const v0Record = sortedNavList.find(item => parseNavDate(item.date).getTime() <= targetDate.getTime());
      if (v0Record) {
        const V0 = Number(v0Record.nav);
        const retVal = calculateDayFormulaReturn(V0, VT, D);
        resultReturns[`return_${D}d`] = retVal;
        resultReturns.dayReturns[D] = retVal;
      } else {
        resultReturns[`return_${D}d`] = null;
        resultReturns.dayReturns[D] = null;
      }
    });

    // Backward-compatibility aliases
    resultReturns.return15D = resultReturns.dayReturns[15] ?? null;
    resultReturns.return30D = resultReturns.dayReturns[30] ?? null;
    resultReturns.return45D = resultReturns.dayReturns[45] ?? null;
    resultReturns.return60D = resultReturns.dayReturns[60] ?? null;
    resultReturns.return180D = resultReturns.dayReturns[180] ?? null;
    resultReturns.returnCustomD = resultReturns.dayReturns[daysList[0]] ?? null;

    if (startDate && endDate) {
      const sDate = parseNavDate(startDate);
      const eDate = parseNavDate(endDate);
      if (!isNaN(sDate.getTime()) && !isNaN(eDate.getTime()) && eDate > sDate) {
        const diffMs = eDate.getTime() - sDate.getTime();
        const cDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));

        const vtRecord = sortedNavList.find(item => parseNavDate(item.date).getTime() <= eDate.getTime()) || latestObj;
        const v0Record = sortedNavList.find(item => parseNavDate(item.date).getTime() <= sDate.getTime());

        if (vtRecord && v0Record) {
          const VT_custom = Number(vtRecord.nav);
          const V0_custom = Number(v0Record.nav);
          resultReturns.rangeReturn = calculateDayFormulaReturn(V0_custom, VT_custom, cDays);
          resultReturns.rangeDays = cDays;
        }
      }
    }

    if (schemeCode && resultReturns.currentNav !== null) {
      const cacheKey = `${schemeCode}_${isDirect ? 'dir' : 'reg'}_${daysList.join(',')}_${startDate || ''}_${endDate || ''}_${asOfDate || ''}`;
      this.computedCache.set(cacheKey, { data: resultReturns, timestamp: Date.now() });
    }

    return resultReturns;
  }

  /**
   * Calculate 1Y, 2Y, 3Y, 5Y, 10Y and custom days formula returns for a scheme under the requested plan ('regular', 'direct', or 'both')
   */
  async computeReturnsForScheme(scheme, plan = 'regular', customDays = '33,50,67', startDate = null, endDate = null, asOfDate = null, histMatch = null) {
    if (plan && plan.toLowerCase() === 'both') {
      const reg = await this.computeSinglePlanReturns(scheme, 'regular', customDays, startDate, endDate, asOfDate, histMatch);
      const dir = await this.computeSinglePlanReturns(scheme, 'direct', customDays, startDate, endDate, asOfDate, histMatch);
      const daysList = parseDaysList(customDays);

      const combined = {
        ...reg,
        planUsed: 'Both',
        currentNav: reg.currentNav || dir.currentNav,
        navDate: reg.navDate || dir.navDate,
        // Regular Plan values
        regNav: reg.currentNav,
        regNavDate: reg.navDate,
        regReturn1Yr: reg.return1Yr,
        regReturn2Yr: reg.return2Yr,
        regReturn3Yr: reg.return3Yr,
        regReturn5Yr: reg.return5Yr,
        regReturn10Yr: reg.return10Yr,
        regDayReturns: reg.dayReturns,
        // Direct Plan values
        dirNav: dir.currentNav,
        dirNavDate: dir.navDate,
        dirReturn1Yr: dir.return1Yr,
        dirReturn2Yr: dir.return2Yr,
        dirReturn3Yr: dir.return3Yr,
        dirReturn5Yr: dir.return5Yr,
        dirReturn10Yr: dir.return10Yr,
        dirDayReturns: dir.dayReturns,
        returnsRegular: reg,
        returnsDirect: dir
      };

      daysList.forEach(d => {
        combined[`reg_return_${d}d`] = reg[`return_${d}d`];
        combined[`dir_return_${d}d`] = dir[`return_${d}d`];
      });

      return combined;
    }

    return this.computeSinglePlanReturns(scheme, plan, customDays, startDate, endDate, asOfDate, histMatch);
  }

  /**
   * Retrieve categories with scheme counts
   */
  async getCategories() {
    await this.initializeMasterRegistry();

    const counts = {};
    this.masterSchemes.forEach(s => {
      counts[s.category] = (counts[s.category] || 0) + 1;
    });

    const categoryList = Object.keys(counts).map(catName => ({
      id: catName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: catName,
      count: counts[catName]
    }));

    // Sort categories according to requested standard order
    categoryList.sort((a, b) => {
      const orderA = CATEGORY_DISPLAY_ORDER[a.name] || 99;
      const orderB = CATEGORY_DISPLAY_ORDER[b.name] || 99;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });

    return categoryList;
  }

  /**
   * Get filtered and paginated schemes with calculated returns
   */
  async getFunds({ category = 'all', search = '', plan = 'regular', option = 'all', page = 1, limit = 50, days, customDays = '33,50,67', startDate = null, endDate = null, asOfDate = null }) {
    await this.initializeMasterRegistry();

    const daysParam = days || customDays;
    const daysList = parseDaysList(daysParam);

    let filtered = [...this.masterSchemes];

    // Category Filter
    if (category && category.trim().toLowerCase() !== 'all') {
      const catLower = category.trim().toLowerCase();
      filtered = filtered.filter(s => 
        s.category.toLowerCase() === catLower ||
        s.category.toLowerCase().replace(/[^a-z0-9]+/g, '-') === catLower
      );
    }

    // Scheme Option Filter (all | growth | bonus | idcw)
    if (option && option.trim().toLowerCase() !== 'all') {
      const optLower = option.trim().toLowerCase();
      filtered = filtered.filter(s => {
        const sOpt = s.schemeOption || determineSchemeOption(s.displayName);
        if (optLower === 'growth') {
          return sOpt === 'growth';
        }
        if (optLower === 'bonus') {
          return sOpt === 'bonus';
        }
        if (optLower === 'idcw') {
          return sOpt === 'idcw';
        }
        return true;
      });
    }

    // Fuzzy / Typo-tolerant Search Filter
    if (search && search.trim() !== '') {
      filtered = fuzzyFilterSchemes(filtered, search.trim());
    }

    const total = filtered.length;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));

    const totalPages = Math.ceil(total / limitNum) || 1;
    const startIndex = (pageNum - 1) * limitNum;
    const pageItems = filtered.slice(startIndex, startIndex + limitNum);

    // Resolve historical AUM if asOfDate is specified
    const histAumRes = await this.resolveHistoricalAumForSchemes(asOfDate, pageItems);
    const histAumMap = histAumRes?.map;

    // Compute returns for current page items with bounded concurrency
    const fundsWithReturns = await pMap(
      pageItems,
      async (scheme) => {
        const histMatch = histAumMap ? histAumMap.get(scheme.id) : null;
        const m = histMatch || scheme.amfiMatch;
        const computed = await this.computeReturnsForScheme(scheme, plan, daysList, startDate, endDate, asOfDate, histMatch);
        const dailyAUMRaw = (m && m.dailyAUM !== null)
          ? m.dailyAUM
          : (scheme.dailyAUMRaw !== null ? scheme.dailyAUMRaw : null);
        const dailyAUMFormatted = (m && m.dailyAUM !== null)
          ? this.formatAUM(m.dailyAUM)
          : (scheme.dailyAUMFormatted && scheme.dailyAUMFormatted !== 'N/A' ? scheme.dailyAUMFormatted : (dailyAUMRaw ? this.formatAUM(dailyAUMRaw) : 'N/A'));
        const benchmark = (m && m.benchmark && m.benchmark !== 'N/A') ? m.benchmark : scheme.benchmark;
        const riskometerScheme = (m && m.riskometerScheme && m.riskometerScheme !== 'N/A') ? m.riskometerScheme : scheme.riskometerScheme;

        const isDir = plan.toLowerCase() === 'direct';

        const navRegular = (histMatch && histMatch.navRegular)
          ? histMatch.navRegular
          : (computed.regNav || (isDir ? null : computed.currentNav) || scheme.navRegular || null);
        const navDirect = (histMatch && histMatch.navDirect)
          ? histMatch.navDirect
          : (computed.dirNav || (isDir ? computed.currentNav : null) || scheme.navDirect || null);
        const currentNav = computed.currentNav || (histMatch && (isDir ? histMatch.navDirect : histMatch.navRegular))
          || (isDir ? (navDirect || navRegular) : (navRegular || navDirect));
        const navDate = computed.navDate || (histMatch && histMatch.navDate) || (histAumRes?.effectiveDate) || (asOfDate ? formatAmfiDate(parseNavDate(asOfDate)) : this.reportDate);

        return {
          id: scheme.id,
          displayName: scheme.displayName,
          amfiSchemeName: scheme.amfiSchemeName,
          category: scheme.category,
          schemeOption: scheme.schemeOption || determineSchemeOption(scheme.displayName),
          subCategoryId: scheme.subCategoryId,
          amcName: scheme.amcName,
          benchmark,
          riskometerScheme,
          dailyAUMRaw,
          dailyAUMFormatted,
          navRegular,
          navDirect,
          regularSchemeCode: scheme.regularSchemeCode,
          directSchemeCode: scheme.directSchemeCode,
          ...computed,
          currentNav,
          navDate,
          return1YearRegular: histMatch ? histMatch.return1YearRegular : null,
          return1YearDirect: histMatch ? histMatch.return1YearDirect : null,
          return3YearRegular: histMatch ? histMatch.return3YearRegular : null,
          return3YearDirect: histMatch ? histMatch.return3YearDirect : null,
          return5YearRegular: histMatch ? histMatch.return5YearRegular : null,
          return5YearDirect: histMatch ? histMatch.return5YearDirect : null,
          return10YearRegular: histMatch ? histMatch.return10YearRegular : null,
          return10YearDirect: histMatch ? histMatch.return10YearDirect : null,
          return1YearBenchmark: histMatch ? histMatch.benchmarkReturn1Year : null,
          return3YearBenchmark: histMatch ? histMatch.benchmarkReturn3Year : null,
          return5YearBenchmark: histMatch ? histMatch.benchmarkReturn5Year : null,
          return10YearBenchmark: histMatch ? histMatch.benchmarkReturn10Year : null,
          riskometerBenchmark: (histMatch && histMatch.riskometerBenchmark && histMatch.riskometerBenchmark !== 'N/A') ? histMatch.riskometerBenchmark : scheme.riskometerBenchmark,
          preNavRegular: histMatch ? histMatch.preNavRegular : null,
          preNavDirect: histMatch ? histMatch.preNavDirect : null
        };
      },
      12
    );

    return {
      funds: fundsWithReturns,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      customDaysList: daysList,
      reportDate: histAumRes?.effectiveDate || this.reportDate,
      lastUpdated: this.lastUpdated
    };
  }

  /**
   * Get Batch Funds for Custom Fund List (grouped category-wise and sorted alphabetically)
   */
  async getBatchFunds({ ids = [], plan = 'regular', days, customDays = '33,50,67', startDate = null, endDate = null, asOfDate = null }) {
    await this.initializeMasterRegistry();

    const daysParam = days || customDays;
    const daysList = parseDaysList(daysParam);

    if (!ids || ids.length === 0) {
      return { funds: [], total: 0, customDaysList: daysList };
    }

    const matchedSchemes = ids
      .map(id => this.schemeMap.get(id))
      .filter(Boolean);

    // Resolve historical AUM if asOfDate is specified
    const histAumRes = await this.resolveHistoricalAumForSchemes(asOfDate, matchedSchemes);
    const histAumMap = histAumRes?.map;

    // Compute returns for selected funds with bounded concurrency
    const fundsWithReturns = await pMap(
      matchedSchemes,
      async (scheme) => {
        const histMatch = histAumMap ? histAumMap.get(scheme.id) : null;
        const m = histMatch || scheme.amfiMatch;
        const computed = await this.computeReturnsForScheme(scheme, plan, daysList, startDate, endDate, asOfDate, histMatch);
        const dailyAUMRaw = (m && m.dailyAUM !== null)
          ? m.dailyAUM
          : (scheme.dailyAUMRaw !== null ? scheme.dailyAUMRaw : null);
        const dailyAUMFormatted = (m && m.dailyAUM !== null)
          ? this.formatAUM(m.dailyAUM)
          : (scheme.dailyAUMFormatted && scheme.dailyAUMFormatted !== 'N/A' ? scheme.dailyAUMFormatted : (dailyAUMRaw ? this.formatAUM(dailyAUMRaw) : 'N/A'));
        const benchmark = (m && m.benchmark && m.benchmark !== 'N/A') ? m.benchmark : scheme.benchmark;
        const riskometerScheme = (m && m.riskometerScheme && m.riskometerScheme !== 'N/A') ? m.riskometerScheme : scheme.riskometerScheme;

        const isDir = plan.toLowerCase() === 'direct';

        const navRegular = (histMatch && histMatch.navRegular)
          ? histMatch.navRegular
          : (computed.regNav || (isDir ? null : computed.currentNav) || scheme.navRegular || null);
        const navDirect = (histMatch && histMatch.navDirect)
          ? histMatch.navDirect
          : (computed.dirNav || (isDir ? computed.currentNav : null) || scheme.navDirect || null);
        const currentNav = computed.currentNav || (histMatch && (isDir ? histMatch.navDirect : histMatch.navRegular))
          || (isDir ? (navDirect || navRegular) : (navRegular || navDirect));
        const navDate = computed.navDate || (histMatch && histMatch.navDate) || (histAumRes?.effectiveDate) || (asOfDate ? formatAmfiDate(parseNavDate(asOfDate)) : this.reportDate);

        return {
          id: scheme.id,
          displayName: scheme.displayName,
          amfiSchemeName: scheme.amfiSchemeName,
          category: scheme.category,
          subCategoryId: scheme.subCategoryId,
          amcName: scheme.amcName,
          benchmark,
          riskometerScheme,
          dailyAUMRaw,
          dailyAUMFormatted,
          navRegular,
          navDirect,
          regularSchemeCode: scheme.regularSchemeCode,
          directSchemeCode: scheme.directSchemeCode,
          ...computed,
          currentNav,
          navDate,
          return1YearRegular: histMatch ? histMatch.return1YearRegular : null,
          return1YearDirect: histMatch ? histMatch.return1YearDirect : null,
          return3YearRegular: histMatch ? histMatch.return3YearRegular : null,
          return3YearDirect: histMatch ? histMatch.return3YearDirect : null,
          return5YearRegular: histMatch ? histMatch.return5YearRegular : null,
          return5YearDirect: histMatch ? histMatch.return5YearDirect : null,
          return10YearRegular: histMatch ? histMatch.return10YearRegular : null,
          return10YearDirect: histMatch ? histMatch.return10YearDirect : null,
          return1YearBenchmark: histMatch ? histMatch.benchmarkReturn1Year : null,
          return3YearBenchmark: histMatch ? histMatch.benchmarkReturn3Year : null,
          return5YearBenchmark: histMatch ? histMatch.benchmarkReturn5Year : null,
          return10YearBenchmark: histMatch ? histMatch.benchmarkReturn10Year : null,
          riskometerBenchmark: (histMatch && histMatch.riskometerBenchmark && histMatch.riskometerBenchmark !== 'N/A') ? histMatch.riskometerBenchmark : scheme.riskometerBenchmark,
          preNavRegular: histMatch ? histMatch.preNavRegular : null,
          preNavDirect: histMatch ? histMatch.preNavDirect : null
        };
      },
      12
    );

    // Category-wise grouping & alphabetical sorting within category
    fundsWithReturns.sort((a, b) => {
      const orderA = CATEGORY_DISPLAY_ORDER[a.category] || 99;
      const orderB = CATEGORY_DISPLAY_ORDER[b.category] || 99;
      if (orderA !== orderB) return orderA - orderB;
      return a.displayName.localeCompare(b.displayName);
    });

    return {
      funds: fundsWithReturns,
      total: fundsWithReturns.length,
      customDaysList: daysList,
      reportDate: histAumRes?.effectiveDate || this.reportDate,
      lastUpdated: this.lastUpdated
    };
  }
}

const amfiServiceInstance = new AmfiService();
amfiServiceInstance.formatAmfiDate = formatAmfiDate;
amfiServiceInstance.parseNavDate = parseNavDate;

module.exports = amfiServiceInstance;
