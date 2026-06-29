import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import OpenAI from "openai";
import multer from "multer";
import { cleanText, segmentParagraphs, SectionExtract, ExamParser } from "./parsers/base";
import { CETParser } from "./parsers/cet";
import { IELTSParser } from "./parsers/ielts";
import { TOEFLParser } from "./parsers/toefl";
import { KaoyanParser } from "./parsers/kaoyan";
import { ReadingParser } from "./parsers/reading";

// Parser registry — strategy pattern
const PARSERS: Record<string, ExamParser> = {
  cet4: CETParser, cet6: CETParser,
  ielts: IELTSParser, toefl: TOEFLParser, kaoyan: KaoyanParser,
  reading: ReadingParser,
};

function getParser(examType: string): ExamParser {
  return PARSERS[examType] || CETParser;
}

function detectExamType(text: string): string {
  if (/IELTS|雅思/i.test(text)) return 'ielts';
  if (/TOEFL|托福/i.test(text)) return 'toefl';
  if (/考研|Kaoyan/i.test(text)) return 'kaoyan';
  if (/CET-?4|四级|Band\s*4/i.test(text)) return 'cet4';
  if (/CET-?6|六级|Band\s*6/i.test(text)) return 'cet6';
  return 'cet6'; // default
}

function extractJson(raw: string): any {
  if(!raw?.trim()) return {};
  let c=raw.trim();
  c=c.replace(/^```json\s*\n?/i,'').replace(/\n?```\s*$/,'');
  c=c.replace(/^```\s*\n?/,'').replace(/\n?```\s*$/,'');
  try{return JSON.parse(c);}catch{
    try{const m=c.match(/\{[\s\S]*\}/);if(m)return JSON.parse(m[0]);}catch{return {};}
  }
}

