'use client';
import { useState, useRef, useEffect, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock } from 'lucide-react';
import type { ZiweiChart, Palace } from '@/lib/ziwei/types';
import type { TimeView } from './TimeNav';
import { readSseData } from '@/lib/ai/read-sse';

export interface InsightMessage {
  role: 'user' | 'assistant';
  content: string;
  hidden?: boolean; // don't show user bubble for auto/topic messages
}

interface SelectedSiHua {
  starName: string;
  siHua: string;
  view: TimeView;
}

interface InsightPanelProps {
  chart: ZiweiChart;
  selectedPalace?: Palace | null;
  selectedSiHua?: SelectedSiHua | null;
  unlocked?: boolean;
  onUnlockRequest?: () => void;
  threads?: Record<string, InsightMessage[]>;
  onThreadsChange?: Dispatch<SetStateAction<Record<string, InsightMessage[]>>>;
  sidebarSlot?: ReactNode;
}

const TOPICS = [
  { key: 'overview',    label: '命格总览', short: '命格' },
  { key: 'love',        label: '感情婚姻', short: '感情' },
  { key: 'career',      label: '事业官禄', short: '事业' },
  { key: 'wealth',      label: '财帛田宅', short: '财运' },
  { key: 'health',      label: '疾厄养生', short: '健康' },
  { key: 'personality', label: '性格课题', short: '性格' },
] as const;

const TOPIC_PROMPTS: Record<string, string> = {
  overview: `请生成精炼命格总览（每节严格控制在 2–3 句话、80–120 字，直击要点不啰嗦），按以下结构输出：

**【命格定性】**
用 1–2 句话概括核心格局与命主气质。

**【主星解读】**
命宫主星的核心特质，点出倪海厦《天纪》核心观点。

**【三方四正】**
财、官、迁三宫的联动判断与整体格局。

**【当前大限】**
当下大限运势走向与最值得关注的事项。

**【优势与注意】**
命盘天赋优势与需要留意的功课。`,

  love: `请精炼分析感情婚姻运（每节严格控制在 2–3 句话、80–120 字，直击要点），按以下结构输出：

**【感情格局】**
1–2 句话定性感情命格。

**【夫妻宫分析】**
夫妻宫主星、四化及伴侣特质。

**【当前大限感情运】**
当下 10 年感情走向与关键节点。

**【实际建议】**
具体可行的相处建议。`,

  career: `请精炼分析事业运（每节严格控制在 2–3 句话、80–120 字，直击要点），按以下结构输出：

**【事业格局】**
1–2 句话定性事业命格，宜任职或宜创业。

**【官禄宫与财帛联动】**
官禄宫主星、四化及财路来源。

**【当前大限事业运】**
当下 10 年事业走向与发力窗口。

**【实际建议】**
适合的方向、行业与策略。`,

  wealth: `请精炼分析财运（每节严格控制在 2–3 句话、80–120 字，直击要点），按以下结构输出：

**【财运格局】**
1–2 句话定性主动财或被动财模式。

**【财帛与田宅（财库）】**
财帛宫主星、四化与积蓄置业能力。

**【当前大限财运】**
当下财运走向与财务注意事项。

**【理财建议】**
具体的财务进退建议。`,

  health: `请精炼分析健康运势（每节严格控制在 2–3 句话、80–120 字，直击要点），按以下结构输出：

**【疾厄宫主星】**
疾厄宫星曜与体质倾向。

**【主要风险】**
结合倪海厦子午流注理论，点明需关注的脏腑与隐患。

**【大限健康走势】**
当下健康趋势与关键时间段。

**【预防建议】**
日常作息与调养方向。`,

  personality: `请精炼解析性格特质（每节严格控制在 2–3 句话、80–120 字，直击要点），按以下结构输出：

**【命宫主星性格】**
命宫主星的核心性格特质。

**【三方性格综合】**
财、官、迁三宫对处世风格的影响。

**【优势与人生课题】**
天赋优势与需要面对的决策盲点。`,
};

