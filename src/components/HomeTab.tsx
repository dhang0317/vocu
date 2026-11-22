'use client';

import React, { useState, useMemo } from 'react';
import {
  Play,
  Sparkles,
  FileText,
  Type,
  CheckCircle2,
  AlertTriangle,
  Snowflake,
  Clock,
  ArrowRight,
  Plus,
  ListChecks,
} from 'lucide-react';
import { useVocu } from '@/context/VocuContext';
import { QuestionType } from '@/types/vocu';
import { SetIcon } from './SetIcon';
import { analyzeWordPriority } from '@/lib/quizEngine';

export function HomeTab() {
  const {
    wordSets,
    words,
    practiceLogs,
    settings,
    updateSettings,
    recentSetId,
    setRecentSetId,
    startQuiz,
    setActiveTab,
  } = useVocu();

  const [selectedQuestionType, setSelectedQuestionType] =
    useState<QuestionType>('word_bank_cloze');

  // 動態問候語（早安 / 午安 / 晚安）
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return '早安';
    if (hour < 18) return '午安';
    return '晚安';
  }, []);

  // 計算今日已完成題數
  const todayCompletedCount = useMemo(() => {
    const todayStr = new Date().toDateString();
    return practiceLogs.filter((log) => new Date(log.answeredAt).toDateString() === todayStr)
      .length;
  }, [practiceLogs]);

  const dailyGoal = settings.dailyGoal;
  const remainingCount = Math.max(0, dailyGoal - todayCompletedCount);
  const progressPercent = Math.min(100, Math.round((todayCompletedCount / dailyGoal) * 100));

  // 最近使用的單字集
  const currentSet = useMemo(() => {
    return wordSets.find((s) => s.id === recentSetId) || wordSets[0] || null;
  }, [wordSets, recentSetId]);

  // 統計選中單字集各權重狀態的單字數量
  const currentSetStats = useMemo(() => {
    if (!currentSet) {
      return { total: 0, weakness: 0, untested: 0, dueReview: 0, cooldown: 0 };
    }
    const setWords = words.filter((w) => w.setId === currentSet.id);
    let weakness = 0;
    let untested = 0;
    let dueReview = 0;
    let cooldown = 0;

    setWords.forEach((w) => {
      const analysis = analyzeWordPriority(w, practiceLogs, settings.cooldownThreshold);
      if (analysis.status === 'weakness') weakness++;
      else if (analysis.status === 'untested') untested++;
      else if (analysis.status === 'cooldown') cooldown++;
      else dueReview++;
    });

    return {
      total: setWords.length,
      weakness,
      untested,
      dueReview,
      cooldown,
    };
  }, [currentSet, words, practiceLogs, settings.cooldownThreshold]);

  if (wordSets.length === 0) {
    return (
      <div className="bg-[#000000] border border-white/10 rounded-2xl p-10 text-center max-w-xl mx-auto my-12">
        <div className="w-14 h-14 rounded-2xl bg-white/10 text-zinc-300 flex items-center justify-center mx-auto mb-4">
          <Plus className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">尚無任何單字集</h2>
        <p className="text-sm text-zinc-400 mb-6">
          先建立你的第一個單字集，或由 AI 助理透過 MCP 匯入題庫即可開始每日練習。
        </p>
        <button
          onClick={() => setActiveTab('vocab')}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-[#000000] font-semibold text-sm hover:brightness-105 transition cursor-pointer"
        >
          <span>前往新增單字集</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* 3. 快速開始區 */}
      <section className="bg-[#000000] border border-white/10 rounded-2xl p-6 space-y-6">

        {/* 最近使用的單字集選擇卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {wordSets.map((set) => {
            const isSelected = currentSet?.id === set.id;
            const setWords = words.filter((w) => w.setId === set.id);
            const setWeakCount = setWords.filter(
              (w) =>
                analyzeWordPriority(w, practiceLogs, settings.cooldownThreshold).status ===
                'weakness'
            ).length;

            return (
              <button
                key={set.id}
                onClick={() => setRecentSetId(set.id)}
                className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#000000] border-white ring-1 ring-white/30'
                    : 'bg-[#000000]/60 border-white/10 hover:border-white/25'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      isSelected ? 'bg-white text-[#000000]' : 'bg-white/10 text-white'
                    }`}
                  >
                    <SetIcon icon={set.icon} className="w-5 h-5" />
                  </div>
                  {isSelected && (
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-white/10 text-zinc-300">
                      目前選中
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-bold text-white line-clamp-1">{set.title}</h3>
                <div className="flex items-center gap-2 mt-2 text-xs text-zinc-400">
                  <span>{setWords.length} 個字詞</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* 題型選擇器 */}
        <div>
          <label className="block text-xs font-semibold text-zinc-300 mb-2.5">
            選擇練習題型（全程作答完畢交卷後才統一公佈答案與解析）
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              id="select-type-word-bank"
              type="button"
              onClick={() => setSelectedQuestionType('word_bank_cloze')}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3.5 ${
                selectedQuestionType === 'word_bank_cloze'
                  ? 'bg-[#000000] border-white ring-1 ring-white/30'
                  : 'bg-[#000000]/60 border-white/10 hover:border-white/25'
              }`}
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                  selectedQuestionType === 'word_bank_cloze'
                    ? 'bg-white text-[#000000]'
                    : 'bg-white/5 text-zinc-400'
                }`}
              >
                <FileText className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white">文意選填</span>
                  {selectedQuestionType === 'word_bank_cloze' && (
                    <CheckCircle2 className="w-4 h-4 text-zinc-300 shrink-0" />
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  10 格短文搭配 (A)～(J) 選項膠囊互動填答。
                </p>
              </div>
            </button>

            <button
              id="select-type-letter-hint"
              type="button"
              onClick={() => setSelectedQuestionType('letter_hint_cloze')}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3.5 ${
                selectedQuestionType === 'letter_hint_cloze'
                  ? 'bg-[#000000] border-white ring-1 ring-white/30'
                  : 'bg-[#000000]/60 border-white/10 hover:border-white/25'
              }`}
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                  selectedQuestionType === 'letter_hint_cloze'
                    ? 'bg-white text-[#000000]'
                    : 'bg-white/5 text-zinc-400'
                }`}
              >
                <Type className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white">文意字彙</span>
                  {selectedQuestionType === 'letter_hint_cloze' && (
                    <CheckCircle2 className="w-4 h-4 text-zinc-300 shrink-0" />
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  首尾字母提示拼字填空，支援單字與片語。
                </p>
              </div>
            </button>

            <button
              id="select-type-multiple-choice"
              type="button"
              onClick={() => setSelectedQuestionType('multiple_choice_cloze')}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3.5 ${
                selectedQuestionType === 'multiple_choice_cloze'
                  ? 'bg-[#000000] border-white ring-1 ring-white/30'
                  : 'bg-[#000000]/60 border-white/10 hover:border-white/25'
              }`}
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                  selectedQuestionType === 'multiple_choice_cloze'
                    ? 'bg-white text-[#000000]'
                    : 'bg-white/5 text-zinc-400'
                }`}
              >
                <ListChecks className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white">單句克漏字</span>
                  {selectedQuestionType === 'multiple_choice_cloze' && (
                    <CheckCircle2 className="w-4 h-4 text-zinc-300 shrink-0" />
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  單句語境搭配 A / B / C / D 四選一選項。
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* 底部固定/全寬薄荷綠主按鈕「▶ 開始練習」 */}
        <div className="pt-2">
          <button
            id="start-practice-main-btn"
            onClick={() =>
              startQuiz({
                setId: currentSet?.id || wordSets[0].id,
                questionType: selectedQuestionType,
                onlyWrongWords: false,
                questionCount: selectedQuestionType === 'word_bank_cloze' ? 10 : 5,
              })
            }
            className="w-full py-4 px-6 rounded-2xl bg-white hover:bg-zinc-200 active:scale-[0.995] text-[#000000] font-bold text-base shadow-lg shadow-white/5 flex items-center justify-center gap-2.5 transition-all cursor-pointer"
          >
            <Play className="w-5 h-5 fill-[#000000]" />
            <span>
              開始練習（
              {selectedQuestionType === 'word_bank_cloze'
                ? '文意選填 10 題'
                : selectedQuestionType === 'multiple_choice_cloze'
                  ? '單句克漏字・無止盡'
                  : '文意字彙・無止盡'}
              ）
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}
