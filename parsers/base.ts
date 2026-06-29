// parsers/base.ts — Base text processing shared by all exam parsers

/** Clean garbled PDF text (tabs, CJK spaces, roman numerals, page artifacts) */
export function cleanText(raw: string): string {
  let t = raw;
  t = t.replace(/\t/g, ' ');
  t = t.replace(/[ ]{2,}/g, ' ');
  t = t.replace(/Ⅰ/g, 'I').replace(/Ⅱ/g, 'II').replace(/Ⅲ/g, 'III').replace(/Ⅳ/g, 'IV');
  // Remove spaces between CJK characters (BMP + Ext-B/C/D ranges)
  t = t.replace(/([一-鿿㐀-䶿\u{20000}-\u{2A6DF}])\s+([一-鿿㐀-䶿\u{20000}-\u{2A6DF}])/gu, '$1$2');
  t = t.replace(/([一-鿿㐀-䶿\u{20000}-\u{2A6DF}])\s+([，。！？；：、（）《》【】])/gu, '$1$2');
  // Only merge spaces between SINGLE-digit characters — fixes PDF char-level spacing (e.g. "2 0 2 5" → "2025")
  // Does NOT merge multi-digit groups to avoid destroying "2025 年 12 月" etc.
  t = t.replace(/(?<=\b\d)\s+(?=\d\b)/g, '');
  // Stable-loop merge for remaining isolated single digits (e.g. "2 0 2 5" after first pass)
  let prev = '', passes = 0;
  while (prev !== t && passes++ < 5) { prev = t; t = t.replace(/(^|\s)(\d)\s+(\d)(\s|$)/gm, '$1$2$3$4'); }
  t = t.replace(/([a-zA-Z])\s+([,.!?;:])/g, '$1$2');
  t = t.replace(/Directions:([A-Z])/g, 'Directions: $1');
  t = t.replace(/([a-z]):([A-Z])/g, '$1: $2');
  t = t.replace(/\n{3,}/g, '\n\n');
  // Remove page artifacts
  t = t.replace(/·\s*\d{4}年\d{1,2}月[^·\n]*·\s*/g, '\n');
  t = t.replace(/\d+\s*·\s*\d{4}年\d{1,2}月[^\n]*/g, '');
  t = t.replace(/pastpapers\.cn\s*/g, '');
  t = t.replace(/--\s*\d+\s+of\s+\d+\s*--/g, '');
  return t.trim();
}

/**
 * Robust paragraph + sentence segmentation.
 * Fixes issues in the old segmentSentences:
 *  - Question lines (e.g. "26. ", "1)") are forced as new paragraphs
 *  - Passage One/Two/1/2/Ⅰ/Ⅱ detected via regex
 *  - Sentence split supports Chinese punctuation 。！？
 *  - Less aggressive line merging
 */
export function segmentParagraphs(text: string): { id: string; sentences: string[] }[] {
  const lines = text.split('\n');
  const merged: string[] = [];
  const isQuestionStart = (s: string) => /^\d+[.):]\s/.test(s.trim());
  const isPassageMarker = (s: string) => /Passage\s*(One|Two|Three|1|2|3|Ⅰ|Ⅱ|Ⅲ)/i.test(s.trim());

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i].trim();
    if (!ln) { merged.push(''); continue; }
    // Force new paragraph for question starts and passage markers
    if (isQuestionStart(ln) || isPassageMarker(ln)) { merged.push(ln); continue; }
    if (merged.length > 0 && merged[merged.length - 1] !== '') {
      const prev = merged[merged.length - 1];
      const prevEnd = prev.slice(-1);
      const currStart = ln.charAt(0);
      // Handle hyphenated line-breaks: "comprehen-" + "sion" → "comprehension"
      if (prevEnd === '-' && /^[a-zA-Z]/.test(currStart)) {
        merged[merged.length - 1] = prev.slice(0, -1) + ln;
        continue;
      }
      // Merge if previous line doesn't end with sentence punctuation
      // AND current line is a continuation (lowercase, comma, OR common continuation words)
      const prevIsSentenceEnd = '.!?。！？"]\')'.includes(prevEnd);
      const continuationWord = /^(the|a|an|in|on|at|to|of|for|and|but|or|nor|so|yet|as|if|when|while|that|which|who|whose|with|by|from|into|about|over|under|through|between|among|after|before|since|until|during|because|although|though|however|therefore|thus|moreover|furthermore|nevertheless|nonetheless|meanwhile|consequently|accordingly|hence|thereby|whereas|whereby|whether|unless|until|provided|given|despite|regarding|concerning|including|excluding|following|considering|upon|per|via|versus|within|without|throughout|alongside|beyond|above|below|behind|around|across|against|along|amid|towards|toward|onto|off|out|up|down|away|apart|aside|together|instead|rather|else|even|just|only|also|both|either|neither|such|more|less|most|least|few|many|much|some|any|no|all|each|every|other|another|same|different|various|several|certain|particular|specific|general|certain|various)[^a-zA-Z]/i.test(ln);
      const currIsContinuation = /^[a-z,]/.test(currStart) || continuationWord;
      if (!prevIsSentenceEnd && currIsContinuation) {
        merged[merged.length - 1] = prev + ' ' + ln;
        continue;
      }
    }
    merged.push(ln);
  }

  // Split into paragraphs by blank lines, then sentences
  const paraText = merged.join('\n');
  const paragraphs = paraText.split(/\n{2,}/);
  const result: { id: string; sentences: string[] }[] = [];
  let pIdx = 0;

  for (const para of paragraphs) {
    const trimmed = para.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (!trimmed) continue;
    // Split sentences: . ! ? 。 ！ ？ followed by space + capital/quote/paren, OR end of string
    // Also split on Chinese punctuation
    const sentences = trimmed
      .split(/(?<=[.!?。！？])\s+(?=[A-Z"'（(])/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    result.push({ id: `p${pIdx++}`, sentences: sentences.length ? sentences : [trimmed] });
  }
  return result;
}

/** Find passage boundaries using flexible regex (One/Two/1/2/Ⅰ/Ⅱ) */
export function findPassageBoundaries(text: string): { label: string; start: number }[] {
  const re = /Passage\s*(One|Two|Three|1|2|3|Ⅰ|Ⅱ|Ⅲ)/gi;
  const results: { label: string; start: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    results.push({ label: m[1], start: m.index });
  }
  return results;
}

export interface SectionExtract {
  type: string;
  title: string;
  text: string;
  wordBank?: string[];
  sourceText?: string;
}

/** Base parser interface — each exam type implements this */
export interface ExamParser {
  examType: string;
  extractSections(text: string): SectionExtract[];
  buildPrompt(section: SectionExtract): string;
}
