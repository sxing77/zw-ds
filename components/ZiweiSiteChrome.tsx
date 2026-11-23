'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { watchAccountChanges } from '@/lib/commerce/client';
import SiteThemeToggle from './SiteThemeToggle';
import { useChineseScript } from './ScriptProvider';
import styles from './ZiweiSite.module.css';

const NAV_ITEMS: readonly { href: string; match: readonly string[]; label: string; mode?: 'chart' | 'compatibility' }[] = [
  { href: '/#paipan', match: ['/', '/chart'], label: '紫微排盘', mode: 'chart' },
  { href: '/heming', match: ['/heming'], label: '双人合盘', mode: 'compatibility' },
  { href: '/library', match: ['/library'], label: '古籍原典' },
  { href: '/knowledge', match: ['/knowledge'], label: '星曜录' },
];

function NavLinks({ chartPage }: { chartPage: boolean }) {
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  const isCompatibilityMode = searchParams.get('mode') === 'compatibility';

  return (
    <nav className={styles.nav} aria-label="主导航">
      {NAV_ITEMS.map(({ href, match, label, mode }) => {
        const targetHref = href === '/#paipan' && chartPage ? '/chart#paipan' : href;
        let isActive = match.some(prefix =>
          prefix === '/' ? pathname === '/' : pathname.startsWith(prefix),
        );
        if (mode === 'compatibility') {
          isActive = isActive || ((pathname === '/' || pathname.startsWith('/chart')) && isCompatibilityMode);
        } else if (mode === 'chart') {
          isActive = isActive && !isCompatibilityMode;
        }
        return (
          <Link
            key={href}
            href={targetHref}
            className={isActive ? styles.navActive : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function FallbackNavLinks({ chartPage }: { chartPage: boolean }) {
  const pathname = usePathname() || '/';
  return (
    <nav className={styles.nav} aria-label="主导航">
      {NAV_ITEMS.map(({ href, match, label }) => {
        const targetHref = href === '/#paipan' && chartPage ? '/chart#paipan' : href;
        const isActive = match.some(prefix =>
          prefix === '/' ? pathname === '/' : pathname.startsWith(prefix),
        );
        return (
          <Link
            key={href}
            href={targetHref}
            className={isActive ? styles.navActive : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SiteHeader({ chartPage = false, baziPage: _baziPage = false }: { chartPage?: boolean; baziPage?: boolean }) {
  const { script, toggleScript } = useChineseScript();
  const [accountEmail, setAccountEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadMe = () => {
      fetch('/api/commerce/me', { cache: 'no-store' })
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
          if (active) setAccountEmail(typeof data?.user?.email === 'string' ? data.user.email : null);
        })
        .catch(() => {});
    };
    loadMe();
    const stopWatching = watchAccountChanges(() => loadMe());
    return () => {
      active = false;
      stopWatching();
    };
  }, []);

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandSeal} aria-hidden="true">紫微</span>
          紫微命盘
        </Link>
        <Suspense fallback={<FallbackNavLinks chartPage={chartPage} />}>
          <NavLinks chartPage={chartPage} />
        </Suspense>
        <div className="flex items-center gap-2">
          <Link
            href="/account/reports"
            className="hidden sm:inline-block text-xs text-[var(--zw-muted)] hover:text-[var(--zw-ink)] transition-colors whitespace-nowrap"
          >
            我的报告
          </Link>
          <Link
            href="/login"
            className="border border-[var(--zw-line)] px-2.5 py-1 text-xs text-[var(--zw-ink)] rounded-[2px] hover:border-[var(--zw-accent)] hover:text-[var(--zw-accent)] transition-colors whitespace-nowrap"
            title={accountEmail ? `已登录：${accountEmail}` : '登录或注册账号'}
          >
            {accountEmail ? accountEmail.split('@')[0] : '登录'}
          </Link>
          <button
            type="button"
            data-no-convert="true"
            onClick={toggleScript}
            className={styles.scriptToggle}
            aria-label={script === 'zh-Hant' ? '切换为简体中文' : '切換為繁體中文'}
            title={script === 'zh-Hant' ? '切换为简体中文' : '切換為繁體中文'}
          >
            {script === 'zh-Hant' ? '简' : '繁'}
          </button>
          <SiteThemeToggle />
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div>
          <strong>紫微命盘</strong>
          <p>以《天纪》与明刊古籍为本的紫微斗数排盘与原典研习工具。</p>
        </div>
        <nav aria-label="站点信息">
          <Link href="/account/reports">我的报告</Link>
          <Link href="/library">古籍原典</Link>
          <Link href="/knowledge">星曜录</Link>
          <Link href="/terms">服务条款</Link>
          <Link href="/privacy">隐私政策</Link>
        </nav>
      </div>
    </footer>
  );
}
