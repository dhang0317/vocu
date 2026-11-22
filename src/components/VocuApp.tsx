'use client';

import React from 'react';
import { VocuProvider, useVocu } from '@/context/VocuContext';
import { Sidebar } from './Sidebar';
import { HomeTab } from './HomeTab';
import { VocabTab } from './VocabTab';
import { HistoryTab } from './HistoryTab';
import { ProfileTab } from './ProfileTab';
import { QuizModal } from './QuizModal';

function VocuShell() {
  const { activeTab } = useVocu();

  return (
    <div className="min-h-screen bg-[#0D110F] text-zinc-100 flex flex-col">
      {/* Top Centered Navigation Bar */}
      <Sidebar />

      {/* Centered Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-8 py-6">
        <div className="w-full max-w-[850px] mx-auto">
          {activeTab === 'home' && <HomeTab />}
          {activeTab === 'history' && <HistoryTab />}
        </div>
      </main>

      {/* Full-Screen / Overlay Quiz Session Modal */}
      <QuizModal />
    </div>
  );
}

class VocuErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || String(error) };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0D110F] text-zinc-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#161B18] border border-[#F472B6]/40 rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-[#F472B6]">畫面發生錯誤</h2>
            <p className="text-xs font-mono text-zinc-300 break-all bg-[#0D110F] p-3 rounded-xl border border-white/10">
              {this.state.message}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="w-full py-2.5 rounded-xl bg-[#7CE3B3] text-[#0D110F] text-xs font-bold cursor-pointer"
            >
              重新嘗試
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function VocuApp() {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#0D110F] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#7CE3B3] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <VocuErrorBoundary>
      <VocuProvider>
        <VocuShell />
      </VocuProvider>
    </VocuErrorBoundary>
  );
}
