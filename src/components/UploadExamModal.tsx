import { useState, useRef } from 'react';
import { Upload, X, FileText, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { ExamPaper, Passage, ExamType, ExamTypeLabels } from '../types';
import { taskManager } from '../store/TaskStore';

interface UploadExamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (exam: ExamPaper) => void;
  apiKey: string;
}

export default function UploadExamModal({ isOpen, onClose, onUploadSuccess, apiKey }: UploadExamModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadStage, setUploadStage] = useState<'idle' | 'extracting' | 'verifying' | 'parsing'>('idle');
  const [examYearTitle, setExamYearTitle] = useState('YYYY年MM月 真题');
  const [examType, setExamType] = useState<ExamType>('cet6');
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleUpload = async () => {
    // Reading mode can use paste text without file/API key
    if (examType === 'reading') {
      let text = '';
      if (pasteMode && pasteText.trim()) {
        text = pasteText;
      } else if (file) {
        const formData = new FormData();
        formData.append('file', file);
        setUploadStage('extracting');
        const res = await fetch('/api/extract-raw-text', { method: 'POST', body: formData });
        if (!res.ok) { const e = await res.json().catch(() => null); setError(e?.error || '提取失败'); return; }
        const d = await res.json();
        text = d.text || '';
      } else {
        setError('请上传文件或粘贴文本');
        return;
      }
      if (!text.trim()) { setError('文本为空'); return; }
      // Reading mode: call /api/parse-reading (no AI needed)
      const rRes = await fetch('/api/parse-reading', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      const rData = await rRes.json();
      if (rData.passages?.length) {
        const newExam: ExamPaper = {
          id: `reading-${Date.now()}`, examType: 'reading',
          year: new Date().toLocaleDateString(), title: file?.name.replace(/\.[^/.]+$/, '') || '精读文章',
          passages: rData.passages as Passage[],
        };
        onUploadSuccess(newExam);
      }
      setIsUploading(false); setUploadStage('idle'); setFile(null); setPasteText(''); onClose();
      return;
    }

    if (!file) return;
    if (!apiKey) {
      setError("DeepSeek API Key is required to parse documents. Please set it in AI Settings first.");
      return;
    }

    setIsUploading(true);
    setError(null);
    setUploadStage('extracting');

    const formData = new FormData();
    formData.append('file', file);

    try {
      // 1. Extract raw text via backend
      const res = await fetch('/api/extract-raw-text', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.details
          ? `${errData.error} — ${errData.details}`
          : (errData?.error || 'Failed to extract text from document'));
      }

      const extractData = await res.json();
      let { text } = extractData;
      const detectedYear: string = extractData.detectedYear || '';
      const detectedExamType: string = extractData.detectedExamType || examType;
      // Auto-update examType if detected and user hasn't manually changed
      if (detectedExamType && detectedExamType !== 'cet6') setExamType(detectedExamType as ExamType);

      if (!text || text.trim().length === 0) {
         throw new Error('Extracted text is empty. The document might contain only scanned images (OCR needed).');
      }

      // Auto-detect year and compute final title
      const autoYear = detectedYear
        ? `${detectedYear} ${ExamTypeLabels[examType as ExamType] || ''}真题`.trim()
        : examYearTitle;
      if (detectedYear) setExamYearTitle(autoYear);

      // 2. AI verification
      setUploadStage('verifying');
      try {
        const vRes = await fetch('/api/verify-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, apiKey }),
        });
        if (vRes.ok) {
          const vData = await vRes.json();
          if (vData.text) text = vData.text;
        }
      } catch { /* Continue */ }

      setUploadStage('parsing');

      // 3. Queue processing with examType
      const finalYear = autoYear;
      const finalExamType = examType;
      taskManager.startTask(
          'exam',
          file.name,
          text,
          apiKey,
          localStorage.getItem('deepseek_model') || 'deepseek-v4-pro',
          localStorage.getItem('deepseek_thinking') !== 'false',
          (result) => {
             if (result && result.passages && result.passages.length > 0) {
                const newExam: ExamPaper = {
                  id: `custom-${Date.now()}`,
                  examType: finalExamType,
                  year: finalYear,
                  title: file.name.replace(/\.[^/.]+$/, ""),
                  passages: result.passages as Passage[],
                };
                onUploadSuccess(newExam);
             }
          },
          finalExamType
      );

      // Reset and close
      setIsUploading(false);
      setUploadStage('idle');
      setFile(null);
      onClose();
    } catch (err: any) {
      setError(err.message);
      setIsUploading(false);
      setUploadStage('idle');
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      setFile(null);
      setError(null);
      setUploadStage('idle');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-[var(--th-bg-card)] w-[480px] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-[var(--th-border)] flex justify-between items-center bg-[var(--th-bg-soft)]">
          <div className="flex items-center gap-2 text-[var(--th-text)] font-bold">
            <Upload className="w-5 h-5 text-blue-500" />
            导入历年真题
          </div>
          <button onClick={handleClose} disabled={isUploading} className="p-1 text-slate-400 hover:text-[var(--th-text-soft)] rounded-md transition-colors disabled:opacity-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Exam type selector */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-[var(--th-text)]">考试类型</label>
            <select
              value={examType}
              onChange={(e) => setExamType(e.target.value as ExamType)}
              disabled={isUploading}
              className="w-full px-4 py-2 bg-[var(--th-bg-soft)] border border-[var(--th-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-[var(--th-text)] disabled:opacity-50"
            >
              {Object.entries(ExamTypeLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {examType !== 'reading' && (
          <div className="space-y-2">
            <label className="text-sm font-bold text-[var(--th-text)]">真题年份与名称</label>
            <input
              type="text"
              value={examYearTitle}
              onChange={(e) => setExamYearTitle(e.target.value)}
              disabled={isUploading}
              className="w-full px-4 py-2 bg-[var(--th-bg-soft)] border border-[var(--th-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-semibold text-[var(--th-text)] disabled:opacity-50"
            />
          </div>
          )}

          {examType === 'reading' && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <button onClick={() => setPasteMode(false)} className={`text-xs px-3 py-1 rounded ${!pasteMode ? 'bg-blue-100 text-blue-700' : 'text-[var(--th-text-soft)]'}`}>📁 上传文件</button>
              <button onClick={() => setPasteMode(true)} className={`text-xs px-3 py-1 rounded ${pasteMode ? 'bg-blue-100 text-blue-700' : 'text-[var(--th-text-soft)]'}`}>📋 粘贴文本</button>
            </div>
            {pasteMode && (
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="粘贴英文文章内容..."
                className="w-full h-40 p-3 border border-[var(--th-border)] bg-[var(--th-bg-soft)] rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-[var(--th-text)]"
              />
            )}
          </div>
          )}


          <div
             className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
               isUploading ? 'border-yellow-400 bg-yellow-50 cursor-not-allowed'
               : file ? 'border-blue-500 bg-blue-50'
               : 'border-slate-300 hover:border-blue-400 hover:bg-[var(--th-bg-soft)] cursor-pointer'
             }`}
             onClick={() => !file && !isUploading && fileInputRef.current?.click()}
          >
            {isUploading ? (
               <div className="flex flex-col items-center gap-3">
                 <Loader2 className="w-10 h-10 text-yellow-500 animate-spin" />
                 <p className="font-bold text-yellow-800">
                   {uploadStage === 'extracting' ? '正在提取文档文本...' : uploadStage === 'verifying' ? 'AI 正在修复文本...' : '正在启动后台解析...'}
                 </p>
                 <p className="text-xs text-yellow-600">{file?.name}</p>
               </div>
            ) : file ? (
               <div className="flex flex-col items-center gap-3">
                 <FileText className="w-10 h-10 text-blue-500" />
                 <p className="font-bold text-blue-900">{file.name}</p>
                 <p className="text-xs text-blue-600 mb-2">已准备好提取 ({(file.size / 1024).toFixed(1)} KB)</p>
                 <button
                   onClick={(e) => { e.stopPropagation(); setFile(null); setError(null); }}
                   className="text-xs text-red-500 hover:underline"
                 >
                   移除文件
                 </button>
               </div>
            ) : (
                <>
                  <Upload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                  <p className="font-bold text-[var(--th-text)] mb-1">点击选择文件上传</p>
                  <p className="text-xs text-[var(--th-text-soft)]">支持 PDF、DOCX 或 TXT 格式</p>
                </>
            )}
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".pdf,.docx,.txt,.PDF,.DOCX,.TXT"
              onChange={(e) => {
                 if (e.target.files && e.target.files.length > 0) {
                     setFile(e.target.files[0]);
                     setError(null);
                 }
              }}
            />
          </div>

          {error && (
             <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-start gap-2">
               <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
               <div>
                 <span className="font-bold">错误:</span> {error}
               </div>
             </div>
          )}

          <button
            onClick={handleUpload}
            disabled={(examType === 'reading' ? (!file && !pasteText.trim()) : !file) || isUploading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold rounded-lg text-sm transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {uploadStage === 'extracting' ? '正在提取文本...' : uploadStage === 'verifying' ? 'AI 修复中...' : '正在启动后台任务...'}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                后台解析并导入题库
              </>
            )}
          </button>
          {!isUploading && !error && (
            <p className="text-[10px] text-center text-slate-400 mt-2">
              大型文件将自动分块并发解析，点击后即可关闭弹窗，在后台进度面板查看状态。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
