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
  Upload,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useVocu } from '@/context/VocuContext';
import { QuestionType } from '@/types/vocu';
import { SetIcon } from './SetIcon';
import { analyzeWordPriority } from '@/lib/quizEngine';
import { parseVocabText, extractTextFromPdfFile } from '@/lib/vocabFileParser';

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
    isCloudReady,
    setActiveTab,
    addWordSet,
    updateWordSet,
    batchImportWords,
    addCustomQuizItems,
  } = useVocu();

  const [selectedQuestionType, setSelectedQuestionType] =
    useState<QuestionType>('word_bank_cloze');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<'words' | 'quizzes'>('words');
  const [importTargetSetId, setImportTargetSetId] = useState<string>('');
  const [newSetName, setNewSetName] = useState('');
  const [importText, setImportText] = useState('');
  const [importFeedback, setImportFeedback] = useState<string | null>(null);

  const handleHomeFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportFeedback(`正在解析 ${file.name}...`);
    try {
      const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
      const isJson = file.name.toLowerCase().endsWith('.json') || file.type === 'application/json';
      const extractedText = isPdf ? await extractTextFromPdfFile(file) : await file.text();
      setImportText(extractedText);

      if (isJson || extractedText.trim().startsWith('[') || extractedText.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(extractedText);
          const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
          if (arr.length > 0) {
            setImportFeedback(`已從 ${file.name} 辨識出 ${arr.length} 題測驗題目，請確認目標單字集後點擊「確認匯入」。`);
            return;
          }
        } catch {
          // fall through to vocab parser
        }
      }

      const preview = parseVocabText(extractedText);
      if (preview.length > 0) {
        setImportFeedback(`已從 ${file.name} 辨識出 ${preview.length} 筆單字／片語，請確認後點擊「確認匯入」。`);
      } else {
        setImportFeedback(`已讀取 ${file.name}，但未自動偵測到單字或題目格式，可手動微調後匯入。`);
      }
    } catch (err) {
      setImportFeedback(`檔案解析失敗：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleHomeImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = importText.trim();

    let targetId = importTargetSetId || recentSetId || wordSets[0]?.id || '';
    if (importTargetSetId === '__new__') {
      const title = newSetName.trim();
      if (!title) {
        setImportFeedback('請輸入新單字集名稱。');
        return;
      }
      const created = addWordSet({ title, color: '#FFFFFF', icon: 'book' });
      targetId = created.id;
      setRecentSetId(created.id);
    }

    // Check if input is JSON quiz items
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
        if (arr.length > 0) {
          const labels: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];
          const importedItems = arr.map((raw: Record<string, unknown>, idx: number) => {
            const inferredType =
              raw.type === 'word_bank_cloze' || (raw.passage && Array.isArray(raw.answers))
                ? 'word_bank_cloze'
                : raw.type === 'multiple_choice_cloze' || (Array.isArray(raw.options) && raw.options.length === 4)
                  ? 'multiple_choice_cloze'
                  : 'letter_hint_cloze';

            const baseItem: Record<string, unknown> = {
              ...raw,
              id:
                typeof raw.id === 'string' && raw.id.trim()
                  ? raw.id.trim()
                  : `quiz-import-${Date.now()}-${idx}`,
              setId: targetId,
              type: inferredType,
              createdAt: String(raw.createdAt || new Date().toISOString()),
              source: 'mcp_agent' as const,
            };

            if (inferredType === 'multiple_choice_cloze' && Array.isArray(raw.options)) {
              baseItem.options = raw.options.slice(0, 4).map((o: unknown, oIdx: number) =>
                typeof o === 'string' ? { label: labels[oIdx], term: o.trim() } : o
              );
            }

            return baseItem as never;
          });

          addCustomQuizItems(importedItems);
          const importedCount = importedItems.length;

          setImportFeedback(`成功匯入 ${importedCount} 題測驗題目！`);
          setImportText('');
          setNewSetName('');
          setTimeout(() => {
            setImportFeedback(null);
            setIsImportOpen(false);
          }, 1100);
          return;
        }
      } catch {
        // fall through to vocab parser
      }
    }

    const parsedItems = parseVocabText(importText);
    if (parsedItems.length === 0) {
      setImportFeedback('無法辨識出「英文單字 + 中文釋義」或「JSON 題庫」，請確認內容格式。');
      return;
    }

    const count = batchImportWords(targetId, parsedItems);
    if (count > 0) {
      setImportFeedback(`成功匯入 ${count} 筆單字／片語！`);
      setImportText('');
      setNewSetName('');
      setTimeout(() => {
        setImportFeedback(null);
        setIsImportOpen(false);
      }, 1100);
    } else {
      setImportFeedback('匯入失敗，請檢查內容格式。');
    }
  };

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
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setImportMode('words');
              setImportTargetSetId(currentSet?.id || wordSets[0]?.id || '__new__');
              setImportText('');
              setImportFeedback(null);
              setIsImportOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#000000] hover:bg-white/5 border border-white/15 text-xs font-medium text-zinc-200 transition cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-zinc-300" />
            <span>匯入單字庫（PDF / TXT / CSV）</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setImportMode('quizzes');
              setImportTargetSetId(currentSet?.id || wordSets[0]?.id || '__new__');
              setImportText('');
              setImportFeedback(null);
              setIsImportOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#000000] hover:bg-white/5 border border-white/15 text-xs font-medium text-zinc-200 transition cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-zinc-300" />
            <span>匯入題目庫（JSON）</span>
          </button>
        </div>

        {/* 單字集選擇卡片：分界線之上（最新 / 置頂）與分界線之下 */}
        {(() => {
          const aboveSets = wordSets.filter((s) => !s.belowDivider);
          const belowSets = wordSets.filter((s) => Boolean(s.belowDivider));

          const renderSetCard = (set: (typeof wordSets)[number], isBelow: boolean) => {
            const isSelected = currentSet?.id === set.id;
            const setWords = words.filter((w) => w.setId === set.id);

            return (
              <div
                key={set.id}
                onClick={() => setRecentSetId(set.id)}
                className={`text-left p-4 rounded-2xl border transition-all cursor-pointer relative ${
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
                  <div className="flex items-center gap-1.5">
                    {isSelected && (
                      <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-white/10 text-zinc-300">
                        目前選中
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateWordSet(set.id, { belowDivider: !isBelow });
                      }}
                      title={isBelow ? '移至分界線之上' : '移至分界線之下'}
                      className="p-1.5 rounded-lg bg-[#000000] border border-white/10 hover:border-white/40 text-zinc-400 hover:text-white transition cursor-pointer"
                    >
                      {isBelow ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
                <h3 className="text-sm font-bold text-white line-clamp-1">{set.title}</h3>
                <div className="flex items-center gap-2 mt-2 text-xs text-zinc-400">
                  <span>{setWords.length} 個字詞</span>
                </div>
              </div>
            );
          };

          return (
            <div className="space-y-4">
              {aboveSets.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {aboveSets.map((set) => renderSetCard(set, false))}
                </div>
              ) : (
                <div className="text-center py-4 rounded-2xl border border-dashed border-white/10 text-xs text-zinc-500">
                  分界線之上目前沒有單字集（AI 新推送或點卡片右上角 ↑ 會顯示於此）
                </div>
              )}

              {belowSets.length > 0 && (() => {
                const isBelowHidden = Boolean(settings.hideBelowDivider);
                return (
                  <>
                    <div className="flex items-center gap-3 py-1">
                      <div className="h-px flex-1 bg-white/15" />
                      <button
                        id="toggle-below-divider-btn"
                        type="button"
                        onClick={() => updateSettings({ hideBelowDivider: !isBelowHidden })}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/15 bg-[#000000] hover:border-white/35 text-[11px] font-medium text-zinc-400 hover:text-white tracking-wider transition cursor-pointer"
                      >
                        {isBelowHidden ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronUp className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {isBelowHidden
                            ? `展開收納單字集（${belowSets.length}）`
                            : `隱藏收納單字集（${belowSets.length}）`}
                        </span>
                      </button>
                      <div className="h-px flex-1 bg-white/15" />
                    </div>
                    {!isBelowHidden && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 opacity-80">
                        {belowSets.map((set) => renderSetCard(set, true))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          );
        })()}

        {/* 題型選擇器 */}
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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

            {([
              ['zh_to_en_choice', '看中選英', '顯示中文釋義，四選一選出正確英文單字。'],
              ['en_to_zh_choice', '看英選中', '顯示英文單字，四選一選出正確中文釋義。'],
            ] as const).map(([type, label, desc]) => (
              <button
                key={type}
                id={`select-type-${type}`}
                type="button"
                onClick={() => setSelectedQuestionType(type)}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3.5 ${
                  selectedQuestionType === type
                    ? 'bg-[#000000] border-white ring-1 ring-white/30'
                    : 'bg-[#000000]/60 border-white/10 hover:border-white/25'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                    selectedQuestionType === type
                      ? 'bg-white text-[#000000]'
                      : 'bg-white/5 text-zinc-400'
                  }`}
                >
                  <ListChecks className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">{label}</span>
                    {selectedQuestionType === type && (
                      <CheckCircle2 className="w-4 h-4 text-zinc-300 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 句子複雜度（僅單句題型：文意字彙／單句克漏字） */}
        {(selectedQuestionType === 'letter_hint_cloze' ||
          selectedQuestionType === 'multiple_choice_cloze') && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold text-zinc-400">句子複雜度</span>
            <div className="inline-flex items-center rounded-full border border-white/15 bg-[#000000] p-0.5 text-xs font-semibold">
              {([
                ['all', '全部'],
                ['simple', '簡單句'],
                ['complex', '複雜句'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  id={`select-complexity-${key}`}
                  type="button"
                  onClick={() => updateSettings({ sentenceComplexity: key })}
                  className={`px-4 py-1.5 rounded-full transition cursor-pointer ${
                    (settings.sentenceComplexity ?? 'all') === key
                      ? 'bg-white text-[#000000]'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-zinc-500">
              簡單句：短句、常用字；複雜句：長句、子句、進階詞彙
            </span>
          </div>
        )}

        {/* 底部固定/全寬薄荷綠主按鈕「▶ 開始練習」 */}
        <div className="pt-2">
          <button
            id="start-practice-main-btn"
            disabled={!isCloudReady}
            onClick={() =>
              startQuiz({
                setId: currentSet?.id || wordSets[0].id,
                questionType: selectedQuestionType,
                onlyWrongWords: false,
                questionCount: selectedQuestionType === 'word_bank_cloze' ? 10 : 5,
              })
            }
            className={`w-full py-4 px-6 rounded-2xl font-bold text-base shadow-lg shadow-white/5 flex items-center justify-center gap-2.5 transition-all ${
              isCloudReady
                ? 'bg-white hover:bg-zinc-200 active:scale-[0.995] text-[#000000] cursor-pointer'
                : 'bg-[#000000] border border-white/15 text-zinc-400 cursor-not-allowed'
            }`}
          >
            {isCloudReady ? (
              <Play className="w-5 h-5 fill-[#000000]" />
            ) : (
              <span className="w-4 h-4 rounded-full border-2 border-zinc-400 border-t-transparent animate-spin" />
            )}
            <span>
              {!isCloudReady
                ? '雲端題庫同步中...'
                : `開始練習（${
                    selectedQuestionType === 'word_bank_cloze'
                      ? '文意選填 10 題'
                      : selectedQuestionType === 'multiple_choice_cloze'
                        ? '單句克漏字・無止盡'
                        : '文意字彙・無止盡'
                  }）`}
            </span>
          </button>
        </div>
      </section>

      {isImportOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#000000] border border-white/15 rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                {importMode === 'words' ? '匯入單字庫' : '匯入題目庫'}
              </h3>
              <button
                type="button"
                onClick={() => setIsImportOpen(false)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs text-zinc-400">目標單字集</label>
              <select
                value={importTargetSetId}
                onChange={(e) => setImportTargetSetId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#000000] border border-white/15 text-xs text-white focus:outline-none focus:border-white/50"
              >
                {wordSets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
                <option value="__new__">+ 建立新單字集...</option>
              </select>
              {importTargetSetId === '__new__' && (
                <input
                  type="text"
                  value={newSetName}
                  onChange={(e) => setNewSetName(e.target.value)}
                  placeholder="輸入新單字集名稱（例如：高三模擬考單字）"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#000000] border border-white/15 text-xs text-white focus:outline-none focus:border-white/50"
                />
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-zinc-400 leading-relaxed">
                {importMode === 'words' ? (
                  <>
                    支援直接上傳檔案，或貼上多種格式（<code className="text-zinc-300">|</code>、逗號、Tab、編號清單、<code className="text-zinc-300">單字 (詞性) 中文</code> 等）：
                  </>
                ) : (
                  <>請上傳或貼上 JSON 題庫檔（支援單句克漏字、文意字彙、文意選填）：</>
                )}
              </p>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white cursor-pointer transition">
                <Upload className="w-3.5 h-3.5" />
                <span>
                  {importMode === 'words'
                    ? '選擇檔案（PDF / TXT / CSV）'
                    : '選擇檔案（JSON）'}
                </span>
                <input
                  type="file"
                  accept={
                    importMode === 'words'
                      ? '.pdf,.txt,.csv,.tsv,.md,application/pdf,text/plain,text/csv'
                      : '.json,application/json'
                  }
                  onChange={handleHomeFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <form onSubmit={handleHomeImportSubmit} className="space-y-4">
              <textarea
                rows={6}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={`meticulous | adj. | 一絲不苟的；極為謹慎的\nmake ends meet | phr. | 使收支相抵；勉強維持生計\nbreakthrough | n. | 重大突破`}
                className="w-full p-3.5 rounded-xl bg-[#000000] border border-white/15 text-xs font-mono text-white focus:outline-none focus:border-white/50"
              />
              {importFeedback && (
                <p className="text-xs text-zinc-300 font-medium">{importFeedback}</p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsImportOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#000000] text-xs text-zinc-400 hover:text-white cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-white text-[#000000] text-xs font-bold hover:bg-zinc-200 cursor-pointer"
                >
                  確認匯入
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
