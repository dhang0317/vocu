'use client';

import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  XCircle,
  RotateCcw,
  Filter,
  Clock,
  FileText,
  Type,
  Layers,
  Copy,
  Check,
  Terminal,
} from 'lucide-react';
import { useVocu } from '@/context/VocuContext';
import { analyzeWordPriority, formatRelativeTime } from '@/lib/quizEngine';
import { WeightStatusBadge } from './SetIcon';
import { WordWeightStatus } from '@/types/vocu';

export function HistoryTab() {
  const { wordSets, words, practiceLogs, settings, startQuiz } = useVocu();

  const [viewMode, setViewMode] = useState<'timeline' | 'word_weights'>('word_weights');
  const [logFilter, setLogFilter] = useState<'all' | 'wrong_only' | 'high_error'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | WordWeightStatus>('all');
  const [selectedSetFilter, setSelectedSetFilter] = useState<string>('all');
  const [copiedMcp, setCopiedMcp] = useState(false);

  const liveMcpUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/mcp`
      : settings.mcpServerUrl;

  const handleCopyMcp = async () => {
    try {
      await navigator.clipboard.writeText(liveMcpUrl);
    } catch {}
    setCopiedMcp(true);
    setTimeout(() => setCopiedMcp(false), 2000);
  };

  const wordMap = useMemo(() => new Map(words.map((w) => [w.id, w])), [words]);
  const setMap = useMemo(() => new Map(wordSets.map((s) => [s.id, s])), [wordSets]);

  // 計算每個單字目前的系統權重狀態
  const analyzedWords = useMemo(() => {
    return words.map((w) => ({
      word: w,
      analysis: analyzeWordPriority(w, practiceLogs, settings.cooldownThreshold),
      set: setMap.get(w.setId),
    }));
  }, [words, practiceLogs, settings.cooldownThreshold, setMap]);

  const weaknessWordsCount = useMemo(
    () => analyzedWords.filter((item) => item.analysis.status === 'weakness').length,
    [analyzedWords]
  );

  // 過濾作答歷史時間軸
  const filteredLogs = useMemo(() => {
    const sorted = [...practiceLogs].sort(
      (a, b) => new Date(b.answeredAt).getTime() - new Date(a.answeredAt).getTime()
    );

    return sorted.filter((log) => {
      if (selectedSetFilter !== 'all' && log.setId !== selectedSetFilter) return false;
      if (logFilter === 'wrong_only') return !log.isCorrect;
      if (logFilter === 'high_error') {
        const w = wordMap.get(log.wordId);
        return !log.isCorrect || (w ? w.wrongCount >= 2 : false);
      }
      return true;
    });
  }, [practiceLogs, selectedSetFilter, logFilter, wordMap]);

  // 過濾單字權重列表
  const filteredAnalyzedWords = useMemo(() => {
    return analyzedWords
      .filter((item) => {
        if (selectedSetFilter !== 'all' && item.word.setId !== selectedSetFilter) return false;
        if (statusFilter !== 'all' && item.analysis.status !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => a.analysis.priorityTier - b.analysis.priorityTier);
  }, [analyzedWords, selectedSetFilter, statusFilter]);

  const totalAttempts = practiceLogs.length;
  const correctAttempts = practiceLogs.filter((l) => l.isCorrect).length;
  const accuracyRate =
    totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0;

  return (
    <div className="space-y-6 pb-24">
      {/* MCP Server 連線網址 */}
      <div className="bg-[#161B18] border border-[#7CE3B3]/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Terminal className="w-4 h-4 text-[#7CE3B3] shrink-0" />
          <span className="text-xs font-semibold text-zinc-300 shrink-0">MCP 連線網址：</span>
          <code className="text-xs font-mono text-[#7CE3B3] truncate select-all">
            {liveMcpUrl}
          </code>
        </div>
        <button
          onClick={handleCopyMcp}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#7CE3B3] hover:brightness-105 text-[#0D110F] font-bold text-xs transition cursor-pointer shrink-0"
        >
          {copiedMcp ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copiedMcp ? '已複製' : '一鍵複製 URL'}</span>
        </button>
      </div>

      {/* Mode Switcher & Filter Bar */}
      <div className="bg-[#161B18] border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* View Mode Label */}
        <div className="inline-flex p-1 rounded-xl bg-[#0D110F] border border-white/10 self-start">
          <button
            onClick={() => setViewMode('word_weights')}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#7CE3B3] text-[#0D110F] cursor-pointer"
          >
            單字出題狀態標籤 ({words.length})
          </button>
        </div>

        {/* Set Filter & Specific Filter */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedSetFilter}
            onChange={(e) => setSelectedSetFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-[#0D110F] border border-white/10 text-xs text-zinc-200 focus:outline-none focus:border-[#7CE3B3]"
          >
            <option value="all">所有單字集</option>
            {wordSets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 單字列表一覽（無演算法狀態標籤） */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filteredAnalyzedWords.map(({ word, set }) => (
          <div
            key={word.id}
            className="bg-[#161B18] border border-white/10 rounded-2xl p-4 flex flex-col justify-between gap-3"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-white">{word.term}</span>
                  <span className="text-xs font-mono text-zinc-400">{word.pos}</span>
                </div>
              </div>
              <p className="text-xs text-zinc-300">{word.definition}</p>
            </div>

            {set && (
              <div className="pt-3 border-t border-white/10 flex items-center justify-end text-[11px]">
                <span
                  className="inline-flex items-center gap-1 font-medium"
                  style={{ color: set.color }}
                >
                  <Layers className="w-3 h-3" />
                  {set.title}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
