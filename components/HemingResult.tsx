'use client';

import { useEffect, useRef, useState } from 'react';
import { BRANCH_GRID_POS } from '@/components/ChartBoard';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/Dialog';
import { BRANCHES } from '@/lib/ziwei/constants';
import { REPORT_PRODUCTS, reportAmountCents, reportChapters, reportFollowupLimit } from '@/lib/commerce/report-format';
import type { compareHeming } from '@/lib/ziwei/heming';
import type { ZiweiChart } from '@/lib/ziwei/types';
import styles from './ZiweiSite.module.css';

type Comparison = ReturnType<typeof compareHeming>;

function palaceName(name: string) {
  return name.endsWith('宫') ? name : name + '宫';
}

function describeStars(placement: Comparison['aToB']['spouseToLife']['spouse']) {
  if (placement.own.length) return placement.own.join('、');
  if (placement.borrowed.length && placement.borrowedFrom) {
    return '空宫，借' + palaceName(placement.borrowedFrom.name) + '的' + placement.borrowed.join('、');
  }
  return '空宫';
}

function Direction({ source, target, comparison }: { source: string; target: string; comparison: Comparison['aToB'] }) {
  const { spouse, life, directMatches, borrowedMatches } = comparison.spouseToLife;
  const overlay = comparison.lifePalaceOverlay;
  return (
    <article className={styles.hemingDirection} aria-label={source + '看' + target}>
      <h3>{source}看{target}</h3>
      <dl>
        {overlay && <div><dt>命宫叠宫</dt><dd>{source}命宫与{target}{palaceName(overlay.name)}同在{BRANCHES[overlay.branch]}位</dd></div>}
        <div><dt>夫妻宫与命宫</dt>
          <dd>{source}夫妻宫为{describeStars(spouse)}。{target}命宫为{describeStars(life)}。</dd>
          <dd>{directMatches.length || borrowedMatches.length ? (
            <>
              {directMatches.length > 0 && <span>本宫主星对应 {directMatches.join('、')}。</span>}
              {borrowedMatches.length > 0 && <span>借星对应 {borrowedMatches.join('、')}。</span>}
            </>
          ) : '本宫与借星均无同名主星对应。'}</dd>
        </div>
        <div><dt>生年四化落入{target}命盘</dt>
          <dd className={styles.hemingTags}>
            {comparison.transformations.map(item => (
              <span key={item.kind}>{item.star}化{item.kind} · {item.targetPalaces.map(palace => palaceName(palace.name)).join('、') || '未找到落宫'}</span>
            ))}
          </dd>
        </div>
      </dl>
    </article>
  );
}

function NatalChart({ chart, label }: { chart: ZiweiChart; label: string }) {
  return (
    <figure className={styles.hemingNatal} aria-label={label + '紫微命盘'}>
      <figcaption>{label}命盘</figcaption>
      <div className={styles.hemingNatalGrid}>
        {chart.palaces.map(palace => {
          const [gridRow, gridColumn] = BRANCH_GRID_POS[palace.branch];
          const stars = palace.stars.filter(star => star.type === 'major');
          return (
            <div key={palace.branch} style={{ gridRow, gridColumn }} data-life={palace.isMingGong || undefined}>
              <span>{palaceName(palace.name)} · {BRANCHES[palace.branch]}</span>
              <strong>{stars.map(star => star.name).join(' · ') || '空宫'}</strong>
            </div>
          );
        })}
        <div className={styles.hemingNatalCenter}>
          <strong>{chart.wuxingJuName}</strong>
          <span>命宫{BRANCHES[chart.mingGongBranch]} · 身宫{BRANCHES[chart.shenGongBranch]}</span>
        </div>
      </div>
    </figure>
  );
}

const reportPrice = 'US$' + (reportAmountCents / 100).toFixed(2);

