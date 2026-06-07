import { useState, useRef } from 'react';
import { Passage, SectionLabels, SectionIcons } from '../types';
import {
  MessageSquare, HelpCircle, BookmarkPlus, CheckCircle2, XCircle,
  BookOpen, Grid3X3, AlignLeft, Languages, FileText, Eye, Target, Sparkles,
} from 'lucide-react';

interface MainViewerProps {
  phraseMode?: boolean;
  phraseHighlights?: any[];
  onScanParagraph?: (text: string, callback: (phrases: any[]) => void) => void;
  passage: Passage;
  onSentenceClick: (sentence: string) => void;
  onQuestionClick: (content: string, options: string, answer: string, explanation: string) => void;
  onWordClick: (word: string, sentence: string, x: number, y: number) => void;
  onBookmark: (type: 'sentence' | 'word' | 'question', content: string, context?: string) => void;
}

// ── Word-level rendering: preserves ALL spacing ──
function RenderSentence({ text, onWordClick, onSentenceClick, onBookmark, phraseMode, phraseHighlights, passageTitle }: {
  text: string; onWordClick: (w: string, s: string, x: number, y: number) => void;
  onSentenceClick: (s: string) => void; onBookmark: MainViewerProps['onBookmark'];
  phraseMode?: boolean; phraseHighlights?: any[]; passageTitle: string;
}) {
  const parts = text.split(/\b/);
  // Track touch start position to prevent accidental word clicks during scroll
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent, word: string, sentence: string) => {
    if (!touchStart.current) return;
    const dx = Math.abs(e.changedTouches[0].clientX - touchStart.current.x);
    const dy = Math.abs(e.changedTouches[0].clientY - touchStart.current.y);
    // Only treat as click if finger didn't move much (not scrolling)
    if (dx < 8 && dy < 8) {
      e.preventDefault();
      e.stopPropagation();
      const r = (e.target as HTMLElement).getBoundingClientRect();
      onWordClick(word, sentence, r.left, r.bottom);
    }
    touchStart.current = null;
  };

  return (
    <span className="inline">
      {parts.map((part, i) => {
        if (/^[a-zA-Z]{2,}$/.test(part)) {
          // In phrase mode: check if the full phrase appears in this sentence
          let hlStyle: React.CSSProperties = {};
          let phraseMatch: any = null;
          if (phraseMode && phraseHighlights && phraseHighlights.length > 0) {
            const normSentence = text.replace(/\s+/g, ' ').toLowerCase();
            phraseMatch = phraseHighlights.find((h: any) => {
              if (!h.phrase) return false;
              return normSentence.includes(h.phrase.replace(/\s+/g, ' ').toLowerCase());
            });
            if (phraseMatch) hlStyle = { backgroundColor: phraseMatch.color, borderRadius: '3px', padding: '1px 2px' };
          }
          const clickable = !phraseMode || !!phraseMatch;
          return (
            <span
              key={i}
              onClick={(e) => {
                if (!clickable) return;
                e.stopPropagation(); const r=(e.target as HTMLElement).getBoundingClientRect();
                if (phraseMatch) {
                  (window as any).__phraseDef = phraseMatch.definition;
                  (window as any).__phraseBase = phraseMatch.baseForm || null;
                  onWordClick(phraseMatch.baseForm || phraseMatch.phrase, text, r.left, r.bottom);
                } else onWordClick(part, text, r.left, r.bottom);
              }}
              onTouchStart={clickable ? handleTouchStart : undefined}
              onTouchEnd={clickable ? ((e) => handleTouchEnd(e, part, text)) : undefined}
              className={`${clickable ? 'cursor-pointer hover:bg-blue-500 hover:text-white active:bg-blue-600' : 'cursor-default'} rounded-sm px-[1px] transition-colors touch-manipulation`}
              style={hlStyle}
              title={phraseMatch ? '点击查看短语详解' : phraseMode ? '' : '点击查词'}
            >
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
      {/* Sentence toolbar — always visible */}
      <span className="inline-flex items-center gap-0.5 ml-2 align-middle">
        <button
          onClick={(e) => { e.stopPropagation(); onSentenceClick(text); }}
          onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onSentenceClick(text); }}
          className="p-1.5 rounded-lg hover:bg-blue-100 active:bg-blue-200 text-blue-400 hover:text-blue-600 transition-colors min-w-[32px] min-h-[32px] touch-manipulation"
          title="AI 解析此句"
        >
          <Sparkles className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onBookmark('sentence', text, passageTitle); }}
          onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onBookmark('sentence', text, passageTitle); }}
          className="p-1.5 rounded-lg hover:bg-purple-100 active:bg-purple-200 text-slate-300 hover:text-purple-500 transition-colors min-w-[32px] min-h-[32px] touch-manipulation"
          title="收藏此句"
        >
          <BookmarkPlus className="w-3.5 h-3.5" />
        </button>
      </span>
    </span>
  );
}

