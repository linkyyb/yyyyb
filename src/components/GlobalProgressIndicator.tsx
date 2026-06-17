import React, { useEffect, useState } from 'react';
import { taskManager, ParseTask } from '../store/TaskStore';
import { Loader2, CheckCircle2, XCircle, FileText, X, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function GlobalProgressIndicator() {
  const [tasks, setTasks] = useState<ParseTask[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const unsub = taskManager.subscribe(() => {
      const allTasks = taskManager.getTasks();
      setTasks([...allTasks]);
      if (allTasks.some(t => t.status === 'running' || t.status === 'error')) {
        setIsOpen(true);
      }
      // Auto-dismiss completed/error tasks after 8 seconds
      const now = Date.now();
      allTasks.forEach(t => {
        if ((t.status === 'completed' || t.status === 'error') && now - t.startTime > 8000) {
          taskManager.removeTask(t.id);
        }
      });
    });
    // Periodic cleanup
    const interval = setInterval(() => {
      const allTasks = taskManager.getTasks();
      const now = Date.now();
      let changed = false;
      allTasks.forEach(t => {
        if ((t.status === 'completed' || t.status === 'error') && now - t.startTime > 8000) {
          taskManager.removeTask(t.id);
          changed = true;
        }
      });
      if (!changed && allTasks.length === 0) clearInterval(interval);
    }, 3000);
    return () => { unsub(); clearInterval(interval); };
  }, []);

  // Hide when all tasks are gone or all are done for > 8 seconds
  if (tasks.length === 0) return null;

  const runningTasksCount = tasks.filter(t => t.status === 'running').length;
  const errorTasksCount = tasks.filter(t => t.status === 'error').length;
  const hasActiveTasks = runningTasksCount > 0;

  const getStatusText = (task: ParseTask): string => {
    switch (task.status) {
      case 'running': return '处理中...';
      case 'completed': return '已完成';
      case 'error': return '失败';
      case 'pending': return '等待中';
      default: return task.status;
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-none">

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="bg-[var(--th-bg-card)] border border-[var(--th-border)] shadow-xl rounded-2xl w-80 mb-4 overflow-hidden pointer-events-auto flex flex-col max-h-[400px]"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--th-border)] bg-slate-50/50">
               <h3 className="text-sm font-bold text-[var(--th-text)] flex items-center gap-2">
                 {hasActiveTasks && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                 {!hasActiveTasks && errorTasksCount > 0 && <AlertTriangle className="w-4 h-4 text-red-500" />}
                 后台处理任务 ({tasks.length})
               </h3>
               <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-[var(--th-text-soft)]">
                 <X className="w-4 h-4" />
               </button>
            </div>

            <div className="overflow-y-auto flex-1 p-2 space-y-2">
               {tasks.map(task => (
                 <div key={task.id} className={`bg-[var(--th-bg-soft)] border rounded-xl p-3 relative group ${
                   task.status === 'error' ? 'border-red-200 bg-red-50/50' : 'border-slate-100'
                 }`}>
                    <button
                      onClick={() => taskManager.removeTask(task.id)}
                      className="absolute top-2 right-2 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <div className="flex items-start gap-3">
                       <div className="mt-0.5">
                         {task.status === 'running' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                         {task.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                         {task.status === 'error' && <XCircle className="w-4 h-4 text-red-500" />}
                         {task.status === 'pending' && <FileText className="w-4 h-4 text-slate-400" />}
                       </div>
                       <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--th-text)] truncate">{task.fileName}</p>
                          <p className="text-[10px] text-[var(--th-text-soft)] uppercase tracking-wider mb-2 mt-0.5">
                            {task.type === 'vocab' ? '词汇解析' : '真题解析'} • {getStatusText(task)}
                            {task.failedChunks > 0 && task.status === 'running' && (
                              <span className="text-red-400 ml-1">({task.failedChunks} 失败)</span>
                            )}
                          </p>

                          {(task.status === 'running' || task.status === 'completed' || task.status === 'error') && (
                            <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                              <motion.div
                                className={`h-1.5 rounded-full ${
                                  task.status === 'completed' ? 'bg-emerald-500'
                                  : task.status === 'error' ? 'bg-red-500'
                                  : 'bg-blue-500'
                                }`}
                                initial={{ width: 0 }}
                                animate={{ width: `${task.progress}%` }}
                                transition={{ duration: 0.3 }}
                              />
                            </div>
                          )}

                          {task.status === 'running' && (
                             <p className="text-xs text-[var(--th-text-soft)] mt-1.5 text-right w-full">
                               {task.progress}% ({task.completedChunks}/{task.totalChunks})
                             </p>
                          )}

                          {task.status === 'error' && task.error && (
                             <p className="text-xs text-red-500 mt-1.5 leading-relaxed">
                               {task.error}
                             </p>
                          )}
                       </div>
                    </div>
                 </div>
               ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="pointer-events-auto bg-[var(--th-bg-card)] border border-[var(--th-border)] shadow-lg rounded-full px-4 py-3 flex items-center gap-3 hover:bg-[var(--th-bg-soft)] transition-colors"
        >
           {hasActiveTasks ? (
             <div className="relative">
               <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
               <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
               </span>
             </div>
           ) : errorTasksCount > 0 ? (
             <XCircle className="w-5 h-5 text-red-500" />
           ) : (
             <CheckCircle2 className="w-5 h-5 text-emerald-500" />
           )}
           <div className="text-sm font-bold text-[var(--th-text)]">
             {hasActiveTasks ? `${runningTasksCount} 个任务运行中`
               : errorTasksCount > 0 ? `${errorTasksCount} 个任务失败`
               : '任务已完成'}
           </div>
        </button>
      )}
    </div>
  );
}
