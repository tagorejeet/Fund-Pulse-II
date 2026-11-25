const amfiService = require('../services/amfiService');

async function runStressTest() {
  console.log('========================================================================');
  console.log('COMPREHENSIVE 150+ FUND CROSS-CATEGORY COLLISION STRESS TEST');
  console.log('========================================================================\n');

  await amfiService.initializeMasterRegistry();

  const schemes = amfiService.masterSchemes.filter(s => {
    const opt = s.schemeOption || 'growth';
    return opt === 'growth';
  });

  // Pick balanced selection across ALL categories and AMCs
  const targetCategories = [
    { cat: 'Large Cap', count: 15 },
    { cat: 'Mid Cap', count: 15 },
    { cat: 'Small Cap', count: 15 },
    { cat: 'Large & Mid Cap', count: 15 },
    { cat: 'Multi Cap', count: 12 },
    { cat: 'Flexi Cap', count: 15 },
    { cat: 'Value', count: 12 },
    { cat: 'Contra', count: 5 },
    { cat: 'ELSS', count: 12 },
    { cat: 'Focused', count: 12 },
    { cat: 'Sectoral / Thematic', count: 18 },
    { cat: 'Hybrid', count: 15 },
    { cat: 'Debt / Liquid', count: 15 },
    { cat: 'Index Funds', count: 12 }
  ];

  const selectedFunds = [];
  const selectedIds = new Set();

  for (const { cat, count } of targetCategories) {
    const pool = schemes.filter(s => s.category === cat && !selectedIds.has(s.id));
    // Diversify by AMC
    const amcSeen = new Set();
    const catSelected = [];
    for (const s of pool) {
      const amc = (s.amcName || s.displayName.split(' ')[0] || '').toLowerCase();
      if (!amcSeen.has(amc)) {
        amcSeen.add(amc);
        catSelected.push(s);
        selectedIds.add(s.id);
        if (catSelected.length >= count) break;
      }
    }
    // If not enough unique AMCs, fill up from pool
    if (catSelected.length < count) {
      for (const s of pool) {
        if (!selectedIds.has(s.id)) {
          catSelected.push(s);
          selectedIds.add(s.id);
          if (catSelected.length >= count) break;
        }
      }
    }
    selectedFunds.push(...catSelected);
  }

  console.log(`Successfully selected ${selectedFunds.length} diverse funds across ${targetCategories.length} categories.\n`);

  // Category counts of selected funds
  const countsByCat = {};
  selectedFunds.forEach(s => {
    countsByCat[s.category] = (countsByCat[s.category] || 0) + 1;
  });
  console.log('Selected Fund Distribution by Category:');
  Object.entries(countsByCat).forEach(([c, n]) => console.log(`  - ${c.padEnd(22)}: ${n} funds`));
  console.log('------------------------------------------------------------------------\n');

  const testDate = '2026-11-23';
  console.log(`Running resolution validation for asOfDate = ${testDate}...`);

  // STEP 1: Run isolated/category-wise resolution to get ground truth for each fund
  console.log('Executing Isolated Resolution (Ground Truth baseline)...');
  const isolatedResults = new Map();
  for (const fund of selectedFunds) {
    const res = await amfiService.resolveHistoricalAumForSchemes(testDate, [fund]);
    const match = res && res.map ? res.map.get(fund.id) : null;
    isolatedResults.set(fund.id, match);
  }
  console.log(`Isolated baseline acquired for all ${selectedFunds.length} funds.\n`);

  // STEP 2: Run massive single-batch cross-category resolution with ALL funds mixed together
  console.log(`Executing Massive Mixed-Batch Resolution (${selectedFunds.length} funds in a single batch)...`);
  const batchRes = await amfiService.resolveHistoricalAumForSchemes(testDate, selectedFunds);
  const batchMap = batchRes ? batchRes.map : new Map();
  console.log(`Batch resolution completed.\n`);

  // STEP 3: Validate Parity, Category Integrity, AMC Integrity, and NAV Parity
  console.log('========================================================================');
  console.log('VERIFYING ZERO-COLLISION GUARANTEE ACROSS ALL 150+ FUNDS:');
  console.log('========================================================================');

  let totalChecked = 0;
  let passedCount = 0;
  let collisionsDetected = 0;
  let amcMismatches = 0;
  let categoryMismatches = 0;
  let navMismatches = 0;

  const failureLog = [];

  for (const fund of selectedFunds) {
    totalChecked++;
    const isoMatch = isolatedResults.get(fund.id);
    const batMatch = batchMap.get(fund.id);

    // 1. Check if batch match exists
    if (!batMatch && !isoMatch) {
      // Both null (e.g. fund not present in AMFI performance table on that date) -> valid
      passedCount++;
      continue;
    }

    if (Boolean(isoMatch) !== Boolean(batMatch)) {
      collisionsDetected++;
      failureLog.push({
        id: fund.id,
        name: fund.displayName,
        category: fund.category,
        error: `Presence mismatch: isolated had ${isoMatch ? 'match' : 'null'}, batch had ${batMatch ? 'match' : 'null'}`
      });
      continue;
    }

    // 2. Exact match name parity
    if (isoMatch.rawName !== batMatch.rawName) {
      collisionsDetected++;
      failureLog.push({
        id: fund.id,
        name: fund.displayName,
        category: fund.category,
        error: `Collision! Isolated matched '${isoMatch.rawName}' but batch matched '${batMatch.rawName}'`
      });
      continue;
    }

    // 3. Category guard check (ensure matched item belongs to valid category pairs for the scheme)
    const validPairs = amfiService.getAmfiPairsForScheme(fund);
    const validPairKeys = new Set(validPairs.map(p => `${p.category}_${p.subCategory}`));
    if (batMatch._pairKey && !validPairKeys.has(batMatch._pairKey)) {
      categoryMismatches++;
      failureLog.push({
        id: fund.id,
        name: fund.displayName,
        category: fund.category,
        error: `Cross-category leak! Scheme is in '${fund.category}' but matched AMFI pair '${batMatch._pairKey}'`
      });
      continue;
    }

    // 4. AMC guard check (ensure primary brand token matches)
    const fundTokens = (fund.displayName || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
    const matchTokens = (batMatch.rawName || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
    const fundBrand = fundTokens[0];
    const matchBrand = matchTokens[0];
    if (fundBrand && matchBrand && fundBrand !== matchBrand && !fundBrand.includes(matchBrand) && !matchBrand.includes(fundBrand)) {
      amcMismatches++;
      failureLog.push({
        id: fund.id,
        name: fund.displayName,
        category: fund.category,
        error: `Cross-AMC leak! Scheme brand '${fundBrand}' matched AMFI brand '${matchBrand}'`
      });
      continue;
    }

    // 5. NAV parity check
    if (isoMatch.navRegular && batMatch.navRegular && Math.abs(isoMatch.navRegular - batMatch.navRegular) > 0.0001) {
      navMismatches++;
      failureLog.push({
        id: fund.id,
        name: fund.displayName,
        category: fund.category,
        error: `NAV discrepancy! Isolated NAV: ${isoMatch.navRegular}, Batch NAV: ${batMatch.navRegular}`
      });
      continue;
    }

    passedCount++;
  }

  console.log(`\nSTRESS TEST RESULTS:`);
  console.log(`  Total Funds Tested      : ${totalChecked}`);
  console.log(`  Successfully Passed     : ${passedCount} (${((passedCount / totalChecked) * 100).toFixed(2)}%)`);
  console.log(`  Collisions Detected     : ${collisionsDetected}`);
  console.log(`  Category Leaks          : ${categoryMismatches}`);
  console.log(`  AMC Leaks               : ${amcMismatches}`);
  console.log(`  NAV Discrepancies       : ${navMismatches}`);

  if (failureLog.length > 0) {
    console.error('\nFAILURES DETECTED:');
    failureLog.forEach((f, idx) => console.error(`  ${idx + 1}. [${f.id}] ${f.error}`));
    process.exit(1);
  } else {
    console.log('\n========================================================================');
    console.log('>>> 100% COLLISION-FREE GUARANTEE VERIFIED ACROSS ALL 150+ FUNDS! <<<');
    console.log('========================================================================\n');
  }

  // Also verify complete returns computation for 150+ batch
  console.log('Testing full getBatchFunds execution for all selected funds...');
  const batchFundRes = await amfiService.getBatchFunds({
    ids: selectedFunds.map(s => s.id),
    plan: 'regular',
    asOfDate: testDate
  });

  console.log(`Successfully computed batch returns for ${batchFundRes.funds.length} funds in a single call.`);
  console.log(`Sample verified funds from batch:`);
  batchFundRes.funds.slice(0, 8).forEach(f => {
    console.log(`  - ${f.displayName.padEnd(45)} | Category: ${f.category.padEnd(20)} | NAV: ₹${f.currentNav} | AUM: ${f.dailyAUMFormatted} | 1Y: ${f.return1Yr}%`);
  });
}

runStressTest().catch(err => {
  console.error('Stress test fatal error:', err);
  process.exit(1);
});
