'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import BirthForm, { type BirthFormState } from '@/components/BirthForm';
import ChartBoard, { BRANCH_GRID_POS } from '@/components/ChartBoard';
import InsightPanel, { type InsightMessage } from '@/components/InsightPanel';
import ReportHook from '@/components/ReportHook';
import ShareModal from '@/components/ShareModal';
import StarDetailPanel from '@/components/StarDetailPanel';
import type { TimeView } from '@/components/TimeNav';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { generateChart } from '@/lib/ziwei/algorithm';
import { ALL_BOOKS } from '@/lib/classics';
import { readZiweiCheckoutDraft, ziweiDraftKey, type ZiweiCheckoutDraft } from '@/lib/commerce/client';
import { BRANCHES, SHICHEN, STEMS } from '@/lib/ziwei/constants';
import { formToBirthInfo, formToSearchParams } from '@/lib/ziwei/share';
import { branchFromSolarMinutes, formatSignedMinutes, resolveZiweiDayOffset } from '@/lib/ziwei/true-solar-time';
import type { BirthInfo, Palace, Star, ZiweiChart } from '@/lib/ziwei/types';
import styles from './ZiweiSite.module.css';

const exampleChart = generateChart({ year: 1990, month: 6, day: 15, hour: 6, gender: 'female' });
const examplePalaces = exampleChart.palaces.map(({ branch, isMingGong, name, stars }) => {
  const [gridRow, gridColumn] = BRANCH_GRID_POS[branch];
  return { branch, isMingGong, name, stars: stars.filter(star => star.type === 'major'), gridRow, gridColumn };
});
const defaultPreviewBranch = examplePalaces.find(p => p.isMingGong)?.branch ?? 0;

/** 典籍原文段落（取自 lib/classics 收录的古籍，附卷篇出处） */
interface ClassicPassage {
  id: string;
  text: string;
  starName: string;
  bookTitle: string;
  bookSlug: string;
  chapterTitle: string;
  chapterIdx: number;
}

/**
 * 按星名在已收录古籍中检索原文段落。
 * 只收「以该星起论」「论该星本性（属/为/化气/主）」或「论该星落本宫」的段落，
 * 仅顺带提及星名者不取——检索不到即返回空，宁缺毋滥。
 */
