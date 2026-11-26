export type TagColorKey = 'pink' | 'amber' | 'mint' | 'blue' | 'purple';

export type SetIconKey = 'book' | 'graduation-cap' | 'briefcase' | 'bookmark' | 'plane' | 'credit-card';

export interface WordSet {
  id: string;
  title: string;
  color: string; // Hex e.g. #7CE3B3, #F472B6, #FBBF24, #60A5FA, #A78BFA
  icon: SetIconKey;
  createdAt: string; // ISO string
  belowDivider?: boolean; // true = 移至分界線之下（舊/較少用單字集）；false/undefined = 分界線之上（最新/常用）
}

export interface WordItem {
  id: string;
  setId: string;
  term: string;
  pos: string; // e.g., "n.", "v.", "adj.", "phr."
  definition: string;
  wrongCount: number;
  consecutiveCorrect: number;
  lastSeenAt: string | null; // ISO string or null if never tested
}

export type QuestionType =
  | 'word_bank_cloze'
  | 'letter_hint_cloze'
  | 'multiple_choice_cloze'
  | 'zh_to_en_choice'
  | 'en_to_zh_choice';

export interface PracticeLog {
  id: string;
  wordId: string;
  setId: string;
  questionType: QuestionType;
  questionHash: string;
  userAnswer: string;
  isCorrect: boolean;
  answeredAt: string; // ISO string
}

export interface WordBankOption {
  letter: string; // 'A' to 'J'
  wordId: string;
  term: string; // Surface form in option bank
  pos: string;
  definition: string;
  correctBlankIndex?: number; // 1 to 10, bound to the passage blank
}

export interface WordBankBlankAnswer {
  blankNumber: number; // 1 to 10
  optionLetter: string; // 'A' to 'J'
  wordId: string;
  term: string;
  explanation: string; // 中文解析與語境說明
}

export interface WordBankClozeQuiz {
  id: string;
  setId: string;
  type: 'word_bank_cloze';
  title: string;
  passage: string; // Contains (1) ______ ... (10) ______
  questionHash: string;
  options: WordBankOption[]; // 10 options A-J
  answers: WordBankBlankAnswer[]; // 10 answers 1-10
  createdAt: string;
  source?: 'builtin' | 'dynamic' | 'mcp_agent';
}

export interface LetterHintClozeQuiz {
  id: string;
  setId: string;
  type: 'letter_hint_cloze';
  complexity?: SentenceComplexity; // 句子複雜度（simple 短句常用字；complex 長句／子句／進階詞彙）
  wordId: string;
  sentence: string; // Uses {{BLANK}} as placeholder for the target masked word/phrase
  targetTerm: string; // The exact surface form in the sentence (e.g., "mystery", "factors", "nowhere to be found")
  baseTerm: string; // Original dictionary headword in WordItem
  pos: string;
  chineseHint: string; // 中文釋義
  explanation: string; // 完整句子翻譯與解析
  questionHash: string;
  priorityReason?: 'weakness' | 'new' | 'review' | 'cooldown_override';
  createdAt: string;
  source?: 'builtin' | 'dynamic' | 'mcp_agent';
}

export interface MultipleChoiceOption {
  label: 'A' | 'B' | 'C' | 'D';
  term: string;
}

export interface MultipleChoiceClozeQuiz {
  id: string;
  setId: string;
  type: 'multiple_choice_cloze';
  complexity?: SentenceComplexity; // 句子複雜度（simple 短句常用字；complex 長句／子句／進階詞彙）
  wordId: string;
  sentence: string; // Uses {{BLANK}} as placeholder
  options: MultipleChoiceOption[]; // 4 options A-D
  correctLabel: 'A' | 'B' | 'C' | 'D';
  targetTerm: string;
  explanation: string;
  questionHash: string;
  priorityReason?: 'weakness' | 'new' | 'review' | 'cooldown_override';
  createdAt: string;
  source?: 'builtin' | 'dynamic' | 'mcp_agent';
}

export type QuizItem = WordBankClozeQuiz | LetterHintClozeQuiz | MultipleChoiceClozeQuiz;

export type WordWeightStatus = 'weakness' | 'untested' | 'cooldown' | 'due_review';

export type SentenceComplexity = 'simple' | 'complex';
export type ComplexityFilter = 'all' | SentenceComplexity;

export interface UserSettings {
  sentenceComplexity?: ComplexityFilter; // 單句題型（文意字彙／單句克漏字）的句子複雜度篩選，預設 all
  hideBelowDivider?: boolean; // true = 隱藏首頁分界線下方的收納單字集
  userName: string;
  userEmail: string;
  avatarText: string;
  syncEnabled: boolean;
  lastSyncedAt: string;
  dailyGoal: 10 | 20 | 30;
  weaknessMultiplier: number; // 錯題重現權重 (1x ~ 5x)
  cooldownThreshold: number; // 已答對單字冷卻題數設定 (例如最近 N 題內答對且連續答對 >= 2 次則冷卻)
  mcpServerUrl: string;
  mcpApiKey: string;
  mcpConnectedAgent: string;
  questionRatings?: Record<string, number>; // questionHash -> 1~5 分，>= 4 分之後不再出題
}
