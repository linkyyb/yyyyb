import { useRef } from 'react';
import { Sparkles, BookmarkPlus } from 'lucide-react';
import { Passage } from '../types';

interface ReadingViewerProps {
  passage: Passage;
  onSentenceClick: (sentence: string) => void;
  onWordClick: (word: string, sentence: string, x: number, y: number) => void;
  onBookmark: (type: 'sentence' | 'word' | 'question', content: string, context?: string) => void;
  fontSize: number;
}

export default function ReadingViewer({ passage, onSentenceClick, onWordClick, onBookmark, fontSize }: ReadingViewerProps) {
  return (
    <div className="p-8 pb-32" style={{ fontSize: fontSize + 'px' }}>
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">📖</span>
          <span className="text-[11px] font-bold uppercase tracking-widest bg-[var(--th-bg-soft)] px-2 py-0.5 rounded text-[var(--th-text-soft)]">
            精读模式
          </span>
        </div>
        <h2 className="text-2xl font-bold mb-2 text-[var(--th-text)]">{passage.title}</h2>
      </div>

      <div className="space-y-6 leading-loose font-serif text-[var(--th-text)]">
        {passage.paragraphs.map((para, pi) => (
          <p key={para.id} className="indent-8 group">
            {para.sentences.map((sent, si) => (
              <ReadingSentence
                key={`${pi}-${si}`}
                text={sent}
                onWordClick={onWordClick}
                onSentenceClick={onSentenceClick}
                onBookmark={onBookmark}
                passageTitle={passage.title}
              />
            ))}
          </p>
        ))}
      </div>

      {passage.paragraphs.length === 0 && (
        <div className="text-center py-20 text-[var(--th-text-soft)]">
          <p className="text-lg">暂无文章内容</p>
          <p className="text-sm mt-2">请上传英文文章或粘贴文本</p>
        </div>
      )}
    </div>
  );
}

// ── Inline sentence renderer (simplified from MainViewer RenderSentence) ──


function ReadingSentence({ text, onWordClick, onSentenceClick, onBookmark, passageTitle }: {
  text: string;
  onWordClick: (w: string, s: string, x: number, y: number) => void;
  onSentenceClick: (s: string) => void;
  onBookmark: (type: 'sentence' | 'word' | 'question', content: string, context?: string) => void;
  passageTitle: string;
}) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const parts = text.split(/\b/);
  return (
    <span className="inline">
      {parts.map((part, i) => {
        if (/^[a-zA-Z]{2,}$/.test(part)) {
          return (
            <span
              key={i}
              onClick={(e) => { e.stopPropagation(); const r = (e.target as HTMLElement).getBoundingClientRect(); onWordClick(part, text, r.left, r.bottom); }}
              onTouchStart={(e) => { touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
              onTouchEnd={(e) => {
                if (!touchStart.current) return;
                const dx = Math.abs(e.changedTouches[0].clientX - touchStart.current.x);
                const dy = Math.abs(e.changedTouches[0].clientY - touchStart.current.y);
                if (dx < 8 && dy < 8) {
                  e.preventDefault(); e.stopPropagation();
                  const r = (e.target as HTMLElement).getBoundingClientRect();
                  onWordClick(part, text, r.left, r.bottom);
                }
                touchStart.current = null;
              }}
              className="cursor-pointer hover:bg-blue-500 hover:text-white active:bg-blue-600 rounded-sm px-[1px] transition-colors touch-manipulation"
              title="点击查词"
            >{part}</span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
      {/* Sentence action buttons — always visible */}
      <span className="inline-flex items-center gap-0.5 ml-2 align-middle">
        <button
          onClick={(e) => { e.stopPropagation(); onSentenceClick(text); }}
          onTouchStart={(e) => { const el = e.currentTarget as HTMLElement; el.dataset.tsx = String(e.touches[0].clientX); el.dataset.tsy = String(e.touches[0].clientY); el.dataset.tst = String(Date.now()); }}
          onTouchEnd={(e) => {
            const el = e.currentTarget as HTMLElement;
            const sx = parseFloat(el.dataset.tsx || '0'), sy = parseFloat(el.dataset.tsy || '0'), st = parseFloat(el.dataset.tst || '0');
            delete el.dataset.tsx; delete el.dataset.tsy; delete el.dataset.tst;
            if (sx && st) {
              const dx = Math.abs(e.changedTouches[0].clientX - sx), dy = Math.abs(e.changedTouches[0].clientY - sy);
              if (dx < 5 && dy < 5 && Date.now() - st < 200) { e.preventDefault(); e.stopPropagation(); onSentenceClick(text); }
            }
          }}
          className="p-1.5 rounded-lg hover:bg-blue-100 active:bg-blue-200 text-blue-400 hover:text-blue-600 transition-colors min-w-[32px] min-h-[32px] touch-manipulation"
          title="AI 解析此句"
        >
          <Sparkles className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onBookmark('sentence', text, passageTitle); }}
          onTouchStart={(e) => { const el = e.currentTarget as HTMLElement; el.dataset.tsx = String(e.touches[0].clientX); el.dataset.tsy = String(e.touches[0].clientY); el.dataset.tst = String(Date.now()); }}
          onTouchEnd={(e) => {
            const el = e.currentTarget as HTMLElement;
            const sx = parseFloat(el.dataset.tsx || '0'), sy = parseFloat(el.dataset.tsy || '0'), st = parseFloat(el.dataset.tst || '0');
            delete el.dataset.tsx; delete el.dataset.tsy; delete el.dataset.tst;
            if (sx && st) {
              const dx = Math.abs(e.changedTouches[0].clientX - sx), dy = Math.abs(e.changedTouches[0].clientY - sy);
              if (dx < 5 && dy < 5 && Date.now() - st < 200) { e.preventDefault(); e.stopPropagation(); onBookmark('sentence', text, passageTitle); }
            }
          }}
          className="p-1.5 rounded-lg hover:bg-purple-100 active:bg-purple-200 text-slate-300 hover:text-purple-500 transition-colors min-w-[32px] min-h-[32px] touch-manipulation"
          title="收藏此句"
        >
          <BookmarkPlus className="w-3.5 h-3.5" />
        </button>
      </span>
    </span>
  );
}
