import { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Send, Settings, Sparkles, Loader2, BookOpen, ChevronDown, ChevronRight } from 'lucide-react';
import { ChatMessage, DeepSeekModel } from '../types';
import Markdown from 'react-markdown';
import SettingsModal from './SettingsModal';

// Clickable word wrapper for chat — double-click only (stricter)
function ClickableText({ text, onWordClick }: { text: string; onWordClick: (word: string, x: number, y: number) => void }) {
  const parts = text.split(/\b/);
  let lastClick = useRef(0);
  const handleDoubleClick = useCallback((word: string, e: React.MouseEvent) => {
    const now = Date.now();
    if (now - lastClick.current < 400) {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      onWordClick(word, rect.left, rect.bottom);
    }
    lastClick.current = now;
  }, [onWordClick]);

  return <span>{parts.map((p, i) => {
    if (/^[a-zA-Z]{2,}$/.test(p)) {
      return <span key={i} onClick={(e) => handleDoubleClick(p, e)} className="cursor-pointer hover:bg-blue-200 hover:text-blue-800 rounded-sm px-[1px] transition-colors" title="双击查词">{p}</span>;
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
}

function makeSummary(text: string): string {
  const cleaned = text.replace(/\n/g, ' ').trim();
  if (cleaned.length <= 60) return cleaned;
  return cleaned.substring(0, 55) + '...';
}

export default function ChatPanel({ systemContext, autoSendPrompt, clearAutoSend, chatSessionId, onWordClick, chatWordClickEnabled }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [apiKey, setApiKey] = useState(localStorage.getItem('deepseek_api_key') || '');
  const [model, setModel] = useState<DeepSeekModel>((localStorage.getItem('deepseek_model') as DeepSeekModel) || 'deepseek-v4-pro');
  const [isThinkingMode, setIsThinkingMode] = useState<boolean>(localStorage.getItem('deepseek_thinking') !== 'false');
  const [isSettingsOpen, setIsSettingsOpen] = useState(!apiKey);
  const [expandedMsgIds, setExpandedMsgIds] = useState<Set<string>>(new Set());

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
    localStorage.removeItem(`chat_session_${chatSessionId}`);
  };

  return (
    <>
      <div className="h-16 px-6 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="bg-blue-100 p-1.5 rounded-lg text-blue-600">
            <Sparkles className="w-5 h-5" />
          </div>
          <span className="font-bold text-slate-800">AI Tutor</span>
          <span className="ml-2 text-xs px-2 py-1 bg-slate-100 text-slate-500 rounded-full border border-slate-200 font-mono">
            {model}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleClearHistory}
            className="text-[10px] uppercase font-bold text-slate-400 hover:text-red-500 transition-colors px-2 py-1 rounded hover:bg-red-50"
            title="清空记录"
          >
            清空
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 text-slate-400 hover:text-blue-600 transition-colors rounded-full hover:bg-blue-50"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
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
                ? msg.isAuto ? 'bg-blue-50 border border-blue-200 text-slate-700 rounded-br-sm'
                  : 'bg-blue-600 text-white rounded-br-sm shadow-md'
                : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-sm'
            }`}>
              {msg.role === 'assistant' ? (
                 <div className="space-y-4">
                    {msg.reasoning_content && (
                      <div className="mb-4 bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-600 font-mono overflow-auto max-h-60 relative group">
                         <div className="absolute top-2 right-2 flex items-center gap-1 text-[10px] uppercase font-bold text-slate-400 bg-white/80 px-2 py-0.5 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                             <Sparkles className="w-3 h-3 text-blue-500" /> Thinking
                         </div>
                         <div className="whitespace-pre-wrap leading-relaxed">{msg.reasoning_content}</div>
                      </div>
                    )}
                    <div className="markdown-body space-y-2 text-[15px] leading-relaxed break-words">
                      <Markdown>{msg.content}</Markdown>
                    </div>
                 </div>
              ) : isCollapsed ? (
                <button
                  onClick={() => toggleExpand(msg.id)}
                  className="flex items-center gap-2 text-xs w-full text-left group/expand"
                >
                  <span className="text-blue-400 group-hover/expand:text-blue-600 transition-colors">📨</span>
                  <span className="text-slate-500 truncate flex-1">{msg.summary}</span>
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
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-6 py-4 shadow-sm text-slate-400 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              <span className="text-sm">DeepSeek is thinking...</span>
            </div>
          </div>
        )}
        <div ref={endOfMessagesRef} />
      </div>

      <div className="p-4 bg-white border-t border-slate-200 shrink-0">
        <div className="max-w-4xl mx-auto mb-3 flex gap-2 overflow-x-auto scrollbar-hide px-1">
          <button
            onClick={() => handleSend("请根据我刚才的提问历史，评估我的英语语法水平，并为我出两道针对性的四六级练习题。")}
            className="whitespace-nowrap px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-bold transition-colors"
          >
            🎯 针对性出题测试
          </button>
          <button
            onClick={() => handleSend("帮我总结一下四六级阅读中常见的长难句结构。")}
            className="whitespace-nowrap px-3 py-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg text-xs font-bold transition-colors"
          >
            📚 长难句总结
          </button>
          <button
            onClick={() => handleSend("列出这篇文本里出现的高频四六级词汇及它们的用法。")}
            className="whitespace-nowrap px-3 py-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg text-xs font-bold transition-colors"
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
              className="w-full bg-slate-100 border-transparent focus:bg-white focus:border-blue-500 rounded-xl px-4 py-3 pr-12 resize-none h-[52px] min-h-[52px] max-h-32 text-sm transition-all focus:ring-4 focus:ring-blue-500/10 placeholder:text-slate-400 scrollbar-hide flex items-center"
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
        setChatWordClick={(v) => { localStorage.setItem('chat_word_click', String(v)); }}
      />
    </>
  );
}
