import type { Metadata } from 'next';
import BaziWorkspace from '@/components/BaziWorkspace';
import { BirthProfilesProvider } from '@/components/BirthProfiles';
import { SiteHeader, SiteFooter } from '@/components/ZiweiSiteChrome';
import styles from '@/components/ZiweiSite.module.css';

export const metadata: Metadata = {
  title: '四柱八字在线排盘 · 穷通宝鉴与三命通会古籍直断 · 紫微命盘',
  description: '严格按照二十四节气时刻排定四柱八字、藏干十神、神煞、大运流年，内置《穷通宝鉴》调候用神、《三命通会》六十甲子日柱、《滴天髓》与《子平真诠》原典直断及八字详解。',
  alternates: { canonical: '/bazi' },
};

export default function BaziPage() {
  return (
    <div className={styles.site}>
      <SiteHeader baziPage />
      <main className={styles.container}>
        <BirthProfilesProvider><BaziWorkspace /></BirthProfilesProvider>
      </main>
      <SiteFooter />
    </div>
  );
}
