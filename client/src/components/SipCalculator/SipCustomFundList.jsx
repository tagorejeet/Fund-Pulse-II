import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Trash2,
  AlertTriangle,
  Sparkles,
  TrendingUp,
  Search,
  Plus,
  Eye,
  CheckSquare,
  Square,
  Calculator,
  Layers,
  ArrowRight
} from 'lucide-react';
import { NSE_INDICES } from '../../config/nseConfig';
import { fuzzyFilterSchemes } from '../../utils/fuzzySearch';

const CATEGORY_ORDER = {
  'Large Cap': 1,
  'Mid Cap': 2,
  'Large & Mid Cap': 3,
  'Small Cap': 4,
  'Multi Cap': 5,
  'Value': 6,
  'Flexi Cap': 7,
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

const PRESET_POPULAR_FUNDS = [
  { id: 'nippon-india-small-cap-growth', displayName: 'Nippon India Small Cap Fund - Growth', category: 'Small Cap', amcName: 'Nippon India Mutual Fund', dailyAUMRaw: 56420.90, dailyAUMFormatted: '₹56,420.90 Cr' },
  { id: 'edelweiss-mid-cap-growth', displayName: 'Edelweiss Mid Cap Fund - Growth', category: 'Mid Cap', amcName: 'Edelweiss Mutual Fund', dailyAUMRaw: 8750.30, dailyAUMFormatted: '₹8,750.30 Cr' },
  { id: 'hdfc-mid-cap-growth', displayName: 'HDFC Mid Cap Fund - Growth', category: 'Mid Cap', amcName: 'HDFC Mutual Fund', dailyAUMRaw: 67890.50, dailyAUMFormatted: '₹67,890.50 Cr' },
  { id: 'icici-prudential-bluechip-growth', displayName: 'ICICI Prudential Bluechip Fund - Growth', category: 'Large Cap', amcName: 'ICICI Prudential Mutual Fund', dailyAUMRaw: 54120.80, dailyAUMFormatted: '₹54,120.80 Cr' }
];

export const SipCustomFundList = ({
  results = [],
  selectedFundIds = [],
  fundMetaMap = {},
  allFunds = [],
  checkedExportIds = new Set(),
  onToggleExportFund,
  onToggleSelectAllFunds,
  onRemoveFund,
  onClearAll,
  onAddFund,
  onOpenDetail,
  onExport,
  monthlySip = 100000,
  calculationDate = '',
  sipDay = 25,
  plan = 'regular',
  onSwitchToCalculator,
  isCalculating = false
}) => {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Search suggestions
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const map = new Map();
    const qLower = searchQuery.toLowerCase().trim();

    // 1. NSE Indices
    NSE_INDICES.forEach(idx => {
      if (
        idx.id.toLowerCase().includes(qLower) ||
        idx.displayName.toLowerCase().includes(qLower) ||
        idx.officialName.toLowerCase().includes(qLower)
      ) {
        map.set(idx.id, {
          id: idx.id,
          displayName: `${idx.displayName} (NSE Benchmark)`,
          category: idx.category,
          amcName: 'NSE Indices',
          isNseIndex: true
        });
      }
    });

    // 2. Fuzzy match local allFunds
    if (allFunds && allFunds.length > 0) {
      const fuzzyLocal = fuzzyFilterSchemes(allFunds, searchQuery);
      fuzzyLocal.slice(0, 12).forEach(f => {
        if (!map.has(f.id)) map.set(f.id, f);
      });
    }

    return Array.from(map.values()).slice(0, 15);
  }, [searchQuery, allFunds]);

  // Build unified item list for all selected items (combining results and selected IDs)
  const resultsMap = useMemo(() => {
    const map = new Map();
    const norm = (str) => String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    results.forEach(r => {
      if (r.fundId) {
        map.set(r.fundId, r);
        map.set(norm(r.fundId), r);
        if (r.displayName) map.set(norm(r.displayName), r);
        if (r.fundId.endsWith('-reg') || r.fundId.endsWith('-dir')) {
          const baseId = r.fundId.replace(/-(reg|dir)$/, '');
          map.set(baseId, r);
          map.set(norm(baseId), r);
        }
      }
    });
    return map;
  }, [results]);

  // Combine mutual funds and NSE indices from selectedFundIds & official benchmarks
  const { mutualFundsList, nseIndicesList } = useMemo(() => {
    const mf = [];
    const nse = [];
    const processedIds = new Set();
    const norm = (str) => String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    // Ensure all items in selectedFundIds are included
    selectedFundIds.forEach(id => {
      if (processedIds.has(id)) return;
      processedIds.add(id);

      const idNorm = norm(id);
      const res = resultsMap.get(id) || resultsMap.get(idNorm) || results.find(r => norm(r.fundId) === idNorm || (r.displayName && norm(r.displayName) === idNorm));
      const meta = fundMetaMap[id] || (allFunds && allFunds.find(f => f.id === id || norm(f.id) === idNorm || (f.displayName && norm(f.displayName) === idNorm))) || {};
      const isNse = res?.isNseIndex || res?.plan === 'Benchmark' || meta?.isNseIndex || id.startsWith('NIFTY');

      const rawAum = res?.dailyAUMRaw ?? res?.aum ?? meta?.dailyAUMRaw ?? meta?.aum ?? null;
      const formattedAum = res?.dailyAUMFormatted || res?.aumFormatted || meta?.dailyAUMFormatted || meta?.aumFormatted || (rawAum ? `₹${Number(rawAum).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr` : 'N/A');

      const item = {
        id,
        fundId: id,
        displayName: res?.displayName || meta?.displayName || id,
        category: res?.category || meta?.category || (isNse ? 'Benchmark' : 'Other'),
        amcName: res?.amcName || meta?.amcName || (isNse ? 'NSE Indices' : ''),
        currentNav: res?.currentNav ?? meta?.currentNav,
        dailyAUMRaw: rawAum,
        dailyAUMFormatted: formattedAum,
        returns: res?.returns || {},
        periods: res?.periods || {},
        isNseIndex: isNse,
        result: res
      };

      if (isNse) {
        nse.push(item);
      } else {
        mf.push(item);
      }
    });

    // Also include any NSE results returned by backend that might not be in selectedFundIds
    results.forEach(r => {
      if ((r.isNseIndex || r.plan === 'Benchmark') && !processedIds.has(r.fundId)) {
        processedIds.add(r.fundId);
        nse.push({
          id: r.fundId,
          fundId: r.fundId,
          displayName: r.displayName || r.fundId,
          category: r.category || 'Benchmark',
          amcName: r.amcName || 'NSE Indices',
          currentNav: r.currentNav,
          dailyAUMRaw: null,
          dailyAUMFormatted: '-',
          returns: r.returns || {},
          periods: r.periods || {},
          isNseIndex: true,
          result: r
        });
      }
    });

    return { mutualFundsList: mf, nseIndicesList: nse };
  }, [selectedFundIds, resultsMap, fundMetaMap, allFunds, results]);

  // Group mutual funds by category
  const groupedMutualFunds = useMemo(() => {
    const groups = {};
    mutualFundsList.forEach(fund => {
      const cat = fund.category || 'Other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(fund);
    });

    return Object.entries(groups).sort(([catA], [catB]) => {
      const orderA = CATEGORY_ORDER[catA] || 99;
      const orderB = CATEGORY_ORDER[catB] || 99;
      return orderA - orderB;
    });
  }, [mutualFundsList]);

  // Checked counts
  const checkedAmfiCount = mutualFundsList.filter(f => checkedExportIds.has(f.id)).length;
  const checkedNseCount = nseIndicesList.filter(i => checkedExportIds.has(i.id)).length;
  const totalCheckedCount = checkedAmfiCount + checkedNseCount;
  const totalItemsCount = mutualFundsList.length + nseIndicesList.length;

  const handleToggleCategoryExport = (catFunds) => {
    const allChecked = catFunds.every(f => checkedExportIds.has(f.id));
    catFunds.forEach(f => {
      if (allChecked) {
        if (checkedExportIds.has(f.id)) onToggleExportFund(f.id);
      } else {
        if (!checkedExportIds.has(f.id)) onToggleExportFund(f.id);
      }
    });
  };

  const handleToggleAllAmfi = () => {
    onToggleSelectAllFunds(mutualFundsList);
  };

  const handleToggleAllNse = () => {
    onToggleSelectAllFunds(nseIndicesList);
  };

  const formatPct = (val) => {
    if (val === null || val === undefined || isNaN(val)) {
      return <span className="text-slate-400 dark:text-slate-500 font-sans">N/A</span>;
    }
    const num = Number(val);
    const isPositive = num > 0;
    return (
      <span className={`font-mono font-bold ${num === 0 ? 'text-slate-500 dark:text-slate-400' : isPositive ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
        {isPositive ? `+${num.toFixed(2)}%` : `${num.toFixed(2)}%`}
      </span>
    );
  };

  const formatCurrency = (val) => {
    if (val === null || val === undefined || isNaN(val)) return 'N/A';
    return `₹${Math.round(Number(val)).toLocaleString('en-IN')}`;
  };

  return (
    <div className="space-y-6 animate-fade-in font-sans">

      {/* Top Banner & Comprehensive Portfolio Counters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-xl bg-white dark:bg-[#0B1936] border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold font-serif text-slate-900 dark:text-white flex items-center gap-2">
              <span>SIP Custom Portfolio & Benchmarks</span>
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 font-mono">
              {mutualFundsList.length} Mutual Funds + {nseIndicesList.length} NSE Benchmarks
            </span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 flex flex-wrap items-center gap-2">
            <span>AMFI: <strong className="text-slate-800 dark:text-white font-mono">{checkedAmfiCount}/{mutualFundsList.length}</strong> checked for export</span>
            <span>•</span>
            <span>NSE: <strong className="text-emerald-700 dark:text-emerald-400 font-mono">{checkedNseCount}/{nseIndicesList.length}</strong> checked for export</span>
            <span>•</span>
            <span className="text-slate-400 dark:text-slate-500">Unchecked funds remain visible in list</span>
          </div>
        </div>

        {/* Action Buttons: Export to Excel, Clear All, Switch View */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Export to Excel */}
          <button
            onClick={onExport}
            disabled={totalCheckedCount === 0}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-snazzy-navy hover:bg-[#0A295F] text-snazzy-gold dark:bg-snazzy-gold dark:hover:bg-[#dba83a] dark:text-snazzy-navy disabled:opacity-40 font-semibold text-xs transition-all shadow-sm active:scale-95 border border-snazzy-gold/30"
            title="Export checked mutual funds and NSE indices to Excel"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export to Excel ({totalCheckedCount} Selected)</span>
          </button>

          {/* Switch to Calculator View */}
          {onSwitchToCalculator && (
            <button
              onClick={onSwitchToCalculator}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-all active:scale-95"
            >
              <Calculator className="w-3.5 h-3.5 text-snazzy-navy dark:text-snazzy-gold" />
              <span>Calculator View</span>
            </button>
          )}

          {/* Clear All */}
          {totalItemsCount > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-slate-800 dark:hover:bg-rose-500/20 dark:text-slate-400 dark:hover:text-rose-300 border border-rose-200 dark:border-slate-700 text-xs font-semibold transition-all"
              title="Clear all funds from SIP analysis"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear All</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick Add / Search Bar inside Custom List */}
      <div className="bg-white dark:bg-[#0B1936] p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3 transition-colors">
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              placeholder="Search more mutual funds or NSE indices to add to this custom list..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-snazzy-navy dark:focus:ring-snazzy-gold transition-colors"
            />
          </div>

          {isSearchOpen && (
            <div
              className="fixed inset-0 z-20"
              onClick={() => setIsSearchOpen(false)}
            />
          )}

          {isSearchOpen && searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white dark:bg-[#0B1936] rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {searchResults.map(fund => {
                const isAdded = selectedFundIds.includes(fund.id);
                return (
                  <div
                    key={fund.id}
                    onClick={() => {
                      onAddFund(fund);
                      setSearchQuery('');
                      setIsSearchOpen(false);
                    }}
                    className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${
                      isAdded 
                        ? 'bg-amber-50 dark:bg-snazzy-navy/60 text-snazzy-navy dark:text-snazzy-gold' 
                        : 'hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <div className="min-w-0 pr-3">
                      <div className="font-semibold text-xs text-slate-900 dark:text-white truncate">{fund.displayName}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                        <span className="text-snazzy-navy dark:text-snazzy-gold font-medium">{fund.category}</span>
                        <span>•</span>
                        <span>{fund.amcName}</span>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded text-[10px] font-semibold ${
                      isAdded 
                        ? 'bg-snazzy-gold/20 text-snazzy-navy dark:text-snazzy-gold' 
                        : 'bg-slate-100 dark:bg-slate-800 hover:bg-snazzy-navy hover:text-white dark:hover:bg-snazzy-gold dark:hover:text-snazzy-navy text-slate-700 dark:text-slate-300 transition-colors'
                    }`}>
                      {isAdded ? 'Added' : '+ Add'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Preset & Benchmark Quick Buttons */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <span className="text-[11px] text-slate-500 font-semibold">Quick Add:</span>
          {PRESET_POPULAR_FUNDS.map(preset => {
            const isAdded = selectedFundIds.includes(preset.id);
            return (
              <button
                key={preset.id}
                onClick={() => onAddFund(preset)}
                disabled={isAdded}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
                  isAdded
                    ? 'bg-slate-100 dark:bg-slate-900 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-800 cursor-default'
                    : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
                }`}
              >
                <Plus className="h-3 w-3" />
                <span>{preset.displayName.replace(' - Growth', '')}</span>
              </button>
            );
          })}

          {NSE_INDICES.map(idx => {
            const isAdded = selectedFundIds.includes(idx.id);
            return (
              <button
                key={idx.id}
                onClick={() => onAddFund({
                  id: idx.id,
                  displayName: `${idx.displayName} (NSE Benchmark)`,
                  category: idx.category,
                  amcName: 'NSE Indices',
                  isNseIndex: true
                })}
                disabled={isAdded}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
                  isAdded
                    ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-400 dark:text-amber-500/40 border border-amber-200 dark:border-amber-500/20 cursor-default'
                    : 'bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/30 border border-amber-200 dark:border-amber-500/30'
                }`}
              >
                <Plus className="h-3 w-3" />
                <span>{idx.displayName}</span>
              </button>
            );
          })}
        </div>
      </div>
      {/* SECTION 1: CUSTOM MUTUAL FUNDS */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-snazzy-navy dark:text-snazzy-gold" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Custom Mutual Funds
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">({mutualFundsList.length} schemes)</span>
          </div>

          {mutualFundsList.length > 0 && (
            <button
              onClick={handleToggleAllAmfi}
              className="text-[11px] font-semibold text-snazzy-navy dark:text-snazzy-gold hover:underline transition-colors"
            >
              {mutualFundsList.every(f => checkedExportIds.has(f.id)) ? 'Deselect All AMFI for Export' : 'Select All AMFI for Export'}
            </button>
          )}
        </div>

        {mutualFundsList.length === 0 ? (
          <div className="p-8 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center text-slate-500 dark:text-slate-400 text-xs">
            No mutual funds added to SIP Custom List yet. Search above or click presets to add schemes.
          </div>
        ) : (
          <div className="space-y-6">
            {groupedMutualFunds.map(([category, catFunds]) => {
              const allCatChecked = catFunds.every(f => checkedExportIds.has(f.id));
              return (
                <div key={category} className="bg-white dark:bg-[#0B1936] rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
                  {/* Category Header */}
                  <div className="bg-slate-50/80 dark:bg-slate-900/90 px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={allCatChecked}
                        onChange={() => handleToggleCategoryExport(catFunds)}
                        title="Toggle export for this category"
                        className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-snazzy-navy dark:text-snazzy-gold focus:ring-snazzy-gold cursor-pointer accent-snazzy-navy dark:accent-snazzy-gold"
                      />
                      <span className="font-bold text-slate-900 dark:text-white text-xs">{category}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono">
                        {catFunds.length}
                      </span>
                    </div>

                    <button
                      onClick={() => handleToggleCategoryExport(catFunds)}
                      className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                    >
                      {allCatChecked ? 'Uncheck Category' : 'Check Category'}
                    </button>
                  </div>

                  {/* Fund Rows */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100/70 dark:bg-slate-950/60 text-slate-600 dark:text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800/80">
                        <tr>
                          <th className="p-3 w-10 text-center">Export</th>
                          <th className="p-3 min-w-[220px]">Scheme Name</th>
                          <th className="p-3 min-w-[100px]">AUM (Cr)</th>
                          <th className="p-3 min-w-[90px]">NAV</th>
                          <th className="p-3 text-center min-w-[80px]">1Y SIP</th>
                          <th className="p-3 text-center min-w-[80px]">2Y SIP</th>
                          <th className="p-3 text-center min-w-[80px]">3Y SIP</th>
                          <th className="p-3 text-center min-w-[80px]">5Y SIP</th>
                          <th className="p-3 text-center min-w-[80px]">10Y SIP</th>
                          <th className="p-3 min-w-[120px]">3Y Value</th>
                          <th className="p-3 text-right pr-4 min-w-[90px]">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                        {catFunds.map((fund) => {
                          const isChecked = checkedExportIds.has(fund.id);
                          const p3 = fund.periods?.['3Y'];
                          const p1 = fund.periods?.['1Y'];
                          const valueDisplay = p3?.hasSufficientData
                            ? formatCurrency(p3.finalPortfolioValue)
                            : p1?.hasSufficientData
                              ? `${formatCurrency(p1.finalPortfolioValue)} (1Y)`
                              : 'N/A';

                          return (
                            <tr
                              key={fund.id}
                              onClick={() => fund.result && onOpenDetail && onOpenDetail(fund.result)}
                              className={`hover:bg-slate-50 dark:hover:bg-slate-850/60 transition-colors cursor-pointer group ${
                                !isChecked ? 'opacity-60 bg-slate-50/50 dark:bg-slate-950/40' : ''
                              }`}
                            >
                              <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => onToggleExportFund(fund.id)}
                                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-snazzy-navy dark:text-snazzy-gold focus:ring-snazzy-gold cursor-pointer accent-snazzy-navy dark:accent-snazzy-gold"
                                  title="Check to include in Excel export; uncheck to exclude"
                                />
                              </td>

                              <td className="p-3 select-text cursor-text">
                                <div className="font-bold text-slate-900 dark:text-white text-xs group-hover:text-snazzy-navy dark:group-hover:text-snazzy-gold transition-colors select-text">
                                  {fund.displayName}
                                </div>
                                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 select-text">{fund.amcName}</div>
                              </td>

                              <td className="p-3 font-mono text-slate-800 dark:text-slate-200">
                                {fund.dailyAUMFormatted && fund.dailyAUMFormatted !== 'N/A'
                                  ? fund.dailyAUMFormatted
                                  : (fund.dailyAUMRaw ? `₹${Number(fund.dailyAUMRaw).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr` : 'N/A')}
                              </td>

                              <td className="p-3 font-mono text-slate-800 dark:text-slate-200">
                                {fund.currentNav ? `₹${Number(fund.currentNav).toFixed(2)}` : 'N/A'}
                              </td>

                              <td className="p-3 text-center">{formatPct(fund.returns?.return1Yr)}</td>
                              <td className="p-3 text-center">{formatPct(fund.returns?.return2Yr)}</td>
                              <td className="p-3 text-center">{formatPct(fund.returns?.return3Yr)}</td>
                              <td className="p-3 text-center">{formatPct(fund.returns?.return5Yr)}</td>
                              <td className="p-3 text-center">{formatPct(fund.returns?.return10Yr)}</td>

                              <td className="p-3 font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
                                {valueDisplay}
                              </td>

                              <td className="p-3 text-right pr-4" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1.5">
                                  {fund.result && onOpenDetail && (
                                    <button
                                      onClick={() => onOpenDetail(fund.result)}
                                      className="p-1.5 rounded-md bg-slate-100 hover:bg-snazzy-navy hover:text-white dark:bg-slate-800 dark:hover:bg-snazzy-gold dark:hover:text-snazzy-navy text-slate-600 dark:text-slate-300 transition-all"
                                      title="View detailed ledger"
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => onRemoveFund(fund.id)}
                                    className="p-1.5 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all"
                                    title="Remove scheme from SIP analysis"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 2: NSE BENCHMARK INDICES (Dedicated Separate Container) */}
      <div className="space-y-4 pt-4 border-t-2 border-slate-200 dark:border-slate-800/80">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-snazzy-navy dark:text-snazzy-gold" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              NSE Benchmark Indices
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">({nseIndicesList.length} benchmark indices)</span>
          </div>

          {nseIndicesList.length > 0 && (
            <button
              onClick={handleToggleAllNse}
              className="text-[11px] font-semibold text-snazzy-navy dark:text-snazzy-gold hover:underline transition-colors"
            >
              {nseIndicesList.every(i => checkedExportIds.has(i.id)) ? 'Deselect All NSE for Export' : 'Select All NSE for Export'}
            </button>
          )}
        </div>

        {nseIndicesList.length === 0 ? (
          <div className="p-8 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center text-slate-500 dark:text-slate-400 text-xs">
            No NSE benchmark indices in custom list. Add NIFTY 50, NIFTY 500, etc. above.
          </div>
        ) : (
          <div className="bg-white dark:bg-[#0B1936] rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100/70 dark:bg-slate-950/70 text-slate-600 dark:text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800/80">
                  <tr>
                    <th className="p-3 w-10 text-center">Export</th>
                    <th className="p-3 min-w-[220px]">Benchmark Index</th>
                    <th className="p-3 min-w-[100px]">AUM (Cr)</th>
                    <th className="p-3 min-w-[100px]">Index Value (NAV)</th>
                    <th className="p-3 text-center min-w-[80px]">1Y SIP</th>
                    <th className="p-3 text-center min-w-[80px]">2Y SIP</th>
                    <th className="p-3 text-center min-w-[80px]">3Y SIP</th>
                    <th className="p-3 text-center min-w-[80px]">5Y SIP</th>
                    <th className="p-3 text-center min-w-[80px]">10Y SIP</th>
                    <th className="p-3 min-w-[120px]">3Y Value</th>
                    <th className="p-3 text-right pr-4 min-w-[90px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                  {nseIndicesList.map(idx => {
                    const isChecked = checkedExportIds.has(idx.id);
                    const p3 = idx.periods?.['3Y'];
                    const p1 = idx.periods?.['1Y'];
                    const valueDisplay = p3?.hasSufficientData
                      ? formatCurrency(p3.finalPortfolioValue)
                      : p1?.hasSufficientData
                        ? `${formatCurrency(p1.finalPortfolioValue)} (1Y)`
                        : 'N/A';

                    return (
                      <tr
                        key={idx.id}
                        onClick={() => idx.result && onOpenDetail && onOpenDetail(idx.result)}
                        className={`hover:bg-amber-50/40 dark:hover:bg-slate-850/60 transition-colors cursor-pointer group ${
                          !isChecked ? 'opacity-60 bg-slate-50/50 dark:bg-slate-950/40' : ''
                        }`}
                      >
                        <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => onToggleExportFund(idx.id)}
                            className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-snazzy-navy dark:text-snazzy-gold focus:ring-snazzy-gold cursor-pointer accent-snazzy-navy dark:accent-snazzy-gold"
                            title="Check to include in Excel export; uncheck to exclude"
                          />
                        </td>

                        <td className="p-3">
                          <div className="font-bold text-slate-900 dark:text-white text-xs group-hover:text-snazzy-navy dark:group-hover:text-snazzy-gold transition-colors">
                            {idx.displayName}
                          </div>
                          <div className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">{idx.amcName || 'Official Benchmark'}</div>
                        </td>

                        <td className="p-3 font-mono text-slate-400 dark:text-slate-500">
                          -
                        </td>

                        <td className="p-3 font-mono font-bold text-slate-900 dark:text-white">
                          {idx.currentNav ? `₹${Number(idx.currentNav).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'N/A'}
                        </td>

                        <td className="p-3 text-center">{formatPct(idx.returns?.return1Yr)}</td>
                        <td className="p-3 text-center">{formatPct(idx.returns?.return2Yr)}</td>
                        <td className="p-3 text-center">{formatPct(idx.returns?.return3Yr)}</td>
                        <td className="p-3 text-center">{formatPct(idx.returns?.return5Yr)}</td>
                        <td className="p-3 text-center">{formatPct(idx.returns?.return10Yr)}</td>

                        <td className="p-3 font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
                          {valueDisplay}
                        </td>

                        <td className="p-3 text-right pr-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {idx.result && onOpenDetail && (
                              <button
                                onClick={() => onOpenDetail(idx.result)}
                                className="p-1.5 rounded-md bg-slate-100 hover:bg-snazzy-navy hover:text-white dark:bg-slate-800 dark:hover:bg-snazzy-gold dark:hover:text-snazzy-navy text-slate-600 dark:text-slate-300 transition-all"
                                title="View detailed ledger"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => onRemoveFund(idx.id)}
                              className="p-1.5 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all"
                              title="Remove index from SIP analysis"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Clear All Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in font-sans">
          <div className="bg-white dark:bg-[#0B1936] max-w-sm w-full p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Clear SIP Custom Selection?</h3>
            </div>
            
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Are you sure you want to clear all mutual funds and NSE benchmark indices from this SIP analysis list?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onClearAll();
                  setShowClearConfirm(false);
                }}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition-all"
              >
                Yes, Clear All
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default SipCustomFundList;
