import { useState } from 'react';
import { VocabList, WordItem } from '../types';
import { BookmarkPlus, Volume2, ChevronRight, ChevronDown, Search, X, Sparkles, Link2 } from 'lucide-react';

interface VocabViewerProps {
  vocabList: VocabList;
  onExplainWord: (word: string) => void;
  onWordClick: (word: string, sentence: string, x: number, y: number) => void;
  onBookmark: (type: 'sentence' | 'word' | 'question', content: string, context?: string) => void;
}

function WordCard({ item, onExplainWord, onWordClick, onBookmark, listTitle }: {
  item: WordItem;
  onExplainWord: (w: string) => void;
  onWordClick: (w: string, s: string, x: number, y: number) => void;
  onBookmark: VocabViewerProps['onBookmark'];
  listTitle: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasRich = (item.definitions?.length || 0) > 0 || (item.examples?.length || 0) > 0 || (item.synonyms?.length || 0) > 0 || (item.phrases?.length || 0) > 0 || !!item.mnemonic;

  return (
    <div className="bg-[var(--th-bg-card)] border border-[var(--th-border)] hover:border-green-400 rounded-xl shadow-sm hover:shadow-md transition-all group overflow-hidden">
      {/* Header: always visible */}
      <div className="p-4">
        <div className="flex justify-between items-start mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <h3
              className="font-bold text-lg text-blue-600 hover:text-blue-800 cursor-pointer hover:underline truncate"
              onClick={(e) => {
                const rect = (e.target as HTMLElement).getBoundingClientRect();
                onWordClick(item.word, '', rect.left, rect.bottom);
              }}
              title="点击查看完整释义"
            >{item.word}</h3>
            {hasRich && (
              <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }} className="p-0.5 rounded hover:bg-slate-100 transition-colors">
                <span className={`transition-transform block ${expanded ? 'rotate-180' : ''}`}>
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); onBookmark('word', item.word, `来源词表: ${listTitle}`); }}
              className="text-[var(--th-text-muted)] hover:text-purple-500 p-1 rounded transition-colors"
              title="收藏单词"
            >
              <BookmarkPlus className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onExplainWord(item.word); }}
              className="text-[var(--th-text-muted)] hover:text-blue-500 p-1 rounded transition-colors"
              title="AI 深度解析"
            >
              <Sparkles className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Phonetics */}
        {(item.phoneticUK || item.phoneticUS) && (
          <div className="flex items-center gap-2 text-[11px] text-slate-400 mb-1">
            <Volume2 className="w-3 h-3" />
            {item.phoneticUK && <span>{item.phoneticUK}</span>}
            {item.phoneticUS && <span>{item.phoneticUS}</span>}
          </div>
        )}

        {/* Summary definition */}
        {item.definition && (
          <p className="text-sm text-[var(--th-text-soft)] line-clamp-2">{item.definition}</p>
        )}
        {!item.definition && !hasRich && <p className="text-xs text-slate-400 italic">暂无释义</p>}
      </div>

      {/* Expanded rich content */}
      {expanded && hasRich && (
        <div className="px-4 pb-4 space-y-3 border-t border-[var(--th-border)] pt-3">
          {item.definitions && item.definitions.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase">词性 & 词义</p>
              {item.definitions.map((d, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded shrink-0 min-w-[2rem] text-center">{d.pos}</span>
                  <span className="text-sm text-[var(--th-text)]">{d.meaning}</span>
                </div>
              ))}
            </div>
          )}

          {item.examples && item.examples.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold text-slate-400 uppercase">例句</p>
              {item.examples.slice(0, 3).map((ex, i) => (
                <div key={i} className="bg-[var(--th-bg-soft)] border border-[var(--th-border)] rounded-lg p-2">
                  <p className="text-xs text-[var(--th-text)] leading-relaxed">{ex.en}</p>
                  <p className="text-[10px] text-[var(--th-text-soft)] mt-0.5">{ex.zh}</p>
                </div>
              ))}
            </div>
          )}

          {item.synonyms && item.synonyms.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><Link2 className="w-3 h-3" /> 同义词</p>
              <div className="flex flex-wrap gap-1">
                {item.synonyms.map((s, i) => <span key={i} className="px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded-full">{s}</span>)}
              </div>
            </div>
          )}

          {item.phrases && item.phrases.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase">短语搭配</p>
              {item.phrases.slice(0, 3).map((p, i) => (
                <div key={i} className="flex gap-2 text-xs">
                  <span className="font-bold text-[var(--th-text-soft)] shrink-0">{p.phrase}</span>
                  <span className="text-[var(--th-text-soft)]">{p.meaning}</span>
                </div>
              ))}
            </div>
          )}

          {item.mnemonic && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-[10px] font-bold text-amber-600 uppercase mb-1">💡 记忆法</p>
              <p className="text-xs text-amber-800 leading-relaxed">{item.mnemonic}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function VocabViewer({ vocabList, onExplainWord, onWordClick, onBookmark }: VocabViewerProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredWords = vocabList.words.filter((w) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    // Search in word
    if (w.word.toLowerCase().includes(q)) return true;
    // Search in definition
    if (w.definition?.toLowerCase().includes(q)) return true;
    // Search in detailed definitions
    if (w.definitions?.some((d) => d.meaning.toLowerCase().includes(q))) return true;
    // Search in synonyms
    if (w.synonyms?.some((s) => s.toLowerCase().includes(q))) return true;
    // Search in phrases
    if (w.phrases?.some((p) => p.phrase.toLowerCase().includes(q) || p.meaning.toLowerCase().includes(q))) return true;
    return false;
  });

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="p-6 bg-[var(--th-bg-card)] border-b border-[var(--th-border)] shrink-0">
        <h2 className="text-2xl font-bold text-[var(--th-text)] mb-2">{vocabList.title}</h2>
        <div className="flex items-center gap-4 text-sm text-[var(--th-text-soft)] mb-6">
          <span>共 {vocabList.words.length} 个单词</span>
          <span>•</span>
          <span>导入时间：{new Date(vocabList.createdAt).toLocaleDateString()}</span>
          {searchTerm && <span>•</span>}
          {searchTerm && <span className="text-green-600 font-bold">找到 {filteredWords.length} 个</span>}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索单词、释义、同义词、短语..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-8 py-2.5 border border-[var(--th-border)] rounded-lg bg-[var(--th-bg-soft)] focus:bg-[var(--th-bg-card)] dark:focus:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors text-sm"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[var(--th-text-soft)]">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-3">
          {filteredWords.map((item, idx) => (
            <WordCard
              key={idx}
              item={item}
              onExplainWord={onExplainWord}
              onWordClick={onWordClick}
              onBookmark={onBookmark}
              listTitle={vocabList.title}
            />
          ))}
          {filteredWords.length === 0 && (
            <div className="py-12 text-center text-slate-400">
              {searchTerm ? '未找到匹配的单词。' : '词汇本为空。'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
