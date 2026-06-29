// parsers/ielts.ts — IELTS parser
import { SectionExtract, ExamParser, findPassageBoundaries } from './base';

export const IELTSParser: ExamParser = {
  examType: 'ielts',

  extractSections(t: string): SectionExtract[] {
    const S: SectionExtract[] = [];

    // IELTS Reading: typically 3 passages (Passage 1/2/3)
    const readingIdx = t.search(/Reading\s*(Passage|Test|Section|Module)/i) >= 0
      ? t.search(/Reading/i)
      : t.search(/Passage\s*1/i);

    // Listening: match only section-title patterns
    const listeningIdx = t.search(/\bListening\s*(Section|Test|Passage|Part|Module|Comprehension)\b/i);
    // Writing
    const writingIdx = t.search(/Writing\s*(Task|Test)/i);

    // Listening section
    if (listeningIdx >= 0) {
      const end = readingIdx > listeningIdx ? readingIdx : (writingIdx > listeningIdx ? writingIdx : t.length);
      const lt = t.substring(listeningIdx, end);
      if (lt.length > 200) {
        // Split by Section 1/2/3/4
        const secs = [...lt.matchAll(/Section\s*[1-4]/gi)].sort((a, b) => a.index! - b.index!);
        if (secs.length > 0) {
          for (let i = 0; i < secs.length; i++) {
            const s = secs[i].index!;
            const e = i + 1 < secs.length ? secs[i + 1].index! : lt.length;
            const txt = lt.substring(s, e);
            if (txt.length > 100) S.push({ type: 'ielts-listening', title: `Listening Section ${i + 1}`, text: txt });
          }
        } else {
          S.push({ type: 'ielts-listening', title: '雅思听力', text: lt });
        }
      }
    }

    // Reading: 3 passages
    if (readingIdx >= 0) {
      const rt = t.substring(readingIdx);
      const bounds = findPassageBoundaries(rt);
      if (bounds.length >= 2) {
        for (let i = 0; i < bounds.length; i++) {
          const start = bounds[i].start;
          const end = i + 1 < bounds.length ? bounds[i + 1].start : rt.length;
          const txt = rt.substring(start, end);
          if (txt.length > 200) S.push({ type: 'ielts-reading', title: `Passage ${i + 1}`, text: txt.substring(0, 10000) });
        }
      } else if (rt.length > 200) {
        S.push({ type: 'ielts-reading', title: '雅思阅读', text: rt.substring(0, 10000) });
      }
    }

    // Writing: Task 1 + Task 2
    if (writingIdx >= 0) {
      const wt = t.substring(writingIdx);
      const task2Idx = wt.search(/Task\s*2/i);
      if (task2Idx > 0) {
        S.push({ type: 'ielts-writing', title: 'Writing Task 1', text: wt.substring(0, task2Idx).substring(0, 3000) });
        S.push({ type: 'ielts-writing', title: 'Writing Task 2', text: wt.substring(task2Idx).substring(0, 3000) });
      } else if (wt.length > 100) {
        S.push({ type: 'ielts-writing', title: '雅思写作', text: wt.substring(0, 3000) });
      }
    }

    if (S.length === 0 && t.length > 500) S.push({ type: 'ielts-reading', title: '雅思阅读', text: t.substring(0, 10000) });
    return S.filter(s => s.text.length > 80);
  },

  buildPrompt(s: SectionExtract): string {
    switch (s.type) {
      case 'ielts-reading':
        return `Extract this IELTS reading passage with ALL questions. IELTS has varied question types: True/False/Not Given, matching, fill-in-the-blank, multiple choice, summary completion. For each question set the subType field. Output JSON: {"title":"IELTS Reading","section":"ielts-reading","paragraphs":[{"id":"p1","sentences":["s1."]}],"questions":[{"id":"q1","number":1,"questionType":"ielts-reading","subType":"true-false-ng","content":"question","options":[{"key":"TRUE","text":""},{"key":"FALSE","text":""},{"key":"NOT GIVEN","text":""}],"correctAnswer":"TRUE","answerExplanation":"中文解析"}]} Extract ALL questions with correct subType.`;
      case 'ielts-listening':
        return `Extract ALL IELTS listening questions. Output JSON: {"title":"IELTS Listening","section":"ielts-listening","paragraphs":[],"questions":[{"id":"q1","number":1,"questionType":"ielts-listening","content":"...","options":[{"key":"A","text":"..."}],"correctAnswer":"A","answerExplanation":"中文解析"}]}`;
      case 'ielts-writing':
        return `Extract IELTS writing task. Output JSON: {"title":"雅思写作","section":"ielts-writing","paragraphs":[{"id":"p1","sentences":["prompt"]}],"questions":[{"id":"q1","number":1,"questionType":"ielts-writing","content":"Write...","options":[],"correctAnswer":"","answerExplanation":"写作思路+范文要点"}]}`;
      default: return '';
    }
  },
};
