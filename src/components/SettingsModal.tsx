import { useState, useEffect } from 'react';
import { DeepSeekModel } from '../types';
import { Settings, X, KeySquare } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  model: DeepSeekModel;
  setModel: (model: DeepSeekModel) => void;
  isThinkingMode: boolean;
  setIsThinkingMode: (val: boolean) => void;
  chatWordClick?: boolean;
  setChatWordClick?: (val: boolean) => void;
  wordGrammarAnalysis?: boolean;
  setWordGrammarAnalysis?: (val: boolean) => void;
}

export default function SettingsModal({ isOpen, onClose, apiKey, setApiKey, model, setModel, isThinkingMode, setIsThinkingMode, chatWordClick, setChatWordClick, wordGrammarAnalysis, setWordGrammarAnalysis }: SettingsModalProps) {
  const [localKey, setLocalKey] = useState(apiKey);
  
  useEffect(() => {
    setLocalKey(apiKey);
  }, [apiKey]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white w-[400px] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-2 text-slate-800 font-bold">
            <Settings className="w-5 h-5 text-blue-500" />
            AI 模型设置
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <KeySquare className="w-4 h-4" />
              DeepSeek API Key
            </label>
            <input 
              type="password"
              value={localKey}
              onChange={(e) => setLocalKey(e.target.value)}
              placeholder="sk-..."
              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
            <p className="text-[10px] text-slate-400">密钥仅存在您的本地浏览器中通过服务器转发请求，不作其他记录。</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">请选择模型</label>
            <select 
              value={model}
              onChange={(e) => setModel(e.target.value as DeepSeekModel)}
              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="deepseek-v4-flash">DeepSeek V4 Flash</option>
              <option value="deepseek-v4-pro">DeepSeek V4 Pro</option>
            </select>
          </div>

          <div className="space-y-2 flex items-center gap-2">
            <input 
              type="checkbox" 
              id="thinkingCheckbox"
              checked={isThinkingMode}
              onChange={(e) => setIsThinkingMode(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="thinkingCheckbox" className="text-sm font-bold text-slate-700 cursor-pointer">开启思考模式</label>
          </div>

          {setChatWordClick && (
            <div className="space-y-2 flex items-center gap-2">
              <input type="checkbox" id="chatWordCb" checked={chatWordClick}
                onChange={(e) => { setChatWordClick(e.target.checked); localStorage.setItem('chat_word_click', String(e.target.checked)); }}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500" />
              <label htmlFor="chatWordCb" className="text-sm font-bold text-slate-700 cursor-pointer">聊天框双击查词</label>
            </div>
          )}

          {setWordGrammarAnalysis && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="wordGrammarCb" checked={wordGrammarAnalysis}
                  onChange={(e) => { setWordGrammarAnalysis(e.target.checked); localStorage.setItem('word_grammar_analysis', String(e.target.checked)); }}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500" />
                <label htmlFor="wordGrammarCb" className="text-sm font-bold text-slate-700 cursor-pointer">单词弹窗显示词形语法解析</label>
              </div>
              <p className="text-[10px] text-slate-400 ml-6">根据当前句子分析为什么使用这个词形，不会保存进词汇本。</p>
            </div>
          )}

          <button
            onClick={() => {
              setApiKey(localKey);
              onClose();
            }}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-sm transition-colors shadow-sm"
          >
            保存设置
          </button>
        </div>
      </div>
    </div>
  );
}
