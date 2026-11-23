'use client';

import { createContext, Fragment, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { clearCheckoutDraft, commercePost, watchAccountChanges } from '@/lib/commerce/client';
import type { BirthFormState, BirthProfile } from '@/lib/ziwei/birth-form';
import styles from './BirthForm.module.css';

type ProfileSession = { signIn: 'local' | 'google' | null } | { accountId: string; profiles: BirthProfile[] };
type ProfilesContext = {
  session: ProfileSession | null;
  localProfiles: BirthProfile[];
  login: () => Promise<void>;
  change: (method: 'POST' | 'PATCH' | 'DELETE', id: string, form?: BirthFormState) => Promise<void>;
};

const BirthProfilesContext = createContext<ProfilesContext | null>(null);
const endpoint = '/api/birth-profiles';
const LOCAL_PROFILES_KEY = 'ziwei:local:birth-profiles';

function readLocalProfiles(): BirthProfile[] {
  try {
    const raw = localStorage.getItem(LOCAL_PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalProfiles(profiles: BirthProfile[]) {
  try {
    localStorage.setItem(LOCAL_PROFILES_KEY, JSON.stringify(profiles.slice(0, 20)));
  } catch { /* ignore */ }
}

export function BirthProfilesProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ProfileSession | null>(null);
  const [localProfiles, setLocalProfiles] = useState<BirthProfile[]>([]);
  const [workspaceVersion, setWorkspaceVersion] = useState(0);
  const accountId = useRef<string | null>(null);
  const reading = useRef<AbortController | null>(null);

  useEffect(() => {
    setLocalProfiles(readLocalProfiles());
  }, []);

  const acceptSession = useCallback((data: ProfileSession | null) => {
    if (data) {
      const nextId = 'accountId' in data ? data.accountId : null;
      if (accountId.current && accountId.current !== nextId) {
        clearCheckoutDraft();
        setWorkspaceVersion(version => version + 1);
      }
      accountId.current = nextId;
    }
    setSession(data);
  }, []);

  const reload = useCallback(async () => {
    reading.current?.abort();
    const request = new AbortController();
    reading.current = request;
    try {
      const response = await fetch(endpoint, { cache: 'no-store', signal: request.signal });
      const data = response.ok ? await response.json() as ProfileSession : null;
      if (!request.signal.aborted) acceptSession(data);
    } catch {
      if (!request.signal.aborted) setSession(null);
    }
  }, [acceptSession]);

  useEffect(() => {
    void reload();
    const onVisible = () => { if (document.visibilityState === 'visible') void reload(); };
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      if (accountId.current) {
        setSession(null);
        setWorkspaceVersion(version => version + 1);
      }
      void reload();
    };
    const onFocus = () => void reload();
    const stopWatching = watchAccountChanges(action => {
      if (action === 'logout') {
        clearCheckoutDraft();
        acceptSession({ signIn: null });
      }
      void reload();
    });
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', onFocus);
    return () => {
      reading.current?.abort();
      stopWatching();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', onFocus);
    };
  }, [acceptSession, reload]);

  async function login() {
    if (session && 'signIn' in session && session.signIn === 'local') {
      await commercePost('local-login', { account: 'buyer' });
      await reload();
      return;
    }
    const { pathname, searchParams } = new URL(window.location.href);
    const mode = searchParams.get('mode') === 'compatibility' ? '?mode=compatibility' : '';
    const returnPath = pathname === '/bazi' ? pathname : pathname + mode;
    window.location.assign('/api/commerce/google?return=' + encodeURIComponent(returnPath));
  }

  async function change(method: 'POST' | 'PATCH' | 'DELETE', id: string, form?: BirthFormState) {
    if (!session || !('accountId' in session)) {
      setLocalProfiles(current => {
        const next = method === 'DELETE'
          ? current.filter(profile => profile.id !== id)
          : method === 'PATCH' && form
            ? current.map(profile => profile.id === id ? { id, form } : profile)
            : form
              ? [...current.filter(profile => profile.id !== id), { id, form }]
              : current;
        writeLocalProfiles(next);
        return next;
      });
      return;
    }
    const response = await fetch(endpoint, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, form, accountId: session.accountId }),
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401 || response.status === 404) void reload();
      throw new Error(data.error ?? '操作失败，请稍后重试。');
    }
    reading.current?.abort();
    setSession(current => {
      if (!current || !('accountId' in current) || current.accountId !== session.accountId) return current;
      const exists = current.profiles.some(profile => profile.id === data.id);
      const profiles = method === 'DELETE' ? current.profiles.filter(profile => profile.id !== data.id)
        : exists ? current.profiles.map(profile => profile.id === data.id ? data as BirthProfile : profile)
        : [...current.profiles, data as BirthProfile];
      return { ...current, profiles };
    });
  }

  return <BirthProfilesContext.Provider value={{ session, localProfiles, login, change }}>
    <Fragment key={workspaceVersion}>{children}</Fragment>
  </BirthProfilesContext.Provider>;
}

