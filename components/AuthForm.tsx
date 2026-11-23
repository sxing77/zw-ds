'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { commercePost } from '@/lib/commerce/client';

interface AuthFormProps {
  enabled: boolean;
  googleEnabled: boolean;
  localTest: boolean;
  returnTo: string;
  loginFailed?: boolean;
  currentEmail?: string;
}

export default function AuthForm({
  enabled,
  googleEnabled,
  localTest,
  returnTo,
  loginFailed = false,
  currentEmail,
}: AuthFormProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(loginFailed ? '登录未完成，请重试。' : '');

  if (!enabled) {
    return (
      <div className="border border-[var(--zw-line)] border-t-[1.5px] border-t-[var(--zw-ink)] bg-[var(--zw-panel)] p-6 rounded-[2px] space-y-3">
        <h2 className="font-serif text-lg font-extrabold text-[var(--zw-ink)]">
          账号与云端服务尚未开启
        </h2>
        <p className="text-xs text-[var(--zw-muted)] leading-relaxed">
          当前运行环境尚未配置数据库（<code className="text-[var(--zw-ink)]">DATABASE_URL</code>），云端登录、注册与跨设备订单同步暂不可用。
        </p>
        <p className="text-xs text-[var(--zw-muted)] leading-relaxed">
          你仍可正常使用紫微排盘、主星批注试读，以及保存在本机浏览器的生辰档案快速选择功能。
        </p>
        <div className="pt-2">
          <Link
            href="/chart"
            className="inline-flex items-center justify-center bg-[var(--zw-button)] text-white px-5 py-2.5 text-xs font-bold tracking-[0.12em] rounded-[2px] hover:brightness-110 transition-all"
          >
            前往紫微排盘
          </Link>
        </div>
      </div>
    );
  }

  if (currentEmail) {
    return (
      <div className="border border-[var(--zw-line)] border-t-[1.5px] border-t-[var(--zw-ink)] bg-[var(--zw-panel)] p-6 rounded-[2px] space-y-4">
        <div>
          <div className="text-xs text-[var(--zw-muted)]">当前已登录账号</div>
          <div className="mt-1 font-serif text-lg font-bold text-[var(--zw-ink)]">{currentEmail}</div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/account/reports"
            className="inline-flex items-center justify-center bg-[var(--zw-button)] text-white px-5 py-2.5 text-xs font-bold tracking-[0.12em] rounded-[2px] hover:brightness-110 transition-all"
          >
            查看我的报告
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await commercePost('logout');
                window.location.reload();
              } catch (e) {
                setError(e instanceof Error ? e.message : '退出失败。');
                setBusy(false);
              }
            }}
            className="inline-flex items-center justify-center border border-[var(--zw-line)] px-5 py-2.5 text-xs font-semibold text-[var(--zw-ink)] rounded-[2px] hover:border-[var(--zw-accent)] hover:text-[var(--zw-accent)] transition-colors"
          >
            退出登录
          </button>
        </div>
        {error && <p role="alert" className="text-xs text-[var(--zw-accent)]">{error}</p>}
      </div>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (mode === 'register' && password !== confirmPassword) {
      setError('两次输入的密码不一致。');
      return;
    }
    setBusy(true);
    try {
      await commercePost(mode === 'register' ? 'register' : 'login', { email, password });
      window.location.assign(returnTo);
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败，请重试。');
      setBusy(false);
    }
  }

  return (
    <div className="border border-[var(--zw-line)] border-t-[1.5px] border-t-[var(--zw-ink)] bg-[var(--zw-panel)] p-6 rounded-[2px] space-y-5">
      {/* 模式切换 */}
      <div className="grid grid-cols-2 border-b border-[var(--zw-line)]">
        <button
          type="button"
          onClick={() => { setMode('login'); setError(''); }}
          className={`pb-2.5 text-sm font-serif font-bold border-b-2 transition-colors ${
            mode === 'login'
              ? 'border-[var(--zw-accent)] text-[var(--zw-accent)]'
              : 'border-transparent text-[var(--zw-muted)] hover:text-[var(--zw-ink)]'
          }`}
        >
          邮箱登录
        </button>
        <button
          type="button"
          onClick={() => { setMode('register'); setError(''); }}
          className={`pb-2.5 text-sm font-serif font-bold border-b-2 transition-colors ${
            mode === 'register'
              ? 'border-[var(--zw-accent)] text-[var(--zw-accent)]'
              : 'border-transparent text-[var(--zw-muted)] hover:text-[var(--zw-ink)]'
          }`}
        >
          注册新账号
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="auth-email" className="block text-xs font-semibold text-[var(--zw-ink)]">
            邮箱地址
          </label>
          <input
            id="auth-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="w-full border border-[var(--zw-line)] bg-[var(--zw-input)] px-3.5 py-2.5 text-sm text-[var(--zw-ink)] placeholder:text-[var(--zw-muted)] rounded-[2px] focus:border-[var(--zw-ink)] focus:outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="auth-password" className="block text-xs font-semibold text-[var(--zw-ink)]">
            密码{mode === 'register' ? '（至少 8 位）' : ''}
          </label>
          <input
            id="auth-password"
            type="password"
            required
            minLength={mode === 'register' ? 8 : 1}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={mode === 'register' ? '请设置至少 8 位密码' : '请输入密码'}
            className="w-full border border-[var(--zw-line)] bg-[var(--zw-input)] px-3.5 py-2.5 text-sm text-[var(--zw-ink)] placeholder:text-[var(--zw-muted)] rounded-[2px] focus:border-[var(--zw-ink)] focus:outline-none"
          />
        </div>

        {mode === 'register' && (
          <div className="space-y-1.5">
            <label htmlFor="auth-password-confirm" className="block text-xs font-semibold text-[var(--zw-ink)]">
              确认密码
            </label>
            <input
              id="auth-password-confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="再次输入密码"
              className="w-full border border-[var(--zw-line)] bg-[var(--zw-input)] px-3.5 py-2.5 text-sm text-[var(--zw-ink)] placeholder:text-[var(--zw-muted)] rounded-[2px] focus:border-[var(--zw-ink)] focus:outline-none"
            />
          </div>
        )}

        {error && (
          <p role="alert" className="text-xs text-[var(--zw-accent)]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full min-h-[42px] bg-[var(--zw-button)] text-white text-xs font-bold tracking-[0.14em] rounded-[2px] hover:brightness-110 transition-all disabled:opacity-50"
        >
          {busy ? '处理中…' : mode === 'register' ? '注册并登录' : '登录'}
        </button>
      </form>

      {(googleEnabled || localTest) && (
        <div className="border-t border-dashed border-[var(--zw-line)] pt-4 space-y-2.5">
          <div className="text-[11px] text-[var(--zw-muted)]">其他登录方式</div>
          <div className="flex flex-wrap gap-2.5">
            {googleEnabled && (
              <a
                href={'/api/commerce/google?return=' + encodeURIComponent(returnTo)}
                className="inline-flex items-center justify-center border border-[var(--zw-line)] bg-transparent px-4 py-2 text-xs font-semibold text-[var(--zw-ink)] rounded-[2px] hover:border-[var(--zw-ink)] transition-colors"
              >
                使用 Google 登录
              </a>
            )}
            {localTest && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    await commercePost('local-login', { account: 'buyer' });
                    window.location.assign(returnTo);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : '登录失败。');
                    setBusy(false);
                  }
                }}
                className="inline-flex items-center justify-center border border-[var(--zw-line)] bg-transparent px-4 py-2 text-xs font-semibold text-[var(--zw-ink)] rounded-[2px] hover:border-[var(--zw-ink)] transition-colors"
              >
                使用本地测试账号
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
