import { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Send, Settings, Sparkles, Loader2, BookOpen, ChevronDown, ChevronRight, Pencil, Eraser } from 'lucide-react';
import { ChatMessage, DeepSeekModel } from '../types';
import Markdown from 'react-markdown';
import SettingsModal from './SettingsModal';

// ── High-DPI Drawing Canvas ──
function DrawPad({ saved, onSave }: { saved: string; onSave: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef<{x:number;y:number}|null>(null);
  const lastMid = useRef<{x:number;y:number}|null>(null);
  const saveTimeout = useRef<any>(null);
  const [mode, setMode] = useState<'draw'|'write'>('write');
  const [drawColor, setDrawColor] = useState('#1e40af');
  const [drawSize, setDrawSize] = useState(2.5);
  const [text, setText] = useState(() => saved && !saved.startsWith('data:') ? saved : '');

  const initDone = useRef(false);
  // Setup canvas ONCE when entering draw mode, not on every save
  useEffect(() => {
    if (mode !== 'draw') { initDone.current = false; return; }
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || initDone.current) return;
    initDone.current = true;

    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = drawSize;
    ctx.imageSmoothingEnabled = false;
    ctxRef.current = ctx;

    // Restore saved if exists
    if (saved && saved.startsWith('data:image')) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, w, h);
      img.src = saved;
    }
  }, [mode, saved]);

  useEffect(() => {
    if (ctxRef.current) { ctxRef.current.strokeStyle = drawColor; ctxRef.current.lineWidth = drawSize; }
  }, [drawColor, drawSize]);

  const getPos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.PointerEvent) => {
    if (e.pointerType !== 'pen' && e.pointerType !== 'mouse') return;
    const ctx = ctxRef.current; if (!ctx) return;
    const { x, y } = getPos(e);
    const w = drawSize * 0.6;
    ctx.fillStyle = drawColor;
    ctx.beginPath();
    ctx.arc(x, y, w / 2, 0, Math.PI * 2);
    ctx.fill();
    lastPoint.current = { x, y };
    isDrawing.current = true;
  };

  const draw = (e: React.PointerEvent) => {
    if (!isDrawing.current) return;
    const ctx = ctxRef.current; if (!ctx) return;

    // Use coalesced events for 240Hz Apple Pencil sampling
    const coalesced = (e.nativeEvent as any).getCoalescedEvents?.() || [e.nativeEvent];
    for (const evt of coalesced) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const x = evt.clientX - rect.left;
      const y = evt.clientY - rect.top;

      if (lastPoint.current) {
        const lp = lastPoint.current;
        const r = drawSize / 2;
        const pressure = (evt.pressure || 0.5);
        const w = drawSize * (0.3 + pressure * 0.7);

        // Draw connecting line
        ctx.lineWidth = w;
        ctx.strokeStyle = drawColor;
        ctx.beginPath();
        ctx.moveTo(lp.x, lp.y);
        ctx.lineTo(x, y);
        ctx.stroke();

        // Draw circle at current point to fill gap (prevent thin connections at speed)
        ctx.fillStyle = drawColor;
        ctx.beginPath();
        ctx.arc(x, y, w / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      lastPoint.current = { x, y };
    }
  };

  const stopDraw = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    lastPoint.current = null;
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => onSave(canvasRef.current?.toDataURL() || ''), 300);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width / (window.devicePixelRatio||1), canvas.height / (window.devicePixelRatio||1));
    onSave('');
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-2 shrink-0 gap-2">
        <div className="flex gap-1">
          <button onClick={()=>setMode('write')} className={`text-xs px-2 py-1 rounded ${mode==='write'?'bg-[var(--th-accent-soft)] text-[var(--th-accent)]':'text-[var(--th-text-soft)]'}`}>✏️</button>
          <button onClick={()=>setMode('draw')} className={`text-xs px-2 py-1 rounded ${mode==='draw'?'bg-[var(--th-accent-soft)] text-[var(--th-accent)]':'text-[var(--th-text-soft)]'}`}>🖊️</button>
        </div>
        {mode==='draw' && (
          <div className="flex items-center gap-2">
            <input type="color" value={drawColor} onChange={e=>setDrawColor(e.target.value)} className="w-5 h-5 rounded cursor-pointer border-0" title="颜色"/>
            <input type="range" min="1" max="6" step="0.5" value={drawSize} onChange={e=>setDrawSize(parseFloat(e.target.value))} className="w-16 h-2 accent-blue-500" title="粗细"/>
            <button onClick={clearCanvas} className="text-xs px-2 py-1 bg-red-50 text-red-500 rounded hover:bg-red-100" title="清空"><Eraser className="w-3 h-3"/></button>
          </div>
        )}
      </div>
      {mode==='write' ? (
        <textarea className="flex-1 w-full p-4 border border-[var(--th-border)] rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm leading-relaxed bg-[var(--th-bg-card)]"
          value={text} onChange={e=>{setText(e.target.value);onSave(e.target.value);}}
          placeholder="在此书写草稿、翻译、思路..." />
      ) : (
        <div ref={containerRef} className="flex-1 border border-[var(--th-border)] rounded-xl bg-[var(--th-bg-card)] overflow-hidden touch-none relative select-none" style={{WebkitUserSelect:'none',WebkitTouchCallout:'none'}}>
          <canvas ref={canvasRef}
            onPointerDown={startDraw} onPointerMove={draw} onPointerUp={stopDraw} onPointerLeave={stopDraw}
            className="block"
          />
          <button onClick={() => onSave(canvasRef.current?.toDataURL() || '')} className="absolute bottom-2 right-2 text-[10px] px-2 py-1 bg-slate-800/70 text-white rounded hover:bg-slate-800">保存</button>
        </div>
      )}
    </div>
  );
}