function DevelopmentReport({ comparison }: { comparison: Comparison }) {
  const { aToB, bToA, lifeBranches } = comparison;
  const directions = [
    { source: '甲方', target: '乙方', comparison: aToB },
    { source: '乙方', target: '甲方', comparison: bToA },
  ];
  return (
    <div className={styles.hemingReportBody}>
      <section>
        <h3>{reportChapters[0]}</h3>
        <p>甲方命宫在{BRANCHES[lifeBranches.a]}，乙方命宫在{BRANCHES[lifeBranches.b]}。{lifeBranches.relation
          ? '两者的地支关系为' + lifeBranches.relation + '。'
          : '两个地支之间没有同支、六合或六冲。'}</p>
        {directions.map(({ source, target, comparison }) => comparison.lifePalaceOverlay && (
          <p key={source}>{source}命宫和{target}{palaceName(comparison.lifePalaceOverlay.name)}同在{BRANCHES[comparison.lifePalaceOverlay.branch]}位。</p>
        ))}
      </section>
      <section>
        <h3>{reportChapters[1]}</h3>
        {directions.map(({ source, target, comparison }) => {
          const { spouse, life, directMatches, borrowedMatches } = comparison.spouseToLife;
          const matches = [
            directMatches.length && '本宫主星对应 ' + directMatches.join('、'),
            borrowedMatches.length && '借星对应 ' + borrowedMatches.join('、'),
          ].filter(Boolean);
          return <p key={source}>{source}夫妻宫为{describeStars(spouse)}，{target}命宫为{describeStars(life)}。{matches.join('；') || '这组宫位没有同名主星对应'}。</p>;
        })}
      </section>
      <section>
        <h3>{reportChapters[2]}</h3>
        {directions.map(({ source, target, comparison }) => (
          <div key={source}>
            <h4>{source}生年四化在{target}盘中的位置</h4>
            <ul>{comparison.transformations.map(item => (
              <li key={item.kind}>{item.star}化{item.kind}落于{item.targetPalaces.map(palace => palaceName(palace.name)).join('、') || '未识别的宫位'}</li>
            ))}</ul>
          </div>
        ))}
      </section>
      <section>
        <h3>{reportChapters[3]}</h3>
        <p>可以从两边的宫位对照开始聊：遇到分歧时，希望对方先听自己说，还是先一起定下接下来的做法？各举一个发生过的例子，再确认彼此的理解。</p>
      </section>
    </div>
  );
}