function profileLabel(form: BirthFormState) {
  const date = `${form.year}年${Number(form.month) < 0 ? '闰' : ''}${Math.abs(Number(form.month))}月${form.day}日`;
  return `${form.name} · ${form.calendar === 'lunar' ? '农历' : '公历'} ${date}`;
}

export function BirthProfileControls({ form, hasValidDate, apply, focusName, focusDate }: {
  form: BirthFormState;
  hasValidDate: boolean;
  apply: (form: BirthFormState) => void;
  focusName: () => void;
  focusDate: () => void;
}) {
  const context = useContext(BirthProfilesContext);
  const session = context?.session;
  const account = session && 'accountId' in session ? session : null;
  const profiles = account ? account.profiles : (context?.localProfiles ?? []);
  const scopeKey = account ? account.accountId : 'local';
  const [selection, setSelection] = useState<{ scopeKey: string; id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);
  const pendingCreate = useRef<{ key: string; id: string } | null>(null);

  if (!context) return null;

  const selected = selection?.scopeKey === scopeKey
    ? profiles.find(profile => profile.id === selection.id)
    : undefined;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setFeedback(null);
    try { await action(); }
    catch (error) { setFeedback({ text: error instanceof Error ? error.message : '操作失败，请稍后重试。', error: true }); }
    finally { setBusy(false); }
  }

  function select(id: string) {
    setFeedback(null);
    setSelection(id ? { scopeKey, id } : null);
    const profile = profiles.find(item => item.id === id);
    if (profile) apply(profile.form);
  }

  function save(update: boolean) {
    if (!context || (update && !selected)) return;
    if (!hasValidDate || !form.name.trim()) {
      setFeedback({ text: hasValidDate ? '请先填写姓名或称呼，再保存资料。' : '请先填写有效的出生日期。', error: true });
      if (hasValidDate) focusName();
      else focusDate();
      return;
    }
    void run(async () => {
      const key = JSON.stringify([scopeKey, form]);
      const queued = pendingCreate.current?.key === key ? pendingCreate.current.id : crypto.randomUUID();
      const id = update && selected ? selected.id : queued;
      if (!update) pendingCreate.current = { key, id };
      await context.change(update ? 'PATCH' : 'POST', id, form);
      if (!update) pendingCreate.current = null;
      setSelection({ scopeKey, id });
      setFeedback({ text: update ? '出生资料已更新。' : (account ? '出生资料已保存。' : '已保存到本机浏览器，下次排盘可直接选用。') });
    });
  }

  function remove() {
    if (!context || !selected || !window.confirm(`删除「${selected.form.name}」的出生资料？`)) return;
    void run(async () => {
      await context.change('DELETE', selected.id);
      setSelection(null);
      setFeedback({ text: '出生资料已删除。' });
    });
  }

  return <div className={styles.profileControls}>
    <div className={styles.profileRow}>
      <select aria-label="已保存的出生资料" value={selected?.id ?? ''} onChange={event => select(event.target.value)} disabled={busy || !profiles.length}>
        <option value="">{profiles.length ? '选择已保存的出生资料' : '暂无已保存的出生资料'}</option>
        {profiles.map(profile => <option value={profile.id} key={profile.id}>{profileLabel(profile.form)}</option>)}
      </select>
      <button type="button" disabled={busy} onClick={() => save(false)}>{selected ? '另存为资料' : '保存资料'}</button>
    </div>
    {selected && <div className={styles.profileActions}>
      <button type="button" disabled={busy} onClick={() => save(true)}>更新所选资料</button>
      <button type="button" disabled={busy} onClick={remove}>删除所选资料</button>
    </div>}
    {!account && session && 'signIn' in session && session.signIn && (
      <div className={styles.profileActions}>
        <button type="button" disabled={busy} onClick={() => void run(context.login)}>
          {session.signIn === 'local' ? '使用本地测试账号登录（云端同步）' : '登录后可跨设备云端同步'}
        </button>
      </div>
    )}
    {feedback && <p className={feedback.error ? styles.error : styles.hint} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
  </div>;
}
