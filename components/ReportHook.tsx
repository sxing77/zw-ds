'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/Dialog';
import { REPORT_PRODUCTS, type ReportKind } from '@/lib/commerce/report-format';
import styles from './ZiweiSite.module.css';

export interface ReportHookExcerpt {
  heading: string;
  body: string;
  lockedHint?: string;
}

interface ReportHookProps {
  kind: ReportKind;
  excerpt: ReportHookExcerpt;
  onPurchase?: () => void;
  onTryFree?: () => void;
  freeActionLabel?: string;
  compact?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  devUnlocked?: boolean;
  onDevToggleUnlock?: () => void;
}

export default function ReportHook({
  kind,
  excerpt,
  onPurchase,
  onTryFree,
  freeActionLabel = '先体验在线推演',
  compact = false,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  devUnlocked = false,
  onDevToggleUnlock,
}: ReportHookProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;
  const [checkoutNotice, setCheckoutNotice] = useState(false);
  const [purchaseError, setPurchaseError] = useState('');
  const [isLocalDev, setIsLocalDev] = useState(false);

  useEffect(() => {
    if (
      process.env.NODE_ENV === 'development' &&
      !onPurchase &&
      ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
    ) {
      setIsLocalDev(true);
    }
  }, [onPurchase]);

  const product = REPORT_PRODUCTS[kind];
  const priceText = 'US$' + (product.amountCents / 100).toFixed(2);

  function handlePurchaseClick() {
    setPurchaseError('');
    if (onPurchase) {
      try {
        onPurchase();
      } catch {
        setPurchaseError('浏览器无法暂存本次命盘资料，请允许网站存储后重试。');
      }
      return;
    }
    setCheckoutNotice(true);
  }

  function handleTryFree() {
    setOpen(false);
    setCheckoutNotice(false);
    onTryFree?.();
  }

  return (
    <section
      aria-label={product.title}
      className={`border border-[var(--zw-line)] border-t-[1.5px] border-t-[var(--zw-ink)] bg-[var(--zw-accent-soft)] rounded-[2px] ${
        compact ? 'mt-4 p-4' : 'p-5 md:p-6'
      }`}
    >
      <div className={compact ? 'space-y-3' : 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'}>
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-serif text-base md:text-lg font-extrabold text-[var(--zw-ink)]">
              {product.title}
            </h3>
            <span className="text-sm font-extrabold tabular-nums text-[var(--zw-accent)] shrink-0">
              {devUnlocked ? '已解锁' : priceText}
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--zw-muted)] leading-relaxed">
            {devUnlocked
              ? '已解锁 · 本地模拟订单（可完整查看各专题与追问）'
              : `四章系统推演 · 含报告永久回看与 ${product.followupLimit} 次针对性追问`}
          </p>
        </div>

        <Dialog
          open={open}
          onOpenChange={next => {
            setOpen(next);
            if (!next) {
              setCheckoutNotice(false);
              setPurchaseError('');
            }
          }}
        >
          <DialogTrigger asChild>
            <button
              type="button"
              className={`${
                compact ? 'w-full' : 'shrink-0'
              } inline-flex items-center justify-center border border-[var(--zw-ink)] bg-[var(--zw-panel)] px-4 py-2 text-xs font-bold tracking-[0.12em] text-[var(--zw-ink)] rounded-[2px] hover:border-[var(--zw-accent)] hover:text-[var(--zw-accent)] transition-colors`}
            >
              预览目录与节选
            </button>
          </DialogTrigger>

          <DialogContent className={`${styles.zwDialog} max-h-[90dvh] overflow-y-auto border border-[var(--zw-line)] border-t-[1.5px] border-t-[var(--zw-ink)] bg-[var(--zw-panel)] rounded-[2px] text-[var(--zw-ink)]`}>
            <div className="flex items-baseline justify-between gap-3 pr-6">
              <DialogTitle className="font-serif text-xl font-extrabold text-[var(--zw-ink)]">
                {product.title}
              </DialogTitle>
              <span className="text-base font-extrabold tabular-nums text-[var(--zw-accent)] shrink-0">
                {priceText}
              </span>
            </div>
            <DialogDescription className="mt-1.5 text-xs text-[var(--zw-muted)] leading-relaxed">
              {product.subtitle} 一次解锁，包含完整四章内容、报告永久回看与 {product.followupLimit} 次追问额度。
            </DialogDescription>

            {/* 四章目录 */}
            <ol className="mt-4 divide-y divide-[var(--zw-line)] border-t border-b border-[var(--zw-line)]">
              {product.chapters.map((chapter, idx) => (
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

            {/* 本次命盘实盘节选 + 锁定续读预览 */}
            <div className="mt-4 border-l-2 border-[var(--zw-accent)] bg-[var(--zw-soft)] px-3.5 py-3">
              <div className="text-[11px] font-bold tracking-[0.12em] text-[var(--zw-accent)]">
                {excerpt.heading}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--zw-ink)]">
                {excerpt.body}
              </p>
              <p className="mt-2 select-none text-xs leading-relaxed text-[var(--zw-muted)] blur-[3px]" aria-hidden="true">
                {excerpt.lockedHint ?? '完整报告将结合大限四化飞星与流年干支，逐条标明转折年份、财官发力点与趋吉避凶建议。'}
              </p>
              <div className="mt-1 text-[11px] text-[var(--zw-muted)]">
                解锁后展开全文推演与流年节点对照
              </div>
            </div>

            {/* 行动区 */}
            <div className="mt-5 grid gap-2.5">
              {!devUnlocked && (
                <button
                  type="button"
                  onClick={handlePurchaseClick}
                  className="w-full min-h-[42px] bg-[var(--zw-button)] text-white text-xs font-bold tracking-[0.14em] rounded-[2px] hover:brightness-110 transition-all"
                >
                  {onPurchase ? `购买完整报告 · ${priceText}` : `解锁完整报告 · ${priceText}`}
                </button>
              )}

              {purchaseError && (
                <p role="alert" className="text-xs text-[var(--zw-accent)]">
                  {purchaseError}
                </p>
              )}

              {checkoutNotice && !devUnlocked && (
                <div className="border border-[var(--zw-line)] bg-[var(--zw-soft)] px-3 py-2.5 text-xs text-[var(--zw-muted)] leading-relaxed">
                  单盘深度报告结账通道即将接入 Waffo 统一收银台。本地测试可直接点击下方「模拟付款成功（仅本地开发）」解锁完整功能。
                </div>
              )}

              {isLocalDev && onDevToggleUnlock && (
                <button
                  type="button"
                  onClick={() => {
                    onDevToggleUnlock();
                    setCheckoutNotice(false);
                  }}
                  className="w-full min-h-[40px] border border-[var(--zw-accent)] bg-[var(--zw-accent-soft)] text-xs font-bold text-[var(--zw-accent)] rounded-[2px] hover:brightness-95 transition-all"
                >
                  {devUnlocked ? '重置为未购买（仅本地开发）' : '模拟付款成功（仅本地开发）'}
                </button>
              )}

              {onTryFree && (
                <button
                  type="button"
                  onClick={handleTryFree}
                  className="w-full min-h-[38px] border border-[var(--zw-line)] bg-transparent text-xs font-semibold text-[var(--zw-ink)] rounded-[2px] hover:border-[var(--zw-accent)] hover:text-[var(--zw-accent)] transition-colors"
                >
                  {devUnlocked ? '前往查看完整批注' : freeActionLabel}
                </button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
}
