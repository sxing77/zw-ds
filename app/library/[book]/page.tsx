/**
 * /library/[book] — 单部古籍目录页
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteHeader, SiteFooter } from '@/components/ZiweiSiteChrome';
import styles from '@/components/ZiweiSite.module.css';
import { ALL_BOOKS, getBookBySlug } from '@/lib/classics';

export async function generateStaticParams() {
  return ALL_BOOKS.map(b => ({ book: b.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ book: string }> }) {
  const { book: slug } = await params;
  const book = getBookBySlug(slug);
  if (!book) return {};
  return {
    title: `《${book.title}》· ${book.dynasty} · 紫微斗数古籍原典库`,
    description: book.intro,
  };
}

export default async function BookPage({ params }: { params: Promise<{ book: string }> }) {
  const { book: slug } = await params;
  const book = getBookBySlug(slug);
  if (!book) notFound();

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
            <span className="text-[var(--zw-accent)]">《{book.title}》</span>
          </nav>

          {/* 书名信息 */}
          <header className="border-b border-[var(--zw-line)] pb-8 mb-10">
            <div className="text-xs tracking-[0.2em] text-[var(--zw-accent)] font-semibold mb-2">
              {book.dynasty} · {book.author}
            </div>
            <h1 className="font-serif text-3xl md:text-4xl font-extrabold tracking-wide text-[var(--zw-ink)]">
              《{book.title}》
            </h1>
            <p className="mt-3 text-sm text-[var(--zw-muted)] leading-relaxed max-w-2xl">
              {book.intro}
            </p>
          </header>

          {/* 章节目录 */}
          <div className="border-t-[1.5px] border-b border-[var(--zw-ink)] border-b-[var(--zw-line)] bg-[var(--zw-panel)]">
            <div className="px-5 py-3.5 border-b border-[var(--zw-line)] text-xs tracking-[0.18em] text-[var(--zw-muted)] font-medium">
              章节目录（共 {book.chapters.length} 卷）
            </div>
            <div className="divide-y divide-[var(--zw-line)]">
              {book.chapters.map((chapter, i) => (
                <Link
                  key={i}
                  href={`/library/${book.slug}/${i}`}
                  className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-[var(--zw-soft)]/60"
                >
                  <span className="text-xs font-semibold tabular-nums text-[var(--zw-accent)] min-w-[28px]">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-serif text-[15px] font-bold text-[var(--zw-ink)] group-hover:text-[var(--zw-accent)] transition-colors">
                      {chapter.title}
                    </div>
                    {chapter.subtitle && (
                      <div className="mt-0.5 text-xs text-[var(--zw-muted)] truncate">
                        {chapter.subtitle}
                      </div>
                    )}
                  </div>
                  <div className="text-xs tabular-nums text-[var(--zw-muted)] shrink-0">
                    {chapter.paragraphs.length} 段
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
