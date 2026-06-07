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

// ─── CET-6 Question Types ───
export type QuestionType =
  | 'banked-cloze'       // 选词填空 — Section A
  | 'long-reading-match' // 长篇阅读匹配 — Section B
  | 'careful-reading'    // 仔细阅读 — Section C
  | 'listening'          // 听力理解 — Part II
  | 'translation'        // 翻译 — Part IV
  | 'writing';           // 写作 — Part I

export type SectionType = QuestionType;

export const SectionLabels: Record<SectionType, string> = {
  'banked-cloze': '选词填空',
  'long-reading-match': '长篇阅读匹配',
  'careful-reading': '仔细阅读',
  'listening': '听力理解',
  'translation': '翻译',
  'writing': '写作',
};

export const SectionIcons: Record<SectionType, string> = {
  'banked-cloze': '📝',
  'long-reading-match': '📑',
  'careful-reading': '📖',
  'listening': '🎧',
  'translation': '🌐',
  'writing': '✍️',
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
  questionsByType: Record<QuestionType, number>;
  /** Timestamps of study sessions */
  sessionDates: number[];
}

export const defaultPainRecord = (): PainRecord => ({
  wordLookups: {},
  askedQuestions: [],
  questionsByType: { 'banked-cloze': 0, 'long-reading-match': 0, 'careful-reading': 0, 'listening': 0, 'translation': 0, 'writing': 0 },
  sessionDates: [Date.now()],
});
