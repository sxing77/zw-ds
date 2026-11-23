/**
 * /library/[book]/[chapter] — 单章节阅读页
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteHeader, SiteFooter } from '@/components/ZiweiSiteChrome';
import styles from '@/components/ZiweiSite.module.css';
import { ALL_BOOKS, getChapter } from '@/lib/classics';

export async function generateStaticParams() {
  return ALL_BOOKS.flatMap(b =>
    b.chapters.map((_, i) => ({ book: b.slug, chapter: String(i) }))
  );
}

export async function generateMetadata({ params }: { params: Promise<{ book: string; chapter: string }> }) {
  const { book: bookSlug, chapter: chIdx } = await params;
  const result = getChapter(bookSlug, parseInt(chIdx));
  if (!result) return {};
  return {
    title: `${result.chapter.title} · 《${result.book.title}》· 紫微斗数古籍`,
    description: result.chapter.subtitle || `《${result.book.title}》${result.chapter.title}原文`,
  };
}

export default async function ChapterPage({ params }: { params: Promise<{ book: string; chapter: string }> }) {
  const { book: bookSlug, chapter: chIdx } = await params;
  const result = getChapter(bookSlug, parseInt(chIdx));
  if (!result) notFound();

  const { book, chapter, chapterIdx } = result;
  const prevIdx = chapterIdx - 1;
  const nextIdx = chapterIdx + 1;

  return (
    <div className={styles.site}>
      <SiteHeader />
      <main className={`${styles.container} py-12`}>
        <article className="mx-auto max-w-3xl">
          {/* 面包屑 */}
          <nav className="mb-8 flex flex-wrap items-center gap-2 text-xs text-[var(--zw-muted)]">
            <Link href="/library" className="hover:text-[var(--zw-ink)] transition-colors">
              古籍原典库
            </Link>
            <span>/</span>
            <Link href={`/library/${book.slug}`} className="hover:text-[var(--zw-ink)] transition-colors">
              《{book.title}》
            </Link>
            <span>/</span>
            <span className="text-[var(--zw-accent)]">{chapter.title}</span>
          </nav>

          {/* 标题 */}
          <header className="border-b border-[var(--zw-line)] pb-8 mb-8">
            <div className="text-xs tracking-[0.2em] text-[var(--zw-accent)] font-semibold mb-2">
              《{book.title}》· {book.dynasty}
            </div>
            <h1 className="font-serif text-3xl md:text-4xl font-extrabold tracking-wide text-[var(--zw-ink)]">
              {chapter.title}
            </h1>
            {chapter.subtitle && (
              <p className="mt-2 text-sm text-[var(--zw-muted)] leading-relaxed">
                {chapter.subtitle}
              </p>
            )}
          </header>

          {/* 段落 */}
          <div className="border-t-[1.5px] border-b border-[var(--zw-ink)] border-b-[var(--zw-line)] bg-[var(--zw-panel)] px-6 py-8 md:px-8 divide-y divide-dashed divide-[var(--zw-line)]">
            {chapter.paragraphs.map((p, i) => (
              <div
                key={p.id}
                id={p.id}
                className={i === 0 ? 'pb-6 scroll-mt-20' : i === chapter.paragraphs.length - 1 ? 'pt-6 scroll-mt-20' : 'py-6 scroll-mt-20'}
              >
                <div className="flex items-baseline gap-3">
                  <span className="text-xs font-semibold tabular-nums text-[var(--zw-accent)] min-w-[24px]">
                    {String(p.idx).padStart(2, '0')}
                  </span>
                  <p className="flex-1 font-serif text-base leading-[2] tracking-[0.04em] text-[var(--zw-ink)]">
                    {p.text}
                  </p>
                </div>
                {p.translation && (
                  <div className="mt-3 ml-9 border-l-2 border-[var(--zw-accent)] bg-[var(--zw-soft)] px-3.5 py-2.5 text-[13px] leading-relaxed text-[var(--zw-muted)]">
                    <span className="mr-2 text-[11px] font-semibold text-[var(--zw-accent)]">白话</span>
                    {p.translation}
                  </div>
                )}
                {p.niNote && (
                  <div className="mt-2.5 ml-9 border-l-2 border-[var(--zw-ink)] bg-[var(--zw-accent-soft)] px-3.5 py-2.5 text-[13px] leading-relaxed text-[var(--zw-ink)]">
                    <span className="mr-2 text-[11px] font-semibold text-[var(--zw-accent)]">倪师注</span>
                    {p.niNote}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 章节导航 */}
          <nav className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4" aria-label="章节导航">
            {prevIdx >= 0 ? (
              <Link
                href={`/library/${book.slug}/${prevIdx}`}
                className="border border-[var(--zw-line)] bg-[var(--zw-panel)] px-5 py-4 transition-colors hover:border-[var(--zw-accent)]"
              >
                <div className="text-[11px] tracking-[0.15em] text-[var(--zw-muted)] mb-1">上一章</div>
                <div className="font-serif text-sm font-bold text-[var(--zw-ink)]">{book.chapters[prevIdx].title}</div>
              </Link>
            ) : <div />}
            {nextIdx < book.chapters.length ? (
              <Link
                href={`/library/${book.slug}/${nextIdx}`}
                className="border border-[var(--zw-line)] bg-[var(--zw-panel)] px-5 py-4 text-right transition-colors hover:border-[var(--zw-accent)]"
              >
                <div className="text-[11px] tracking-[0.15em] text-[var(--zw-muted)] mb-1">下一章</div>
                <div className="font-serif text-sm font-bold text-[var(--zw-ink)]">{book.chapters[nextIdx].title}</div>
              </Link>
            ) : <div />}
          </nav>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
