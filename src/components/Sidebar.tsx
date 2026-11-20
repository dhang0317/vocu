'use client';

import React from 'react';
import { Calendar, BookMarked, History, User, Sparkles, Terminal } from 'lucide-react';
import { NavTab, useVocu } from '@/context/VocuContext';
import { analyzeWordPriority } from '@/lib/quizEngine';

const NAV_ITEMS: Array<{
  id: NavTab;
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'home', label: '今天', sublabel: 'Home', icon: Calendar },
  { id: 'history', label: '記錄', sublabel: 'History', icon: History },
];

export function Sidebar() {
  const { activeTab, setActiveTab, words, practiceLogs, settings } = useVocu();

  const weaknessCount = words.filter(
    (w) => analyzeWordPriority(w, practiceLogs, settings.cooldownThreshold).status === 'weakness'
  ).length;

  return (
    <>
      {/* Desktop Fixed Left Sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-64 md:fixed md:inset-y-0 md:left-0 bg-[#161B18] border-r border-white/10 px-4 py-6 select-none z-30">
        {/* Brand Logo */}
        <div className="flex items-center justify-between px-3 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#7CE3B3] text-[#0D110F] flex items-center justify-center font-bold text-xl tracking-tight shadow-sm">
              V
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-white">Vocu</span>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="space-y-1.5 flex-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isSelected = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-tab-${item.id}`}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-full text-sm font-medium transition-all duration-150 cursor-pointer ${
                  isSelected
                    ? 'bg-[#7CE3B3] text-[#0D110F] font-semibold shadow-sm'
                    : 'text-zinc-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${isSelected ? 'text-[#0D110F]' : 'text-zinc-400'}`} />
                  <span>{item.label}</span>
                  <span
                    className={`text-xs ${
                      isSelected ? 'text-[#0D110F]/70 font-medium' : 'text-zinc-500'
                    }`}
                  >
                    {item.sublabel}
                  </span>
                </div>

                {item.id === 'history' && weaknessCount > 0 && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      isSelected
                        ? 'bg-[#0D110F]/15 text-[#0D110F]'
                        : 'bg-[#F472B6]/20 text-[#F472B6]'
                    }`}
                  >
                    {weaknessCount} 弱點
                  </span>
                )}
              </button>
            );
          })}
        </nav>

      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-[#161B18]/95 backdrop-blur-md border-t border-white/10 px-3 py-2 flex items-center justify-around z-30">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isSelected = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium transition-all ${
                isSelected
                  ? 'bg-[#7CE3B3] text-[#0D110F] font-semibold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
