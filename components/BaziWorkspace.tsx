'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import BirthForm, { type BirthFormState } from '@/components/BirthForm';
import ReportHook from '@/components/ReportHook';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { generateBaziChart } from '@/lib/bazi/engine';
import type { BaziChart, Wuxing } from '@/lib/bazi/types';
import { readSseData } from '@/lib/ai/read-sse';
import { SHICHEN } from '@/lib/ziwei/constants';
import { branchFromSolarMinutes, formatSignedMinutes, resolveZiweiDayOffset } from '@/lib/ziwei/true-solar-time';
import type { BirthInfo } from '@/lib/ziwei/types';
import styles from './ZiweiSite.module.css';

const pad2 = (n: number) => String(n).padStart(2, '0');

function formatLongitude(lon: number) {
  return `${lon >= 0 ? '东经' : '西经'} ${Math.abs(lon).toFixed(2)}°`;
}

function buildBaziCalibration(
  form: BirthFormState | undefined,
  chart: BaziChart,
  example: boolean,
): string[] {
  const birth = chart.birthInfo;
  const chartDate = `${birth.year}-${pad2(birth.month)}-${pad2(birth.day)}`;
  if (example || !form) {
    return [`示例 · 公历 ${chartDate} ${SHICHEN[birth.hour]?.name ?? ''}`, '未作经度校正', chart.solarTermsHint];
  }

  const calendarLabel = form.calendar === 'lunar' ? '农历' : '公历';
  const inputDate = `${calendarLabel} ${form.year}-${pad2(Number(form.month))}-${pad2(Number(form.day))}`;
  const offset = form.utcOffsetMinutes ?? 480;
  const tzLabel = offset === 480 ? '' : ` · UTC${offset >= 0 ? '+' : '−'}${Math.abs(offset) / 60}`;
  const place = form.city || form.province;
  const lon = Number.isFinite(form.longitude) ? form.longitude : 120;
  const lonLabel = `${place ? `${place} ` : ''}${formatLongitude(lon)}${place ? '' : '（默认）'}${tzLabel}`;

  if (form.unknownTime) {
    return [`输入 ${inputDate} · 时辰不详`, lonLabel, `按${SHICHEN[birth.hour]?.name ?? '子时'}参考排盘`, chart.solarTermsHint];
  }

  const clockMinutes = Number(form.clockHour) * 60 + Number(form.clockMinute);
  const correction = (lon - offset / 4) * 4;
  const raw = clockMinutes + correction;
  const dayOffset = Math.floor(raw / 1440);
  const normalized = raw - dayOffset * 1440;
  const branch = branchFromSolarMinutes(normalized);
  const shift = resolveZiweiDayOffset({ dayOffset, normalizedMinutes: normalized, branch });
  const solarClock = `${pad2(Math.floor(normalized / 60))}:${pad2(Math.floor(normalized % 60))}`;

  const items = [
    `输入 ${inputDate} ${pad2(Number(form.clockHour))}:${pad2(Number(form.clockMinute))}`,
    lonLabel,
    `真太阳时 ${solarClock}（经度 ${formatSignedMinutes(correction)} 分）→ ${SHICHEN[birth.hour]?.name ?? ''}`,
  ];
  if (shift !== 0) items.push(`${branch === 0 && normalized >= 1380 ? '晚子时换日' : '跨日'} · 排盘日 ${chartDate}`);
  items.push(chart.solarTermsHint);
  return items;
}

const exampleBazi = generateBaziChart({
  year: 1990,
  month: 6,
  day: 15,
  hour: 6,
  gender: 'female',
});

const PILLAR_MEANINGS: Record<string, string> = {
  '年柱': '根基宫 · 祖上福荫、早年运势（1–16岁）与先天环境',
  '月柱': '提纲宫 · 父母兄弟、青年运势（17–32岁）与社会格局',
  '日柱': '日主与夫妻宫 · 日干为己身，日支为配偶宫与中年运势（33–48岁）',
  '时柱': '归宿宫 · 子女晚辈、晚年运势（49岁后）与最终成就',
};

