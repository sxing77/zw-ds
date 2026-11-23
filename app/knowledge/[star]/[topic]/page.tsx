/**
 * /knowledge/[star]/[topic] — SEO 落地页
 *
 * 14 主星 × 13 topic = 182 个独立 URL
 * 每页含完整的 STAR_DB 4 段论断（一句话定调/核心论断/命盘依据/经典出处）
 *
 * SEO 要点：
 *  - title 含主关键词（如"紫微入命宫·倪海厦体系详解"）
 *  - description 用 dingdiao（一句话定调）
 *  - JSON-LD Article 结构化数据
 *  - 内链：同主星其他 12 宫 + 同宫其他 13 主星
 *  - generateStaticParams 静态生成，零运行时开销
 */

import Link from 'next/link';
import { SiteHeader, SiteFooter } from '@/components/ZiweiSiteChrome';
import styles from '@/components/ZiweiSite.module.css';
import { notFound } from 'next/navigation';
import type { TopicKey } from '@/lib/ziwei/db-analysis';
import {
  ALL_STARS,
  ALL_TOPICS,
  getKnowledge,
  getAllKnowledgeRoutes,
  STAR_BRIEF_SEO,
  STAR_TO_SLUG,
  SLUG_TO_STAR,
} from '@/lib/seo/knowledge';
import { SITE_URL } from '@/lib/site';

// 允许动态参数：如果某个 star/topic 组合不在 generateStaticParams 列表中
// 也允许运行时按需渲染，避免中文 URL 编码问题导致 404
export const dynamicParams = false;

export async function generateStaticParams() {
  const routes = getAllKnowledgeRoutes();
  // URL 用拼音 slug 替代中文，避开 Vercel/CDN 中文路由边界问题
  return routes.map(r => ({ star: r.slug, topic: r.topic }));
}

export async function generateMetadata({ params }: { params: Promise<{ star: string; topic: string }> }) {
  const { star: slug, topic } = await params;
  const star = SLUG_TO_STAR[slug];
  if (!star) return {};
  const data = getKnowledge(star, topic as TopicKey);
  const brief = topic === 'overview' ? STAR_BRIEF_SEO[star] : undefined;
  if (!data.exists && !brief) return {};

  const palaceName = data.palaceName.endsWith('宫') ? data.palaceName : data.palaceName + '宫';
  const title = data.exists ? star + '入' + palaceName + ' · ' + data.topicLabel + ' · 倪海厦体系详解' : star + '星简介 · 紫微斗数知识库';
  const description = data.parsed.dingdiao
    || brief
    || star + '入' + palaceName + '的紫微斗数解读';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      url: `${SITE_URL}/knowledge/${slug}/${topic}`,
    },
    alternates: {
      canonical: `${SITE_URL}/knowledge/${slug}/${topic}`,
    },
    keywords: [
      '紫微斗数', '倪海厦', star, data.palaceName, data.topicLabel,
      `${star}${data.palaceName}`, `${star}入${data.palaceName}`,
      `紫微斗数 ${star}`, '倪海厦紫微斗数', '紫微斗数全集',
    ],
  };
}

