'use client';

import React, { useState, useMemo } from 'react';
import {
  X,
  CheckCircle2,
  XCircle,
  Sparkles,
  Send,
  RotateCcw,
  History,
  HelpCircle,
  AlertTriangle,
} from 'lucide-react';
import { useVocu } from '@/context/VocuContext';
import {
  buildWordBankQuizSession,
  buildLetterHintQuizSession,
  buildMultipleChoiceQuizSession,
  analyzeWordPriority,
} from '@/lib/quizEngine';
import { generateLetterHintMask, checkLetterHintAnswer, isNearMissSpelling } from '@/lib/masking';
import { WeightStatusBadge } from './SetIcon';

export function QuizModal() {
  const {
    activeQuiz,
    closeQuiz,
    wordSets,
    words,
    practiceLogs,
    quizBank,
    settings,
    updateSettings,
    recordQuizSubmission,
    setActiveTab,
  } = useVocu();

  const renderRatingBar = (questionHash: string) => {
    const isArchived = (settings.questionRatings?.[questionHash] ?? 0) >= 4;
    return (
      <div className="pt-2.5 mt-2.5 border-t border-white/10 flex items-center justify-end">
        <button
          type="button"
          onClick={() =>
            updateSettings({
              questionRatings: {
                ...(settings.questionRatings || {}),
                [questionHash]: isArchived ? 0 : 5,
              },
            })
          }
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
            isArchived
              ? 'bg-[#52B788]/20 border-[#52B788] text-[#52B788]'
              : 'bg-[#000000] border-white/15 text-zinc-300 hover:border-[#52B788]/60 hover:text-white'
          }`}
        >
          {isArchived ? '✓ 已封存（之後不再出現）' : '封存此題（之後不再出現）'}
        </button>
      </div>
    );
  };

  const [sessionSeed, setSessionSeed] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // 文意選填 (Word Bank Cloze) 狀態：blankNumber (1..10) -> optionLetter ('A'..'J')
  const [activeBlankNumber, setActiveBlankNumber] = useState<number>(1);
  const [wordBankSelections, setWordBankSelections] = useState<Record<number, string>>({});

  // 文意字彙 (Letter Hint Cloze) 狀態：quiz.id -> 使用者輸入字串
  const [letterHintInputs, setLetterHintInputs] = useState<Record<string, string>>({});

  // 單句克漏字 (Multiple Choice Cloze) 狀態：quiz.id -> 'A' | 'B' | 'C' | 'D'
  const [mcSelections, setMcSelections] = useState<Record<string, 'A' | 'B' | 'C' | 'D'>>({});
  const [mcCurrentIndex, setMcCurrentIndex] = useState(0);

  // 文意字彙 (Letter Hint Cloze) 單題即時批改狀態
  const [lhCurrentIndex, setLhCurrentIndex] = useState(0);
  const [lhSubmittedMap, setLhSubmittedMap] = useState<Record<string, boolean>>({});

  // 每次開啟新的測驗場次時，強制重置所有作答與交卷狀態
  React.useEffect(() => {
    setIsSubmitted(false);
    setActiveBlankNumber(1);
    setWordBankSelections({});
    setLetterHintInputs({});
    setMcSelections({});
    setMcCurrentIndex(0);
    setLhCurrentIndex(0);
    setLhSubmittedMap({});
  }, [activeQuiz]);

  // 組題：根據 activeQuiz 與 sessionSeed 執行「防重複 + 弱點加權」演算法
  const sessionData = useMemo(() => {
    if (!activeQuiz) return null;
    // Reference sessionSeed so clicking "根據最新記錄重新組題" re-runs the engine with updated PracticeLog
    void sessionSeed;

    if (activeQuiz.questionType === 'word_bank_cloze') {
      const wbSession = buildWordBankQuizSession({
        setId: activeQuiz.setId,
        words,
        logs: practiceLogs,
        quizBank,
        settings,
        onlyWrongWords: activeQuiz.onlyWrongWords,
      });
      return {
        type: 'word_bank_cloze' as const,
        ...wbSession,
      };
    } else if (activeQuiz.questionType === 'multiple_choice_cloze') {
      const mcSession = buildMultipleChoiceQuizSession({
        setId: activeQuiz.setId,
        words,
        logs: practiceLogs,
        quizBank,
        settings,
        questionCount: 9999,
        onlyWrongWords: activeQuiz.onlyWrongWords,
      });
      return {
        type: 'multiple_choice_cloze' as const,
        ...mcSession,
      };
    } else {
      const lhSession = buildLetterHintQuizSession({
        setId: activeQuiz.setId,
        words,
        logs: practiceLogs,
        quizBank,
        settings,
        questionCount: 9999,
        onlyWrongWords: activeQuiz.onlyWrongWords,
      });
      return {
        type: 'letter_hint_cloze' as const,
        ...lhSession,
      };
    }
    // Only rebuild session when activeQuiz changes or user clicks "重新出題" (sessionSeed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQuiz, sessionSeed]);

  if (!activeQuiz || !sessionData) return null;

  const currentSet = wordSets.find((s) => s.id === activeQuiz.setId);

  // ==========================================================
  // 題型一：文意選填 (Word Bank Cloze) 互動與交卷邏輯
  // ==========================================================
  if (sessionData.type === 'word_bank_cloze') {
    const { quiz, unavailableReason, selectionSummary } = sessionData;

    if (!quiz) {
      return (
        <div className="fixed inset-0 z-50 bg-[#000000] flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#000000] border border-white/10 rounded-2xl p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[#FBBF24]/15 text-[#FBBF24] flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">尚無專屬文意選填短文</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {unavailableReason}
            </p>
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                onClick={closeQuiz}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[#000000] border border-white/10 text-xs font-semibold text-zinc-300 hover:text-white cursor-pointer"
              >
                返回
              </button>
              <button
                onClick={() => {
                  setIsSubmitted(false);
                  setLetterHintInputs({});
                  setSessionSeed((s) => s + 1);
                  setActiveTab('home');
                  closeQuiz();
                }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-[#000000] text-xs font-bold cursor-pointer"
              >
                改用文意字彙測驗
              </button>
            </div>
          </div>
        </div>
      );
    }

    const filledCount = Object.keys(wordBankSelections).length;

    // 反向索引：哪一個選項字母已被用於第幾格
    const optionUsedInBlank: Record<string, number> = {};
    Object.entries(wordBankSelections).forEach(([blankStr, letter]) => {
      optionUsedInBlank[letter] = Number(blankStr);
    });

    const handleBlankClick = (blankNum: number) => {
      if (isSubmitted) return;
      // 點擊已填空格且目前已是高亮格，或直接點擊已填空格：可取消並重新聚焦該格
      if (wordBankSelections[blankNum]) {
        const next = { ...wordBankSelections };
        delete next[blankNum];
        setWordBankSelections(next);
        setActiveBlankNumber(blankNum);
      } else {
        setActiveBlankNumber(blankNum);
      }
    };

    const handleOptionClick = (letter: string) => {
      if (isSubmitted) return;

      // 若該選項已被使用於某格，先從舊格移除
      const nextSelections = { ...wordBankSelections };
      const existingBlank = optionUsedInBlank[letter];
      if (existingBlank) {
        delete nextSelections[existingBlank];
      }

      // 填入目前高亮的空格
      nextSelections[activeBlankNumber] = letter;
      setWordBankSelections(nextSelections);

      // 自動跳至下一個尚未填寫的空格 (1 ~ 10)
      for (let offset = 1; offset <= 10; offset++) {
        const candidateBlank = ((activeBlankNumber - 1 + offset) % 10) + 1;
        if (!nextSelections[candidateBlank]) {
          setActiveBlankNumber(candidateBlank);
          return;
        }
      }
    };

    const handleSubmitWordBank = () => {
      if (isSubmitted) return;
      setIsSubmitted(true);

      // 將 10 個單字的作答結果分別寫入「記錄」
      const optionByLetter = new Map(quiz.options.map((o) => [o.letter, o]));
      const entries = quiz.answers.map((ans) => {
        const chosenLetter = wordBankSelections[ans.blankNumber] || '';
        const chosenOpt = optionByLetter.get(chosenLetter);
        const isCorrect = Boolean(
          chosenOpt &&
            (chosenOpt.correctBlankIndex === ans.blankNumber ||
              chosenOpt.wordId === ans.wordId ||
              chosenLetter === ans.optionLetter)
        );
        return {
          wordId: ans.wordId,
          setId: quiz.setId,
          questionType: 'word_bank_cloze' as const,
          questionHash: quiz.questionHash,
          userAnswer: chosenOpt
            ? `(${chosenLetter}) ${chosenOpt.term}`
            : '(未填答)',
          isCorrect,
        };
      });

      recordQuizSubmission(entries);
    };

    // 切割文章中的 `(1) ______` ~ `(10) ______` 為互動空格按鈕
    const renderInteractivePassage = () => {
      const regex = /\((\d+)\)\s*______/g;
      const parts: React.ReactNode[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      const optionByLetter = new Map(quiz.options.map((o) => [o.letter, o]));
      const answerByBlank = new Map(quiz.answers.map((a) => [a.blankNumber, a]));

      while ((match = regex.exec(quiz.passage)) !== null) {
        if (match.index > lastIndex) {
          parts.push(
            <span key={`txt-${lastIndex}`}>
              {quiz.passage.slice(lastIndex, match.index)}
            </span>
          );
        }

        const blankNum = Number(match[1]);
        const chosenLetter = wordBankSelections[blankNum];
        const chosenOpt = chosenLetter ? optionByLetter.get(chosenLetter) : null;
        const isCurrentActive = !isSubmitted && activeBlankNumber === blankNum;
        const ansInfo = answerByBlank.get(blankNum);
        const isCorrect = isSubmitted && chosenLetter === ansInfo?.optionLetter;

        let buttonStyle =
          'bg-[#000000] border-white/25 text-zinc-400 hover:border-white/50';
        if (isCurrentActive) {
          buttonStyle =
            'bg-[#52B788]/15 border-[#52B788] text-[#52B788] ring-2 ring-[#52B788]/40';
        } else if (!isSubmitted && chosenOpt) {
          buttonStyle =
            'bg-[#52B788] border-[#52B788] text-[#000000] font-bold';
        } else if (isSubmitted) {
          buttonStyle = isCorrect
            ? 'bg-[#52B788]/20 border-[#52B788] text-[#52B788] font-bold'
            : 'bg-[#F472B6]/20 border-[#F472B6] text-[#F472B6] font-bold';
        }

        parts.push(
          <button
            key={`blank-${blankNum}`}
            id={`cloze-blank-${blankNum}`}
            type="button"
            onClick={() => handleBlankClick(blankNum)}
            title={
              !isSubmitted && chosenOpt
                ? '點擊以取消此格並重新選擇'
                : `第 (${blankNum}) 格`
            }
            className={`inline-flex items-center gap-1.5 mx-1.5 my-1 px-3 py-1 rounded-xl border text-sm transition-all cursor-pointer align-baseline ${buttonStyle}`}
          >
            <span className="text-xs font-mono opacity-80">({blankNum})</span>
            {chosenOpt ? (
              <span>
                ({chosenLetter}) {chosenOpt.term}
              </span>
            ) : (
              <span className="tracking-widest font-mono">______</span>
            )}
            {isSubmitted && !isCorrect && ansInfo && (
              <span className="text-xs text-[#52B788] font-semibold ml-1">
                → ({ansInfo.optionLetter}) {ansInfo.term}
              </span>
            )}
          </button>
        );

        lastIndex = regex.lastIndex;
      }

      if (lastIndex < quiz.passage.length) {
        parts.push(
          <span key={`txt-end`}>{quiz.passage.slice(lastIndex)}</span>
        );
      }

      return parts;
    };

    const correctCount = isSubmitted
      ? quiz.answers.filter(
          (a) => wordBankSelections[a.blankNumber] === a.optionLetter
        ).length
      : 0;

    return (
      <div className="fixed inset-0 z-50 bg-[#000000] overflow-y-auto">
        <div className="max-w-[850px] mx-auto px-4 py-6 sm:py-10 space-y-6">
          {/* Top Bar */}
          <div className="flex items-center justify-end">
            <button
              onClick={closeQuiz}
              className="p-2 rounded-xl bg-[#000000] hover:bg-white/10 text-zinc-400 hover:text-white border border-white/10 transition cursor-pointer"
              title="離開測驗"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 互動短文區 */}
          <div className="bg-[#000000] border border-white/10 rounded-2xl p-6">
            <div className="p-5 rounded-2xl bg-[#000000] border border-white/10 text-base text-zinc-100 leading-[2.35] tracking-wide">
              {renderInteractivePassage()}
            </div>
          </div>

          {/* (A) ~ (J) 選項池膠囊 (作答中不顯示中文釋義，全部交卷後才公佈) */}
          <div className="bg-[#000000] border border-white/10 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                單字選項池 (A) ～ (J)
              </h3>
              <span className="text-xs text-zinc-400">
                {isSubmitted
                  ? '交卷後已解鎖各選項詞性與中文釋義'
                  : '作答階段隱藏中文釋義，交卷後統一公佈'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {quiz.options.map((opt) => {
                const usedInBlank = optionUsedInBlank[opt.letter];
                const isUsed = Boolean(usedInBlank);

                return (
                  <button
                    key={opt.letter}
                    id={`wordbank-option-${opt.letter}`}
                    type="button"
                    disabled={isSubmitted}
                    onClick={() => handleOptionClick(opt.letter)}
                    className={`p-3 rounded-xl border text-left transition-all relative ${
                      isSubmitted
                        ? 'bg-[#000000] border-white/10 opacity-90 cursor-default'
                        : isUsed
                          ? 'bg-[#000000]/40 border-white/5 opacity-45 hover:opacity-80 cursor-pointer'
                          : 'bg-[#000000] border-white/15 hover:border-[#52B788] hover:bg-[#52B788]/10 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="w-6 h-6 rounded-lg bg-white/10 text-white text-xs font-bold flex items-center justify-center">
                        {opt.letter}
                      </span>
                      {isUsed && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#52B788]/20 text-[#52B788]">
                          第 ({usedInBlank}) 格
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-bold text-white truncate">
                      {opt.term}
                    </div>
                    {isSubmitted && (
                      <div className="text-[11px] text-zinc-400 mt-1 truncate">
                        {opt.pos} {opt.definition}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 交卷按鈕 或 交卷後的完整逐題解析與重新組題按鈕 */}
          {!isSubmitted ? (
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeQuiz}
                className="px-5 py-3.5 rounded-2xl bg-[#000000] border border-white/10 text-xs font-semibold text-zinc-300 hover:text-white cursor-pointer"
              >
                暫停離開
              </button>
              <button
                id="submit-wordbank-quiz-btn"
                type="button"
                onClick={handleSubmitWordBank}
                className="flex-1 sm:flex-initial px-8 py-3.5 rounded-2xl bg-white hover:bg-zinc-200 text-[#000000] font-bold text-sm shadow-lg shadow-[#52B788]/10 inline-flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>
                  交卷並看解析（已填 {filledCount}/10 格）
                </span>
              </button>
            </div>
          ) : (
            <div className="bg-[#000000] border border-[#52B788]/40 rounded-2xl p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#52B788]">
                    QUIZ RESULTS & EXPLANATIONS
                  </span>
                  <h3 className="text-xl font-bold text-white mt-0.5">
                    作答結果：{correctCount} / 10 題正確（
                    {Math.round((correctCount / 10) * 100)}%）
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    這 10 個單字的對錯結果與題幹雜湊 ({quiz.questionHash}) 已寫入「記錄」，系統已即時更新各單字權重
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      closeQuiz();
                      setActiveTab('history');
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#000000] hover:bg-white/5 border border-white/15 text-xs font-semibold text-white transition cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5 text-[#52B788]" />
                    <span>查看作答記錄</span>
                  </button>
                  <button
                    id="retest-after-submit-btn"
                    onClick={() => {
                      setIsSubmitted(false);
                      setWordBankSelections({});
                      setActiveBlankNumber(1);
                      setSessionSeed((s) => s + 1);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-[#000000] text-xs font-bold transition cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>根據最新記錄重新出題</span>
                  </button>
                </div>
              </div>

              {/* 10 格逐格批改與中文解析 */}
              <div className="space-y-3">
                {quiz.answers.map((ans) => {
                  const userLetter = wordBankSelections[ans.blankNumber];
                  const userOpt = quiz.options.find(
                    (o) => o.letter === userLetter
                  );
                  const correctOpt = quiz.options.find(
                    (o) => o.letter === ans.optionLetter
                  );
                  const isCorrect = userLetter === ans.optionLetter;
                  const updatedWord = words.find((w) => w.id === ans.wordId);
                  const updatedPriority = updatedWord
                    ? analyzeWordPriority(
                        updatedWord,
                        practiceLogs,
                        settings.cooldownThreshold
                      )
                    : null;

                  return (
                    <div
                      key={ans.blankNumber}
                      className={`p-4 rounded-xl border ${
                        isCorrect
                          ? 'bg-[#000000] border-[#52B788]/30'
                          : 'bg-[#000000] border-[#F472B6]/40'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-white/10 text-white">
                            第 ({ans.blankNumber}) 格
                          </span>
                          {isCorrect ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-[#52B788]">
                              <CheckCircle2 className="w-4 h-4" />
                              答對：({ans.optionLetter}) {ans.term}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-[#F472B6]">
                              <XCircle className="w-4 h-4" />
                              你的答案：
                              {userOpt
                                ? `(${userLetter}) ${userOpt.term}`
                                : '(未作答)'}{' '}
                              → 正解：({ans.optionLetter}) {ans.term}
                            </span>
                          )}
                          {correctOpt && (
                            <span className="text-xs text-zinc-400">
                              ({correctOpt.pos} {correctOpt.definition})
                            </span>
                          )}
                        </div>

                        {updatedPriority && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-zinc-500">
                              更新後狀態：
                            </span>
                            <WeightStatusBadge status={updatedPriority.status} />
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed">
                        {ans.explanation}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==========================================================
  // 題型三：單句克漏字 (四選一 Multiple Choice Cloze) — 答一題對一次答案
  // ==========================================================
  if (sessionData.type === 'multiple_choice_cloze') {
    const { questions, selectionSummary } = sessionData;
    const answeredMcCount = questions.filter((_, idx) => Boolean(mcSelections[String(idx)])).length;
    const correctMcCount = questions.filter(
      (q, idx) => Boolean(mcSelections[String(idx)]) && mcSelections[String(idx)] === q.correctLabel
    ).length;
    const wrongMcCount = answeredMcCount - correctMcCount;
    const allMcAnswered = questions.length > 0 && answeredMcCount === questions.length;

    const handleSelectMcOption = (
      idx: number,
      q: (typeof questions)[number],
      label: 'A' | 'B' | 'C' | 'D'
    ) => {
      const key = String(idx);
      if (mcSelections[key]) return; // 已作答鎖定
      setMcSelections((prev) => ({ ...prev, [key]: label }));

      const chosenOpt = q.options.find((o) => o.label === label);
      const isCorrect = label === q.correctLabel;
      if (isCorrect) {
        updateSettings({
          questionRatings: {
            ...(settings.questionRatings || {}),
            [q.questionHash]: 5,
          },
        });
      }
      recordQuizSubmission([
        {
          wordId: q.wordId,
          setId: q.setId,
          questionType: 'multiple_choice_cloze',
          questionHash: q.questionHash,
          userAnswer: chosenOpt ? `${chosenOpt.label}. ${chosenOpt.term}` : label,
          isCorrect,
        },
      ]);
    };

    return (
      <div className="fixed inset-0 z-50 bg-[#000000] overflow-hidden touch-none pt-10 sm:pt-16 px-4">
        <div className="w-full max-w-[760px] mx-auto space-y-4">
          <div className="flex items-center justify-end gap-2">
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#F472B6]/20 text-[#F472B6]">
              ✗ {wrongMcCount}
            </span>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#52B788]/20 text-[#52B788]">
              ✓ {correctMcCount}
            </span>
            <button
              onClick={closeQuiz}
              className="p-2 rounded-xl bg-[#000000] hover:bg-white/10 text-zinc-400 hover:text-white border border-white/10 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 進度條 */}
          <div className="w-full h-2 rounded-full bg-[#000000] overflow-hidden border border-white/10">
            <div
              className="h-full bg-white transition-all duration-300"
              style={{
                width: `${questions.length > 0 ? Math.round(((mcCurrentIndex + 1) / questions.length) * 100) : 0}%`,
              }}
            />
          </div>

          {(() => {
            const q = questions[mcCurrentIndex];
            if (!q) return null;
            const chosenLabel = mcSelections[String(mcCurrentIndex)];
            const isAnswered = Boolean(chosenLabel);
            const isCorrect = isAnswered && chosenLabel === q.correctLabel;
            const parts = (q.sentence || '').split('{{BLANK}}');
            const isLastQuestion = mcCurrentIndex >= questions.length - 1;

            return (
              <div className="space-y-4">
                <div
                  key={q.id}
                  className={`bg-[#000000] border rounded-2xl p-6 space-y-4 transition ${
                    !isAnswered
                      ? 'border-white/10'
                      : isCorrect
                        ? 'border-[#52B788]/50'
                        : 'border-[#F472B6]/50'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span className="font-bold text-white">
                      第 {mcCurrentIndex + 1} / {questions.length} 題
                    </span>
                    <span className="font-mono text-zinc-500">{q.questionHash}</span>
                  </div>

                  <p className="text-base text-zinc-100 leading-relaxed">
                    {parts[0]}
                    <span
                      className={`inline-block mx-1.5 px-4 py-0.5 rounded-lg bg-[#000000] border font-mono font-bold ${
                        !isAnswered
                          ? 'border-white/25 text-zinc-200'
                          : isCorrect
                            ? 'border-[#52B788] text-[#52B788]'
                            : 'border-[#F472B6] text-[#F472B6]'
                      }`}
                    >
                      {chosenLabel
                        ? q.options.find((o) => o.label === chosenLabel)?.term || '________'
                        : '________'}
                    </span>
                    {parts[1]}
                  </p>

                  <div className="space-y-2.5">
                    {q.options.map((opt) => {
                      const isSelected = chosenLabel === opt.label;
                      const isCorrectOpt = q.correctLabel === opt.label;

                      let optStyle =
                        'bg-[#000000] border-white/10 text-zinc-200 hover:border-[#52B788]/60 hover:bg-white/[0.03]';
                      if (isAnswered) {
                        if (isCorrectOpt) {
                          optStyle = 'bg-[#000000] border-[#52B788] text-[#52B788] font-bold';
                        } else if (isSelected && !isCorrectOpt) {
                          optStyle = 'bg-[#000000] border-[#EF4444] text-[#EF4444] font-bold';
                        } else {
                          optStyle = 'bg-[#000000] border-white/10 text-zinc-500';
                        }
                      }

                      return (
                        <button
                          key={opt.label}
                          type="button"
                          disabled={isAnswered}
                          onClick={() => handleSelectMcOption(mcCurrentIndex, q, opt.label)}
                          className={`w-full text-left px-4 py-3.5 rounded-xl border text-sm transition flex items-center gap-3 ${
                            isAnswered ? 'cursor-default' : 'cursor-pointer'
                          } ${optStyle}`}
                        >
                          <span className="font-mono font-bold w-6 shrink-0">{opt.label}.</span>
                          <span className="flex-1">{opt.term}</span>
                        </button>
                      );
                    })}
                  </div>

                  {isAnswered && (
                    <div className="mt-2 p-4 rounded-xl bg-[#000000] border border-white/10 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold">
                        {isCorrect ? (
                          <span className="text-[#52B788]">
                            ✓ 答對！正確答案：{q.correctLabel}. {q.targetTerm}
                          </span>
                        ) : (
                          <span className="text-[#F472B6]">
                            ✗ 答錯，正確答案：{q.correctLabel}. {q.targetTerm}
                          </span>
                        )}
                      </div>
                      {q.explanation && (
                        <p className="text-xs text-zinc-300 leading-relaxed">{q.explanation}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* 作答後顯示「下一題」或「本回合成績」 */}
                {isAnswered && !isLastQuestion && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextUnansweredIdx = questions.findIndex(
                        (item, idx) => idx > mcCurrentIndex && !mcSelections[item.id]
                      );
                      setMcCurrentIndex(
                        nextUnansweredIdx !== -1 ? nextUnansweredIdx : mcCurrentIndex + 1
                      );
                    }}
                    className="w-full py-3.5 rounded-2xl bg-white hover:bg-zinc-200 text-[#000000] font-bold text-sm transition cursor-pointer"
                  >
                    下一題（{mcCurrentIndex + 2} / {questions.length}）→
                  </button>
                )}

                {allMcAnswered && isLastQuestion && (
                  <div className="bg-[#000000] border border-[#52B788]/40 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-[#52B788]">
                        SESSION COMPLETED
                      </span>
                      <h3 className="text-xl font-bold text-white mt-0.5">
                        本回合成績：{correctMcCount} / {questions.length} 題正確
                      </h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          closeQuiz();
                          setActiveTab('history');
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#000000] border border-white/15 text-xs font-semibold text-white cursor-pointer"
                      >
                        <History className="w-3.5 h-3.5 text-[#52B788]" />
                        <span>查看作答記錄</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsSubmitted(false);
                          setMcSelections({});
                          setMcCurrentIndex(0);
                          setSessionSeed((s) => s + 1);
                        }}
                        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-[#000000] text-xs font-bold cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>根據最新記錄重新出題</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  // ==========================================================
  // 題型二：文意字彙 (首尾字母提示拼字填空) 互動與交卷邏輯
  // ==========================================================
  const { questions, selectionSummary } = sessionData;

  if (questions.length === 0) {
    const setQuizzes = quizBank.filter(
      (q) => activeQuiz.setId === 'all' || q.setId === activeQuiz.setId
    );
    const mcCount = setQuizzes.filter((q) => q.type === 'multiple_choice_cloze').length;
    const wbCount = setQuizzes.filter((q) => q.type === 'word_bank_cloze').length;
    const lhCount = setQuizzes.filter((q) => q.type === 'letter_hint_cloze').length;

    return (
      <div className="fixed inset-0 z-50 bg-[#000000] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#000000] border border-white/10 rounded-2xl p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-[#FBBF24]/15 text-[#FBBF24] flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">此題型目前沒有可抽題目</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            此單字集目前共有 {setQuizzes.length} 題（文意字彙 {lhCount} 題、單句克漏字 {mcCount} 題、文意選填 {wbCount} 題）。
          </p>
          <div className="flex flex-col gap-2 pt-2">
            {mcCount > 0 && (
              <button
                onClick={() => {
                  closeQuiz();
                  setTimeout(() => {
                    setActiveTab('home');
                  }, 50);
                }}
                className="w-full px-4 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-[#000000] text-xs font-bold cursor-pointer"
              >
                返回首頁切換為「單句克漏字 ({mcCount} 題)」
              </button>
            )}
            <button
              onClick={closeQuiz}
              className="w-full px-4 py-2.5 rounded-xl bg-[#000000] border border-white/10 text-xs font-semibold text-zinc-300 hover:text-white cursor-pointer"
            >
              關閉
            </button>
          </div>
        </div>
      </div>
    );
  }

  const answeredLhCount = questions.filter((_, idx) => Boolean(lhSubmittedMap[String(idx)])).length;
  const correctLhCount = questions.filter((q, idx) => {
    if (!lhSubmittedMap[String(idx)]) return false;
    return checkLetterHintAnswer(letterHintInputs[String(idx)] || '', q.targetTerm || '', q.baseTerm);
  }).length;
  const wrongLhCount = answeredLhCount - correctLhCount;
  const allLhAnswered = questions.length > 0 && answeredLhCount === questions.length;

  const handleSubmitSingleLh = (idx: number, q: (typeof questions)[number]) => {
    const key = String(idx);
    if (lhSubmittedMap[key]) return;
    const userAns = (letterHintInputs[key] || '').trim();
    const isCorrect = checkLetterHintAnswer(userAns, q.targetTerm || '', q.baseTerm);

    setLhSubmittedMap((prev) => ({ ...prev, [key]: true }));
    if (isCorrect) {
      updateSettings({
        questionRatings: {
          ...(settings.questionRatings || {}),
          [q.questionHash]: 5,
        },
      });
    }
    recordQuizSubmission([
      {
        wordId: q.wordId,
        setId: q.setId,
        questionType: 'letter_hint_cloze',
        questionHash: q.questionHash,
        userAnswer: userAns || '(未填答)',
        isCorrect,
      },
    ]);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#000000] overflow-hidden touch-none pt-10 sm:pt-16 px-4">
      <div className="w-full max-w-[760px] mx-auto space-y-4">
        {/* Minimal Top Bar (Unified with Multiple Choice) */}
        <div className="flex items-center justify-end gap-2">
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#F472B6]/20 text-[#F472B6]">
            ✗ {wrongLhCount}
          </span>
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#52B788]/20 text-[#52B788]">
            ✓ {correctLhCount}
          </span>
          <button
            onClick={closeQuiz}
            className="p-2 rounded-xl bg-[#000000] hover:bg-white/10 text-zinc-400 hover:text-white border border-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 進度條 */}
        <div className="w-full h-2 rounded-full bg-[#000000] overflow-hidden border border-white/10">
          <div
            className="h-full bg-white transition-all duration-300"
            style={{
              width: `${questions.length > 0 ? Math.round(((lhCurrentIndex + 1) / questions.length) * 100) : 0}%`,
            }}
          />
        </div>

        {(() => {
          const q = questions[lhCurrentIndex];
          if (!q) return null;
          const key = String(lhCurrentIndex);
          const isQuestionSubmitted = Boolean(lhSubmittedMap[key]);
          const maskedHint = generateLetterHintMask(q.targetTerm);
          const isMultiWord = (q.targetTerm || '').trim().includes(' ');
          const userVal = letterHintInputs[key] || '';
          const isCorrect =
            isQuestionSubmitted &&
            checkLetterHintAnswer(userVal, q.targetTerm || '', q.baseTerm);

          const cleanSentence = (q.sentence || '')
            .replace(/[a-zA-Z]*\{\{BLANK\}\}[a-zA-Z]*/g, '{{BLANK}}')
            .replace(/[a-zA-Z]*_{3,}[a-zA-Z]*/g, '{{BLANK}}');
          const parts = cleanSentence.split('{{BLANK}}');
          const isLastQuestion = lhCurrentIndex >= questions.length - 1;

          return (
            <div className="space-y-4">
              <div
                key={q.id}
                className={`bg-[#000000] border rounded-2xl p-6 space-y-4 transition ${
                  !isQuestionSubmitted
                    ? 'border-white/10'
                    : isCorrect
                      ? 'border-[#52B788]/50'
                      : 'border-[#F472B6]/50'
                }`}
              >
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="font-bold text-white">
                    第 {lhCurrentIndex + 1} / {questions.length} 題
                  </span>
                  <span className="text-xs px-2.5 py-0.5 rounded-md bg-white/5 text-zinc-400">
                    {q.pos} {isMultiWord ? '多字片語' : '單字'}
                  </span>
                </div>

                <p className="text-base text-zinc-100 leading-relaxed">
                  {parts[0]}
                  <span className="inline-block mx-1.5 px-3 py-0.5 rounded-lg bg-[#000000] border border-[#52B788]/40 text-[#52B788] font-mono font-bold">
                    {maskedHint}
                  </span>
                  {parts[1]}
                </p>

                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    id={`letter-hint-input-${lhCurrentIndex + 1}`}
                    type="text"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    disabled={isQuestionSubmitted}
                    value={userVal}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (!isQuestionSubmitted && userVal.trim()) {
                          handleSubmitSingleLh(lhCurrentIndex, q);
                        }
                      }
                    }}
                    onChange={(e) =>
                      setLetterHintInputs((prev) => ({
                        ...prev,
                        [key]: e.target.value,
                      }))
                    }
                    placeholder={isMultiWord ? '輸入完整多字片語' : '輸入完整單字拼字'}
                    className={`flex-1 px-4 py-3 rounded-xl bg-[#000000] border text-sm font-mono text-white focus:outline-none transition ${
                      !isQuestionSubmitted
                        ? 'border-white/15 focus:border-[#52B788]'
                        : isCorrect
                          ? 'border-[#52B788] text-[#52B788]'
                          : 'border-[#F472B6] text-[#F472B6]'
                    }`}
                  />
                  {!isQuestionSubmitted && (
                    <button
                      type="button"
                      onClick={() => handleSubmitSingleLh(lhCurrentIndex, q)}
                      className="px-6 py-3 rounded-xl bg-white hover:bg-zinc-200 text-[#000000] text-sm font-bold transition cursor-pointer shrink-0"
                    >
                      確認答案
                    </button>
                  )}
                </div>

                {isQuestionSubmitted && (
                  <div className="mt-2 p-4 rounded-xl bg-[#000000] border border-white/10 space-y-2">
                    <div className="flex flex-wrap items-center gap-2.5 text-xs font-bold">
                      {isCorrect ? (
                        <span className="text-[#52B788]">
                          ✓ 拼字正確！正確拼字：{q.targetTerm}
                        </span>
                      ) : isNearMissSpelling(userVal, q.targetTerm || '', q.baseTerm) ? (
                        <span className="text-[#FBBF24]">
                          ≈ 差一點就對了！正確拼字：{q.targetTerm}
                        </span>
                      ) : (
                        <span className="text-[#F472B6]">
                          ✗ 答錯，正確拼字：{q.targetTerm}
                        </span>
                      )}
                      {q.chineseHint && (
                        <span className="text-zinc-400 font-normal">
                          （{q.pos} {q.chineseHint}）
                        </span>
                      )}
                    </div>
                    {q.explanation && (
                      <p className="text-xs text-zinc-300 leading-relaxed">{q.explanation}</p>
                    )}
                  </div>
                )}
              </div>

              {isQuestionSubmitted && !isLastQuestion && (
                <button
                  type="button"
                  onClick={() => setLhCurrentIndex((i) => i + 1)}
                  className="w-full py-3.5 rounded-2xl bg-white hover:bg-zinc-200 text-[#000000] font-bold text-sm transition cursor-pointer"
                >
                  下一題（{lhCurrentIndex + 2} / {questions.length}）→
                </button>
              )}

              {allLhAnswered && isLastQuestion && (
                <div className="bg-[#000000] border border-[#52B788]/40 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#52B788]">
                      SESSION COMPLETED
                    </span>
                    <h3 className="text-xl font-bold text-white mt-0.5">
                      本回合成績：{correctLhCount} / {questions.length} 題正確
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        closeQuiz();
                        setActiveTab('history');
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#000000] border border-white/15 text-xs font-semibold text-white cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5 text-[#52B788]" />
                      <span>查看作答記錄</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLetterHintInputs({});
                        setLhSubmittedMap({});
                        setLhCurrentIndex(0);
                        setSessionSeed((s) => s + 1);
                      }}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-[#000000] text-xs font-bold cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>根據最新記錄重新出題</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
