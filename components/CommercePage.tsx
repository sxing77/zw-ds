import type { ReactNode } from 'react';
import { SiteHeader, SiteFooter } from './ZiweiSiteChrome';
import styles from './ZiweiSite.module.css';

export default function CommercePage({ title, children }: { title: string; children: ReactNode }) {
  return <div className={styles.site}>
    <SiteHeader />
    <main className={styles.container}>
      <div className={styles.commercePage}>
        <h1>{title}</h1>
        {children}
      </div>
    </main>
    <SiteFooter />
  </div>;
}
