/**
 * 古籍原典查询库 · 主页
 */

import Link from 'next/link';
import { SiteHeader, SiteFooter } from '@/components/ZiweiSiteChrome';
import styles from '@/components/ZiweiSite.module.css';
import { ALL_BOOKS, TOTAL_PARAGRAPHS } from '@/lib/classics';
import LibrarySearch from './LibrarySearch';

export const metadata = {
  title: '古籍原典库 · 紫微斗数全集 / 全书 / 骨髓赋',
  description: '紫微斗数权威古籍全文检索：《紫微斗数全集》《紫微斗数全书》《骨髓赋》倪海厦《天纪》引证来源',
};

export default function LibraryHomePage() {
  return (
    <div className={styles.site}>
      <SiteHeader />
      <main className={`${styles.container} py-12`}>
        {/* 页首 */}
        <div className="border-b border-[var(--zw-line)] pb-8 mb-10 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <div className="text-xs tracking-[0.2em] text-[var(--zw-accent)] font-semibold mb-2">
              明代刊本 · 原典全录
            </div>
            <h1 className="font-serif text-3xl md:text-4xl font-extrabold tracking-wide text-[var(--zw-ink)]">
              古籍原典库
            </h1>
            <p className="mt-2 text-sm text-[var(--zw-muted)] leading-relaxed max-w-xl">
              收录《紫微斗数全集》《紫微斗数全书》《骨髓赋》等 {ALL_BOOKS.length} 部经典，共 {TOTAL_PARAGRAPHS} 段原文，供排盘对照与检索。
            </p>
          </div>
          <div className="w-full md:w-80">
            <LibrarySearch />
          </div>
        </div>

        {/* 古籍目录表 */}
        <div className="grid grid-cols-1 md:grid-cols-3 border-t-[1.5px] border-[var(--zw-ink)] divide-y md:divide-y-0 md:divide-x divide-[var(--zw-line)] bg-[var(--zw-panel)] border-b border-[var(--zw-line)]">
          {ALL_BOOKS.map(book => (
            <Link
              key={book.slug}
              href={`/library/${book.slug}`}
              className="group flex flex-col justify-between p-6 transition-colors hover:bg-[var(--zw-soft)]/50"
            >
              <div>
                <div className="text-xs text-[var(--zw-muted)] tracking-wider mb-1.5">
                  {book.dynasty} · {book.author.split(' ')[0]}
                </div>
                <h2 className="font-serif text-xl font-extrabold text-[var(--zw-ink)] group-hover:text-[var(--zw-accent)] transition-colors mb-3">
                  《{book.title}》
                </h2>
                <p className="text-[13px] text-[var(--zw-muted)] leading-relaxed mb-5">
                  {book.intro}
                </p>
              </div>
              <div className="flex items-center justify-between border-t border-dashed border-[var(--zw-line)] pt-3 text-xs">
                <span className="text-[var(--zw-muted)]">
                  {book.chapters.length} 卷 · {book.chapters.reduce((s, c) => s + c.paragraphs.length, 0)} 段
                </span>
                <span className="font-semibold text-[var(--zw-accent)]">
                  翻阅全卷 ↗
                </span>
              </div>
            </Link>
          ))}
        </div>

        {/* 底部说明 */}
        <div className="mt-10 border-l-2 border-[var(--zw-accent)] pl-4 text-xs text-[var(--zw-muted)] leading-relaxed max-w-2xl">
          <div className="font-semibold text-[var(--zw-ink)] mb-1">刊本说明</div>
          所收录古籍均为公版明代刊本，内容持续校订，后续将补全倪海厦《天纪》逐条引证索引。
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
