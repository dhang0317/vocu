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
      <div className="bg-[#161B18] border border-white/10 rounded-2xl p-10 text-center max-w-xl mx-auto my-12">
        <div className="w-14 h-14 rounded-2xl bg-[#7CE3B3]/15 text-[#7CE3B3] flex items-center justify-center mx-auto mb-4">
          <Plus className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">尚無任何單字集</h2>
        <p className="text-sm text-zinc-400 mb-6">
          先建立你的第一個單字集，或由 AI 助理透過 MCP 匯入題庫即可開始每日練習。
        </p>
        <button
          onClick={() => setActiveTab('vocab')}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#7CE3B3] text-[#0D110F] font-semibold text-sm hover:brightness-105 transition cursor-pointer"
        >
          <span>前往新增單字集</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* 1. 動態問候與目標提示 */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-[#7CE3B3] mb-1">
            DAILY VOCABULARY PRACTICE
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {greeting}，{settings.userName.split(' ')[0]}
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            {remainingCount > 0 ? (
              <>
                今天還差{' '}
                <span className="text-[#7CE3B3] font-semibold">{remainingCount} 題</span>{' '}
                就達標，系統已為你準備好無重複語境題目。
              </>
            ) : (
              <span className="text-[#7CE3B3] font-medium">
                太棒了！你已完成今日目標（{todayCompletedCount} / {dailyGoal} 題），隨時可繼續挑戰弱點單字。
              </span>
            )}
          </p>
        </div>

        {currentSetStats.weakness > 0 && (
          <button
            onClick={() =>
              startQuiz({
                setId: currentSet?.id || 'all',
                questionType: 'letter_hint_cloze',
                onlyWrongWords: true,
                questionCount: Math.min(5, currentSetStats.weakness),
              })
            }
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#F472B6]/15 hover:bg-[#F472B6]/25 border border-[#F472B6]/30 text-[#F472B6] text-xs font-semibold transition cursor-pointer self-start sm:self-auto"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>發現 {currentSetStats.weakness} 個弱點字・一鍵特訓</span>
          </button>
        )}
      </header>

      {/* 2. 今日進度卡片 */}
      <section className="bg-[#161B18] border border-white/10 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <span className="text-xs font-medium text-zinc-400">今日練習進度</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-4xl sm:text-5xl font-bold text-white tracking-tight">
                {todayCompletedCount}
              </span>
              <span className="text-2xl font-semibold text-zinc-500">/ {dailyGoal}</span>
              <span className="text-xs text-zinc-400 ml-1">題已完成</span>
            </div>
          </div>

          {/* 每日目標切換器 Segmented Control: 10 題 / 20 題 / 30 題 */}
          <div className="self-start sm:self-center">
            <div className="text-[11px] text-zinc-400 mb-1.5 sm:text-right">每日目標題數</div>
            <div
              role="group"
              aria-label="每日目標切換器"
              className="inline-flex p-1 rounded-xl bg-[#0D110F] border border-white/10"
            >
              {([10, 20, 30] as const).map((goal) => {
                const active = dailyGoal === goal;
                return (
                  <button
                    key={goal}
                    id={`daily-goal-btn-${goal}`}
                    onClick={() => updateSettings({ dailyGoal: goal })}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      active
                        ? 'bg-[#7CE3B3] text-[#0D110F] shadow-sm'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {goal} 題
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 水平進度條 */}
        <div className="w-full h-3 rounded-full bg-[#0D110F] overflow-hidden border border-white/5">
          <div
            className="h-full bg-[#7CE3B3] rounded-full transition-all duration-500"
            style={{ width: `${Math.max(4, progressPercent)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-zinc-400 mt-2.5">
          <span>達成率 {progressPercent}%</span>
          <span>累計總作答：{practiceLogs.length} 題記錄</span>
        </div>
      </section>

      {/* 3. 快速開始區 */}
      <section className="bg-[#161B18] border border-white/10 rounded-2xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">快速開始練習</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              選擇最近使用的單字集與測驗題型，系統將依作答記錄動態過濾與加權出題
            </p>
          </div>
          <button
            onClick={() => setActiveTab('vocab')}
            className="text-xs font-medium text-[#7CE3B3] hover:underline cursor-pointer"
          >
            管理全部單字集 →
          </button>
        </div>

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
                    ? 'bg-[#0D110F] border-[#7CE3B3] ring-1 ring-[#7CE3B3]/40'
                    : 'bg-[#0D110F]/60 border-white/10 hover:border-white/25'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{
                      backgroundColor: `${set.color}20`,
                      color: set.color,
                    }}
                  >
                    <SetIcon icon={set.icon} className="w-5 h-5" />
                  </div>
                  {isSelected && (
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#7CE3B3]/20 text-[#7CE3B3]">
                      目前選中
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-bold text-white line-clamp-1">{set.title}</h3>
                <div className="flex items-center gap-2 mt-2 text-xs text-zinc-400">
                  <span>{setWords.length} 個字詞</span>
                  {setWeakCount > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-[#F472B6] font-medium">{setWeakCount} 弱點</span>
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* 當前單字集的動態出題權重預覽 */}
        {currentSet && (
          <div className="p-4 rounded-xl bg-[#0D110F] border border-white/10">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#7CE3B3]" />
                「{currentSet.title}」動態出題佇列分佈
              </span>
              <span className="text-[11px] text-zinc-400">
                防重複 questionHash + 冷卻過濾已啟用
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-2.5 rounded-lg bg-[#161B18] border border-white/5 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#F472B6]/15 text-[#F472B6] flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs text-zinc-400">優先級 1・弱點</div>
                  <div className="text-sm font-bold text-white">{currentSetStats.weakness} 字</div>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[#161B18] border border-white/5 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#7CE3B3]/15 text-[#7CE3B3] flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs text-zinc-400">優先級 2・新字</div>
                  <div className="text-sm font-bold text-white">{currentSetStats.untested} 字</div>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[#161B18] border border-white/5 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#FBBF24]/15 text-[#FBBF24] flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs text-zinc-400">優先級 3・複習</div>
                  <div className="text-sm font-bold text-white">{currentSetStats.dueReview} 字</div>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[#161B18] border border-white/5 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#60A5FA]/15 text-[#60A5FA] flex items-center justify-center shrink-0">
                  <Snowflake className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs text-zinc-400">暫緩出題・冷卻</div>
                  <div className="text-sm font-bold text-white">{currentSetStats.cooldown} 字</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 題型選擇器 */}
        <div>
          <label className="block text-xs font-semibold text-zinc-300 mb-2.5">
            選擇練習題型（全程作答完畢交卷後才統一公佈答案與解析）
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              id="select-type-word-bank"
              type="button"
              onClick={() => setSelectedQuestionType('word_bank_cloze')}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3.5 ${
                selectedQuestionType === 'word_bank_cloze'
                  ? 'bg-[#0D110F] border-[#7CE3B3] ring-1 ring-[#7CE3B3]/40'
                  : 'bg-[#0D110F]/60 border-white/10 hover:border-white/25'
              }`}
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                  selectedQuestionType === 'word_bank_cloze'
                    ? 'bg-[#7CE3B3] text-[#0D110F]'
                    : 'bg-white/5 text-zinc-400'
                }`}
              >
                <FileText className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white">文意選填 (Word Bank Cloze)</span>
                  {selectedQuestionType === 'word_bank_cloze' && (
                    <CheckCircle2 className="w-4 h-4 text-[#7CE3B3] shrink-0" />
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  一篇英文短文內含 (1)～(10) 共 10 個挖空，搭配 (A)～(J) 10 個不重複單字選項膠囊互動填答。
                </p>
              </div>
            </button>

            <button
              id="select-type-letter-hint"
              type="button"
              onClick={() => setSelectedQuestionType('letter_hint_cloze')}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3.5 ${
                selectedQuestionType === 'letter_hint_cloze'
                  ? 'bg-[#0D110F] border-[#7CE3B3] ring-1 ring-[#7CE3B3]/40'
                  : 'bg-[#0D110F]/60 border-white/10 hover:border-white/25'
              }`}
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                  selectedQuestionType === 'letter_hint_cloze'
                    ? 'bg-[#7CE3B3] text-[#0D110F]'
                    : 'bg-white/5 text-zinc-400'
                }`}
              >
                <Type className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white">
                    文意字彙 (首尾字母提示填空)
                  </span>
                  {selectedQuestionType === 'letter_hint_cloze' && (
                    <CheckCircle2 className="w-4 h-4 text-[#7CE3B3] shrink-0" />
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  單句語境拼字填空，支援單字（如 <code className="text-[#7CE3B3]">m_____y</code>）與多字片語（如{' '}
                  <code className="text-[#7CE3B3]">n_____e t___o b___e f___d</code>）。
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
            className="w-full py-4 px-6 rounded-2xl bg-[#7CE3B3] hover:brightness-105 active:scale-[0.995] text-[#0D110F] font-bold text-base shadow-lg shadow-[#7CE3B3]/10 flex items-center justify-center gap-2.5 transition-all cursor-pointer"
          >
            <Play className="w-5 h-5 fill-[#0D110F]" />
            <span>
              開始練習（{selectedQuestionType === 'word_bank_cloze' ? '文意選填 10 題' : '文意字彙 5 題'}
              ）
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}