function findStarClassics(starName: string, palaceName: string, limit = 1): ClassicPassage[] {
  const palaceKey = palaceName.replace(/宫$/, '');
  const natureRe = new RegExp(`${starName}(属|为|化气|主)`);
  const palaceKeys = [`${starName}在${palaceKey}`, `${starName}居${palaceKey}`, `${starName}入${palaceKey}`];
  const scored: { score: number; order: number; passage: ClassicPassage }[] = [];
  let order = 0;

  for (const book of ALL_BOOKS) {
    book.chapters.forEach((chapter, chapterIdx) => {
      for (const p of chapter.paragraphs) {
        const text = p.text;
        order += 1;
        // 过短的段落多为「已论于卷二」之类的互见提示，不作引文
        if (text.length < 24 || !text.includes(starName)) continue;
        let score = 0;
        if (text.startsWith(starName)) score += 3;
        if (natureRe.test(text)) score += 2;
        if (palaceKeys.some(key => text.includes(key))) score += 4;
        if (score < 3) continue;
        scored.push({
          score,
          order,
          passage: {
            id: p.id,
            text,
            starName,
            bookTitle: book.title,
            bookSlug: book.slug,
            chapterTitle: chapter.title,
            chapterIdx,
          },
        });
      }
    });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map(item => item.passage);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function formatLongitude(lon: number) {
  return `${lon >= 0 ? '东经' : '西经'} ${Math.abs(lon).toFixed(2)}°`;
}

/**
 * 校正凭证：输入钟表时刻 → 出生地经度 → 经度修正后的地方时与所落时辰。
 * 口径与 lib/ziwei/share.ts 排盘一致（经度 × 4 分钟修正，按出生地标准时区中央经线）。
 */
function buildCalibration(
  form: BirthFormState | undefined,
  birth: { year: number; month: number; day: number; hour: number; city?: string; province?: string },
  example: boolean,
): string[] {
  const chartDate = `${birth.year}-${pad2(birth.month)}-${pad2(birth.day)}`;
  if (example || !form) {
    return [`示例 · 公历 ${chartDate} ${SHICHEN[birth.hour].name}`, '未作经度校正'];
  }

  const calendarLabel = form.calendar === 'lunar' ? '农历' : '公历';
  const inputDate = `${calendarLabel} ${form.year}-${pad2(Number(form.month))}-${pad2(Number(form.day))}`;
  const offset = form.utcOffsetMinutes ?? 480;
  const tzLabel = offset === 480 ? '' : ` · UTC${offset >= 0 ? '+' : '−'}${Math.abs(offset) / 60}`;
  const place = form.city || form.province;
  const lon = Number.isFinite(form.longitude) ? form.longitude : 120;
  const lonLabel = `${place ? `${place} ` : ''}${formatLongitude(lon)}${place ? '' : '（默认）'}${tzLabel}`;

  if (form.unknownTime) {
    return [`输入 ${inputDate} · 时辰不详`, lonLabel, `按${SHICHEN[birth.hour].name}参考排盘`];
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
    `真太阳时 ${solarClock}（经度 ${formatSignedMinutes(correction)} 分）→ ${SHICHEN[birth.hour].name}`,
  ];
  if (shift !== 0) items.push(`${branch === 0 && normalized >= 1380 ? '晚子时换日' : '跨日'} · 排盘日 ${chartDate}`);
  return items;
}

function getSanFangSet(branch: number) {
  return new Set([branch, (branch + 6) % 12, (branch + 4) % 12, (branch + 8) % 12]);
}

interface ChartWorkspaceProps {
  sharedForm?: BirthFormState | null;
  purchaseEnabled?: boolean;
  onUseForHeming?: (form: BirthFormState) => void;
}

export default function ChartWorkspace({ sharedForm, purchaseEnabled = false, onUseForHeming }: ChartWorkspaceProps = {}) {
  const [result, setResult] = useState<{ chart: ZiweiChart; example: boolean } | null>(() =>
    sharedForm ? { chart: generateChart(formToBirthInfo(sharedForm)), example: false } : null,
  );
  const [draft, setDraft] = useState<BirthFormState | undefined>(() => sharedForm ?? undefined);
  const [selectedPalace, setSelectedPalace] = useState<Palace | null>(null);
  const [selectedStar, setSelectedStar] = useState<{ star: Star; palaceName: string } | null>(null);
  const [selectedSiHua, setSelectedSiHua] = useState<{ starName: string; siHua: string; view: TimeView } | null>(null);
  const [asideTab, setAsideTab] = useState<'palace' | 'overview'>('palace');
  const [insightThreads, setInsightThreads] = useState<Record<string, InsightMessage[]>>({});
  const [shareOpen, setShareOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [devUnlocked, setDevUnlocked] = useState(false);
  const [previewBranch, setPreviewBranch] = useState<number>(defaultPreviewBranch);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    try {
      setDevUnlocked(localStorage.getItem('ziwei:dev:unlocked:ziwei') === '1');
    } catch { /* ignore */ }
  }, []);

  function toggleDevUnlock() {
    const next = !devUnlocked;
    setDevUnlocked(next);
    try {
      if (next) localStorage.setItem('ziwei:dev:unlocked:ziwei', '1');
      else localStorage.removeItem('ziwei:dev:unlocked:ziwei');
    } catch { /* ignore */ }
  }

  function startZiweiPurchase() {
    if (!result) return;
    const { year, month, day, hour, gender } = result.chart.birthInfo;
    const birthA = { year, month, day, hour, gender };
    const saved = readZiweiCheckoutDraft();
    const sameBirth = saved && JSON.stringify(saved.birthA) === JSON.stringify(birthA);
    const nextDraft: ZiweiCheckoutDraft = {
      birthA,
      requestId: sameBirth ? saved.requestId : crypto.randomUUID(),
      expiresAt: Date.now() + 15 * 60_000,
    };
    sessionStorage.setItem(ziweiDraftKey, JSON.stringify(nextDraft));
    window.location.assign('/checkout/ziwei');
  }

  const heading = useRef<HTMLHeadingElement>(null);
  const formHeading = useRef<HTMLHeadingElement>(null);
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const editing = useRef(false);

  useEffect(() => {
    if (result) heading.current?.focus();
    else if (editing.current) formHeading.current?.focus();
  }, [result]);

  function openChart(chart: ZiweiChart, example = false) {
    setSelectedPalace(null);
    setSelectedStar(null);
    setSelectedSiHua(null);
    setInsightThreads({});
    setAsideTab('palace');
    setResult({ chart, example });
  }

  const shareUrl = useMemo(() => {
    if (!result || typeof window === 'undefined') return '';
    if (!result.example && draft) {
      return `${window.location.origin}/chart?${formToSearchParams(draft).toString()}`;
    }
    const b = result.chart.birthInfo;
    const params = formToSearchParams({
      name: b.name ?? '',
      year: String(b.year),
      month: String(b.month),
      day: String(b.day),
      clockHour: String(b.hour * 2),
      clockMinute: '0',
      unknownTime: false,
      province: b.province ?? '',
      city: b.city ?? '',
      longitude: b.longitude ?? 120,
      gender: b.gender,
    });
    return `${window.location.origin}/chart?${params.toString()}`;
  }, [result, draft]);

  if (result) {
    const { chart, example } = result;
    const birth = chart.birthInfo;
    const palace = selectedPalace ?? chart.palaces.find(item => item.isMingGong) ?? chart.palaces[0];
    const majorStars = palace?.stars.filter(star => star.type === 'major') ?? [];
    const luckyStars = palace?.stars.filter(star => star.type === 'lucky') ?? [];
    const shaStars = palace?.stars.filter(star => star.type === 'sha') ?? [];
    const sanFangPalaces = palace
      ? [
          { label: '本宫', branch: palace.branch },
          { label: '对宫', branch: (palace.branch + 6) % 12 },
          { label: '三合', branch: (palace.branch + 4) % 12 },
          { label: '三合', branch: (palace.branch + 8) % 12 },
        ].map(item => ({
          ...item,
          palace: chart.palaces.find(p => p.branch === item.branch),
        }))
      : [];

    const shareBirth = {
      year: String(birth.year),
      month: String(birth.month),
      day: String(birth.day),
      hour: String(birth.hour * 2),
      minute: '0',
      gender: birth.gender,
      city: birth.city,
    };

    const calibration = buildCalibration(draft, birth, example);
    const starQueryNames = majorStars.length > 0 ? majorStars.map(s => s.name) : (palace?.borrowedStars ?? []);
    const starClassics: ClassicPassage[] = [];
    const seenParagraphs = new Set<string>();
    for (const starName of starQueryNames) {
      for (const passage of findStarClassics(starName, palace?.name ?? '', 1)) {
        if (!seenParagraphs.has(passage.id)) {
          seenParagraphs.add(passage.id);
          starClassics.push(passage);
        }
      }
    }

    return (
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className={styles.result}
      >
        <div className={styles.resultHeader}>
          <div>
            <h1 ref={heading} tabIndex={-1}>
              {example ? '示例命盘' : birth.name ? `${birth.name}的命盘` : '紫微斗数命盘'}
            </h1>
            <p>
              {birth.year} 年 {birth.month} 月 {birth.day} 日 · {SHICHEN[birth.hour].name}
              {!example && draft?.unknownTime ? '（参考）' : ''} · {birth.gender === 'male' ? '男' : '女'}
              {' · '}
              {chart.wuxingJuName}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[13px]">
            {onUseForHeming && !example && draft && (
              <button
                type="button"
                className="border-b border-[var(--zw-line)] pb-0.5 font-semibold text-[var(--zw-ink)] transition-colors hover:border-[var(--zw-accent)] hover:text-[var(--zw-accent)]"
                onClick={() => onUseForHeming(draft)}
              >
                用于双人合盘
              </button>
            )}
            <button
              ref={shareButtonRef}
              type="button"
              className="border-b border-[var(--zw-line)] pb-0.5 font-semibold text-[var(--zw-accent)] transition-colors hover:border-[var(--zw-accent)]"
              onClick={() => setShareOpen(true)}
            >
              导出命书 / 分享
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => {
                editing.current = true;
                setResult(null);
              }}
            >
              ← {example ? '排自己的命盘' : '修改出生资料'}
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
          <dd className="inline-flex items-baseline gap-2">
            <span aria-hidden="true" className="text-[var(--zw-line)]">·</span>
            <span>
              农历 {chart.lunarInfo.isLeapMonth ? '闰' : ''}
              {Math.abs(chart.lunarInfo.lunarMonth)} 月 {chart.lunarInfo.lunarDay} 日（月份以农历朔望定，非节气）
            </span>
          </dd>
        </dl>

        <div className={`${styles.resultGrid} min-[941px]:!grid-cols-[minmax(0,1fr)_clamp(272px,34%,400px)]`}>
          <div className={styles.boardPanel}>
            <p className={styles.swipeHint}>左右滑动查看完整命盘。</p>
            <ChartBoard
              chart={chart}
              onPalaceSelect={p => {
                setSelectedPalace(p);
                if (p) setAsideTab('palace');
              }}
              onStarSelect={(star, p) => {
                setSelectedStar({ star, palaceName: p.name });
              }}
              onSiHuaClick={(starName, siHua, view) => {
                setSelectedSiHua({ starName, siHua, view });
                document.getElementById('insight-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            />
          </div>

          <aside className={styles.resultAside} aria-label="命盘详情">
            <div className="min-w-0 border-t-2 border-[var(--zw-accent)] pt-3">
              <Tabs
                value={asideTab}
                onValueChange={v => setAsideTab(v as 'palace' | 'overview')}
              >
                <TabsList>
                  <TabsTrigger value="palace">宫位星曜</TabsTrigger>
                  <TabsTrigger value="overview">格局总览</TabsTrigger>
                </TabsList>

                <TabsContent value="palace">
                  {palace && (
                    <div className="space-y-4 pt-2" aria-live="polite">
                      <div className="flex items-baseline justify-between gap-2 border-b border-[var(--zw-line)] pb-3">
                        <h2 className="font-serif text-2xl font-extrabold text-[var(--zw-ink)]">
                          {palace.name} · {STEMS[palace.stem]}{BRANCHES[palace.branch]}
                        </h2>
                        {palace.daXianAge && (
                          <span className="text-xs text-[var(--zw-muted)]">
                            大限 {palace.daXianAge.join('–')} 岁
                            {palace.isMingGong ? ' · 立极' : ''}
                            {palace.isShenGong ? ' · 身宫' : ''}
                          </span>
                        )}
                      </div>

                      <div className="border-b border-[var(--zw-line)] pb-3.5">
                        <div className="mb-1.5 text-[11px] text-[var(--zw-muted)]">
                          本宫主星（点选星名查典籍）
                        </div>
                        {majorStars.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-y-1 font-serif text-[15px] font-bold text-[var(--zw-ink)]">
                            {majorStars.map((star, idx) => (
                              <span key={star.name} className="inline-flex items-center">
                                {idx > 0 && (
                                  <span className="mx-2 text-[var(--zw-line)] font-normal">|</span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setSelectedStar({ star, palaceName: palace.name })}
                                  className="inline-flex items-baseline gap-1 text-left transition-colors hover:text-[var(--zw-accent)]"
                                >
                                  <span>{star.name}</span>
                                  {(star.brightnessRaw || star.siHua) && (
                                    <span className="font-sans text-[11px] font-medium text-[var(--zw-muted)]">
                                      （{[star.brightnessRaw, star.siHua ? `化${star.siHua}` : ''].filter(Boolean).join('·')}）
                                    </span>
                                  )}
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="font-serif text-sm text-[var(--zw-muted)]">
                            本宫无主星
                            {palace.borrowedStars && palace.borrowedStars.length > 0
                              ? `，借对宫：${palace.borrowedStars.join('、')}`
                              : ''}
                          </p>
                        )}

                        {(luckyStars.length > 0 || shaStars.length > 0) && (
                          <div className="mt-2.5 space-y-1 text-xs text-[var(--zw-muted)]">
                            {luckyStars.length > 0 && (
                              <div>
                                吉辅：{luckyStars.map(s => s.name).join('、')}
                              </div>
                            )}
                            {shaStars.length > 0 && (
                              <div className="text-[var(--zw-accent)]">
                                煞曜：{shaStars.map(s => s.name).join('、')}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {starClassics.length > 0 && (
                        <div className="space-y-2.5 border-b border-[var(--zw-line)] pb-3.5">
                          <div className="text-[11px] text-[var(--zw-muted)]">古籍原典</div>
                          {starClassics.map(c => (
                            <blockquote
                              key={c.id}
                              className="border-l-2 border-[var(--zw-accent)] pl-3 font-serif text-[13px] leading-relaxed text-[var(--zw-ink)]"
                            >
                              「{c.text}」
                              <footer className="mt-1 text-right text-[11px] text-[var(--zw-muted)]">
                                ——{' '}
                                <a
                                  href={`/library/${c.bookSlug}/${c.chapterIdx}#${c.id}`}
                                  className="underline-offset-2 hover:text-[var(--zw-accent)] hover:underline"
                                >
                                  《{c.bookTitle}·{c.chapterTitle}》
                                </a>
                              </footer>
                            </blockquote>
                          ))}
                        </div>
                      )}

                      <div>
                        <div className="mb-2 text-[11px] text-[var(--zw-muted)]">
                          三方四正照会
                        </div>
                        <div className="grid grid-cols-2 gap-x-5 gap-y-1.5 text-xs">
                          {sanFangPalaces.map(item =>
                            item.palace ? (
                              <button
                                key={`${item.label}-${item.branch}`}
                                type="button"
                                onClick={() => setSelectedPalace(item.palace!)}
                                className={`flex items-center justify-between border-b border-dashed border-[var(--zw-line)] py-1.5 text-left transition-colors ${
                                  item.palace.branch === palace.branch
                                    ? 'font-bold text-[var(--zw-accent)]'
                                    : 'text-[var(--zw-ink)] hover:text-[var(--zw-accent)]'
                                }`}
                              >
                                <span>
                                  {item.palace.name}
                                  <span className="ml-1 text-[10px] font-normal opacity-70">
                                    ({item.label})
                                  </span>
                                </span>
                                <span className="truncate pl-2 text-[11px] text-[var(--zw-muted)]">
                                  {item.palace.stars
                                    .filter(s => s.type === 'major')
                                    .map(s => s.name)
                                    .join(' ') || '空宫'}
                                </span>
                              </button>
                            ) : null,
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="overview">
                  <div className="space-y-4 pt-2 text-xs">
                    <div className="grid grid-cols-2 gap-4 border-b border-[var(--zw-line)] pb-3">
                      <div>
                        <div className="text-[11px] text-[var(--zw-muted)]">五行局</div>
                        <div className="mt-1 font-serif text-base font-bold text-[var(--zw-ink)]">
                          {chart.wuxingJuName}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-[var(--zw-muted)]">命宫干支</div>
                        <div className="mt-1 font-serif text-base font-bold text-[var(--zw-ink)]">
                          {(() => {
                            const mg = chart.palaces.find(p => p.isMingGong);
                            return mg ? `${STEMS[mg.stem]}${BRANCHES[mg.branch]}` : '—';
                          })()}
                        </div>
                      </div>
                    </div>

                    <div className="border-b border-[var(--zw-line)] pb-3.5">
                      <div className="mb-2 text-[11px] text-[var(--zw-muted)]">本命四化</div>
                      <div className="grid grid-cols-2 gap-x-5 gap-y-1.5">
                        {(['禄', '权', '科', '忌'] as const).map(siHua => {
                          let match: { star: Star; palace: Palace } | null = null;
                          for (const p of chart.palaces) {
                            const s = p.stars.find(st => st.siHua === siHua);
                            if (s) {
                              match = { star: s, palace: p };
                              break;
                            }
                          }
                          return match ? (
                            <button
                              key={siHua}
                              type="button"
                              onClick={() => {
                                setSelectedPalace(match!.palace);
                                setAsideTab('palace');
                              }}
                              className="flex items-center justify-between border-b border-dashed border-[var(--zw-line)] py-1 text-left hover:text-[var(--zw-accent)]"
                            >
                              <span className="font-semibold text-[var(--zw-ink)]">
                                {match.star.name}
                                <span className="ml-1 text-[11px] text-[var(--zw-accent)]">化{siHua}</span>
                              </span>
                              <span className="text-[11px] text-[var(--zw-muted)]">{match.palace.name}</span>
                            </button>
                          ) : null;
                        })}
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 text-[11px] text-[var(--zw-muted)]">大限流转</div>
                      <div className="grid grid-cols-4 gap-x-2 gap-y-2">
                        {chart.daXians.map((dx, idx) => {
                          const dxPalace = chart.palaces.find(p => p.branch === dx.palaceBranch);
                          const isCurrent = idx === chart.currentDaXianIndex;
                          return (
                            <button
                              key={`${dx.startAge}-${dx.endAge}`}
                              type="button"
                              onClick={() => {
                                if (dxPalace) {
                                  setSelectedPalace(dxPalace);
                                  setAsideTab('palace');
                                }
                              }}
                              className={`border-b py-1 text-left text-[11px] transition-colors ${
                                isCurrent
                                  ? 'border-[var(--zw-accent)] font-bold text-[var(--zw-accent)]'
                                  : 'border-[var(--zw-line)] text-[var(--zw-muted)] hover:text-[var(--zw-ink)]'
                              }`}
                            >
                              <div>{dx.startAge}–{dx.endAge}岁</div>
                              <div className="font-serif">{dxPalace ? dxPalace.name.replace('宫', '') : ''}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </aside>
        </div>

        {/* ═══ 下半屏：全宽书卷式命书批注与详批区（左目录 + 右宽幅正文）═══ */}
        <section
          id="insight-section"
          className="mt-12 border-t-[1.5px] border-[var(--zw-ink)] pt-8 scroll-mt-6"
          aria-label="命书批注与详批"
        >
          <InsightPanel
            chart={chart}
            selectedPalace={selectedPalace}
            selectedSiHua={selectedSiHua}
            unlocked={devUnlocked}
            threads={insightThreads}
            onThreadsChange={setInsightThreads}
            onUnlockRequest={() => setReportOpen(true)}
            sidebarSlot={
              <ReportHook
                kind="ziwei"
                compact
                open={reportOpen}
                onOpenChange={setReportOpen}
                onPurchase={purchaseEnabled ? startZiweiPurchase : undefined}
                devUnlocked={devUnlocked}
                onDevToggleUnlock={toggleDevUnlock}
                excerpt={{
                  heading: '本次命盘节选',
                  body: `本命${chart.wuxingJuName}，命宫在${BRANCHES[chart.mingGongBranch]}位（${
                    chart.palaces.find(p => p.isMingGong)?.stars.filter(s => s.type === 'major').map(s => s.name).join('、') || '空宫'
                  }），身宫落${BRANCHES[chart.shenGongBranch]}位。`,
                  lockedHint: '完整报告将结合各宫生年四化与当前大限飞星，逐条点明财官发力领域与流年避坑节点。',
                }}
                freeActionLabel="继续阅读主星试读"
                onTryFree={() => {
                  document.getElementById('insight-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              />
            }
          />
        </section>

        <StarDetailPanel
          star={selectedStar?.star ?? null}
          palaceName={selectedStar?.palaceName}
          onClose={() => setSelectedStar(null)}
        />

        <ShareModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          returnFocusTo={shareButtonRef}
          shareUrl={shareUrl}
          chart={chart}
          birth={shareBirth}
        />
      </motion.section>
    );
  }

  const activePreviewPalace = examplePalaces.find(p => p.branch === previewBranch) ?? examplePalaces[0];
  const previewSanFang = getSanFangSet(previewBranch);

  return (
    <section className={styles.hero} aria-labelledby="paipan-heading">
      <div className={styles.intro}>
        <h1 id="paipan-heading">紫微斗数<span>在线排盘</span></h1>
        <p>根据出生日期与时辰排出十二宫命盘，查看十四主星、四化、大限与流年。</p>
        <button type="button" className={styles.sampleLink} onClick={() => openChart(exampleChart, true)}>
          查看示例命盘 <span aria-hidden="true">↗</span>
        </button>
      </div>

      <div className={styles.formPanel}>
        <div className={styles.formHeader}>
          <h2 ref={formHeading} tabIndex={-1}>出生资料</h2>
          <span>公历 · 农历 · 真太阳时</span>
        </div>
        <BirthForm initialData={draft} onFormSave={setDraft} onSubmit={(info: BirthInfo) => openChart(generateChart(info))} />
        <p className={styles.formNote}>排盘在浏览器内完成，无需注册。</p>
      </div>

      <div className={styles.preview}>
        <div className={styles.previewLabel}>
          <span>十二宫盘式</span>
          <span>点击宫位观三方四正</span>
        </div>
        <div className={styles.previewGrid}>
          {examplePalaces.map(({ branch, isMingGong, name, stars, gridRow, gridColumn }) => {
            const isActive = branch === previewBranch;
            const inSanFang = previewSanFang.has(branch);
            return (
              <button
                key={branch}
                type="button"
                onClick={() => setPreviewBranch(branch)}
                style={{ gridRow, gridColumn }}
                className={`${isMingGong ? styles.previewMing : styles.previewPalace} cursor-pointer transition-colors ${
                  isActive
                    ? 'ring-1 ring-inset ring-[var(--zw-accent)] bg-[var(--zw-accent-soft)]'
                    : inSanFang
                    ? 'bg-[var(--zw-accent-soft)]/45'
                    : 'hover:bg-[var(--zw-soft)]'
                }`}
              >
                <span>{name}</span>
                <strong>{stars.map(star => star.name).join(' · ') || '—'}</strong>
              </button>
            );
          })}
          <div className={styles.previewCenter}>
            <span>{activePreviewPalace.name}</span>
            <small>
              {activePreviewPalace.stars.length
                ? activePreviewPalace.stars.map(s => s.name).join(' · ')
                : '本宫无主星'}
            </small>
            <small className="mt-1 opacity-70">{exampleChart.wuxingJuName}</small>
          </div>
        </div>
      </div>
    </section>
  );
}
