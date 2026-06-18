// parsers/reading.ts — Pure reading mode (no questions, just segmentation)
import { SectionExtract, ExamParser, segmentParagraphs } from './base';

export const ReadingParser: ExamParser = {
  examType: 'reading',

  extractSections(text: string): SectionExtract[] {
    // Pure reading: treat entire text as one passage, no question extraction
    return [{
      type: 'reading',
      title: '精读文章',
      text: text.substring(0, 20000),
    }];
  },

  buildPrompt(s: SectionExtract): string {
    // No AI prompt needed for pure reading — segmentation is done client-side
    // But if called, just split into paragraphs
    return `Split this text into paragraphs and sentences. Output JSON: {"title":"精读文章","section":"reading","paragraphs":[{"id":"p1","sentences":["s1.","s2."]}],"questions":[]}`;
  },
};
