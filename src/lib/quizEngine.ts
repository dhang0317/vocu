import {
  WordItem,
  PracticeLog,
  QuizItem,
  LetterHintClozeQuiz,
  WordBankClozeQuiz,
  MultipleChoiceClozeQuiz,
  WordWeightStatus,
  UserSettings,
} from '@/types/vocu';

export interface WordPriorityAnalysis {
  word: WordItem;
  status: WordWeightStatus;
  priorityTier: 1 | 2 | 3 | 4;
  statusLabel: string;
  reasonText: string;
}

export function analyzeWordPriority(
  word: WordItem,
  _logs?: PracticeLog[],
  _cooldownThreshold?: number
): WordPriorityAnalysis {
  return {
    word,
    status: 'untested',
    priorityTier: 1,
    statusLabel: '隨機出題',
    reasonText: '',
  };
}

export function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMins = Math.max(1, Math.floor(diffMs / (1000 * 60)));
  if (diffMins < 60) return `${diffMins} 分鐘前`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} 小時前`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} 天前`;
}

function isCleanSingleSentence(s: string | undefined): boolean {
  const str = String(s || '');
  if (!str.trim()) return false;
  if (/\[文意選填/.test(str)) return false;
  if (/banked\s+cloze/i.test(str)) return false;
  if (/__\d+__/.test(str)) return false;
  if (/\(1\)\s*______/.test(str)) return false;
  return true;
}

/**
 * 全隨機組出「文意字彙 (Letter Hint Cloze)」測驗場次（僅排除已答對封存的題目）
 */
export function buildLetterHintQuizSession(params: {
  setId: string;
  words: WordItem[];
  logs: PracticeLog[];
  quizBank: QuizItem[];
  settings: UserSettings;
  questionCount?: number;
  onlyWrongWords?: boolean;
}): {
  questions: LetterHintClozeQuiz[];
  selectionSummary: {
    weaknessCount: number;
    newCount: number;
    reviewCount: number;
    skippedCooldownCount: number;
    excludedDuplicateHashes: number;
  };
} {
  const { setId, words, quizBank, settings, questionCount = 9999 } = params;
  const retiredHashes = new Set(
    Object.entries(settings.questionRatings || {})
      .filter(([, score]) => score >= 4)
      .map(([hash]) => hash)
  );

  const setWords = setId === 'all' ? words : words.filter((w) => w.setId === setId);
  const setWordIds = new Set(setWords.map((w) => w.id));
  const setWordTerms = new Set(setWords.map((w) => String(w.term || '').trim().toLowerCase()));

  const isSingleWordTerm = (term?: string, pos?: string) => {
    const t = String(term || '').trim();
    if (!t) return false;
    if (/\s/.test(t) || /[\/()]/.test(t)) return false;
    if (String(pos || '').toLowerCase().includes('phr')) return false;
    return true;
  };

  let candidates = quizBank.filter(
    (q): q is LetterHintClozeQuiz =>
      q.type === 'letter_hint_cloze' &&
      (setId === 'all' || q.setId === setId) &&
      !retiredHashes.has(q.questionHash) &&
      isCleanSingleSentence(q.sentence) &&
      isSingleWordTerm(q.targetTerm, q.pos)
  );

  if (candidates.length === 0) {
    candidates = quizBank.filter(
      (q): q is LetterHintClozeQuiz =>
        q.type === 'letter_hint_cloze' &&
        !retiredHashes.has(q.questionHash) &&
        isCleanSingleSentence(q.sentence) &&
        isSingleWordTerm(q.targetTerm, q.pos)
    );
  }

  const shuffled = [...candidates].sort(() => Math.random() - 0.5).slice(0, questionCount);

  return {
    questions: shuffled,
    selectionSummary: {
      weaknessCount: 0,
      newCount: shuffled.length,
      reviewCount: 0,
      skippedCooldownCount: 0,
      excludedDuplicateHashes: retiredHashes.size,
    },
  };
}

/**
 * 全隨機組出「文意選填 (Word Bank Cloze - 10 格短文)」測驗場次
 */
export function buildWordBankQuizSession(params: {
  setId: string;
  words: WordItem[];
  logs: PracticeLog[];
  quizBank: QuizItem[];
  settings: UserSettings;
  onlyWrongWords?: boolean;
}): {
  quiz: WordBankClozeQuiz | null;
  unavailableReason?: string;
  selectionSummary: {
    weaknessCount: number;
    newCount: number;
    reviewCount: number;
    skippedCooldownCount: number;
    isFreshPassage: boolean;
  };
} {
  const { setId, logs, quizBank, settings } = params;
  const retiredHashes = Object.entries(settings.questionRatings || {})
    .filter(([, score]) => score >= 4)
    .map(([hash]) => hash);
  const answeredHashes = new Set([...logs.map((l) => l.questionHash), ...retiredHashes]);

  const availablePassages = quizBank.filter(
    (q): q is WordBankClozeQuiz =>
      q.type === 'word_bank_cloze' &&
      (setId === 'all' || q.setId === setId) &&
      !answeredHashes.has(q.questionHash)
  );

  if (availablePassages.length > 0) {
    const picked = availablePassages[Math.floor(Math.random() * availablePassages.length)];
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    const answerByWordId = new Map(picked.answers.map((a) => [a.wordId, a.blankNumber]));
    const shuffledRawOptions = [...picked.options].sort(() => Math.random() - 0.5);
    const shuffledOptions = shuffledRawOptions.map((opt, idx) => ({
      ...opt,
      letter: letters[idx],
      correctBlankIndex: opt.correctBlankIndex ?? answerByWordId.get(opt.wordId),
    }));

    const newLetterByWordId = new Map(shuffledOptions.map((o) => [o.wordId, o.letter]));
    const newLetterByTerm = new Map(
      shuffledOptions.map((o) => [String(o.term || '').trim().toLowerCase(), o.letter])
    );

    const updatedAnswers = picked.answers.map((ans) => ({
      ...ans,
      optionLetter:
        newLetterByWordId.get(ans.wordId) ||
        newLetterByTerm.get(String(ans.term || '').trim().toLowerCase()) ||
        ans.optionLetter,
    }));

    return {
      quiz: {
        ...picked,
        options: shuffledOptions,
        answers: updatedAnswers,
      },
      selectionSummary: {
        weaknessCount: 0,
        newCount: 10,
        reviewCount: 0,
        skippedCooldownCount: 0,
        isFreshPassage: true,
      },
    };
  }

  return {
    quiz: null,
    unavailableReason:
      '此單字集目前沒有尚未作答的專屬 10 格「文意選填」短文。請先請 AI 助理透過 MCP 生成專屬短文，或切換為「文意字彙／單句克漏字」測驗！',
    selectionSummary: {
      weaknessCount: 0,
      newCount: 0,
      reviewCount: 0,
      skippedCooldownCount: 0,
      isFreshPassage: false,
    },
  };
}

/**
 * 全隨機組出「單句克漏字 (四選一 Multiple Choice Cloze)」測驗場次（僅排除已答對封存的題目）
 */
export function buildMultipleChoiceQuizSession(params: {
  setId: string;
  words: WordItem[];
  logs: PracticeLog[];
  quizBank: QuizItem[];
  settings: UserSettings;
  questionCount?: number;
  onlyWrongWords?: boolean;
}): {
  questions: MultipleChoiceClozeQuiz[];
  selectionSummary: {
    weaknessCount: number;
    newCount: number;
    reviewCount: number;
    skippedCooldownCount: number;
    excludedDuplicateHashes: number;
  };
} {
  const { setId, words, quizBank, settings, questionCount = 9999 } = params;
  const retiredHashes = new Set(
    Object.entries(settings.questionRatings || {})
      .filter(([, score]) => score >= 4)
      .map(([hash]) => hash)
  );

  const setWords = setId === 'all' ? words : words.filter((w) => w.setId === setId);
  const setWordIds = new Set(setWords.map((w) => w.id));
  const setWordTerms = new Set(setWords.map((w) => String(w.term || '').trim().toLowerCase()));

  const hasValid4Options = (q: MultipleChoiceClozeQuiz) =>
    Array.isArray(q.options) &&
    q.options.length === 4 &&
    q.options.every((o) => o && typeof o.term === 'string' && o.term.trim() !== '' && o.term.trim() !== '.');

  let candidates = quizBank.filter(
    (q): q is MultipleChoiceClozeQuiz =>
      q.type === 'multiple_choice_cloze' &&
      hasValid4Options(q) &&
      (setId === 'all' || q.setId === setId) &&
      !retiredHashes.has(q.questionHash) &&
      isCleanSingleSentence(q.sentence)
  );

  if (candidates.length === 0) {
    candidates = quizBank.filter(
      (q): q is MultipleChoiceClozeQuiz =>
        q.type === 'multiple_choice_cloze' &&
        hasValid4Options(q) &&
        !retiredHashes.has(q.questionHash) &&
        isCleanSingleSentence(q.sentence)
    );
  }

  const shuffled = [...candidates].sort(() => Math.random() - 0.5).slice(0, questionCount);

  return {
    questions: shuffled,
    selectionSummary: {
      weaknessCount: 0,
      newCount: shuffled.length,
      reviewCount: 0,
      skippedCooldownCount: 0,
      excludedDuplicateHashes: retiredHashes.size,
    },
  };
}