function ReportPreview({ comparison, onTryAi, hasAiReading, developmentKey, onPurchase }: {
  comparison: Comparison;
  onTryAi?: () => void;
  onPurchase?: () => void;
  hasAiReading: boolean;
  developmentKey?: string;
}) {
  const [open, setOpen] = useState(false);
  const [testKey, setTestKey] = useState<string>();
  const [unlocked, setUnlocked] = useState(false);
  const [purchaseError, setPurchaseError] = useState('');
  const tryAiOnClose = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || !developmentKey ||
        !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) return;

    let disposed = false;
    void window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(developmentKey)).then(digest => {
      if (disposed) return;
      const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      const key = 'ziwei:dev:report:' + fingerprint;
      setTestKey(key);
      try { setUnlocked(localStorage.getItem(key) === '1'); } catch { /* In-memory testing is still available. */ }
    }).catch(() => {
      if (!disposed) setTestKey('session');
    });
    return () => { disposed = true; };
  }, [developmentKey]);

  function simulateUnlock(next: boolean) {
    if (!testKey) return;
    setUnlocked(next);
    if (testKey === 'session') return;
    try {
      if (next) localStorage.setItem(testKey, '1');
      else localStorage.removeItem(testKey);
    } catch { /* In-memory testing is still available. */ }
  }

  const isTestReport = Boolean(testKey) && unlocked;
  const overlay = comparison.aToB.lifePalaceOverlay;

  return (
    <section className={styles.hemingOffer} aria-labelledby="heming-offer-heading">
      <div>
        <h2 id="heming-offer-heading">完整合盘报告</h2>
        <p>{isTestReport ? '已解锁 · 本地模拟订单' : '按章节读懂双方的相处模式，含报告回看与 ' + reportFollowupLimit + ' 次追问。'}</p>
      </div>
      <div className={styles.hemingOfferAction}>
        {!isTestReport && <div><span>{onPurchase ? '单份报告' : '拟定试价'}</span><strong>{reportPrice}</strong></div>}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button type="button" className={styles.secondaryButton}>{isTestReport ? '查看已解锁报告' : '预览完整报告'}</button>
          </DialogTrigger>
          <DialogContent
            className={styles.hemingReportDialog}
            onCloseAutoFocus={event => {
              if (!tryAiOnClose.current) return;
              event.preventDefault();
              tryAiOnClose.current = false;
              onTryAi?.();
            }}
          >
            <DialogTitle>{isTestReport ? '完整合盘报告' : '完整合盘报告预览'}</DialogTitle>
            <DialogDescription>{isTestReport
              ? '本地开发测试 · 已模拟付款成功。以下内容由本次双盘生成，用于预览交付页面。'
              : reportPrice + ' 一次购买，含报告回看与 ' + reportFollowupLimit + ' 次追问。' + (onPurchase ? '' : '购买尚未开放。')}</DialogDescription>
            {isTestReport ? <DevelopmentReport comparison={comparison} /> : (
              <>
                <ol className="mt-4 divide-y divide-[var(--zw-line)] border-t border-b border-[var(--zw-line)]">
                  {REPORT_PRODUCTS.compatibility.chapters.map((chapter, idx) => (
                    <li key={chapter.title} className="flex items-baseline gap-3 py-2.5">
                      <span className="text-[11px] font-bold tabular-nums text-[var(--zw-accent)] shrink-0">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[var(--zw-ink)]">{chapter.title}</div>
                        <div className="mt-0.5 text-[11px] text-[var(--zw-muted)]">{chapter.summary}</div>
                      </div>
                    </li>
                  ))}
                </ol>
                {overlay && <div className="mt-4 border-l-2 border-[var(--zw-accent)] bg-[var(--zw-soft)] px-3.5 py-3">
                  <strong className="text-[11px] font-bold tracking-[0.12em] text-[var(--zw-accent)]">本次合盘节选</strong>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--zw-ink)]">甲方命宫与乙方{palaceName(overlay.name)}同在{BRANCHES[overlay.branch]}位。这是从甲方看乙方的叠宫结果，完整报告还会对照乙方看甲方时对应的领域。</p>
                  <p className="mt-2 select-none text-xs leading-relaxed text-[var(--zw-muted)] blur-[3px]" aria-hidden="true">
                    完整报告将展开双方生年禄权科忌落宫的相互作用，并给出日常分歧触发场景与长久相处切入点。
                  </p>
                </div>}
              </>
            )}
            <div className="mt-4 grid gap-2">
              {onPurchase && <button type="button" className={styles.hemingPrimary} onClick={() => {
                setPurchaseError('');
                try { onPurchase(); }
                catch { setPurchaseError('浏览器无法暂存本次合盘资料，请允许网站存储后重试。'); }
              }}>购买完整报告 · {reportPrice}</button>}
              {purchaseError && <p role="alert" className={styles.hemingError}>{purchaseError}</p>}
              {testKey && <button type="button" className={styles.secondaryButton} onClick={() => simulateUnlock(!isTestReport)}>
                {isTestReport ? '重置为未购买' : '模拟付款成功（仅本地开发）'}
              </button>}
              {onTryAi && <button type="button" className={styles.secondaryButton} onClick={() => {
                tryAiOnClose.current = true;
                setOpen(false);
              }}>
                {hasAiReading ? '查看本次合盘详解' : '生成合盘详解'}
              </button>}
              <p className="text-xs text-[var(--zw-muted)]">系统会使用本次合盘所需的出生资料自动生成解读。</p>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
}

export default function HemingResult({ chartA, chartB, comparison, onTryAi, hasAiReading, onPurchase }: {
  chartA: ZiweiChart;
  chartB: ZiweiChart;
  comparison: Comparison;
  onTryAi?: () => void;
  onPurchase?: () => void;
  hasAiReading: boolean;
}) {
  const { a, b, relation } = comparison.lifeBranches;
  const developmentKey = process.env.NODE_ENV === 'development' && !onPurchase
    ? JSON.stringify([chartA, chartB].map(({ birthInfo: birth }) => [birth.year, birth.month, birth.day, birth.hour, birth.gender]))
    : undefined;
  return (
    <div className={styles.hemingResults}>
      <div className={styles.hemingResultHeading}>
        <h2>免费合盘结果</h2>
        <p>双方命宫在{BRANCHES[a]}与{BRANCHES[b]}位{relation ? '，地支为' + relation : '，地支无同支、六合或六冲'}。</p>
      </div>
      <div className={styles.hemingComparisonGrid}>
        <NatalChart label="甲方" chart={chartA} />
        <NatalChart label="乙方" chart={chartB} />
      </div>
      <section className={styles.hemingFindings} aria-label="双向比对">
        <Direction source="甲方" target="乙方" comparison={comparison.aToB} />
        <Direction source="乙方" target="甲方" comparison={comparison.bToA} />
      </section>
      <ReportPreview key={developmentKey} comparison={comparison} onTryAi={onTryAi} hasAiReading={hasAiReading} developmentKey={developmentKey} onPurchase={onPurchase} />
    </div>
  );
}
