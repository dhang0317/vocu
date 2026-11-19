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
  { id: 'vocab', label: '單字', sublabel: 'Vocab', icon: BookMarked },
  { id: 'history', label: '記錄', sublabel: 'History', icon: History },
  { id: 'profile', label: '我', sublabel: 'Profile', icon: User },
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
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-white">Vocu</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#7CE3B3]/15 text-[#7CE3B3] border border-[#7CE3B3]/30">
                  MCP AI
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">動態記憶與語境題庫</p>
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

        {/* Bottom Status Card: Dynamic Engine & MCP Agent Status */}
        <div className="mt-auto pt-4 border-t border-white/10 space-y-3">
          <div className="p-3.5 rounded-2xl bg-[#0D110F] border border-white/10">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-zinc-400 flex items-center gap-1.5 font-medium">
                <Sparkles className="w-3.5 h-3.5 text-[#7CE3B3]" />
                動態出題引擎
              </span>
              <span className="text-[#7CE3B3] font-medium">運作中</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              自動過濾已作答題幹雜湊，優先抽取{' '}
              <span className="text-[#F472B6] font-medium">{weaknessCount} 個弱點字詞</span>
              ，冷卻門檻 {settings.cooldownThreshold} 題。
            </p>
          </div>

          <button
            onClick={() => setActiveTab('profile')}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 text-xs transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2 text-zinc-300">
              <Terminal className="w-3.5 h-3.5 text-[#7CE3B3]" />
              <span className="truncate">MCP Agent 已連線</span>
            </div>
            <span className="w-2 h-2 rounded-full bg-[#7CE3B3]" />
          </button>
        </div>
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
