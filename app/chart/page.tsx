import type { Metadata } from 'next';
import ZiweiWorkspace from '@/components/ZiweiWorkspace';
import { SiteHeader, SiteFooter } from '@/components/ZiweiSiteChrome';
import { searchParamsToForm } from '@/lib/ziwei/share';
import { salesEnabled } from '@/lib/commerce/config';
import styles from '@/components/ZiweiSite.module.css';

export const metadata: Metadata = {
  title: '在线排盘 · 紫微命盘',
  description: '在线排出紫微斗数十二宫命盘，查看本命、大限、流年与双人合盘。',
  alternates: { canonical: '/chart' },
  referrer: 'no-referrer',
};

export default async function ChartPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') params.set(key, value);
  }
  const sharedForm = searchParamsToForm(params);
  return (
    <div className={styles.site}>
      <SiteHeader chartPage />
      <main className={styles.container}>
        <ZiweiWorkspace initialMode={query.mode === 'compatibility' ? 'compatibility' : 'chart'} sharedForm={sharedForm} purchaseEnabled={salesEnabled()} />
      </main>
      <SiteFooter />
    </div>
  );
}