const PALACE_ROLES: Record<string, string> = {
  '命宫':   '自我、性格、先天格局',
  '兄弟宫': '兄弟关系、合伙人',
  '夫妻宫': '感情关系、婚姻状态',
  '子女宫': '子女缘分、下属关系',
  '财帛宫': '财运来源、收入方式',
  '疾厄宫': '身体健康、意外',
  '迁移宫': '外出机遇、人际格局',
  '交友宫': '朋友圈、贵人、小人',
  '官禄宫': '事业成就、社会地位',
  '田宅宫': '不动产、家庭环境',
  '福德宫': '精神享受、内心福分',
  '父母宫': '父母关系、文书契约',
};

const LOCKED_TOPIC_DESCRIPTIONS: Record<string, { title: string; points: string[] }> = {
  love: {
    title: '感情婚姻深论（完整报告第三章）',
    points: ['夫妻宫主星与四化引动分析', '伴侣特质、相处课题与桃花节点', '当前大限感情走势与避坑建议'],
  },
  career: {
    title: '事业官禄深论（完整报告第二章）',
    points: ['官禄宫配置与宜任职/创业判断', '财官迁三方联动与适合赛道', '当前十年大限事业发力窗口'],
  },
  wealth: {
    title: '财帛田宅深论（完整报告第二章）',
    points: ['主动求财与被动积蓄模式定调', '财库（田宅宫）守财与置业运势', '化禄/化忌年份财务进退提醒'],
  },
  health: {
    title: '疾厄养生推演（完整报告附篇）',
    points: ['疾厄宫星曜对应脏腑与体质倾向', '大限流年需重点留意的健康节点', '日常作息与调养方向建议'],
  },
  personality: {
    title: '三方性格全貌（完整报告第一章）',
    points: ['命身与福德三方交织的深层性格', '人际互动与合作分工优势', '人生功课与决策盲点提示'],
  },
};

/** 仅保留前两节（定性 + 主星/落宫解读），余下章节截断为付费解锁预览 */
function splitFreeAndLocked(text: string): {
  freeText: string;
  lockedTitles: string[];
  lockedPreview: string;
} {
  const lines = text.split('\n');
  const sectionPattern = /^\*\*【(.+?)】\*\*$/;
  let sectionCount = 0;
  let cutoffIndex = lines.length;
  const lockedTitles: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(sectionPattern);
    if (match) {
      sectionCount += 1;
      if (sectionCount === 3 && cutoffIndex === lines.length) {
        cutoffIndex = i;
      }
      if (sectionCount >= 3) {
        lockedTitles.push(match[1]);
      }
    }
  }

  const freeText = lines.slice(0, cutoffIndex).join('\n').trimEnd();
  const lockedBodyLines = lines
    .slice(cutoffIndex)
    .filter(l => l.trim() !== '' && !sectionPattern.test(l));
  const lockedPreview = lockedBodyLines.slice(0, 2).join(' ').slice(0, 88);

  return { freeText, lockedTitles, lockedPreview };
}

const QUICK_QUESTIONS: Record<string, readonly string[]> = {
  overview: ['今年流年重点？', '适合外出发展吗？', '贵人多在何处？'],
  love: ['感情关键年份？', '相处最忌讳什么？', '另一半特质？'],
  career: ['今年适合换工作吗？', '宜任职还是创业？', '事业发力方向？'],
  wealth: ['正财还是偏财旺？', '如何守住财库？', '破财需防何年？'],
  health: ['最需留意的部位？', '日常调养重点？', '大限健康提醒？'],
  personality: ['决策盲点在哪？', '适合什么样的搭档？', '如何发挥天赋？'],
};

interface ParsedSection {
  title: string;
  body: string;
}

