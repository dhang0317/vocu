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
    <div className="min-h-screen bg-[#0D110F] text-zinc-100 flex">
      {/* Left Fixed Sidebar */}
      <Sidebar />

      {/* Right Main Content Area (Centered max-width ~850px) */}
      <main className="flex-1 md:pl-64">
        <div className="max-w-[850px] mx-auto px-4 sm:px-8 pt-7 pb-16">
          {activeTab === 'home' && <HomeTab />}
          {activeTab === 'vocab' && <VocabTab />}
          {activeTab === 'history' && <HistoryTab />}
          {activeTab === 'profile' && <ProfileTab />}
        </div>
      </main>

      {/* Full-Screen / Overlay Quiz Session Modal */}
      <QuizModal />
    </div>
  );
}

export function VocuApp() {
  return (
    <VocuProvider>
      <VocuShell />
    </VocuProvider>
  );
}
