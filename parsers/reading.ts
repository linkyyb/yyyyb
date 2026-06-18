// parsers/reading.ts — Pure reading mode (AI-assisted segmentation, no questions)
import { SectionExtract, ExamParser } from './base';

export const ReadingParser: ExamParser = {
  examType: 'reading',

  extractSections(text: string): SectionExtract[] {
    // Treat entire text as one passage
    return [{
      type: 'reading',
      title: '精读文章',
      text: text.substring(0, 20000),
    }];
  },

  buildPrompt(s: SectionExtract): string {
    return `You are a text segmentation assistant. Split this English article into properly formatted paragraphs and sentences. Rules:
1. Identify natural paragraph boundaries (topic shifts, blank lines, indentation)
2. Split each paragraph into individual sentences at sentence-ending punctuation (. ! ?)
3. Merge lines that were broken mid-sentence by PDF formatting
4. Do NOT extract any questions — this is pure reading mode
5. Preserve ALL original text content
Output ONLY JSON: {"title":"精读文章","section":"reading","paragraphs":[{"id":"p1","sentences":["First sentence.","Second sentence."]}],"questions":[]}`;
  },
};

