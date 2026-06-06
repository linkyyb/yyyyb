# 六级程序 版本变更日志

## v1.1.0 — 2026-06-07 — 题型分类 + 交互重构 + 解析架构重写

### 🔧 彻底重写：PDF 解析架构

**问题根因链：**
1. PDF 每字符间插入空格/Tab → 需要文本清理
2. Unicode 罗马数字 (ⅠⅡⅢⅣ) 导致 Part 号混淆 → 改用关键词定位
3. AI 收到听力/写作无关内容 → 精准过滤只保留 Reading + Translation
4. 通用 prompt 无法区分题型 → 每个 Section 独立 prompt

**新架构：**
```
PDF → cleanPdfText() → extractSections() → per-section AI prompts
        ↓                    ↓                      ↓
   去空格/Unicode      按关键词定位          banked-cloze → 词库+填空 prompt
   合并多余空格        跳过Writing+Listening   long-reading → 段落匹配 prompt
   规范化换行          提取Translation         careful-reading → 选择题 prompt
                                              translation → 翻译 prompt
```

**实测结果（2025-12-CET6-1.pdf）：**
- ✅ Section A 选词填空: 10题 + 15词库
- ✅ Section B 长篇匹配: 10题 + 段落标注
- ✅ Section C Passage 1: 5题 + 选项答案
- ✅ Section C Passage 2: 5题 + 选项答案
- ✅ Translation 翻译: 1题 + 12个参考词

### 🆕 新增：用户自主答题

- 点击选项即选中（蓝色高亮 + 圆环填充）
- 选好后点"核对答案"→ 绿色正确 / 红色错误 + 正确答案
- 查看答案后点"AI 深度讲解" → 发送完整题目+选项+答案到聊天面板
- 不同题型（选词填空/长篇匹配/仔细阅读）统一交互逻辑

### 🆕 新增：单词悬浮弹窗

- 点句子中单词 → 弹出 300px 小卡片（自动避让窗口边界）
- 优先显示词汇本已有释义（无 API 调用）
- AI 生成 2 个六级例句（deepseek-v4-flash 快速端点）
- 📥 加入词汇本 / 💬 深度提问
- ESC / 点击外部关闭

### 🆕 新增：AI 聊天消息自动折叠

- 系统自动发送的长 prompt 折叠为一行摘要
- 蓝色虚线边框 + 📨 图标区分手动消息
- 点击"展开"才显示完整内容

### 🆕 新增：学习痛点追踪

- 记录单词查询频次、题型提问分布、完成题目
- 数据持久化到 localStorage `cet6_pain_points`

### 🔧 优化

- 并发数从 10 → 100
- 试卷解析从分块改为 Section 级单次请求
- 侧边栏按题型分组（📝📑📖🌐）

### 📁 文件变更

| 文件 | 变更 |
|------|------|
| `server.ts` | 完全重写 — cleanPdfText + extractSections + per-section AI prompts |
| `src/types.ts` | 新增 QuestionType、PainRecord、WordPopupData 等 |
| `src/components/MainViewer.tsx` | 重写 — 四种题型独立渲染 + 用户答题交互 |
| `src/components/WordPopup.tsx` | **新建** — 单词悬浮弹窗 |
| `src/components/ChatPanel.tsx` | 自动消息折叠 |
| `src/components/AppSidebar.tsx` | 题型分组导航 + 完成计数 |
| `src/store/TaskStore.ts` | 并发100 + 试卷单次解析 |
| `src/App.tsx` | 弹窗状态、痛点追踪、完整数据流 |

---

## v1.0.1 — 2026-06-06 — Bug 修复版

- 修复 pdf-parse v2 API 兼容性
- 修复文件扩展名大小写
- 修复 DeepSeek thinking + json_object 冲突
- 修复 TaskStore 错误处理

---

## v1.0.0 — 原始版本

- 初始版本，基本功能框架
