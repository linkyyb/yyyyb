import { useState } from 'react';
import { ExamPaper, Bookmark, VocabList, SectionLabels, SectionIcons, ExamTypeLabels, ExamTypeIcons } from '../types';
import { Library, Bookmark as BookmarkIcon, Plus, X, Search, FileText, CheckCircle, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import UploadExamModal from './UploadExamModal';
import UploadVocabModal from './UploadVocabModal';

interface AppSidebarProps {
  exams: ExamPaper[];
  selectedExamId: string;
  selectedPassageId: string;
  onSelect: (examId: string, passageId: string) => void;
  onUpload: (exam: ExamPaper) => void;
  onDeleteExam: (examId: string) => void;
  bookmarks: Bookmark[];
  vocabLists: VocabList[];
  selectedVocabId: string;
  onSelectVocab: (listId: string) => void;
  onUploadVocab: (list: VocabList) => void;
  activeTab: 'exams' | 'bookmarks' | 'vocab';
  setActiveTab: (tab: 'exams' | 'bookmarks' | 'vocab') => void;
  onReviewBookmark: (bm: Bookmark) => void;
  onDeleteBookmark: (id: string) => void;
  onDeleteVocab: (id: string) => void;
  completedQuestions?: Set<string>;

}

const isCustomExam = (id: string) => id.startsWith('custom-');

export default function AppSidebar({
  exams, selectedExamId, selectedPassageId, onSelect, onUpload, onDeleteExam,
  bookmarks, vocabLists, selectedVocabId, onSelectVocab, onUploadVocab,
  activeTab, setActiveTab, onReviewBookmark, onDeleteBookmark, onDeleteVocab,
  completedQuestions,
}: AppSidebarProps) {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isVocabModalOpen, setIsVocabModalOpen] = useState(false);
  const [collapsedExams, setCollapsedExams] = useState<Set<string>>(new Set());
  const apiKey = localStorage.getItem('deepseek_api_key') || '';

  const toggleCollapse = (examId: string) => {
    setCollapsedExams(prev => {
      const next = new Set(prev);
      next.has(examId) ? next.delete(examId) : next.add(examId);
      return next;
    });
  };

  const groupPassagesBySection = (passages: ExamPaper['passages']) => {
    const grouped: Record<string, typeof passages> = {};
    for (const p of passages) {
      const key = p.section || 'unknown';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(p);
    }
    return grouped;
  };

  return (
    <div className="w-[300px] bg-[var(--th-bg-card)] border-r border-slate-200 dark:border-slate-700 flex flex-col h-full shadow-sm shrink-0">
      <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-sm flex items-center justify-center shrink-0">
            <div className="w-4 h-4 border-2 border-white rotate-45"></div>
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight text-[var(--th-text)] tracking-tight">四六级精读导师</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-widest">基于 DeepSeek AI</p>
          </div>
        </div>
      </div>

      <div className="flex bg-[var(--th-bg-soft)] p-2 gap-1 border-b border-slate-100 dark:border-slate-600 shrink-0">
        <button onClick={() => setActiveTab('exams')} className={`flex-1 py-1.5 text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition-colors ${activeTab === 'exams' ? 'bg-[var(--th-bg-card)] text-blue-600 shadow-sm' : 'text-[var(--th-text-soft)] hover:text-[var(--th-text)]'}`}>
          <Library className="w-3.5 h-3.5" /> 阅读题库
        </button>
        <button onClick={() => setActiveTab('vocab')} className={`flex-1 py-1.5 text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition-colors ${activeTab === 'vocab' ? 'bg-[var(--th-bg-card)] text-green-600 shadow-sm' : 'text-[var(--th-text-soft)] hover:text-[var(--th-text)]'}`}>
          <Search className="w-3.5 h-3.5" /> 词汇本
        </button>
        <button onClick={() => setActiveTab('bookmarks')} className={`flex-1 py-1.5 text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition-colors ${activeTab === 'bookmarks' ? 'bg-[var(--th-bg-card)] text-purple-600 shadow-sm' : 'text-[var(--th-text-soft)] hover:text-[var(--th-text)]'}`}>
          <BookmarkIcon className="w-3.5 h-3.5" /> 收藏夹
          {bookmarks.length > 0 && <span className="bg-slate-200 text-[var(--th-text-soft)] px-1.5 rounded-full text-[9px]">{bookmarks.length}</span>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'exams' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center px-1 mb-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">历年真题</span>
              <button onClick={() => setIsUploadModalOpen(true)} className="text-[10px] bg-[var(--th-bg-soft)] hover:bg-slate-200 dark:hover:bg-slate-600 text-[var(--th-text-soft)] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                <Plus className="w-3 h-3" /> 导入题库
              </button>
            </div>

            {exams.length === 0 && (
              <div className="text-center p-6 border-2 border-dashed border-slate-200 rounded-xl space-y-3 mt-4">
                <Library className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs text-[var(--th-text-soft)] font-medium">暂无试卷库</p>
                <p className="text-[10px] text-slate-400 leading-relaxed">点击右上角"导入题库"上传真题文档。</p>
              </div>
            )}

            {/* Group exams by examType */}
            {(() => {
              const sortedExams = [...exams].sort((a, b) => b.year.localeCompare(a.year));
              const byType: Record<string, ExamPaper[]> = {};
              sortedExams.forEach(e => {
                const t = e.examType || 'cet6';
                if (!byType[t]) byType[t] = [];
                byType[t].push(e);
              });
              return Object.entries(byType).map(([type, typeExams]) => (
                <div key={type} className="space-y-2">
                  <div className="text-[10px] font-bold text-[var(--th-text-soft)] px-2 flex items-center gap-1">
                    <span>{ExamTypeIcons[type as keyof typeof ExamTypeIcons] || '📄'}</span>
                    {ExamTypeLabels[type as keyof typeof ExamTypeLabels] || type}
                  </div>
                  {typeExams.map((exam) => {
              const isCollapsed = collapsedExams.has(exam.id);
              const isSelectedExam = selectedExamId === exam.id;
              const grouped = groupPassagesBySection(exam.passages);
              const custom = isCustomExam(exam.id);

              return (
                <div key={exam.id} className="border border-[var(--th-border)] rounded-xl overflow-hidden group">
                  {/* Exam header — clickable to expand/collapse */}
                  <div
                    onClick={() => toggleCollapse(exam.id)}
                    className="w-full flex items-center justify-between px-3 py-2.5 bg-[var(--th-bg-soft)] hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') toggleCollapse(exam.id); }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                      <span className="text-xs font-bold text-[var(--th-text)] truncate">{exam.year}</span>
                      <span className="text-[10px] text-slate-400 truncate">{exam.title}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {isSelectedExam && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1"></div>}
                      {custom && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteExam(exam.id); }}
                          className="p-1 text-[var(--th-text-muted)] hover:text-red-500 rounded transition-colors opacity-0 group-hover:opacity-100"
                          title="删除此试卷"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expandable content */}
                  {!isCollapsed && (
                    <div className="p-2 space-y-2 bg-[var(--th-bg-card)]">
                      {Object.entries(grouped).map(([section, passages]) => (
                        <div key={section} className="space-y-1">
                          <div className="text-[10px] font-bold text-slate-400 px-2 flex items-center gap-1.5">
                            <span>{SectionIcons[section as any] || '📄'}</span> {SectionLabels[section as any] || section}
                          </div>
                          {passages.map((passage) => {
                            const isActive = isSelectedExam && selectedPassageId === passage.id;
                            const doneCount = completedQuestions
                              ? passage.questions.filter((q) => completedQuestions.has(q.id)).length
                              : 0;
                            return (
                              <button
                                key={passage.id}
                                onClick={() => onSelect(exam.id, passage.id)}
                                className={`w-full text-left p-2.5 rounded-lg flex items-center justify-between transition-colors border ${
                                  isActive ? 'bg-blue-50 border-blue-200 text-blue-700 font-bold shadow-sm' : 'bg-[var(--th-bg-card)] dark:bg-slate-700 border-transparent text-[var(--th-text-soft)] hover:bg-slate-50 dark:hover:bg-slate-600'
                                }`}
                              >
                                <span className="text-xs truncate pr-2" title={passage.title}>{passage.title}</span>
                                <div className="flex items-center gap-1 shrink-0">
                                  {doneCount > 0 && <span className="text-[9px] text-green-500 flex items-center gap-0.5"><CheckCircle className="w-3 h-3" />{doneCount}</span>}
                                  {isActive && <div className="w-1.5 h-1.5 rounded-full bg-blue-600"></div>}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
                  })}
                </div>
              ));
            })()}
          </div>
        )}

        {activeTab === 'vocab' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center px-1 mb-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">词汇库</span>
              <button onClick={() => setIsVocabModalOpen(true)} className="text-[10px] bg-green-100 hover:bg-green-200 text-green-700 font-bold px-2 py-0.5 rounded flex items-center gap-1 transition-colors">
                <Plus className="w-3 h-3" /> 导入
              </button>
            </div>
            {vocabLists.length === 0 ? (
              <div className="text-center p-6 border-2 border-dashed border-slate-200 rounded-xl space-y-3 mt-4">
                <Search className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs text-[var(--th-text-soft)] font-medium">暂无自定义词汇库。</p>
              </div>
            ) : (
              vocabLists.map(list => (
                <button key={list.id} onClick={() => onSelectVocab(list.id)} className={`w-full text-left p-3 rounded-lg group relative transition-colors border shadow-sm flex flex-col gap-1 ${selectedVocabId === list.id ? 'bg-green-50 border-green-200 text-green-800' : 'bg-[var(--th-bg-card)] border-slate-200 hover:bg-slate-50 text-[var(--th-text)]'}`}>
                  <div className="flex justify-between items-start w-full">
                    <span className="text-sm font-bold truncate pr-6">{list.title}</span>
                    {selectedVocabId === list.id && <div className="w-2 h-2 rounded-full bg-green-500 shrink-0 mt-1.5"></div>}
                  </div>
                  <span className="text-[10px] text-[var(--th-text-soft)] flex items-center gap-1"><FileText className="w-3 h-3" />{list.words.length} 个单词</span>
                  <button onClick={(e) => { e.stopPropagation(); onDeleteVocab(list.id); }} className={`absolute top-2 right-2 text-[var(--th-text-muted)] hover:text-red-500 transition-opacity ${selectedVocabId === list.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    <X className="w-4 h-4" />
                  </button>
                </button>
              ))
            )}
          </div>
        )}

        {activeTab === 'bookmarks' && (
          <div className="space-y-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block px-1 mb-2">已收藏内容</span>
            {bookmarks.length === 0 ? (
              <p className="text-xs text-slate-400 px-2 italic">您还没有收藏任何内容哦。</p>
            ) : (
              bookmarks.map((bm) => (
                <div key={bm.id} className="bg-[var(--th-bg-card)] border border-slate-200 hover:border-purple-300 rounded-lg p-3 transition-colors group cursor-pointer shadow-sm" onClick={() => onReviewBookmark(bm)}>
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[10px] font-bold text-purple-600 uppercase bg-purple-50 px-1.5 py-0.5 rounded">{bm.type}</span>
                    <button onClick={(e) => { e.stopPropagation(); onDeleteBookmark(bm.id); }} className="text-[var(--th-text-muted)] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3" /></button>
                  </div>
                  <p className="text-[13px] line-clamp-3 text-[var(--th-text)] leading-relaxed font-medium">{bm.content}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <UploadExamModal isOpen={isUploadModalOpen} onClose={() => setIsUploadModalOpen(false)} onUploadSuccess={onUpload} apiKey={apiKey} />
      <UploadVocabModal isOpen={isVocabModalOpen} onClose={() => setIsVocabModalOpen(false)} onUploadSuccess={onUploadVocab} apiKey={apiKey} />
    </div>
  );
}
