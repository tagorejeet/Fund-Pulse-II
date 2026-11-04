import React from 'react';
import { ChevronDown, Layers } from 'lucide-react';

const DEFAULT_CATEGORIES = [
  { id: 'all', name: 'All Schemes' },
  { id: 'large-cap', name: 'Large Cap' },
  { id: 'mid-cap', name: 'Mid Cap' },
  { id: 'large-mid-cap', name: 'Large & Mid Cap' },
  { id: 'small-cap', name: 'Small Cap' },
  { id: 'multi-cap', name: 'Multi Cap' },
  { id: 'value', name: 'Value' },
  { id: 'flexi-cap', name: 'Flexi Cap' },
  { id: 'sectoral-thematic', name: 'Sectoral / Thematic' },
  { id: 'elss', name: 'ELSS' },
  { id: 'contra', name: 'Contra' },
  { id: 'dividend-yield', name: 'Dividend Yield' },
  { id: 'focused', name: 'Focused' },
  { id: 'index-funds', name: 'Index Funds' },
  { id: 'hybrid', name: 'Hybrid' },
  { id: 'debt-liquid', name: 'Debt / Liquid' }
];

const DEFAULT_DEBT_SUBCATEGORIES = [
  { id: 'all', name: 'All Sub Categories' },
  { id: 'short-term', name: 'Short Term' },
  { id: 'liquid', name: 'Liquid' },
  { id: 'overnight', name: 'Overnight' },
  { id: 'money-market', name: 'Money Market' },
  { id: 'ultra-short-term', name: 'Ultra Short Term Fund' },
  { id: 'low-duration', name: 'Ultra Short to Short Term (Low Duration)' },
  { id: 'medium-term', name: 'Medium Term' },
  { id: 'medium-to-long-term', name: 'Medium to Long Term' },
  { id: 'long-term', name: 'Long Term' },
  { id: 'corporate-bond', name: 'Corporate Bond' },
  { id: 'credit-risk', name: 'Credit Risk' },
  { id: 'banking-psu', name: 'Banking & PSU' },
  { id: 'gilt', name: 'Gilt' },
  { id: 'floater', name: 'Floater / Floating Rate' },
  { id: 'dynamic-bond', name: 'Dynamic Bond' },
  { id: '10-year-gilt', name: '10 Year Gilt' }
];

const CategoryFilter = ({
  activeCategory,
  onSelectCategory,
  categoriesList = [],
  categoryCounts = {},
  totalSchemesCount = 0,
  activeDebtSubCategory = 'all',
  onSelectDebtSubCategory,
  debtSubCategories = []
}) => {
  const displayList = categoriesList && categoriesList.length > 0
    ? [{ id: 'all', name: 'All Schemes', count: totalSchemesCount }, ...categoriesList]
    : DEFAULT_CATEGORIES;

  const isDebtActive = activeCategory === 'Debt / Liquid' || activeCategory === 'debt-liquid';

  const subCategoriesList = React.useMemo(() => {
    if (debtSubCategories && debtSubCategories.length > 0) {
      return debtSubCategories;
    }
    return DEFAULT_DEBT_SUBCATEGORIES;
  }, [debtSubCategories]);

  return (
    <div className="w-full space-y-2.5">
      {/* Category Pills Navigation */}
      <div className="w-full overflow-x-auto pb-1 scrollbar-none">
        <div className="flex items-center gap-2 min-w-max">
          {displayList.map(cat => {
            const isSelected = activeCategory === cat.name || (activeCategory === 'all' && cat.id === 'all');
            const count = cat.count !== undefined 
              ? cat.count 
              : (categoryCounts[cat.name] || (cat.id === 'all' ? totalSchemesCount : 0));

            return (
              <button
                key={cat.id}
                onClick={() => onSelectCategory(cat.id === 'all' ? 'all' : cat.name)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 border ${
                  isSelected
                    ? 'bg-[#061C41] dark:bg-[#132B55] text-white border-[#061C41] dark:border-blue-400/40 shadow-sm scale-[1.01]'
                    : 'bg-white dark:bg-[#0B1936] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-800 shadow-sm'
                }`}
              >
                <span>{cat.name}</span>
                {count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* AMFI Official Debt Sub Category Selector (Visible when Debt / Liquid is active) */}
      {isDebtActive && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B1936] border border-slate-200 dark:border-slate-800 shadow-sm transition-all animate-fade-in">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
            <Layers className="w-4 h-4 text-brand-600 dark:text-blue-400" />
            <span>Sub Category:</span>
          </div>

          <div className="relative min-w-[280px]">
            <select
              value={activeDebtSubCategory}
              onChange={(e) => onSelectDebtSubCategory && onSelectDebtSubCategory(e.target.value)}
              className="w-full appearance-none pl-3.5 pr-9 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-[#132B55] text-slate-800 dark:text-white border border-slate-300 dark:border-blue-400/40 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
            >
              {subCategoriesList.map(sub => (
                <option key={sub.id} value={sub.id}>
                  {sub.name} {sub.count !== undefined && sub.count > 0 ? `(${sub.count})` : ''}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-500 dark:text-slate-400">
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>

          {activeDebtSubCategory !== 'all' && (
            <button
              onClick={() => onSelectDebtSubCategory && onSelectDebtSubCategory('all')}
              className="px-2.5 py-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-md transition-colors"
            >
              Clear Sub Category Filter
            </button>
          )}

          <div className="ml-auto text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
            Showing official SEBI/AMFI debt duration & asset class categorisation
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoryFilter;
