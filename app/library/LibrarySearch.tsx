'use client';

/**
 * 古籍库搜索框 — client component
 *
 * 输入 → 实时搜索 → 跳转 /library/search?q=xxx
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function LibrarySearch() {
  const [q, setQ] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const submit = () => {
    const query = q.trim();
    if (!query) return;
    startTransition(() => {
      router.push(`/library/search?q=${encodeURIComponent(query)}`);
    });
  };

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        if (!isPending) submit();
      }}
      className="flex items-stretch border border-[var(--zw-line)] bg-[var(--zw-panel)] rounded-[2px] focus-within:border-[var(--zw-ink)] transition-colors"
    >
      <input
        type="search"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="搜索原文，如：七杀朝斗"
        aria-label="搜索古籍原文"
        className="flex-1 min-w-0 px-3.5 py-2.5 text-sm text-[var(--zw-ink)] placeholder:text-[var(--zw-muted)] bg-transparent border-0 outline-none"
      />
      <button
        type="submit"
        disabled={isPending || !q.trim()}
        className="px-5 py-2.5 text-xs font-semibold tracking-[0.15em] rounded-r-[2px] transition-all shrink-0 bg-[var(--zw-button)] text-white hover:brightness-110 disabled:bg-[var(--zw-soft)] disabled:text-[var(--zw-muted)] disabled:cursor-not-allowed"
      >
        {isPending ? '检索中' : '检索'}
      </button>
    </form>
  );
}
