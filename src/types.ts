export type DeepSeekModel = 'deepseek-v4-flash' | 'deepseek-v4-pro';

// ─── Chat ───
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning_content?: string;
  timestamp?: number;
  /** True when the message was auto-generated (for collapse UI) */
  isAuto?: boolean;
  /** Short summary for collapsed display */
  summary?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}

// ─── Exam Types ───
export type ExamType = 'cet4' | 'cet6' | 'ielts' | 'toefl' | 'kaoyan' | 'reading';

export const ExamTypeLabels: Record<ExamType, string> = {
  cet4: '英语四级',
  cet6: '英语六级',
  ielts: '雅思',
  toefl: '托福',
  kaoyan: '考研英语',
  reading: '精读模式',
};

export const ExamTypeIcons: Record<ExamType, string> = {
  cet4: '📘', cet6: '📕', ielts: '🇬🇧', toefl: '🇺🇸', kaoyan: '🎓', reading: '📖',
};

// ─── Question Types ───
export type QuestionType =
  | 'banked-cloze'       // 选词填空 — CET Section A
  | 'long-reading-match' // 长篇阅读匹配 — CET Section B
  | 'careful-reading'    // 仔细阅读 — CET Section C
  | 'listening'          // 听力理解
  | 'translation'        // 翻译
  | 'writing'            // 写作
  | 'ielts-reading'      // 雅思阅读（T/F/NG、填空、匹配、选择）
  | 'ielts-listening'    // 雅思听力
  | 'ielts-writing'      // 雅思写作
  | 'toefl-reading'      // 托福阅读
  | 'toefl-listening'    // 托福听力
  | 'toefl-writing'      // 托福写作
  | 'toefl-speaking'     // 托福口语
  | 'kaoyan-reading'     // 考研阅读
  | 'kaoyan-translation' // 考研翻译
  | 'kaoyan-writing'     // 考研写作
  | 'fill-blank'         // 通用填空
  | 'mcq'                // 通用多选
  | 'short-answer'       // 通用简答
  | 'true-false'         // 判断题
  | 'reading';           // 纯精读（无题目）

export type SectionType = QuestionType;

export const SectionLabels: Record<string, string> = {
  'banked-cloze': '选词填空',
  'long-reading-match': '长篇阅读匹配',
  'careful-reading': '仔细阅读',
  'listening': '听力理解',
  'translation': '翻译',
  'writing': '写作',
  'ielts-reading': '雅思阅读',
  'ielts-listening': '雅思听力',
  'ielts-writing': '雅思写作',
  'toefl-reading': '托福阅读',
  'toefl-listening': '托福听力',
  'toefl-writing': '托福写作',
  'toefl-speaking': '托福口语',
  'kaoyan-reading': '考研阅读',
  'kaoyan-translation': '考研翻译',
  'kaoyan-writing': '考研写作',
  'fill-blank': '填空题',
  'mcq': '选择题',
  'short-answer': '简答题',
  'true-false': '判断题',
  'reading': '精读',
};

export const SectionIcons: Record<string, string> = {
  'banked-cloze': '📝',
  'long-reading-match': '📑',
  'careful-reading': '📖',
  'listening': '🎧',
  'translation': '🌐',
  'writing': '✍️',
  'ielts-reading': '🇬🇧',
  'ielts-listening': '👂',
  'ielts-writing': '✏️',
  'toefl-reading': '🇺🇸',
  'toefl-listening': '🎼',
  'toefl-writing': '🖋️',
  'toefl-speaking': '🗣️',
  'kaoyan-reading': '🎓',
  'kaoyan-translation': '🔤',
  'kaoyan-writing': '📝',
  'fill-blank': '⬜',
  'mcq': '🔘',
  'short-answer': '✍️',
  'true-false': '✓',
  'reading': '📖',
};