// Clickable word wrapper for chat — double-click only (stricter)
// Custom text renderer for Markdown: makes words double-clickable while keeping formatting
function ClickableMarkdownText({ children, onWordClick }: { children?: React.ReactNode; onWordClick?: (word: string, x: number, y: number) => void }) {
  if (!onWordClick || typeof children !== 'string') return <>{children}</>;
  const parts = children.split(/\b/);
  return <>{parts.map((p, i) => {
    if (/^[a-zA-Z]{2,}$/.test(p)) {
      return <span key={i} onDoubleClick={(e) => {
        const r = (e.target as HTMLElement).getBoundingClientRect();
        onWordClick(p, r.left, r.bottom);
      }} className="cursor-pointer hover:bg-blue-200 hover:text-blue-800 rounded-sm px-[1px] transition-colors" title="双击查词">{p}</span>;
    }
    return <span key={i}>{p}</span>;
  })}</>;
}

function ClickableText({ text, onWordClick }: { text: string; onWordClick: (word: string, x: number, y: number) => void }) {
  const parts = text.split(/\b/);
  return <span>{parts.map((p, i) => {
    if (/^[a-zA-Z]{2,}$/.test(p)) {
      return <span key={i} onDoubleClick={(e) => { const r=(e.target as HTMLElement).getBoundingClientRect(); onWordClick(p, r.left, r.bottom); }} className="cursor-pointer hover:bg-blue-200 hover:text-blue-800 rounded-sm px-[1px] transition-colors" title="双击查词">{p}</span>;
    }
    return <span key={i}>{p}</span>;
  })}</span>;
}

interface ChatPanelProps {
  systemContext: string;
  autoSendPrompt: string | null;
  clearAutoSend: () => void;
  chatSessionId: string;
  onWordClick?: (word: string, x: number, y: number) => void;
  chatWordClickEnabled?: boolean;
  setChatWordClickEnabled?: (v: boolean) => void;
  wordGrammarAnalysisEnabled?: boolean;
  setWordGrammarAnalysisEnabled?: (v: boolean) => void;

}

function makeSummary(text: string): string {
  const cleaned = text.replace(/\n/g, ' ').trim();
  if (cleaned.length <= 60) return cleaned;
  return cleaned.substring(0, 55) + '...';
}

