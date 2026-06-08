import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { examPapers as builtInExams } from './data/exams';
import { Passage, ExamPaper, Bookmark, VocabList, WordPopupData, PainRecord, defaultPainRecord, QuestionType, WordLookupResult, PhraseList, PhraseHighlight } from './types';
import AppSidebar from './components/AppSidebar';
import MainViewer from './components/MainViewer';
import ChatPanel from './components/ChatPanel';
import VocabViewer from './components/VocabViewer';
import GlobalProgressIndicator from './components/GlobalProgressIndicator';
import WordPopup from './components/WordPopup';

export default function App() {
  const [exams, setExams] = useState<ExamPaper[]>(builtInExams);
  const [selectedExamId, setSelectedExamId] = useState<string>(exams.length > 0 ? exams[0].id : '');
  const [selectedPassageId, setSelectedPassageId] = useState<string>(exams.length > 0 && exams[0].passages?.length > 0 ? exams[0].passages[0].id : '');

  // Bookmarks & Vocab
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [vocabLists, setVocabLists] = useState<VocabList[]>([]);
  const [selectedVocabId, setSelectedVocabId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'exams' | 'bookmarks' | 'vocab'>('exams');
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [fontSize, setFontSize] = useState(parseInt(localStorage.getItem('cet_font_size') || '16'));
  const [wordCache, setWordCache] = useState<Map<string, WordLookupResult>>(new Map());
  const [phraseMode, setPhraseMode] = useState(false);
  const [phraseHighlights, setPhraseHighlights] = useState<any[]>([]);
  const [phraseLists, setPhraseLists] = useState<PhraseList[]>([]);
  const [chatWordClick, setChatWordClick] = useState(localStorage.getItem('chat_word_click') !== 'false');
  const [scanningPhrases, setScanningPhrases] = useState(false);

  // Word Popup
  const [wordPopup, setWordPopup] = useState<WordPopupData | null>(null);

  // Chat
  const [systemContext, setSystemContext] = useState<string>('你好！作为一个英语导师进行辅助。你可以随时提问。');
  const [autoSendPrompt, setAutoSendPrompt] = useState<string | null>(null);

  // Pain points tracking
  const [painRecord, setPainRecord] = useState<PainRecord>(defaultPainRecord());
  const [completedQuestions, setCompletedQuestions] = useState<Set<string>>(new Set());

  const apiKey = localStorage.getItem('deepseek_api_key') || '';

  const readSavedPhraseScan = (passageId: string) => {
    try {
      const saved = localStorage.getItem('cet6_phrase_scan_'+passageId);
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.every((p) => typeof p.startIdx === 'number' && typeof p.endIdx === 'number' && typeof p.category === 'string')) return parsed;
      localStorage.removeItem('cet6_phrase_scan_'+passageId);
      return null;
    } catch {
      localStorage.removeItem('cet6_phrase_scan_'+passageId);
      return null;
    }
  };

  // ── Load from localStorage ──
  useEffect(() => {
    try {
      const storedExams = localStorage.getItem('custom_exams');
      if (storedExams) {
        const parsed = JSON.parse(storedExams);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const loadedExams = [...builtInExams, ...parsed];
          setExams(loadedExams);
          if (loadedExams.length > 0 && selectedExamId === '') {
            setSelectedExamId(loadedExams[0].id);
            if (loadedExams[0].passages?.length > 0) {
              setSelectedPassageId(loadedExams[0].passages[0].id);
            }
          }
        }
      }
      const storedBookmarks = localStorage.getItem('cet6_bookmarks');
      if (storedBookmarks) setBookmarks(JSON.parse(storedBookmarks));
      const storedVocab = localStorage.getItem('cet6_vocab');
      if (storedVocab) {
        const parsed = JSON.parse(storedVocab);
        setVocabLists(parsed);
        if (parsed.length > 0) setSelectedVocabId(parsed[0].id);
      }
      const storedPain = localStorage.getItem('cet6_pain_points');
      if (storedPain) setPainRecord(JSON.parse(storedPain));
      const storedPhrases = localStorage.getItem('cet6_phrases');
      if (storedPhrases) setPhraseLists(JSON.parse(storedPhrases));
      const storedCompleted = localStorage.getItem('cet6_completed');
      if (storedCompleted) setCompletedQuestions(new Set(JSON.parse(storedCompleted)));
    } catch (e) {
      console.error('Failed to load local storage', e);
    }
  }, []);

  // ── Persist ──
  useEffect(() => { localStorage.setItem('cet6_bookmarks', JSON.stringify(bookmarks)); }, [bookmarks]);
  useEffect(() => { localStorage.setItem('cet6_vocab', JSON.stringify(vocabLists)); }, [vocabLists]);
  useEffect(() => { localStorage.setItem('cet6_pain_points', JSON.stringify(painRecord)); }, [painRecord]);
  useEffect(() => { localStorage.setItem('cet6_completed', JSON.stringify([...completedQuestions])); }, [completedQuestions]);
  useEffect(() => { localStorage.setItem('cet6_phrases', JSON.stringify(phraseLists)); }, [phraseLists]);

  // ── Derived state ──
  const selectedExam = exams.find((e) => e.id === selectedExamId) || (exams.length > 0 ? exams[0] : undefined);
  const selectedPassage = selectedExam?.passages?.find((p) => p.id === selectedPassageId) || (selectedExam?.passages?.length > 0 ? selectedExam.passages[0] : undefined);
  const selectedVocab = vocabLists.find((v) => v.id === selectedVocabId);

  // ── Navigation ──
  const handleSelectPassage = (examId: string, passageId: string) => {
    setSelectedExamId(examId);
    setSelectedPassageId(passageId);
    // Restore per-passage mode
    const savedMode = localStorage.getItem('cet6_passage_mode_'+passageId);
    const isPhrase = savedMode === 'phrase';
    setPhraseMode(isPhrase);
    if (isPhrase) {
      setPhraseHighlights(readSavedPhraseScan(passageId) || []);
    } else {
      setPhraseHighlights([]);
    }
  };

  const handleSelectVocab = (listId: string) => setSelectedVocabId(listId);

  // ── Upload ──
  const handleUploadExam = (newExam: ExamPaper) => {
    const updatedUserExams = [...(exams.filter((e) => !builtInExams.find((b) => b.id === e.id))), newExam];
    localStorage.setItem('custom_exams', JSON.stringify(updatedUserExams));
    setExams([...builtInExams, ...updatedUserExams]);
    setSelectedExamId(newExam.id);
    if (newExam.passages.length > 0) setSelectedPassageId(newExam.passages[0].id);
    setActiveTab('exams');
  };

  const handleDeleteExam = (examId: string) => {
    const customExams = exams.filter((e) => e.id.startsWith('custom-') && e.id !== examId);
    localStorage.setItem('custom_exams', JSON.stringify(customExams));
    const remaining = [...builtInExams, ...customExams];
    setExams(remaining);
    if (selectedExamId === examId && remaining.length > 0) {
      setSelectedExamId(remaining[0].id);
      setSelectedPassageId(remaining[0].passages?.[0]?.id || '');
    }
  };

  const handleUploadVocab = (newList: VocabList) => {
    setVocabLists((prev) => [newList, ...prev]);
    setSelectedVocabId(newList.id);
    setActiveTab('vocab');
  };

  const handleDeleteVocab = (id: string) => {
    setVocabLists((prev) => {
      const next = prev.filter((v) => v.id !== id);
      if (selectedVocabId === id && next.length > 0) setSelectedVocabId(next[0].id);
      return next;
    });
  };

  // ── Bookmarks ──
  const handleAddBookmark = (type: 'sentence' | 'word' | 'question', content: string, context?: string) => {
    const newBookmark: Bookmark = { id: uuidv4(), type, content, context, timestamp: Date.now() };
    setBookmarks((prev) => [newBookmark, ...prev.filter((b) => b.content !== content)]);
  };

  const handleDeleteBookmark = (id: string) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  };

  // ── Add word to vocab (from popup) ──
  const handleAddToVocab = (word: string, definition: string, sentence: string, richData?: WordLookupResult) => {
    // Check if already exists
    const exists = vocabLists.some((l) => l.words.some((w) => w.word.toLowerCase() === word.toLowerCase()));
    if (exists) return;

    // Add to first vocab list, or create a new one
    if (vocabLists.length > 0) {
      setVocabLists((prev) => {
        const updated = [...prev];
        updated[0] = {
          ...updated[0],
          words: [
            ...updated[0].words,
            { id: uuidv4(), word, definition, context: sentence, phoneticUK: richData?.phoneticUK, phoneticUS: richData?.phoneticUS, definitions: richData?.definitions, examples: richData?.examples?.map(e => typeof e === 'string' ? { en: e.split(' —— ')[0] || e, zh: e.split(' —— ')[1] || '' } : e), synonyms: richData?.synonyms, phrases: richData?.phrases, mnemonic: richData?.mnemonic },
          ],
        };
        return updated;
      });
    } else {
      const newList: VocabList = {
        id: `vocab-${uuidv4()}`,
        title: '我的词汇本',
        createdAt: Date.now(),
        words: [{ id: uuidv4(), word, definition, context: sentence, phoneticUK: richData?.phoneticUK, phoneticUS: richData?.phoneticUS, definitions: richData?.definitions, examples: richData?.examples?.map(e => typeof e === 'string' ? { en: e.split(' —— ')[0] || e, zh: e.split(' —— ')[1] || '' } : e), synonyms: richData?.synonyms, phrases: richData?.phrases, mnemonic: richData?.mnemonic }],
      };
      setVocabLists([newList]);
      setSelectedVocabId(newList.id);
    }
  };

  // ── Explain: Sentence ──
  const explainSentence = useCallback((sentence: string, customContext?: string) => {
    const ctx = customContext || selectedPassage?.paragraphs.map((p) => p.sentences.join(' ')).join('\n') || '';
    setSystemContext(`你是英语四六级精读辅导老师。请用中文详细讲解下面的句子。内容包括：核心语法结构分析、高频四六级词汇解释、生僻词提取。上下文如下：\n${ctx}`);
    setAutoSendPrompt(`请详细讲解这句话的语法结构、高频考点词和生僻词：\n"${sentence}"`);
  }, [selectedPassage]);

  // ── Explain: Word (deep ask from popup — sends to chat) ──
  const handleDeepAskWord = useCallback((word: string, sentence: string) => {
    // Track pain point
    setPainRecord((prev) => {
      const updated = { ...prev, wordLookups: { ...prev.wordLookups } };
      updated.wordLookups[word] = (updated.wordLookups[word] || 0) + 1;
      return updated;
    });

    setSystemContext(`你是英语四六级词汇专家。用户将给你一个单词。你需要提供详细解析：1. 音标与中文意思。2. 同根派生词。3. 四六级常考短语搭配。4. 历年试卷出现权重。5. 结合例句翻译和用法讲解。`);
    if (sentence) {
      setAutoSendPrompt(`请详细解析单词 "${word}"。结合它在此句中的用法给予中文讲解：\n"${sentence}"`);
    } else {
      setAutoSendPrompt(`请给出单词 "${word}" 的完整四六级解析：包括派生词、短语搭配、词汇变形、历年考点，并给出2个四六级难度例句。`);
    }
  }, []);

  // ── Explain: Question ──
  const explainQuestion = useCallback((questionContent: string, options: string, answer: string, explanation: string) => {
    const ctx = selectedPassage?.paragraphs.map((p) => p.sentences.join(' ')).join('\n') || '';
    const section = selectedPassage?.section || 'careful-reading';

    // Track pain point
    setPainRecord((prev) => {
      const updated = { ...prev, questionsByType: { ...prev.questionsByType } };
      updated.questionsByType[section as QuestionType] = (updated.questionsByType[section as QuestionType] || 0) + 1;
      if (answer) updated.askedQuestions = [...prev.askedQuestions, questionContent.substring(0, 80)];
      return updated;
    });

    // Build context-aware prompt based on section type
    let sectionPrompt = '';
    switch (section) {
      case 'banked-cloze':
        sectionPrompt = '这是一道选词填空题。请结合全文语境分析空白处应选哪个词，并解释每个干扰项的排除理由。';
        break;
      case 'long-reading-match':
        sectionPrompt = '这是一道长篇阅读匹配题。请分析该陈述的关键信息，定位到对应段落，并说明匹配依据。';
        break;
      case 'careful-reading':
        sectionPrompt = '这是一道仔细阅读选择题。请定位原文对应句，分析每个选项的对错原因，给出解题技巧。';
        break;
      case 'translation':
        sectionPrompt = '这是一道翻译题。请逐句分析翻译要点，提供关键表达和语法结构建议。';
        break;
      default:
        sectionPrompt = '请详细解析这道题的正确答案及解题思路。';
    }

    setSystemContext(`你是英语四六级提分专家。${sectionPrompt}\n全文内容：\n${ctx}`);
    const prompt = answer
      ? `请结合全文，详细讲解这道题的正确答案及解题思路（原答案为 ${answer}，提示：${explanation}）：\n题目：${questionContent}\n选项：\n${options}`
      : `请结合全文，解答这道题并给出详细解析：\n题目：${questionContent}\n选项：\n${options}`;
    setAutoSendPrompt(prompt);

    // Mark as completed
    if (selectedPassage) {
      const q = selectedPassage.questions.find((q) => q.content === questionContent);
      if (q) setCompletedQuestions((prev) => new Set(prev).add(q.id));
    }
  }, [selectedPassage]);

  // ── Word click: show popup ──
  const handleWordClick = useCallback((word: string, sentence: string, x: number, y: number) => {
    // Track lookup
    setPainRecord((prev) => {
      const updated = { ...prev, wordLookups: { ...prev.wordLookups } };
      updated.wordLookups[word] = (updated.wordLookups[word] || 0) + 1;
      return updated;
    });
    setWordPopup({ word, sentence, x, y });
  }, []);

  // ── Review bookmark ──
  const handleReviewBookmark = (bm: Bookmark) => {
    if (bm.type === 'sentence') {
      explainSentence(bm.content, bm.context || '');
    } else if (bm.type === 'word') {
      handleDeepAskWord(bm.content, bm.context || '');
    } else {
      setSystemContext(`你需要扮演英语四六级专家。请为我详细解析这道阅读理解题。上下文：${bm.context || ''}`);
      setAutoSendPrompt(`请带我复习这道题，并给出详细解析：\n${bm.content}`);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {sidebarVisible && (
        <AppSidebar
          exams={exams}
          selectedExamId={selectedExamId}
          selectedPassageId={selectedPassageId}
          onSelect={handleSelectPassage}
          onUpload={handleUploadExam}
          onDeleteExam={handleDeleteExam}
          bookmarks={bookmarks}
          vocabLists={vocabLists}
          selectedVocabId={selectedVocabId}
          onSelectVocab={handleSelectVocab}
          onUploadVocab={handleUploadVocab}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onReviewBookmark={handleReviewBookmark}
          onDeleteBookmark={handleDeleteBookmark}
          onDeleteVocab={handleDeleteVocab}
          completedQuestions={completedQuestions}
        />
      )}
      <main className="flex-1 flex overflow-hidden">
        {/* Left: Reading Area */}
        <div className={`${sidebarVisible ? 'w-1/2' : 'flex-[3]'} h-full overflow-y-auto border-r border-slate-200 bg-white transition-all`} style={{fontSize: fontSize+'px'}}>
          {/* Inline toolbar — blends with reading header */}
          <div className="sticky top-0 z-40 flex items-center gap-3 px-4 py-2 bg-white/90 backdrop-blur border-b border-slate-100">
            <button
              onClick={() => setSidebarVisible(!sidebarVisible)}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
              title={sidebarVisible ? '隐藏侧边栏' : '显示侧边栏'}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
            </button>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">字号</span>
            <input
              type="range" min="12" max="24" step="1" value={fontSize}
              onChange={(e) => { const v=parseInt(e.target.value); setFontSize(v); localStorage.setItem('cet_font_size', String(v)); }}
              className="w-20 h-1 accent-blue-500"
            />
            <span className="text-[10px] text-slate-400 w-8">{fontSize}px</span>
            <span className="text-slate-300">|</span>
            <button
              onClick={() => {
                const next = !phraseMode;
                setPhraseMode(next);
                if (selectedPassage) localStorage.setItem('cet6_passage_mode_'+selectedPassage.id, next?'phrase':'word');
                if (next && selectedPassage) {
                  const saved = readSavedPhraseScan(selectedPassage.id);
                  if (saved) { setPhraseHighlights(saved); return; }
                  setScanningPhrases(true);
                  const txt = selectedPassage.paragraphs.map(p=>p.sentences.join(' ')).join(' ');
                  if (apiKey) fetch('/api/scan-phrases',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:txt,apiKey})})
                    .then(r=>r.json()).then(d=>{
                      if(d.phrases){ setPhraseHighlights(d.phrases); localStorage.setItem('cet6_phrase_scan_'+selectedPassage.id,JSON.stringify(d.phrases)); }
                    }).catch(()=>{}).finally(()=>setScanningPhrases(false));
                  else setScanningPhrases(false);
                } else { setPhraseHighlights([]); }
              }}
              className={`px-2 py-1 rounded text-[10px] font-bold transition-colors flex items-center gap-1 ${phraseMode ? 'bg-yellow-200 text-yellow-800' : 'text-slate-400 hover:text-slate-600'}`}
              title="切换短语/单词模式"
            >{scanningPhrases ? <span className="inline-block w-3 h-3 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></span> : null}{phraseMode ? '✏️ 短语' : '🔤 单词'}</button>
            {phraseMode && (
              <button onClick={() => {
                if (!selectedPassage || !apiKey) return;
                setScanningPhrases(true); setPhraseHighlights([]);
                const txt = selectedPassage.paragraphs.map(p=>p.sentences.join(' ')).join(' ');
                fetch('/api/scan-phrases',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:txt,apiKey})})
                  .then(r=>r.json()).then(d=>{
                    if(d.phrases){ setPhraseHighlights(d.phrases); localStorage.setItem('cet6_phrase_scan_'+selectedPassage.id,JSON.stringify(d.phrases)); }
                  }).catch(()=>{}).finally(()=>setScanningPhrases(false));
              }} className="px-1.5 py-1 rounded text-[10px] text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                title="重新扫描短语">🔄</button>
            )}
          </div>
          {activeTab === 'exams' && selectedPassage ? (
            <MainViewer
              passage={selectedPassage}
              onSentenceClick={explainSentence}
              onQuestionClick={explainQuestion}
              onWordClick={handleWordClick}
              phraseMode={phraseMode}
              phraseHighlights={phraseHighlights}
              onScanParagraph={(paraText, cb) => {
                if (!apiKey) return;
                fetch('/api/scan-phrases', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:paraText,apiKey})})
                  .then(r=>r.json()).then(d=>{
                    if(d.phrases){ setPhraseHighlights(prev=>[...prev,...d.phrases]); cb(d.phrases); }
                  }).catch(()=>{});
              }}
              onBookmark={handleAddBookmark}
            />
          ) : activeTab === 'vocab' && selectedVocab ? (
            <VocabViewer
              vocabList={selectedVocab}
              onExplainWord={(word) => handleDeepAskWord(word, '')}
              onWordClick={handleWordClick}
              onBookmark={handleAddBookmark}
            />
          ) : activeTab === 'bookmarks' ? (
            <div className="p-8">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">我的收藏夹</h2>
              <p className="text-slate-500 mb-8">点击收藏的书签可以随时向 AI 导师发起复习请求，加强记忆。</p>
              {bookmarks.length === 0 && <p className="text-slate-400 italic">空空如也。在阅读界面内标记您认为重要的内容吧！</p>}
              <div className="space-y-4">
                {bookmarks.map((bm) => (
                  <div key={bm.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold px-2 py-1 bg-purple-100 text-purple-700 rounded uppercase">
                        {bm.type === 'sentence' ? '句子' : bm.type === 'word' ? '词汇' : '往期真题'}
                      </span>
                      <button onClick={() => handleDeleteBookmark(bm.id)} className="text-red-400 hover:text-red-600 text-sm">删除</button>
                    </div>
                    <p className="font-medium text-slate-800 mb-4">{bm.content}</p>
                    <button
                      onClick={() => handleReviewBookmark(bm)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-sm transition-colors"
                    >
                      让 AI 帮我复习
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400">
              请选择文章或导入题库。
            </div>
          )}
        </div>
        {/* Right: AI Chat Panel */}
        <div className={`${sidebarVisible ? 'w-1/2' : 'w-[40%]'} h-full bg-slate-50 flex flex-col relative transition-all`}>
          <ChatPanel
            systemContext={systemContext}
            autoSendPrompt={autoSendPrompt}
            clearAutoSend={() => setAutoSendPrompt(null)}
            chatSessionId={
              activeTab === 'exams' ? `${selectedExamId}_${selectedPassageId}`
              : activeTab === 'vocab' ? `vocab_${selectedVocabId}`
              : 'bookmarks_session'
            }
            onWordClick={chatWordClick ? (word, x, y) => setWordPopup({ word, sentence: '', x, y }) : undefined}
            chatWordClickEnabled={chatWordClick}
            setChatWordClickEnabled={setChatWordClick}
          />
        </div>
      </main>
      <GlobalProgressIndicator />

      {/* Word Popup */}
      {wordPopup && (
        <WordPopup
          word={wordPopup.word}
          sentence={wordPopup.sentence}
          x={wordPopup.x}
          y={wordPopup.y}
          vocabLists={vocabLists}
          apiKey={apiKey}
          wordCache={wordCache}
          onCacheUpdate={(w,d) => { setWordCache(prev => { const m = new Map(prev); m.set(w.toLowerCase(), d); return m; }); }}
          onClose={() => setWordPopup(null)}
          onAddToVocab={handleAddToVocab}
          onDeepAsk={handleDeepAskWord}
        />
      )}
    </div>
  );
}
