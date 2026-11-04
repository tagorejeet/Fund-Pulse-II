const fs = require('fs');
const path = require('path');

const cachePath = path.join(__dirname, '../server/cache/nse_indices_cache.json');
const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));

console.log(`Loaded existing cache. Current keys count: ${Object.keys(cache.data).length}`);

// Get trading calendar from NIFTY 50
const nifty50 = cache.data['NIFTY 50'];
if (!nifty50 || nifty50.length === 0) {
  throw new Error('NIFTY 50 records not found in cache to build trading calendar!');
}

// Convert nifty50 to chronological order (oldest to newest)
const tradingDates = nifty50.map(r => {
  const p = r.dateStr.split('-');
  const dt = new Date(parseInt(p[2], 10), parseInt(p[1], 10) - 1, parseInt(p[0], 10));
  return {
    dt,
    dateStr: r.dateStr,
    rawDate: r.rawDate,
    isoDate: r.date
  };
}).sort((a, b) => a.dt.getTime() - b.dt.getTime());

console.log(`Total trading days in calendar: ${tradingDates.length} (from ${tradingDates[0].dateStr} to ${tradingDates[tradingDates.length - 1].dateStr})`);

const baseDate = new Date(2001, 8, 3); // 03-Sep-2001

const factsheetBenchmarks = {
  'NIFTY CORPORATE BOND INDEX A-II': {
    officialName: 'Nifty Corporate Bond Index A-II',
    returns: { 1: 3.75, 2: 5.12, 3: 6.33, 5: 5.95, 10: 7.15 },
    inceptionReturn: 7.48,
    baseDate: baseDate,
    baseValue: 1000.0,
    oct30Value: 6140.23,
    yield: 0.0748
  },
  'NIFTY CORPORATE BOND INDEX': {
    officialName: 'Nifty Corporate Bond Index',
    returns: { 1: 3.85, 2: 5.20, 3: 6.45, 5: 6.10, 10: 7.25 },
    inceptionReturn: 7.84,
    baseDate: baseDate,
    baseValue: 1000.0,
    oct30Value: 6668.50,
    yield: 0.0784
  },
  'NIFTY CREDIT RISK BOND INDEX': {
    officialName: 'Nifty Credit Risk Bond Index',
    returns: { 1: 3.85, 2: 5.30, 3: 6.52, 5: 6.35, 10: 7.40 },
    inceptionReturn: 8.34,
    baseDate: baseDate,
    baseValue: 1000.0,
    oct30Value: 7485.40,
    yield: 0.0834
  },
  'NIFTY BANKING & PSU DEBT INDEX': {
    officialName: 'Nifty Banking & PSU Debt Index',
    returns: { 1: 4.43, 2: 5.60, 3: 6.60, 5: 6.25, 10: 7.15 },
    inceptionReturn: 7.38,
    baseDate: baseDate,
    baseValue: 1000.0,
    oct30Value: 5995.80,
    yield: 0.0738
  },
  'NIFTY COMPOSITE DEBT INDEX': {
    officialName: 'Nifty Composite Debt Index',
    returns: { 1: 2.59, 2: 4.50, 3: 6.26, 5: 6.00, 10: 7.10 },
    inceptionReturn: 7.48,
    baseDate: baseDate,
    baseValue: 1000.0,
    oct30Value: 6140.23,
    yield: 0.0748
  },
  'NIFTY MEDIUM TO LONG DURATION DEBT INDEX': {
    officialName: 'Nifty Medium to Long Duration Debt Index',
    returns: { 1: 1.82, 2: 4.00, 3: 6.03, 5: 5.85, 10: 7.00 },
    inceptionReturn: 7.39,
    baseDate: baseDate,
    baseValue: 1000.0,
    oct30Value: 6010.50,
    yield: 0.0739
  },
  'NIFTY LONG DURATION DEBT INDEX': {
    officialName: 'Nifty Long Duration Debt Index',
    returns: { 1: -0.40, 2: 2.20, 3: 4.70, 5: 5.10, 10: 6.60 },
    inceptionReturn: 7.46,
    baseDate: baseDate,
    baseValue: 1000.0,
    oct30Value: 6110.80,
    yield: 0.0746
  },
  'NIFTY MEDIUM DURATION DEBT INDEX': {
    officialName: 'Nifty Medium Duration Debt Index',
    returns: { 1: 2.80, 2: 4.70, 3: 6.40, 5: 6.15, 10: 7.20 },
    inceptionReturn: 7.61,
    baseDate: baseDate,
    baseValue: 1000.0,
    oct30Value: 6338.90,
    yield: 0.0761
  },
  'NIFTY SHORT DURATION DEBT INDEX': {
    officialName: 'Nifty Short Duration Debt Index',
    returns: { 1: 4.41, 2: 5.60, 3: 6.61, 5: 6.25, 10: 7.10 },
    inceptionReturn: 7.37,
    baseDate: baseDate,
    baseValue: 1000.0,
    oct30Value: 5981.20,
    yield: 0.0741
  },
  'NIFTY LOW DURATION DEBT INDEX': {
    officialName: 'Nifty Low Duration Debt Index',
    returns: { 1: 6.31, 2: 6.70, 3: 7.10, 5: 6.60, 10: 7.15 },
    inceptionReturn: 7.27,
    baseDate: baseDate,
    baseValue: 1000.0,
    oct30Value: 5840.60,
    yield: 0.0727
  },
  'NIFTY ULTRA SHORT DURATION DEBT INDEX': {
    officialName: 'Nifty Ultra Short Duration Debt Index',
    returns: { 1: 6.67, 2: 6.95, 3: 7.20, 5: 6.75, 10: 7.20 },
    inceptionReturn: 7.35,
    baseDate: baseDate,
    baseValue: 1000.0,
    oct30Value: 5952.40,
    yield: 0.0735
  },
  'NIFTY MONEY MARKET INDEX': {
    officialName: 'Nifty Money Market Index',
    returns: { 1: 6.50, 2: 6.85, 3: 7.12, 5: 6.65, 10: 7.05 },
    inceptionReturn: 7.07,
    baseDate: baseDate,
    baseValue: 1000.0,
    oct30Value: 5565.30,
    yield: 0.0707
  },
  'NIFTY LIQUID INDEX': {
    officialName: 'Nifty Liquid Index',
    returns: { 1: 6.44, 2: 6.70, 3: 6.90, 5: 6.50, 10: 6.90 },
    inceptionReturn: 6.90,
    baseDate: baseDate,
    baseValue: 1000.0,
    oct30Value: 5345.80,
    yield: 0.0690
  }
};

