/**
 * FundPulse - AMFI Data Provider & Return Engine
 * 
 * Features:
 * 1. Complete Indian Mutual Fund scheme discovery (all categories and AMCs)
 * 2. Official AMFI Live AUM fetching & matching (sources daily AUM directly from AMFI)
 * 3. Regular / Direct plan pairing by scheme code
 * 4. User-specified Quarterly Compounded Annualized Return formula calculation:
 *    Annualized Return = 4 * ((VT / V0)^(1 / (4 * T)) - 1) * 100
 *    where T = 1, 2, 3, 5, 10 years, V0 = historical NAV, VT = current NAV
 * 5. High-performance server-side caching of NAV time series
 * 6. Batch resolution for user's Custom Fund List
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { MASTER_ALLOWLIST, MASTER_CATEGORIES, CATEGORY_DISPLAY_ORDER, ASSET_GROUPS, CATEGORY_TO_ASSET_GROUP, getAssetGroupForCategory } = require('../config/masterList');
const { fuzzyFilterSchemes } = require('../utils/fuzzySearch');

const CACHE_DIR = path.join(__dirname, '../cache');
const NAV_CACHE_FILE = path.join(CACHE_DIR, 'nav_history_cache.json');
const SEED_NAV_CACHE_FILE = path.join(CACHE_DIR, 'seed_nav_history.json');
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

function formatAmfiDateToIso(dateInput) {
  if (!dateInput) return null;
  const d = (dateInput instanceof Date) ? dateInput : parseNavDate(dateInput);
  if (isNaN(d.getTime()) || d.getTime() === 0) return null;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

// User-specified Quarterly Compounded Annualized Return formula:
// Annualized Return = 4 * ((VT / V0)^(1 / (4 * T)) - 1) * 100
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
  if (cat.includes('sectoral') || cat.includes('thematic') || name.includes('consumption') || name.includes('pharma') || name.includes('tech') || (name.includes('banking') && !cat.includes('debt') && !name.includes('psu') && !name.includes('debt')) || name.includes('infra') || name.includes('innovation')) return 'Sectoral / Thematic';
  if (cat.includes('index') || cat.includes('etf') || name.includes('index') || name.includes('nifty') || name.includes('sensex') || name.includes('etf')) return 'Index Funds';
  if (cat.includes('hybrid') || cat.includes('arbitrage') || cat.includes('balanced') || name.includes('hybrid') || name.includes('balanced') || name.includes('arbitrage')) return 'Hybrid';
  if (cat.includes('debt') || cat.includes('income') || cat.includes('liquid') || cat.includes('money market') || cat.includes('gilt') || cat.includes('overnight') || cat.includes('duration') || cat.includes('bond') || name.includes('liquid') || name.includes('overnight') || name.includes('short term') || name.includes('short duration') || name.includes('low duration') || name.includes('ultra short') || name.includes('money market') || name.includes('corporate bond') || name.includes('credit risk') || name.includes('gilt') || name.includes('floater') || name.includes('floating interest') || name.includes('dynamic bond') || name.includes('banking and psu') || name.includes('banking & psu') || name.includes('medium duration') || name.includes('medium term') || name.includes('long duration') || name.includes('long term')) return 'Debt / Liquid';
  
  return 'Other';
}

function determineDebtSubCategory(catStr, nameStr) {
  const c = (catStr || '').toLowerCase();
  const n = (nameStr || '').toLowerCase();

  if (c.includes('10-year constant maturity') || c.includes('10 year constant duration') || (n.includes('10 year') && n.includes('gilt')) || n.includes('10-year constant maturity')) {
    return '10 Year Gilt';
  }
  if (c.includes('overnight') || n.includes('overnight')) {
    return 'Overnight';
  }
  if (c.includes('liquid') || n.includes('liquid fund') || n.includes(' liquid ')) {
    return 'Liquid';
  }
  if (c.includes('money market') || n.includes('money market')) {
    return 'Money Market';
  }
  if (c.includes('ultra short to short term') || c.includes('low duration') || n.includes('low duration') || n.includes('ultra short to short')) {
    return 'Ultra Short to Short Term';
  }
  if (c.includes('ultra short term') || c.includes('ultra short duration') || n.includes('ultra short term') || n.includes('ultra short duration') || n.includes('ultra short fund')) {
    return 'Ultra Short Term Fund';
  }
  if (c.includes('short duration') || c.includes('short term') || n.includes('short duration') || n.includes('short term')) {
    return 'Short Term';
  }
  if (c.includes('medium to long') || n.includes('medium to long')) {
    return 'Medium to Long Term';
  }
  if (c.includes('medium duration') || c.includes('medium term') || n.includes('medium duration') || n.includes('medium term')) {
    return 'Medium Term';
  }
  if (c.includes('long duration') || c.includes('long term') || n.includes('long duration') || n.includes('long term')) {
    return 'Long Term';
  }
  if (c.includes('corporate bond') || n.includes('corporate bond')) {
    return 'Corporate Bond';
  }
  if (c.includes('credit risk') || n.includes('credit risk')) {
    return 'Credit Risk';
  }
  if (c.includes('banking and psu') || c.includes('banking & psu') || n.includes('banking & psu') || n.includes('banking and psu')) {
    return 'Banking & PSU';
  }
  if (c.includes('floating interest') || c.includes('floater') || n.includes('floating rate') || n.includes('floating interest') || n.includes('floater')) {
    return 'Floater';
  }
  if (c.includes('dynamic bond') || c.includes('dynamic term') || n.includes('dynamic bond') || n.includes('dynamic term')) {
    return 'Dynamic Bond';
  }
  if (c.includes('gilt') || n.includes('gilt')) {
    return 'Gilt';
  }
  return 'Other Debt';
}

function matchesDebtSubCategory(schemeSubCategory, filterSubCategory, schemeName) {
  if (!filterSubCategory || filterSubCategory === 'all') return true;
  
  const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const fKey = normalize(filterSubCategory);
  const sKey = normalize(schemeSubCategory);
  const nKey = normalize(schemeName);

  if (sKey === fKey) return true;

  const aliasMap = {
    'shortterm': ['shortduration', 'shortterm'],
    'liquid': ['liquid'],
    'overnight': ['overnight'],
    'moneymarket': ['moneymarket'],
    'ultrashortterm': ['ultrashorttermfund', 'ultrashortduration', 'ultrashortterm'],
    'ultrashorttermfund': ['ultrashorttermfund', 'ultrashortduration', 'ultrashortterm'],
    'lowduration': ['ultrashorttoshortterm', 'lowduration', 'ultrashorttoshort'],
    'ultrashorttoshortterm': ['ultrashorttoshortterm', 'lowduration', 'ultrashorttoshort'],
    'mediumterm': ['mediumduration', 'mediumterm'],
    'mediumtolongterm': ['mediumtolongduration', 'mediumtolongterm'],
    'longterm': ['longduration', 'longterm'],
    'corporatebond': ['corporatebond'],
    'creditrisk': ['creditrisk'],
    'bankingpsu': ['bankingandpsu', 'bankingpsudebt', 'bankingpsu', 'bankingandpsudebt'],
    'gilt': ['gilt'],
    'floater': ['floatinginterestrates', 'floatingrate', 'floater'],
    'dynamicbond': ['dynamicterm', 'dynamicbond'],
    '10yeargilt': ['10yearconstantmaturitygilt', '10yearconstantdurationgilt', '10yeargilt']
  };

  const aliases = aliasMap[fKey] || [fKey];
  return aliases.some(a => sKey.includes(a) || a.includes(sKey) || nKey.includes(a));
}

class AmfiService {
  constructor() {
    this.masterSchemes = []; // Array of scheme objects
    this.schemeMap = new Map(); // id -> scheme object
    this.navHistoryCache = new Map(); // schemeCode -> { navList: [{date, nav}], timestamp }
    this.computedCache = new Map(); // cacheKey -> { data, timestamp }
    this.historicalAumCache = new Map(); // key `${dateStr}_${cat}_${subCat}` -> array of entries
    this.historicalAumFetchedAt = new Map(); // key -> fetch timestamp
    this.inFlightHistAumPromises = new Map();
    this.dateToEffectiveDateMap = new Map();
    this._saveCacheTimer = null;
    this._saveHistAumCacheTimer = null;
    // Initialize to yesterday's date dynamically
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    this.reportDate = formatAmfiDate(yesterday);
    this.groupNavDates = {
      equity: this.reportDate,
      debt: this.reportDate,
      hybrid: this.reportDate,
      other: this.reportDate
    };
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
      let maxCachedDate = null;
      // 1. Load committed seed NAV cache (always available on fresh Render deployments)
      if (fs.existsSync(SEED_NAV_CACHE_FILE)) {
        try {
          const raw = fs.readFileSync(SEED_NAV_CACHE_FILE, 'utf-8');
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            let count = 0;
            for (const [codeStr, entry] of Object.entries(parsed)) {
              const code = Number(codeStr);
              if (code && entry && Array.isArray(entry.navList)) {
                entry.navList.sort((a, b) => parseNavDate(b.date).getTime() - parseNavDate(a.date).getTime());
                entry.isComplete = true;
                this.navHistoryCache.set(code, entry);
                count++;
                if (entry.navList[0]?.date) {
                  const d = entry.navList[0].date;
                  if (!maxCachedDate || parseNavDate(d).getTime() > parseNavDate(maxCachedDate).getTime()) {
                    maxCachedDate = d;
                  }
                }
              }
            }
            logger.info(`Loaded ${count} curated schemes NAV history from seed cache.`);
          }
        } catch (seedErr) {
          logger.warn(`Could not read seed NAV cache: ${seedErr.message}`);
        }
      }

      // 2. Load runtime disk NAV cache if present
      if (fs.existsSync(NAV_CACHE_FILE)) {
        const raw = fs.readFileSync(NAV_CACHE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          let count = 0;
          for (const [codeStr, entry] of Object.entries(parsed)) {
            const code = Number(codeStr);
            if (code && entry && Array.isArray(entry.navList)) {
              entry.navList.sort((a, b) => parseNavDate(b.date).getTime() - parseNavDate(a.date).getTime());
              if (entry.isComplete || entry.navList.length >= 2000) {
                entry.isComplete = true;
              }
              this.navHistoryCache.set(code, entry);
              count++;
              if (entry.navList[0]?.date) {
                const d = entry.navList[0].date;
                if (!maxCachedDate || parseNavDate(d).getTime() > parseNavDate(maxCachedDate).getTime()) {
                  maxCachedDate = d;
                }
              }
            }
          }
          logger.info(`Loaded ${count} schemes NAV history from disk cache.`);
        }
      }

      if (maxCachedDate && (!this.reportDate || parseNavDate(maxCachedDate).getTime() > parseNavDate(this.reportDate).getTime())) {
        this.reportDate = maxCachedDate;
        logger.info(`Synchronized initial AMFI reportDate to latest cached NAV date: ${maxCachedDate}`);
      }
    } catch (err) {
      logger.warn(`Could not read NAV history disk cache: ${err.message}`);
    }
  }

  scheduleNavCacheSave() {
    if (this._saveCacheTimer) return;
    this._saveCacheTimer = setTimeout(() => {
      this._saveCacheTimer = null;
      this.saveNavCacheNow();
    }, 4000);
  }

  saveNavCacheNow() {
    if (this._saveCacheTimer) {
      clearTimeout(this._saveCacheTimer);
      this._saveCacheTimer = null;
    }
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

  clearRecentHistoricalAumCache(maxDays = 5) {
    const now = Date.now();
    let count = 0;
    for (const [key] of this.historicalAumCache.entries()) {
      const parts = key.split('_');
      const dt = parts[0];
      const parsed = parseNavDate(dt);
      if (parsed && !isNaN(parsed.getTime())) {
        const diffDays = (now - parsed.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays >= 0 && diffDays <= maxDays) {
          this.historicalAumCache.delete(key);
          if (this.historicalAumFetchedAt) this.historicalAumFetchedAt.delete(key);
          count++;
        }
      }
    }
    logger.info(`Cleared ${count} recent historical AUM cache entries for fresh manual re-sync.`);
  }

  async fetchAmfiFundPerformancePair(dateStr, category, subCategory) {
    const cacheKey = `${dateStr}_${category}_${subCategory}`;
    const parsedDate = parseNavDate(dateStr);
    const daysAgo = (parsedDate && !isNaN(parsedDate.getTime()))
      ? (Date.now() - parsedDate.getTime()) / (1000 * 60 * 60 * 24)
      : 999;
    const isRecent = daysAgo >= 0 && daysAgo <= 5;
    const fetchedAt = this.historicalAumFetchedAt ? this.historicalAumFetchedAt.get(cacheKey) : 0;
    const isFresh = (Date.now() - (fetchedAt || 0)) < 60 * 60 * 1000; // 1-hour TTL for recent dates

    if (this.historicalAumCache.has(cacheKey)) {
      const cached = this.historicalAumCache.get(cacheKey);
      if (Array.isArray(cached) && cached.length > 0) {
        if (!isRecent || isFresh) {
          return cached;
        }
      }
    }

    if (this.inFlightHistAumPromises.has(cacheKey)) {
      return this.inFlightHistAumPromises.get(cacheKey);
    }

    const fetchPromise = (async () => {
      try {
        if (isNaN(parsedDate.getTime()) || parsedDate.getTime() === 0) {
          return [];
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
            reportDate: dateStr
          }),
          signal: AbortSignal.timeout(3500)
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
                  navDate: item.navDate ? String(item.navDate) : dateStr,
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
              this.historicalAumCache.set(cacheKey, entries);
              if (!this.historicalAumFetchedAt) this.historicalAumFetchedAt = new Map();
              this.historicalAumFetchedAt.set(cacheKey, Date.now());
              this.scheduleHistAumCacheSave();
              return entries;
            }
          }
        }
      } catch (err) {
        logger.warn(`Failed to fetch AMFI Fund Performance for ${cacheKey}: ${err.message}`);
      } finally {
        this.inFlightHistAumPromises.delete(cacheKey);
      }
      const existing = this.historicalAumCache.get(cacheKey);
      if (Array.isArray(existing) && existing.length > 0) {
        return existing;
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
    // Only skip querying AMFI if target date is strictly in the future compared to today
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    if (parsedDate.getTime() > endOfToday.getTime()) {
      return null;
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

    // Fast-probe active date in AMFI fundperformance table
    let resolvedDate = null;
    const primaryPair = neededPairs[0] || { category: 1, subCategory: 1 };
    const primaryKey = `${primaryPair.category}_${primaryPair.subCategory}`;

    // 1. Check if targetDate is already cached for primary pair
    if (this.historicalAumCache.has(`${targetFormatted}_${primaryKey}`)) {
      resolvedDate = targetFormatted;
    }

    // 2. Check if targetDate is today or after group reportDate
    const groupReportDate = this.getGroupNavDate(schemes[0]?.category) || this.reportDate;
    const reportDateTime = groupReportDate ? parseNavDate(groupReportDate).getTime() : 0;
    const isCurrentOrFuture = parsedDate.getTime() >= reportDateTime;

    if (!resolvedDate && isCurrentOrFuture && groupReportDate) {
      resolvedDate = groupReportDate;
    }

    // 3. Fast probe candidate dates (max 4 days rollback, 2000ms timeout)
    if (!resolvedDate) {
      const probeStartDate = (isCurrentOrFuture && groupReportDate) ? parseNavDate(groupReportDate) : parsedDate;
      for (let offset = 0; offset <= 4; offset++) {
        const cand = new Date(probeStartDate);
        cand.setDate(probeStartDate.getDate() - offset);
        const candStr = formatAmfiDate(cand);

        if (this.historicalAumCache.has(`${candStr}_${primaryKey}`)) {
          resolvedDate = candStr;
          break;
        }

        try {
          const probeRes = await fetch('https://www.amfiindia.com/gateway/pollingsebi/api/amfi/fundperformance', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Origin': 'https://www.amfiindia.com',
              'Referer': 'https://www.amfiindia.com/polling/amfi/'
            },
            body: JSON.stringify({ maturityType: 1, category: primaryPair.category, subCategory: primaryPair.subCategory, mfid: 0, reportDate: candStr }),
            signal: AbortSignal.timeout(2000)
          });
          if (probeRes.ok) {
            const json = await probeRes.json();
            if (json.data && json.data.length > 0) {
              resolvedDate = candStr;
              break;
            }
          }
        } catch (e) {}
      }
    }

    // Fallback: Default to groupReportDate or targetFormatted
    if (!resolvedDate) {
      resolvedDate = groupReportDate || targetFormatted;
    }

    // Fetch all needed pairs for ONLY this resolvedDate in parallel with bounded concurrency
    const allEntries = [];
    await pMap(neededPairs, async (p) => {
      const entries = await this.fetchAmfiFundPerformancePair(resolvedDate, p.category, p.subCategory);
      if (entries && entries.length > 0) {
        for (const e of entries) allEntries.push(e);
      }
    }, 8);

    // If live/historical entries were fetched, build matching index
    if (allEntries.length > 0) {
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

      const effectiveDateStr = allEntries[0]?.navDate || resolvedDate;
      return {
        map: resultMap,
        effectiveDate: effectiveDateStr
      };
    }

    // Graceful fallback: If network times out, immediately return schemes' cached amfiMatch
    const fallbackMap = new Map();
    schemes.forEach(s => {
      if (s.amfiMatch) {
        fallbackMap.set(s.id, s.amfiMatch);
      }
    });
    return {
      map: fallbackMap,
      effectiveDate: this.reportDate || targetFormatted
    };
  }

  /**
   * Helper to extract group-wise NAV dates with strict quorum validation:
   * 1. At least 3 distinct real AMC institutions.
   * 2. At least 10% of that group's active open-ended schemes.
   * Both conditions must be satisfied before promoting a newly detected NAV date.
   * If not met, retains the last verified date for that group.
   */
  extractGroupNavDatesFromNavAll(text) {
    if (!text) return this.groupNavDates;

    const lines = text.split(/\r?\n/);
    const today = new Date();
    const todayTime = today.getTime();

    let currentCategory = 'UNCATEGORIZED';
    let currentAmc = 'Unknown AMC';
    let isOpenEnded = false;
    let currentGroup = null;

    const activeOpenEndedCount = { equity: 0, debt: 0, hybrid: 0, other: 0 };
    const dateCounts = { equity: new Map(), debt: new Map(), hybrid: new Map(), other: new Map() };
    const dateAmcs = { equity: new Map(), debt: new Map(), hybrid: new Map(), other: new Map() };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (!trimmed.includes(';')) {
        const tLow = trimmed.toLowerCase();
        if (tLow.includes('open ended schemes') || tLow.includes('close ended schemes') || tLow.includes('interval fund')) {
          currentCategory = trimmed;
          isOpenEnded = tLow.includes('open ended schemes');

          if (tLow.includes('debt scheme') || tLow.includes('income/debt') || tLow.includes('liquid') || tLow.includes('money market') || tLow.includes('gilt')) {
            currentGroup = 'debt';
          } else if (tLow.includes('hybrid scheme') || tLow.includes('hybrid schemes')) {
            currentGroup = 'hybrid';
          } else if (tLow.includes('solution') || tLow.includes('children') || tLow.includes('retirement') || tLow.includes('other scheme') || tLow.includes('fund of funds') || tLow.includes('gold etf')) {
            currentGroup = 'other';
          } else if (tLow.includes('equity scheme') || tLow.includes('index funds') || (tLow.includes('etf') && !tLow.includes('debt') && !tLow.includes('gold'))) {
            currentGroup = 'equity';
          } else {
            currentGroup = null;
          }
        } else {
          currentAmc = trimmed;
        }
        continue;
      }

      const firstChar = trimmed.charCodeAt(0);
      if (firstChar >= 48 && firstChar <= 57 && isOpenEnded && currentGroup) {
        const parts = trimmed.split(';');
        if (parts.length >= 8 && parts[7]?.trim()) {
          const dStr = parts[7].trim();
          const pDate = parseNavDate(dStr);
          if (!isNaN(pDate.getTime()) && pDate.getTime() <= todayTime) {
            activeOpenEndedCount[currentGroup]++;
            const dc = dateCounts[currentGroup];
            dc.set(dStr, (dc.get(dStr) || 0) + 1);
            const da = dateAmcs[currentGroup];
            if (!da.has(dStr)) da.set(dStr, new Set());
            da.get(dStr).add(currentAmc);
          }
        }
      }
    }

    const groups = ['equity', 'debt', 'hybrid', 'other'];
    const resolved = { ...(this.groupNavDates || {}) };

    for (const grp of groups) {
      const totalActive = activeOpenEndedCount[grp];
      if (totalActive === 0) continue;

      const minSchemeCount = Math.ceil(totalActive * 0.10); // 10% active open-ended quorum
      const minAmcCount = 3; // At least 3 distinct AMC institutions

      let bestDate = null;
      let mostFrequentDate = null;
      let maxCount = 0;

      for (const [dStr, count] of dateCounts[grp].entries()) {
        const amcSet = dateAmcs[grp].get(dStr);
        const amcCount = amcSet ? amcSet.size : 0;

        if (count > maxCount) {
          maxCount = count;
          mostFrequentDate = dStr;
        }

        if (amcCount >= minAmcCount && count >= minSchemeCount) {
          if (!bestDate || parseNavDate(dStr).getTime() > parseNavDate(bestDate).getTime()) {
            bestDate = dStr;
          }
        }
      }

      if (bestDate) {
        resolved[grp] = bestDate;
      } else if (!resolved[grp]) {
        resolved[grp] = mostFrequentDate;
      }
    }

    this.groupNavDates = resolved;
    return resolved;
  }

  getGroupNavDates() {
    return { ...(this.groupNavDates || {}) };
  }

  getGroupNavDate(categoryOrGroup) {
    if (!categoryOrGroup) return this.reportDate;
    const grp = getAssetGroupForCategory(categoryOrGroup) || categoryOrGroup;
    return (this.groupNavDates && this.groupNavDates[grp]) ? this.groupNavDates[grp] : this.reportDate;
  }

  /**
   * Helper to robustly extract the latest market date with comprehensive coverage from NAVAll.txt
   */
  extractLatestMarketDateFromNavAll(text) {
    if (!text) return null;
    const groupDates = this.extractGroupNavDatesFromNavAll(text);
    return groupDates.equity || groupDates.debt || this.reportDate;
  }

  /**
   * Resolves the latest available mutual fund NAV date across India from authoritative feeds
   */
  async resolveLatestNavDate(force = false) {
    let maxDate = null;

    // 1. Live fetch from official AMFI NAVAll.txt if force is true
    if (force) {
      try {
        const res = await fetch('https://www.amfiindia.com/spages/NAVAll.txt', {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          signal: AbortSignal.timeout(15000)
        });
        if (res.ok) {
          const text = await res.text();
          if (text && text.length > 1000) {
            const detected = this.extractLatestMarketDateFromNavAll(text);
            if (detected) {
              maxDate = detected;
              if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
              fs.writeFileSync(NAVALL_CACHE_FILE, text, 'utf-8');
            }
          }
        }
      } catch (err) {
        logger.warn(`Could not force resolve latest NAV date from live NAVAll.txt: ${err.message}`);
      }
    }

    // 2. Scan disk cache of NAVAll.txt for comprehensive market date
    if (!maxDate && fs.existsSync(NAVALL_CACHE_FILE)) {
      try {
        const text = fs.readFileSync(NAVALL_CACHE_FILE, 'utf-8');
        const detected = this.extractLatestMarketDateFromNavAll(text);
        if (detected) {
          maxDate = detected;
        }
      } catch (e) {}
    }

    // 3. Scan in-memory schemes if available
    if (!maxDate && this.masterSchemes && this.masterSchemes.length > 0) {
      const counts = new Map();
      for (const s of this.masterSchemes) {
        if (s.navDate) {
          counts.set(s.navDate, (counts.get(s.navDate) || 0) + 1);
        }
      }
      for (const [d, count] of counts.entries()) {
        if (count >= 50) {
          if (!maxDate || parseNavDate(d).getTime() > parseNavDate(maxDate).getTime()) {
            maxDate = d;
          }
        }
      }
    }

    // 4. Scan in-memory navHistoryCache
    if (!maxDate) {
      for (const entry of this.navHistoryCache.values()) {
        if (entry?.navList?.[0]?.date) {
          const d = entry.navList[0].date;
          if (!maxDate || parseNavDate(d).getTime() > parseNavDate(maxDate).getTime()) {
            maxDate = d;
          }
        }
      }
    }

    if (maxDate && (!this.reportDate || parseNavDate(maxDate).getTime() > parseNavDate(this.reportDate).getTime())) {
      this.reportDate = maxDate;
    }

    return maxDate || this.reportDate;
  }

  /**
   * Fetch Live AUM, Benchmarks, and Riskometers directly from official AMFI Fund Performance endpoint
   * Covers all 5 AMFI Categories: Equity, Debt, Hybrid, Solution Oriented, and Other (Index/ETFs/FoFs)
   */
  async fetchAmfiLiveAumData(allowBackgroundRefresh = true, force = false) {
    if (!force) {
      let diskCache = null;
      try {
        if (fs.existsSync(AUM_CACHE_FILE)) {
          const raw = fs.readFileSync(AUM_CACHE_FILE, 'utf-8');
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.entries) && parsed.entries.length > 0) {
            diskCache = parsed;
            if (parsed.reportDate) {
              if (!this.reportDate || parseNavDate(parsed.reportDate).getTime() > parseNavDate(this.reportDate).getTime()) {
                this.reportDate = parsed.reportDate;
              }
            }

            const cacheAgeMs = Date.now() - new Date(parsed.savedAt || 0).getTime();
            const isStale = cacheAgeMs >= 24 * 60 * 60 * 1000;

            if (!isStale) {
              logger.info(`Using warm AMFI AUM disk cache with ${parsed.entries.length} schemes (saved ${Math.round(cacheAgeMs / 60000)}m ago).`);
              return parsed.entries;
            } else if (allowBackgroundRefresh) {
              logger.info(`Using existing AMFI AUM disk cache (${parsed.entries.length} schemes) while triggering background revalidation...`);
              setTimeout(() => {
                this.refreshAmfiLiveAumData().catch(e => {
                  logger.warn(`Background AUM refresh failed: ${e.message}`);
                });
              }, 1000);
              return parsed.entries;
            }
          }
        }
      } catch (e) {
        logger.warn(`Could not read AMFI AUM disk cache: ${e.message}`);
      }
    }

    return this.refreshAmfiLiveAumData();
  }

  async refreshAmfiLiveAumData() {
    if (this._inFlightAumRefresh) return this._inFlightAumRefresh;

    this._inFlightAumRefresh = (async () => {
      try {
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
        for (let dayOffset = 0; dayOffset <= 5; dayOffset++) {
          const candidateDate = new Date(today);
          candidateDate.setDate(today.getDate() - dayOffset);
          candidateDates.push(formatAmfiDate(candidateDate));
        }

        // Fast Probe: Test 1 category against candidate dates to find active published reportDate
        let resolvedDate = null;
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
                category: 1,
                subCategory: 1,
                mfid: 0,
                reportDate: dateStr
              }),
              signal: AbortSignal.timeout(4000)
            });

            if (res.ok) {
              const json = await res.json();
              if (json.data && json.data.length > 0) {
                resolvedDate = dateStr;
                break;
              }
            }
          } catch (err) {}
        }

        const datesToQuery = resolvedDate ? [resolvedDate] : candidateDates.slice(0, 2);
        const collectedMap = new Map();

        await pMap(AMFI_QUERY_PAIRS, async (p) => {
          for (const dateStr of datesToQuery) {
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
                signal: AbortSignal.timeout(5000)
              });

              if (res.ok) {
                const json = await res.json();
                const list = json.data || [];
                if (list.length > 0) {
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
        }, 8);

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
        } else {
          try {
            if (fs.existsSync(AUM_CACHE_FILE)) {
              const diskCacheRaw = fs.readFileSync(AUM_CACHE_FILE, 'utf-8');
              const diskCache = JSON.parse(diskCacheRaw);
              if (diskCache && Array.isArray(diskCache.entries) && diskCache.entries.length > 0) {
                amfiEntries = diskCache.entries;
                if (!resolvedDate && diskCache.reportDate) {
                  resolvedDate = diskCache.reportDate;
                }
              }
            }
          } catch (err) {}
        }

        if (resolvedDate) {
          if (!this.reportDate || parseNavDate(resolvedDate).getTime() > parseNavDate(this.reportDate).getTime()) {
            this.reportDate = resolvedDate;
          }
        }

        return amfiEntries;
      } finally {
        this._inFlightAumRefresh = null;
      }
    })();

    return this._inFlightAumRefresh;
  }

  /**
   * Initialize and build the master index of all Indian Mutual Fund schemes with real AMFI AUM
   */
  async initializeMasterRegistry(force = false) {
    if (!force && this.isInitialized && this.masterSchemes.length > 0) return;

    if (!force && this.inFlightInitPromise) {
      return this.inFlightInitPromise;
    }

    this.inFlightInitPromise = (async () => {
      logger.info(`Initializing complete Indian Mutual Fund Master Scheme Registry${force ? ' (forced live refresh)' : ''}...`);
      const startTime = Date.now();

      try {
        // 1. Fetch live AMFI AUM dataset across all categories (force live refresh if requested)
        const amfiList = await this.fetchAmfiLiveAumData(!force, force);

        // 2. Fetch full master scheme directory directly from official AMFI NAVAll.txt with instant disk cache fast-boot
        let text = '';
        if (force) {
          try {
            logger.info('Manual refresh: Fetching fresh NAVAll.txt synchronously from AMFI...');
            const res = await fetch('https://www.amfiindia.com/spages/NAVAll.txt', {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
              signal: AbortSignal.timeout(20000)
            });
            if (res.ok) {
              const freshText = await res.text();
              if (freshText && freshText.length > 1000) {
                text = freshText;
                if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
                fs.writeFileSync(NAVALL_CACHE_FILE, freshText, 'utf-8');
                logger.info('Manual refresh: Successfully persisted fresh NAVAll.txt to disk cache.');
              }
            }
          } catch (forceErr) {
            logger.warn(`Could not force live fetch NAVAll.txt: ${forceErr.message}. Falling back to disk cache.`);
          }
        }

        if (!text && fs.existsSync(NAVALL_CACHE_FILE)) {
          try {
            text = fs.readFileSync(NAVALL_CACHE_FILE, 'utf-8');
            logger.info(`Fast-boot: Loaded master scheme list from disk cache (${NAVALL_CACHE_FILE}).`);
            
            // Check for newer NAVAll.txt in background without blocking server boot
            setTimeout(async () => {
              try {
                const res = await fetch('https://www.amfiindia.com/spages/NAVAll.txt', {
                  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                  signal: AbortSignal.timeout(15000)
                });
                if (res.ok) {
                  const freshText = await res.text();
                  if (freshText && freshText.length > 1000) {
                    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
                    fs.writeFileSync(NAVALL_CACHE_FILE, freshText, 'utf-8');
                    logger.info('Background update: Persisted fresh NAVAll.txt from AMFI to disk cache.');

                    const bgLatestDate = this.extractLatestMarketDateFromNavAll(freshText);
                    if (bgLatestDate && (!this.reportDate || parseNavDate(bgLatestDate).getTime() > parseNavDate(this.reportDate).getTime())) {
                      this.reportDate = bgLatestDate;
                      logger.info(`Background update: Advanced AMFI reportDate to ${bgLatestDate}`);
                    }
                  }
                }
              } catch (bgErr) {
                logger.warn(`Background NAVAll.txt refresh notice: ${bgErr.message}`);
              }
            }, 5000);
          } catch (readErr) {
            logger.warn(`Could not read cached NAVAll.txt: ${readErr.message}`);
          }
        }

        if (!text) {
          try {
            const res = await fetch('https://www.amfiindia.com/spages/NAVAll.txt', {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
              signal: AbortSignal.timeout(15000)
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
        }

        if (!text) throw new Error('Failed to retrieve master scheme list from AMFI and no disk cache available.');
        const lines = text.split('\n');
        const rawList = [];
        let currentCategory = '';
        let currentAmc = '';

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

        const detectedNavDate = this.extractLatestMarketDateFromNavAll(text);
        if (detectedNavDate) {
          if (!this.reportDate || parseNavDate(detectedNavDate).getTime() > parseNavDate(this.reportDate).getTime()) {
            this.reportDate = detectedNavDate;
          }
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
            const cat = categorizeScheme(s.category, baseName);
            const subCatName = cat === 'Debt / Liquid' ? determineDebtSubCategory(s.category, baseName) : '';
            const schemeOption = determineSchemeOption(baseName);
            const aumVal = match ? match.dailyAUM : null;

            const newItem = {
              id: slugId,
              displayName: baseName,
              amfiSchemeName: baseName,
              amcName,
              category: cat,
              subCategoryName: subCatName,
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
            const cat = categorizeScheme(s.category, baseName);
            const subCatName = cat === 'Debt / Liquid' ? determineDebtSubCategory(s.category, baseName) : '';
            if (cat === 'Debt / Liquid' && (!existing.subCategoryName || existing.category === 'Other')) {
              existing.category = 'Debt / Liquid';
              existing.subCategoryName = subCatName;
            }
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
        this.primeSuggestionSchemes();
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
   * Background prime full historical NAVs for curated Suggestion Sheet schemes
   */
  primeSuggestionSchemes() {
    setTimeout(async () => {
      try {
        const codesToPrime = [];
        MASTER_ALLOWLIST.forEach(item => {
          if (item.regularSchemeCode && !this.navHistoryCache.get(item.regularSchemeCode)?.isComplete) {
            codesToPrime.push(item.regularSchemeCode);
          }
          if (item.directSchemeCode && !this.navHistoryCache.get(item.directSchemeCode)?.isComplete) {
            codesToPrime.push(item.directSchemeCode);
          }
        });
        if (codesToPrime.length > 0) {
          logger.info(`Priming complete historical NAVs for ${codesToPrime.length} Suggestion Sheet scheme codes in background...`);
          await pMap(codesToPrime, async (code) => {
            await this.fetchMfapiNavHistory(code);
          }, 8);
          logger.info(`Suggestion Sheet historical NAVs primed successfully!`);
        }
      } catch (err) {
        logger.warn(`Background priming of suggestion schemes: ${err.message}`);
      }
    }, 200);
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
          signal: AbortSignal.timeout(6000)
        });
        if (!res.ok) {
          this.failedDateWindows.set(key, Date.now());
          return;
        }

        const text = await res.text();
        const lines = text.split('\n');
        let matchedCount = 0;
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
              matchedCount++;
            }
          }
        }
        if (matchedCount > 0) {
          this.completedDateWindows.add(key);
          this.failedDateWindows.delete(key);
        } else {
          // If no records matched (e.g. portal returned an HTML page), do not mark as completed
          this.failedDateWindows.set(key, Date.now());
        }
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

          if (mergedList[0]?.date) {
            const newestDate = mergedList[0].date;
            if (!this.reportDate || parseNavDate(newestDate).getTime() > parseNavDate(this.reportDate).getTime()) {
              this.reportDate = newestDate;
            }
          }

          this.navHistoryCache.set(code, {
            navList: mergedList,
            timestamp: Date.now(),
            isComplete: true
          });
          this.scheduleNavCacheSave();

          // Invalidate stale computed returns cache for this scheme
          for (const k of this.computedCache.keys()) {
            if (k.startsWith(`${code}_`)) {
              this.computedCache.delete(k);
            }
          }

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
      return !Array.from(fetchedMap.values()).some(r => {
        const rDate = parseNavDate(r.date);
        if (!rDate || isNaN(rDate.getTime())) return false;
        const diffDays = Math.abs((rDate.getTime() - tDate.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays <= 7;
      });
    });

    if (missingTargets.length > 0) {
      let hadFailure = false;
      const windowsToFetch = missingTargets.slice(0, 3);
      await Promise.all(windowsToFetch.map(async (tDate) => {
        const sDate = new Date(tDate);
        sDate.setDate(sDate.getDate() - 10);
        const fromStr = formatAmfiDate(sDate);
        const toStr = formatAmfiDate(tDate);
        const windowKey = `${fromStr}_${toStr}`;

        // If circuit breaker is tripped for this window, skip attempting AMFI
        const lastFailed = this.failedDateWindows.get(windowKey);
        if (lastFailed && (Date.now() - lastFailed < 5 * 60 * 1000)) {
          hadFailure = true;
          return;
        }

        await this.fetchAmfiPortalDateWindow(fromStr, toStr);
        if (this.failedDateWindows.has(windowKey)) {
          hadFailure = true;
        }
      }));

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
      if (navList[0]?.date) {
        const newestDate = navList[0].date;
        if (!this.reportDate || parseNavDate(newestDate).getTime() > parseNavDate(this.reportDate).getTime()) {
          this.reportDate = newestDate;
        }
      }
      this.navHistoryCache.set(code, {
        navList,
        timestamp: Date.now()
      });
      this.scheduleNavCacheSave();
    }
    return navList;
  }

  /**
   * Determine if a NAV history series is continuous daily data or merely sparse sampled window data
   * @param {Array<{date: string, nav: number}>} navList
   * @returns {boolean}
   */
  isNavListContinuous(navList) {
    if (!Array.isArray(navList) || navList.length < 25) return false;

    const latest = parseNavDate(navList[0]?.date);
    const earliest = parseNavDate(navList[navList.length - 1]?.date);
    if (!latest || !earliest || isNaN(latest.getTime()) || isNaN(earliest.getTime())) return false;

    const spanDays = (latest.getTime() - earliest.getTime()) / (1000 * 3600 * 24);
    const spanYears = spanDays / 365.25;

    // If span is more than 1.5 years and we have fewer than 100 records per year, it is sparse window data
    if (spanYears > 1.5 && navList.length < (spanYears * 100)) {
      return false;
    }

    // Check for large gaps between consecutive records
    // In normal Indian trading, business day gaps rarely exceed 5-6 calendar days (long weekends).
    // Gaps > 25 calendar days indicate missing monthly blocks.
    const checkCount = Math.min(navList.length - 1, 500);
    for (let i = 0; i < checkCount; i++) {
      const t1 = parseNavDate(navList[i].date).getTime();
      const t2 = parseNavDate(navList[i + 1].date).getTime();
      if (t1 > 0 && t2 > 0) {
        const gapDays = Math.abs(t1 - t2) / (1000 * 3600 * 24);
        if (gapDays > 25) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Fetch historical NAV time series for a schemeCode with caching and MFAPI fallback
   * @param {number|string} schemeCode
   * @param {string|Date} minRequiredDate Optional minimum date that must be covered in the time series
   * @param {Object} options Optional options { requireContinuous: boolean }
   */
  async getNavHistory(schemeCode, minRequiredDate = null, { requireContinuous = false } = {}) {
    if (!schemeCode) return [];
    const code = Number(schemeCode);

    const now = Date.now();
    const cached = this.navHistoryCache.get(code);
    if (cached && Array.isArray(cached.navList) && cached.navList.length > 0) {
      const targetDate = minRequiredDate ? parseNavDate(minRequiredDate) : (this.reportDate ? parseNavDate(this.reportDate) : new Date());
      const targetTime = (targetDate && !isNaN(targetDate.getTime())) ? targetDate.getTime() : now;
      const latestCachedDate = parseNavDate(cached.navList[0]?.date);
      const latestTime = (latestCachedDate && !isNaN(latestCachedDate.getTime())) ? latestCachedDate.getTime() : 0;

      // Determine if cache has records covering the requested target date
      let isUpToDate = false;
      const reportTime = this.reportDate ? parseNavDate(this.reportDate).getTime() : 0;
      if (latestTime >= targetTime) {
        // Cache has records on or after the requested target date
        isUpToDate = true;
      } else if (reportTime > 0 && targetTime >= reportTime && latestTime >= reportTime) {
        // Cache already has records up to the latest verified AMFI report date
        isUpToDate = true;
      } else {
        // Latest record is before targetDate. Check if targetDate is a weekend/holiday where Friday was the latest trading day:
        const targetDayOfWeek = targetDate.getDay();
        const diffDays = (targetTime - latestTime) / (1000 * 60 * 60 * 24);
        if (targetDayOfWeek === 6 && diffDays <= 1.5) {
          // Saturday, latest is Friday (1 day back)
          isUpToDate = true;
        } else if (targetDayOfWeek === 0 && diffDays <= 2.5) {
          // Sunday, latest is Friday (2 days back)
          isUpToDate = true;
        } else if (Date.now() - (cached.timestamp || 0) < 5 * 60 * 1000) {
          // Already attempted fetch within the last 5 minutes from MFAPI
          isUpToDate = true;
        }
      }

      if (isUpToDate) {
        if (cached.isComplete) {
          return cached.navList;
        }
        const isContinuous = this.isNavListContinuous(cached.navList);
        if (!requireContinuous || isContinuous) {
          return cached.navList;
        }
      } else {
        logger.info(`NAV history cache for scheme ${code} does not have records up to ${minRequiredDate || 'target date'} (latest cached: ${cached.navList[0]?.date}). Refreshing from MFAPI...`);
      }
    }

    // 1. PRIMARY FAST FETCH: MFAPI CDN (returns complete 10-15Y continuous daily history in ~200-500ms)
    try {
      const mfapiList = await this.fetchMfapiNavHistory(code);
      if (mfapiList && mfapiList.length > 0) {
        return mfapiList;
      }
    } catch (mfErr) {
      logger.warn(`MFAPI fast fetch failed for scheme code ${code}: ${mfErr.message}. Attempting AMFI fallback...`);
    }

    // 2. FALLBACK: Official AMFI portal window fetch (only if MFAPI is down or empty)
    try {
      const list = await this.fetchOfficialAmfiNavHistory(code, minRequiredDate);
      if (list && list.length > 0) {
        return list;
      }
    } catch (err) {
      logger.warn(`Failed to fetch official AMFI NAV history for scheme code ${code}: ${err.message}`);
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
        // If histMatch is provided and cached currentNav does not match histMatch's ground truth, bypass cache
        const matchNav = histMatch ? (isDirect ? (histMatch.navDirect || histMatch.navRegular) : (histMatch.navRegular || histMatch.navDirect)) : null;
        const isMismatch = matchNav && cached.data?.currentNav && Math.abs(Number(cached.data.currentNav) - Number(matchNav)) > 0.05;
        if (!isMismatch) {
          const histEntry = this.navHistoryCache.get(Number(schemeCode));
          const hasMissingReturns = cached.data?.return5Yr === null || cached.data?.return10Yr === null;
          if (!hasMissingReturns || !histEntry?.isComplete) {
            const targetReqDate = parseNavDate(targetAnchorDate);
            const cachedNavDate = parseNavDate(cached.data?.navDate);
            const daysDiff = (targetReqDate && cachedNavDate) ? (targetReqDate.getTime() - cachedNavDate.getTime()) / (1000 * 60 * 60 * 24) : 0;
            if (asOfDate) {
              const targetDow = targetReqDate ? targetReqDate.getDay() : -1;
              if (cachedNavDate && targetReqDate && cachedNavDate.getTime() >= targetReqDate.getTime()) {
                return cached.data;
              } else if (targetDow === 6 && daysDiff <= 1.5) {
                return cached.data;
              } else if (targetDow === 0 && daysDiff <= 2.5) {
                return cached.data;
              }
            } else if (daysDiff <= 3.5) {
              return cached.data;
            }
          }
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
      navDate: asOfDate ? formatAmfiDate(parseNavDate(asOfDate)) : this.reportDate,
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
    let sortedNavList = [...navList].sort((a, b) => parseNavDate(b.date).getTime() - parseNavDate(a.date).getTime());

    // Inject official ground-truth NAV from histMatch if available
    if (histMatch) {
      const matchNav = isDirect ? (histMatch.navDirect || histMatch.navRegular) : (histMatch.navRegular || histMatch.navDirect);
      const matchDateStr = histMatch.navDate || (asOfDate ? formatAmfiDate(parseNavDate(asOfDate)) : null);
      if (matchNav && matchDateStr && !isNaN(Number(matchNav))) {
        const matchTime = parseNavDate(matchDateStr).getTime();
        const existingIdx = sortedNavList.findIndex(item => parseNavDate(item.date).getTime() === matchTime);
        if (existingIdx >= 0) {
          sortedNavList[existingIdx] = { date: matchDateStr, nav: Number(matchNav) };
        } else {
          sortedNavList.push({ date: matchDateStr, nav: Number(matchNav) });
          sortedNavList.sort((a, b) => parseNavDate(b.date).getTime() - parseNavDate(a.date).getTime());
        }
      }
    }

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
          // If no record preceding or matching targetValDate, do not pick a record from the future
          latestObj = null;
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

    let VT = Number(latestObj.nav);
    let latestDate = parseNavDate(latestObj.date);

    resultReturns.currentNav = VT;
    resultReturns.navDate = latestObj.date;

    // Check if deep historical data (5Y, 10Y) is needed and navList is not yet verified complete from inception
    const codeNum = Number(schemeCode);
    const cachedEntry = this.navHistoryCache.get(codeNum);
    if (!cachedEntry || !cachedEntry.isComplete) {
      const tenYearsAgo = new Date(latestDate);
      tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
      const earliestInList = sortedNavList.length > 0 ? parseNavDate(sortedNavList[sortedNavList.length - 1].date) : null;
      if (!earliestInList || earliestInList.getTime() > tenYearsAgo.getTime()) {
        try {
          const fullMfapiList = await this.fetchMfapiNavHistory(codeNum);
          if (fullMfapiList && fullMfapiList.length > 0) {
            sortedNavList = [...fullMfapiList].sort((a, b) => parseNavDate(b.date).getTime() - parseNavDate(a.date).getTime());
            if (histMatch) {
              const matchNav = isDirect ? (histMatch.navDirect || histMatch.navRegular) : (histMatch.navRegular || histMatch.navDirect);
              const matchDateStr = histMatch.navDate || (asOfDate ? formatAmfiDate(parseNavDate(asOfDate)) : null);
              if (matchNav && matchDateStr && !isNaN(Number(matchNav))) {
                const matchTime = parseNavDate(matchDateStr).getTime();
                const existingIdx = sortedNavList.findIndex(item => parseNavDate(item.date).getTime() === matchTime);
                if (existingIdx >= 0) {
                  sortedNavList[existingIdx] = { date: matchDateStr, nav: Number(matchNav) };
                } else {
                  sortedNavList.push({ date: matchDateStr, nav: Number(matchNav) });
                  sortedNavList.sort((a, b) => parseNavDate(b.date).getTime() - parseNavDate(a.date).getTime());
                }
              }
            }
            if (asOfDate) {
              const targetValDate = parseNavDate(asOfDate);
              const found = sortedNavList.find(item => parseNavDate(item.date).getTime() <= targetValDate.getTime());
              if (found) {
                latestObj = found;
                VT = Number(latestObj.nav);
                latestDate = parseNavDate(latestObj.date);
                resultReturns.currentNav = VT;
                resultReturns.navDate = latestObj.date;
              }
            } else if (sortedNavList[0]) {
              latestObj = sortedNavList[0];
              VT = Number(latestObj.nav);
              latestDate = parseNavDate(latestObj.date);
              resultReturns.currentNav = VT;
              resultReturns.navDate = latestObj.date;
            }
          }
        } catch (e) {
          logger.warn(`Could not fetch full history for ${codeNum}: ${e.message}`);
        }
      }
    }

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
    const growthSchemes = this.masterSchemes.filter(s => {
      const sOpt = s.schemeOption || determineSchemeOption(s.displayName);
      return sOpt === 'growth';
    });

    growthSchemes.forEach(s => {
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
   * Retrieve official AMFI Debt Subcategories with counts
   */
  getDebtSubCategories() {
    const growthDebtSchemes = this.masterSchemes.filter(s => {
      const sOpt = s.schemeOption || determineSchemeOption(s.displayName);
      return sOpt === 'growth' && s.category === 'Debt / Liquid';
    });

    const subCounts = {};
    growthDebtSchemes.forEach(s => {
      const sub = s.subCategoryName || determineDebtSubCategory('', s.displayName);
      subCounts[sub] = (subCounts[sub] || 0) + 1;
    });

    return [
      { id: 'all', name: 'All Sub Categories', count: growthDebtSchemes.length },
      { id: 'short-term', name: 'Short Term', count: (subCounts['Short Term'] || 0) },
      { id: 'liquid', name: 'Liquid', count: (subCounts['Liquid'] || 0) },
      { id: 'overnight', name: 'Overnight', count: (subCounts['Overnight'] || 0) },
      { id: 'money-market', name: 'Money Market', count: (subCounts['Money Market'] || 0) },
      { id: 'ultra-short-term', name: 'Ultra Short Term Fund', count: (subCounts['Ultra Short Term Fund'] || 0) },
      { id: 'low-duration', name: 'Ultra Short to Short Term (Low Duration)', count: (subCounts['Ultra Short to Short Term'] || 0) },
      { id: 'medium-term', name: 'Medium Term', count: (subCounts['Medium Term'] || 0) },
      { id: 'medium-to-long-term', name: 'Medium to Long Term', count: (subCounts['Medium to Long Term'] || 0) },
      { id: 'long-term', name: 'Long Term', count: (subCounts['Long Term'] || 0) },
      { id: 'corporate-bond', name: 'Corporate Bond', count: (subCounts['Corporate Bond'] || 0) },
      { id: 'credit-risk', name: 'Credit Risk', count: (subCounts['Credit Risk'] || 0) },
      { id: 'banking-psu', name: 'Banking & PSU', count: (subCounts['Banking & PSU'] || 0) },
      { id: 'gilt', name: 'Gilt', count: (subCounts['Gilt'] || 0) },
      { id: 'floater', name: 'Floater / Floating Rate', count: (subCounts['Floater'] || 0) },
      { id: 'dynamic-bond', name: 'Dynamic Bond', count: (subCounts['Dynamic Bond'] || 0) },
      { id: '10-year-gilt', name: '10 Year Gilt', count: (subCounts['10 Year Gilt'] || 0) }
    ];
  }

  /**
   * Get filtered and paginated schemes with calculated returns
   */
  async getFunds({ category = 'all', subCategory = 'all', search = '', plan = 'regular', option = 'growth', page = 1, limit = 50, days, customDays = '33,50,67', startDate = null, endDate = null, asOfDate = null }) {
    await this.initializeMasterRegistry();

    const daysParam = days || customDays;
    const daysList = parseDaysList(daysParam);

    // Fund Analysis dataset contains ONLY Growth-option mutual fund schemes
    let filtered = this.masterSchemes.filter(s => {
      const sOpt = s.schemeOption || determineSchemeOption(s.displayName);
      return sOpt === 'growth';
    });

    // Category Filter
    if (category && category.trim().toLowerCase() !== 'all') {
      const catLower = category.trim().toLowerCase();
      filtered = filtered.filter(s => 
        s.category.toLowerCase() === catLower ||
        s.category.toLowerCase().replace(/[^a-z0-9]+/g, '-') === catLower
      );
    }

    // Sub Category Filter (for Debt / Liquid or any category)
    if (subCategory && subCategory.trim().toLowerCase() !== 'all') {
      filtered = filtered.filter(s => 
        matchesDebtSubCategory(s.subCategoryName || '', subCategory, s.displayName)
      );
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

        const computedNavTime = computed.navDate ? parseNavDate(computed.navDate).getTime() : 0;
        const histNavTime = histMatch?.navDate ? parseNavDate(histMatch.navDate).getTime() : 0;

        let navRegular = null;
        let navDirect = null;
        let currentNav = null;
        let navDate = null;

        if (histMatch && histNavTime > computedNavTime) {
          navRegular = histMatch.navRegular || computed.regNav || scheme.navRegular || null;
          navDirect = histMatch.navDirect || computed.dirNav || scheme.navDirect || null;
          currentNav = isDir ? (navDirect || navRegular) : (navRegular || navDirect);
          navDate = histMatch.navDate;
        } else {
          navRegular = computed.regNav || (isDir ? null : computed.currentNav) || histMatch?.navRegular || scheme.navRegular || null;
          navDirect = computed.dirNav || (isDir ? computed.currentNav : null) || histMatch?.navDirect || scheme.navDirect || null;
          currentNav = computed.currentNav || (isDir ? (navDirect || navRegular) : (navRegular || navDirect));
          navDate = computed.navDate || histMatch?.navDate || histAumRes?.effectiveDate || this.reportDate;
        }

        return {
          id: scheme.id,
          displayName: scheme.displayName,
          amfiSchemeName: scheme.amfiSchemeName,
          category: scheme.category,
          subCategoryName: scheme.subCategoryName || (scheme.category === 'Debt / Liquid' ? determineDebtSubCategory('', scheme.displayName) : ''),
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

    const dateCounts = new Map();
    for (const f of fundsWithReturns) {
      if (f.navDate) {
        dateCounts.set(f.navDate, (dateCounts.get(f.navDate) || 0) + 1);
      }
    }
    let latestFundNavDate = null;
    let maxCount = 0;
    for (const [dStr, count] of dateCounts.entries()) {
      if (count > maxCount || (count === maxCount && latestFundNavDate && parseNavDate(dStr).getTime() > parseNavDate(latestFundNavDate).getTime())) {
        maxCount = count;
        latestFundNavDate = dStr;
      }
    }

    if (!asOfDate && latestFundNavDate && (!this.reportDate || parseNavDate(latestFundNavDate).getTime() > parseNavDate(this.reportDate).getTime())) {
      this.reportDate = latestFundNavDate;
    }

    let finalReportDate = latestFundNavDate;
    if (!finalReportDate || (histAumRes?.effectiveDate && parseNavDate(histAumRes.effectiveDate).getTime() > parseNavDate(finalReportDate).getTime())) {
      finalReportDate = histAumRes?.effectiveDate;
    }
    if (!finalReportDate) {
      if (asOfDate) {
        finalReportDate = formatAmfiDate(parseNavDate(asOfDate));
      } else {
        finalReportDate = this.reportDate;
      }
    }

    return {
      funds: fundsWithReturns,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      customDaysList: daysList,
      debtSubCategories: this.getDebtSubCategories(),
      reportDate: finalReportDate,
      reportDates: this.getGroupNavDates(),
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
      return {
        funds: [],
        total: 0,
        customDaysList: daysList,
        reportDate: asOfDate ? formatAmfiDate(parseNavDate(asOfDate)) : this.reportDate,
        lastUpdated: this.lastUpdated
      };
    }

    const matchedSchemes = ids
      .map(id => this.schemeMap.get(id))
      .filter(Boolean)
      .filter(s => {
        const sOpt = s.schemeOption || determineSchemeOption(s.displayName);
        return sOpt === 'growth';
      });

    if (matchedSchemes.length === 0) {
      return {
        funds: [],
        total: 0,
        customDaysList: daysList,
        reportDate: asOfDate ? formatAmfiDate(parseNavDate(asOfDate)) : this.reportDate,
        lastUpdated: this.lastUpdated
      };
    }

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

        const computedNavTime = computed.navDate ? parseNavDate(computed.navDate).getTime() : 0;
        const histNavTime = histMatch?.navDate ? parseNavDate(histMatch.navDate).getTime() : 0;

        let navRegular = null;
        let navDirect = null;
        let currentNav = null;
        let navDate = null;

        if (histMatch && histNavTime > computedNavTime) {
          navRegular = histMatch.navRegular || computed.regNav || scheme.navRegular || null;
          navDirect = histMatch.navDirect || computed.dirNav || scheme.navDirect || null;
          currentNav = isDir ? (navDirect || navRegular) : (navRegular || navDirect);
          navDate = histMatch.navDate;
        } else {
          navRegular = computed.regNav || (isDir ? null : computed.currentNav) || histMatch?.navRegular || scheme.navRegular || null;
          navDirect = computed.dirNav || (isDir ? computed.currentNav : null) || histMatch?.navDirect || scheme.navDirect || null;
          currentNav = computed.currentNav || (isDir ? (navDirect || navRegular) : (navRegular || navDirect));
          navDate = computed.navDate || histMatch?.navDate || histAumRes?.effectiveDate || this.reportDate;
        }

        return {
          id: scheme.id,
          displayName: scheme.displayName,
          amfiSchemeName: scheme.amfiSchemeName,
          category: scheme.category,
          subCategoryName: scheme.subCategoryName || (scheme.category === 'Debt / Liquid' ? determineDebtSubCategory('', scheme.displayName) : ''),
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

    // Category-wise grouping & alphabetical sorting within category
    fundsWithReturns.sort((a, b) => {
      const orderA = CATEGORY_DISPLAY_ORDER[a.category] || 99;
      const orderB = CATEGORY_DISPLAY_ORDER[b.category] || 99;
      if (orderA !== orderB) return orderA - orderB;
      return a.displayName.localeCompare(b.displayName);
    });

    const dateCounts = new Map();
    for (const f of fundsWithReturns) {
      if (f.navDate) {
        dateCounts.set(f.navDate, (dateCounts.get(f.navDate) || 0) + 1);
      }
    }
    let latestFundNavDate = null;
    let maxCount = 0;
    for (const [dStr, count] of dateCounts.entries()) {
      if (count > maxCount || (count === maxCount && latestFundNavDate && parseNavDate(dStr).getTime() > parseNavDate(latestFundNavDate).getTime())) {
        maxCount = count;
        latestFundNavDate = dStr;
      }
    }

    if (!asOfDate && latestFundNavDate && (!this.reportDate || parseNavDate(latestFundNavDate).getTime() > parseNavDate(this.reportDate).getTime())) {
      this.reportDate = latestFundNavDate;
    }

    let finalReportDate = latestFundNavDate;
    if (!finalReportDate || (histAumRes?.effectiveDate && parseNavDate(histAumRes.effectiveDate).getTime() > parseNavDate(finalReportDate).getTime())) {
      finalReportDate = histAumRes?.effectiveDate;
    }
    if (!finalReportDate) {
      if (asOfDate) {
        finalReportDate = formatAmfiDate(parseNavDate(asOfDate));
      } else {
        finalReportDate = this.reportDate;
      }
    }

    return {
      funds: fundsWithReturns,
      total: fundsWithReturns.length,
      customDaysList: daysList,
      reportDate: finalReportDate,
      reportDates: this.getGroupNavDates(),
      lastUpdated: this.lastUpdated
    };
  }
}

const amfiServiceInstance = new AmfiService();
amfiServiceInstance.formatAmfiDate = formatAmfiDate;
amfiServiceInstance.parseNavDate = parseNavDate;
amfiServiceInstance.formatAmfiDateToIso = formatAmfiDateToIso;
amfiServiceInstance.getAssetGroupForCategory = getAssetGroupForCategory;

module.exports = amfiServiceInstance;
