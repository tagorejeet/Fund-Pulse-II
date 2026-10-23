import React from 'react';
import { Activity, RefreshCw, Sun, Moon, CheckSquare, Layers, Calendar, TrendingUp, Calculator, Sparkles } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import StatusBadge from './StatusBadge';

const Header = ({
  onRefresh,
  isRefreshing,
  meta,
  appMode = 'analysis', // 'analysis' | 'sip'
  onSelectAppMode,
  activeTab = 'all',
  onSelectTab,
  mode = 'yearly',
  onSelectMode,
  selectedPlan = 'regular',
  onSelectPlan,
  selectedCount = 0,
  suggestionCount = 0,
  nseSelectedCount = 0,
  calculationDate = '',
  onSelectCalculationDate,
  sipActiveTab = 'calculator',
  onSelectSipTab,
  sipCustomCount = 0
}) => {
  const { theme, toggleTheme } = useTheme();
  const todayStr = React.useMemo(() => new Date().toISOString().split('T')[0], []);

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 dark:bg-[#08152e]/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800/80 shadow-sm transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 space-y-3">
        
        {/* Top Row: Brand, Primary App Switch & System Actions */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          {/* Logo & Brand Title */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center p-1.5 rounded-xl bg-white dark:bg-white/95 border border-slate-200/80 dark:border-white/20 shadow-sm shrink-0">
              <img 
                src="/snazzy-logo.webp" 
                alt="Snazzy Wealth" 
                className="h-8 w-auto max-w-[90px] object-contain"
                onError={(e) => {
                  // Fallback in case image asset is missing
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
            <div>
              <span className="block text-[10px] font-bold tracking-[0.22em] uppercase text-[#CD9B30] dark:text-[#E0AD3B] leading-tight font-sans">
                SNAZZY WEALTH
              </span>
              <h1 className="text-xl font-bold tracking-tight text-[#061C41] dark:text-white font-sans leading-tight mt-0.5 flex items-center gap-1.5">
                <span>FundLens</span>
                <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  Analytics
                </span>
              </h1>
            </div>
          </div>

          {/* Top-Level Mode Switch: [ Fund Analysis ] [ SIP Calculator ] */}
          <div className="flex items-center justify-center">
            <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-900/90 rounded-xl border border-slate-200 dark:border-slate-800 shadow-inner">
              <button
                onClick={() => onSelectAppMode('analysis')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  appMode === 'analysis'
                    ? 'bg-[#061C41] dark:bg-[#0A295F] text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                }`}
              >
                <TrendingUp className="h-4 w-4" />
                <span>Fund Analysis</span>
              </button>

              <button
                onClick={() => onSelectAppMode('sip')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  appMode === 'sip'
                    ? 'bg-[#891228] hover:bg-[#700E20] dark:bg-[#A82038] text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                }`}
              >
                <Calculator className="h-4 w-4" />
                <span>SIP Calculator</span>
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[9px] bg-white/20 text-white font-extrabold border border-white/30">
                  XIRR
                </span>
              </button>
            </div>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            {meta && (
              <StatusBadge 
                isCached={meta.isCached}
                lastUpdated={meta.lastUpdated}
                reportDate={meta.reportDate}
              />
            )}

            <div className="flex items-center gap-2 ml-auto md:ml-0">
              {/* Refresh Button */}
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                title="Force refresh AMFI data"
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700/80 transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-[#891228] dark:text-[#CD9B30]' : 'text-slate-500 dark:text-slate-400'}`} />
                <span>{isRefreshing ? 'Updating...' : 'Refresh'}</span>
              </button>

              {/* Light / Dark Mode Toggle */}
              <button
                onClick={toggleTheme}
                title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
                className="p-2 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/80 transition-all duration-200 active:scale-95 shadow-sm"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? (
                  <Sun className="h-4 w-4 text-amber-400" />
                ) : (
                  <Moon className="h-4 w-4 text-[#061C41]" />
                )}
              </button>
            </div>
          </div>

        </div>

        {/* Bottom Navigation & Controls Row (Only active during Fund Analysis) */}
        {appMode === 'analysis' && (
          <div className="flex flex-col xl:flex-row items-center justify-between gap-2.5 pt-2 border-t border-slate-200/80 dark:border-slate-800/60">
            {/* Main Mode Toggle: Yearly Returns vs Day Calculation */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">Analysis:</span>
              <div className="inline-flex items-center gap-0 p-1 bg-slate-100 dark:bg-slate-900/90 rounded-xl border border-slate-200/80 dark:border-slate-800">
                <button
                  onClick={() => onSelectMode('yearly')}
                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all duration-150 ${
                    mode === 'yearly'
                      ? 'bg-white dark:bg-[#061C41] text-[#061C41] dark:text-white shadow-sm border border-slate-200/80 dark:border-white/10 ring-1 ring-black/5 dark:ring-white/5'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <TrendingUp className={`h-3.5 w-3.5 shrink-0 transition-colors ${mode === 'yearly' ? 'text-[#891228] dark:text-[#CD9B30]' : 'text-slate-500 dark:text-slate-400'}`} />
                  <span>Yearly Performance</span>
                </button>

                <button
                  onClick={() => onSelectMode('days')}
                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all duration-150 ${
                    mode === 'days'
                      ? 'bg-white dark:bg-[#061C41] text-[#061C41] dark:text-white shadow-sm border border-slate-200/80 dark:border-white/10 ring-1 ring-black/5 dark:ring-white/5'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <Calendar className={`h-3.5 w-3.5 shrink-0 transition-colors ${mode === 'days' ? 'text-[#891228] dark:text-[#CD9B30]' : 'text-slate-500 dark:text-slate-400'}`} />
                  <span>Day Calculation</span>
                </button>
              </div>
            </div>

            {/* View Tabs (All Schemes vs Custom Fund List vs Suggestion Sheet) */}
            <div className="flex items-center gap-2.5 w-full xl:w-auto justify-between xl:justify-end flex-wrap">
              <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-900/90 rounded-xl border border-slate-200/80 dark:border-slate-800 w-full sm:w-auto">
                <button
                  onClick={() => onSelectTab('suggestion')}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 ${
                    activeTab === 'suggestion'
                      ? 'bg-[#CD9B30] text-white shadow-sm ring-1 ring-amber-600/20'
                      : 'text-slate-600 dark:text-slate-400 hover:text-[#CD9B30] dark:hover:text-amber-400 hover:bg-slate-200/60 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Suggestion Sheet</span>
                  <span className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    activeTab === 'suggestion' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-[#CD9B30] dark:text-amber-400 border border-[#CD9B30]/30'
                  }`}>
                    {suggestionCount}
                  </span>
                </button>

                <button
                  onClick={() => onSelectTab('all')}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 ${
                    activeTab === 'all'
                      ? 'bg-white dark:bg-[#061C41] text-[#061C41] dark:text-white shadow-sm border border-slate-200/80 dark:border-white/10 ring-1 ring-black/5 dark:ring-white/5'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <Layers className={`h-3.5 w-3.5 ${activeTab === 'all' ? 'text-[#891228] dark:text-[#CD9B30]' : 'text-slate-500 dark:text-slate-400'}`} />
                  <span>All Schemes</span>
                </button>

                <button
                  onClick={() => onSelectTab('custom')}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 ${
                    activeTab === 'custom'
                      ? 'bg-white dark:bg-[#061C41] text-[#061C41] dark:text-white shadow-sm border border-slate-200/80 dark:border-white/10 ring-1 ring-black/5 dark:ring-white/5'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <CheckSquare className={`h-3.5 w-3.5 ${activeTab === 'custom' ? 'text-[#891228] dark:text-[#CD9B30]' : 'text-slate-500 dark:text-slate-400'}`} />
                  <span>Custom Fund List</span>
                  <span className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    activeTab === 'custom' ? 'bg-[#891228]/10 dark:bg-[#CD9B30]/20 text-[#891228] dark:text-[#CD9B30]' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}>
                    {selectedCount}
                  </span>
                </button>
              </div>

              {/* Calculation / Valuation Date Tab */}
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-[#CD9B30]" />
                  <span>Date:</span>
                </span>
                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900/90 rounded-xl border border-slate-200/80 dark:border-slate-800">
                  <input
                    type="date"
                    value={calculationDate || todayStr}
                    onChange={(e) => onSelectCalculationDate && onSelectCalculationDate(e.target.value)}
                    className="px-2 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-slate-950 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700/80 focus:outline-none focus:border-[#CD9B30]"
                    title="Valuation / Anchor NAV Date"
                  />
                  {calculationDate && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-brand-300 border border-slate-300 dark:border-slate-700/60" title={new Date(calculationDate).toLocaleDateString('en-US', { weekday: 'long' })}>
                      {new Date(calculationDate).toLocaleDateString('en-US', { weekday: 'short' })}
                    </span>
                  )}
                  {calculationDate && calculationDate !== todayStr && (
                    <button
                      type="button"
                      onClick={() => onSelectCalculationDate && onSelectCalculationDate(todayStr)}
                      className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-[#061C41] dark:text-brand-300 border border-slate-300 dark:border-slate-700 transition-all shadow-sm"
                      title="Reset date to Today"
                    >
                      Today
                    </button>
                  )}
                </div>
              </div>

              {/* Regular / Direct / Both Plan Segmented Switch */}
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Plan:</span>
                <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-900/90 rounded-xl border border-slate-200/80 dark:border-slate-800">
                  <button
                    onClick={() => onSelectPlan('regular')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all duration-150 ${
                      selectedPlan === 'regular'
                        ? 'bg-white dark:bg-[#061C41] text-[#061C41] dark:text-white shadow-sm border border-slate-200/80 dark:border-white/10 ring-1 ring-black/5 dark:ring-white/5'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/40 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    Regular
                  </button>

                  <button
                    onClick={() => onSelectPlan('direct')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all duration-150 ${
                      selectedPlan === 'direct'
                        ? 'bg-white dark:bg-[#061C41] text-[#061C41] dark:text-white shadow-sm border border-slate-200/80 dark:border-white/10 ring-1 ring-black/5 dark:ring-white/5'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/40 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    Direct
                  </button>

                  <button
                    onClick={() => onSelectPlan('both')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all duration-150 ${
                      selectedPlan === 'both'
                        ? 'bg-white dark:bg-[#061C41] text-[#061C41] dark:text-white shadow-sm border border-slate-200/80 dark:border-white/10 ring-1 ring-black/5 dark:ring-white/5'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/40 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    Both
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Navigation & Controls Row (Only active during SIP Calculator) */}
        {appMode === 'sip' && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-200/80 dark:border-slate-800/60">
            {/* View Tabs: SIP Calculator vs Custom Fund List */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">View:</span>
              <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-900/90 rounded-xl border border-slate-200/80 dark:border-slate-800 w-full sm:w-auto">
                <button
                  onClick={() => onSelectSipTab && onSelectSipTab('calculator')}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 ${
                    sipActiveTab === 'calculator'
                      ? 'bg-white dark:bg-[#061C41] text-[#061C41] dark:text-white shadow-sm border border-slate-200/80 dark:border-white/10 ring-1 ring-black/5 dark:ring-white/5'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <Calculator className={`h-3.5 w-3.5 ${sipActiveTab === 'calculator' ? 'text-[#891228] dark:text-[#CD9B30]' : 'text-slate-500 dark:text-slate-400'}`} />
                  <span>SIP Calculator</span>
                </button>

                <button
                  onClick={() => onSelectSipTab && onSelectSipTab('custom')}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 ${
                    sipActiveTab === 'custom'
                      ? 'bg-white dark:bg-[#061C41] text-[#061C41] dark:text-white shadow-sm border border-slate-200/80 dark:border-white/10 ring-1 ring-black/5 dark:ring-white/5'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <CheckSquare className={`h-3.5 w-3.5 ${sipActiveTab === 'custom' ? 'text-[#891228] dark:text-[#CD9B30]' : 'text-slate-500 dark:text-slate-400'}`} />
                  <span>Custom Fund List</span>
                  <span className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    sipActiveTab === 'custom' ? 'bg-[#891228]/10 dark:bg-[#CD9B30]/20 text-[#891228] dark:text-[#CD9B30]' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}>
                    {sipCustomCount}
                  </span>
                </button>
              </div>
            </div>

            {/* Quick Summary Info */}
            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span>Plan: <strong className="text-slate-900 dark:text-white capitalize">{selectedPlan}</strong></span>
              <span>•</span>
              <span>Valuation Date: <strong className="text-emerald-700 dark:text-emerald-400 font-mono font-bold">{calculationDate || todayStr}</strong></span>
            </div>
          </div>
        )}

      </div>
    </header>
  );
};

export default Header;
