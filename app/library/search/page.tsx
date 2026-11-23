/**
 * /library/search?q=xxx — 搜索结果页
 */

import Link from 'next/link';
import { SiteHeader, SiteFooter } from '@/components/ZiweiSiteChrome';
import styles from '@/components/ZiweiSite.module.css';
import { searchClassics, getParagraphById } from '@/lib/classics';
import LibrarySearch from '../LibrarySearch';

export const metadata = {
  title: '搜索 · 古籍原典库',
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const q = sp.q?.trim() || '';
  const hits = q ? searchClassics(q, 50) : [];

  return (
    <div className={styles.site}>
      <SiteHeader />
      <main className={`${styles.container} py-12`}>
        <div className="mx-auto max-w-3xl">
          {/* 面包屑 */}
          <nav className="mb-8 flex items-center gap-2 text-xs text-[var(--zw-muted)]">
            <Link href="/library" className="hover:text-[var(--zw-ink)] transition-colors">
              古籍原典库
            </Link>
            <span>/</span>
            <span className="text-[var(--zw-accent)]">全文检索</span>
          </nav>

          {/* 页首 */}
          <div className="border-b border-[var(--zw-line)] pb-8 mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <div className="text-xs tracking-[0.2em] text-[var(--zw-accent)] font-semibold mb-2">
                检索结果
              </div>
              <h1 className="font-serif text-3xl font-extrabold tracking-wide text-[var(--zw-ink)]">
                「{q || '（空）'}」
              </h1>
              <p className="mt-2 text-xs text-[var(--zw-muted)]">
                共找到 <strong className="text-[var(--zw-accent)] tabular-nums">{hits.length}</strong> 条古籍原文匹配
              </p>
            </div>
            <div className="w-full md:w-72">
              <LibrarySearch />
            </div>
          </div>

          {hits.length === 0 ? (
            <div className="border-t-[1.5px] border-b border-[var(--zw-ink)] border-b-[var(--zw-line)] bg-[var(--zw-panel)] px-6 py-12 text-center text-[var(--zw-muted)]">
              {q ? (
                <>
                  <div className="text-sm font-medium text-[var(--zw-ink)] mb-2">暂未在已收录古籍中找到这个关键词</div>
                  <div className="text-xs leading-relaxed">
                    可尝试搜索：<span className="text-[var(--zw-accent)]">七杀朝斗 / 双禄朝垣 / 化忌 / 紫微 / 命宫 / 机月同梁</span>
                  </div>
                </>
              ) : (
                <div className="text-sm">请输入要搜索的关键词</div>
              )}
            </div>
          ) : (
            <div className="border-t-[1.5px] border-b border-[var(--zw-ink)] border-b-[var(--zw-line)] bg-[var(--zw-panel)] divide-y divide-[var(--zw-line)]">
              {hits.map((hit, i) => {
                const ctx = getParagraphById(hit.paragraphId);
                const chapterIdx = ctx?.chapterIdx ?? 0;
                return (
                  <Link
                    key={i}
                    href={`/library/${hit.bookSlug}/${chapterIdx}#${hit.paragraphId}`}
                    className="block px-5 py-4 transition-colors hover:bg-[var(--zw-soft)]/50"
                  >
                    <div className="flex items-center gap-2 text-xs text-[var(--zw-muted)] mb-1.5">
                      <span className="font-semibold text-[var(--zw-accent)]">《{hit.bookTitle}》</span>
                      <span>·</span>
                      <span>{hit.chapterTitle}</span>
                    </div>
                    <div
                      className="text-sm text-[var(--zw-ink)] leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: hit.snippet }}
                    />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
      <SiteFooter />

      <style>{`
        mark { background: var(--zw-accent-soft); color: var(--zw-accent); padding: 0 3px; border-radius: 2px; font-weight: 600; }
      `}</style>
    </div>
  );
}
