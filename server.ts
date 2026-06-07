import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import OpenAI from "openai";
import multer from "multer";

// ═══ Text Cleaner ═══
function cleanPdfText(raw: string): string {
  let t = raw;
  t = t.replace(/\t/g, ' ');
  t = t.replace(/[ ]{2,}/g, ' ');
  t = t.replace(/Ⅰ/g,'I').replace(/Ⅱ/g,'II').replace(/Ⅲ/g,'III').replace(/Ⅳ/g,'IV');
  t = t.replace(/([一-鿿㐀-䶿])\s+([一-鿿㐀-䶿])/g,'$1$2');
  t = t.replace(/([一-鿿])\s+([，。！？；：、（）《》【】])/g,'$1$2');
  let p=''; while(p!==t){p=t;t=t.replace(/(\d)\s+(\d)/g,'$1$2');}
  t = t.replace(/([a-zA-Z])\s+([,.!?;:])/g,'$1$2');
  t = t.replace(/Directions:([A-Z])/g,'Directions: $1');
  t = t.replace(/([a-z]):([A-Z])/g,'$1: $2');
  t = t.replace(/\n{3,}/g,'\n\n');
  t = t.replace(/·\s*\d{4}年\d{1,2}月[^·\n]*·\s*/g,'\n');
  t = t.replace(/\d+\s*·\s*\d{4}年\d{1,2}月[^\n]*/g,'');
  t = t.replace(/pastpapers\.cn\s*/g,'');
  t = t.replace(/--\s*\d+\s+of\s+\d+\s*--/g,'');
  return t.trim();
}