export default function ChatPanel({ systemContext, autoSendPrompt, clearAutoSend, chatSessionId, onWordClick, chatWordClickEnabled, setChatWordClickEnabled, wordGrammarAnalysisEnabled, setWordGrammarAnalysisEnabled }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [apiKey, setApiKey] = useState(localStorage.getItem('deepseek_api_key') || '');
  const [model, setModel] = useState<DeepSeekModel>((localStorage.getItem('deepseek_model') as DeepSeekModel) || 'deepseek-v4-pro');
  const [isThinkingMode, setIsThinkingMode] = useState<boolean>(localStorage.getItem('deepseek_thinking') !== 'false');
  const [isSettingsOpen, setIsSettingsOpen] = useState(!apiKey);
  const [expandedMsgIds, setExpandedMsgIds] = useState<Set<string>>(new Set());
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState(() => {
    try { return localStorage.getItem('cet_notes_'+chatSessionId) || ''; } catch { return ''; }
  });

  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef(chatSessionId);

  // Track session changes to avoid cross-contamination
  useEffect(() => {
    sessionRef.current = chatSessionId;
  }, [chatSessionId]);

  // Load Session History
  useEffect(() => {
    try {
      const key = `chat_${chatSessionId}`;
      const historyStr = localStorage.getItem(key);
      if (historyStr) {
        const parsed = JSON.parse(historyStr);
        setMessages(Array.isArray(parsed) ? parsed : []);
      } else {
        setMessages([]);
      }
    } catch (e) {
      console.error("Failed to load chat history", e);
      setMessages([]);
    }
  }, [chatSessionId]);

  // Save Session History (only save if session hasn't changed mid-render)
  useEffect(() => {
    if (messages.length > 0 && chatSessionId === sessionRef.current) {
       localStorage.setItem(`chat_${chatSessionId}`, JSON.stringify(messages));
    }
  }, [messages, chatSessionId]);

  // Auto-scroll Down
  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Save Settings
  useEffect(() => {
    if (apiKey) localStorage.setItem('deepseek_api_key', apiKey);
    localStorage.setItem('deepseek_model', model);
    localStorage.setItem('deepseek_thinking', isThinkingMode.toString());
  }, [apiKey, model, isThinkingMode]);

  // Handle auto-send commands
  useEffect(() => {
    if (autoSendPrompt && apiKey) {
      handleSend(autoSendPrompt, true);
      clearAutoSend();
    } else if (autoSendPrompt && !apiKey) {
      setIsSettingsOpen(true);
      clearAutoSend();
    }
  }, [autoSendPrompt, apiKey]);

  const toggleExpand = (id: string) => {
    setExpandedMsgIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSend = async (text: string, isAuto: boolean = false) => {
    if (!text.trim() || !apiKey) return;

    const summary = isAuto ? makeSummary(text) : undefined;
    const userMessage: ChatMessage = { id: uuidv4(), role: 'user', content: text, timestamp: Date.now(), isAuto, summary };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const formattedMessages = [
        { role: 'system', content: systemContext },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: text }
      ];

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: formattedMessages, apiKey, model, isThinking: isThinkingMode }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.details || 'Failed to fetch AI response');
      }

      setMessages((prev) => [...prev, { id: uuidv4(), role: 'assistant', content: data.content, reasoning_content: data.reasoning_content, timestamp: Date.now() }]);
    } catch (err: any) {
      setMessages((prev) => [...prev, { id: uuidv4(), role: 'assistant', content: `**Error:** ${err.message}`, timestamp: Date.now() }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = () => {
    setMessages([]);
    localStorage.removeItem(`chat_${chatSessionId}`);
  };

  // Load/save notes per session
  useEffect(() => {
    try { const saved = localStorage.getItem('cet_notes_'+chatSessionId); setNotes(saved || ''); }
    catch { setNotes(''); }
  }, [chatSessionId]);
  useEffect(() => { localStorage.setItem('cet_notes_'+chatSessionId, notes); }, [notes, chatSessionId]);

  return (
    <>
      <div className="h-16 px-6 border-b border-[var(--th-border)] bg-[var(--th-bg-card)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="bg-blue-100 p-1.5 rounded-lg text-blue-600">
            <Sparkles className="w-5 h-5" />
          </div>
          <span className="font-bold text-[var(--th-text)]">AI Tutor</span>
          <span className="ml-2 text-xs px-2 py-1 bg-[var(--th-bg-soft)] text-[var(--th-text-soft)] rounded-full border border-[var(--th-border)] font-mono">
            {model}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowNotes(!showNotes)}
            className={`text-[10px] uppercase font-bold transition-colors px-2 py-1 rounded ${showNotes ? 'bg-amber-100 text-amber-700' : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'}`}
            title="草稿笔记"
          >📝 笔记</button>
          {!showNotes && <button
            onClick={handleClearHistory}
            className="text-[10px] uppercase font-bold text-[var(--th-text-muted)] hover:text-red-500 transition-colors px-2 py-1 rounded hover:bg-red-50"
            title="清空记录"
          >清空</button>}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 text-slate-400 hover:text-blue-600 transition-colors rounded-full hover:bg-blue-50"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {showNotes ? (
        <div className="flex-1 flex flex-col p-4 bg-slate-50/50" style={{height: 'calc(100vh - 64px)'}}>
          <DrawPad saved={notes} onSave={(dataUrl) => setNotes(dataUrl)} />
        </div>
      ) : (
      <>
      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[var(--th-bg)]">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 max-w-sm mx-auto p-4 space-y-4">
            <BookOpen className="w-12 h-12 text-slate-200" />
            <p className="text-sm">点击左侧阅读界面的句子或单词旁的弹窗可获取精讲分析。也可直接在下方向 AI 提问。</p>
          </div>
        )}

        {messages.map((msg) => {
          const isCollapsed = msg.isAuto && msg.summary && !expandedMsgIds.has(msg.id);
          return (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-5 py-4 ${
              msg.role === 'user'
                ? msg.isAuto ? 'bg-[var(--th-accent-soft)] border border-[var(--th-border)] text-[var(--th-text)] rounded-br-sm'
                  : 'bg-[var(--th-accent)] text-white rounded-br-sm shadow-md'
                : 'bg-[var(--th-bg-card)] border border-[var(--th-border)] text-[var(--th-text)] rounded-bl-sm shadow-sm'
            }`}>
              {msg.role === 'assistant' ? (
                 <div className="space-y-4">
                    {msg.reasoning_content && (
                      <div className="mb-4 bg-[var(--th-bg-soft)] border border-[var(--th-border)] rounded-xl p-4 text-sm text-[var(--th-text-soft)] font-mono overflow-auto max-h-60 relative group">
                         <div className="absolute top-2 right-2 flex items-center gap-1 text-[10px] uppercase font-bold text-slate-400 bg-[var(--th-bg-card)]/80 px-2 py-0.5 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                             <Sparkles className="w-3 h-3 text-blue-500" /> Thinking
                         </div>
                         <div className="whitespace-pre-wrap leading-relaxed">{msg.reasoning_content}</div>
                      </div>
                    )}
                    <div className="markdown-body space-y-2 text-[15px] leading-relaxed break-words">
                      <Markdown components={chatWordClickEnabled && onWordClick ? {
                        text: ({ children }) => <ClickableMarkdownText onWordClick={onWordClick}>{children}</ClickableMarkdownText>
                      } : {}}>{msg.content}</Markdown>
                    </div>
                 </div>
              ) : isCollapsed ? (
                <button
                  onClick={() => toggleExpand(msg.id)}
                  className="flex items-center gap-2 text-xs w-full text-left group/expand"
                >
                  <span className="text-blue-400 group-hover/expand:text-blue-600 transition-colors">📨</span>
                  <span className="text-[var(--th-text-soft)] truncate flex-1">{msg.summary}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-[10px] text-blue-500 font-bold shrink-0">展开</span>
                </button>
              ) : (
                <div>
                  {msg.isAuto && msg.summary && (
                    <button
                      onClick={() => toggleExpand(msg.id)}
                      className="flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700 mb-2 font-bold"
                    >
                      <ChevronDown className="w-3 h-3" /> 收起
                    </button>
                  )}
                  <div className="whitespace-pre-wrap leading-relaxed text-[15px] break-words">
                    {chatWordClickEnabled && onWordClick
                      ? <ClickableText text={msg.content} onWordClick={onWordClick} />
                      : msg.content}
                  </div>
                </div>
              )}
            </div>
          </div>
        )})}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-[var(--th-bg-card)] border border-[var(--th-border)] rounded-2xl rounded-bl-sm px-6 py-4 shadow-sm text-[var(--th-text-muted)] flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              <span className="text-sm">DeepSeek is thinking...</span>
            </div>
          </div>
        )}
        <div ref={endOfMessagesRef} />
      </div>

      <div className="p-4 bg-[var(--th-bg-card)] border-t border-[var(--th-border)] shrink-0">
        <div className="max-w-4xl mx-auto mb-3 flex gap-2 overflow-x-auto scrollbar-hide px-1">
          <button
            onClick={() => handleSend("请根据我刚才的提问历史，评估我的英语语法水平，并为我出两道针对性的练习题。")}
            className="whitespace-nowrap px-3 py-1.5 bg-[var(--th-bg-soft)] text-[var(--th-text-soft)] hover:bg-[var(--th-hover)] rounded-lg text-xs font-bold transition-colors"
          >
            🎯 针对性出题测试
          </button>
          <button
            onClick={() => handleSend("帮我总结一下英语阅读中常见的长难句结构。")}
            className="whitespace-nowrap px-3 py-1.5 bg-[var(--th-bg-soft)] text-[var(--th-text-soft)] hover:bg-[var(--th-hover)] rounded-lg text-xs font-bold transition-colors"
          >
            📚 长难句总结
          </button>
          <button
            onClick={() => handleSend("列出这篇文本里出现的高频核心词汇及它们的用法。")}
            className="whitespace-nowrap px-3 py-1.5 bg-[var(--th-bg-soft)] text-[var(--th-text-soft)] hover:bg-[var(--th-hover)] rounded-lg text-xs font-bold transition-colors"
          >
            🔥 提取本文高频词汇
          </button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(input); }}
          className="relative max-w-4xl mx-auto flex items-end gap-2"
        >
          <div className="relative flex-1">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="有任何问题都可以问我..."
              className="w-full bg-slate-100 border-transparent focus:bg-[var(--th-bg-card)] dark:focus:bg-slate-700 focus:border-blue-500 rounded-xl px-4 py-3 pr-12 resize-none h-[52px] min-h-[52px] max-h-32 text-sm transition-all focus:ring-4 focus:ring-blue-500/10 placeholder:text-slate-400 scrollbar-hide flex items-center"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(input);
                }
              }}
            />
          </div>
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="w-[52px] h-[52px] bg-blue-600 text-white rounded-xl flex items-center justify-center shrink-0 hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <Send className="w-5 h-5 ml-1" />
          </button>
        </form>
      </div>
      </>
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        apiKey={apiKey}
        setApiKey={setApiKey}
        model={model}
        setModel={setModel}
        isThinkingMode={isThinkingMode}
        setIsThinkingMode={setIsThinkingMode}
        chatWordClick={chatWordClickEnabled}
        setChatWordClick={(v) => { localStorage.setItem('chat_word_click', String(v)); if(setChatWordClickEnabled) setChatWordClickEnabled(v); }}
        wordGrammarAnalysis={wordGrammarAnalysisEnabled}
        setWordGrammarAnalysis={(v) => { localStorage.setItem('word_grammar_analysis', String(v)); if(setWordGrammarAnalysisEnabled) setWordGrammarAnalysisEnabled(v); }}
      />
    </>
  );
}