export default function MainViewer({ passage, onSentenceClick, onQuestionClick, onWordClick, phraseMode, phraseHighlights, onScanParagraph, onBookmark }: MainViewerProps) {
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [revealedQuestions, setRevealedQuestions] = useState<Record<string, boolean>>({});

  const selectAnswer = (qId: string, key: string) => {
    if (revealedQuestions[qId]) return;
    setUserAnswers((prev) => ({ ...prev, [qId]: key }));
  };

  const revealAnswer = (qId: string) => {
    setRevealedQuestions((prev) => ({ ...prev, [qId]: true }));
  };

  const isCorrect = (q: any) => {
    const ua = userAnswers[q.id];
    if (!ua) return false;
    return ua.toUpperCase().trim() === (q.correctAnswer || '').toUpperCase().trim();
  };

  const isWrong = (q: any) => {
    const ua = userAnswers[q.id];
    if (!ua) return false;
    if (!q.correctAnswer) return false;
    return ua.toUpperCase().trim() !== (q.correctAnswer || '').toUpperCase().trim();
  };

  // ── Section Header ──
  const Header = () => (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{SectionIcons[passage.section] || '📄'}</span>
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded">
          {SectionLabels[passage.section] || passage.section}
        </span>
      </div>
      <h2 className="text-2xl font-bold text-slate-900 mb-2">{passage.title}</h2>
      {passage.instruction && (
        <p className="text-sm text-slate-500 italic bg-slate-50 border border-slate-100 p-4 rounded-lg">{passage.instruction}</p>
      )}
    </div>
  );

  // ── Reading passage (shared) ──
  const PassageBody = () => (
    <div className="space-y-6 leading-loose font-serif" style={{fontSize: 'inherit'}}>
      {passage.paragraphs.map((para, pi) => (
        <p key={para.id} className="indent-8 group relative">
          {para.sentences.map((sent, si) => (
            <RenderSentence
              key={`${pi}-${si}`}
              text={sent}
              onWordClick={onWordClick}
              onSentenceClick={onSentenceClick}
              onBookmark={onBookmark}
              phraseMode={phraseMode}
              phraseHighlights={phraseHighlights}
              passageTitle={passage.title}
            />
          ))}
        </p>
      ))}
    </div>
  );

  // ── Option button (reusable, touch-friendly) ──
  const OptionBtn = ({ q, opt }: { q: any; opt: any }) => {
    if (!q || !opt || !opt.key) return null;
    const isSelected = userAnswers[q.id] === opt.key;
    const isRevealed = revealedQuestions[q.id];
    const isCorrectOpt = isRevealed && opt.key?.toUpperCase() === (q.correctAnswer || '').toUpperCase();
    const isWrongOpt = isRevealed && isSelected && opt.key?.toUpperCase() !== (q.correctAnswer || '').toUpperCase();

    let cls = 'border-slate-200 bg-white hover:bg-blue-50 active:bg-blue-100 text-slate-700';
    if (isRevealed) {
      if (isCorrectOpt) cls = 'border-green-400 bg-green-50 text-green-800 font-bold';
      else if (isWrongOpt) cls = 'border-red-400 bg-red-50 text-red-700';
      else cls = 'border-slate-100 bg-white text-slate-400';
    } else if (isSelected) {
      cls = 'border-blue-400 bg-blue-50 text-blue-700 font-bold ring-2 ring-blue-400';
    }

    const handleTouch = (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      selectAnswer(q.id, opt.key);
    };

    return (
      <button
        onClick={(e) => { e.stopPropagation(); selectAnswer(q.id, opt.key); }}
        onTouchEnd={handleTouch}
        disabled={isRevealed}
        className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-left text-sm transition-all min-h-[44px] touch-manipulation ${cls} ${!isRevealed ? 'cursor-pointer hover:shadow-md active:scale-[0.98]' : 'cursor-default'}`}
      >
        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
          isRevealed && isCorrectOpt ? 'bg-green-500 text-white'
          : isRevealed && isWrongOpt ? 'bg-red-500 text-white'
          : isSelected ? 'bg-blue-500 text-white'
          : 'bg-slate-200 text-slate-600'
        }`}>{opt.key}</span>
        <span className="flex-1">{opt.text}</span>
        {isRevealed && isCorrectOpt && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
        {isRevealed && isWrongOpt && <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
      </button>
    );
  };

  // ── Answer feedback bar ──
  const AnswerFeedback = ({ q }: { q: any }) => {
    if (!revealedQuestions[q.id]) return null;
    const correct = isCorrect(q);
    const wrong = isWrong(q);
    return (
      <div className={`ml-10 p-4 rounded-lg mb-3 flex items-start gap-2 ${
        correct ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'
      }`}>
        {correct ? <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          : <Target className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />}
        <div>
          <p className={`text-sm font-bold mb-1 ${correct ? 'text-green-800' : 'text-amber-800'}`}>
            {correct ? '✓ 回答正确！'
              : wrong ? `✗ 你的答案: ${userAnswers[q.id]}，正确答案: ${q.correctAnswer}`
              : `正确答案: ${q.correctAnswer || '(无)'}`}
          </p>
          {q.answerExplanation && (
            <p className="text-xs text-slate-600 leading-relaxed">{q.answerExplanation}</p>
          )}
        </div>
      </div>
    );
  };

  // ── Action buttons below question ──
  const ActionRow = ({ q }: { q: any }) => {
    const hasSelected = !!userAnswers[q.id];
    const isRev = revealedQuestions[q.id];
    return (
      <div className="ml-10 flex gap-2 flex-wrap items-center">
        {!isRev && hasSelected && (
          <button onClick={() => revealAnswer(q.id)} className="flex items-center gap-1.5 text-sm font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 px-4 py-2 rounded-lg transition-colors">
            <Eye className="w-4 h-4" /> 核对答案
          </button>
        )}
        {isRev && (
          <button
            onClick={() => {
              const opts = (q.options || []).map((o: any) => `${o.key}) ${o.text}`).join('\n');
              onQuestionClick(q.content, opts, q.correctAnswer || '', q.answerExplanation || '');
            }}
            className="flex items-center gap-1.5 text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-lg transition-colors"
          >
            <MessageSquare className="w-4 h-4" /> AI 深度讲解
          </button>
        )}
        {!hasSelected && !isRev && (
          <p className="text-xs text-slate-400 py-2">👆 点击选项选择你的答案</p>
        )}
      </div>
    );
  };

  // ── Question card wrapper ──
  const QCard = ({ q, children = null }: { q: any; children?: React.ReactNode }) => {
    const rev = revealedQuestions[q.id];
    return (
      <div className={`bg-white border rounded-xl p-6 shadow-sm relative group transition-all ${
        rev ? (isCorrect(q) ? 'border-green-300 bg-green-50/30' : isWrong(q) ? 'border-red-300 bg-red-50/30' : 'border-blue-200') : 'border-slate-200 hover:border-blue-200'
      }`}>
        <button
          onClick={() => onBookmark('question', q.content, passage.title)}
          className="absolute top-3 right-3 text-slate-300 hover:text-blue-500 p-1.5 rounded-lg hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-all"
        >
          <BookmarkPlus className="w-4 h-4" />
        </button>
        <div className="flex items-start gap-3 mb-4 pr-8">
          <span className="text-blue-500 font-bold text-sm bg-blue-50 w-7 h-7 rounded-full flex items-center justify-center shrink-0">{q.number}</span>
          <div>
            <p className="font-bold text-slate-800 text-[15px]">{q.content}</p>
            {revealedQuestions[q.id] && q.matchParagraph && (
              <span className="inline-block mt-1 bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded">→ 段落 {q.matchParagraph}</span>
            )}
          </div>
        </div>
        {children}
        <AnswerFeedback q={q} />
        <ActionRow q={q} />
      </div>
    );
  };

  // ═══════════════════════════════════════════
  // BANKED CLOZE (选词填空)
  // ═══════════════════════════════════════════
  if (passage.section === 'banked-cloze') {
    return (
      <div className="p-8 pb-32">
        <Header />

        {/* Word Bank */}
        {passage.wordBank && passage.wordBank.length > 0 && (
          <div className="mb-8 p-5 bg-amber-50 border border-amber-200 rounded-2xl">
            <div className="flex items-center gap-2 mb-3">
              <Grid3X3 className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">候选词汇</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {passage.wordBank.map((w, i) => (
                <span
                  key={i}
                  onClick={(e) => {
                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                    onWordClick(w.trim(), '', rect.left, rect.bottom);
                  }}
                  className="px-3 py-1.5 bg-white border border-amber-300 rounded-full text-sm font-medium text-slate-700 hover:bg-amber-100 cursor-pointer transition-colors shadow-sm"
                >
                  {String.fromCharCode(65 + i)}. {w.trim()}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Reading passage */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <AlignLeft className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">填空短文 — hover 句尾 ✨ 解析句子</span>
          </div>
          <PassageBody />
        </div>

        {/* Questions: each blank choose from word bank */}
        {passage.questions.length > 0 && (
          <div className="border-t border-slate-200 pt-8">
            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-amber-500" />
              选择填空 — 点击选项作答，点击核对答案 ({passage.questions.length} 题)
            </h3>
            <div className="space-y-6">
              {passage.questions.map((q) => (
                <QCard key={q.id} q={q}>
                  {/* Show the letter options — works for any count */}
                  {(q.options || []).length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4 ml-10">
                      {q.options.map((opt: any) => <OptionBtn key={opt.key} q={q} opt={opt} />)}
                    </div>
                  )}
                </QCard>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // LONG READING MATCH (长篇阅读匹配)
  // ═══════════════════════════════════════════
  if (passage.section === 'long-reading-match') {
    return (
      <div className="p-8 pb-32">
        <Header />
        <div className="mb-10 p-6 bg-slate-50 border border-slate-200 rounded-2xl">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">阅读全文 — hover 句尾 ✨ 解析</span>
          </div>
          <PassageBody />
        </div>
        {passage.questions.length > 0 && (
          <div className="border-t border-slate-200 pt-8">
            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-purple-500" />
              段落匹配 — 每条陈述对应一个段落 ({passage.questions.length} 题)
            </h3>
            <div className="space-y-4">
              {passage.questions.map((q) => (
                <QCard key={q.id} q={q}>
                  {/* Letter grid for paragraph selection */}
                  <div className="space-y-1.5 mb-4 ml-10">
                    <p className="text-xs text-slate-400 mb-2">选择该陈述匹配的段落编号：</p>
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from({ length: 15 }, (_, i) => {
                        const letter = String.fromCharCode(65 + i); // A-O
                        const isSelected = userAnswers[q.id] === letter;
                        const isRev = revealedQuestions[q.id];
                        const isCorrectLet = isRev && letter === (q.correctAnswer || '').toUpperCase();
                        const isWrongLet = isRev && isSelected && letter !== (q.correctAnswer || '').toUpperCase();

                        let btnCls = 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50';
                        if (isRev) {
                          if (isCorrectLet) btnCls = 'border-green-400 bg-green-100 text-green-800 font-bold';
                          else if (isWrongLet) btnCls = 'border-red-400 bg-red-50 text-red-600';
                          else btnCls = 'border-slate-100 bg-white text-slate-300';
                        } else if (isSelected) {
                          btnCls = 'border-purple-400 bg-purple-50 text-purple-700 font-bold ring-1 ring-purple-400';
                        }

                        return (
                          <button
                            key={letter}
                            onClick={() => selectAnswer(q.id, letter)}
                            onTouchEnd={(e) => { e.preventDefault(); selectAnswer(q.id, letter); }}
                            disabled={isRev}
                            className={`w-11 h-11 rounded-xl border text-sm font-bold transition-all touch-manipulation ${btnCls} ${!isRev ? 'cursor-pointer active:scale-90' : 'cursor-default'}`}
                          >
                            {letter}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </QCard>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // CAREFUL READING (仔细阅读)
  // ═══════════════════════════════════════════
  if (passage.section === 'careful-reading') {
    return (
      <div className="p-8 pb-32">
        <Header />
        <PassageBody />
        {passage.questions.length > 0 && (
          <div className="mt-16 border-t border-slate-200 pt-8">
            <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
              <HelpCircle className="w-6 h-6 text-blue-500" />
              选择题 — 先选再看答案 ({passage.questions.length} 题)
            </h3>
            <div className="space-y-8">
              {passage.questions.map((q) => (
                <QCard key={q.id} q={q}>
                  {(q.options || []).length > 0 && (
                    <div className="space-y-1.5 mb-4 ml-10">
                      {q.options.map((opt: any) => <OptionBtn key={opt.key} q={q} opt={opt} />)}
                    </div>
                  )}
                </QCard>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // TRANSLATION (翻译)
  // ═══════════════════════════════════════════
  if (passage.section === 'translation') {
    return (
      <div className="p-8 pb-32">
        <Header />
        {passage.sourceText && (
          <div className="mb-8 p-6 bg-red-50/50 border border-red-200 rounded-2xl">
            <div className="flex items-center gap-2 mb-3">
              <Languages className="w-4 h-4 text-red-500" />
              <span className="text-xs font-bold text-red-600 uppercase tracking-wider">中文原文</span>
            </div>
            <p className="text-lg leading-relaxed text-slate-800 font-serif whitespace-pre-wrap">{passage.sourceText}</p>
          </div>
        )}
        {passage.wordBank && passage.wordBank.length > 0 && (
          <div className="mb-8 p-5 bg-blue-50 border border-blue-200 rounded-2xl">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">参考词汇</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {passage.wordBank.map((w, i) => <span key={i} className="px-3 py-1 bg-white border border-blue-200 rounded-lg text-sm text-slate-600">{w}</span>)}
            </div>
          </div>
        )}
        {passage.questions.length > 0 ? (
          <div className="border-t border-slate-200 pt-8 space-y-4">
            {passage.questions.map((q) => <QCard key={q.id} q={q} />)}
          </div>
        ) : (
          <div className="border-t border-slate-200 pt-8">
            <button
              onClick={() => onQuestionClick(`请将以下中文翻译成英文：\n${passage.sourceText || passage.title}`, '', '', '')}
              className="w-full py-4 bg-red-50 hover:bg-red-100 border-2 border-dashed border-red-300 rounded-2xl text-red-600 font-bold text-sm transition-colors flex items-center justify-center gap-2"
            >
              <Languages className="w-5 h-5" /> 向 AI 请求翻译参考
            </button>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // WRITING (写作)
  // ═══════════════════════════════════════════
  if (passage.section === 'writing') {
    return (
      <div className="p-8 pb-32">
        <Header />
        <PassageBody />
        {passage.questions.length > 0 ? (
          <div className="mt-16 border-t border-slate-200 pt-8 space-y-4">
            {passage.questions.map((q) => <QCard key={q.id} q={q} />)}
          </div>
        ) : (
          <div className="mt-16 border-t border-slate-200 pt-8">
            <button
              onClick={() => onQuestionClick(`请根据以下写作题目提供写作思路和范文：\n${passage.title}`, '', '', '')}
              className="w-full py-4 bg-blue-50 hover:bg-blue-100 border-2 border-dashed border-blue-300 rounded-2xl text-blue-600 font-bold text-sm transition-colors flex items-center justify-center gap-2"
            >
              ✍️ 向 AI 请求写作指导
            </button>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // LISTENING (听力) —只显示题目，不显示原文
  // ═══════════════════════════════════════════
  if (passage.section === 'listening') {
    return (
      <div className="p-8 pb-32">
        <Header />
        {passage.questions.length > 0 && (
          <div>
            <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
              <HelpCircle className="w-6 h-6 text-indigo-500" />
              听力选择题 — 先选再看答案 ({passage.questions.length} 题)
            </h3>
            <div className="space-y-8">
              {passage.questions.map((q) => (
                <QCard key={q.id} q={q}>
                  {(q.options || []).length > 0 && (
                    <div className="space-y-1.5 mb-4 ml-10">
                      {q.options.map((opt: any) => <OptionBtn key={opt.key} q={q} opt={opt} />)}
                    </div>
                  )}
                </QCard>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // FALLBACK
  // ═══════════════════════════════════════════
  return (
    <div className="p-8 pb-32">
      <Header />
      <PassageBody />
      {passage.questions.length > 0 && (
        <div className="mt-16 border-t border-slate-200 pt-8">
          <h3 className="text-xl font-bold text-slate-800 mb-6">做题与精讲</h3>
          <div className="space-y-8">{passage.questions.map((q) => <QCard key={q.id} q={q} />)}</div>
        </div>
      )}
    </div>
  );
}