// ═══ Sentence Segmenter ═══
function segmentSentences(c: string): string {
  let l=c.split('\n'),m:string[]=[];
  for(let i=0;i<l.length;i++){
    let ln=l[i].trim();if(!ln){m.push('');continue}
    if(m.length>0&&m[m.length-1]!==''){
      let pv=m[m.length-1],pe=pv.slice(-1),cs=ln.charAt(0);
      if(!'.!?'.includes(pe)||(cs===cs.toLowerCase()&&/[a-z]/.test(cs))){m[m.length-1]=pv+' '+ln;continue}
    }
    m.push(ln);
  }
  let t=m.join('\n'),ps=t.split(/\n\n+/),r:string[]=[];
  for(let pa of ps){let tr=pa.trim();if(!tr){r.push('');continue}
    let ss=tr.replace(/([.!?])\s+(?=[A-Z"'(])/g,'$1\n').split('\n').map(s=>s.trim()).filter(s=>s.length>0);
    r.push(...ss,'');
  }
  return r.join('\n').replace(/\n{3,}/g,'\n\n').trim();
}

// ═══ Section Extraction ═══
interface SectionExtract { type: string; title: string; text: string; wordBank?: string[]; sourceText?: string; }

function extractSections(t: string): SectionExtract[] {
  const S: SectionExtract[] = [];

  // Boundaries
  const readingIdx = t.search(/Reading\s*Comprehension/i);
  const listeningIdx = t.search(/Listening\s*Comprehension/i);
  const translationIdx = t.indexOf('Translation', Math.max(readingIdx,0)+50);

  // ── Writing (Part I: before Listening) ──
  const writingIdx = t.search(/Writing|Part\s*I\s/);
  if (writingIdx >= 0 && listeningIdx > writingIdx) {
    const wt = t.substring(writingIdx, listeningIdx > 0 ? listeningIdx : (readingIdx > 0 ? readingIdx : t.length));
    if (wt.length > 100) S.push({ type: 'writing' as any, title: 'Part I — 写作', text: wt.substring(0, 2000) });
  }

  // ── Listening (3 sections) ──
  if (listeningIdx > 0) {
    const end = readingIdx > listeningIdx ? readingIdx : t.length;
    const lt = t.substring(listeningIdx, end);
    // Use simple regex loop (more reliable than matchAll spread)
    const lSecs: { name: string; idx: number }[] = [];
    let lm: RegExpExecArray | null;
    const lre = /Section\s+[A-C]/gi;
    while ((lm = lre.exec(lt)) !== null) {
      lSecs.push({ name: lm[0], idx: lm.index });
    }
    for (let i = 0; i < lSecs.length; i++) {
      const s = lSecs[i].idx;
      const e = i + 1 < lSecs.length ? lSecs[i + 1].idx : lt.length;
      const txt = lt.substring(s, e);
      if (txt.length > 100) {
        const nm = lSecs[i].name.toUpperCase();
        const title = nm.includes('A') ? 'Section A — 长对话' :
                      nm.includes('B') ? 'Section B — 听力篇章' :
                      'Section C — 听力篇章';
        S.push({ type: 'listening' as any, title, text: txt });
      }
    }
    if (lSecs.length === 0 && lt.length > 200) S.push({ type: 'listening' as any, title: '听力理解', text: lt });
  }

  // ── Reading + Translation ──
  if (readingIdx >= 0) {
    const end = translationIdx>readingIdx?translationIdx:t.length;
    const rt = t.substring(readingIdx,end);
    const rs = [...rt.matchAll(/Section\s+[A-C]/gi)].sort((a,b)=>a.index!-b.index!);

    for(let i=0;i<rs.length;i++){
      const s=rs[i].index!,e=i+1<rs.length?rs[i+1].index!:rt.length;
      const txt=rt.substring(s,e); if(txt.length<80) continue;
      const up=rs[i][0].toUpperCase();

      if(up.includes('SECTION A')){
        const wb:string[]=[];
        const bs=txt.substring(Math.floor(txt.length*0.6));
        (bs.match(/[A-O]\)\s*(\w[\w-]*\w)/g)||[]).forEach(m=>{const w=m.replace(/^[A-O]\)\s*/,'').trim();if(w.length>=2&&!wb.includes(w))wb.push(w)});
        S.push({type:'banked-cloze',title:'Section A — 选词填空',text:txt,wordBank:wb.slice(0,20)});
      }else if(up.includes('SECTION B')){
        S.push({type:'long-reading-match',title:'Section B — 长篇阅读匹配',text:txt});
      }else if(up.includes('SECTION C')){
        const p1=rt.indexOf('Passage One',s),p2=rt.indexOf('Passage Two',s);
        if(p2>0&&p2>p1){S.push({type:'careful-reading',title:'Passage One — 仔细阅读',text:rt.substring(p1,p2)});S.push({type:'careful-reading',title:'Passage Two — 仔细阅读',text:rt.substring(p2)});}
        else if(p1>0){S.push({type:'careful-reading',title:'Passage One — 仔细阅读',text:rt.substring(p1)});}
        else{S.push({type:'careful-reading',title:'仔细阅读',text:txt});}
      }
    }

    // Translation
    if(translationIdx>0){const tt=t.substring(translationIdx);const ch=tt.match(/[一-鿿][一-鿿\s，。！？、；：""''（）《》\n]{30,}/);S.push({type:'translation',title:'Part IV — 翻译',text:tt.substring(0,1000),sourceText:ch?ch[0].trim():tt.substring(0,300)});}
  }

  if(readingIdx<0){if(t.length>500)S.push({type:'careful-reading',title:'Reading',text:t});}
  return S.filter(s=>s.text.length>80);
}

// ═══ AI Prompts ═══
function buildPrompt(s: SectionExtract): string {
  switch(s.type){
    case 'banked-cloze': return `Extract this banked-cloze section. Output ONLY JSON, no markdown. Extract 15 word bank words (A-O) and 10 blank questions (26-35). Each Q gets 4 letter options. Format: {"title":"选词填空","section":"banked-cloze","wordBank":["w1","w2",...],"paragraphs":[{"id":"p1","sentences":["s1.","s2."]}],"questions":[{"id":"q26","number":26,"questionType":"banked-cloze","content":"Select word for blank 26","options":[{"key":"A","text":"word"},{"key":"B","text":"word"},{"key":"C","text":"word"},{"key":"D","text":"word"}],"correctAnswer":"A","answerExplanation":"Chinese reason"}]} You MUST output exactly 10 questions (q26-q35), each with exactly 4 options.`;
    case 'long-reading-match': return `Extract this long-reading matching section. Output ONLY JSON. Passage has [A][B] labeled paragraphs. 10 statements (36-45) each match one paragraph. CRITICAL: output ALL 10 questions. Format: {"title":"长篇阅读","section":"long-reading-match","paragraphs":[{"id":"p1","sentences":["text"]}],"questions":[{"id":"q36","number":36,"questionType":"long-reading-match","content":"statement text","matchParagraph":"D","correctAnswer":"D","options":[],"answerExplanation":"Chinese reason"}]} Must include q36 through q45.`;
    case 'careful-reading': return `Extract this reading passage. Output ONLY JSON. Find and include EVERY numbered question (46-50 or 51-55 depending on passage). Include the passage text AND questions. Format: {"title":"仔细阅读","section":"careful-reading","paragraphs":[{"id":"p1","sentences":["s1."]}],"questions":[{"id":"q46","number":46,"questionType":"careful-reading","content":"question text","options":[{"key":"A","text":"choice"}],"correctAnswer":"A","answerExplanation":"Chinese reason"}]} You MUST include all 5 questions with their complete text and 4 options each.`;
    case 'listening': return `Extract ALL multiple-choice questions from this listening section. Output ONLY valid JSON array of questions. Each question has: id, number (must match original numbering), questionType:"listening", content (the full question stem), options (array of {key,text} for A/B/C/D), correctAnswer (the correct letter), answerExplanation (Chinese). Format: {"title":"听力","section":"listening","paragraphs":[],"questions":[{"id":"q1","number":1,"questionType":"listening","content":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctAnswer":"A","answerExplanation":"解释"}]} IMPORTANT: count the questions carefully. Extract EVERY numbered question from the text.`;
    case 'writing': return `Extract this CET-6 writing prompt. Output ONLY JSON. Format: {"title":"写作","section":"writing","paragraphs":[{"id":"p1","sentences":["essay prompt"]}],"questions":[{"id":"q1","number":1,"questionType":"writing","content":"Write an essay based on the prompt","options":[],"correctAnswer":"","answerExplanation":"Sample outline and key vocabulary in Chinese"}]}`;
    case 'translation': return `Extract Chinese-English translation. Output ONLY JSON. Format: {"title":"翻译","section":"translation","sourceText":"Chinese text","wordBank":["keyword"],"paragraphs":[],"questions":[{"id":"q1","number":1,"questionType":"translation","content":"Translate to English","options":[],"correctAnswer":"","answerExplanation":"key vocabulary hints"}]}`;
    default: return '';
  }
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
      const c=await o.chat.completions.create(llmParams(messages,model,isThinking,false));
      res.json(c.choices[0].message);
    }catch(e:any){res.status(500).json({error:"Chat failed",details:e?.message});}
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
      let c=cleanPdfText(t);
      c=segmentSentences(c);

      // Year detection
      let yr='';const ym=c.match(/(\d{4})\s*年\s*(\d{1,2})\s*月/);
      if(ym) yr=`${ym[1]}年${ym[2]}月`;
      else{const fm=c.match(/(\d{4})[-.](\d{1,2})/);if(fm)yr=`${fm[1]}年${fm[2]}月`;}
      if(!yr){const nf=originalname.match(/(\d{4})[年-](\d{1,2})/);if(nf)yr=`${nf[1]}年${nf[2]}月`;}
      const is4=/CET-?4|四级/i.test(c),is6=/CET-?6|六级/i.test(c);

      console.log(`[Extract] ${originalname}: ${t.length}→${c.length} chars, year:${yr}`);
      res.json({text:c,detectedYear:yr,examType:is4?'四级':is6?'六级':''});
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
      const {text,apiKey,model}=req.body;
      if(!apiKey||!text) return res.status(400).json({error:"API Key required"});
      log.push(`text:${text.length} chars`);
      const o=new OpenAI({baseURL:'https://api.deepseek.com',apiKey});
      const m=model||'deepseek-v4-pro';
      const sections=extractSections(text);
      log.push(`sections:${sections.length}(${sections.map(s=>s.type+'@'+s.text.length).join(',')})`);
      if(!sections.length) return res.status(400).json({error:"No exam sections found",_log:log});

      const results:any[]=[];
      for(const sec of sections){
        log.push(`parse ${sec.type}...`);
        let parsed:any=null;
        for(let attempt=0;attempt<2;attempt++){
          try{
            const prompt=buildPrompt(sec);
            const c=await (o.chat.completions.create as any)({model:m,messages:[{role:"system",content:prompt},{role:"user",content:sec.text.substring(0,attempt===0?12000:8000)}],response_format:{type:"json_object"},thinking:{type:'disabled'}});
            const raw=c.choices[0].message.content||'{}';
            parsed=extractJson(raw);
            log.push(`  attempt${attempt+1}: keys=${Object.keys(parsed).join(',')} Qs=${(parsed.questions||[]).length}`);
            if(parsed && Object.keys(parsed).length>1) break; // Accept if AI returned anything beyond empty {}
          }catch(e:any){log.push(`  attempt${attempt+1} FAILED:${e.message}`);await new Promise(r=>setTimeout(r,1000));}
        }
        if(parsed){
          parsed.section=parsed.section||sec.type;parsed.title=sec.title; // Always use extractor's title for uniqueness
          if(sec.wordBank&&!parsed.wordBank) parsed.wordBank=sec.wordBank;
          if(sec.sourceText&&!parsed.sourceText) parsed.sourceText=sec.sourceText;
          parsed.paragraphs=parsed.paragraphs||[];parsed.questions=parsed.questions||[];
          parsed.id=parsed.id||`sec-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          results.push(parsed);log.push(`  ADDED`);
        }else{log.push(`  SKIPPED`);}
      }
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
      const prompt=`CET-4/6 vocab expert. Output JSON. CRITICAL: definition and meanings MUST be in Chinese. phonetics in standard format. Two CET-level example sentences with Chinese translations. Format: {"word":"","definition":"中文释义","phoneticUK":"UK[xxx]","phoneticUS":"US[xxx]","definitions":[{"pos":"词性","meaning":"中文词义"}],"examples":["English sentence —— 中文翻译"],"synonyms":["近义词"],"phrases":[{"phrase":"短语","meaning":"中文含义"}],"mnemonic":"中文记忆法"} ALL explanation fields in Chinese, only examples have English sentences with Chinese translation after ——. No markdown.`;
      const c=await (o.chat.completions.create as any)({model:'deepseek-v4-flash',messages:[{role:"system",content:prompt},{role:"user",content:sentence?`Word:"${word}" Context:"${sentence}"`:`Word:"${word}"`}],response_format:{type:"json_object"},thinking:{type:'disabled'}});
      let raw=c.choices[0].message.content||'{}';
      raw=raw.trim().replace(/^```json\s*\n?/i,'').replace(/\n?```\s*$/,'');
      const p=JSON.parse(raw);
      res.json({word,definition:p.definition||'',phoneticUK:p.phoneticUK,phoneticUS:p.phoneticUS,definitions:p.definitions,examples:p.examples||[],synonyms:p.synonyms,phrases:p.phrases,mnemonic:p.mnemonic});
    }catch(e:any){res.status(500).json({error:"Lookup failed",details:e?.message});}
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
