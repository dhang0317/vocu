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

  const [viewMode, setViewMode] = useState<'timeline' | 'word_weights'>('timeline');
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
      {/* Header & Retest Wrong Words Action */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-[#7CE3B3] mb-1">
            LEARNING HISTORY & ADAPTIVE WEIGHTS
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            作答記錄與錯題本
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            所有交卷記錄皆會即時更新單字出題權重，自動排除已做過題幹並優先複習弱點
          </p>
        </div>

        {/* 一鍵針對錯題重新測驗按鈕 */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            id="retest-wrong-letter-btn"
            onClick={() =>
              startQuiz({
                setId: selectedSetFilter,
                questionType: 'letter_hint_cloze',
                onlyWrongWords: true,
                questionCount: 5,
              })
            }
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#7CE3B3] hover:brightness-105 text-[#0D110F] font-bold text-xs shadow-sm transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>針對錯題重新測驗 ({weaknessWordsCount})</span>
          </button>
        </div>
      </header>

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#161B18] border border-white/10 rounded-2xl p-4">
          <span className="text-xs text-zinc-400">累計作答題次</span>
          <div className="text-2xl font-bold text-white mt-1">{totalAttempts} 題</div>
        </div>
        <div className="bg-[#161B18] border border-white/10 rounded-2xl p-4">
          <span className="text-xs text-zinc-400">整體正確率</span>
          <div className="text-2xl font-bold text-[#7CE3B3] mt-1">{accuracyRate}%</div>
        </div>
        <div className="bg-[#161B18] border border-white/10 rounded-2xl p-4">
          <span className="text-xs text-zinc-400">弱點優先字詞</span>
          <div className="text-2xl font-bold text-[#F472B6] mt-1">{weaknessWordsCount} 字</div>
        </div>
        <div className="bg-[#161B18] border border-white/10 rounded-2xl p-4">
          <span className="text-xs text-zinc-400">冷卻中字詞</span>
          <div className="text-2xl font-bold text-[#60A5FA] mt-1">
            {analyzedWords.filter((i) => i.analysis.status === 'cooldown').length} 字
          </div>
        </div>
      </div>

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
        {/* View Mode Tabs */}
        <div className="inline-flex p-1 rounded-xl bg-[#0D110F] border border-white/10 self-start">
          <button
            onClick={() => setViewMode('timeline')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              viewMode === 'timeline'
                ? 'bg-[#7CE3B3] text-[#0D110F]'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            作答歷史時間軸 ({practiceLogs.length})
          </button>
          <button
            onClick={() => setViewMode('word_weights')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              viewMode === 'word_weights'
                ? 'bg-[#7CE3B3] text-[#0D110F]'
                : 'text-zinc-400 hover:text-white'
            }`}
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

          {viewMode === 'timeline' ? (
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#0D110F] border border-white/10">
              <button
                onClick={() => setLogFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                  logFilter === 'all'
                    ? 'bg-white/10 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                全部記錄
              </button>
              <button
                id="filter-wrong-only-btn"
                onClick={() => setLogFilter('wrong_only')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                  logFilter === 'wrong_only'
                    ? 'bg-[#F472B6]/20 text-[#F472B6] font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                只看錯題
              </button>
              <button
                id="filter-high-error-btn"
                onClick={() => setLogFilter('high_error')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                  logFilter === 'high_error'
                    ? 'bg-[#FBBF24]/20 text-[#FBBF24] font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                高錯誤率單字
              </button>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#0D110F] border border-white/10">
              {(
                [
                  { key: 'all', label: '全部狀態' },
                  { key: 'weakness', label: '弱點優先' },
                  { key: 'untested', label: '尚未測驗' },
                  { key: 'cooldown', label: '冷卻中' },
                  { key: 'due_review', label: '久未複習' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                    statusFilter === tab.key
                      ? 'bg-[#7CE3B3] text-[#0D110F] font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* View 1: 作答歷史時間軸 */}
      {viewMode === 'timeline' ? (
        filteredLogs.length === 0 ? (
          <div className="bg-[#161B18] border border-white/10 rounded-2xl p-12 text-center">
            <Filter className="w-9 h-9 text-zinc-500 mx-auto mb-3" />
            <h3 className="text-base font-bold text-white mb-1">沒有符合條件的作答記錄</h3>
            <p className="text-xs text-zinc-400">
              可切換上方篩選條件，或立即開始一場練習來累積個人作答歷史。
            </p>
          </div>
        ) : (
          <div className="relative pl-6 border-l border-white/10 space-y-3 ml-3">
            {filteredLogs.map((log) => {
              const word = wordMap.get(log.wordId);
              const set = setMap.get(log.setId);
              const analysis = word
                ? analyzeWordPriority(word, practiceLogs, settings.cooldownThreshold)
                : null;

              return (
                <div
                  key={log.id}
                  className="relative bg-[#161B18] border border-white/10 hover:border-white/20 rounded-2xl p-4 transition"
                >
                  {/* Timeline Dot */}
                  <div
                    className={`w-3 h-3 rounded-full absolute -left-[31px] top-6 ring-4 ring-[#0D110F] ${
                      log.isCorrect ? 'bg-[#7CE3B3]' : 'bg-[#F472B6]'
                    }`}
                  />

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        {log.isCorrect ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[#7CE3B3]/15 text-[#7CE3B3]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            答對
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[#F472B6]/15 text-[#F472B6]">
                            <XCircle className="w-3.5 h-3.5" />
                            答錯
                          </span>
                        )}

                        <span className="text-base font-bold text-white">
                          {word ? word.term : '已刪除單字'}
                        </span>
                        {word && (
                          <span className="text-xs text-zinc-400">
                            ({word.pos} {word.definition})
                          </span>
                        )}

                        {analysis && <WeightStatusBadge status={analysis.status} />}
                      </div>

                      {/* 作答內容 vs 正確答案對照 */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        <span className="text-zinc-400">
                          你的作答：{' '}
                          <code
                            className={`px-1.5 py-0.5 rounded font-mono ${
                              log.isCorrect
                                ? 'bg-[#7CE3B3]/10 text-[#7CE3B3]'
                                : 'bg-[#F472B6]/15 text-[#F472B6] line-through'
                            }`}
                          >
                            {log.userAnswer || '(未作答)'}
                          </code>
                        </span>

                        {!log.isCorrect && word && (
                          <span className="text-zinc-300">
                            正確答案：{' '}
                            <code className="px-1.5 py-0.5 rounded bg-[#7CE3B3]/15 text-[#7CE3B3] font-mono font-semibold">
                              {word.term}
                            </code>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right Meta Info */}
                    <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1.5 text-xs text-zinc-400 shrink-0">
                      <div className="flex items-center gap-1.5">
                        {log.questionType === 'word_bank_cloze' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#0D110F] border border-white/10 text-zinc-300">
                            <FileText className="w-3 h-3 text-[#7CE3B3]" />
                            文意選填
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#0D110F] border border-white/10 text-zinc-300">
                            <Type className="w-3 h-3 text-[#60A5FA]" />
                            文意字彙
                          </span>
                        )}
                        {set && (
                          <span
                            className="px-2 py-0.5 rounded-md text-[11px] font-medium"
                            style={{
                              backgroundColor: `${set.color}18`,
                              color: set.color,
                            }}
                          >
                            {set.title}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                        <Clock className="w-3 h-3" />
                        <span>{formatRelativeTime(log.answeredAt)}</span>
                        <span className="font-mono">({log.questionHash})</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* View 2: 單字出題狀態標籤一覽 */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredAnalyzedWords.map(({ word, analysis, set }) => (
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
                  <WeightStatusBadge status={analysis.status} />
                </div>
                <p className="text-xs text-zinc-300">{word.definition}</p>
              </div>

              <div className="pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-zinc-400">
                <span>{analysis.reasonText}</span>
                {set && (
                  <span
                    className="inline-flex items-center gap-1 font-medium"
                    style={{ color: set.color }}
                  >
                    <Layers className="w-3 h-3" />
                    {set.title}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
