'use client';

import React from 'react';
import { Calendar, History } from 'lucide-react';
import { NavTab, useVocu } from '@/context/VocuContext';

const NAV_ITEMS: Array<{
  id: NavTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'home', label: '今天', icon: Calendar },
  { id: 'history', label: '記錄', icon: History },
];

export function Sidebar() {
  const { activeTab, setActiveTab, words } = useVocu();

  const weaknessCount = React.useMemo(
    () => words.filter((w) => w.wrongCount > 0 && w.consecutiveCorrect < 2).length,
    [words]
  );

  return (
    <header className="w-full bg-[#000000]/90 backdrop-blur-md border-b border-white/10 px-4 py-3 select-none sticky top-0 z-30">
      <div className="max-w-[850px] mx-auto flex items-center justify-center gap-3 sm:gap-6">
        {/* Brand Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#7CE3B3] text-[#000000] flex items-center justify-center font-bold text-base tracking-tight">
            V
          </div>
          <span className="text-lg font-bold tracking-tight text-white">Vocu</span>
        </div>

        {/* Centered Top Navigation Pills */}
        <nav className="inline-flex items-center gap-1.5 p-1 rounded-full bg-[#000000] border border-white/10">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isSelected = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-tab-${item.id}`}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#7CE3B3] text-[#000000] font-semibold shadow-sm'
                    : 'text-zinc-300 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