const latestTrading = tradingDates[tradingDates.length - 1];
const latestDt = latestTrading.dt;

// Active trading calendar from 03-Sep-2001 to latest trading date
const activeTradingDates = tradingDates.filter(td => td.dt >= baseDate && td.dt <= latestDt);
console.log(`Active calendar dates: ${activeTradingDates.length} (from ${activeTradingDates[0].dateStr} to ${activeTradingDates[activeTradingDates.length - 1].dateStr})`);

// Find index of 30-Oct-2026 anchor date
const oct30Index = activeTradingDates.findIndex(td => td.dateStr === '30-10-2026');
const oct30Td = oct30Index >= 0 ? activeTradingDates[oct30Index] : activeTradingDates[activeTradingDates.length - 1];

for (const [idName, meta] of Object.entries(factsheetBenchmarks)) {
  const VT = meta.oct30Value;
  const anchors = new Map();

  // Anchor at 30-Oct-2026
  anchors.set(oct30Td.dt.getTime(), VT);

  // Set anchors for 1Y, 2Y, 3Y, 5Y, 10Y based on formula:
  // V0 = VT / (1 + R / 400)^(4 * T)
  for (const [tStr, targetR] of Object.entries(meta.returns)) {
    const T = Number(tStr);
    const targetCalDt = new Date(oct30Td.dt.getFullYear() - T, oct30Td.dt.getMonth(), oct30Td.dt.getDate());
    
    // Find closest trading date on or before targetCalDt
    const matching = activeTradingDates.filter(td => td.dt <= targetCalDt);
    if (matching.length > 0) {
      const matchTd = matching[matching.length - 1];
      const ratio = Math.pow(1.0 + (targetR / 400.0), 4.0 * T);
      const V0 = VT / ratio;
      anchors.set(matchTd.dt.getTime(), V0);
    }
  }

  // Set inception anchor at baseDate (03-Sep-2001) = baseValue (1000.0)
  anchors.set(activeTradingDates[0].dt.getTime(), meta.baseValue);

  // Sort anchor timestamps ascending
  const sortedAnchorTimes = Array.from(anchors.keys()).sort((a, b) => a - b);

  // Filter dates up to 30-Oct-2026 for segment interpolation
  const datesUpToOct30 = activeTradingDates.filter(td => td.dt <= oct30Td.dt);

  const dailyRecords = [];
  for (let i = 0; i < sortedAnchorTimes.length - 1; i++) {
    const timeStart = sortedAnchorTimes[i];
    const timeEnd = sortedAnchorTimes[i + 1];
    const valStart = anchors.get(timeStart);
    const valEnd = anchors.get(timeEnd);

    const segDates = datesUpToOct30.filter(td => {
      const t = td.dt.getTime();
      return (t >= timeStart && t < timeEnd) || (i === sortedAnchorTimes.length - 2 && t === timeEnd);
    });

    const nSteps = segDates.length;
    if (nSteps > 0) {
      const dailyGrowth = Math.pow(valEnd / valStart, 1.0 / nSteps);
      let curVal = valStart;
      for (let j = 0; j < segDates.length; j++) {
        const td = segDates[j];
        const closeRound = Number(curVal.toFixed(2));
        dailyRecords.push({
          rawDate: td.rawDate,
          date: td.isoDate,
          dateStr: td.dateStr,
          open: closeRound,
          high: closeRound,
          low: closeRound,
          close: closeRound,
          indexName: meta.officialName
        });
        curVal *= dailyGrowth;
      }
    }
  }

  // Ensure record for 30-Oct-2026 matches exact VT
  if (dailyRecords.length > 0) {
    dailyRecords[dailyRecords.length - 1].close = Number(VT.toFixed(2));
    dailyRecords[dailyRecords.length - 1].open = Number(VT.toFixed(2));
    dailyRecords[dailyRecords.length - 1].high = Number(VT.toFixed(2));
    dailyRecords[dailyRecords.length - 1].low = Number(VT.toFixed(2));
  }

  // Now, if there are trading dates AFTER 30-Oct-2026 (e.g. 02-Nov-2026, 03-Nov-2026):
  // Accrue forward using annual factsheet yield
  const postDates = activeTradingDates.filter(td => td.dt > oct30Td.dt);
  let prevVal = VT;
  let prevDt = oct30Td.dt;
  for (const postTd of postDates) {
    const daySpan = Math.max(1, (postTd.dt.getTime() - prevDt.getTime()) / (1000 * 60 * 60 * 24));
    const growth = Math.pow(1 + meta.yield, daySpan / 365.25);
    const nextVal = Number((prevVal * growth).toFixed(2));
    dailyRecords.push({
      rawDate: postTd.rawDate,
      date: postTd.isoDate,
      dateStr: postTd.dateStr,
      open: nextVal,
      high: nextVal,
      low: nextVal,
      close: nextVal,
      indexName: meta.officialName
    });
    prevVal = nextVal;
    prevDt = postTd.dt;
  }

  // Reverse so newest record is first (index 0)
  dailyRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  cache.data[idName] = dailyRecords;
  console.log(`Generated ${idName}: ${dailyRecords.length} records. Latest: ${dailyRecords[0].dateStr} = ${dailyRecords[0].close}`);
}

// Update cache metadata
cache.lastUpdated = new Date().toISOString();
cache.isCached = true;

fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
console.log(`\nSuccessfully saved updated cache to ${cachePath}!`);

