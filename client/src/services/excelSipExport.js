import ExcelJS from 'exceljs';

const FONT_FAMILY = 'Times New Roman';
const BORDER_MEDIUM = { style: 'medium', color: { argb: 'FF000000' } };
const BORDER_THIN = { style: 'thin', color: { argb: 'FF000000' } };

const CATEGORY_ORDER = {
  'Large Cap': 1,
  'Mid Cap': 2,
  'Large & Mid Cap': 3,
  'Small Cap': 4,
  'Multi Cap': 5,
  'Flexi Cap': 6,
  'Value': 7,
  'Sectoral / Thematic': 8,
  'ELSS': 9,
  'Contra': 10,
  'Dividend Yield': 11,
  'Focused': 12,
  'Index Funds': 13,
  'Hybrid': 14,
  'Debt / Liquid': 15,
  'Other': 16
};

const parseAum = (fund) => {
  if (!fund) return null;
  if (fund.dailyAUMRaw !== null && fund.dailyAUMRaw !== undefined && !isNaN(fund.dailyAUMRaw) && fund.dailyAUMRaw !== '') {
    return Number(Number(fund.dailyAUMRaw).toFixed(2));
  }
  if (fund.aum !== null && fund.aum !== undefined && !isNaN(fund.aum) && fund.aum !== '') {
    return Number(Number(fund.aum).toFixed(2));
  }
  if (fund.aumRaw !== null && fund.aumRaw !== undefined && !isNaN(fund.aumRaw) && fund.aumRaw !== '') {
    return Number(Number(fund.aumRaw).toFixed(2));
  }
  const formatted = fund.dailyAUMFormatted || fund.aumFormatted;
  if (formatted && typeof formatted === 'string') {
    const cleaned = formatted.replace(/[₹,Cr\s]/gi, '').trim();
    const val = parseFloat(cleaned);
    if (!isNaN(val) && val > 0) return Number(val.toFixed(2));
  }
  return null;
};

const parseNav = (val) => {
  if (val === null || val === undefined || val === 'N/A' || val === '') return null;
  if (typeof val === 'number') return isNaN(val) ? null : Number(val.toFixed(2));
  if (typeof val === 'string') {
    const cleaned = val.replace(/[₹,\s]/gi, '').trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : Number(parsed.toFixed(2));
  }
  return null;
};

const parsePct = (val) => {
  if (val === null || val === undefined || val === 'N/A' || isNaN(val) || val === '') return null;
  return Number(val) / 100;
};

