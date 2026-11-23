/**
 * /knowledge — 星曜知识库主页
 */

import Link from 'next/link';
import { SiteHeader, SiteFooter } from '@/components/ZiweiSiteChrome';
import styles from '@/components/ZiweiSite.module.css';
import { ALL_STARS, ALL_TOPICS, getKnowledge, STAR_BRIEF_SEO, STAR_TO_SLUG } from '@/lib/seo/knowledge';
import { TOPIC_LABEL } from '@/lib/ziwei/db-analysis';

export const metadata = {
  title: '紫微斗数星曜知识库 · 十四主星 × 十二宫位 · 倪海厦正宗体系',
  description: '基于倪海厦《天纪》体系与古籍《紫微斗数全集》《骨髓赋》编纂的紫微斗数知识库，覆盖十四主星在各宫位的完整论断。',
  keywords: ['紫微斗数', '倪海厦', '倪海厦紫微斗数', '紫微斗数全集', '紫微斗数全书', '14 主星', '12 宫位'],
};

export default function KnowledgeHomePage() {
  const STAR_DESCRIPTIONS_QUICK = STAR_BRIEF_SEO;

  return (
    <div className={styles.site}>
      <SiteHeader />
      <main className={`${styles.container} py-12`}>
        {/* 页首 */}
        <div className="border-b border-[var(--zw-line)] pb-8 mb-10">
          <div className="text-xs tracking-[0.2em] text-[var(--zw-accent)] font-semibold mb-2">
            天纪体系 · 星曜释义
          </div>
          <h1 className="font-serif text-3xl md:text-4xl font-extrabold tracking-wide text-[var(--zw-ink)]">
            紫微斗数星曜录
          </h1>
          <p className="mt-2 text-sm text-[var(--zw-muted)] leading-relaxed max-w-xl">
            依倪海厦《天纪》体系与《紫微斗数全书》编纂，收十四主星入十二宫之象义与古籍引证。
          </p>
        </div>

        {/* 十四主星快查索引 */}
        <div className="mb-12">
          <div className="text-xs text-[var(--zw-muted)] mb-3">十四主星目录</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 border-t-[1.5px] border-l border-[var(--zw-ink)] border-l-[var(--zw-line)] bg-[var(--zw-panel)]">
            {ALL_STARS.map(star => (
              <Link
                key={star}
                href={`/knowledge/${STAR_TO_SLUG[star]}/overview`}
                className="border-r border-b border-[var(--zw-line)] py-3.5 px-2 text-center font-serif text-base font-bold text-[var(--zw-ink)] transition-colors hover:bg-[var(--zw-accent-soft)]/50 hover:text-[var(--zw-accent)]"
              >
                {star}
              </Link>
            ))}
          </div>
        </div>

        {/* 十四主星分条详目 */}
        <div className="divide-y divide-[var(--zw-line)] border-t border-[var(--zw-line)]">
          {ALL_STARS.map(star => (
            <div key={star} className="py-6 grid grid-cols-1 md:grid-cols-[140px_1fr] gap-4 items-start">
              <div>
                <Link
                  href={`/knowledge/${STAR_TO_SLUG[star]}/overview`}
                  className="font-serif text-xl font-extrabold text-[var(--zw-ink)] hover:text-[var(--zw-accent)] transition-colors"
                >
                  {star}星
                </Link>
              </div>
              <div>
                <p className="text-[13px] text-[var(--zw-muted)] leading-relaxed mb-3">
                  {STAR_DESCRIPTIONS_QUICK[star] || ''}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                  {ALL_TOPICS.map(t => {
                    const k = getKnowledge(star, t);
                    if (!k.exists) return null;
                    return (
                      <Link
                        key={t}
                        href={`/knowledge/${STAR_TO_SLUG[star]}/${t}`}
                        className="border-b border-dashed border-[var(--zw-line)] pb-0.5 text-[var(--zw-ink)] hover:border-[var(--zw-accent)] hover:text-[var(--zw-accent)] transition-colors"
                      >
                        入{k.palaceName} · {TOPIC_LABEL[t]}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
