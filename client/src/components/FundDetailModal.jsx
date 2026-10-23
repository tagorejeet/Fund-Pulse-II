import React from 'react';
import { X, TrendingUp, ShieldAlert, Award, Calendar, DollarSign, BarChart3, Info } from 'lucide-react';
import PerformanceChart from './PerformanceChart';

const FundDetailModal = ({ fund, onClose }) => {
  if (!fund) return null;

  const formatPct = (val) => {
    if (val === null || val === undefined || val === '' || isNaN(val)) return <span className="text-slate-400 dark:text-slate-500 font-sans">N/A</span>;
    const num = Number(val);
    if (!isFinite(num)) return <span className="text-slate-400 dark:text-slate-500 font-sans">N/A</span>;
    const formatted = num.toFixed(2);
    const isPositive = num > 0;
    return (
      <span className={num === 0 ? 'text-slate-500 dark:text-slate-400' : isPositive ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-rose-700 dark:text-rose-400 font-semibold'}>
        {isPositive ? `+${formatted}%` : `${formatted}%`}
      </span>
    );
  };

  const formatNav = (val) => {
    if (val === null || val === undefined || val === '' || isNaN(val)) return 'N/A';
    const num = Number(val);
    if (!isFinite(num)) return 'N/A';
    return `₹${num.toFixed(2)}`;
  };

  const getRiskometerColor = (risk) => {
    if (!risk || risk === 'N/A') return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
    const lower = String(risk).toLowerCase();
    if (lower.includes('very high')) return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30';
    if (lower.includes('high')) return 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/30';
    if (lower.includes('moderate')) return 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30';
    if (lower.includes('low')) return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30';
    return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/30';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
      <div 
        className="relative w-full max-w-4xl bg-white dark:bg-[#0B1936] rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#061C41] flex items-start justify-between gap-4 sticky top-0 z-10 transition-colors">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-snazzy-gold border border-slate-200 dark:border-slate-700">
                {fund.category}
              </span>
              <span className="px-2.5 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {fund.amcName}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold font-serif text-slate-900 dark:text-white tracking-tight">
              {fund.displayName}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
              <span>Official AMFI Scheme Name:</span>
              <span className="text-slate-700 dark:text-slate-300 font-mono">{fund.amfiSchemeName}</span>
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-400 dark:hover:text-white transition-all active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 custom-scrollbar text-slate-800 dark:text-slate-200">
          
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5 text-snazzy-navy dark:text-snazzy-gold" /> NAV (Regular)
              </p>
              <p className="text-lg font-bold text-slate-900 dark:text-white mt-1 font-mono">
                {formatNav(fund.navRegular ?? fund.regNav ?? (fund.planUsed !== 'Direct' ? fund.currentNav : null))}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Prev: {formatNav(fund.preNavRegular)}</p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> NAV (Direct)
              </p>
              <p className="text-lg font-bold text-slate-900 dark:text-white mt-1 font-mono">
                {formatNav(fund.navDirect ?? fund.dirNav ?? (fund.planUsed === 'Direct' ? fund.currentNav : null))}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Prev: {formatNav(fund.preNavDirect)}</p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
                <BarChart3 className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" /> Total AUM
              </p>
              <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                {fund.dailyAUMFormatted || (fund.dailyAUMRaw ? `₹${fund.dailyAUMRaw} Cr` : (fund.aum ? `₹${fund.aum} Cr` : 'N/A'))}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Daily AUM Snapshot</p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" /> NAV Date
              </p>
              <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">{fund.navDate || 'N/A'}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Source: AMFI</p>
            </div>
          </div>

          {/* Scheme & Benchmark Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center gap-2">
                <Award className="h-4 w-4 text-snazzy-navy dark:text-snazzy-gold" />
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Benchmark Index</span>
              </div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">{fund.benchmark}</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Riskometer Classification</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className={`px-2.5 py-1 rounded-lg border font-semibold ${getRiskometerColor(fund.riskometerScheme)}`}>
                  Scheme: {fund.riskometerScheme || 'N/A'}
                </span>
                <span className={`px-2.5 py-1 rounded-lg border font-semibold ${getRiskometerColor(fund.riskometerBenchmark)}`}>
                  Benchmark: {fund.riskometerBenchmark || 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {/* Performance Comparison Chart */}
          <PerformanceChart fund={fund} />

          {/* Detailed Performance Table (Regular vs Direct vs Benchmark) */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Historical Performance Breakdown
            </h4>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100/70 dark:bg-slate-900 text-slate-600 dark:text-slate-400 uppercase font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-3">Period</th>
                    <th className="p-3">Regular Plan</th>
                    <th className="p-3">Direct Plan</th>
                    <th className="p-3">Benchmark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono">
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-850/60 transition-colors">
                    <td className="p-3 font-sans font-semibold text-slate-800 dark:text-slate-300">1 Year CAGR</td>
                    <td className="p-3">{formatPct(fund.return1YearRegular ?? fund.regReturn1Yr ?? (fund.planUsed !== 'Direct' ? fund.return1Yr : null))}</td>
                    <td className="p-3">{formatPct(fund.return1YearDirect ?? fund.dirReturn1Yr ?? (fund.planUsed === 'Direct' ? fund.return1Yr : null))}</td>
                    <td className="p-3">{formatPct(fund.return1YearBenchmark ?? fund.benchmarkReturn1Yr)}</td>
                  </tr>
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-850/60 transition-colors">
                    <td className="p-3 font-sans font-semibold text-slate-800 dark:text-slate-300">3 Year CAGR</td>
                    <td className="p-3">{formatPct(fund.return3YearRegular ?? fund.regReturn3Yr ?? (fund.planUsed !== 'Direct' ? fund.return3Yr : null))}</td>
                    <td className="p-3">{formatPct(fund.return3YearDirect ?? fund.dirReturn3Yr ?? (fund.planUsed === 'Direct' ? fund.return3Yr : null))}</td>
                    <td className="p-3">{formatPct(fund.return3YearBenchmark ?? fund.benchmarkReturn3Yr)}</td>
                  </tr>
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-850/60 transition-colors">
                    <td className="p-3 font-sans font-semibold text-slate-800 dark:text-slate-300">5 Year CAGR</td>
                    <td className="p-3">{formatPct(fund.return5YearRegular ?? fund.regReturn5Yr ?? (fund.planUsed !== 'Direct' ? fund.return5Yr : null))}</td>
                    <td className="p-3">{formatPct(fund.return5YearDirect ?? fund.dirReturn5Yr ?? (fund.planUsed === 'Direct' ? fund.return5Yr : null))}</td>
                    <td className="p-3">{formatPct(fund.return5YearBenchmark ?? fund.benchmarkReturn5Yr)}</td>
                  </tr>
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-850/60 transition-colors">
                    <td className="p-3 font-sans font-semibold text-slate-800 dark:text-slate-300">10 Year CAGR</td>
                    <td className="p-3">{formatPct(fund.return10YearRegular ?? fund.regReturn10Yr ?? (fund.planUsed !== 'Direct' ? fund.return10Yr : null))}</td>
                    <td className="p-3">{formatPct(fund.return10YearDirect ?? fund.dirReturn10Yr ?? (fund.planUsed === 'Direct' ? fund.return10Yr : null))}</td>
                    <td className="p-3">{formatPct(fund.return10YearBenchmark ?? fund.benchmarkReturn10Yr)}</td>
                  </tr>
                  <tr className="bg-slate-50/60 dark:bg-slate-900/30 font-semibold">
                    <td className="p-3 font-sans text-slate-900 dark:text-slate-200">Since Launch</td>
                    <td className="p-3">{formatPct(fund.returnSinceLaunchRegular ?? fund.regReturnSinceLaunch ?? fund.returnSinceLaunch)}</td>
                    <td className="p-3">{formatPct(fund.returnSinceLaunchDirect ?? fund.dirReturnSinceLaunch ?? (fund.planUsed === 'Direct' ? fund.returnSinceLaunch : null))}</td>
                    <td className="p-3">{formatPct(fund.returnSinceLaunchBenchmarkRegular ?? fund.benchmarkReturnSinceLaunch)}</td>
                  </tr>
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-850/60 transition-colors">
                    <td className="p-3 font-sans font-semibold text-slate-600 dark:text-slate-400">6 Month Return</td>
                    <td className="p-3">{formatPct(fund.return6MonthRegular ?? fund.dayReturns?.['180'] ?? fund.return_180d)}</td>
                    <td className="p-3">{formatPct(fund.return6MonthDirect ?? fund.dayReturns?.['180'] ?? fund.return_180d)}</td>
                    <td className="p-3">{formatPct(fund.return6MonthBenchmark)}</td>
                  </tr>
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-850/60 transition-colors">
                    <td className="p-3 font-sans font-semibold text-slate-600 dark:text-slate-400">3 Month Return</td>
                    <td className="p-3">{formatPct(fund.return3MonthRegular ?? fund.dayReturns?.['90'] ?? fund.return_90d)}</td>
                    <td className="p-3">{formatPct(fund.return3MonthDirect ?? fund.dayReturns?.['90'] ?? fund.return_90d)}</td>
                    <td className="p-3">{formatPct(fund.return3MonthBenchmark)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Regulatory Analytical Note */}
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-start gap-2.5 text-[11px] text-slate-500 dark:text-slate-400">
            <Info className="h-4 w-4 text-snazzy-navy dark:text-snazzy-gold shrink-0 mt-0.5" />
            <p>
              Performance metrics shown above are annualized (CAGR) for periods greater than 1 year, and simple absolute returns for periods less than 1 year as reported by AMFI. Past performance is no indicator of future returns.
            </p>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex justify-end transition-colors">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white font-semibold text-xs transition-all active:scale-95"
          >
            Close Window
          </button>
        </div>

      </div>
    </div>
  );
};

export default FundDetailModal;
