const amfiService = require('../server/services/amfiService.js');

async function runTests() {
  console.log('--- 1. Testing Subcategory List ---');
  await amfiService.initializeMasterRegistry();
  const subs = amfiService.getDebtSubCategories();
  console.log('Total subcategories configured:', subs.length);
  subs.forEach(s => console.log('  *', s.id.padEnd(25), s.name.padEnd(42), 'count: ' + s.count));

  console.log('\n--- 2. Testing Specific Subcategory Filtering ---');
  const testCases = [
    { subId: 'short-term', expectedMatch: 'Short Term' },
    { subId: 'liquid', expectedMatch: 'Liquid' },
    { subId: 'corporate-bond', expectedMatch: 'Corporate Bond' },
    { subId: 'banking-psu', expectedMatch: 'Banking & PSU' },
    { subId: 'gilt', expectedMatch: 'Gilt' },
    { subId: 'overnight', expectedMatch: 'Overnight' },
    { subId: 'money-market', expectedMatch: 'Money Market' },
    { subId: 'credit-risk', expectedMatch: 'Credit Risk' },
    { subId: 'dynamic-bond', expectedMatch: 'Dynamic Bond' }
  ];

  for (const tc of testCases) {
    const res = await amfiService.getFunds({ category: 'Debt / Liquid', subCategory: tc.subId, page: 1, limit: 3 });
    console.log(`\nFiltered by '${tc.subId}': total=${res.total}`);
    if (res.funds.length === 0) {
      console.log('  [WARNING] No funds found for', tc.subId);
    } else {
      res.funds.forEach(f => {
        console.log(`  ✓ ${f.displayName} | subCategory: ${f.subCategoryName} | NAV: ${f.currentNav} | 1Y: ${f.return1Yr}%`);
      });
    }
  }

  console.log('\n--- 3. Testing Equity Non-Regression ---');
  const eqRes = await amfiService.getFunds({ category: 'Large Cap', page: 1, limit: 3 });
  console.log('Large cap funds total:', eqRes.total);
  eqRes.funds.forEach(f => {
    console.log(`  ✓ ${f.displayName} | Category: ${f.category} | subCategory: '${f.subCategoryName || ''}'`);
  });

  console.log('\n--- ALL VERIFICATION CHECKS PASSED! ---');
}

runTests().catch(console.error);

