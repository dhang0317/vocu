'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  WordSet,
  WordItem,
  PracticeLog,
  QuizItem,
  UserSettings,
  QuestionType,
  SetIconKey,
} from '@/types/vocu';
import {
  INITIAL_WORD_SETS,
  INITIAL_WORDS,
  INITIAL_PRACTICE_LOGS,
  INITIAL_QUIZ_BANK,
  INITIAL_USER_SETTINGS,
} from '@/lib/seedData';
import {
  subscribeWorkspaceFromFirestore,
  saveWorkspaceToFirestore,
} from '@/lib/firestoreSync';

export type NavTab = 'home' | 'vocab' | 'history' | 'profile';

export interface ActiveQuizConfig {
  setId: string;
  questionType: QuestionType;
  onlyWrongWords?: boolean;
  questionCount?: number;
}

interface VocuContextType {
  isHydrated: boolean;
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;

  wordSets: WordSet[];
  words: WordItem[];
  practiceLogs: PracticeLog[];
  quizBank: QuizItem[];
  settings: UserSettings;

  recentSetId: string;
  setRecentSetId: (id: string) => void;

  activeQuiz: ActiveQuizConfig | null;
  startQuiz: (config: ActiveQuizConfig) => void;
  closeQuiz: () => void;

  // WordSet CRUD
  addWordSet: (data: { title: string; color: string; icon: SetIconKey }) => WordSet;
  updateWordSet: (id: string, data: { title: string; color: string; icon: SetIconKey }) => void;
  deleteWordSet: (id: string) => void;

  // WordItem CRUD & Batch Import
  addWord: (data: { setId: string; term: string; pos: string; definition: string }) => WordItem;
  updateWord: (id: string, data: { term: string; pos: string; definition: string }) => void;
  deleteWord: (id: string) => void;
  batchImportWords: (
    setId: string,
    items: Array<{ term: string; pos: string; definition: string }>
  ) => number;

  // Submit Quiz Results (writes PracticeLog & updates WordItem stats)
  recordQuizSubmission: (
    entries: Array<{
      wordId: string;
      setId: string;
      questionType: QuestionType;
      questionHash: string;
      userAnswer: string;
      isCorrect: boolean;
    }>
  ) => void;

  // MCP / Custom Quiz Ingestion
  addCustomQuizItem: (item: QuizItem) => void;

  // Settings & Data Backup
  updateSettings: (patch: Partial<UserSettings>) => void;
  exportBackupJson: () => string;
  importBackupJson: (jsonStr: string) => { success: boolean; message: string };
  resetToDemoData: () => void;
}

const STORAGE_KEYS = {
  SETS: 'vocu_word_sets_v1',
  WORDS: 'vocu_words_v1',
  LOGS: 'vocu_practice_logs_v1',
  QUIZZES: 'vocu_quiz_bank_v1',
  SETTINGS: 'vocu_user_settings_v1',
  RECENT_SET: 'vocu_recent_set_v1',
};

