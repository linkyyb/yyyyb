import { VocabList, WordItem, ExamPaper, Passage } from '../types';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'error';

export interface ParseTask {
  id: string;
  type: 'vocab' | 'exam';
  fileName: string;
  totalChunks: number;
  completedChunks: number;
  failedChunks: number;
  status: TaskStatus;
  progress: number;
  startTime: number;
  error?: string;
  _debugLog?: string[];
  chunks: string[];
  results: any[];
  apiKey: string;
  model: string;
  isThinking: boolean;
  onComplete?: (result: any) => void;
}

class TaskManager {
  private tasks: Map<string, ParseTask> = new Map();
  private listeners: Set<() => void> = new Set();
  private concurrencyLimit = 100;
  private activeWorkers = 0;
  private queue: Array<() => Promise<void>> = [];
  private persistKey = 'cet6_task_queue';

  constructor() {
    // Restore tasks from localStorage (survive page refresh)
    try {
      const saved = localStorage.getItem(this.persistKey);
      if (saved) {
        const arr: ParseTask[] = JSON.parse(saved);
        for (const t of arr) {
          // Mark previously running tasks as interrupted
          if (t.status === 'running' || t.status === 'pending') {
            t.status = 'error';
            t.error = '任务因页面刷新而中断，请重新上传。';
          }
          // Don't restore onComplete callback (can't serialize functions)
          t.onComplete = undefined;
          this.tasks.set(t.id, t);
        }
      }
    } catch {}
  }

  private persist() {
    try {
      const arr = Array.from(this.tasks.values()).map(t => ({
        id: t.id, type: t.type, fileName: t.fileName,
        totalChunks: t.totalChunks, completedChunks: t.completedChunks,
        failedChunks: t.failedChunks, status: t.status, progress: t.progress,
        startTime: t.startTime, error: t.error, results: t.results,
      }));
      // Limit stored tasks to last 20 to avoid localStorage bloat
      localStorage.setItem(this.persistKey, JSON.stringify(arr.slice(-20)));
    } catch { /* localStorage full or unavailable */ }
  }