function parseSections(text: string): { sections: ParsedSection[]; preamble: string } {
  const lines = text.split('\n');
  const sectionPattern = /^\*\*【(.+?)】\*\*$/;
  const sections: ParsedSection[] = [];
  const preambleLines: string[] = [];
  let current: { title: string; lines: string[] } | null = null;

  for (const line of lines) {
    const match = line.match(sectionPattern);
    if (match) {
      if (current) {
        sections.push({ title: current.title, body: current.lines.join('\n').trim() });
      }
      current = { title: match[1], lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else {
      preambleLines.push(line);
    }
  }
  if (current) {
    sections.push({ title: current.title, body: current.lines.join('\n').trim() });
  }
  return { sections, preamble: preambleLines.join('\n').trim() };
}

function InlineBoldText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        if (line.trim() === '') return null;
        const parts = line.split(/\*\*(.+?)\*\*/);
        return (
          <p key={i} className="text-[14px] leading-[1.95] text-[var(--zw-ink)]">
            {parts.map((part, j) =>
              j % 2 === 0
                ? part
                : <strong key={j} className="font-semibold text-[var(--zw-ink)]">{part}</strong>
            )}
          </p>
        );
      })}
    </div>
  );
}

function CommentaryContent({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const { sections, preamble } = parseSections(text);
  if (sections.length === 0) {
    return <InlineBoldText text={text} />;
  }
  return (
    <div className="space-y-5">
      {preamble && <InlineBoldText text={preamble} />}
      {sections.map((sec, idx) => {
        if (idx === 0) {
          return (
            <div key={sec.title} className="border-l-2 border-[var(--zw-accent)] bg-[var(--zw-accent-soft)]/75 px-4 py-3.5">
              <div className="font-serif text-xs font-bold tracking-[0.14em] text-[var(--zw-accent)] mb-1.5">
                {sec.title}
              </div>
              <InlineBoldText text={sec.body || (streaming ? '推演中…' : '')} />
            </div>
          );
        }
        return (
          <div key={sec.title} className={idx > 1 ? 'border-t border-dashed border-[var(--zw-line)] pt-5' : 'pt-1'}>
            <h4 className="font-serif text-[16px] font-extrabold tracking-wide text-[var(--zw-ink)] mb-2">
              {sec.title}
            </h4>
            <InlineBoldText text={sec.body || (streaming ? '推演中…' : '')} />
          </div>
        );
      })}
    </div>
  );
}

export default function InsightPanel({
  chart,
  selectedPalace,
  selectedSiHua,
  unlocked = false,
  onUnlockRequest,
  threads: controlledThreads,
  onThreadsChange,
  sidebarSlot,
}: InsightPanelProps) {
  const [internalThreads, setInternalThreads] = useState<Record<string, InsightMessage[]>>({});
  const threads = controlledThreads ?? internalThreads;
  const setThreads = onThreadsChange ?? setInternalThreads;
  const [activeKey, setActiveKey] = useState<string>('overview');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [activeTopic, setActiveTopic] = useState<string>('overview');
  // 随请求一起发出去的维度：点按钮时锁定该维度，自由追问时置空由服务端按关键词判断
  const topicRef = useRef<string | undefined>('overview');
  const threadsRef = useRef<Record<string, InsightMessage[]>>(threads);
  const activeKeyRef = useRef<string>('overview');
  const abortRef = useRef<AbortController | null>(null);
  const autoLoaded = useRef(false);
  const lastPalaceBranch = useRef<number | undefined>(undefined);
  const lastSiHuaKey = useRef<string | undefined>(undefined);

  useEffect(() => { threadsRef.current = threads; }, [threads]);
  useEffect(() => { activeKeyRef.current = activeKey; }, [activeKey]);

  const messages = threads[activeKey] ?? [];

  // Auto-generate 命格总览 on mount (React StrictMode safe)
  useEffect(() => {
    if (selectedPalace || selectedSiHua) return;
    if (threadsRef.current.overview?.some(m => m.role === 'assistant')) return;
    autoLoaded.current = true;
    sendMessage('overview', TOPIC_PROMPTS.overview, true, true);
    return () => {
      abortRef.current?.abort();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Inject palace analysis when palace selected
  useEffect(() => {
    if (!selectedPalace || selectedSiHua || selectedPalace.branch === lastPalaceBranch.current) return;
    lastPalaceBranch.current = selectedPalace.branch;
    autoLoaded.current = true;
    topicRef.current = undefined;
    const key = `palace-${selectedPalace.branch}`;
    setActiveTopic('overview');
    setActiveKey(key);
    if (threadsRef.current[key]?.some(m => m.role === 'assistant')) return;

    const majorStars = selectedPalace.stars.filter(s => s.type === 'major');
    const starDesc = majorStars.length > 0
      ? majorStars.map(s => `${s.name}${s.siHua ? '化' + s.siHua : ''}`).join('、')
      : '空宫（借对宫）';
    const role = PALACE_ROLES[selectedPalace.name] ?? '';

    const prompt = `请精炼分析【${selectedPalace.name}】（主管：${role}），该宫主星为${starDesc}（每节 2–3 句话、80–120 字），按以下结构输出：

**【宫位定性】**
${selectedPalace.name}在命盘中的意义及整体判断。

**【主星解读】**
主星在此宫的倪海厦体系解读。

**【三方四正联动】**
三方四正宫位对此宫的影响。

**【实际建议】**
基于此宫的具体建议。`;

    sendMessage(key, prompt, true, true);
  }, [selectedPalace, selectedSiHua]); // eslint-disable-line react-hooks/exhaustive-deps

  // 注入四化飞化分析
  useEffect(() => {
    if (!selectedSiHua) return;
    const key = `${selectedSiHua.starName}-${selectedSiHua.siHua}-${selectedSiHua.view}`;
    if (key === lastSiHuaKey.current) return;
    lastSiHuaKey.current = key;
    autoLoaded.current = true;
    topicRef.current = undefined;
    const threadKey = `sihua-${key}`;
    setActiveTopic('overview');
    setActiveKey(threadKey);
    if (threadsRef.current[threadKey]?.some(m => m.role === 'assistant')) return;

    const palaceOfStar = chart.palaces.find(p =>
      p.stars.some(s => s.name === selectedSiHua.starName)
    );
    const palaceName = palaceOfStar?.name ?? '未知宫位';
    const viewLabel = selectedSiHua.view === 'daxian' ? '大限' : '流年';

    const prompt = `请精炼分析【${viewLabel}${selectedSiHua.starName}化${selectedSiHua.siHua}】的飞化影响（每节 2–3 句话、80–120 字），按以下结构输出：

**【化${selectedSiHua.siHua}基本含义】**
${selectedSiHua.starName}化${selectedSiHua.siHua}在倪海厦体系中的核心含义。

**【落宫影响】**
落于【${palaceName}】对该领域的影响。

**【三方四正飞化路径】**
对三方四正的联动影响。

**【实际建议】**
具体可操作建议。`;

    sendMessage(threadKey, prompt, true, true);
  }, [selectedSiHua]); // eslint-disable-line react-hooks/exhaustive-deps

  const streamResponse = async (threadKey: string, apiMessages: { role: 'user' | 'assistant'; content: string }[]) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStreamError(null);

    let assistantText = '';
    try {
      const res = await fetch('/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chart, messages: apiMessages, topic: topicRef.current, preview: !unlocked }),
        signal: controller.signal,
      });
      if (res.status === 404) throw new Error('api-missing');
      if (!res.ok) throw new Error('请求失败');
      if (!res.body) throw new Error('无响应流');

      let complete = false;

      for await (const data of readSseData(res.body)) {
        if (controller.signal.aborted) return;
        if (data === '[DONE]') {
          complete = true;
          break;
        }
        const delta = JSON.parse(data)?.delta?.text;
        if (typeof delta !== 'string' || !delta) continue;
        const wasEmpty = !assistantText;
        assistantText += delta;
        const message: InsightMessage = { role: 'assistant', content: assistantText };
        setThreads(prev => {
          const list = prev[threadKey] ?? [];
          return {
            ...prev,
            [threadKey]: [...(wasEmpty ? list : list.slice(0, -1)), message],
          };
        });
      }
      if (!complete || !assistantText.trim()) throw new Error('推演未完成');
    } catch (e) {
      if (controller.signal.aborted) {
        // 清理未完成的半截回复，确保下次切回时干净重新生成
        setThreads(prev => {
          const list = prev[threadKey] ?? [];
          if (list.length === 1 && list[0].hidden) {
            const copy = { ...prev };
            delete copy[threadKey];
            return copy;
          }
          return prev;
        });
        return;
      }
      const missing = e instanceof Error && e.message === 'api-missing';
      setStreamError(missing ? '命书批注暂未开放，你仍可查看命盘。' : '批注推演中断，请重试。');
      if (!assistantText) {
        setThreads(prev => {
          const copy = { ...prev };
          if ((copy[threadKey] ?? []).every(m => m.hidden)) delete copy[threadKey];
          return copy;
        });
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  };

  const sendMessage = (threadKey: string, text: string, hidden = false, replace = false) => {
    if (!text.trim()) return;
    setLoading(true);
    setStreamError(null);

    const userMsg: InsightMessage = { role: 'user', content: text, hidden };
    const existing = replace ? [] : (threadsRef.current[threadKey] ?? []);
    const nextList = [...existing, userMsg];
    const apiMessages = nextList.map(m => ({ role: m.role, content: m.content }));

    setThreads(prev => ({ ...prev, [threadKey]: nextList }));
    setInput('');
    void streamResponse(threadKey, apiMessages);
  };

  const handleTopicClick = (topicKey: string) => {
    setStreamError(null);
    setActiveTopic(topicKey);
    setActiveKey(topicKey);
    if (!unlocked && topicKey !== 'overview') {
      abortRef.current?.abort();
      setLoading(false);
      return;
    }
    if (threadsRef.current[topicKey]?.some(m => m.role === 'assistant')) {
      abortRef.current?.abort();
      setLoading(false);
      return;
    }
    topicRef.current = topicKey;
    sendMessage(topicKey, TOPIC_PROMPTS[topicKey], true, true);
  };

  const handleSend = (overrideText?: string) => {
    const query = (overrideText ?? input).trim();
    if (!unlocked || !query) return;
    topicRef.current = undefined;
    sendMessage(activeKeyRef.current, query, false, false);
  };

  const lockedTopicInfo = !unlocked && activeTopic !== 'overview' ? LOCKED_TOPIC_DESCRIPTIONS[activeTopic] : undefined;
  const activeTopicLabel = TOPICS.find(t => t.key === activeTopic)?.label ?? '命格总览';
  const quickQuestions = QUICK_QUESTIONS[activeTopic] ?? QUICK_QUESTIONS.overview;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)] gap-8 lg:gap-12 items-start">

      {/* ── Left Column: Book TOC + Colophon Hook ── */}
      <div className="min-w-0 lg:sticky lg:top-6 space-y-5">
        <div>
          <h2 className="font-serif text-2xl font-extrabold tracking-wide text-[var(--zw-ink)]">
            命书批注
          </h2>
          <p className="mt-1 text-xs text-[var(--zw-muted)] leading-relaxed">
            {unlocked ? '已解锁全六章专题详批与实时追问' : '主星试读免费开放，余下深论解锁后可阅'}
          </p>
        </div>

        {/* Vertical TOC on desktop, clean horizontal wrap on mobile */}
        <nav aria-label="命书专题目录" className="flex flex-wrap lg:flex-col gap-1.5 lg:gap-0 lg:border-t lg:border-[var(--zw-line)]">
          {TOPICS.map((t, idx) => {
            const isActive = activeTopic === t.key;
            const isLocked = !unlocked && t.key !== 'overview';
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => handleTopicClick(t.key)}
                className={`inline-flex items-center justify-between gap-2 px-3 py-2 lg:px-3 lg:py-2.5 text-left text-xs transition-colors lg:w-full lg:border-b lg:border-[var(--zw-line)] ${
                  isActive
                    ? 'border-l-2 border-[var(--zw-accent)] bg-[var(--zw-accent-soft)]/70 font-bold text-[var(--zw-accent)]'
                    : 'border border-[var(--zw-line)] lg:border-x-0 lg:border-t-0 lg:border-l-2 lg:border-l-transparent text-[var(--zw-muted)] hover:text-[var(--zw-ink)] hover:bg-[var(--zw-soft)]/50'
                }`}
              >
                <span className="inline-flex items-baseline gap-2">
                  <span className="hidden lg:inline text-[11px] tabular-nums opacity-60">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <span className="lg:hidden">{t.short}</span>
                  <span className="hidden lg:inline">{t.label}</span>
                </span>
                {isLocked && <Lock className="w-3 h-3 opacity-60 shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
        </nav>

        {sidebarSlot && <div className="pt-1">{sidebarSlot}</div>}
      </div>

      {/* ── Right Column: Open Book Reading Pane (No Box-in-Box Clutter) ── */}
      <div className="min-w-0 max-w-[68ch] space-y-6">
        {lockedTopicInfo ? (
          <div className="border-t border-[var(--zw-line)] pt-5 space-y-4">
            <h3 className="font-serif text-xl font-extrabold text-[var(--zw-ink)]">
              {lockedTopicInfo.title}
            </h3>
            <ul className="space-y-2 text-sm text-[var(--zw-muted)] leading-relaxed">
              {lockedTopicInfo.points.map(point => (
                <li key={point} className="flex items-baseline gap-2.5">
                  <span className="text-[var(--zw-accent)] font-bold">·</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            {onUnlockRequest && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onUnlockRequest}
                  className="inline-flex items-center justify-center min-h-[42px] bg-[var(--zw-button)] text-white px-6 text-xs font-bold tracking-[0.14em] rounded-[2px] hover:brightness-110 transition-all"
                >
                  解锁完整命盘详批 · US$6.99
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {messages.length === 0 && !streamError && (
              <div className="py-12 text-sm text-[var(--zw-muted)]">
                {loading ? `正在推演${activeTopicLabel}…` : '点选左侧目录开始阅读'}
              </div>
            )}

            {streamError && (
              <div role="alert" className="border-l-2 border-[var(--zw-accent)] bg-[var(--zw-soft)] px-4 py-3 flex items-center justify-between gap-4">
                <span className="text-xs text-[var(--zw-muted)]">{streamError}</span>
                <button
                  type="button"
                  onClick={() => handleTopicClick(activeTopic)}
                  className="shrink-0 border border-[var(--zw-ink)] bg-[var(--zw-panel)] px-3.5 py-1.5 text-xs font-bold text-[var(--zw-ink)] rounded-[2px] hover:border-[var(--zw-accent)] hover:text-[var(--zw-accent)]"
                >
                  重试
                </button>
              </div>
            )}

            <AnimatePresence initial={false}>
              {messages.map((msg, i) => {
                if (msg.role === 'user' && msg.hidden) return null;

                if (msg.role === 'user') {
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-end pt-2"
                    >
                      <div className="max-w-[85%] border-r-2 border-[var(--zw-accent)] bg-[var(--zw-accent-soft)]/70 px-4 py-2.5 text-sm text-[var(--zw-ink)]">
                        {msg.content}
                      </div>
                    </motion.div>
                  );
                }

                const { freeText, lockedTitles, lockedPreview } = splitFreeAndLocked(msg.content);
                const visibleText = unlocked ? msg.content : freeText || msg.content;
                const isLastAssistant = i === messages.length - 1;

                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <div className="flex items-center justify-between border-b border-[var(--zw-line)] pb-2 text-xs tracking-[0.14em] text-[var(--zw-muted)]">
                      <span>{unlocked ? `天纪断语 · ${activeTopicLabel}` : `天纪断语 · ${activeTopicLabel}（主星试读）`}</span>
                      {loading && isLastAssistant && <span className="text-[var(--zw-accent)]">推演中…</span>}
                    </div>
                    <CommentaryContent text={visibleText} streaming={loading && isLastAssistant} />

                    {!unlocked && (!loading || lockedTitles.length > 0) && (
                      <div className="mt-6 border-t border-dashed border-[var(--zw-line)] pt-5 space-y-3">
                        <div className="font-serif text-sm font-bold text-[var(--zw-accent)]">
                          余下深度推演已折叠（{lockedTitles.length > 0 ? lockedTitles.join('、') : '三方四正、当前大限、优势与注意'}）
                        </div>
                        <p className="select-none text-sm leading-relaxed text-[var(--zw-muted)] blur-[3.5px]" aria-hidden="true">
                          {lockedPreview || '完整报告将结合财官迁三方四正、当前大限飞星与流年干支，逐条点明发力领域与避坑节点。'}
                        </p>
                        {onUnlockRequest && (
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={onUnlockRequest}
                              className="inline-flex items-center justify-center min-h-[40px] bg-[var(--zw-button)] text-white px-5 text-xs font-bold tracking-[0.14em] rounded-[2px] hover:brightness-110 transition-all"
                            >
                              解锁余下章节 · US$6.99
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </>
        )}

        {/* ── Follow-up Bar ── */}
        {unlocked ? (
          <div className="border-t border-[var(--zw-line)] pt-5 space-y-3">
            <div className="flex flex-wrap gap-2">
              {quickQuestions.map(q => (
                <button
                  key={q}
                  type="button"
                  disabled={loading}
                  onClick={() => handleSend(q)}
                  className="border border-[var(--zw-line)] bg-[var(--zw-panel)] px-3 py-1.5 text-xs text-[var(--zw-muted)] rounded-[2px] hover:border-[var(--zw-accent)] hover:text-[var(--zw-ink)] transition-colors disabled:opacity-40"
                >
                  {q}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder="针对本盘继续追问，如：今年适合换工作吗？"
                disabled={loading}
                className="flex-1 border border-[var(--zw-line)] bg-[var(--zw-input)] px-3.5 py-2 text-sm text-[var(--zw-ink)] placeholder:text-[var(--zw-muted)] rounded-[2px] focus:border-[var(--zw-ink)] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={loading || !input.trim()}
                className="px-5 py-2 bg-[var(--zw-button)] text-white text-xs font-bold tracking-[0.12em] rounded-[2px] hover:brightness-110 disabled:bg-[var(--zw-soft)] disabled:text-[var(--zw-muted)] disabled:cursor-not-allowed transition-all"
              >
                {loading ? '…' : '追问'}
              </button>
            </div>
          </div>
        ) : (
          <div className="border-t border-[var(--zw-line)] pt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-[var(--zw-muted)]">
              解锁完整命盘详批后，可享 2 次针对本盘的专属追问
            </span>
            {onUnlockRequest && (
              <button
                type="button"
                onClick={onUnlockRequest}
                className="shrink-0 border border-[var(--zw-ink)] bg-[var(--zw-panel)] px-4 py-1.5 text-xs font-bold text-[var(--zw-ink)] rounded-[2px] hover:border-[var(--zw-accent)] hover:text-[var(--zw-accent)] transition-colors"
              >
                解锁追问
              </button>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