const VocuContext = createContext<VocuContextType | undefined>(undefined);

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function VocuProvider({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState<NavTab>('home');

  const [wordSets, setWordSets] = useState<WordSet[]>(() =>
    readStorage(STORAGE_KEYS.SETS, INITIAL_WORD_SETS)
  );
  const [words, setWords] = useState<WordItem[]>(() =>
    readStorage(STORAGE_KEYS.WORDS, INITIAL_WORDS)
  );
  const [practiceLogs, setPracticeLogs] = useState<PracticeLog[]>(() =>
    readStorage(STORAGE_KEYS.LOGS, INITIAL_PRACTICE_LOGS)
  );
  const [quizBank, setQuizBank] = useState<QuizItem[]>(() =>
    readStorage(STORAGE_KEYS.QUIZZES, INITIAL_QUIZ_BANK)
  );
  const [settings, setSettings] = useState<UserSettings>(() => ({
    ...INITIAL_USER_SETTINGS,
    ...readStorage(STORAGE_KEYS.SETTINGS, INITIAL_USER_SETTINGS),
  }));
  const [recentSetId, setRecentSetId] = useState<string>(() =>
    readStorage(STORAGE_KEYS.RECENT_SET, INITIAL_WORD_SETS[0].id)
  );

  const [activeQuiz, setActiveQuiz] = useState<ActiveQuizConfig | null>(null);
  const isHydrated = true;

  // Persist to LocalStorage on changes (safe against QuotaExceededError on mobile)
  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(STORAGE_KEYS.SETS, JSON.stringify(wordSets));
    } catch {}
  }, [wordSets, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(STORAGE_KEYS.WORDS, JSON.stringify(words));
    } catch {}
  }, [words, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(practiceLogs));
    } catch {}
  }, [practiceLogs, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(STORAGE_KEYS.QUIZZES, JSON.stringify(quizBank));
    } catch {}
  }, [quizBank, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch {}
  }, [settings, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(STORAGE_KEYS.RECENT_SET, recentSetId);
    } catch {}
  }, [recentSetId, isHydrated]);

  // Subscribe to Cloud Firestore in real time so MCP Agent pushes appear immediately
  const isRemoteUpdateRef = React.useRef(false);
  const hasMountedRef = React.useRef(false);

  useEffect(() => {
    const unsubscribe = subscribeWorkspaceFromFirestore((remote) => {
      isRemoteUpdateRef.current = true;
      if (Array.isArray(remote.wordSets)) setWordSets(remote.wordSets);
      if (Array.isArray(remote.words)) setWords(remote.words);
      if (Array.isArray(remote.practiceLogs)) setPracticeLogs(remote.practiceLogs);
      if (Array.isArray(remote.quizBank)) {
        const normalizedQuizzes = remote.quizBank.map((q) => {
          const raw = q as unknown as Record<string, unknown>;
          const t = String(raw.type || '').toLowerCase();

          let sentence = String(
            raw.sentence || raw.question || raw.prompt || raw.text || ''
          );
          if (sentence && !sentence.includes('{{BLANK}}') && /_{3,}/.test(sentence)) {
            sentence = sentence.replace(/_{3,}/, '{{BLANK}}');
          }
          const targetTerm = String(
            raw.targetTerm || raw.answer || raw.word || raw.term || ''
          );
          const chineseHint = String(
            raw.chineseHint || raw.hint || raw.definition || raw.translation || ''
          );

          if (t === 'word_bank_cloze' || (raw.passage && Array.isArray(raw.answers))) {
            return { ...raw, type: 'word_bank_cloze' as const };
          }
          if (t === 'multiple_choice_cloze' || (Array.isArray(raw.options) && raw.options.length === 4)) {
            const labels: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];
            const rawOpts = Array.isArray(raw.options) ? raw.options : [];
            const normalizedOptions = rawOpts.slice(0, 4).map((opt, idx) => {
              if (typeof opt === 'string') {
                return { label: labels[idx], term: opt.replace(/^[A-D][\.\)]\s*/i, '').trim() };
              }
              const obj = (opt || {}) as Record<string, unknown>;
              return {
                label: (String(obj.label || obj.letter || labels[idx]).toUpperCase().slice(0, 1) ||
                  labels[idx]) as 'A' | 'B' | 'C' | 'D',
                term: String(obj.term || obj.text || obj.value || obj.word || '').trim(),
              };
            });

            let correctLabel = String(raw.correctLabel || '').toUpperCase().slice(0, 1) as
              | 'A'
              | 'B'
              | 'C'
              | 'D';
            if (!['A', 'B', 'C', 'D'].includes(correctLabel)) {
              const matched = normalizedOptions.find(
                (o) => o.term.toLowerCase() === targetTerm.trim().toLowerCase()
              );
              correctLabel = matched ? matched.label : 'A';
            }

            return {
              ...raw,
              type: 'multiple_choice_cloze' as const,
              sentence,
              targetTerm,
              options: normalizedOptions,
              correctLabel,
            };
          }
          return {
            ...raw,
            type: 'letter_hint_cloze' as const,
            sentence,
            targetTerm,
            baseTerm: String(raw.baseTerm || targetTerm),
            pos: String(raw.pos || ''),
            chineseHint,
          };
        });
        setQuizBank(normalizedQuizzes as QuizItem[]);
      }
      if (remote.settings) setSettings({ ...INITIAL_USER_SETTINGS, ...remote.settings });
      setTimeout(() => {
        isRemoteUpdateRef.current = false;
      }, 100);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    if (isRemoteUpdateRef.current) return;

    const timer = setTimeout(() => {
      saveWorkspaceToFirestore({
        wordSets,
        words,
        practiceLogs,
        quizBank,
        settings,
        updatedAt: new Date().toISOString(),
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [wordSets, words, practiceLogs, quizBank, settings]);

  const startQuiz = useCallback((config: ActiveQuizConfig) => {
    if (config.setId !== 'all') {
      setRecentSetId(config.setId);
    }
    setActiveQuiz(config);
  }, []);

  const closeQuiz = useCallback(() => {
    setActiveQuiz(null);
  }, []);

  const addWordSet = useCallback(
    (data: { title: string; color: string; icon: SetIconKey }): WordSet => {
      const newSet: WordSet = {
        id: `set-${Date.now()}`,
        title: data.title.trim(),
        color: data.color,
        icon: data.icon,
        createdAt: new Date().toISOString(),
      };
      setWordSets((prev) => [newSet, ...prev]);
      setRecentSetId(newSet.id);
      return newSet;
    },
    []
  );

  const updateWordSet = useCallback(
    (id: string, data: { title: string; color: string; icon: SetIconKey }) => {
      setWordSets((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, title: data.title.trim(), color: data.color, icon: data.icon }
            : s
        )
      );
    },
    []
  );

  const deleteWordSet = useCallback((id: string) => {
    setWordSets((prev) => prev.filter((s) => s.id !== id));
    setWords((prev) => prev.filter((w) => w.setId !== id));
    setPracticeLogs((prev) => prev.filter((l) => l.setId !== id));
    setQuizBank((prev) => prev.filter((q) => q.setId !== id));
  }, []);

  const addWord = useCallback(
    (data: { setId: string; term: string; pos: string; definition: string }): WordItem => {
      const newWord: WordItem = {
        id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        setId: data.setId,
        term: data.term.trim(),
        pos: data.pos.trim() || 'n.',
        definition: data.definition.trim(),
        wrongCount: 0,
        consecutiveCorrect: 0,
        lastSeenAt: null,
      };
      setWords((prev) => [newWord, ...prev]);
      return newWord;
    },
    []
  );

  const updateWord = useCallback(
    (id: string, data: { term: string; pos: string; definition: string }) => {
      setWords((prev) =>
        prev.map((w) =>
          w.id === id
            ? {
                ...w,
                term: data.term.trim(),
                pos: data.pos.trim() || 'n.',
                definition: data.definition.trim(),
              }
            : w
        )
      );
    },
    []
  );

  const deleteWord = useCallback((id: string) => {
    setWords((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const batchImportWords = useCallback(
    (setId: string, items: Array<{ term: string; pos: string; definition: string }>): number => {
      const valid = items.filter((item) => item.term.trim() && item.definition.trim());
      if (valid.length === 0) return 0;

      const created: WordItem[] = valid.map((item, idx) => ({
        id: `w-batch-${Date.now()}-${idx}`,
        setId,
        term: item.term.trim(),
        pos: item.pos.trim() || 'n.',
        definition: item.definition.trim(),
        wrongCount: 0,
        consecutiveCorrect: 0,
        lastSeenAt: null,
      }));

      setWords((prev) => [...created, ...prev]);
      return created.length;
    },
    []
  );

  const recordQuizSubmission = useCallback(
    (
      entries: Array<{
        wordId: string;
        setId: string;
        questionType: QuestionType;
        questionHash: string;
        userAnswer: string;
        isCorrect: boolean;
      }>
    ) => {
      const nowIso = new Date().toISOString();

      const newLogs: PracticeLog[] = entries.map((entry, idx) => ({
        id: `log-${Date.now()}-${idx}`,
        wordId: entry.wordId,
        setId: entry.setId,
        questionType: entry.questionType,
        questionHash: entry.questionHash,
        userAnswer: entry.userAnswer,
        isCorrect: entry.isCorrect,
        answeredAt: nowIso,
      }));

      setPracticeLogs((prev) => [...newLogs, ...prev]);

      // 同步更新每個單字在 WordItem 的 wrongCount, consecutiveCorrect, lastSeenAt
      const resultByWordId = new Map<string, boolean>();
      entries.forEach((e) => {
        resultByWordId.set(e.wordId, e.isCorrect);
      });

      setWords((prev) =>
        prev.map((w) => {
          if (!resultByWordId.has(w.id)) return w;
          const isCorrect = resultByWordId.get(w.id)!;
          return {
            ...w,
            wrongCount: isCorrect ? w.wrongCount : w.wrongCount + 1,
            consecutiveCorrect: isCorrect ? w.consecutiveCorrect + 1 : 0,
            lastSeenAt: nowIso,
          };
        })
      );
    },
    []
  );

  const addCustomQuizItem = useCallback((item: QuizItem) => {
    setQuizBank((prev) => [item, ...prev]);
  }, []);

  const updateSettings = useCallback((patch: Partial<UserSettings>) => {
    setSettings((prev) => ({
      ...prev,
      ...patch,
    }));
  }, []);

  const exportBackupJson = useCallback(() => {
    const payload = {
      app: 'Vocu',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      wordSets,
      words,
      practiceLogs,
      quizBank,
      settings,
    };
    return JSON.stringify(payload, null, 2);
  }, [wordSets, words, practiceLogs, quizBank, settings]);

  const importBackupJson = useCallback(
    (jsonStr: string): { success: boolean; message: string } => {
      try {
        const parsed = JSON.parse(jsonStr);
        if (!Array.isArray(parsed.wordSets) || !Array.isArray(parsed.words)) {
          return {
            success: false,
            message: 'JSON 格式不正確：缺少 wordSets 或 words 欄位',
          };
        }
        setWordSets(parsed.wordSets);
        setWords(parsed.words);
        if (Array.isArray(parsed.practiceLogs)) setPracticeLogs(parsed.practiceLogs);
        if (Array.isArray(parsed.quizBank)) setQuizBank(parsed.quizBank);
        if (parsed.settings) setSettings({ ...INITIAL_USER_SETTINGS, ...parsed.settings });
        if (parsed.wordSets[0]?.id) setRecentSetId(parsed.wordSets[0].id);
        return {
          success: true,
          message: `成功匯入 ${parsed.wordSets.length} 個單字集、${parsed.words.length} 個單字與 ${parsed.practiceLogs?.length ?? 0} 筆作答記錄！`,
        };
      } catch {
        return {
          success: false,
          message: '無法解析 JSON 檔案，請確認檔案格式是否有效。',
        };
      }
    },
    []
  );

  const resetToDemoData = useCallback(() => {
    setWordSets(INITIAL_WORD_SETS);
    setWords(INITIAL_WORDS);
    setPracticeLogs(INITIAL_PRACTICE_LOGS);
    setQuizBank(INITIAL_QUIZ_BANK);
    setSettings(INITIAL_USER_SETTINGS);
    setRecentSetId(INITIAL_WORD_SETS[0].id);
  }, []);

  return (
    <VocuContext.Provider
      value={{
        isHydrated,
        activeTab,
        setActiveTab,
        wordSets,
        words,
        practiceLogs,
        quizBank,
        settings,
        recentSetId,
        setRecentSetId,
        activeQuiz,
        startQuiz,
        closeQuiz,
        addWordSet,
        updateWordSet,
        deleteWordSet,
        addWord,
        updateWord,
        deleteWord,
        batchImportWords,
        recordQuizSubmission,
        addCustomQuizItem,
        updateSettings,
        exportBackupJson,
        importBackupJson,
        resetToDemoData,
      }}
    >
      {children}
    </VocuContext.Provider>
  );
}

export function useVocu() {
  const ctx = useContext(VocuContext);
  if (!ctx) {
    throw new Error('useVocu must be used within a VocuProvider');
  }
  return ctx;
}