export default async function KnowledgePage({ params }: { params: Promise<{ star: string; topic: string }> }) {
  const { star: slug, topic } = await params;
  const star = SLUG_TO_STAR[slug];
  if (!star) notFound();
  const data = getKnowledge(star, topic as TopicKey);
  const brief = STAR_BRIEF_SEO[star];
  if (!data.exists && !(topic === 'overview' && brief)) notFound();
  const palaceName = data.palaceName.endsWith('宫') ? data.palaceName : data.palaceName + '宫';
  const headline = data.exists ? star + '入' + palaceName : star + '星简介';

  // 同主星其他 topic
  const otherTopicsForStar = ALL_TOPICS.filter(t => t !== topic && getKnowledge(star, t).exists);
  // 同 topic 其他主星
  const otherStarsForTopic = ALL_STARS.filter(s => s !== star && getKnowledge(s, topic as TopicKey).exists);

  // JSON-LD
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    description: data.parsed.dingdiao || brief,
    author: { '@type': 'Organization', name: '紫微研究 · 倪海厦正宗' },
    publisher: {
      '@type': 'Organization',
      name: '紫微研究',
      url: SITE_URL,
    },
    datePublished: '2026-04-28',
    dateModified: '2026-04-28',
    mainEntityOfPage: `${SITE_URL}/knowledge/${slug}/${topic}`,
    articleSection: '紫微斗数 · 倪海厦体系',
    keywords: [`紫微斗数`, star, data.palaceName, data.topicLabel].join(', '),
  };

  return (
    <div className={styles.site}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />

      <main className={`${styles.container} py-12`}>
        <article className="mx-auto max-w-3xl">
          {/* 面包屑 */}
          <nav className="mb-8 flex flex-wrap items-center gap-2 text-xs text-[var(--zw-muted)]">
            <Link href="/" className="hover:text-[var(--zw-ink)] transition-colors">首页</Link>
            <span>/</span>
            <Link href="/knowledge" className="hover:text-[var(--zw-ink)] transition-colors">星曜录</Link>
            <span>/</span>
            <span>{star}</span>
            <span>·</span>
            <span className="text-[var(--zw-accent)]">{data.exists ? palaceName : '主星简介'}</span>
          </nav>

          {/* 标题区 */}
          <header className="border-b border-[var(--zw-line)] pb-8 mb-10">
            <div className="text-xs tracking-[0.2em] text-[var(--zw-accent)] font-semibold mb-2">
              {data.exists ? data.topicLabel : '十四主星'}
            </div>
            <h1 className="font-serif text-3xl md:text-5xl font-extrabold tracking-wide text-[var(--zw-ink)] leading-tight">
              {headline}
            </h1>
            {STAR_BRIEF_SEO[star] && (
              <p className="mt-3 text-sm text-[var(--zw-muted)] leading-relaxed">
                {STAR_BRIEF_SEO[star]}
              </p>
            )}
          </header>

          {/* 内容 4 段 */}
          {data.parsed.dingdiao && (
            <Section title="一句话定调" highlight>
              <p className="font-serif text-lg font-bold text-[var(--zw-ink)] leading-relaxed">
                {data.parsed.dingdiao}
              </p>
            </Section>
          )}

          {data.parsed.lundian && (
            <Section title="核心论断">
              <div className="text-[15px] text-[var(--zw-ink)] leading-[1.95] whitespace-pre-wrap">
                {data.parsed.lundian}
              </div>
            </Section>
          )}

          {data.parsed.yiju && (
            <Section title="命盘依据">
              <div className="text-sm text-[var(--zw-ink)] leading-[1.95] whitespace-pre-wrap">
                {data.parsed.yiju}
              </div>
            </Section>
          )}

          {data.parsed.chuchu && (
            <Section title="经典出处" minimal>
              <div className="font-serif text-[13px] text-[var(--zw-muted)] leading-[1.95] whitespace-pre-wrap">
                {data.parsed.chuchu}
              </div>
            </Section>
          )}

          {/* CTA */}
          <div className="my-10 border-t-[1.5px] border-b border-[var(--zw-ink)] border-b-[var(--zw-line)] bg-[var(--zw-accent-soft)] px-6 py-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="font-serif text-lg font-bold text-[var(--zw-ink)]">
                查看你命盘中的{data.topicLabel}
              </div>
              <div className="mt-1 text-xs text-[var(--zw-muted)]">
                输入生辰起盘，对照星曜四化与古籍原典论断
              </div>
            </div>
            <Link
              href="/chart"
              className="inline-flex items-center justify-center bg-[var(--zw-button)] text-white px-6 py-3 rounded-[2px] text-sm font-semibold tracking-wider hover:brightness-110 transition-all shrink-0"
            >
              立即排盘
            </Link>
          </div>

          {/* 内链：同主星其他 topic */}
          {otherTopicsForStar.length > 0 && (
            <Section title={`${star}星的其他宫位解读`} minimal>
              <div className="flex flex-wrap gap-2">
                {otherTopicsForStar.map(t => {
                  const d = getKnowledge(star, t);
                  return (
                    <Link
                      key={t}
                      href={`/knowledge/${slug}/${t}`}
                      className="border border-[var(--zw-line)] bg-[var(--zw-soft)] px-3 py-1.5 rounded-[2px] text-xs text-[var(--zw-ink)] hover:border-[var(--zw-accent)] hover:text-[var(--zw-accent)] transition-colors"
                    >
                      {star}入{d.palaceName}
                    </Link>
                  );
                })}
              </div>
            </Section>
          )}

          {/* 内链：同 topic 其他主星 */}
          {otherStarsForTopic.length > 0 && (
            <Section title={`其他主星入${palaceName}的解读`} minimal>
              <div className="flex flex-wrap gap-2">
                {otherStarsForTopic.slice(0, 13).map(s => (
                  <Link
                    key={s}
                    href={`/knowledge/${STAR_TO_SLUG[s]}/${topic}`}
                    className="border border-[var(--zw-line)] bg-[var(--zw-soft)] px-3 py-1.5 rounded-[2px] text-xs text-[var(--zw-ink)] hover:border-[var(--zw-accent)] hover:text-[var(--zw-accent)] transition-colors"
                  >
                    {s}入{data.palaceName}
                  </Link>
                ))}
              </div>
            </Section>
          )}

          {/* 古籍库链接 */}
          <div className="mt-10 border-l-2 border-[var(--zw-accent)] pl-4 py-1 text-xs text-[var(--zw-muted)]">
            <span className="mr-2">延伸阅读：</span>
            <Link href="/library" className="text-[var(--zw-accent)] font-semibold hover:underline">
              查阅古籍原典库（紫微斗数全集 / 全书 / 骨髓赋）
            </Link>
          </div>
        </article>
      </main>

      <SiteFooter />
    </div>
  );
}

function Section({ title, children, highlight, minimal }: { title: string; children: React.ReactNode; highlight?: boolean; minimal?: boolean }) {
  return (
    <section className={minimal ? 'mb-6' : 'mb-8'}>
      <h2 className="font-serif text-sm font-bold tracking-[0.12em] text-[var(--zw-accent)] mb-3">
        {title}
      </h2>
      <div
        className={
          highlight
            ? 'border-t-[1.5px] border-b border-[var(--zw-ink)] border-b-[var(--zw-line)] bg-[var(--zw-accent-soft)] px-5 py-5'
            : `border border-[var(--zw-line)] bg-[var(--zw-panel)] ${minimal ? 'px-4 py-4' : 'px-5 py-5'}`
        }
      >
        {children}
      </div>
    </section>
  );
}
