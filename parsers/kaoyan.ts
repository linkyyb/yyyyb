// parsers/kaoyan.ts — 考研英语 parser
import { SectionExtract, ExamParser, findPassageBoundaries } from './base';

export const KaoyanParser: ExamParser = {
  examType: 'kaoyan',

  extractSections(t: string): SectionExtract[] {
    const S: SectionExtract[] = [];

    // 考研英语结构: 完形填空 + 阅读理解(Text 1-4) + 新题型 + 翻译 + 写作
    const clozeIdx = t.search(/完形填空|Use\s*of\s*English|Cloze/i);
    const readingIdx = t.search(/阅读理解|Reading\s*Comprehension/i);
    const translationIdx = t.search(/翻译|Translation/i);
    const writingIdx = t.search(/写作|Writing/i);

    // 完形填空
    if (clozeIdx >= 0) {
      const end = readingIdx > clozeIdx ? readingIdx : t.length;
      S.push({ type: 'fill-blank', title: '完形填空', text: t.substring(clozeIdx, end).substring(0, 5000) });
    }

    // 阅读: Text 1/2/3/4
    if (readingIdx >= 0) {
      const end = translationIdx > readingIdx ? translationIdx : (writingIdx > readingIdx ? writingIdx : t.length);
      const rt = t.substring(readingIdx, end);
      // Find Text 1/2/3/4 or Passage 1/2/3/4
      const textBounds = [...rt.matchAll(/Text\s*(1|2|3|4|One|Two|Three|Four)/gi)].sort((a, b) => a.index! - b.index!);
      if (textBounds.length >= 2) {
        for (let i = 0; i < textBounds.length; i++) {
          const start = textBounds[i].index!;
          const end = i + 1 < textBounds.length ? textBounds[i + 1].index! : rt.length;
          const txt = rt.substring(start, end);
          if (txt.length > 200) S.push({ type: 'kaoyan-reading', title: `Text ${i + 1}`, text: txt.substring(0, 8000) });
        }
      } else {
        const bounds = findPassageBoundaries(rt);
        if (bounds.length >= 2) {
          for (let i = 0; i < bounds.length; i++) {
            const start = bounds[i].start;
            const end = i + 1 < bounds.length ? bounds[i + 1].start : rt.length;
            const txt = rt.substring(start, end);
            if (txt.length > 200) S.push({ type: 'kaoyan-reading', title: `Text ${i + 1}`, text: txt.substring(0, 8000) });
          }
        } else if (rt.length > 200) {
          S.push({ type: 'kaoyan-reading', title: '考研阅读', text: rt.substring(0, 8000) });
        }
      }
    }

    // 翻译
    if (translationIdx >= 0) {
      const end = writingIdx > translationIdx ? writingIdx : t.length;
      const tt = t.substring(translationIdx, end);
      const ch = tt.match(/[一-鿿][一-鿿\s，。！？、；：""''（）《》\n]{30,}/);
      S.push({ type: 'kaoyan-translation', title: '考研翻译', text: tt.substring(0, 3000), sourceText: ch ? ch[0].trim() : tt.substring(0, 300) });
    }

    // 写作
    if (writingIdx >= 0) {
      const wt = t.substring(writingIdx);
      // 考研写作: Part A (小作文) + Part B (大作文)
      const partBIdx = wt.search(/Part\s*B|大作文|Part\s*Ⅱ/i);
      if (partBIdx > 0) {
        S.push({ type: 'kaoyan-writing', title: '写作 Part A', text: wt.substring(0, partBIdx).substring(0, 3000) });
        S.push({ type: 'kaoyan-writing', title: '写作 Part B', text: wt.substring(partBIdx).substring(0, 3000) });
      } else if (wt.length > 100) {
        S.push({ type: 'kaoyan-writing', title: '考研写作', text: wt.substring(0, 3000) });
      }
    }

    if (S.length === 0 && t.length > 500) S.push({ type: 'kaoyan-reading', title: '考研阅读', text: t.substring(0, 8000) });
    return S.filter(s => s.text.length > 80);
  },

  buildPrompt(s: SectionExtract): string {
    switch (s.type) {
      case 'kaoyan-reading':
        return `Extract this 考研英语 reading passage with ALL questions (5 per text). Split into individual sentences. answerExplanation includes why correct + why each wrong. Output JSON: {"title":"考研阅读","section":"kaoyan-reading","paragraphs":[{"id":"p1","sentences":["s1."]}],"questions":[{"id":"q1","number":1,"questionType":"kaoyan-reading","content":"question","options":[{"key":"A","text":"choice"}],"correctAnswer":"A","answerExplanation":"✅A:... ❌B/C/D:..."}]}`;
      case 'fill-blank':
        return `Extract this 完形填空 with ALL blank questions. Output JSON: {"title":"完形填空","section":"fill-blank","paragraphs":[{"id":"p1","sentences":["text"]}],"questions":[{"id":"q1","number":1,"questionType":"fill-blank","content":"blank 1","options":[{"key":"A","text":"choice"}],"correctAnswer":"A","answerExplanation":"中文解析"}]}`;
      case 'kaoyan-translation':
        return `Extract 考研翻译. Output JSON: {"title":"考研翻译","section":"kaoyan-translation","sourceText":"Chinese/English text","paragraphs":[],"questions":[{"id":"q1","number":1,"questionType":"kaoyan-translation","content":"Translate","options":[],"correctAnswer":"","answerExplanation":"翻译要点+参考译文"}]}`;
      case 'kaoyan-writing':
        return `Extract 考研写作 prompt. Output JSON: {"title":"考研写作","section":"kaoyan-writing","paragraphs":[{"id":"p1","sentences":["prompt"]}],"questions":[{"id":"q1","number":1,"questionType":"kaoyan-writing","content":"Write...","options":[],"correctAnswer":"","answerExplanation":"写作思路+范文要点"}]}`;
      default: return '';
    }
  },
};