const WUXING_TEXT_COLOR: Record<Wuxing, string> = {
  '木': 'text-emerald-800 dark:text-emerald-300',
  '火': 'text-rose-800 dark:text-rose-300',
  '土': 'text-amber-900 dark:text-amber-300',
  '金': 'text-yellow-800 dark:text-yellow-200',
  '水': 'text-sky-800 dark:text-sky-300',
};

const BAZI_TOPICS = [
  {
    key: 'overview',
    label: '命局总断',
    prompt: '请结合《穷通宝鉴》调候、《子平真诠》格局与《三命通会》日柱断语，对本命局做全面总断，按 **【格局高低】** **【用神取舍】** **【性格禀赋】** **【一生大势】** 四个小标题输出。',
  },
  {
    key: 'career',
    label: '事业功名',
    prompt: '请深度分析本命局的事业与功名运势，结合月令格局、官杀印星及喜用五行，按 **【事业定性】** **【适合行业】** **【贵人与隐患】** **【发展策略】** 输出。',
  },
  {
    key: 'wealth',
    label: '财运层次',
    prompt: '请深度分析本命局的财运层次与求财模式，结合财星旺衰、食伤生财或财库刑冲情况，按 **【财运格局】** **【得财方式】** **【守财与风险】** **【理财建议】** 输出。',
  },
  {
    key: 'love',
    label: '婚姻感情',
    prompt: '请结合日支（夫妻宫）所坐十神、藏干、刑冲合会及配偶星状态，深度分析婚姻感情，按 **【夫妻宫象义】** **【伴侣特质】** **【感情相处】** **【婚恋建议】** 输出。',
  },
  {
    key: 'dayun',
    label: '大运流年',
    prompt: '请结合命盘当前所行大运及前后大运走势，分析干支对原局的引动与冲合，按 **【当前大运吉凶】** **【近三年流年关键点】** **【下一大运展望】** **【进退建议】** 输出。',
  },
  {
    key: 'health',
    label: '健康调候',
    prompt: '请根据原局五行偏枯、寒暖燥湿及《穷通宝鉴》调候用神，分析体质与养生重点，按 **【五行体质】** **【脏腑留意点】** **【日常调候养生】** 输出。',
  },
] as const;

function RenderMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-2 text-[13px] leading-relaxed text-[var(--zw-ink)]">
      {lines.map((line, i) => {
        const sec = line.match(/^\*\*【(.+?)】\*\*$/);
        if (sec) {
          return (
            <div key={i} className="pt-3 pb-0.5 font-serif text-sm font-bold text-[var(--zw-accent)]">
              【{sec[1]}】
            </div>
          );
        }
        if (!line.trim()) return <div key={i} className="h-1" />;
        const parts = line.split(/\*\*(.+?)\*\*/);
        return (
          <p key={i} className="text-[var(--zw-muted)] leading-relaxed">
            {parts.map((part, j) =>
              j % 2 === 0 ? (
                part
              ) : (
                <strong key={j} className="font-semibold text-[var(--zw-ink)]">
                  {part}
                </strong>
              ),
            )}
          </p>
        );
      })}
    </div>
  );
}

