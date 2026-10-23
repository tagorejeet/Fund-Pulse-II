/**
 * Automated Validation Script for Mutual Fund Return Calculations
 * Tests all Growth funds across 1Y, 2Y, 3Y, 5Y, 10Y and multiple valuation dates.
 */

const amfiService = require('../services/amfiService');
const { MASTER_ALLOWLIST } = require('../config/masterList');

function parseNavDate(str) {
  return amfiService.parseNavDate(str);
}

async function runValidation() {
  console.log('='.repeat(90));
  console.log('SNAZZY WEALTH FUNDLENS — AUTOMATED RETURN PIPELINE VALIDATION TEST');
  console.log('='.repeat(90));

  await amfiService.initializeMasterRegistry();

  // Test Set 1: All 34 Curated Suggestion Sheet Growth Funds
  const suggestionFunds = MASTER_ALLOWLIST.map(item => amfiService.schemeMap.get(item.id)).filter(Boolean);

  // Test Set 2: Representative samples across ALL categories
  const categories = await amfiService.getCategories();
  const categoryFunds = [];
  for (const cat of categories) {
    const fundsInCat = amfiService.masterSchemes.filter(s => {
      const sOpt = s.schemeOption || amfiService.determineSchemeOption(s.displayName);
      return s.category === cat.name && sOpt === 'growth';
    });
    // Add first 2 funds from each category
    fundsInCat.slice(0, 2).forEach(f => {
      if (!suggestionFunds.some(sf => sf.id === f.id) && !categoryFunds.some(cf => cf.id === f.id)) {
        categoryFunds.push(f);
      }
    });
  }

  const allTestFunds = [...suggestionFunds, ...categoryFunds];
  console.log(`\nTotal Growth Funds to Validate: ${allTestFunds.length} (${suggestionFunds.length} Suggestion Sheet + ${categoryFunds.length} Cross-Category Funds)\n`);

  const summary = {
    total: allTestFunds.length,
    p1Y: { calculated: 0, insufficient: 0, errors: 0 },
    p2Y: { calculated: 0, insufficient: 0, errors: 0 },
    p3Y: { calculated: 0, insufficient: 0, errors: 0 },
    p5Y: { calculated: 0, insufficient: 0, errors: 0 },
    p10Y: { calculated: 0, insufficient: 0, errors: 0 }
  };

  const debugRows = [];

  for (let i = 0; i < allTestFunds.length; i++) {
    const fund = allTestFunds[i];
    const code = fund.regularSchemeCode || fund.directSchemeCode;

    // Run computeReturnsForScheme for 'regular' plan
    const res = await amfiService.computeReturnsForScheme(fund, 'regular');
    const cached = amfiService.navHistoryCache.get(Number(code));
    const navList = cached?.navList || [];
    const latestDate = navList[0]?.date || 'N/A';
    const earliestDate = navList[navList.length - 1]?.date || 'N/A';
    const earliestObj = parseNavDate(earliestDate);
    const latestObj = parseNavDate(latestDate);

    const periods = [
      { key: '1Y', ret: res.return1Yr, years: 1, sum: summary.p1Y },
      { key: '2Y', ret: res.return2Yr, years: 2, sum: summary.p2Y },
      { key: '3Y', ret: res.return3Yr, years: 3, sum: summary.p3Y },
      { key: '5Y', ret: res.return5Yr, years: 5, sum: summary.p5Y },
      { key: '10Y', ret: res.return10Yr, years: 10, sum: summary.p10Y }
    ];

    const rowStatuses = {};

    for (const p of periods) {
      const targetDate = new Date(latestObj);
      targetDate.setFullYear(targetDate.getFullYear() - p.years);

      const fundExistedOnTargetDate = earliestObj && earliestObj.getTime() > 0 && earliestObj.getTime() <= targetDate.getTime();

      if (p.ret !== null && !isNaN(p.ret)) {
        p.sum.calculated++;
        rowStatuses[p.key] = `PASS (${p.ret > 0 ? '+' : ''}${p.ret}%)`;
      } else {
        if (!fundExistedOnTargetDate) {
          p.sum.insufficient++;
          rowStatuses[p.key] = 'LEGIT_N/A (Launched ' + earliestDate + ')';
        } else {
          p.sum.errors++;
          rowStatuses[p.key] = 'ERROR (Data existed on ' + earliestDate + ' but was null)';
        }
      }
    }

    debugRows.push({
      Fund: fund.displayName.slice(0, 36),
      Category: fund.category,
      Code: code,
      Records: navList.length,
      Earliest: earliestDate,
      '1Y': rowStatuses['1Y'],
      '2Y': rowStatuses['2Y'],
      '3Y': rowStatuses['3Y'],
      '5Y': rowStatuses['5Y'],
      '10Y': rowStatuses['10Y']
    });

    if ((i + 1) % 10 === 0 || i === allTestFunds.length - 1) {
      process.stdout.write(`Validated ${i + 1}/${allTestFunds.length} funds...\r`);
    }
  }

  console.log('\n\n--- DETAILED DEBUG TABLE (Sample of Funds) ---');
  console.table(debugRows.slice(0, 20));

  console.log('\n--- SPECIAL VALIDATION: NIPPON INDIA SMALL CAP FUND ---');
  const nipponRow = debugRows.find(r => r.Fund.toLowerCase().includes('nippon') && r.Fund.toLowerCase().includes('small'));
  console.log(nipponRow);

  console.log('\n--- OVERALL RETURN PIPELINE SUMMARY ---');
  console.log(`Total Growth Funds Tested: ${summary.total}\n`);

  console.log(`1Y:  ${summary.p1Y.calculated} calculated | ${summary.p1Y.insufficient} legitimately insufficient | ${summary.p1Y.errors} errors`);
  console.log(`2Y:  ${summary.p2Y.calculated} calculated | ${summary.p2Y.insufficient} legitimately insufficient | ${summary.p2Y.errors} errors`);
  console.log(`3Y:  ${summary.p3Y.calculated} calculated | ${summary.p3Y.insufficient} legitimately insufficient | ${summary.p3Y.errors} errors`);
  console.log(`5Y:  ${summary.p5Y.calculated} calculated | ${summary.p5Y.insufficient} legitimately insufficient | ${summary.p5Y.errors} errors`);
  console.log(`10Y: ${summary.p10Y.calculated} calculated | ${summary.p10Y.insufficient} legitimately insufficient | ${summary.p10Y.errors} errors`);

  // Multiple Valuation Dates Test
  console.log('\n' + '='.repeat(90));
  console.log('TESTING MULTIPLE VALUATION DATES ON NIPPON INDIA SMALL CAP FUND');
  console.log('='.repeat(90));

  const nipponScheme = allTestFunds.find(f => f.displayName.toLowerCase().includes('nippon') && f.displayName.toLowerCase().includes('small'));
  const testDates = [
    { label: 'Current Valuation Date', date: null },
    { label: 'Recent Date (2026-10-15 Thu)', date: '2026-10-15' },
    { label: 'Weekend Date (2026-10-18 Sun)', date: '2026-10-18' },
    { label: 'Historical Date (2025-06-16)', date: '2025-06-16' },
    { label: 'Historical Date (2024-10-10)', date: '2024-10-10' }
  ];

  for (const td of testDates) {
    const res = await amfiService.computeReturnsForScheme(nipponScheme, 'regular', '33,50,67', null, null, td.date);
    console.log(`\nValuation Date: ${td.label} (${td.date || 'Today'})`);
    console.log(`  Effective NAV Date: ${res.navDate} | NAV: ₹${res.currentNav}`);
    console.log(`  1Y: ${res.return1Yr}% | 2Y: ${res.return2Yr}% | 3Y: ${res.return3Yr}% | 5Y: ${res.return5Yr}% | 10Y: ${res.return10Yr}%`);
  }

  const totalErrors = summary.p1Y.errors + summary.p2Y.errors + summary.p3Y.errors + summary.p5Y.errors + summary.p10Y.errors;
  console.log('\n' + '='.repeat(90));
  if (totalErrors === 0) {
    console.log('>>> ALL VALIDATION CHECKS PASSED WITH ZERO CALCULATION ERRORS! <<<');
  } else {
    console.log(`>>> VALIDATION FAILED WITH ${totalErrors} ERRORS! <<<`);
  }
  console.log('='.repeat(90));

  process.exit(totalErrors === 0 ? 0 : 1);
}

runValidation().catch(err => {
  console.error('Validation script error:', err);
  process.exit(1);
});
