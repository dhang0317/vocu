'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { QuestionType, WordItem } from '@/types/vocu';

type Mode = 'zh_to_en_choice' | 'en_to_zh_choice';
type Entry = {
  wordId: string;
  setId: string;
  questionType: QuestionType;
  questionHash: string;
  userAnswer: string;
  isCorrect: boolean;
};

interface Question {
  word: WordItem;
  prompt: string;
  promptSub: string;
  options: { label: string; text: string; isCorrect: boolean }[];
}

const LABELS = ['A', 'B', 'C', 'D'];
const shuffle = <T,>(arr: T[]) => [...arr].sort(() => Math.random() - 0.5);

function buildQuestions(mode: Mode, setId: string, words: WordItem[]): Question[] {
  const valid = words.filter((w) => w.term?.trim() && w.definition?.trim());
  const pool = setId === 'all' ? valid : valid.filter((w) => w.setId === setId);
  const text = (w: WordItem) => (mode === 'zh_to_en_choice' ? w.term.trim() : w.definition.trim());

  return shuffle(pool)
    .map((word): Question | null => {
      const correct = text(word);
      const others = valid.filter((w) => w.id !== word.id && text(w) !== correct);
      const samePos = shuffle(others.filter((w) => w.setId === word.setId && w.pos === word.pos));
      const sameSet = shuffle(others.filter((w) => w.setId === word.setId));
      const ordered = [...samePos, ...sameSet, ...shuffle(others)];
      const seen = new Set([correct]);
      const distractors: string[] = [];
      for (const w of ordered) {
        const t = text(w);
        if (seen.has(t)) continue;
        seen.add(t);
        distractors.push(t);
        if (distractors.length === 3) break;
      }
      if (distractors.length < 3) return null;
      const options = shuffle([
        { text: correct, isCorrect: true },
        ...distractors.map((t) => ({ text: t, isCorrect: false })),
      ]).map((o, i) => ({ ...o, label: LABELS[i] }));
      return {
        word,
        prompt: mode === 'zh_to_en_choice' ? word.definition : word.term,
        promptSub: word.pos,
        options,
      };
    })
    .filter((q): q is Question => q !== null);
}

export function TranslationChoiceQuiz({
  mode,
  setId,
  words,
  onClose,
  onRecord,
}: {
  mode: Mode;
  setId: string;
  words: WordItem[];
  onClose: () => void;
  onRecord: (entries: Entry[]) => void;
}) {
  // 僅於開始時組題一次，避免作答後單字權重更新造成題目重組
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const questions = useMemo(() => buildQuestions(mode, setId, words), [mode, setId]);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<Record<number, string>>({});

  const correctCount = questions.filter((q, i) => q.options.find((o) => o.label === chosen[i])?.isCorrect).length;
  const answered = Object.keys(chosen).length;

  if (questions.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-[#000000] flex items-center justify-center p-4">
        <div className="max-w-md w-full border border-white/10 rounded-2xl p-8 text-center space-y-4">
          <p className="text-sm text-zinc-300">此單字集的單字數不足（至少需要 4 個不同單字）。</p>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-white text-[#000000] text-xs font-bold cursor-pointer">
            返回
          </button>
        </div>
      </div>
    );
  }

  const q = questions[index];
  const picked = chosen[index];
  const isDone = index >= questions.length;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const select = (label: string) => {
    if (picked) return;
    const opt = q.options.find((o) => o.label === label)!;
    setChosen((p) => ({ ...p, [index]: label }));
    onRecord([
      {
        wordId: q.word.id,
        setId: q.word.setId,
        questionType: mode,
        questionHash: `${mode}-${q.word.id}`,
        userAnswer: `${label}. ${opt.text}`,
        isCorrect: opt.isCorrect,
      },
    ]);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (index + 1 >= questions.length) onClose();
      else setIndex((i) => i + 1);
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#000000] overflow-y-auto pt-3 sm:pt-5 px-4 pb-10">
      <div className="w-full max-w-[760px] mx-auto space-y-4">
        <div className="flex items-center justify-end gap-2">
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#F472B6]/20 text-[#F472B6]">✗ {answered - correctCount}</span>
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#52B788]/20 text-[#52B788]">✓ {correctCount}</span>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-zinc-400 hover:text-white border border-white/10 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="w-full h-2 rounded-full overflow-hidden border border-white/10">
          <div className="h-full bg-white transition-all" style={{ width: `${Math.round(((index + 1) / questions.length) * 100)}%` }} />
        </div>

        {isDone ? null : (
          <div className="border border-white/10 rounded-2xl p-6 space-y-5">
            <div className="text-xs font-bold text-white">
              第 {index + 1} / {questions.length} 題・{mode === 'zh_to_en_choice' ? '看中選英' : '看英選中'}
            </div>
            <div className="text-center py-4">
              <div className="text-2xl font-bold text-white">{q.prompt}</div>
              {q.promptSub && <div className="text-xs text-zinc-500 mt-1">{q.promptSub}</div>}
            </div>
            <div className="space-y-2.5">
              {q.options.map((opt) => {
                let style = 'border-white/10 text-zinc-200 hover:border-[#52B788]/60 hover:bg-white/[0.03]';
                if (picked) {
                  if (opt.isCorrect) style = 'border-[#52B788] text-[#52B788] font-bold';
                  else if (picked === opt.label) style = 'border-[#EF4444] text-[#EF4444] font-bold';
                  else style = 'border-white/10 text-zinc-500';
                }
                return (
                  <button
                    key={opt.label}
                    type="button"
                    disabled={Boolean(picked)}
                    onClick={() => select(opt.label)}
                    className={`w-full text-left px-4 py-3.5 rounded-xl border text-sm transition flex items-center gap-3 ${picked ? 'cursor-default' : 'cursor-pointer'} ${style}`}
                  >
                    <span className="font-mono font-bold w-6 shrink-0">{opt.label}.</span>
                    <span>{opt.text}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={!picked}
                onClick={() => (index + 1 >= questions.length ? onClose() : setIndex(index + 1))}
                className="px-6 py-2.5 rounded-xl bg-white text-[#000000] text-xs font-bold disabled:opacity-40 cursor-pointer"
              >
                {index + 1 >= questions.length ? '完成' : '下一題'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
