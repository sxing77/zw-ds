'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import styles from './ZiweiSite.module.css';

export default function SiteThemeToggle() {
  const { toggle } = useTheme();

  return (
    <button
      type="button"
      className={styles.themeToggle}
      onClick={toggle}
      aria-label="切换浅色或深色主题"
      title="切换浅色 / 深色主题"
    >
      <Moon className={`${styles.lightIcon} h-4 w-4`} aria-hidden="true" />
      <Sun className={`${styles.darkIcon} h-4 w-4`} aria-hidden="true" />
    </button>
  );
}
