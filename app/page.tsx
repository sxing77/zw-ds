import type { Metadata } from 'next';
import Link from 'next/link';
import ZiweiWorkspace from '@/components/ZiweiWorkspace';
import { salesEnabled } from '@/lib/commerce/config';
import FaqAccordion from '@/components/FaqAccordion';
import { SiteHeader, SiteFooter } from '@/components/ZiweiSiteChrome';
import styles from '@/components/ZiweiSite.module.css';

export const metadata: Metadata = {
  title: '紫微斗数与四柱八字在线排盘 · 紫微命盘',
  description: '输入公历或农历出生日期与时辰，在线生成紫微斗数十二宫命盘与四柱八字命盘，查阅古籍原典与星曜知识库。',
};

export default function HomePage() {
  return (
    <div className={styles.site}>
      <SiteHeader />
      <main className={styles.container}>
        <ZiweiWorkspace purchaseEnabled={salesEnabled()} />

        {/* 第二屏：护城河可视化 —— 同一时刻，为什么我们的盘不一样 */}
        <section className="border-t border-[var(--zw-line)] py-12" aria-labelledby="compare-heading">
          <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-8 items-start">
            <div>
              <div className="text-xs font-semibold tracking-[0.18em] text-[var(--zw-accent)] mb-2">
                天文校时实证
              </div>
              <h2 id="compare-heading" className="font-serif text-2xl font-extrabold text-[var(--zw-ink)] leading-snug">
                同一时刻，<br />为何盘面截然不同
              </h2>
              <p className="mt-3 text-xs text-[var(--zw-muted)] leading-relaxed">
                以 1990 年 6 月 15 日 11:15（夏令时）在成都出生为例：钟表直排与真实地方太阳时相差整整一个时辰，命宫随之换宫。
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 border-y-[1.5px] border-[var(--zw-ink)] divide-y sm:divide-y-0 sm:divide-x divide-[var(--zw-line)] bg-[var(--zw-panel)]">
              <div className="p-5">
                <div className="text-[11px] text-[var(--zw-muted)] mb-1">常见网站 · 钟表时间直排</div>
                <div className="font-serif text-lg font-bold text-[var(--zw-ink)]">午时（11:15）→ 错盘</div>
                <p className="mt-2 text-xs text-[var(--zw-muted)] leading-relaxed">
                  未扣减 1990 年夏令时（-60 分钟），亦未计入成都东经 104.07° 经度差（-64 分钟），直接按午时起盘，命宫落戌。
                </p>
              </div>
              <div className="p-5 bg-[var(--zw-accent-soft)]/35">
                <div className="text-[11px] font-semibold text-[var(--zw-accent)] mb-1">本站算法 · 真太阳时核校</div>
                <div className="font-serif text-lg font-bold text-[var(--zw-accent)]">巳时（09:13）→ 实盘</div>
                <p className="mt-2 text-xs text-[var(--zw-ink)] leading-relaxed">
                  先回拨夏令时至标准时 10:15，再按经度差与均时差校正至 09:13，准确落入巳时，命宫、四化与大限随之归正。
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 第三屏：古籍原典与星曜录入口 */}
        <section className="border-t border-[var(--zw-line)] py-12" aria-labelledby="classics-heading">
          <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-8 items-start">
            <div>
              <div className="text-xs font-semibold tracking-[0.18em] text-[var(--zw-accent)] mb-2">
                典籍有据
              </div>
              <h2 id="classics-heading" className="font-serif text-2xl font-extrabold text-[var(--zw-ink)] leading-snug">
                明刊原典与<br />十四主星互参
              </h2>
            </div>

            <div className="space-y-6">
              <blockquote className="border-l-2 border-[var(--zw-accent)] pl-4 font-serif text-base leading-[1.9] text-[var(--zw-ink)]">
                「太极生两仪，两仪生四象……斗数之设，以星曜照临十二宫，察其庙旺利陷与四化引动，方知进退之机。」
                <footer className="mt-1.5 font-sans text-xs text-[var(--zw-muted)]">
                  —— 明刊《紫微斗数全书》 · <Link href="/library" className="text-[var(--zw-accent)] border-b border-[var(--zw-line)] hover:border-[var(--zw-accent)]">翻阅古籍全文</Link>
                </footer>
              </blockquote>

              <div className="flex flex-wrap gap-x-8 gap-y-2 border-t border-dashed border-[var(--zw-line)] pt-4 text-xs">
                <Link href="/library" className="font-semibold text-[var(--zw-ink)] hover:text-[var(--zw-accent)] border-b border-[var(--zw-line)] pb-0.5">
                  古籍原典全文检索
                </Link>
                <Link href="/heming" className="font-semibold text-[var(--zw-ink)] hover:text-[var(--zw-accent)] border-b border-[var(--zw-line)] pb-0.5">
                  双人合盘对照
                </Link>
                <Link href="/knowledge" className="font-semibold text-[var(--zw-ink)] hover:text-[var(--zw-accent)] border-b border-[var(--zw-line)] pb-0.5">
                  十四主星录
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.questions} aria-labelledby="questions-heading">
          <h2 id="questions-heading">排盘常见问题</h2>
          <FaqAccordion />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
