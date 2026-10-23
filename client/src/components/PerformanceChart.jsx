import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

const safeNum = (val) => {
  if (val === null || val === undefined || val === '' || isNaN(val) || typeof val === 'boolean') return null;
  const num = Number(val);
  return isFinite(num) ? num : null;
};

const PerformanceChart = ({ fund }) => {
  if (!fund) return null;

  const getReg = (yr) => safeNum(fund[`return${yr}YearRegular`] ?? fund[`regReturn${yr}Yr`] ?? (fund.planUsed !== 'Direct' ? fund[`return${yr}Yr`] : null));
  const getDir = (yr) => safeNum(fund[`return${yr}YearDirect`] ?? fund[`dirReturn${yr}Yr`] ?? (fund.planUsed === 'Direct' ? fund[`return${yr}Yr`] : null));
  const getBmk = (yr) => safeNum(fund[`return${yr}YearBenchmark`] ?? fund[`benchmarkReturn${yr}Yr`] ?? null);

  // Prepare comparison data points for available return periods
  const periods = [
    { period: '1Y Return', regular: getReg(1), direct: getDir(1), benchmark: getBmk(1) },
    { period: '3Y Return', regular: getReg(3), direct: getDir(3), benchmark: getBmk(3) },
    { period: '5Y Return', regular: getReg(5), direct: getDir(5), benchmark: getBmk(5) },
    { period: '10Y Return', regular: getReg(10), direct: getDir(10), benchmark: getBmk(10) },
    { 
      period: 'Since Launch', 
      regular: safeNum(fund.returnSinceLaunchRegular ?? fund.regReturnSinceLaunch ?? fund.returnSinceLaunch), 
      direct: safeNum(fund.returnSinceLaunchDirect ?? fund.dirReturnSinceLaunch ?? (fund.planUsed === 'Direct' ? fund.returnSinceLaunch : null)), 
      benchmark: safeNum(fund.returnSinceLaunchBenchmarkRegular ?? fund.benchmarkReturnSinceLaunch) 
    }
  ];

  // Filter out periods where all 3 are null and ensure toFixed is only called on valid numbers
  const chartData = periods
    .map(p => ({
      period: p.period,
      'Regular Plan (%)': p.regular !== null ? Number(p.regular.toFixed(2)) : null,
      'Direct Plan (%)': p.direct !== null ? Number(p.direct.toFixed(2)) : null,
      'Benchmark (%)': p.benchmark !== null ? Number(p.benchmark.toFixed(2)) : null
    }))
    .filter(p => p['Regular Plan (%)'] !== null || p['Direct Plan (%)'] !== null || p['Benchmark (%)'] !== null);

  if (chartData.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm italic border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900/50">
        No return data available for performance charting.
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-[#0B1936] p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xl text-xs space-y-1.5 min-w-[160px]">
          <p className="font-bold text-slate-900 dark:text-slate-200 border-b border-slate-100 dark:border-slate-700/80 pb-1">{label}</p>
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5" style={{ color: entry.color }}>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></span>
                {entry.name}:
              </span>
              <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                {entry.value !== null && entry.value !== undefined ? `${entry.value}%` : 'N/A'}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-200">Annualized Returns Comparison (%)</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">Regular Plan vs Direct Plan vs Benchmark ({fund.benchmark})</p>
        </div>
      </div>

      <div className="h-64 sm:h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
            <XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: 12 }} />
            <YAxis stroke="#64748b" tick={{ fontSize: 12 }} unit="%" />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ paddingTop: 10, fontSize: 12 }} />
            <Bar dataKey="Regular Plan (%)" fill="#061C41" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Direct Plan (%)" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Benchmark (%)" fill="#CD9B30" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default PerformanceChart;
