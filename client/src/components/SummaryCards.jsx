import React from 'react';
import { ShieldCheck, Layers } from 'lucide-react';

const SummaryCards = ({ totalFundsCount = 10195 }) => {
  const formattedTotal = (totalFundsCount || 10195).toLocaleString('en-IN');

  const cards = [
    {
      title: 'Tracked Schemes',
      value: `${formattedTotal} Schemes`,
      subtitle: 'Official AMFI Mutual Funds Universe',
      icon: ShieldCheck,
      iconBg: 'bg-[#061C41]/10 text-[#061C41] dark:bg-[#061C41]/40 dark:text-blue-300 ring-1 ring-[#061C41]/15 dark:ring-blue-400/20'
    },
    {
      title: 'Mutual Fund Categories',
      value: 'All Categories',
      subtitle: 'Large, Mid, Small, Multi, Flexi & Sectoral',
      icon: Layers,
      iconBg: 'bg-[#CD9B30]/15 text-[#CD9B30] dark:bg-[#CD9B30]/25 dark:text-amber-400 ring-1 ring-[#CD9B30]/30'
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-6">
      {cards.map((card, idx) => {
        const IconComponent = card.icon;
        return (
          <div 
            key={idx} 
            className="bg-white dark:bg-[#0B1936] p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-200 hover:shadow-md flex flex-col justify-between"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {card.title}
                </p>
                <h3 className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1.5 tracking-tight font-serif sm:font-sans">
                  {card.value}
                </h3>
              </div>
              <div className={`p-3 rounded-xl ${card.iconBg}`}>
                <IconComponent className="h-5 w-5" />
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 font-medium">
              {card.subtitle}
            </p>
          </div>
        );
      })}
    </div>
  );
};

export default SummaryCards;