// ─── Questions & Passages ───
export interface Question {
  id: string;
  number: number;
  questionType: QuestionType;
  content: string;
  options: { key: string; text: string }[];
  correctAnswer: string;
  answerExplanation?: string;
  /** For long-reading matching: what paragraph letter does this match to */
  matchParagraph?: string;
  /** For translation: the Chinese source text snippet */
  sourceText?: string;
  /** For fill-blank: list of acceptable answers */
  acceptableAnswers?: string[];
  /** Question sub-type for ielts (e.g. 'true-false-ng', 'matching', 'fill-blank', 'mcq') */
  subType?: string;
}

export interface Passage {
  id: string;
  title: string;
  section: SectionType;
  instruction?: string;
  paragraphs: {
    id: string;
    sentences: string[];
  }[];
  questions: Question[];
  /** For banked-cloze: the candidate word bank */
  wordBank?: string[];
  /** For translation: the full Chinese source text */
  sourceText?: string;
}

export interface ExamPaper {
  id: string;
  examType?: ExamType;
  year: string;
  title: string;
  passages: Passage[];
}

// ─── Bookmarks ───
export interface Bookmark {
  id: string;
  type: 'sentence' | 'word' | 'question';
  content: string;
  context?: string;
  translationOrExplanation?: string;
  timestamp: number;
}

// ─── Vocabulary ───
export interface WordDefinition {
  pos: string;      // Part of speech: n, v, adj, adv, vi, vt, etc.
  meaning: string;  // The definition in Chinese
}

export interface WordExample {
  en: string;
  zh: string;
}

export interface WordPhrase {
  phrase: string;
  meaning: string;
}

export interface Derivative {
  word: string;
  pos: string;
  meaning: string;
}

export interface WordItem {
  id: string;
  word: string;
  /** Simple definition (backwards compat) */
  definition?: string;
  /** UK pronunciation: UK[rɪ'vəʊlt] */
  phoneticUK?: string;
  /** US pronunciation: US[rɪ'volt] */
  phoneticUS?: string;
  /** Rich definitions with parts of speech */
  definitions?: WordDefinition[];
  /** Example sentences with translations */
  examples?: WordExample[];
  /** Synonyms */
  synonyms?: string[];
  /** Common phrases/collocations */
  phrases?: WordPhrase[];
  /** Memory aid */
  mnemonic?: string;
  /** Derived words (e.g., inference, inferential for "infer") */
  derivatives?: Derivative[];
  /** Source context */
  context?: string;
}

export interface VocabList {
  id: string;
  title: string;
  createdAt: number;
  words: WordItem[];
}

// ─── Word Popup ───
// ─── Phrases ───
export interface PhraseHighlight {
  phrase: string;
  startIdx: number;
  endIdx: number;
  color: string;
}

export interface PhraseItem {
  id: string;
  phrase: string;
  definition: string;
  examples?: WordExample[];
  synonyms?: string[];
}

export interface PhraseList {
  id: string;
  title: string;
  createdAt: number;
  phrases: PhraseItem[];
}

export interface WordPopupData {
  word: string;
  sentence: string;
  x: number;
  y: number;
  isPhrase?: boolean;
  phraseDefinition?: string;
}

// ─── AI Word Lookup Result ───
export interface WordLookupResult {
  word: string;
  definition: string;
  phoneticUK?: string;
  phoneticUS?: string;
  definitions?: WordDefinition[];
  examples: string[];
  synonyms?: string[];
  phrases?: WordPhrase[];
  mnemonic?: string;
  derivatives?: Derivative[];
}

// ─── Learning Pain Points ───
export interface PainRecord {
  /** Total lookup count per word */
  wordLookups: Record<string, number>;
  /** Question IDs the user got wrong or asked for help with */
  askedQuestions: string[];
  /** Count per question type */
  questionsByType: Record<string, number>;
  /** Timestamps of study sessions */
  sessionDates: number[];
}

export const defaultPainRecord = (): PainRecord => ({
  wordLookups: {},
  askedQuestions: [],
  questionsByType: { 'banked-cloze': 0, 'long-reading-match': 0, 'careful-reading': 0, 'listening': 0, 'translation': 0, 'writing': 0 },
  sessionDates: [Date.now()],
});