function formatToIndianDate(dateInput) {
  let d = new Date();
  if (dateInput) {
    if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
      d = dateInput;
    } else {
      const str = String(dateInput).trim();
      const parts = str.split('-');
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          // YYYY-MM-DD
          d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        } else {
          // DD-MM-YYYY
          d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
        }
      } else {
        const parsed = new Date(str);
        if (!isNaN(parsed.getTime())) d = parsed;
      }
    }
  }
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function sanitizeSheetName(name, existingNames = new Set()) {
  let clean = (name || 'Sheet')
    .replace(/[\\/*?[\]:]/g, '')
    .trim()
    .substring(0, 28);
  if (!clean) clean = 'Fund';

  let finalName = clean;
  let counter = 1;
  while (existingNames.has(finalName.toLowerCase())) {
    finalName = `${clean.substring(0, 25)}_${counter}`;
    counter++;
  }
  existingNames.add(finalName.toLowerCase());
  return finalName;
}

async function downloadWorkbook(workbook, fileName) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * Export full SIP Calculation Workbook with Overview Summary + Per-Fund Cash Flow Sheets
 * Formatted with Times New Roman font, precise borders, today's date, AUM column,
 * with AMC Name and Plan columns removed.
 */
export const exportSipToExcel = async ({
  results = [],
  monthlySip = 100000,
  calculationDate = '',
  sipDay = 25,
  plan = 'regular',
  reportDate = ''
}) => {
  if (!results || results.length === 0) return;

  const workbook = new ExcelJS.Workbook();
  const existingSheetNames = new Set();
  const todayFormatted = formatToIndianDate(new Date());
  const calcDateFormatted = formatToIndianDate(calculationDate || new Date());
  const planLabel = plan.toLowerCase() === 'direct' 
    ? 'Direct Plan' 
    : (plan.toLowerCase() === 'both' ? 'Both (Regular & Direct)' : 'Regular Plan');

  // ==========================================
  // SHEET 1: SIP RETURNS OVERVIEW
  // ==========================================
  const wsOverview = workbook.addWorksheet(sanitizeSheetName('SIP Returns Overview', existingSheetNames), {
    views: [{ showGridLines: true }]
  });

  // Table Headers (10 columns: AMC Name & Plan removed; AUM added)
  const headers = [
    'Category',
    'Scheme Name',
    'AUM (Cr)',
    'Monthly SIP (₹)',
    'Current NAV (₹)',
    '1 Yr SIP (%)',
    '2 Yr SIP (%)',
    '3 Yr SIP (%)',
    '5 Yr SIP (%)',
    '10 Yr SIP (%)'
  ];

  const totalCols = headers.length;

  // Exact column widths
  wsOverview.columns = [
    { width: 22 }, // Category
    { width: 48 }, // Scheme Name
    { width: 14 }, // AUM (Cr)
    { width: 16 }, // Monthly SIP (₹)
    { width: 16 }, // Current NAV (₹)
    { width: 13 }, // 1 Yr SIP (%)
    { width: 13 }, // 2 Yr SIP (%)
    { width: 13 }, // 3 Yr SIP (%)
    { width: 13 }, // 5 Yr SIP (%)
    { width: 13 }  // 10 Yr SIP (%)
  ];

  // Row 1: Merged Title
  wsOverview.mergeCells(1, 1, 1, totalCols);
  const titleRow = wsOverview.getRow(1);
  titleRow.height = 30;
  const titleCell = wsOverview.getCell(1, 1);
  titleCell.value = `Snazzy Wealth FundLens — Mutual Fund SIP Return Analysis (${todayFormatted})`;
  titleCell.font = { name: FONT_FAMILY, size: 16, bold: true, color: { argb: 'FF000000' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  for (let c = 1; c <= totalCols; c++) {
    wsOverview.getCell(1, c).border = {
      top: BORDER_THIN,
      bottom: BORDER_THIN,
      left: c === 1 ? BORDER_MEDIUM : undefined,
      right: c === totalCols ? BORDER_MEDIUM : undefined
    };
  }

  // Row 2: Metadata / Subtitle Row
  const metaRow = wsOverview.getRow(2);
  metaRow.height = 24;

  const metaItems = [
    `Calculation Date: ${calcDateFormatted}`,
    `AMFI Data Date: ${reportDate || 'Latest AMFI'}`,
    `Date: ${todayFormatted}`,
    `Monthly SIP: ₹${Number(monthlySip).toLocaleString('en-IN')}`,
    `SIP Day: ${sipDay}th of month`,
    `Plan: ${planLabel}`
  ];

  metaItems.forEach((text, idx) => {
    const colIdx = idx + 1;
    if (colIdx <= totalCols) {
      const cell = wsOverview.getCell(2, colIdx);
      cell.value = text;
      cell.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF000000' } };
      cell.alignment = { horizontal: colIdx === 1 ? 'left' : 'center', vertical: 'middle' };
    }
  });

  for (let c = 1; c <= totalCols; c++) {
    wsOverview.getCell(2, c).border = {
      top: BORDER_THIN,
      bottom: BORDER_THIN,
      left: c === 1 ? BORDER_MEDIUM : BORDER_THIN,
      right: c === totalCols ? BORDER_MEDIUM : BORDER_THIN
    };
  }

  // Row 3: Blank separator row
  const sepRow1 = wsOverview.getRow(3);
  sepRow1.height = 14;
  for (let c = 1; c <= totalCols; c++) {
    wsOverview.getCell(3, c).border = {
      top: BORDER_THIN,
      bottom: BORDER_THIN,
      left: c === 1 ? BORDER_MEDIUM : undefined,
      right: c === totalCols ? BORDER_MEDIUM : undefined
    };
  }

  // Row 4: Table Headers
  const headerRow = wsOverview.getRow(4);
  headerRow.height = 30;
  headers.forEach((h, idx) => {
    const colIdx = idx + 1;
    const cell = wsOverview.getCell(4, colIdx);
    cell.value = h;
    cell.font = { name: FONT_FAMILY, size: 12, bold: true, color: { argb: 'FF000000' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: BORDER_THIN,
      bottom: BORDER_THIN,
      left: colIdx === 1 ? BORDER_MEDIUM : BORDER_THIN,
      right: colIdx === totalCols ? BORDER_MEDIUM : BORDER_THIN
    };
  });

  // Separate Mutual Funds from NSE Benchmark Indices
  const mfResults = results.filter(r => !r.isNseIndex && r.plan !== 'Benchmark');
  const nseResults = results.filter(r => r.isNseIndex || r.plan === 'Benchmark');

  // Group Mutual Funds by Category dynamically
  const groups = {};
  mfResults.forEach(r => {
    const cat = r.category || 'Other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(r);
  });

  const sortedCategories = Object.keys(groups).sort((a, b) => {
    const ordA = CATEGORY_ORDER[a] || 99;
    const ordB = CATEGORY_ORDER[b] || 99;
    return ordA - ordB;
  });

  let currentRow = 5;

  // Output each Category Block for Mutual Funds
  sortedCategories.forEach((catName, catIdx) => {
    const catFunds = groups[catName];
    const catStartRow = currentRow;
    const catEndRow = currentRow + catFunds.length - 1;

    catFunds.forEach((fund, fIdx) => {
      const rowNum = catStartRow + fIdx;
      const row = wsOverview.getRow(rowNum);
      row.height = 20;

      // Col 2: Scheme Name (AMC is included in the scheme name)
      const nameCell = wsOverview.getCell(rowNum, 2);
      nameCell.value = fund.displayName || fund.amfiSchemeName || 'N/A';
      nameCell.font = { name: FONT_FAMILY, size: 12, bold: false, color: { argb: 'FF000000' } };
      nameCell.alignment = { horizontal: 'left', vertical: 'middle' };
      nameCell.border = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN };

      // Col 3: AUM (Cr)
      const aumCell = wsOverview.getCell(rowNum, 3);
      const aumVal = parseAum(fund);
      if (aumVal !== null) {
        aumCell.value = aumVal;
        aumCell.numFmt = '#,##0.00';
      } else {
        aumCell.value = '-';
      }
      aumCell.font = { name: FONT_FAMILY, size: 12, bold: false, color: { argb: 'FF000000' } };
      aumCell.alignment = { horizontal: 'center', vertical: 'middle' };
      aumCell.border = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN };

      // Col 4: Monthly SIP (₹)
      const sipCell = wsOverview.getCell(rowNum, 4);
      sipCell.value = Number(monthlySip);
      sipCell.numFmt = '"₹"#,##0';
      sipCell.font = { name: FONT_FAMILY, size: 12, bold: false, color: { argb: 'FF000000' } };
      sipCell.alignment = { horizontal: 'center', vertical: 'middle' };
      sipCell.border = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN };

      // Col 5: Current NAV (₹)
      const navCell = wsOverview.getCell(rowNum, 5);
      const navVal = parseNav(fund.currentNav ?? fund.navRegular ?? fund.nav);
      if (navVal !== null) {
        navCell.value = navVal;
        navCell.numFmt = '#,##0.00';
      } else {
        navCell.value = '-';
      }
      navCell.font = { name: FONT_FAMILY, size: 12, bold: false, color: { argb: 'FF000000' } };
      navCell.alignment = { horizontal: 'center', vertical: 'middle' };
      navCell.border = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN };

      // Cols 6-10: SIP Returns (1Y, 2Y, 3Y, 5Y, 10Y)
      const returnVals = [
        parsePct(fund.returns?.return1Yr),
        parsePct(fund.returns?.return2Yr),
        parsePct(fund.returns?.return3Yr),
        parsePct(fund.returns?.return5Yr),
        parsePct(fund.returns?.return10Yr)
      ];

      returnVals.forEach((ret, rIdx) => {
        const colIdx = 6 + rIdx;
        const cell = wsOverview.getCell(rowNum, colIdx);
        if (ret !== null) {
          cell.value = ret;
          cell.numFmt = '0.00%';
        } else {
          cell.value = '-';
        }
        cell.font = { name: FONT_FAMILY, size: 12, bold: false, color: { argb: 'FF000000' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: BORDER_THIN,
          bottom: BORDER_THIN,
          left: BORDER_THIN,
          right: colIdx === totalCols ? BORDER_MEDIUM : BORDER_THIN
        };
      });
    });

    // Merge Category cell across catStartRow to catEndRow in Col 1
    if (catEndRow > catStartRow) {
      wsOverview.mergeCells(catStartRow, 1, catEndRow, 1);
    }
    const catCell = wsOverview.getCell(catStartRow, 1);
    const displayCatName = catName.endsWith('Fund') ? catName : `${catName} Fund`;
    catCell.value = displayCatName;
    catCell.font = { name: FONT_FAMILY, size: 12, bold: true, color: { argb: 'FF000000' } };
    catCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    for (let r = catStartRow; r <= catEndRow; r++) {
      const cell = wsOverview.getCell(r, 1);
      cell.border = {
        top: r === catStartRow ? BORDER_THIN : undefined,
        bottom: r === catEndRow ? BORDER_THIN : undefined,
        left: BORDER_MEDIUM,
        right: BORDER_THIN
      };
    }

    currentRow = catEndRow + 1;

    // Blank separator row between categories
    const isLastCategory = (catIdx === sortedCategories.length - 1) && (nseResults.length === 0);
    if (!isLastCategory) {
      const sepRow = wsOverview.getRow(currentRow);
      sepRow.height = 14;
      for (let c = 1; c <= totalCols; c++) {
        const cell = wsOverview.getCell(currentRow, c);
        cell.border = {
          top: BORDER_THIN,
          bottom: BORDER_THIN,
          left: c === 1 ? BORDER_MEDIUM : undefined,
          right: c === totalCols ? BORDER_MEDIUM : undefined
        };
      }
      currentRow++;
    }
  });

  // Output NSE Benchmark Indices Block (if any selected)
  if (nseResults.length > 0) {
    const nseStartRow = currentRow;
    const nseEndRow = currentRow + nseResults.length - 1;

    nseResults.forEach((idx, iIdx) => {
      const rowNum = nseStartRow + iIdx;
      const row = wsOverview.getRow(rowNum);
      row.height = 20;

      // Col 2: Index Name
      const nameCell = wsOverview.getCell(rowNum, 2);
      nameCell.value = idx.displayName || idx.amfiSchemeName || idx.fundId;
      nameCell.font = { name: FONT_FAMILY, size: 12, bold: false, color: { argb: 'FF000000' } };
      nameCell.alignment = { horizontal: 'left', vertical: 'middle' };
      nameCell.border = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN };

      // Col 3: AUM (Cr) - Indices do not have mutual fund AUM
      const aumCell = wsOverview.getCell(rowNum, 3);
      aumCell.value = '-';
      aumCell.font = { name: FONT_FAMILY, size: 12, bold: false, color: { argb: 'FF000000' } };
      aumCell.alignment = { horizontal: 'center', vertical: 'middle' };
      aumCell.border = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN };

      // Col 4: Monthly SIP (₹)
      const sipCell = wsOverview.getCell(rowNum, 4);
      sipCell.value = Number(monthlySip);
      sipCell.numFmt = '"₹"#,##0';
      sipCell.font = { name: FONT_FAMILY, size: 12, bold: false, color: { argb: 'FF000000' } };
      sipCell.alignment = { horizontal: 'center', vertical: 'middle' };
      sipCell.border = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN };

      // Col 5: Current NAV (Index Value)
      const navCell = wsOverview.getCell(rowNum, 5);
      const navVal = parseNav(idx.currentNav);
      if (navVal !== null) {
        navCell.value = navVal;
        navCell.numFmt = '#,##0.00';
      } else {
        navCell.value = '-';
      }
      navCell.font = { name: FONT_FAMILY, size: 12, bold: false, color: { argb: 'FF000000' } };
      navCell.alignment = { horizontal: 'center', vertical: 'middle' };
      navCell.border = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN };

      // Cols 6-10: SIP Returns
      const returnVals = [
        parsePct(idx.returns?.return1Yr),
        parsePct(idx.returns?.return2Yr),
        parsePct(idx.returns?.return3Yr),
        parsePct(idx.returns?.return5Yr),
        parsePct(idx.returns?.return10Yr)
      ];

      returnVals.forEach((ret, rIdx) => {
        const colIdx = 6 + rIdx;
        const cell = wsOverview.getCell(rowNum, colIdx);
        if (ret !== null) {
          cell.value = ret;
          cell.numFmt = '0.00%';
        } else {
          cell.value = '-';
        }
        cell.font = { name: FONT_FAMILY, size: 12, bold: false, color: { argb: 'FF000000' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: BORDER_THIN,
          bottom: BORDER_THIN,
          left: BORDER_THIN,
          right: colIdx === totalCols ? BORDER_MEDIUM : BORDER_THIN
        };
      });
    });

    // Merge NSE Category cell
    if (nseEndRow > nseStartRow) {
      wsOverview.mergeCells(nseStartRow, 1, nseEndRow, 1);
    }
    const nseCatCell = wsOverview.getCell(nseStartRow, 1);
    nseCatCell.value = 'NSE Benchmark Indices';
    nseCatCell.font = { name: FONT_FAMILY, size: 12, bold: true, color: { argb: 'FF000000' } };
    nseCatCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    for (let r = nseStartRow; r <= nseEndRow; r++) {
      const cell = wsOverview.getCell(r, 1);
      cell.border = {
        top: r === nseStartRow ? BORDER_THIN : undefined,
        bottom: r === nseEndRow ? BORDER_THIN : undefined,
        left: BORDER_MEDIUM,
        right: BORDER_THIN
      };
    }

    currentRow = nseEndRow + 1;
  }

  // Bottom border on the last data row across all columns
  const lastRow = currentRow - 1;
  for (let c = 1; c <= totalCols; c++) {
    const cell = wsOverview.getCell(lastRow, c);
    const cur = cell.border || {};
    cell.border = { ...cur, bottom: BORDER_MEDIUM };
  }

  // Auto-filter on the data table
  wsOverview.autoFilter = `A4:J${lastRow}`;

  // ==========================================
  // DETAILED CASH FLOW SHEETS PER FUND
  // ==========================================
  results.forEach(fund => {
    const periodKeys = ['1Y', '3Y', '5Y', '10Y', '2Y'];
    const activePeriodKey = periodKeys.find(k => fund.periods?.[k]?.hasSufficientData) || '1Y';
    const periodData = fund.periods?.[activePeriodKey];
    const aumVal = parseAum(fund);

    const tabName = sanitizeSheetName(fund.displayName || 'Fund', existingSheetNames);
    const wsDetail = workbook.addWorksheet(tabName, {
      views: [{ showGridLines: true }]
    });

    const detailCols = [
      { width: 14 }, // Installment #
      { width: 16 }, // Scheduled Date
      { width: 16 }, // Allotment Date
      { width: 15 }, // Holiday Adjusted
      { width: 16 }, // Applicable NAV
      { width: 16 }, // Monthly SIP
      { width: 16 }, // Units Purchased
      { width: 16 }, // Cumulative Units
      { width: 22 }, // Cumulative Invested
      { width: 26 }  // Portfolio Value
    ];
    wsDetail.columns = detailCols;
    const detailTotalCols = detailCols.length;

    // Header Info Block
    wsDetail.mergeCells(1, 1, 1, detailTotalCols);
    const title = wsDetail.getCell(1, 1);
    title.value = `Snazzy Wealth FundLens — Detailed Monthly SIP Cash Flow Ledger (${todayFormatted})`;
    title.font = { name: FONT_FAMILY, size: 14, bold: true, color: { argb: 'FF000000' } };
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    wsDetail.getRow(1).height = 26;

    const infoRows = [
      [`Scheme Name: ${fund.displayName || fund.amfiSchemeName}`],
      [`Category: ${fund.category || 'N/A'}`, `AUM: ${fund.dailyAUMFormatted || (aumVal ? `₹${aumVal.toLocaleString('en-IN')} Cr` : 'N/A')}`, `Plan: ${planLabel}`],
      [`Analysis Period: ${activePeriodKey} (${periodData?.installmentsCount || 0} monthly installments)`, `Calculation Date: ${calcDateFormatted}`, `Report Date: ${todayFormatted}`]
    ];

    infoRows.forEach((rowVals, rIdx) => {
      const rowNum = 2 + rIdx;
      wsDetail.getRow(rowNum).height = 20;
      rowVals.forEach((val, cIdx) => {
        const cell = wsDetail.getCell(rowNum, cIdx + 1);
        cell.value = val;
        cell.font = { name: FONT_FAMILY, size: 11, bold: rIdx === 0, color: { argb: 'FF000000' } };
        cell.alignment = { vertical: 'middle' };
      });
    });

    let currentDetailRow = 6;

    if (!periodData || !periodData.hasSufficientData) {
      const emptyRow = wsDetail.getRow(currentDetailRow);
      emptyRow.height = 22;
      const cell = wsDetail.getCell(currentDetailRow, 1);
      cell.value = `Status: Insufficient historical NAV data for this calculation horizon (${periodData?.insufficientReason || 'N/A'}).`;
      cell.font = { name: FONT_FAMILY, size: 11, bold: true, color: { argb: 'FF990000' } };
    } else {
      // Summary Metrics Block
      const smTitle = wsDetail.getCell(currentDetailRow, 1);
      smTitle.value = '--- SUMMARY METRICS ---';
      smTitle.font = { name: FONT_FAMILY, size: 11, bold: true, color: { argb: 'FF000000' } };
      wsDetail.getRow(currentDetailRow).height = 20;
      currentDetailRow++;

      const metrics = [
        ['Fund AUM (Cr)', aumVal !== null ? aumVal : 'N/A', '#,##0.00'],
        ['Total Amount Invested', Number(periodData.totalInvested), '"₹"#,##0.00'],
        ['Total Accumulated Units', Number(periodData.totalUnits.toFixed(4)), '#,##0.0000'],
        ['Latest Applicable NAV', Number(periodData.currentNav), '"₹"#,##0.00'],
        ['Final Portfolio Value', Number(periodData.finalPortfolioValue), '"₹"#,##0.00'],
        ['Absolute Gain / Profit', Number(periodData.absoluteGain), '"₹"#,##0.00'],
        ['Annualized Return (SIP XIRR)', periodData.sipXirr !== null ? Number(periodData.sipXirr) / 100 : 'N/A', '0.00%']
      ];

      metrics.forEach(([label, val, fmt]) => {
        const row = wsDetail.getRow(currentDetailRow);
        row.height = 19;

        const labelCell = wsDetail.getCell(currentDetailRow, 1);
        labelCell.value = label;
        labelCell.font = { name: FONT_FAMILY, size: 11, bold: true, color: { argb: 'FF000000' } };
        labelCell.border = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN };

        const valCell = wsDetail.getCell(currentDetailRow, 2);
        valCell.value = val;
        valCell.font = { name: FONT_FAMILY, size: 11, bold: false, color: { argb: 'FF000000' } };
        if (typeof val === 'number') valCell.numFmt = fmt;
        valCell.border = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN };

        currentDetailRow++;
      });

      currentDetailRow++; // blank space

      // Installments Table Header
      const tableHeaders = [
        'Installment #',
        'Scheduled SIP Date',
        'Allotment / NAV Date',
        'Holiday Adjusted?',
        'Applicable NAV (₹)',
        'Monthly SIP (₹)',
        'Units Purchased',
        'Cumulative Units',
        'Cumulative Invested (₹)',
        'Valuation at Latest NAV (₹)'
      ];

      const instHeadRow = wsDetail.getRow(currentDetailRow);
      instHeadRow.height = 26;
      tableHeaders.forEach((h, idx) => {
        const cell = wsDetail.getCell(currentDetailRow, idx + 1);
        cell.value = h;
        cell.font = { name: FONT_FAMILY, size: 11, bold: true, color: { argb: 'FF000000' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN };
      });
      currentDetailRow++;

      // Installment Rows
      periodData.installments.forEach(inst => {
        const valAtLatest = inst.cumulativeUnits * periodData.currentNav;
        const row = wsDetail.getRow(currentDetailRow);
        row.height = 19;

        const rowData = [
          inst.installmentNumber,
          inst.scheduledDate,
          inst.allotmentDate,
          inst.isAdjustedForHoliday ? 'Yes' : 'No',
          Number(inst.nav),
          Number(inst.sipAmount),
          Number(inst.unitsPurchased.toFixed(4)),
          Number(inst.cumulativeUnits.toFixed(4)),
          Number(inst.cumulativeInvested),
          Number(valAtLatest.toFixed(2))
        ];

        rowData.forEach((val, cIdx) => {
          const colIdx = cIdx + 1;
          const cell = wsDetail.getCell(currentDetailRow, colIdx);
          cell.value = val;
          cell.font = { name: FONT_FAMILY, size: 11, bold: false, color: { argb: 'FF000000' } };
          cell.alignment = {
            horizontal: colIdx <= 4 ? 'center' : 'right',
            vertical: 'middle'
          };

          if (colIdx === 5 || colIdx === 6 || colIdx === 9 || colIdx === 10) {
            cell.numFmt = '"₹"#,##0.00';
          } else if (colIdx === 7 || colIdx === 8) {
            cell.numFmt = '#,##0.0000';
          }

          cell.border = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN };
        });

        currentDetailRow++;
      });

      // Final Valuation Row
      const finalRow = wsDetail.getRow(currentDetailRow);
      finalRow.height = 22;
      const finalData = [
        'Valuation',
        periodData.valuationDate,
        periodData.valuationDate,
        '-',
        Number(periodData.currentNav),
        'Final Value',
        '-',
        Number(periodData.totalUnits.toFixed(4)),
        Number(periodData.totalInvested),
        Number(periodData.finalPortfolioValue)
      ];

      finalData.forEach((val, cIdx) => {
        const colIdx = cIdx + 1;
        const cell = wsDetail.getCell(currentDetailRow, colIdx);
        cell.value = val;
        cell.font = { name: FONT_FAMILY, size: 11, bold: true, color: { argb: 'FF000000' } };
        cell.alignment = {
          horizontal: colIdx <= 4 ? 'center' : 'right',
          vertical: 'middle'
        };

        if (colIdx === 5 || colIdx === 9 || colIdx === 10) {
          cell.numFmt = '"₹"#,##0.00';
        } else if (colIdx === 8) {
          cell.numFmt = '#,##0.0000';
        }

        cell.border = { top: BORDER_THIN, bottom: BORDER_MEDIUM, left: BORDER_THIN, right: BORDER_THIN };
      });
    }
  });

  const fileName = `Snazzy SIP Returns ${todayFormatted}.xlsx`;
  await downloadWorkbook(workbook, fileName);
};