// ═══ Server ═══
async function startServer() {
  const app=express();
  const PORT=parseInt(process.env.PORT||'3000');
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:50*1024*1024}});
  app.use(express.json({limit:'50mb'}));

  function llmParams(msg:any[],model:string,thinking:any,json:boolean){
    const m=model||'deepseek-v4-pro';
    const p:any={model:m,messages:msg};
    if(json){(p as any).response_format={type:"json_object"};(p as any).thinking={type:'disabled'};}
    else{(p as any).thinking=thinking===false||thinking==='false'?{type:'disabled'}:{type:'enabled'};}
    return p;
  }

  // Chat
  app.post("/api/chat",async(req,res)=>{
    try{
      const {messages,apiKey,model,isThinking}=req.body;
      if(!apiKey||!messages) return res.status(400).json({error:"API Key required"});
      const o=new OpenAI({baseURL:'https://api.deepseek.com',apiKey});
      const params = llmParams(messages,model,isThinking,false);
      (params as any).stream = true;

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const stream = await o.chat.completions.create(params as any);
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta) {
          res.write(`data: ${JSON.stringify(delta)}\n\n`);
        }
      }
      res.write('data: [DONE]\n\n');
      res.end();
    }catch(e:any){
      if (!res.headersSent) {
        res.status(500).json({error:"Chat failed",details:e?.message});
      } else {
        res.write(`event: error\ndata: ${JSON.stringify({error: "Chat failed", details: e?.message})}\n\n`);
        res.end();
      }
    }
  });

  // Extract text
  app.post("/api/extract-raw-text",upload.single("file"),async(req,res)=>{
    try{
      if(!req.file) return res.status(400).json({error:"No file"});
      const {originalname,buffer,mimetype}=req.file;
      const ln=originalname.toLowerCase(),lm=(mimetype||'').toLowerCase();
      let t="";
      if(ln.endsWith('.pdf')||lm==='application/pdf'){
        const {PDFParse}=await import('pdf-parse');
        const u=new Uint8Array(buffer.buffer,buffer.byteOffset,buffer.byteLength);
        const r=await new PDFParse(u).getText();
        t=r.text||'';
      }else if(ln.endsWith('.docx')){
        const mm=await import('mammoth');
        const r=await (mm.default||mm).extractRawText({buffer});
        t=r.value||'';
      }else if(ln.endsWith('.txt')){
        t=buffer.toString('utf-8');
      }else{return res.status(400).json({error:"Unsupported format. Use PDF, DOCX, or TXT."});}

      if(!t?.trim()) return res.status(400).json({error:"No text extracted"});
      const c=cleanText(t);

      // Year detection
      let yr='';const ym=c.match(/(\d{4})\s*年\s*(\d{1,2})\s*月/);
      if(ym) yr=`${ym[1]}年${ym[2]}月`;
      else{const fm=c.match(/(\d{4})[-.](\d{1,2})/);if(fm)yr=`${fm[1]}年${fm[2]}月`;}
      if(!yr){const nf=originalname.match(/(\d{4})[年-](\d{1,2})/);if(nf)yr=`${nf[1]}年${nf[2]}月`;}

      // Detect exam type
      const detectedExamType = detectExamType(c);
      const examTypeLabel = detectedExamType === 'cet4' ? '四级' : detectedExamType === 'cet6' ? '六级' : detectedExamType;

      console.log(`[Extract] ${originalname}: ${t.length}→${c.length} chars, year:${yr}, exam:${detectedExamType}`);
      res.json({text:c,detectedYear:yr,examType:examTypeLabel,detectedExamType});
    }catch(e:any){res.status(500).json({error:"Extraction failed",details:e?.message});}
  });

  // Verify/repair text
  app.post("/api/verify-text",async(req,res)=>{
    try{
      const {text,apiKey}=req.body;
      if(!apiKey||!text) return res.status(400).json({error:"API Key required"});
      const o=new OpenAI({baseURL:'https://api.deepseek.com',apiKey});
      const c=await (o.chat.completions.create as any)({
        model:'deepseek-v4-flash',max_tokens:16000,
        messages:[{role:"system",content:"Fix OCR errors. Fix split words, missing spaces. CRITICAL: output ENTIRE text. Do NOT summarize."},{role:"user",content:text.substring(0,25000)}],
        thinking:{type:'disabled'},
      });
      const fixed=c.choices[0].message.content||text;
      console.log(`[Verify] ${text.length}→${fixed.length} chars`);
      res.json({text:fixed.length>text.length*0.5?fixed:text});
    }catch(e:any){res.json({text:req.body.text});}
  });

  // Parse exam
  app.post("/api/parse-exam",async(req,res)=>{
    const log:string[]=[];
    try{
      const {text,apiKey,model,examType}=req.body;
      if(!apiKey||!text) return res.status(400).json({error:"API Key required"});
      log.push(`text:${text.length} chars, examType:${examType||'cet6'}`);
      const o=new OpenAI({baseURL:'https://api.deepseek.com',apiKey});
      const m=model||'deepseek-v4-pro';

      // Strategy: select parser by examType
      const parser=getParser(examType||'cet6');
      const sections=parser.extractSections(text);
      log.push(`sections:${sections.length}(${sections.map(s=>s.type+'@'+s.text.length).join(',')})`);
      if(!sections.length) return res.status(400).json({error:"No exam sections found",_log:log});

      // Truncate text at a sentence boundary to avoid cutting mid-question
      function smartTruncate(text:string, limit:number): string {
        if(text.length<=limit) return text;
        // Try to cut at last sentence-ending punctuation before limit
        const slice=text.substring(0,limit);
        const lastPunct=Math.max(slice.lastIndexOf('.\n'),slice.lastIndexOf('?\n'),slice.lastIndexOf('!\n'),slice.lastIndexOf('. '),slice.lastIndexOf('? '),slice.lastIndexOf('! '));
        return lastPunct>limit*0.7 ? text.substring(0,lastPunct+1) : slice;
      }

      // Parse all sections in parallel for speed
      const settled = await Promise.allSettled(sections.map(async (sec) => {
        log.push(`parse ${sec.type}...`);
        const prompt=parser.buildPrompt(sec);
        for(let attempt=0;attempt<2;attempt++){
          try{
            const charLimit=attempt===0?12000:8000;
            const c=await (o.chat.completions.create as any)({
              model:m,
              messages:[{role:"system",content:prompt},{role:"user",content:smartTruncate(sec.text,charLimit)}],
              response_format:{type:"json_object"},
              thinking:{type:'disabled'}
            });
            const raw=c.choices[0].message.content||'{}';
            const parsed=extractJson(raw);
            log.push(`  ${sec.type} attempt${attempt+1}: keys=${Object.keys(parsed).join(',')} Qs=${(parsed.questions||[]).length}`);
            if(parsed && Object.keys(parsed).length>1){
              parsed.section=parsed.section||sec.type;
              parsed.title=sec.title;
              if(sec.wordBank&&!parsed.wordBank) parsed.wordBank=sec.wordBank;
              if(sec.sourceText&&!parsed.sourceText) parsed.sourceText=sec.sourceText;
              parsed.paragraphs=parsed.paragraphs||[];
              parsed.questions=parsed.questions||[];
              parsed.id=parsed.id||`sec-${Date.now()}-${Math.random().toString(36).substring(7)}`;
              return parsed;
            }
          }catch(e:any){log.push(`  ${sec.type} attempt${attempt+1} FAILED:${(e as Error).message}`);await new Promise(r=>setTimeout(r,1000));}
        }
        return null;
      }));

      // Collect results in original section order
      const results:any[]=[];
      settled.forEach((r,i)=>{
        if(r.status==='fulfilled'&&r.value){results.push(r.value);log.push(`  ${sections[i].type} ADDED`);}
        else{log.push(`  ${sections[i].type} SKIPPED`);}
      });
      log.push(`done:${results.length} passages`);
      console.log('[Parse]',log.join(' | '));
      res.json({passages:results,_log:log});
    }catch(e:any){res.status(500).json({error:"Parse failed",details:e?.message});}
  });

  // Parse vocab
  app.post("/api/parse-vocab-chunk",async(req,res)=>{
    try{
      const {text,apiKey,model}=req.body;
      if(!apiKey||!text) return res.status(400).json({error:"API Key required"});
      const o=new OpenAI({baseURL:'https://api.deepseek.com',apiKey});
      const prompt=`Extract all English words with complete dictionary info. Output {"words":[{...}]}. Each word: id, word, definition, phoneticUK, phoneticUS, definitions:[{pos,meaning}], examples:[{en,zh}], synonyms:[], phrases:[{phrase,meaning}], mnemonic. Extract ALL fields present in text. No markdown.`;
      const c=await (o.chat.completions.create as any)({model:model||'deepseek-v4-pro',messages:[{role:"system",content:prompt},{role:"user",content:text.substring(0,6000)}],response_format:{type:"json_object"},thinking:{type:'disabled'}});
      let raw=c.choices[0].message.content||'{"words":[]}';
      raw=raw.trim().replace(/^```json\s*\n?/i,'').replace(/\n?```\s*$/,'');
      let words:any[]=[];
      try{const p=JSON.parse(raw);words=p.words||p;if(!Array.isArray(words)) words=Object.values(p).find(v=>Array.isArray(v))||[words];}catch{words=[];}
      res.json({words:words.filter((w:any)=>w.word).map((w:any)=>({id:w.id||`w-${Date.now()}`,word:w.word,definition:w.definition||'',phoneticUK:w.phoneticUK,phoneticUS:w.phoneticUS,definitions:w.definitions,examples:w.examples,synonyms:w.synonyms,phrases:w.phrases,mnemonic:w.mnemonic}))});
    }catch(e:any){res.status(500).json({error:"Vocab parse failed",details:e?.message});}
  });

  // Word lookup
  app.post("/api/word-examples",async(req,res)=>{
    try{
      const {word,sentence,apiKey}=req.body;
      if(!apiKey||!word) return res.status(400).json({error:"API Key required"});
      const o=new OpenAI({baseURL:'https://api.deepseek.com',apiKey});
      const prompt=`Output this exact JSON structure for the word. The "derivatives" array is MANDATORY — never omit it. Find noun/verb/adjective/adverb forms of the word.
{"word":"infer","definition":"推断;推论","phoneticUK":"/ɪnˈfɜːr/","phoneticUS":"/ɪnˈfɜr/","definitions":[{"pos":"vt","meaning":"推断"},{"pos":"vi","meaning":"推论"}],"examples":["From the evidence we can infer his guilt. —— 从证据中可以推断他有罪。"],"synonyms":["deduce","conclude"],"phrases":[{"phrase":"infer from","meaning":"从…推断"}],"mnemonic":"","derivatives":[{"word":"inference","pos":"n","meaning":"推理;推论"},{"word":"inferential","pos":"adj","meaning":"推论的"}]}`;
      const c=await (o.chat.completions.create as any)({model:'deepseek-v4-pro',messages:[{role:"system",content:prompt},{role:"user",content:sentence?`Word:"${word}" Context:"${sentence}"`:`Word:"${word}"`}],response_format:{type:"json_object"},thinking:{type:'disabled'}});
      let raw=c.choices[0].message.content||'{}';
      raw=raw.trim().replace(/^```json\s*\n?/i,'').replace(/\n?```\s*$/,'');
      const p=JSON.parse(raw);

      // If AI didn't return derivatives, make a dedicated call
      let derivatives=p.derivatives||[];
      if(derivatives.length===0){
        try{
          const dPrompt=`List ALL derivative/related word forms of the base word. Output JSON: {"derivatives":[{"word":"word","pos":"n/v/adj/adv","meaning":"Chinese meaning"}]}. Include nouns, verbs, adjectives, adverbs.`;
          const dc=await (o.chat.completions.create as any)({model:'deepseek-v4-pro',messages:[{role:"system",content:dPrompt},{role:"user",content:word}],response_format:{type:"json_object"},thinking:{type:'disabled'}});
          let draw=dc.choices[0].message.content||'{"derivatives":[]}';
          draw=draw.trim().replace(/^```json\s*\n?/i,'').replace(/\n?```\s*$/,'');
          const dp=JSON.parse(draw);
          if(dp.derivatives) derivatives=dp.derivatives;
        }catch{}
      }

      res.json({word,definition:p.definition||'',phoneticUK:p.phoneticUK,phoneticUS:p.phoneticUS,definitions:p.definitions,examples:p.examples||[],synonyms:p.synonyms,phrases:p.phrases,mnemonic:p.mnemonic,derivatives});
    }catch(e:any){res.status(500).json({error:"Lookup failed",details:e?.message});}
  });

  app.post("/api/phrase-examples",async(req,res)=>{
    try{
      const {phrase,sentence,definition,category,apiKey}=req.body;
      if(!apiKey||!phrase) return res.status(400).json({error:"API Key required"});
      const o=new OpenAI({baseURL:'https://api.deepseek.com',apiKey});
      const prompt=`Explain an English phrase for intensive reading. Output ONLY JSON:
{"phrase":"base phrase","definition":"Chinese meaning and usage summary","category":"verb_phrase/preposition_collocation/fixed_noun_phrase/pure_prepositional_phrase","definitions":[{"pos":"category","meaning":"usage point in Chinese"}],"examples":["English example —— Chinese translation","English example —— Chinese translation"],"synonyms":["near expression"],"phrases":[{"phrase":"related phrase","meaning":"Chinese meaning"}],"mnemonic":"short memory note"}.
Requirements:
- Explain the whole phrase, not individual words.
- If the text uses an inflected phrase, show the base phrase in "phrase".
- Include 2 CET-style examples and explain usage in Chinese.
- Keep the answer concise but useful.`;
      const user=sentence?`Phrase:"${phrase}"\nCategory:"${category||''}"\nExisting meaning:"${definition||''}"\nContext:"${sentence}"`:`Phrase:"${phrase}"\nCategory:"${category||''}"\nExisting meaning:"${definition||''}"`;
      const c=await (o.chat.completions.create as any)({model:'deepseek-v4-flash',messages:[{role:"system",content:prompt},{role:"user",content:user}],response_format:{type:"json_object"},thinking:{type:'disabled'}});
      let raw=c.choices[0].message.content||'{}';
      raw=raw.trim().replace(/^```json\s*\n?/i,'').replace(/\n?```\s*$/,'');
      const p=JSON.parse(raw);
      res.json({word:p.phrase||phrase,definition:p.definition||definition||'',definitions:p.definitions||[{pos:p.category||category||'phrase',meaning:p.definition||definition||''}],examples:p.examples||[],synonyms:p.synonyms||[],phrases:p.phrases||[],mnemonic:p.mnemonic||'',category:p.category||category||''});
    }catch(e:any){res.status(500).json({error:"Phrase lookup failed",details:e?.message});}
  });

  app.post("/api/word-grammar",async(req,res)=>{
    try{
      const {word,sentence,apiKey}=req.body;
      if(!apiKey||!word||!sentence) return res.status(400).json({error:"API Key, word, and sentence required"});
      const o=new OpenAI({baseURL:'https://api.deepseek.com',apiKey});
      const prompt=`Analyze why the clicked English word has this exact form in the sentence. Output ONLY JSON:
{"surfaceForm":"clicked form","baseForm":"dictionary/base form","partOfSpeech":"part of speech here","sentenceRole":"subject/object/predicate/complement/modifier/etc in Chinese","grammarReason":"why this exact form is required here in Chinese","morphology":"tense/number/person/voice/degree/gerund/participle/etc in Chinese","structure":"brief sentence-structure explanation in Chinese","replacementWarning":"what would be wrong if changed to base or another form, in Chinese"}.
Rules:
- This is contextual grammar analysis, not dictionary definition.
- Focus on word form: plural, tense, participle, gerund, comparative, third-person singular, possessive, derivational form, etc.
- If the word is already base form, explain why the base form is required in this position.
- Keep it concise and suitable for CET intensive reading.`;
      const c=await (o.chat.completions.create as any)({model:'deepseek-v4-flash',messages:[{role:"system",content:prompt},{role:"user",content:`Word: "${word}"\nSentence: "${sentence}"`}],response_format:{type:"json_object"},thinking:{type:'disabled'}});
      let raw=c.choices[0].message.content||'{}';
      raw=raw.trim().replace(/^```json\s*\n?/i,'').replace(/\n?```\s*$/,'');
      res.json(JSON.parse(raw));
    }catch(e:any){res.status(500).json({error:"Grammar lookup failed",details:e?.message});}
  });

  // Phrase scan — chunked approach for better coverage
  function escapePhraseRegex(value:string){
    return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  }

  function findExactPhrase(text:string, phrase:string){
    const words=String(phrase||'').trim().split(/\s+/).filter(Boolean);
    if(words.length<2||words.length>7) return null;
    const re=new RegExp(words.map(escapePhraseRegex).join('\\s+'),'gi');
    let m:RegExpExecArray|null;
    while((m=re.exec(text))!==null){
      const start=m.index,end=start+m[0].length;
      const before=start>0?text[start-1]:'';
      const after=end<text.length?text[end]:'';
      if(/[A-Za-z]/.test(before)||/[A-Za-z]/.test(after)) continue;
      return {phrase:m[0].replace(/\s+/g,' '),startIdx:start,endIdx:end};
    }
    return null;
  }

  function normalizePhraseCategory(category:string, phrase:string){
    const c=String(category||'').toLowerCase().replace(/[\s-]+/g,'_');
    if(['verb_phrase','phrasal_verb','verb_collocation'].includes(c)) return 'verb_phrase';
    if(['preposition_collocation','prep_collocation','prepositional_collocation'].includes(c)) return 'preposition_collocation';
    if(['fixed_noun_phrase','noun_phrase','noun_collocation'].includes(c)) return 'fixed_noun_phrase';
    if(['pure_prepositional_phrase','prepositional_phrase'].includes(c)) return 'pure_prepositional_phrase';
    const words=phrase.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const preps=['of','for','to','with','from','in','on','at','by','into','about','over','under','against','among','between','through'];
    if(preps.includes(words[0])) return 'pure_prepositional_phrase';
    if(words.some(w=>preps.includes(w))) return 'preposition_collocation';
    return 'fixed_noun_phrase';
  }

  function phraseQuality(phrase:string, category:string=''){
    const p=phrase.toLowerCase().trim();
    const words=p.split(/\s+/).filter(Boolean);
    if(words.length<2||words.length>7) return false;
    if(words.some(w=>w.length<2)) return false;
    if(/^\d/.test(p)) return false;
    const normalizedCategory=normalizePhraseCategory(category,p);
    const weak=new Set(['the','a','an','this','that','these','those','every','each','some','many','much','most','more','less']);
    const preps=['of','for','to','with','from','in','on','at','by','into','about','over','under','against','among','between','through'];
    if(weak.has(words[0])&&words.length<3) return false;
    if(words.length===2&&preps.includes(words[0])&&weak.has(words[1])) return false;
    if(normalizedCategory==='pure_prepositional_phrase') return preps.includes(words[0])&&words.length<=5;
    if(normalizedCategory==='fixed_noun_phrase') return !preps.includes(words[0])&&words.length<=5;
    if(normalizedCategory==='verb_phrase') return true;
    if(words.length===2&&preps.includes(words[1])){
      const verbish=new Set(['infer','derive','result','benefit','differ','suffer','stem','lead','refer','relate','contribute','adapt','respond','appeal','apply','amount','object','subscribe','resort','adhere','account','depend','rely','focus','base','cope','deal','consist','insist']);
      const adjish=new Set(['aware','capable','dependent','different','responsible','relevant','similar','subject','vulnerable','essential','critical','beneficial']);
      const ingish=new Set(['according','depending','concerning','regarding','leading','resulting','belonging','relating','contributing','stemming','dealing','coping','focusing']);
      if(!verbish.has(words[0])&&!adjish.has(words[0])&&!ingish.has(words[0])&&!/ed$/.test(words[0])) return false;
    }
    const hasUsefulMarker=words.some(w=>preps.includes(w)) || words.some(w=>/ing$|ed$|tion$|ment$|ity$|ive$|ous$|al$|able$|ible$/.test(w));
    return hasUsefulMarker;
  }

  // Phrase scan: AI proposes candidates, server validates exact contiguous spans.
  app.post("/api/scan-phrases", async(req,res)=>{
    try{
      const {text,apiKey}=req.body;
      if(!apiKey||!text) return res.status(400).json({error:"API Key and text required"});
      const o=new OpenAI({baseURL:'https://api.deepseek.com',apiKey});
      const prompt=`You are extracting vocabulary-book style English phrases from CET reading text.
Return ONLY JSON: {"phrases":[{"phrase":"exact contiguous words copied from the text","baseForm":"dictionary/base form","category":"verb_phrase | preposition_collocation | fixed_noun_phrase | pure_prepositional_phrase","definition":"Chinese meaning","reason":"why this is useful"}]}.
Rules:
- Do NOT force a count. Fewer correct phrases are better than many weak phrases.
- Prefer a balanced set: verb phrases/phrasal verbs, verb+preposition or adjective+preposition collocations, fixed noun expressions, and pure prepositional phrases.
- Good examples: "result from", "take into account", "focus on", "associated with", "in terms of", "at risk", "public health", "social media".
- The phrase must appear as contiguous words in the supplied text. Do not combine words from different parts of a sentence.
- Do not output isolated single words, random noun chunks, full clauses, names, question text, or phrases longer than 7 words.
- If the text uses an inflected form, "phrase" must copy the inflected text exactly and "baseForm" should be the dictionary form.`;

      const chunkSize=1500,overlap=100;
      const chunks:string[]=[];
      let i=0;
      while(i<text.length){
        chunks.push(text.substring(i,i+chunkSize));
        if(i+chunkSize>=text.length) break;
        i+=chunkSize-overlap;
      }

      const allPhrases:any[]=[];
      const seen=new Set<string>();
      for(const chunk of chunks){
        try{
          const c=await (o.chat.completions.create as any)({model:'deepseek-v4-flash',messages:[{role:"system",content:prompt},{role:"user",content:chunk}],response_format:{type:"json_object"},thinking:{type:'disabled'}});
          let raw=c.choices[0].message.content||'{"phrases":[]}';raw=raw.trim().replace(/^```json\s*\n?/i,'').replace(/\n?```\s*$/,'');
          let phrases:any[]=[];try{const p=JSON.parse(raw);phrases=p.phrases||[];}catch{phrases=[];}
          for(const p of phrases){
            if(!p.phrase) continue;
            const hit=findExactPhrase(text,p.phrase);
            if(!hit) continue;
            const category=normalizePhraseCategory(p.category||p.reason||'',hit.phrase);
            if(!phraseQuality(hit.phrase,category)) continue;
            const key=hit.phrase.toLowerCase();
            if(seen.has(key)) continue;
            seen.add(key);
            allPhrases.push({phrase:hit.phrase,baseForm:p.baseForm||hit.phrase,category,definition:p.definition||'',reason:p.reason||'',startIdx:hit.startIdx,endIdx:hit.endIdx});
          }
        }catch{}
      }

      const colors=['rgba(255,235,59,0.35)','rgba(0,200,83,0.25)','rgba(33,150,243,0.2)','rgba(233,30,99,0.22)','rgba(156,39,176,0.2)','rgba(255,152,0,0.25)','rgba(0,188,212,0.2)','rgba(76,175,80,0.2)'];
      const result=allPhrases.map((p:any,i:number)=>({...p,color:colors[i%colors.length]}));
      res.json({phrases:result});
    }catch(e:any){res.status(500).json({error:"Phrase scan failed",details:e?.message});}
  });

  // Parse reading (pure reading mode — no AI, just segmentation)
  app.post("/api/parse-reading", async(req,res)=>{
    try{
      const {text}=req.body;
      if(!text) return res.status(400).json({error:"Text required"});
      const cleaned=cleanText(text);
      const paragraphs=segmentParagraphs(cleaned);
      const passage={id:`reading-${Date.now()}`,title:'精读文章',section:'reading',paragraphs,questions:[]};
      res.json({passages:[passage]});
    }catch(e:any){res.status(500).json({error:"Reading parse failed",details:e?.message});}
  });

  // Vite
  if(process.env.NODE_ENV!=="production"){
    const vite=await createViteServer({server:{middlewareMode:true},appType:"spa"});
    app.use(vite.middlewares);
  }else{const dp=path.join(process.cwd(),'dist');app.use(express.static(dp));app.get('*',(_,r)=>r.sendFile(path.join(dp,'index.html')));}

  app.use((err:any,req:any,res:any,_next:any)=>{
    console.error(err);
    if(req.path.startsWith('/api')) res.status(500).json({error:err.message});
    else _next(err);
  });

  app.listen(PORT,"0.0.0.0",()=>console.log(`[Server] http://localhost:${PORT}`));
}
startServer();
