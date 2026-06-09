import { useState, useEffect, useRef, useMemo } from 'react';
import { X, BookmarkPlus, MessageSquare, Loader2, Sparkles, Volume2, BookOpen, Link2 } from 'lucide-react';
import { VocabList, WordLookupResult, WordDefinition, WordExample, WordPhrase } from '../types';

// ── Word normalization ──
function getBaseForms(word: string): string[] {
  const w = word.toLowerCase().trim();
  const clean = w.replace(/[^a-z-]+$/, '');
  const forms = new Set([w, clean]);
  if (clean.length < 3) return [clean];
  const rules: [RegExp, string][] = [
    [/ies$/, 'y'], [/ves$/, 'f'], [/ses$/, 's'],
    [/ied$/, 'y'], [/cked$/, 'ck'], [/ated$/, 'ate'],
    [/ized$/, 'ize'], [/ised$/, 'ise'],
    [/gging$/, 'g'], [/nning$/, 'n'], [/tting$/, 't'],
    [/pping$/, 'p'], [/mming$/, 'm'], [/lling$/, 'll'],
    [/ssing$/, 'ss'], [/dding$/, 'dd'], [/rring$/, 'rr'],
    [/ning$/, 'n'], [/ying$/, 'ie'], [/ping$/, 'p'],
    [/ring$/, 'r'], [/ting$/, 't'], [/ding$/, 'd'],
    [/sed$/, 'se'], [/med$/, 'me'], [/red$/, 're'],
    [/s$/, ''],
    [/gg$/, 'g'], [/nn$/, 'n'], [/tt$/, 't'], [/pp$/, 'p'],
    [/mm$/, 'm'], [/ll$/, 'l'],
  ];
  for (const [p, r] of rules) {
    if (clean.match(p)) forms.add(clean.replace(p, r));
  }
  return Array.from(forms);
}

interface WordPopupProps {
  word: string;
  sentence: string;
  x: number;
  y: number;
  vocabLists: VocabList[];
  apiKey: string;
  wordCache: Map<string, WordLookupResult>;
  enableGrammarAnalysis?: boolean;
  onCacheUpdate: (word: string, data: WordLookupResult) => void;
  onClose: () => void;
  onAddToVocab: (word: string, definition: string, sentence: string, richData?: WordLookupResult) => void;
  onDeepAsk: (word: string, sentence: string) => void;
}

interface WordGrammarAnalysis {
  surfaceForm?: string;
  baseForm?: string;
  partOfSpeech?: string;
  sentenceRole?: string;
  grammarReason?: string;
  morphology?: string;
  structure?: string;
  replacementWarning?: string;
}

