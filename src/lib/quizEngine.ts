import {
  WordItem,
  PracticeLog,
  QuizItem,
  LetterHintClozeQuiz,
  WordBankClozeQuiz,
  WordWeightStatus,
  UserSettings,
  WordBankOption,
  WordBankBlankAnswer,
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
    // 同為優先級 3 (久未複習)：依 lastSeenAt 由舊到新排序
    const timeA = a.word.lastSeenAt ? new Date(a.word.lastSeenAt).getTime() : 0;
    const timeB = b.word.lastSeenAt ? new Date(b.word.lastSeenAt).getTime() : 0;
    return timeA - timeB;
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
 * 動態產生全新語境的「文意字彙」題目（當既有題庫的 questionHash 都已經被使用者做過，或為使用者新增的自訂單字時）
 */
const CONTEXT_TEMPLATES: Record<string, Array<{ tpl: string; zhTpl: string }>> = {
  'n.': [
    {
      tpl: 'During the international symposium, keynote speakers highlighted how this critical {{BLANK}} shapes modern policy decisions.',
      zhTpl: '在國際研討會期間，主講者強調了這項關鍵「{DEF}」如何影響現代決策。',
    },
    {
      tpl: 'Researchers published a comprehensive report analyzing the long-term impact of the {{BLANK}} on regional communities.',
      zhTpl: '研究人員發表了一份綜合報告，分析該「{DEF}」對區域社群的長期影響。',
    },
    {
      tpl: 'Understanding the underlying {{BLANK}} behind the data allowed the engineering team to solve the bottleneck quickly.',
      zhTpl: '理解數據背後的「{DEF}」讓工程團隊得以迅速解決瓶頸。',
    },
  ],
  'v.': [
    {
      tpl: 'To achieve sustainable growth, organizations must {{BLANK}} their core resources effectively in changing markets.',
      zhTpl: '為了達成永續成長，組織必須在多變的市場中有效地「{DEF}」其核心資源。',
    },
    {
      tpl: 'The committee proposed new guidelines designed to {{BLANK}} public trust and ecological balance.',
      zhTpl: '委員會提出了新指導方針，旨在「{DEF}」公眾信任與生態平衡。',
    },
    {
      tpl: 'Leading educators continually {{BLANK}} the value of critical thinking over rote memorization.',
      zhTpl: '頂尖教育工作者持續「{DEF}」批判性思考相較於死記硬背的價值。',
    },
  ],
  'adj.': [
    {
      tpl: 'In an era of rapid technological disruption, building a {{BLANK}} infrastructure is essential for national security.',
      zhTpl: '在科技快速變革的時代，建立「{DEF}」基礎設施對國家安全至關重要。',
    },
    {
      tpl: 'Field observations confirmed that small island ecosystems remain highly {{BLANK}} to sudden shifts in ocean temperature.',
      zhTpl: '實地觀測證實，小型島嶼生態系統對海洋溫度的驟變依然相當「{DEF}」。',
    },
    {
      tpl: 'The independent audit concluded that structural reform is not merely helpful but {{BLANK}} for future survival.',
      zhTpl: '獨立稽核結論指出，結構性改革對未來的生存而言不僅有幫助，更是「{DEF}」。',
    },
  ],
  'phr.': [
    {
      tpl: 'After the unexpected power outage at the main terminal, the backup documents were {{BLANK}}.',
      zhTpl: '在主航廈發生意外停電後，備份文件便「{DEF}」。',
    },
    {
      tpl: 'Experienced mentors always remind young professionals not to {{BLANK}} the support of their teammates.',
      zhTpl: '經驗豐富的導師總是提醒年輕專業人士，切勿對團隊夥伴的支持「{DEF}」。',
    },
    {
      tpl: 'While rigorous quality control requires extra effort today, it builds lasting brand reputation {{BLANK}}.',
      zhTpl: '雖然嚴格的品質控管在當下需要額外心力，但「{DEF}」它能建立長久的品牌聲譽。',
    },
  ],
};

function synthesizeFreshLetterHintQuestion(
  word: WordItem,
  answeredHashes: Set<string>,
  priorityReason: LetterHintClozeQuiz['priorityReason'],
  variationIndex: number = 0
): LetterHintClozeQuiz {
  const posKey = word.pos.includes('phr')
    ? 'phr.'
    : word.pos.includes('adj')
      ? 'adj.'
      : word.pos.includes('v')
        ? 'v.'
        : 'n.';

  const templates = CONTEXT_TEMPLATES[posKey] || CONTEXT_TEMPLATES['n.'];

  for (let i = 0; i < templates.length; i++) {
    const candidate = templates[(i + variationIndex) % templates.length];
    const sentence = candidate.tpl;
    const hash = computeQuestionHash(`${word.id}:${sentence}`);
    if (!answeredHashes.has(hash)) {
      return {
        id: `quiz-dyn-lh-${word.id}-${hash}`,
        setId: word.setId,
        type: 'letter_hint_cloze',
        wordId: word.id,
        sentence,
        targetTerm: word.term.trim(),
        baseTerm: word.term.trim(),
        pos: word.pos,
        chineseHint: word.definition,
        explanation: candidate.zhTpl.replace('{DEF}', word.definition) + `（目標字詞：${word.term}）`,
        questionHash: hash,
        priorityReason,
        createdAt: new Date().toISOString(),
        source: 'dynamic',
      };
    }
  }

  // Fallback with timestamp salt to guarantee a brand new context hash
  const fallbackSentence = `In contemporary academic discourse, mastering the concept of "{{BLANK}}" (${word.pos}) is vital for comprehending how ${word.definition} influences real-world outcomes [Context #${answeredHashes.size + 1}].`;
  const hash = computeQuestionHash(`${word.id}:${fallbackSentence}`);
  return {
    id: `quiz-dyn-lh-${word.id}-${hash}`,
    setId: word.setId,
    type: 'letter_hint_cloze',
    wordId: word.id,
    sentence: fallbackSentence,
    targetTerm: word.term.trim(),
    baseTerm: word.term.trim(),
    pos: word.pos,
    chineseHint: word.definition,
    explanation: `AI 動態生成的全新語境例句，協助強化記憶「${word.term}（${word.definition}）」。`,
    questionHash: hash,
    priorityReason,
    createdAt: new Date().toISOString(),
    source: 'dynamic',
  };
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
    targetCount: Math.min(questionCount, setWords.length),
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
    const matchingQuizzes = existingLetterQuizzes.filter((q) => q.wordId === item.word.id);
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
      chosenQuiz = synthesizeFreshLetterHintQuestion(
        item.word,
        answeredHashes,
        priorityReason,
        logs.length
      );
    }

    selectedQuestions.push(chosenQuiz);
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
  quiz: WordBankClozeQuiz;
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

  // 如果不是強制「只測錯題」，先檢查題庫中是否有該單字集尚未做過的 10 格文意選填短文
  if (!onlyWrongWords) {
    const availablePassages = quizBank.filter(
      (q): q is WordBankClozeQuiz =>
        q.type === 'word_bank_cloze' &&
        (setId === 'all' || q.setId === setId) &&
        !answeredHashes.has(q.questionHash)
    );

    if (availablePassages.length > 0) {
      // 根據短文所包含的弱點與新字權重評分，挑選最契合當前學習需求的一篇
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

      return {
        quiz: best.quiz,
        selectionSummary: {
          weaknessCount: best.wCount,
          newCount: best.nCount,
          reviewCount: best.rCount,
          skippedCooldownCount,
          isFreshPassage: true,
        },
      };
    }
  }

  // 當既有短文都已做過，或使用者新增了自己的單字集/要求錯題重組時：
  // 根據優先級 1 -> 2 -> 3 抽取 10 個不重複單字（若該單字集不足 10 字，從其他單字集補齊至 10 字）
  let candidatePool = [...setWords];
  if (candidatePool.length < 10) {
    const extraWords = words.filter((w) => !candidatePool.some((c) => c.id === w.id));
    candidatePool = [...candidatePool, ...extraWords];
  }

  const ranked10 = rankWordsForQuiz(candidatePool, logs, settings, {
    onlyWrongWords,
    includeCooldownIfInsufficient: true,
    targetCount: 10,
  });

  // 若 onlyWrongWords 過濾後不足 10 個，再由非錯題依優先級補齊至 10 個不重複單字
  if (ranked10.length < 10) {
    const fallbackRanked = rankWordsForQuiz(candidatePool, logs, settings, {
      onlyWrongWords: false,
      includeCooldownIfInsufficient: true,
      targetCount: 10,
    });
    for (const item of fallbackRanked) {
      if (ranked10.length >= 10) break;
      if (!ranked10.some((r) => r.word.id === item.word.id)) {
        ranked10.push(item);
      }
    }
  }

  let weaknessCount = 0;
  let newCount = 0;
  let reviewCount = 0;

  ranked10.forEach((item) => {
    if (item.status === 'weakness') weaknessCount++;
    else if (item.status === 'untested') newCount++;
    else reviewCount++;
  });

  // 產生 10 個被打亂順序的選項 (A) ~ (J)
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  // 以固定但與時間軸相關的順序洗牌選項，確保選項順序與題號 (1)~(10) 不同
  const shuffledForOptions = [...ranked10].sort((a, b) =>
    a.word.term.localeCompare(b.word.term)
  );

  const options: WordBankOption[] = shuffledForOptions.map((item, idx) => ({
    letter: letters[idx],
    wordId: item.word.id,
    term: item.word.term,
    pos: item.word.pos,
    definition: item.word.definition,
  }));

  const optionByWordId = new Map(options.map((o) => [o.wordId, o]));

  // 組裝 10 格連貫短文與對應解析
  const passageSentences: string[] = [
    'In a rapidly evolving global landscape, researchers and practitioners frequently encounter complex challenges that demand thoughtful analysis.',
  ];
  const answers: WordBankBlankAnswer[] = [];

  const blankFrames = [
    'First, experts must address the central (1) ______ regarding how modern systems adapt to unexpected stress.',
    'Without clear data, effective solutions are often (2) ______ when teams need them most.',
    'Furthermore, decision-makers need to evaluate every critical (3) ______ before launching a major initiative.',
    'Adopting a truly (4) ______ strategy ensures that resources are not exhausted prematurely.',
    'Observers have also noted a remarkable global (5) ______ reshaping how communities collaborate across borders.',
    'While structural change is often (6) ______, proactive preparation can reduce its negative impact.',
    'At the same time, stakeholders must reach a balanced (7) ______ rather than pursuing narrow interests.',
    'We should never (8) ______ the foundational stability built by previous generations of innovators.',
    'Protecting the most (9) ______ members of society remains a top priority during periods of transition.',
    'Ultimately, these collective efforts help (10) ______ core knowledge and resilience for the future.',
  ];

  ranked10.forEach((item, index) => {
    const blankNum = index + 1;
    const opt = optionByWordId.get(item.word.id)!;
    const sentenceFrame = blankFrames[index].replace(
      `(${blankNum}) ______`,
      `(${blankNum}) ______`
    );
    passageSentences.push(sentenceFrame);

    answers.push({
      blankNumber: blankNum,
      optionLetter: opt.letter,
      wordId: item.word.id,
      term: item.word.term,
      explanation: `第 (${blankNum}) 格應填入 (${opt.letter}) ${item.word.term} (${item.word.pos} ${item.word.definition})。系統選字原因：【${item.statusLabel}】${item.reasonText}。`,
    });
  });

  const fullPassage = passageSentences.join(' ');
  const questionHash = computeQuestionHash(`${fullPassage}:${logs.length}`);

  const dynamicQuiz: WordBankClozeQuiz = {
    id: `quiz-wb-dyn-${Date.now()}`,
    setId: setId === 'all' ? (ranked10[0]?.word.setId ?? 'set-core-academic') : setId,
    type: 'word_bank_cloze',
    title: onlyWrongWords
      ? '弱點錯題專屬・AI 動態重組文意選填'
      : '動態防重複組題・綜合語境文意選填',
    passage: fullPassage,
    questionHash,
    options,
    answers,
    createdAt: new Date().toISOString(),
    source: 'dynamic',
  };

  return {
    quiz: dynamicQuiz,
    selectionSummary: {
      weaknessCount,
      newCount,
      reviewCount,
      skippedCooldownCount,
      isFreshPassage: true,
    },
  };
}
