import React, { useState, useMemo } from 'react';
import { Search, ArrowUpDown, ArrowUp, ArrowDown, ExternalLink, AlertCircle, XCircle, ChevronLeft, ChevronRight, Check, Calendar } from 'lucide-react';

const FundTable = ({
  funds = [],
  totalFunds = 0,
  page = 1,
  totalPages = 1,
  onPageChange,
  isLoading = false,
  mode = 'yearly',
  customDays = 33,
  customDaysList = [33, 50, 67],
  startDate = '',
  endDate = '',
  calculationDate = '',
  meta = null,
  selectedPlan = 'regular',
  selectedFundIds = new Set(),
  onToggleSelectFund,
  onToggleSelectAllPage,
  suggestionFundIds = new Set(),
  onToggleSuggestionFund,
  onToggleSelectAllSuggestionPage,
  onSelectFund,
  searchQuery = '',
  setSearchQuery
}) => {
  const [sortField, setSortField] = useState('displayName');
  const [sortOrder, setSortOrder] = useState('asc');

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'category' || field === 'displayName' ? 'asc' : 'desc');
    }
  };

  const determineOption = (fund) => {
    if (fund.schemeOption) return fund.schemeOption;
    const name = fund.displayName || '';
    const lower = name.toLowerCase().trim();
    if (/\bbonus\b/i.test(lower)) return 'bonus';
    if (/\b(idcw|dividend|div)\b/i.test(lower)) return 'idcw';
    if (/(\s*-\s*growth\b|\s*-\s*gr\b|\bgrowth\s*option\b|\bgrowth\s*plan\b|\(growth\)|\(gr\)|\bregular\s+growth\b|\bdirect\s+growth\b|\s*-\s*growth\s*$|\bgrowth\s*$)/i.test(lower)) {
      return 'growth';
    }
    return 'other';
  };

  const filteredFunds = useMemo(() => {
    if (!funds) return [];
    return funds.filter(f => determineOption(f) === 'growth');
  }, [funds]);

  const sortedFunds = useMemo(() => {
    if (!filteredFunds) return [];
    return [...filteredFunds].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (aVal === null || aVal === undefined || aVal === 'N/A') return 1;
      if (bVal === null || bVal === undefined || bVal === 'N/A') return -1;

      if (typeof aVal === 'string') {
        const comp = aVal.localeCompare(bVal);
        return sortOrder === 'asc' ? comp : -comp;
      }

      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [filteredFunds, sortField, sortOrder]);

  const allPageSelected = useMemo(() => {
    if (!sortedFunds || sortedFunds.length === 0) return false;
    return sortedFunds.every(f => selectedFundIds.has(f.id));
  }, [sortedFunds, selectedFundIds]);

  const allSuggestionSelected = useMemo(() => {
    if (!sortedFunds || sortedFunds.length === 0) return false;
    return sortedFunds.every(f => suggestionFundIds.has(f.id));
  }, [sortedFunds, suggestionFundIds]);

  const renderSortIcon = (field) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 text-slate-500 opacity-60 group-hover:opacity-100" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="h-3 w-3 text-brand-400 font-bold" />
    ) : (
      <ArrowDown className="h-3 w-3 text-brand-400 font-bold" />
    );
  };

  const formatPct = (val) => {
    if (val === null || val === undefined || isNaN(val)) return <span className="text-slate-400 dark:text-slate-500 font-sans">N/A</span>;
    const num = Number(val);
    const formatted = num.toFixed(2);
    const isPositive = num > 0;
    return (
      <span className={num === 0 ? 'text-slate-600 dark:text-slate-300' : isPositive ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-rose-600 dark:text-rose-400 font-semibold'}>
        {isPositive ? `+${formatted}%` : `${formatted}%`}
      </span>
    );
  };

  const formatNav = (val) => {
    if (val === null || val === undefined || isNaN(val)) return 'N/A';
    return `₹${Number(val).toFixed(2)}`;
  };

  const getRiskometerBadge = (risk) => {
    if (!risk || risk === 'N/A') return <span className="text-slate-400 dark:text-slate-500">N/A</span>;
    const lower = risk.toLowerCase();
    let style = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    if (lower.includes('very high')) style = 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30';
    else if (lower.includes('high')) style = 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30';
    else if (lower.includes('moderate')) style = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30';
    else if (lower.includes('low')) style = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';

    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${style}`}>
        {risk}
      </span>
    );
  };

  return (
    <div className="space-y-4 my-4">
      {/* Top Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          {/* Search Box */}
          <div className="relative flex-1 sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search all Indian mutual fund schemes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-9 py-2 text-xs font-medium rounded-xl bg-white dark:bg-slate-900/90 text-slate-900 dark:text-white placeholder-slate-400 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-[#CD9B30]/30 focus:border-[#CD9B30] transition-all shadow-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <XCircle className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end flex-wrap">
          {mode === 'days' && customDaysList && customDaysList.length > 0 && (
            <div className="px-2.5 py-1 rounded-lg bg-[#061C41]/5 dark:bg-brand-500/10 border border-[#061C41]/15 dark:border-brand-500/30 text-[#061C41] dark:text-brand-300 text-[11px] font-medium">
              Day Columns: <span className="font-bold text-emerald-700 dark:text-emerald-400">{customDaysList.join('D, ')}D</span>
              {startDate && endDate && (
                <span className="ml-1.5 text-slate-500 dark:text-slate-400 text-[10px]">({startDate} → {endDate})</span>
              )}
            </div>
          )}
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Total Schemes: <span className="text-slate-900 dark:text-white font-bold">{totalFunds.toLocaleString('en-IN')}</span> | Showing <span className="text-[#061C41] dark:text-brand-400 font-bold">{selectedPlan === 'both' ? 'BOTH (Regular & Direct)' : selectedPlan.toUpperCase()}</span> Plan
          </div>
        </div>
      </div>

      {/* Prominent Valuation & Calculation Date Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-xs shadow-sm">
        <div className="flex items-center gap-2 text-slate-700 dark:text-brand-300 font-medium">
          <Calendar className="w-4 h-4 text-[#CD9B30] shrink-0" />
          <span>
            Valuation & Performance as of: <strong className="text-slate-900 dark:text-white font-bold">{calculationDate || 'Today'}</strong>
            {meta?.reportDate && (
              <span className="text-slate-500 dark:text-slate-400 ml-2">
                (Latest AMFI Data Date: <strong className="text-emerald-700 dark:text-emerald-400 font-semibold">{meta.reportDate}</strong>)
              </span>
            )}
          </span>
        </div>
        <span className="text-slate-500 dark:text-slate-400 text-[11px] hidden sm:inline">
          All fund NAV values and returns in this table are calculated as of this date
        </span>
      </div>

      {/* Main Fund Table */}
      <div className="bg-white dark:bg-[#0B1936] rounded-2xl border border-slate-200 dark:border-slate-800/90 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50/90 dark:bg-slate-900/90 text-slate-600 dark:text-slate-400 uppercase font-semibold border-b border-slate-200 dark:border-slate-800/80 tracking-wider text-[11px]">
              <tr>
                {/* Select All Checkboxes Header (Blue: Custom List, Orange: Suggestion Sheet) */}
                <th className="p-3.5 w-24 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={() => onToggleSelectAllPage && onToggleSelectAllPage(sortedFunds)}
                      title="Select all on this page for Custom Fund List (Blue)"
                      className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
                    />
                    <input
                      type="checkbox"
                      checked={allSuggestionSelected}
                      onChange={() => onToggleSelectAllSuggestionPage && onToggleSelectAllSuggestionPage(sortedFunds)}
                      title="Select all on this page for Suggestion Sheet (Orange)"
                      className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-amber-500 focus:ring-amber-500 cursor-pointer accent-amber-500"
                    />
                  </div>
                  <div className="flex items-center justify-center gap-2 text-[9px] text-slate-500 dark:text-slate-400 mt-1 font-mono select-none">
                    <span className="text-blue-600 dark:text-blue-400 font-bold" title="Custom Fund List">Custom</span>
                    <span className="text-[#CD9B30] dark:text-amber-400 font-bold" title="Suggestion Sheet">Suggest</span>
                  </div>
                </th>

                <th 
                  onClick={() => handleSort('displayName')} 
                  className="p-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors group select-none min-w-[220px]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Scheme Name</span>
                    {renderSortIcon('displayName')}
                  </div>
                </th>

                <th 
                  onClick={() => handleSort('category')} 
                  className="p-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors group select-none min-w-[130px]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Category</span>
                    {renderSortIcon('category')}
                  </div>
                </th>

                {/* NAV Column(s) */}
                {selectedPlan === 'both' ? (
                  <>
                    <th 
                      onClick={() => handleSort('regNav')} 
                      className="p-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors group select-none min-w-[95px]"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>NAV (Reg)</span>
                        {renderSortIcon('regNav')}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('dirNav')} 
                      className="p-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors group select-none min-w-[95px]"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>NAV (Dir)</span>
                        {renderSortIcon('dirNav')}
                      </div>
                    </th>
                  </>
                ) : (
                  <th 
                    onClick={() => handleSort('currentNav')} 
                    className="p-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors group select-none min-w-[100px]"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Current NAV</span>
                      {renderSortIcon('currentNav')}
                    </div>
                  </th>
                )}

                {/* Conditional Dynamic Headers: Yearly vs Day Calculation */}
                {mode === 'yearly' ? (
                  selectedPlan === 'both' ? (
                    <>
                      <th onClick={() => handleSort('regReturn1Yr')} className="p-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors group select-none min-w-[85px] text-center">
                        <div className="flex items-center justify-center gap-1"><span>1Y Reg</span>{renderSortIcon('regReturn1Yr')}</div>
                      </th>
                      <th onClick={() => handleSort('dirReturn1Yr')} className="p-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors group select-none min-w-[85px] text-center">
                        <div className="flex items-center justify-center gap-1"><span>1Y Dir</span>{renderSortIcon('dirReturn1Yr')}</div>
                      </th>
                      <th onClick={() => handleSort('regReturn2Yr')} className="p-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors group select-none min-w-[85px] text-center">
                        <div className="flex items-center justify-center gap-1"><span>2Y Reg</span>{renderSortIcon('regReturn2Yr')}</div>
                      </th>
                      <th onClick={() => handleSort('dirReturn2Yr')} className="p-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors group select-none min-w-[85px] text-center">
                        <div className="flex items-center justify-center gap-1"><span>2Y Dir</span>{renderSortIcon('dirReturn2Yr')}</div>
                      </th>
                      <th onClick={() => handleSort('regReturn3Yr')} className="p-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors group select-none min-w-[85px] text-center">
                        <div className="flex items-center justify-center gap-1"><span>3Y Reg</span>{renderSortIcon('regReturn3Yr')}</div>
                      </th>
                      <th onClick={() => handleSort('dirReturn3Yr')} className="p-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors group select-none min-w-[85px] text-center">
                        <div className="flex items-center justify-center gap-1"><span>3Y Dir</span>{renderSortIcon('dirReturn3Yr')}</div>
                      </th>
                      <th onClick={() => handleSort('regReturn5Yr')} className="p-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors group select-none min-w-[85px] text-center">
                        <div className="flex items-center justify-center gap-1"><span>5Y Reg</span>{renderSortIcon('regReturn5Yr')}</div>
                      </th>
                      <th onClick={() => handleSort('dirReturn5Yr')} className="p-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors group select-none min-w-[85px] text-center">
                        <div className="flex items-center justify-center gap-1"><span>5Y Dir</span>{renderSortIcon('dirReturn5Yr')}</div>
                      </th>
                      <th onClick={() => handleSort('regReturn10Yr')} className="p-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors group select-none min-w-[85px] text-center">
                        <div className="flex items-center justify-center gap-1"><span>10Y Reg</span>{renderSortIcon('regReturn10Yr')}</div>
                      </th>
                      <th onClick={() => handleSort('dirReturn10Yr')} className="p-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors group select-none min-w-[85px] text-center">
                        <div className="flex items-center justify-center gap-1"><span>10Y Dir</span>{renderSortIcon('dirReturn10Yr')}</div>
                      </th>
                    </>
                  ) : (
                    <>
                      <th 
                        onClick={() => handleSort('return1Yr')} 
                        className="p-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors group select-none min-w-[90px]"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>1 Yr (%)</span>
                          {renderSortIcon('return1Yr')}
                        </div>
                      </th>

                      <th 
                        onClick={() => handleSort('return2Yr')} 
                        className="p-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors group select-none min-w-[90px]"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>2 Yr (%)</span>
                          {renderSortIcon('return2Yr')}
                        </div>
                      </th>

                      <th 
                        onClick={() => handleSort('return3Yr')} 
                        className="p-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors group select-none min-w-[90px]"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>3 Yr (%)</span>
                          {renderSortIcon('return3Yr')}
                        </div>
                      </th>

                      <th 
                        onClick={() => handleSort('return5Yr')} 
                        className="p-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors group select-none min-w-[90px]"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>5 Yr (%)</span>
                          {renderSortIcon('return5Yr')}
                        </div>
                      </th>

                      <th 
                        onClick={() => handleSort('return10Yr')} 
                        className="p-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors group select-none min-w-[90px]"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>10 Yr (%)</span>
                          {renderSortIcon('return10Yr')}
                        </div>
                      </th>
                    </>
                  )
                ) : (
                  customDaysList.map((d) => {
                    const sortKey = `return_${d}d`;
                    return selectedPlan === 'both' ? (
                      <React.Fragment key={d}>
                        <th 
                          onClick={() => handleSort(`reg_return_${d}d`)} 
                          className="p-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors group select-none min-w-[90px] text-center"
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span>{d}D Reg</span>
                            {renderSortIcon(`reg_return_${d}d`)}
                          </div>
                        </th>
                        <th 
                          onClick={() => handleSort(`dir_return_${d}d`)} 
                          className="p-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors group select-none min-w-[90px] text-center"
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span>{d}D Dir</span>
                            {renderSortIcon(`dir_return_${d}d`)}
                          </div>
                        </th>
                      </React.Fragment>
                    ) : (
                      <th 
                        key={d}
                        onClick={() => handleSort(sortKey)} 
                        className="p-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors group select-none min-w-[95px] text-center"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <span>{d} Days (%)</span>
                          {renderSortIcon(sortKey)}
                        </div>
                      </th>
                    );
                  })
                )}

                <th 
                  onClick={() => handleSort('dailyAUMRaw')} 
                  className="p-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors group select-none min-w-[110px]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>AUM</span>
                    {renderSortIcon('dailyAUMRaw')}
                  </div>
                </th>

                <th className="p-3.5 min-w-[120px]">Riskometer</th>
                <th className="p-3.5 text-right">Details</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/60 font-sans">
              {isLoading ? (
                <tr>
                  <td colSpan={7 + (selectedPlan === 'both' ? 1 : 0) + (selectedPlan === 'both' ? (mode === 'yearly' ? 10 : customDaysList.length * 2) : (mode === 'yearly' ? 5 : customDaysList.length))} className="py-24 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="snazzy-spinner mx-auto"></div>
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-300 tracking-wide">Fetching fund data...</p>
                    </div>
                  </td>
                </tr>
              ) : sortedFunds.length === 0 ? (
                <tr>
                  <td colSpan={7 + (selectedPlan === 'both' ? 1 : 0) + (selectedPlan === 'both' ? (mode === 'yearly' ? 10 : customDaysList.length * 2) : (mode === 'yearly' ? 5 : customDaysList.length))} className="p-12 text-center text-slate-500 dark:text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <AlertCircle className="h-8 w-8 text-slate-400 dark:text-slate-500" />
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No funds found</p>
                      <p className="text-xs text-slate-500 max-w-sm">
                        Try changing your search or filters.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                sortedFunds.map((fund) => {
                  const isCustomChecked = selectedFundIds.has(fund.id);
                  const isSuggestionChecked = suggestionFundIds.has(fund.id);

                  return (
                    <tr 
                      key={fund.id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors duration-150 group ${
                        isCustomChecked && isSuggestionChecked
                          ? 'bg-indigo-50/70 dark:bg-indigo-500/10 border-l-2 border-l-indigo-600 dark:border-l-indigo-400'
                          : isCustomChecked
                          ? 'bg-blue-50/70 dark:bg-blue-500/10 border-l-2 border-l-blue-600 dark:border-l-blue-500'
                          : isSuggestionChecked
                          ? 'bg-amber-50/70 dark:bg-amber-500/10 border-l-2 border-l-amber-600 dark:border-l-amber-500'
                          : ''
                      }`}
                    >
                      {/* Dual Checkboxes Column: Blue for Custom, Orange for Suggestion */}
                      <td 
                        className="p-3.5 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isCustomChecked}
                            onChange={() => onToggleSelectFund && onToggleSelectFund(fund.id)}
                            title="Add to Custom Fund List (Blue)"
                            className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
                          />
                          <input
                            type="checkbox"
                            checked={isSuggestionChecked}
                            onChange={() => onToggleSuggestionFund && onToggleSuggestionFund(fund.id)}
                            title="Add to Suggestion Sheet (Orange)"
                            className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-amber-500 focus:ring-amber-500 cursor-pointer accent-amber-500"
                          />
                        </div>
                      </td>

                      {/* Fund Name */}
                      <td 
                        className="p-3.5 cursor-pointer select-text"
                        onClick={() => {
                          const sel = window.getSelection();
                          if (sel && sel.toString().trim().length > 0) return;
                          if (onSelectFund) onSelectFund(fund);
                        }}
                        title="Click to view fund details"
                      >
                        <div className="font-bold text-slate-900 dark:text-white group-hover:text-[#061C41] dark:group-hover:text-brand-300 transition-colors select-text">
                          {fund.displayName}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 select-text">
                          {fund.amcName}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="p-3.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {fund.category}
                        </span>
                      </td>

                      {/* NAV Column(s) */}
                      {selectedPlan === 'both' ? (
                        <>
                          <td className="p-3.5 whitespace-nowrap font-mono text-[11px] text-slate-800 dark:text-slate-200">
                            {formatNav(fund.regNav ?? fund.currentNav)}
                          </td>
                          <td className="p-3.5 whitespace-nowrap font-mono text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold">
                            {formatNav(fund.dirNav ?? fund.currentNav)}
                          </td>
                        </>
                      ) : (
                        <td className="p-3.5 whitespace-nowrap font-mono text-[11px] text-slate-800 dark:text-slate-200">
                          {formatNav(fund.currentNav)}
                        </td>
                      )}

                      {/* Dynamic Return Columns depending on mode */}
                      {mode === 'yearly' ? (
                        selectedPlan === 'both' ? (
                          <>
                            <td className="p-3.5 whitespace-nowrap font-mono text-[11px] text-center">{formatPct(fund.regReturn1Yr ?? fund.return1Yr)}</td>
                            <td className="p-3.5 whitespace-nowrap font-mono text-[11px] text-center">{formatPct(fund.dirReturn1Yr ?? fund.return1Yr)}</td>
                            <td className="p-3.5 whitespace-nowrap font-mono text-[11px] text-center">{formatPct(fund.regReturn2Yr ?? fund.return2Yr)}</td>
                            <td className="p-3.5 whitespace-nowrap font-mono text-[11px] text-center">{formatPct(fund.dirReturn2Yr ?? fund.return2Yr)}</td>
                            <td className="p-3.5 whitespace-nowrap font-mono text-[11px] text-center">{formatPct(fund.regReturn3Yr ?? fund.return3Yr)}</td>
                            <td className="p-3.5 whitespace-nowrap font-mono text-[11px] text-center">{formatPct(fund.dirReturn3Yr ?? fund.return3Yr)}</td>
                            <td className="p-3.5 whitespace-nowrap font-mono text-[11px] text-center">{formatPct(fund.regReturn5Yr ?? fund.return5Yr)}</td>
                            <td className="p-3.5 whitespace-nowrap font-mono text-[11px] text-center">{formatPct(fund.dirReturn5Yr ?? fund.return5Yr)}</td>
                            <td className="p-3.5 whitespace-nowrap font-mono text-[11px] text-center">{formatPct(fund.regReturn10Yr ?? fund.return10Yr)}</td>
                            <td className="p-3.5 whitespace-nowrap font-mono text-[11px] text-center">{formatPct(fund.dirReturn10Yr ?? fund.return10Yr)}</td>
                          </>
                        ) : (
                          <>
                            <td className="p-3.5 whitespace-nowrap font-mono text-[11px]">
                              {formatPct(fund.return1Yr)}
                            </td>

                            <td className="p-3.5 whitespace-nowrap font-mono text-[11px]">
                              {formatPct(fund.return2Yr)}
                            </td>

                            <td className="p-3.5 whitespace-nowrap font-mono text-[11px]">
                              {formatPct(fund.return3Yr)}
                            </td>

                            <td className="p-3.5 whitespace-nowrap font-mono text-[11px]">
                              {formatPct(fund.return5Yr)}
                            </td>

                            <td className="p-3.5 whitespace-nowrap font-mono text-[11px]">
                              {formatPct(fund.return10Yr)}
                            </td>
                          </>
                        )
                      ) : (
                        customDaysList.map((d) => {
                          if (selectedPlan === 'both') {
                            const regVal = fund.regDayReturns ? fund.regDayReturns[d] : fund[`reg_return_${d}d`];
                            const dirVal = fund.dirDayReturns ? fund.dirDayReturns[d] : fund[`dir_return_${d}d`];
                            return (
                              <React.Fragment key={d}>
                                <td className="p-3.5 whitespace-nowrap font-mono text-[11px] text-center">{formatPct(regVal)}</td>
                                <td className="p-3.5 whitespace-nowrap font-mono text-[11px] text-center">{formatPct(dirVal)}</td>
                              </React.Fragment>
                            );
                          }
                          const val = fund.dayReturns ? fund.dayReturns[d] : fund[`return_${d}d`];
                          return (
                            <td key={d} className="p-3.5 whitespace-nowrap font-mono text-[11px] text-center">
                              {formatPct(val)}
                            </td>
                          );
                        })
                      )}

                      {/* AUM */}
                      <td className="p-3.5 whitespace-nowrap font-semibold text-slate-800 dark:text-slate-200">
                        {fund.dailyAUMFormatted}
                      </td>

                      {/* Riskometer */}
                      <td className="p-3.5 whitespace-nowrap">
                        {getRiskometerBadge(fund.riskometerScheme)}
                      </td>

                      {/* Details Trigger */}
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectFund(fund);
                          }}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-[#061C41] text-slate-600 hover:text-white dark:bg-slate-800 dark:hover:bg-brand-600 dark:text-slate-300 dark:hover:text-white transition-all shadow-sm"
                          title="View detailed performance"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-900/90 border-t border-slate-200 dark:border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Page <span className="font-bold text-slate-900 dark:text-white">{page}</span> of <span className="font-bold text-slate-900 dark:text-white">{totalPages}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Previous</span>
              </button>

              <button
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                <span>Next</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FundTable;