  public subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    this.listeners.forEach((l) => l());
    this.persist();  // Save to localStorage after every state change
  }

  public getTasks(): ParseTask[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.startTime - a.startTime);
  }

  public startTask(
    type: 'vocab' | 'exam',
    fileName: string,
    rawText: string,
    apiKey: string,
    model: string,
    isThinking: boolean,
    onComplete: (result: any) => void
  ) {
    const id = Date.now().toString() + Math.random().toString(36).substring(7);
    const m = model || 'deepseek-v4-pro';

    if (type === 'exam') {
      // Exam parsing: single API call (no chunking — server handles sections)
      const task: ParseTask = {
        id, type, fileName,
        totalChunks: 1, completedChunks: 0, failedChunks: 0,
        status: 'pending', progress: 0, startTime: Date.now(),
        chunks: [rawText], results: [], apiKey, model: m, isThinking, onComplete,
      };
      this.tasks.set(id, task);
      this.emit();

      task.status = 'running';
      this.emit();
      this.queue.push(async () => {
        try {
          const res = await fetch('/api/parse-exam', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: rawText, apiKey, model: m }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => null);
            throw new Error(err?.error || 'Failed to parse exam');
          }
          const data = await res.json();
          console.log('[TaskStore] Exam parse:', data.passages?.length, 'passages. Log:', (data._log||[]).join(' → '));
          if (data.passages) task.results.push(...data.passages);
          if (data._log) task._debugLog = data._log;
          else console.warn('[TaskStore] No passages key. Response keys:', Object.keys(data));
        } catch (e) {
          console.error('Exam parse failed:', e);
          task.failedChunks++;
          task.error = (e as Error).message;
        } finally {
          task.completedChunks = 1;
          task.progress = 100;
          this.emit();
          this.checkTaskCompletion();
        }
      });
      this.pumpQueue();
      return id;
    }

    // Vocab parsing: chunk and process with 100 concurrency
    const chunkSize = 2000;
    const overlap = 150;
    const chunks: string[] = [];
    let i = 0;
    while (i < rawText.length) {
      const end = Math.min(i + chunkSize, rawText.length);
      chunks.push(rawText.substring(i, end));
      if (end === rawText.length) break;
      i += (chunkSize - overlap);
    }

    const task: ParseTask = {
      id, type, fileName,
      totalChunks: chunks.length, completedChunks: 0, failedChunks: 0,
      status: 'pending', progress: 0, startTime: Date.now(),
      chunks, results: [], apiKey, model: m, isThinking, onComplete,
    };
    this.tasks.set(id, task);
    this.emit();
    this.processTask(id);
    return id;
  }

  private async processTask(taskId: string) {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.status = 'running';
    this.emit();

    const jobs = task.chunks.map((chunkText, index) => async () => {
      try {
        const res = await fetch('/api/parse-vocab-chunk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: chunkText, apiKey: task.apiKey, model: task.model }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.error || 'Failed to parse chunk');
        }
        const data = await res.json();
        if (data.words) task.results.push(...data.words);
      } catch (e) {
        console.error(`Vocab chunk ${index} failed:`, e);
        task.failedChunks++;
      } finally {
        task.completedChunks++;
        task.progress = Math.round((task.completedChunks / task.totalChunks) * 100);
        this.emit();
      }
    });

    this.queue.push(...jobs);
    this.pumpQueue();
  }

  private async pumpQueue() {
    while (this.activeWorkers < this.concurrencyLimit && this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) break;
      this.activeWorkers++;
      job().finally(() => {
        this.activeWorkers--;
        this.checkTaskCompletion();
        this.pumpQueue();
      });
    }
  }

  private checkTaskCompletion() {
    for (const [, task] of this.tasks.entries()) {
      if (task.status === 'running' && task.completedChunks === task.totalChunks) {
        if (task.failedChunks === task.totalChunks) {
          task.status = 'error';
          task.error = `All tasks failed. Check API key and network.`;
          this.emit();
          continue;
        }
        task.status = 'completed';
        this.emit();
        this.finalizeTask(task);
      }
    }
  }

  private finalizeTask(task: ParseTask) {
    if (task.type === 'vocab') {
      const seen = new Set<string>();
      const words: WordItem[] = [];
      for (const w of task.results) {
        if (!w.word) continue;
        const n = w.word.trim().toLowerCase();
        if (!seen.has(n)) {
          seen.add(n);
          words.push({ id: w.id || `${Date.now()}-${Math.random().toString(36).substring(7)}`, word: w.word.trim(), definition: w.definition || '' });
        }
      }
      if (words.length === 0) {
        task.status = 'error';
        task.error = `No valid words extracted (received ${task.results.length} raw items). Check API key or document content.`;
        this.emit();
        return;
      }
      task.onComplete?.({ words });
    } else {
      const seen = new Set<string>();
      const passages: Passage[] = [];
      for (const p of task.results) {
        // Accept any passage-like object, generate title if missing
        const title = (p.title || p.section || 'Untitled Section').trim();
        const key = title.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          passages.push({
            ...p,
            id: p.id || `p-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            title: p.title || title,
            section: p.section || 'careful-reading',
            paragraphs: p.paragraphs || [],
            questions: p.questions || [],
            wordBank: p.wordBank || [],
            sourceText: p.sourceText || '',
          });
        }
      }
      if (passages.length === 0) {
        task.status = 'error';
        const debugInfo = task._debugLog ? ' | Server log: ' + task._debugLog.join(' → ') : '';
        task.error = `No valid passages extracted (received ${task.results.length} raw items).${debugInfo}`;
        this.emit();
        return;
      }
      task.onComplete?.({ passages });
    }
  }

  public removeTask(taskId: string) {
    this.tasks.delete(taskId);
    this.emit();
  }
}

export const taskManager = new TaskManager();
