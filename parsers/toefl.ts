// parsers/toefl.ts — TOEFL parser
import { SectionExtract, ExamParser, findPassageBoundaries } from './base';

export const TOEFLParser: ExamParser = {
  examType: 'toefl',

  extractSections(t: string): SectionExtract[] {
    const S: SectionExtract[] = [];
    const readingIdx = t.search(/Reading\s*(Section|Passage|Direction)/i);
    const listeningIdx = t.search(/Listening/i);
    const speakingIdx = t.search(/Speaking/i);
    const writingIdx = t.search(/Writing/i);

    // Reading: multiple passages
    if (readingIdx >= 0) {
      const end = listeningIdx > readingIdx ? listeningIdx : (speakingIdx > readingIdx ? speakingIdx : (writingIdx > readingIdx ? writingIdx : t.length));
      const rt = t.substring(readingIdx, end);
      const bounds = findPassageBoundaries(rt);
      if (bounds.length >= 1) {
        for (let i = 0; i < bounds.length; i++) {
          const start = bounds[i].start;
          const end = i + 1 < bounds.length ? bounds[i + 1].start : rt.length;
          const txt = rt.substring(start, end);
          if (txt.length > 200) S.push({ type: 'toefl-reading', title: `Reading Passage ${i + 1}`, text: txt.substring(0, 10000) });
        }
      } else if (rt.length > 200) {
        S.push({ type: 'toefl-reading', title: '托福阅读', text: rt.substring(0, 10000) });
      }
    }

    // Listening
    if (listeningIdx >= 0) {
      const end = speakingIdx > listeningIdx ? speakingIdx : (writingIdx > listeningIdx ? writingIdx : t.length);
      const lt = t.substring(listeningIdx, end);
      if (lt.length > 200) S.push({ type: 'toefl-listening', title: '托福听力', text: lt.substring(0, 10000) });
    }

    // Speaking
    if (speakingIdx >= 0) {
      const end = writingIdx > speakingIdx ? writingIdx : t.length;
      const st = t.substring(speakingIdx, end);
      if (st.length > 100) S.push({ type: 'toefl-speaking', title: '托福口语', text: st.substring(0, 5000) });
    }

    // Writing
    if (writingIdx >= 0) {
      const wt = t.substring(writingIdx);
      if (wt.length > 100) S.push({ type: 'toefl-writing', title: '托福写作', text: wt.substring(0, 5000) });
    }

    if (S.length === 0 && t.length > 500) S.push({ type: 'toefl-reading', title: '托福阅读', text: t.substring(0, 10000) });
    return S.filter(s => s.text.length > 80);
  },

  buildPrompt(s: SectionExtract): string {
    switch (s.type) {
      case 'toefl-reading':
        return `Extract this TOEFL reading passage with ALL questions (multiple choice, insert text, summary). Output JSON: {"title":"TOEFL Reading","section":"toefl-reading","paragraphs":[{"id":"p1","sentences":["s1."]}],"questions":[{"id":"q1","number":1,"questionType":"toefl-reading","content":"question","options":[{"key":"A","text":"choice"}],"correctAnswer":"A","answerExplanation":"中文解析"}]} Extract ALL questions.`;
      case 'toefl-listening':
        return `Extract ALL TOEFL listening questions. Output JSON: {"title":"TOEFL Listening","section":"toefl-listening","paragraphs":[],"questions":[{"id":"q1","number":1,"questionType":"toefl-listening","content":"...","options":[{"key":"A","text":"..."}],"correctAnswer":"A","answerExplanation":"中文解析"}]}`;
      case 'toefl-writing':
        return `Extract TOEFL writing task. Output JSON: {"title":"托福写作","section":"toefl-writing","paragraphs":[{"id":"p1","sentences":["prompt"]}],"questions":[{"id":"q1","number":1,"questionType":"toefl-writing","content":"Write...","options":[],"correctAnswer":"","answerExplanation":"写作思路+范文要点"}]}`;
      case 'toefl-speaking':
        return `Extract TOEFL speaking task. Output JSON: {"title":"托福口语","section":"toefl-speaking","paragraphs":[{"id":"p1","sentences":["prompt"]}],"questions":[{"id":"q1","number":1,"questionType":"toefl-speaking","content":"Speak about...","options":[],"correctAnswer":"","answerExplanation":"答题思路+要点"}]}`;
      default: return '';
    }
  },
};
