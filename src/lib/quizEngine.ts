import {
  WordItem,
  PracticeLog,
  QuizItem,
  LetterHintClozeQuiz,
  WordBankClozeQuiz,
  MultipleChoiceClozeQuiz,
  MultipleChoiceOption,
  WordWeightStatus,
  UserSettings,
} from '@/types/vocu';
import { computeQuestionHash } from './masking';

export interface WordPriorityAnalysis {
  word: WordItem;
  status: WordWeightStatus;
  priorityTier: 1 | 2 | 3 | 4; // 1: 弱點優先, 2: 尚未測驗, 3: 久未複習, 4: 冷卻中
  statusLabel: string;
  reasonText: string;
}

/**
 * 判斷單一單字目前的系統權重狀態
 * - `weakness` (弱點優先): PracticeLog 中曾答錯（或 wrongCount > 0）且尚未連續答對 2 次
 * - `untested` (尚未測驗): 尚未出現在 PracticeLog 中（且 lastSeenAt === null）
 * - `cooldown` (冷卻中): 最近剛答對且連續答對 >= 2 次，且距離上次作答在冷卻題數/時間範圍內
 * - `due_review` (久未複習): 已測驗過、非弱點、且不在冷卻期內，依 lastSeenAt 由舊到新排序
 */
export function analyzeWordPriority(
  word: WordItem,
  logs: PracticeLog[],
  cooldownThreshold: number = 15
): WordPriorityAnalysis {
  const wordLogs = logs
    .filter((l) => l.wordId === word.id)
    .sort((a, b) => new Date(b.answeredAt).getTime() - new Date(a.answeredAt).getTime());

  // 取全部記錄中最新的 N 筆 (cooldownThreshold) 判斷是否處於近期冷卻範圍
  const recentGlobalLogIds = new Set(
    [...logs]
      .sort((a, b) => new Date(b.answeredAt).getTime() - new Date(a.answeredAt).getTime())
      .slice(0, cooldownThreshold)
      .map((l) => l.id)
  );

  const latestWordLog = wordLogs[0];
  const hasEverBeenTested = wordLogs.length > 0 || word.lastSeenAt !== null;

  // 優先級 1：弱點補強 — 最近答錯或歷史有錯且尚未連續答對 2 次
  const hasUnresolvedWrong =
    (latestWordLog && !latestWordLog.isCorrect) ||
    (word.wrongCount > 0 && word.consecutiveCorrect < 2);

  if (hasUnresolvedWrong) {
    return {
      word,
      status: 'weakness',
      priorityTier: 1,
      statusLabel: '弱點優先',
      reasonText: `曾答錯 ${Math.max(1, word.wrongCount)} 次・連續答對 ${word.consecutiveCorrect}/2 次`,
    };
  }

  // 優先級 2：尚未測驗新字
  if (!hasEverBeenTested) {
    return {
      word,
      status: 'untested',
      priorityTier: 2,
      statusLabel: '尚未測驗',
      reasonText: '新單字・優先排入新語境測驗',
    };
  }

  // 檢查是否處於「冷卻中」：最近剛答對 + 連續答對 >= 2 次 + 在最近 cooldownThreshold 題內或 3 小時內
  const isRecentlyAnswered =
    (latestWordLog && recentGlobalLogIds.has(latestWordLog.id)) ||
    (word.lastSeenAt && Date.now() - new Date(word.lastSeenAt).getTime() < 1000 * 60 * 60 * 3);

  if (word.consecutiveCorrect >= 2 && isRecentlyAnswered) {
    return {
      word,
      status: 'cooldown',
      priorityTier: 4,
      statusLabel: '冷卻中',
      reasonText: `已連續答對 ${word.consecutiveCorrect} 次・暫緩重複出題`,
    };
  }

  // 優先級 3：久未複習
  return {
    word,
    status: 'due_review',
    priorityTier: 3,
    statusLabel: '待複習',
    reasonText: word.lastSeenAt
      ? `上次練習：${formatRelativeTime(word.lastSeenAt)}`
      : '等待排程複習',
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

/**
 * 依據「防重複 + 弱點加權」演算法對單字集中的單字進行排序
 */
export function rankWordsForQuiz(
  words: WordItem[],
  logs: PracticeLog[],
  settings: Pick<UserSettings, 'cooldownThreshold' | 'weaknessMultiplier'>,
  options?: {
    onlyWrongWords?: boolean;
    includeCooldownIfInsufficient?: boolean;
    targetCount?: number;
  }
): WordPriorityAnalysis[] {
  const analyzed = words.map((w) => analyzeWordPriority(w, logs, settings.cooldownThreshold));

  let candidates = analyzed;
  if (options?.onlyWrongWords) {
    const wrongOnly = analyzed.filter((a) => a.status === 'weakness' || a.word.wrongCount > 0);
    if (wrongOnly.length > 0) {
      candidates = wrongOnly;
    }
  }

  // 先排除冷卻中的單字
  const activeCandidates = candidates.filter((a) => a.status !== 'cooldown');
  const cooldownCandidates = candidates.filter((a) => a.status === 'cooldown');

  const sortFn = (a: WordPriorityAnalysis, b: WordPriorityAnalysis) => {
    if (a.priorityTier !== b.priorityTier) {
      return a.priorityTier - b.priorityTier;
    }
    // 同為優先級 1 (弱點補強)：錯誤次數高、連續答對次數少者優先
    if (a.priorityTier === 1) {
      const scoreA = a.word.wrongCount * settings.weaknessMultiplier - a.word.consecutiveCorrect;
      const scoreB = b.word.wrongCount * settings.weaknessMultiplier - b.word.consecutiveCorrect;
      if (scoreB !== scoreA) return scoreB - scoreA;
    }
    // 同為優先級 3 (久未複習)：依 lastSeenAt 由舊到新排序，若皆未測驗則隨機輪替
    const timeA = a.word.lastSeenAt ? new Date(a.word.lastSeenAt).getTime() : 0;
    const timeB = b.word.lastSeenAt ? new Date(b.word.lastSeenAt).getTime() : 0;
    if (timeA !== timeB) return timeA - timeB;
    return Math.random() - 0.5;
  };

  activeCandidates.sort(sortFn);
  cooldownCandidates.sort(sortFn);

  if (
    options?.includeCooldownIfInsufficient &&
    options.targetCount &&
    activeCandidates.length < options.targetCount
  ) {
    return [...activeCandidates, ...cooldownCandidates].slice(0, options.targetCount);
  }

  return options?.targetCount ? activeCandidates.slice(0, options.targetCount) : activeCandidates;
}

/**
 * 組出「文意字彙 (Letter Hint Cloze)」測驗場次
 * 嚴格遵守：
 * 1. 同一場次不重複出現相同單字
 * 2. 排除使用者在 PracticeLog 中已做過的 questionHash（若該單字既有題目已做過，自動切換備用題幹或動態生成全新語境）
 * 3. 排除最近剛答對且仍在冷卻期的單字
 * 4. 依 優先級 1 (弱點補強) -> 優先級 2 (未測驗新字) -> 優先級 3 (久未複習) 排序抽取
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
  const { setId, words, logs, quizBank, settings, questionCount = 5, onlyWrongWords = false } = params;

  const setWords = setId === 'all' ? words : words.filter((w) => w.setId === setId);
  const answeredHashes = new Set(logs.map((l) => l.questionHash));

  const allAnalyzed = setWords.map((w) => analyzeWordPriority(w, logs, settings.cooldownThreshold));
  const skippedCooldownCount = allAnalyzed.filter((a) => a.status === 'cooldown').length;

  const ranked = rankWordsForQuiz(setWords, logs, settings, {
    onlyWrongWords,
    includeCooldownIfInsufficient: true,
  });

  const usedWordIdsInSession = new Set<string>();
  const selectedQuestions: LetterHintClozeQuiz[] = [];
  let excludedDuplicateHashes = 0;

  let weaknessCount = 0;
  let newCount = 0;
  let reviewCount = 0;

  const existingLetterQuizzes = quizBank.filter(
    (q): q is LetterHintClozeQuiz => q.type === 'letter_hint_cloze'
  );

  for (const item of ranked) {
    if (selectedQuestions.length >= questionCount) break;
    if (usedWordIdsInSession.has(item.word.id)) continue;

    usedWordIdsInSession.add(item.word.id);

    const priorityReason: LetterHintClozeQuiz['priorityReason'] =
      item.status === 'weakness'
        ? 'weakness'
        : item.status === 'untested'
          ? 'new'
          : item.status === 'cooldown'
            ? 'cooldown_override'
            : 'review';

    if (priorityReason === 'weakness') weaknessCount++;
    else if (priorityReason === 'new') newCount++;
    else reviewCount++;

    // 尋找該單字在題庫中尚未被做過 (questionHash 不在 PracticeLog) 的題目
    const termLower = item.word.term.trim().toLowerCase();
    const matchingQuizzes = existingLetterQuizzes.filter(
      (q) =>
        q.wordId === item.word.id ||
        (q.targetTerm && q.targetTerm.trim().toLowerCase() === termLower)
    );
    let chosenQuiz: LetterHintClozeQuiz | null = null;

    for (const candidate of matchingQuizzes) {
      if (answeredHashes.has(candidate.questionHash)) {
        excludedDuplicateHashes++;
      } else {
        chosenQuiz = {
          ...candidate,
          priorityReason,
        };
        break;
      }
    }

    if (!chosenQuiz) {
      usedWordIdsInSession.delete(item.word.id);
      continue;
    }

    selectedQuestions.push(chosenQuiz);
  }

  // Fallback: if wordId/targetTerm matching yielded fewer than questionCount, pull directly from quizBank for this setId
  if (selectedQuestions.length < questionCount) {
    const usedQuizIds = new Set(selectedQuestions.map((q) => q.id));
    const directSetQuizzes = existingLetterQuizzes.filter(
      (q) =>
        (setId === 'all' || q.setId === setId) &&
        !answeredHashes.has(q.questionHash) &&
        !usedQuizIds.has(q.id)
    );
    for (const q of directSetQuizzes) {
      if (selectedQuestions.length >= questionCount) break;
      selectedQuestions.push({ ...q, priorityReason: 'new' });
      newCount++;
    }
  }

  return {
    questions: selectedQuestions,
    selectionSummary: {
      weaknessCount,
      newCount,
      reviewCount,
      skippedCooldownCount,
      excludedDuplicateHashes,
    },
  };
}

/**
 * 組出「文意選填 (Word Bank Cloze - 10 格短文)」測驗場次
 * 1. 優先從題庫中挑選 `questionHash` 尚未出現在 `PracticeLog` 且涵蓋最多「弱點單字 + 未測驗新字」的短文。
 * 2. 若既有短文皆已做過，或使用者選擇特定單字集／錯題重測，則根據動態演算法抽取前 10 個優先單字（排除冷卻期單字，不足時才補齊），
 *    自動組出全新語境的 10 格短文與 (A)~(J) 10 個不重複選項。
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
  const { setId, words, logs, quizBank, settings, onlyWrongWords = false } = params;
  const answeredHashes = new Set(logs.map((l) => l.questionHash));
  const setWords = setId === 'all' ? words : words.filter((w) => w.setId === setId);

  const allAnalyzed = setWords.map((w) => analyzeWordPriority(w, logs, settings.cooldownThreshold));
  const skippedCooldownCount = allAnalyzed.filter((a) => a.status === 'cooldown').length;
  const analysisMap = new Map(allAnalyzed.map((a) => [a.word.id, a]));

  const availablePassages = quizBank.filter(
    (q): q is WordBankClozeQuiz =>
      q.type === 'word_bank_cloze' &&
      (setId === 'all' || q.setId === setId) &&
      !answeredHashes.has(q.questionHash)
  );

  if (availablePassages.length > 0 && !onlyWrongWords) {
    const scoredPassages = availablePassages.map((p) => {
      let score = 0;
      let wCount = 0;
      let nCount = 0;
      let rCount = 0;
      for (const ans of p.answers) {
        const info = analysisMap.get(ans.wordId);
        if (!info || info.status === 'untested') {
          score += 20;
          nCount++;
        } else if (info.status === 'weakness') {
          score += 35 * settings.weaknessMultiplier;
          wCount++;
        } else if (info.status === 'due_review') {
          score += 10;
          rCount++;
        } else if (info.status === 'cooldown') {
          score -= 15;
        }
      }
      return { quiz: p, score, wCount, nCount, rCount };
    });

    scoredPassages.sort((a, b) => b.score - a.score);
    const best = scoredPassages[0];

    // 確保每個選項物件都綁定 correctBlankIndex
    const answerByWordId = new Map(best.quiz.answers.map((a) => [a.wordId, a.blankNumber]));
    const boundQuiz: WordBankClozeQuiz = {
      ...best.quiz,
      options: best.quiz.options.map((opt) => ({
        ...opt,
        correctBlankIndex: opt.correctBlankIndex ?? answerByWordId.get(opt.wordId),
      })),
    };

    return {
      quiz: boundQuiz,
      selectionSummary: {
        weaknessCount: best.wCount,
        newCount: best.nCount,
        reviewCount: best.rCount,
        skippedCooldownCount,
        isFreshPassage: true,
      },
    };
  }

  return {
    quiz: null,
    unavailableReason:
      '此單字集目前沒有尚未作答的專屬 10 格「文意選填」短文。為避免題幹與選項語境錯置，系統已停用通用模板；請先請 Gemini 透過 MCP 生成專屬短文，或直接切換為「文意字彙」測驗！',
    selectionSummary: {
      weaknessCount: 0,
      newCount: 0,
      reviewCount: 0,
      skippedCooldownCount,
      isFreshPassage: false,
    },
  };
}

/**
 * 組出「單句克漏字 (四選一 Multiple Choice Cloze)」測驗場次
 * 優先從題庫挑選未作答的 multiple_choice_cloze 題目；若無，則動態生成單句語境並搭配同單字集（或全域）干擾項組成 A/B/C/D 四選一。
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
  const { setId, words, logs, quizBank, settings, questionCount = 5, onlyWrongWords = false } = params;
  const setWords = setId === 'all' ? words : words.filter((w) => w.setId === setId);
  const answeredHashes = new Set(logs.map((l) => l.questionHash));

  const allAnalyzed = setWords.map((w) => analyzeWordPriority(w, logs, settings.cooldownThreshold));
  const skippedCooldownCount = allAnalyzed.filter((a) => a.status === 'cooldown').length;

  const ranked = rankWordsForQuiz(setWords, logs, settings, {
    onlyWrongWords,
    includeCooldownIfInsufficient: true,
  });

  const existingMcQuizzes = quizBank.filter(
    (q): q is MultipleChoiceClozeQuiz => q.type === 'multiple_choice_cloze'
  );

  const usedWordIds = new Set<string>();
  const selectedQuestions: MultipleChoiceClozeQuiz[] = [];
  let excludedDuplicateHashes = 0;
  let weaknessCount = 0;
  let newCount = 0;
  let reviewCount = 0;

  const labels: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];

  for (let idx = 0; idx < ranked.length; idx++) {
    const item = ranked[idx];
    if (selectedQuestions.length >= questionCount) break;
    if (usedWordIds.has(item.word.id)) continue;
    usedWordIds.add(item.word.id);

    const priorityReason: MultipleChoiceClozeQuiz['priorityReason'] =
      item.status === 'weakness'
        ? 'weakness'
        : item.status === 'untested'
          ? 'new'
          : item.status === 'cooldown'
            ? 'cooldown_override'
            : 'review';

    if (priorityReason === 'weakness') weaknessCount++;
    else if (priorityReason === 'new') newCount++;
    else reviewCount++;

    let chosen: MultipleChoiceClozeQuiz | null = null;
    const termLower = item.word.term.trim().toLowerCase();
    for (const candidate of existingMcQuizzes.filter(
      (q) =>
        q.wordId === item.word.id ||
        (q.targetTerm && q.targetTerm.trim().toLowerCase() === termLower)
    )) {
      if (answeredHashes.has(candidate.questionHash)) {
        excludedDuplicateHashes++;
      } else {
        chosen = { ...candidate, priorityReason };
        break;
      }
    }

    if (!chosen) {
      usedWordIds.delete(item.word.id);
      continue;
    }

    selectedQuestions.push(chosen);
  }

  // Fallback: if wordId/targetTerm matching yielded fewer than questionCount, pull directly from quizBank for this setId
  if (selectedQuestions.length < questionCount) {
    const usedQuizIds = new Set(selectedQuestions.map((q) => q.id));
    const directSetQuizzes = existingMcQuizzes.filter(
      (q) =>
        (setId === 'all' || q.setId === setId) &&
        !answeredHashes.has(q.questionHash) &&
        !usedQuizIds.has(q.id)
    );
    for (const q of directSetQuizzes) {
      if (selectedQuestions.length >= questionCount) break;
      selectedQuestions.push({ ...q, priorityReason: 'new' });
      newCount++;
    }
  }

  return {
    questions: selectedQuestions,
    selectionSummary: {
      weaknessCount,
      newCount,
      reviewCount,
      skippedCooldownCount,
      excludedDuplicateHashes,
    },
  };
}
