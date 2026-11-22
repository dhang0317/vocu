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
  loadWorkspaceFromFirestore,
  saveWorkspaceToFirestore,
  loadMcpQuizzesFromSubcollection,
  saveMcpQuizzesToSubcollection,
} from '@/lib/firestoreSync';
import { computeQuestionHash } from '@/lib/masking';

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

  // Persist lightweight state to LocalStorage (debounced 1500ms; quizBank is loaded from Firestore subcollection)
  useEffect(() => {
    if (!isHydrated) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEYS.SETS, JSON.stringify(wordSets));
        localStorage.setItem(STORAGE_KEYS.WORDS, JSON.stringify(words));
        localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(practiceLogs));
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
        localStorage.setItem(STORAGE_KEYS.RECENT_SET, recentSetId);
      } catch {}
    }, 1500);
    return () => clearTimeout(t);
  }, [wordSets, words, practiceLogs, settings, recentSetId, isHydrated]);

  // Load from Cloud Firestore once on mount (saves 90%+ network traffic vs real-time onSnapshot)
  const isRemoteUpdateRef = React.useRef(false);
  const hasMountedRef = React.useRef(false);

  useEffect(() => {
    let active = true;
    loadWorkspaceFromFirestore().then((remote) => {
      if (!active || !remote) return;
      isRemoteUpdateRef.current = true;
      if (Array.isArray(remote.wordSets)) setWordSets(remote.wordSets);
      if (Array.isArray(remote.words)) setWords(remote.words);
      if (Array.isArray(remote.practiceLogs)) setPracticeLogs(remote.practiceLogs);
      if (Array.isArray(remote.quizBank)) {
        const remoteWords = Array.isArray(remote.words) ? remote.words : [];
        const wordById = new Map(remoteWords.map((w) => [w.id, w]));
        const wordByTerm = new Map(
          remoteWords.map((w) => [String(w.term || '').trim().toLowerCase(), w])
        );

        const normalizedQuizzes = remote.quizBank.map((q) => {
          const raw = q as unknown as Record<string, unknown>;
          const t = String(raw.type || '').toLowerCase();

          let sentence = String(
            raw.sentence || raw.question || raw.prompt || raw.text || ''
          );
          if (sentence && !sentence.includes('{{BLANK}}') && /_{3,}/.test(sentence)) {
            sentence = sentence.replace(
              /[a-zA-Z]*_{3,}[a-zA-Z]*(?:\s+[a-zA-Z]*_{3,}[a-zA-Z]*)*/,
              '{{BLANK}}'
            );
          }
          const targetTerm = String(
            raw.targetTerm || raw.answer || raw.word || raw.term || ''
          );
          const matchedWord =
            (raw.wordId ? wordById.get(String(raw.wordId)) : undefined) ||
            (targetTerm ? wordByTerm.get(targetTerm.trim().toLowerCase()) : undefined);

          const rawPos = String(raw.pos || matchedWord?.pos || '').trim();
          let chineseHint = String(
            raw.chineseHint || raw.meaning || raw.definition || raw.hint || raw.translation || ''
          ).trim();
          // 若 chineseHint 為空或誤填為詞性（如 "n."），自動從單字庫補回正確中文釋義
          if (
            (!chineseHint || chineseHint === rawPos || /^[a-z./]+\.?$/i.test(chineseHint)) &&
            matchedWord?.definition
          ) {
            chineseHint = matchedWord.definition;
          }

          const questionHash =
            String(raw.questionHash || '').trim() ||
            computeQuestionHash(String(raw.passage || sentence || raw.id || targetTerm));

          const resolvedWordId = String(raw.wordId || matchedWord?.id || '');

          if (t === 'word_bank_cloze' || (raw.passage && Array.isArray(raw.answers))) {
            return { ...raw, type: 'word_bank_cloze' as const, questionHash };
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

            // 依 questionHash 確定性洗牌 4 個選項，避免正確答案永遠集中在 A
            const terms = normalizedOptions.map((o) => o.term);
            const seed = questionHash
              .split('')
              .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
            const shuffledTerms = [...terms];
            for (let i = shuffledTerms.length - 1; i > 0; i--) {
              const j = (seed + i * 7) % (i + 1);
              [shuffledTerms[i], shuffledTerms[j]] = [shuffledTerms[j], shuffledTerms[i]];
            }
            const shuffledOptions = labels.map((label, idx) => ({
              label,
              term: shuffledTerms[idx] || '',
            }));

            const targetLower = (
              targetTerm ||
              normalizedOptions.find((o) => o.label === correctLabel)?.term ||
              ''
            )
              .trim()
              .toLowerCase();
            const matchedAfterShuffle = shuffledOptions.find(
              (o) => o.term.trim().toLowerCase() === targetLower
            );
            const finalCorrectLabel = matchedAfterShuffle ? matchedAfterShuffle.label : 'A';

            return {
              ...raw,
              type: 'multiple_choice_cloze' as const,
              wordId: resolvedWordId,
              sentence,
              targetTerm,
              options: shuffledOptions,
              correctLabel: finalCorrectLabel,
              questionHash,
            };
          }
          return {
            ...raw,
            type: 'letter_hint_cloze' as const,
            wordId: resolvedWordId,
            sentence,
            targetTerm,
            baseTerm: String(raw.baseTerm || targetTerm),
            pos: rawPos,
            chineseHint,
            questionHash,
          };
        });
        const typedQuizzes = normalizedQuizzes as QuizItem[];
        setQuizBank((prev) => {
          const map = new Map(prev.map((q) => [q.id, q]));
          typedQuizzes.forEach((item) => map.set(item.id, item));
          return Array.from(map.values());
        });

        // 自動將主文件內的舊題庫遷移至 quizzes 子集合，釋放主文件 1MB 空間
        if (typedQuizzes.length > 0) {
          saveMcpQuizzesToSubcollection(typedQuizzes).then((res) => {
            if (res.ok) {
              saveWorkspaceToFirestore({
                wordSets: Array.isArray(remote.wordSets) ? remote.wordSets : wordSets,
                words: Array.isArray(remote.words) ? remote.words : words,
                practiceLogs: Array.isArray(remote.practiceLogs)
                  ? remote.practiceLogs
                  : practiceLogs,
                quizBank: [],
                settings: remote.settings || settings,
                updatedAt: new Date().toISOString(),
              });
            }
          });
        }
      }
      if (remote.settings) setSettings({ ...INITIAL_USER_SETTINGS, ...remote.settings });
      setTimeout(() => {
        isRemoteUpdateRef.current = false;
      }, 100);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    // 若本地 24 小時內已快取子集合題庫，直接使用快取，省下每次重整下載 1,200+ 筆 Firestore 文件的流量
    const CACHE_KEY = 'vocu_sub_quizzes_cache_v2';
    const CACHE_TS_KEY = 'vocu_sub_quizzes_ts_v2';
    try {
      const ts = Number(localStorage.getItem(CACHE_TS_KEY) || '0');
      const cachedRaw = localStorage.getItem(CACHE_KEY);
      if (cachedRaw && Date.now() - ts < 1000 * 60 * 60 * 24) {
        const parsed = JSON.parse(cachedRaw) as QuizItem[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setQuizBank((prev) => {
            const map = new Map(prev.map((q) => [q.id, q]));
            parsed.forEach((item) => map.set(item.id, item));
            return Array.from(map.values());
          });
          return;
        }
      }
    } catch {}

    loadMcpQuizzesFromSubcollection().then((subItems) => {
      if (!active || subItems.length === 0) return;
      isRemoteUpdateRef.current = true;
      const labels: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];
      const normalizedSub = subItems.map((q) => {
        const raw = q as unknown as Record<string, unknown>;
        const t = String(raw.type || '').toLowerCase();
        let sentence = String(raw.sentence || raw.question || raw.prompt || raw.text || '');
        if (sentence && !sentence.includes('{{BLANK}}') && /_{3,}/.test(sentence)) {
          sentence = sentence.replace(
            /[a-zA-Z]*_{3,}[a-zA-Z]*(?:\s+[a-zA-Z]*_{3,}[a-zA-Z]*)*/,
            '{{BLANK}}'
          );
        }
        const targetTerm = String(raw.targetTerm || raw.answer || raw.word || raw.term || '');
        const questionHash =
          String(raw.questionHash || '').trim() ||
          computeQuestionHash(String(raw.passage || sentence || raw.id || targetTerm));

        if (t === 'word_bank_cloze' || (raw.passage && Array.isArray(raw.answers))) {
          const wbLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
          const rawOpts = Array.isArray(raw.options) ? raw.options : [];
          const normalizedWbOptions = rawOpts.slice(0, 10).map((opt, idx) => {
            if (typeof opt === 'string') {
              return {
                letter: wbLetters[idx],
                wordId: `wb-${idx}`,
                term: opt.replace(/^\(?[A-J]\)?[\.\s]*/i, '').trim(),
                pos: '',
                definition: '',
              };
            }
            const obj = (opt || {}) as Record<string, unknown>;
            return {
              letter: String(obj.letter || obj.label || wbLetters[idx])
                .replace(/[()]/g, '')
                .toUpperCase()
                .slice(0, 1),
              wordId: String(obj.wordId || obj.word_id || `wb-${idx}`),
              term: String(obj.term || obj.word || obj.text || obj.value || '').trim(),
              pos: String(obj.pos || ''),
              definition: String(obj.definition || obj.meaning || ''),
              correctBlankIndex:
                typeof obj.correctBlankIndex === 'number' ? obj.correctBlankIndex : undefined,
            };
          });

          const rawAns = Array.isArray(raw.answers) ? raw.answers : [];
          const normalizedWbAnswers = rawAns.map((ans, idx) => {
            const obj = (ans || {}) as Record<string, unknown>;
            return {
              blankNumber: Number(obj.blankNumber || obj.blank_index || idx + 1),
              optionLetter: String(obj.optionLetter || obj.letter || obj.answer || '')
                .replace(/[()]/g, '')
                .toUpperCase()
                .slice(0, 1),
              wordId: String(obj.wordId || obj.word_id || `wb-${idx}`),
              term: String(obj.term || obj.word || obj.text || '').trim(),
              explanation: String(obj.explanation || ''),
            };
          });

          return {
            ...raw,
            type: 'word_bank_cloze' as const,
            options: normalizedWbOptions,
            answers: normalizedWbAnswers,
            questionHash,
          } as QuizItem;
        }
        if (t === 'multiple_choice_cloze' || (Array.isArray(raw.options) && raw.options.length === 4)) {
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
          // 優先以 targetTerm 對應正確選項的 label（避免 AI 傳了洗牌後選項但 correctLabel 仍固定填 'A'）
          const matchedByTerm = targetTerm
            ? normalizedOptions.find(
                (o) => o.term.trim().toLowerCase() === targetTerm.trim().toLowerCase()
              )
            : undefined;

          let correctLabel = (
            matchedByTerm?.label ||
            String(raw.correctLabel || '').toUpperCase().slice(0, 1)
          ) as 'A' | 'B' | 'C' | 'D';
          if (!['A', 'B', 'C', 'D'].includes(correctLabel)) {
            correctLabel = 'A';
          }

          // 若洗牌順序過於固定，依 questionHash 洗牌並同步更新 correctLabel
          const terms = normalizedOptions.map((o) => o.term);
          const seed = questionHash
            .split('')
            .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
          const shuffledTerms = [...terms];
          for (let i = shuffledTerms.length - 1; i > 0; i--) {
            const j = (seed + i * 7) % (i + 1);
            [shuffledTerms[i], shuffledTerms[j]] = [shuffledTerms[j], shuffledTerms[i]];
          }
          const shuffledOptions = labels.map((label, idx) => ({
            label,
            term: shuffledTerms[idx] || '',
          }));
          const correctTermStr =
            (matchedByTerm?.term ||
              normalizedOptions.find((o) => o.label === correctLabel)?.term ||
              targetTerm)
              .trim()
              .toLowerCase();
          const finalMatched = shuffledOptions.find(
            (o) => o.term.trim().toLowerCase() === correctTermStr
          );
          const finalCorrectLabel = finalMatched ? finalMatched.label : correctLabel;

          return {
            ...raw,
            type: 'multiple_choice_cloze' as const,
            sentence,
            targetTerm: finalMatched?.term || targetTerm,
            options: shuffledOptions,
            correctLabel: finalCorrectLabel,
            questionHash,
          } as QuizItem;
        }
        return {
          ...raw,
          type: 'letter_hint_cloze' as const,
          sentence,
          targetTerm,
          baseTerm: String(raw.baseTerm || targetTerm),
          pos: String(raw.pos || ''),
          chineseHint: String(raw.chineseHint || raw.meaning || raw.definition || ''),
          questionHash,
        } as QuizItem;
      });
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(normalizedSub));
        localStorage.setItem(CACHE_TS_KEY, String(Date.now()));
      } catch {}
      setQuizBank((prev) => {
        const map = new Map(prev.map((q) => [q.id, q]));
        normalizedSub.forEach((item) => map.set(item.id, item));
        return Array.from(map.values());
      });
      setTimeout(() => {
        isRemoteUpdateRef.current = false;
      }, 100);
    });
    return () => {
      active = false;
    };
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
        quizBank: [],
        settings,
        updatedAt: new Date().toISOString(),
      });
    }, 15000);
    return () => clearTimeout(timer);
  }, [wordSets, words, practiceLogs, settings]);

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