export default function WordPopup({ word, sentence, x, y, vocabLists, apiKey, wordCache, enableGrammarAnalysis, onCacheUpdate, onClose, onAddToVocab, onDeepAsk }: WordPopupProps) {
  const cached = wordCache.get(word.toLowerCase());
  const [lookup, setLookup] = useState<WordLookupResult | null>(cached || null);
  const [isLoading, setIsLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [grammar, setGrammar] = useState<WordGrammarAnalysis | null>(null);
  const [grammarLoading, setGrammarLoading] = useState(false);
  const [grammarError, setGrammarError] = useState<string | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});

  // Search vocab using normalized forms
  const allWords = useMemo(() => vocabLists.flatMap((l) => l.words), [vocabLists]);
  const baseForms = useMemo(() => getBaseForms(word), [word]);

  const existingEntry = useMemo(() => {
    const exact = allWords.find((w) => w.word.toLowerCase() === word.toLowerCase());
    if (exact) return { ...exact, matchType: 'exact' as const };
    for (const form of baseForms) {
      if (form === word.toLowerCase()) continue;
      const m = allWords.find((w) => w.word.toLowerCase() === form);
      if (m) return { ...m, matchType: 'derived' as const, originalForm: form };
    }
    return null;
  }, [allWords, baseForms, word]);

  // Position
  useEffect(() => {
    const pw = enableGrammarAnalysis && sentence && !word.includes(' ') ? 560 : 320;
    const ph = 400, vw = window.innerWidth, vh = window.innerHeight;
    let left = x + 10, top = y - 10;
    if (left + pw > vw - 20) left = x - pw - 10;
    if (top + ph > vh - 20) top = vh - ph - 20;
    if (left < 10) left = 10;
    if (top < 10) top = 10;
    setPopupStyle({ position: 'fixed', left, top, zIndex: 100 });
  }, [x, y, word, sentence, enableGrammarAnalysis]);

  // Check for pre-scanned phrase definition
  const phraseDef = (window as any).__phraseDef as string | undefined;
  const phraseBase = (window as any).__phraseBase as string | undefined;
  const phraseCategory = (window as any).__phraseCategory as string | undefined;
  const phraseReason = (window as any).__phraseReason as string | undefined;
  const isPhrase = word.includes(' ') && word.length > 5;
  const showGrammarPanel = !!enableGrammarAnalysis && !!apiKey && !!sentence && !isPhrase && /^[A-Za-z][A-Za-z'-]*$/.test(word);

  const categoryLabel = (category?: string) => {
    switch (category) {
      case 'verb_phrase': return '动词短语';
      case 'preposition_collocation': return '介词搭配';
      case 'fixed_noun_phrase': return '固定名词短语';
      case 'pure_prepositional_phrase': return '纯介词短语';
      default: return category || '短语';
    }
  };

  // Fetch AI data — skip if cached or vocab has rich data or phrase definition exists
  useEffect(() => {
    if (!apiKey) return;
    if (phraseDef || isPhrase) {
      if (!cached) {
        setLookup({
          word,
          definition: phraseDef || '',
          definitions: phraseCategory ? [{ pos: categoryLabel(phraseCategory), meaning: phraseReason || phraseDef || '' }] : undefined,
          examples: [],
        });
      }
      if (cached?.examples?.length) { setIsLoading(false); return; }
      setIsLoading(true); setError(null);
      fetch('/api/phrase-examples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phrase: phraseBase || word, sentence, definition: phraseDef, category: phraseCategory, apiKey }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.definition || data.examples?.length) {
            const wl: WordLookupResult = { word, ...data };
            setLookup(wl);
            onCacheUpdate(word, wl);
          }
        })
        .catch(() => setError('短语解析加载失败'))
        .finally(() => {
          delete (window as any).__phraseDef;
          delete (window as any).__phraseBase;
          delete (window as any).__phraseCategory;
          delete (window as any).__phraseReason;
          setIsLoading(false);
        });
      return;
    }
    if (existingEntry?.definitions?.length || existingEntry?.examples?.length) {
      setLookup({ word, definition: existingEntry.definition || '', phoneticUK: existingEntry.phoneticUK, phoneticUS: existingEntry.phoneticUS, definitions: existingEntry.definitions, examples: (existingEntry.examples||[]).map(e => `${e.en} —— ${e.zh}`), synonyms: existingEntry.synonyms, phrases: existingEntry.phrases, mnemonic: existingEntry.mnemonic, derivatives: existingEntry.derivatives });
      setIsLoading(false); return;
    }
    if (cached) { setIsLoading(false); return; }
    setIsLoading(true); setError(null);
    fetch('/api/word-examples', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ word, sentence, apiKey }) })
      .then((r) => r.json())
      .then((data) => { if (data.definition || data.examples?.length) { const wl: WordLookupResult = { word, ...data }; setLookup(wl); onCacheUpdate(word, wl); } })
      .catch(() => setError('例句加载失败'))
      .finally(() => setIsLoading(false));
  }, [word, sentence, apiKey]);

  useEffect(() => {
    if (!showGrammarPanel) {
      setGrammar(null);
      setGrammarLoading(false);
      setGrammarError(null);
      return;
    }
    setGrammar(null);
    setGrammarLoading(true);
    setGrammarError(null);
    fetch('/api/word-grammar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word, sentence, apiKey }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data && !data.error) setGrammar(data);
        else setGrammarError(data?.details || data?.error || '词形语法解析失败');
      })
      .catch(() => setGrammarError('词形语法解析失败'))
      .finally(() => setGrammarLoading(false));
  }, [word, sentence, apiKey, showGrammarPanel]);

  // ESC
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // Outside click
  useEffect(() => {
    const h = (e: MouseEvent) => { if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose(); };
    setTimeout(() => window.addEventListener('click', h), 100);
    return () => window.removeEventListener('click', h);
  }, [onClose]);

  // Merge data: existing entry takes priority, AI fills gaps
  const defs: WordDefinition[] = existingEntry?.definitions || lookup?.definitions || [];
  const examples: WordExample[] = existingEntry?.examples || [];
  const aiExamples: string[] = lookup?.examples || [];
  const syns: string[] = existingEntry?.synonyms || lookup?.synonyms || [];
  const phrases: WordPhrase[] = existingEntry?.phrases || lookup?.phrases || [];
  const derivatives = existingEntry?.derivatives || lookup?.derivatives || [];
  const mnemonic = existingEntry?.mnemonic || lookup?.mnemonic || '';
  const phoneticUK = existingEntry?.phoneticUK || lookup?.phoneticUK || '';
  const phoneticUS = existingEntry?.phoneticUS || lookup?.phoneticUS || '';
  const displayDefinition = existingEntry?.definition || lookup?.definition || '';

  return (
    <div ref={popupRef} style={popupStyle} className={`${showGrammarPanel ? 'w-[560px]' : 'w-[320px]'} max-h-[450px] bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="min-w-0 flex-1">
            <span className="font-bold text-base text-slate-800">{word}</span>
            {phraseBase && phraseBase !== word && (
              <span className="text-xs text-slate-400 ml-1">← {phraseBase}</span>
            )}
          </div>
          {isPhrase && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-bold shrink-0">短语</span>}
          {existingEntry && (
            <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold shrink-0">
              词汇本{existingEntry.matchType === 'derived' ? `←${existingEntry.originalForm}` : ''}
            </span>
          )}
        </div>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-md shrink-0"><X className="w-4 h-4" /></button>
      </div>

      {/* Body */}
      <div className={`p-4 overflow-y-auto flex-1 text-sm ${showGrammarPanel ? 'grid grid-cols-[minmax(0,1fr)_220px] gap-4' : 'space-y-3'}`}>
        <div className="space-y-3 min-w-0">
        {/* Phonetics */}
        {(phoneticUK || phoneticUS) && (
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <Volume2 className="w-3.5 h-3.5 text-slate-400" />
            {phoneticUK && <span>{phoneticUK}</span>}
            {phoneticUS && <span>{phoneticUS}</span>}
          </div>
        )}

        {/* Definition */}
        {displayDefinition && (
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><BookOpen className="w-3 h-3" /> 释义</p>
            <p className="text-sm text-slate-700 leading-relaxed">{displayDefinition}</p>
          </div>
        )}

        {/* Definitions by POS */}
        {defs.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">词性 & 词义</p>
            {defs.map((d, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-[11px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded shrink-0 min-w-[2rem] text-center">{d.pos}</span>
                <span className="text-sm text-slate-700">{d.meaning}</span>
              </div>
            ))}
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-blue-500 py-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />AI 正在生成...</div>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}

        {/* Examples from vocab */}
        {examples.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><Sparkles className="w-3 h-3 text-green-400" /> 词典例句</p>
            {examples.slice(0, 2).map((ex, i) => (
              <div key={i} className="bg-green-50/50 border border-green-100 rounded-lg p-2">
                <p className="text-xs text-slate-700 leading-relaxed">{ex.en}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{ex.zh}</p>
              </div>
            ))}
          </div>
        )}

        {/* AI examples */}
        {aiExamples.length > 0 && examples.length === 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><Sparkles className="w-3 h-3 text-blue-400" /> AI 例句</p>
            {aiExamples.slice(0, 2).map((ex, i) => (
              <div key={i} className="bg-slate-50 border border-slate-100 rounded-lg p-2">
                <p className="text-xs text-slate-700 leading-relaxed">{ex}</p>
              </div>
            ))}
          </div>
        )}

        {/* Synonyms */}
        {syns.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><Link2 className="w-3 h-3" /> 同义词</p>
            <div className="flex flex-wrap gap-1">
              {syns.map((s, i) => <span key={i} className="px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded-full">{s}</span>)}
            </div>
          </div>
        )}

        {/* Phrases */}
        {phrases.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">短语搭配</p>
            {phrases.slice(0, 3).map((p, i) => (
              <div key={i} className="flex gap-2 text-xs">
                <span className="font-bold text-slate-600 shrink-0">{p.phrase}</span>
                <span className="text-slate-500">{p.meaning}</span>
              </div>
            ))}
          </div>
        )}

        {/* Derivatives */}
        {derivatives.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">🌿 派生词</p>
            <div className="flex flex-wrap gap-1.5">
              {derivatives.map((d,i) => (
                <span key={i} className="px-2 py-1 bg-teal-50 text-teal-700 text-xs rounded-lg flex items-center gap-1">
                  <span className="font-bold">{d.word}</span>
                  <span className="text-[9px] text-teal-500">{d.pos}.</span>
                  <span className="text-[10px]">{d.meaning}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Mnemonic */}
        {mnemonic && (
          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">💡 记忆法</p>
            <p className="text-xs text-amber-800 leading-relaxed">{mnemonic}</p>
          </div>
        )}

        {/* Sentence context */}
        {sentence && (
          <p className="text-[10px] text-slate-400 italic border-t border-slate-100 pt-2">
            原文：...{sentence.substring(0, 80)}{sentence.length > 80 ? '...' : ''}
          </p>
        )}
        </div>

        {showGrammarPanel && (
          <aside className="border-l border-slate-100 pl-4 space-y-2 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">词形语法</p>
              {grammarLoading && <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />}
            </div>
            {grammarError && <p className="text-xs text-red-400">{grammarError}</p>}
            {!grammarLoading && !grammarError && grammar && (
              <div className="space-y-2">
                <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-2">
                  <p className="text-[10px] text-indigo-400 font-bold mb-1">当前词形</p>
                  <p className="text-xs text-slate-700">
                    <span className="font-bold">{grammar.surfaceForm || word}</span>
                    {grammar.baseForm && grammar.baseForm !== (grammar.surfaceForm || word) && <span className="text-slate-400"> ← {grammar.baseForm}</span>}
                  </p>
                </div>
                {grammar.partOfSpeech && <p className="text-xs text-slate-600"><span className="font-bold text-slate-500">词性：</span>{grammar.partOfSpeech}</p>}
                {grammar.sentenceRole && <p className="text-xs text-slate-600"><span className="font-bold text-slate-500">句中成分：</span>{grammar.sentenceRole}</p>}
                {grammar.morphology && <p className="text-xs text-slate-600"><span className="font-bold text-slate-500">形态：</span>{grammar.morphology}</p>}
                {grammar.grammarReason && (
                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
                    <p className="text-[10px] text-slate-400 font-bold mb-1">为什么用这个词形</p>
                    <p className="text-xs text-slate-700 leading-relaxed">{grammar.grammarReason}</p>
                  </div>
                )}
                {grammar.structure && <p className="text-xs text-slate-500 leading-relaxed">{grammar.structure}</p>}
                {grammar.replacementWarning && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2 leading-relaxed">{grammar.replacementWarning}</p>
                )}
              </div>
            )}
            {!grammarLoading && !grammarError && !grammar && <p className="text-xs text-slate-400">暂无词形语法解析。</p>}
          </aside>
        )}
      </div>

      {/* Actions */}
      <div className="flex border-t border-slate-100 shrink-0">
        <button onClick={() => { onAddToVocab(word, displayDefinition, sentence, lookup || (existingEntry as any) || undefined); onClose(); }}
          className="flex-1 py-2.5 text-xs font-bold text-green-600 hover:bg-green-50 transition-colors flex items-center justify-center gap-1.5 border-r border-slate-100">
          <BookmarkPlus className="w-3.5 h-3.5" />{existingEntry ? '已收藏 ✓' : '加入词汇本'}
        </button>
        <button onClick={() => { onDeepAsk(word, sentence); onClose(); }}
          className="flex-1 py-2.5 text-xs font-bold text-blue-600 hover:bg-blue-50 transition-colors flex items-center justify-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5" />深度提问
        </button>
      </div>
    </div>
  );
}
