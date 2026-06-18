// parsers/cet.ts — CET-4/6 parser (refactored from server.ts)
import { SectionExtract, ExamParser, findPassageBoundaries } from './base';

export const CETParser: ExamParser = {
  examType: 'cet6',

  extractSections(t: string): SectionExtract[] {
    const S: SectionExtract[] = [];
    const readingIdx = t.search(/Reading\s*Comprehension/i);
    const listeningIdx = t.search(/Listening\s*Comprehension/i);
    const translationIdx = t.indexOf('Translation', Math.max(readingIdx, 0) + 50);

    // Writing
    const writingIdx = t.search(/Writing|Part\s*I\s/);
    if (writingIdx >= 0 && listeningIdx > writingIdx) {
      const wt = t.substring(writingIdx, listeningIdx > 0 ? listeningIdx : (readingIdx > 0 ? readingIdx : t.length));
      if (wt.length > 100) S.push({ type: 'writing', title: 'Part I — 写作', text: wt.substring(0, 2000) });
    }

    // Listening (3 sections A/B/C)
    if (listeningIdx > 0) {
      const end = readingIdx > listeningIdx ? readingIdx : t.length;
      const lt = t.substring(listeningIdx, end);
      const lSecs: { name: string; idx: number }[] = [];
      let lm: RegExpExecArray | null;
      const lre = /Section\s+[A-C]/gi;
      while ((lm = lre.exec(lt)) !== null) lSecs.push({ name: lm[0], idx: lm.index });
      for (let i = 0; i < lSecs.length; i++) {
        const s = lSecs[i].idx;
        const e = i + 1 < lSecs.length ? lSecs[i + 1].idx : lt.length;
        const txt = lt.substring(s, e);
        if (txt.length > 100) {
          const nm = lSecs[i].name.toUpperCase();
          const title = nm.includes('A') ? 'Section A — 长对话' : nm.includes('B') ? 'Section B — 听力篇章' : 'Section C — 听力篇章';
          S.push({ type: 'listening', title, text: txt });
        }
      }
      if (lSecs.length === 0 && lt.length > 200) S.push({ type: 'listening', title: '听力理解', text: lt });
    }

    // Reading + Translation
    if (readingIdx >= 0) {
      const end = translationIdx > readingIdx ? translationIdx : t.length;
      const rt = t.substring(readingIdx, end);
      const rs = [...rt.matchAll(/Section\s+[A-C]/gi)].sort((a, b) => a.index! - b.index!);

      for (let i = 0; i < rs.length; i++) {
        const s = rs[i].index!;
        const e = i + 1 < rs.length ? rs[i + 1].index! : rt.length;
        const txt = rt.substring(s, e);
        if (txt.length < 80) continue;
        const up = rs[i][0].toUpperCase();

        if (up.includes('SECTION A')) {
          const wb: string[] = [];
          const bs = txt.substring(Math.floor(txt.length * 0.6));
          (bs.match(/[A-O]\)\s*(\w[\w-]*\w)/g) || []).forEach(m => {
            const w = m.replace(/^[A-O]\)\s*/, '').trim();
            if (w.length >= 2 && !wb.includes(w)) wb.push(w);
          });
          S.push({ type: 'banked-cloze', title: 'Section A — 选词填空', text: txt, wordBank: wb.slice(0, 20) });
        } else if (up.includes('SECTION B')) {
          S.push({ type: 'long-reading-match', title: 'Section B — 长篇阅读匹配', text: txt });
        } else if (up.includes('SECTION C')) {
          // Use flexible passage boundary detection
          const bounds = findPassageBoundaries(rt.substring(s));
          if (bounds.length >= 2) {
            const p1Start = s + bounds[0].start;
            const p2Start = s + bounds[1].start;
            S.push({ type: 'careful-reading', title: 'Passage One — 仔细阅读', text: rt.substring(p1Start, p2Start) });
            S.push({ type: 'careful-reading', title: 'Passage Two — 仔细阅读', text: rt.substring(p2Start) });
          } else if (bounds.length === 1) {
            S.push({ type: 'careful-reading', title: 'Passage One — 仔细阅读', text: rt.substring(s + bounds[0].start) });
          } else {
            S.push({ type: 'careful-reading', title: '仔细阅读', text: txt });
          }
        }
      }

      // Translation
      if (translationIdx > 0) {
        const tt = t.substring(translationIdx);
        const ch = tt.match(/[一-鿿][一-鿿\s，。！？、；：""''（）《》\n]{30,}/);
        S.push({ type: 'translation', title: 'Part IV — 翻译', text: tt.substring(0, 1000), sourceText: ch ? ch[0].trim() : tt.substring(0, 300) });
      }
    }

    if (readingIdx < 0) {
      if (t.length > 500) S.push({ type: 'careful-reading', title: 'Reading', text: t });
    }
    return S.filter(s => s.text.length > 80);
  },

  buildPrompt(s: SectionExtract): string {
    switch (s.type) {
      case 'banked-cloze':
        return `Extract this CET banked-cloze section. Split each paragraph into individual sentences. Extract ALL 15 word bank words. Each question (26-35) gets ALL 15 options. answerExplanation includes why correct fits + why 3 tempting wrong options fail. Output ONLY JSON: {"title":"选词填空","section":"banked-cloze","wordBank":["w1",...15],"paragraphs":[{"id":"p1","sentences":["s1."]}],"questions":[{"id":"q26","number":26,"questionType":"banked-cloze","content":"为第26空选择","options":[{key:A,text:w1},...15],"correctAnswer":"H","answerExplanation":"✅H因为... ❌A/B/C因为..."}]} Must output exactly 10 questions.`;
      case 'long-reading-match':
        return `Extract CET long-reading matching. Paragraph label ONLY on first sentence. Split into individual sentences. Extract ALL 10 matching statements (36-45). answerExplanation includes why match + why 2 similar paragraphs don't. Output ONLY JSON: {"title":"长篇阅读","section":"long-reading-match","paragraphs":[{"id":"p1","sentences":["[A] first.","second."]}],"questions":[{"id":"q36","number":36,"questionType":"long-reading-match","content":"statement","matchParagraph":"D","correctAnswer":"D","options":[],"answerExplanation":"✅D因为... ❌A/B因为..."}]}`;
      case 'careful-reading':
        return `Extract CET reading passage. Split into individual sentences. Extract all 5 questions with 4 options. answerExplanation includes why correct + why EACH wrong option is wrong. Output ONLY JSON: {"title":"仔细阅读","section":"careful-reading","paragraphs":[{"id":"p1","sentences":["s1."]}],"questions":[{"id":"q46","number":46,"questionType":"careful-reading","content":"question","options":[{"key":"A","text":"choice"}],"correctAnswer":"A","answerExplanation":"✅A:原文... ❌B/C/D:分别..."}]}`;
      case 'listening':
        return `Extract ALL multiple-choice questions from this listening section. answerExplanation includes why correct + why each wrong. Format: {"title":"听力","section":"listening","paragraphs":[],"questions":[{"id":"q1","number":1,"questionType":"listening","content":"...","options":[{"key":"A","text":"..."}],"correctAnswer":"A","answerExplanation":"✅... ❌..."}]} Extract EVERY numbered question.`;
      case 'writing':
        return `Extract CET writing prompt. Output ONLY JSON: {"title":"写作","section":"writing","paragraphs":[{"id":"p1","sentences":["prompt"]}],"questions":[{"id":"q1","number":1,"questionType":"writing","content":"Write an essay","options":[],"correctAnswer":"","answerExplanation":"写作思路+关键论点+核心词汇"}]}`;
      case 'translation':
        return `Extract Chinese-English translation. Output ONLY JSON: {"title":"翻译","section":"translation","sourceText":"Chinese text","wordBank":["keyword"],"paragraphs":[],"questions":[{"id":"q1","number":1,"questionType":"translation","content":"Translate to English","options":[],"correctAnswer":"","answerExplanation":"关键句型+核心词汇+翻译要点"}]}`;
      default: return '';
    }
  },
};