export default function BaziWorkspace() {
  const [result, setResult] = useState<{ chart: BaziChart; example: boolean } | null>(null);
  const [draft, setDraft] = useState<BirthFormState>();
  const [selectedPillarIdx, setSelectedPillarIdx] = useState<number>(2);
  const [selectedDaYunIdx, setSelectedDaYunIdx] = useState<number>(0);
  const [asideTab, setAsideTab] = useState<'classics' | 'wuxing' | 'ai'>('classics');
  const [previewPillarIdx, setPreviewPillarIdx] = useState<number>(2);
  const [devUnlocked, setDevUnlocked] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    try {
      setDevUnlocked(localStorage.getItem('ziwei:dev:unlocked:bazi') === '1');
    } catch { /* ignore */ }
  }, []);

  function toggleDevUnlock() {
    const next = !devUnlocked;
    setDevUnlocked(next);
    try {
      if (next) localStorage.setItem('ziwei:dev:unlocked:bazi', '1');
      else localStorage.removeItem('ziwei:dev:unlocked:bazi');
    } catch { /* ignore */ }
  }

  const [aiText, setAiText] = useState<string>('');
  const [aiStreaming, setAiStreaming] = useState(false);
  const [activeTopic, setActiveTopic] = useState<string>('');
  const [question, setQuestion] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const conversation = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);

  const heading = useRef<HTMLHeadingElement>(null);
  const formHeading = useRef<HTMLHeadingElement>(null);
  const editing = useRef(false);

  useEffect(() => {
    if (result) heading.current?.focus();
    else if (editing.current) formHeading.current?.focus();
  }, [result]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function resetReading() {
    abortRef.current?.abort();
    abortRef.current = null;
    conversation.current = [];
    setAiText('');
    setAiStreaming(false);
    setActiveTopic('');
    setQuestion('');
  }

  function openChart(chart: BaziChart, example = false) {
    resetReading();
    setSelectedPillarIdx(2);
    setSelectedDaYunIdx(chart.currentDaYunIndex);
    setAsideTab('classics');
    setResult({ chart, example });
  }

  async function askAi(chart: BaziChart, promptText: string, topicKey: string) {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setActiveTopic(topicKey);
    setAiStreaming(true);
    setAiText('');
    setAsideTab('ai');
    if (topicKey !== 'custom') conversation.current = [];
    const messages = [...conversation.current, { role: 'user' as const, content: promptText }];
    const { year, month, day, hour, gender } = chart.birthInfo;

    try {
      const res = await fetch('/api/bazi/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          birth: { year, month, day, hour, gender },
          unknownTime: !result?.example && Boolean(draft?.unknownTime),
          messages,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(typeof data?.error === 'string' ? data.error : '八字详解暂时不可用，请稍后重试。');
      }
      if (!res.body) throw new Error('八字详解暂时不可用，请稍后重试。');
      let acc = '';
      let complete = false;

      for await (const payload of readSseData(res.body)) {
        if (abortRef.current !== ctrl) return;
        if (payload === '[DONE]') {
          complete = true;
          break;
        }
        const event = JSON.parse(payload);
        if (typeof event?.error === 'string') throw new Error(event.error);
        const delta = event?.delta?.text;
        if (typeof delta === 'string' && delta) {
          acc += delta;
          setAiText(acc);
        }
      }
      if (!complete || !acc.trim()) throw new Error('八字详解未生成完成，请重试。');
      if (abortRef.current === ctrl) {
        conversation.current = [...messages, { role: 'assistant' as const, content: acc.slice(0, 8000) }].slice(-6);
      }
    } catch (err) {
      if (abortRef.current === ctrl && !ctrl.signal.aborted) {
        setAiText(err instanceof Error && /^八字|^请提供|^无法/.test(err.message) ? err.message : '网络或模型连接中断，请稍后重试。');
      }
    } finally {
      if (abortRef.current === ctrl) {
        abortRef.current = null;
        setAiStreaming(false);
      }
    }
  }

  if (result) {
    const { chart, example } = result;
    const birth = chart.birthInfo;
    const wx = chart.wuxing;
    const refs = chart.classicalRefs;
    const activeDaYun = chart.daYuns[selectedDaYunIdx] ?? chart.daYuns[0];
    const calibration = buildBaziCalibration(draft, chart, example);

    return (
      <motion.section
        id="bazi-paipan"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className={styles.result}
      >
        <div className={styles.resultHeader}>
          <div>
            <h1 ref={heading} tabIndex={-1}>
              {example ? '示例八字命造' : birth.name ? `${birth.name}的八字命造` : '四柱八字命造'}
            </h1>
            <p>
              {birth.gender === 'male' ? '乾造' : '坤造'} · 公历 {birth.year}.{String(birth.month).padStart(2, '0')}.{String(birth.day).padStart(2, '0')}{' '}
              {SHICHEN[birth.hour]?.name} · {chart.lunarDateText}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[13px]">
            <button
              type="button"
              className="border-b border-[var(--zw-line)] pb-0.5 font-semibold text-[var(--zw-accent)] transition-colors hover:border-[var(--zw-accent)]"
              onClick={() => askAi(chart, BAZI_TOPICS[0].prompt, 'overview')}
            >
              子平详批
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => {
                editing.current = true;
                resetReading();
                setResult(null);
              }}
            >
              ← {example ? '排自己的八字' : '修改出生资料'}
            </button>
          </div>
        </div>

        <dl
          className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-y border-[var(--zw-line)] py-1.5 text-[12px] leading-snug text-[var(--zw-muted)]"
          aria-label="校正凭证"
        >
          <dt className="font-serif font-bold text-[var(--zw-accent)]">校正凭证</dt>
          {calibration.map((item, idx) => (
            <dd key={item} className="inline-flex items-baseline gap-2">
              {idx > 0 && <span aria-hidden="true" className="text-[var(--zw-line)]">·</span>}
              <span className={idx === 2 ? 'font-semibold text-[var(--zw-ink)]' : undefined}>{item}</span>
            </dd>
          ))}
        </dl>

        <div className={styles.resultGrid}>
          {/* 左侧：宋刊表格式四柱 + 极简大运时间轴 */}
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-[var(--zw-muted)]">
              <span>
                胎元 <strong className="text-[var(--zw-ink)]">{chart.taiYuan}</strong> · 命宫{' '}
                <strong className="text-[var(--zw-ink)]">{chart.mingGong}</strong> · 身宫{' '}
                <strong className="text-[var(--zw-ink)]">{chart.shenGong}</strong>
              </span>
            </div>

            {/* 四柱八字表格式（去圆角，上下粗墨线 + 列间细线） */}
            <div className="overflow-x-auto border-y-[1.5px] border-[var(--zw-ink)] bg-[var(--zw-panel)]">
              <div className="grid min-w-[340px] grid-cols-4 divide-x divide-[var(--zw-line)]">
                {chart.pillars.map((p, idx) => {
                  const isSelected = idx === selectedPillarIdx;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setSelectedPillarIdx(idx)}
                      className={`flex flex-col items-center px-2 py-4 text-center transition-colors sm:px-3 ${
                        isSelected
                          ? 'bg-[var(--zw-accent-soft)]/55'
                          : 'hover:bg-[var(--zw-soft)]/50'
                      }`}
                    >
                      <span className="text-[11px] tracking-wider text-[var(--zw-muted)]">
                        {p.label}
                      </span>
                      <span
                        className={`mt-1 text-xs font-semibold ${
                          idx === 2 ? 'text-[var(--zw-accent)]' : 'text-[var(--zw-ink)]'
                        }`}
                      >
                        {p.tenGodStem}
                      </span>

                      <div className="my-3.5 space-y-1.5">
                        <div className={`font-serif text-3xl font-extrabold leading-none ${WUXING_TEXT_COLOR[p.stemWuXing]}`}>
                          {p.stem}
                        </div>
                        <div className={`font-serif text-3xl font-extrabold leading-none ${WUXING_TEXT_COLOR[p.branchWuXing]}`}>
                          {p.branch}
                        </div>
                      </div>

                      <div className="w-full border-t border-[var(--zw-line)] pt-2.5 text-[11px] space-y-0.5">
                        {p.hiddenStems.map(h => (
                          <div key={h.stem} className="text-[var(--zw-muted)]">
                            <span className="font-semibold text-[var(--zw-ink)]">{h.stem}</span>
                            <span className="ml-1 text-[10px]">{h.tenGod}</span>
                          </div>
                        ))}
                      </div>

                      <div className="mt-2.5 w-full border-t border-dashed border-[var(--zw-line)] pt-2 text-[11px] text-[var(--zw-muted)] space-y-0.5">
                        <div>{p.diShi} · {p.naYin}</div>
                        <div className="text-[10px]">空亡 {p.xunKong}</div>
                      </div>

                      <div className="mt-2 min-h-[18px] text-[10px] font-medium text-[var(--zw-accent)]">
                        {p.shenSha.length > 0 ? p.shenSha.join(' · ') : '—'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-l-2 border-[var(--zw-accent)] pl-3 text-xs text-[var(--zw-muted)]">
              <strong className="text-[var(--zw-ink)]">
                {chart.pillars[selectedPillarIdx].label}（{chart.pillars[selectedPillarIdx].ganZhi}）：
              </strong>
              {PILLAR_MEANINGS[chart.pillars[selectedPillarIdx].label]}
            </div>

            {/* 大运极简横向时间轴 */}
            <div className="pt-1">
              <div className="mb-2 flex items-baseline justify-between text-xs">
                <span className="font-semibold text-[var(--zw-ink)]">
                  大运流转（{chart.daYunStartAge} 岁起运 · {chart.daYunStartYear} 年交运）
                </span>
                {activeDaYun && (
                  <span className="text-[var(--zw-muted)]">
                    {activeDaYun.ganZhi}运（{activeDaYun.startYear}–{activeDaYun.endYear}）
                  </span>
                )}
              </div>
              <div className="grid grid-cols-4 border-y border-[var(--zw-line)] divide-x divide-[var(--zw-line)] sm:grid-cols-8">
                {chart.daYuns.map((dy, idx) => {
                  const isCurrent = idx === chart.currentDaYunIndex;
                  const isSelected = idx === selectedDaYunIdx;
                  return (
                    <button
                      key={dy.ganZhi + dy.startAge}
                      type="button"
                      onClick={() => setSelectedDaYunIdx(idx)}
                      className={`py-2.5 px-1 text-center transition-colors ${
                        isSelected
                          ? 'bg-[var(--zw-accent-soft)]/55 text-[var(--zw-accent)]'
                          : 'bg-[var(--zw-panel)] text-[var(--zw-ink)] hover:bg-[var(--zw-soft)]'
                      }`}
                    >
                      <div className="text-[10px] text-[var(--zw-muted)]">
                        {dy.startAge}–{dy.endAge}岁
                      </div>
                      <div className={`my-0.5 font-serif text-base font-bold ${isCurrent ? 'text-[var(--zw-accent)]' : ''}`}>
                        {dy.ganZhi}
                      </div>
                      <div className="text-[10px] text-[var(--zw-muted)]">
                        {dy.tenGodStem}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 右侧：线装批注式详情，无圆角卡片套娃与进度条 */}
          <aside className={styles.resultAside} aria-label="八字命理详解">
            <div className="border-t-2 border-[var(--zw-accent)] pt-3">
              <Tabs
                value={asideTab}
                onValueChange={v => setAsideTab(v as 'classics' | 'wuxing' | 'ai')}
              >
                <TabsList>
                  <TabsTrigger value="classics">古籍直断</TabsTrigger>
                  <TabsTrigger value="wuxing">五行格局</TabsTrigger>
                  <TabsTrigger value="ai">子平批注</TabsTrigger>
                </TabsList>

                <TabsContent value="classics">
                  <div className="space-y-4 pt-2 text-xs">
                    <div className="border-b border-[var(--zw-line)] pb-3.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-serif text-sm font-bold text-[var(--zw-accent)]">
                          {refs.qiongtong.title}
                        </span>
                        <span className="font-semibold text-[var(--zw-ink)]">
                          调候：{refs.qiongtong.tiaoHou.join('、')}
                        </span>
                      </div>
                      <p className="mt-1.5 leading-relaxed text-[var(--zw-muted)]">
                        {refs.qiongtong.summary}
                      </p>
                    </div>

                    <div className="border-b border-[var(--zw-line)] pb-3.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-serif text-sm font-bold text-[var(--zw-ink)]">
                          《三命通会》论{refs.sanmingRizhu.ganZhi}日
                        </span>
                        <span className="text-[11px] text-[var(--zw-muted)]">
                          {refs.sanmingRizhu.naYin} · {refs.sanmingRizhu.grade}
                        </span>
                      </div>
                      <p className="mt-1.5 leading-relaxed text-[var(--zw-muted)]">
                        {refs.sanmingRizhu.summary}
                      </p>
                      {refs.sanmingRizhu.timingHint && (
                        <p className="mt-1.5 text-[11px] text-[var(--zw-muted)] opacity-85">
                          {refs.sanmingRizhu.timingHint}
                        </p>
                      )}
                    </div>

                    <div className="border-b border-[var(--zw-line)] pb-3.5">
                      <div className="font-serif text-sm font-bold text-[var(--zw-ink)]">
                        {refs.ditiansui.title}
                      </div>
                      <blockquote className="mt-2 border-l-2 border-[var(--zw-accent)] pl-3 font-serif italic text-[var(--zw-accent)] leading-relaxed">
                        「{refs.ditiansui.verse}」
                      </blockquote>
                      <p className="mt-2 leading-relaxed text-[var(--zw-muted)]">
                        {refs.ditiansui.explanation}
                      </p>
                    </div>

                    <div>
                      <div className="font-serif text-sm font-bold text-[var(--zw-ink)]">
                        《子平真诠》· {refs.zipingGeju.name}
                      </div>
                      <p className="mt-1.5 leading-relaxed text-[var(--zw-muted)]">
                        {refs.zipingGeju.summary}
                      </p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="wuxing">
                  <div className="space-y-4 pt-2 text-xs">
                    <div className="border-b border-[var(--zw-line)] pb-3.5">
                      <div className="text-[11px] text-[var(--zw-muted)]">定格与旺衰</div>
                      <div className="mt-1 flex items-baseline justify-between">
                        <span className="font-serif text-xl font-extrabold text-[var(--zw-ink)]">
                          {wx.geJuName} · {wx.strength}
                        </span>
                        <span className="text-[11px] text-[var(--zw-muted)]">
                          印比 {wx.samePartyScore}% / 异党 {wx.otherPartyScore}%
                        </span>
                      </div>
                      <div className="mt-2.5 grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="text-[var(--zw-muted)]">扶抑喜用：</span>
                          <strong className="text-[var(--zw-accent)]">{wx.favorableElements.join('、')}</strong>
                        </div>
                        <div>
                          <span className="text-[var(--zw-muted)]">穷通调候：</span>
                          <strong className="text-[var(--zw-ink)]">{wx.tiaoHouYongShen.join('、')}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="border-b border-[var(--zw-line)] pb-3.5">
                      <div className="mb-2 text-[11px] text-[var(--zw-muted)]">五行气象分布</div>
                      <div className="grid grid-cols-5 gap-2 text-center">
                        {(['木', '火', '土', '金', '水'] as Wuxing[]).map(el => (
                          <div key={el} className="border-r last:border-r-0 border-[var(--zw-line)] pr-1">
                            <div className={`font-serif text-base font-bold ${WUXING_TEXT_COLOR[el]}`}>{el}</div>
                            <div className="mt-0.5 font-mono text-xs text-[var(--zw-ink)]">{wx.percentages[el]}%</div>
                            <div className="text-[10px] text-[var(--zw-muted)]">{wx.counts[el]}字</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="border-b border-[var(--zw-line)] pb-3.5">
                      <div className="mb-2 text-[11px] text-[var(--zw-muted)]">原局十神组合铁律</div>
                      {chart.patterns.length > 0 ? (
                        <div className="space-y-2.5">
                          {chart.patterns.map((pt, i) => (
                            <div key={i} className="border-l-2 border-[var(--zw-accent)] pl-2.5">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="font-serif font-bold text-[var(--zw-ink)]">{pt.name}</span>
                                <span className="text-[10px] font-semibold text-[var(--zw-accent)]">{pt.level}</span>
                              </div>
                              <p className="mt-1 leading-relaxed text-[var(--zw-muted)]">{pt.summary}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[var(--zw-muted)]">原局十神组合平和，以月令提纲与调候用神为主断。</p>
                      )}
                    </div>

                    <div className="border-b border-[var(--zw-line)] pb-3.5">
                      <div className="mb-2 text-[11px] text-[var(--zw-muted)]">原局干支刑冲合会</div>
                      {chart.relations.length > 0 ? (
                        <div className="space-y-1.5">
                          {chart.relations.map((r, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between border-b border-dashed border-[var(--zw-line)] py-1"
                            >
                              <span className="font-semibold text-[var(--zw-accent)]">{r.type}</span>
                              <span className="text-[var(--zw-ink)]">{r.description}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[var(--zw-muted)]">原局四柱平和，无明显刑冲破害。</p>
                      )}
                    </div>

                    <div>
                      <div className="mb-2 text-[11px] text-[var(--zw-muted)]">近十年流年应期推演</div>
                      <div className="space-y-1.5">
                        {chart.upcomingYears
                          .filter(y => y.importance !== '平')
                          .slice(0, 5)
                          .map(y => (
                            <div key={y.year} className="border-b border-dashed border-[var(--zw-line)] py-1.5">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="font-semibold text-[var(--zw-ink)]">
                                  {y.year} {y.ganZhi}年（{y.tenGodStem}）
                                </span>
                                <span className="text-[11px] font-semibold text-[var(--zw-accent)]">
                                  {y.tags.join(' · ')}
                                </span>
                              </div>
                              <p className="mt-0.5 text-[11px] text-[var(--zw-muted)]">{y.hint}</p>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="ai">
                  <div className="space-y-3.5 pt-2">
                    <div className="flex flex-wrap gap-x-3 gap-y-1.5 border-b border-[var(--zw-line)] pb-2.5 text-xs">
                      {BAZI_TOPICS.map(t => (
                        <button
                          key={t.key}
                          type="button"
                          disabled={aiStreaming}
                          onClick={() => askAi(chart, t.prompt, t.key)}
                          className={`pb-0.5 transition-colors ${
                            activeTopic === t.key
                              ? 'border-b border-[var(--zw-accent)] font-bold text-[var(--zw-accent)]'
                              : 'text-[var(--zw-muted)] hover:text-[var(--zw-ink)]'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    <div className="min-h-[210px] max-h-[420px] overflow-y-auto pr-1">
                      {aiText ? (
                        <RenderMarkdown text={aiText} />
                      ) : (
                        <div className="py-10 text-center text-xs text-[var(--zw-muted)]">
                          {aiStreaming ? '正在依原典推演批注…' : '点选上方任意专题，依《穷通宝鉴》《三命通会》原典推演详批。'}
                        </div>
                      )}
                    </div>

                    <form
                      onSubmit={e => {
                        e.preventDefault();
                        if (!question.trim() || aiStreaming) return;
                        const q = question.trim();
                        setQuestion('');
                        askAi(chart, q, 'custom');
                      }}
                      className="flex gap-2 border-t border-[var(--zw-line)] pt-3"
                    >
                      <input
                        type="text"
                        value={question}
                        onChange={e => setQuestion(e.target.value)}
                        placeholder="追问命局细节（如：某步大运事业如何）"
                        className="flex-1 border-b border-[var(--zw-line)] bg-transparent px-1 py-1.5 text-xs text-[var(--zw-ink)] placeholder:text-[var(--zw-muted)] focus:border-[var(--zw-accent)] focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={!question.trim() || aiStreaming}
                        className="border border-[var(--zw-accent)] px-3 py-1 text-xs font-semibold text-[var(--zw-accent)] hover:bg-[var(--zw-accent-soft)] disabled:opacity-45"
                      >
                        呈问
                      </button>
                    </form>
                  </div>
                </TabsContent>
              </Tabs>

              <ReportHook
                kind="bazi"
                compact
                devUnlocked={devUnlocked}
                onDevToggleUnlock={toggleDevUnlock}
                excerpt={{
                  heading: '本次命局节选',
                  body: `日主${chart.pillars[2]?.stem ?? ''}（${chart.wuxing.dayMasterElement}）生于${chart.pillars[1]?.branch ?? ''}月，身强弱判定为「${chart.wuxing.strength}」${
                    chart.wuxing.geJuName ? `，月令主格为「${chart.wuxing.geJuName}」` : ''
                  }${chart.patterns.length ? `，兼见「${chart.patterns[0].name}」` : ''}。`,
                  lockedHint: '完整报告将依《穷通宝鉴》取用喜忌，并逐步推演大运流年干支冲合与进退节点。',
                }}
                freeActionLabel="先看子平批注"
                onTryFree={() => setAsideTab('ai')}
              />
            </div>
          </aside>
        </div>
      </motion.section>
    );
  }

  const previewPillar = exampleBazi.pillars[previewPillarIdx] ?? exampleBazi.pillars[2];

  return (
    <section id="bazi-paipan" className={styles.hero} aria-labelledby="bazi-heading">
      <div className={styles.intro}>
        <h1 id="bazi-heading">
          四柱八字<span>子平命盘</span>
        </h1>
        <p>
          严格按二十四节气交节时刻排定四柱，内置《穷通宝鉴》百二十月令调候与《三命通会》六十甲子日柱原典直断。
        </p>
        <button
          type="button"
          className={styles.sampleLink}
          onClick={() => openChart(exampleBazi, true)}
        >
          查看示例八字命盘 <span aria-hidden="true">↗</span>
        </button>
      </div>

      <div className={styles.formPanel}>
        <div className={styles.formHeader}>
          <h2 ref={formHeading} tabIndex={-1}>出生资料</h2>
          <span>节气四柱 · 真太阳时</span>
        </div>
        <BirthForm
          initialData={draft}
          onFormSave={setDraft}
          onSubmit={(info: BirthInfo) => openChart(generateBaziChart(info))}
        />
        <p className={styles.formNote}>自动结合《穷通宝鉴》《滴天髓》《三命通会》生成古籍断语。</p>
      </div>

      <div className={styles.preview}>
        <div className={styles.previewLabel}>
          <span>四柱命造</span>
          <span>点击柱位观藏干与十神</span>
        </div>
        <div className="grid grid-cols-4 border-y-[1.5px] border-[var(--zw-ink)] bg-[var(--zw-panel)] divide-x divide-[var(--zw-line)]">
          {exampleBazi.pillars.map((p, idx) => {
            const active = idx === previewPillarIdx;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => setPreviewPillarIdx(idx)}
                className={`flex flex-col items-center py-3 px-2 text-center transition-colors ${
                  active
                    ? 'bg-[var(--zw-accent-soft)]/55 text-[var(--zw-accent)]'
                    : 'text-[var(--zw-ink)] hover:bg-[var(--zw-soft)]'
                }`}
              >
                <span className="text-[10px] text-[var(--zw-muted)]">{p.label}</span>
                <span className="mt-0.5 text-[10px] font-semibold">{p.tenGodStem}</span>
                <strong className="my-1.5 font-serif text-xl font-extrabold tracking-widest">
                  {p.ganZhi}
                </strong>
                <span className="text-[10px] text-[var(--zw-muted)]">{p.naYin}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-2.5 border-l-2 border-[var(--zw-accent)] pl-2.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-1 font-semibold text-[var(--zw-accent)]">
            <span>
              {previewPillar.label} · {previewPillar.ganZhi}（{previewPillar.naYin}）
            </span>
            <span className="text-[11px] font-normal text-[var(--zw-ink)]">
              藏干：{previewPillar.hiddenStems.map(h => `${h.stem}(${h.tenGod})`).join(' ')}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--zw-muted)]">
            {PILLAR_MEANINGS[previewPillar.label]}
          </p>
        </div>
      </div>
    </section>
  );
}
