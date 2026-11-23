'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  clearCheckoutDraft,
  clearZiweiCheckoutDraft,
  commercePost,
  readCheckoutDraft,
  readZiweiCheckoutDraft,
  watchAccountChanges,
  type CheckoutDraft,
  type ZiweiCheckoutDraft,
} from '@/lib/commerce/client';
import { orderLabels, REPORT_PRODUCTS, reportAmountCents, reportFollowupLimit, type ReportChapter, type ReportFollowup } from '@/lib/commerce/report-format';
import { SHICHEN } from '@/lib/ziwei/constants';
import type { BirthInfo } from '@/lib/ziwei/types';
import styles from './ZiweiSite.module.css';

export type ReportOrderView = {
  id: string; productKind?: 'compatibility' | 'ziwei'; status: keyof typeof orderLabels; provider: 'local' | 'stripe' | 'waffo'; amountCents: number;
  birthA?: BirthInfo; birthB?: BirthInfo; report: ReportChapter[] | null; followups: ReportFollowup[];
  delivered: boolean; generationFailed: boolean; processing: boolean;
};

const price = (amount: number) => 'US$' + (amount / 100).toFixed(2);
const dateLabel = (birth: BirthInfo) => birth.year + '年' + birth.month + '月' + birth.day + '日 · ' +
  SHICHEN[birth.hour].name + ' · ' + (birth.gender === 'male' ? '男' : '女');

export function Checkout({ email, loginFailed, local, kind = 'compatibility' }: {
  email?: string; loginFailed: boolean; local: boolean; kind?: 'compatibility' | 'ziwei';
}) {
  const isZiwei = kind === 'ziwei';
  const [draft, setDraft] = useState<CheckoutDraft | ZiweiCheckoutDraft | null>();
  const [error, setError] = useState(loginFailed ? '登录未完成，请重试。' : '');
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const saved = isZiwei ? readZiweiCheckoutDraft() : readCheckoutDraft();
    setDraft(saved);
    function discard() {
      if (isZiwei) clearZiweiCheckoutDraft();
      else clearCheckoutDraft();
      setDraft(null);
    }
    const timeout = saved ? window.setTimeout(discard, saved.expiresAt - Date.now()) : undefined;
    const stopWatching = watchAccountChanges(action => { if (action === 'logout') discard(); });
    return () => { window.clearTimeout(timeout); stopWatching(); };
  }, [isZiwei]);

  async function proceed() {
    if (!draft || pending) return;
    const saved = isZiwei ? readZiweiCheckoutDraft() : readCheckoutDraft();
    if (!saved) { setDraft(null); return; }
    setPending(true);
    setError('');
    try {
      const payload = isZiwei
        ? { productKind: 'ziwei', birthA: saved.birthA, requestId: saved.requestId }
        : { productKind: 'compatibility', birthA: (saved as CheckoutDraft).birthA, birthB: (saved as CheckoutDraft).birthB, requestId: saved.requestId };
      const { url } = await commercePost<{ url: string }>('checkout', payload);
      if (isZiwei) clearZiweiCheckoutDraft();
      else clearCheckoutDraft();
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建订单失败。');
      setPending(false);
    }
  }

  const product = REPORT_PRODUCTS[kind];
  const compatDraft = !isZiwei && draft && 'birthB' in draft ? draft : null;

  return (
    <div className={styles.commerceStack}>
      <p>一次购买，含{product.title}完整四章、账号内永久回看和 {reportFollowupLimit} 次追问。</p>
      {error && <p role="alert" className={styles.hemingError}>{error}</p>}
      {draft === undefined && <p>正在恢复排盘资料…</p>}
      {draft === null && (
        <p>
          请先 <Link href={isZiwei ? '/chart' : '/chart?mode=compatibility'}>{isZiwei ? '排出个人命盘' : '排出双人命盘'}</Link>，再从报告预览进入购买。
        </p>
      )}
      {draft && <div className={styles.hemingCard}>
        <h2>{isZiwei ? '确认这次紫微命盘' : '确认这次合盘'}</h2>
        <p>{isZiwei ? '命主' : '甲方'} · {dateLabel(draft.birthA)}</p>
        {compatDraft && <p>乙方 · {dateLabel(compatDraft.birthB)}</p>}
        <p className="text-sm">日期与时辰为排盘校正后的结果。</p>
      </div>}
      {email ? <div className={styles.commerceActions}>
        <button type="button" className={styles.hemingPrimary} disabled={!draft || pending} onClick={proceed}>{pending ? '正在创建订单…' : '购买报告 · ' + price(reportAmountCents)}</button>
        <Link href="/account/reports" className={styles.secondaryButton}>我的报告</Link>
      </div> : <>
        <p>登录后，同一账号可在其他设备查看已购报告。</p>
        <div className={styles.commerceActions}>
          <Link href={'/login?return=' + encodeURIComponent(isZiwei ? '/checkout/ziwei' : '/checkout/compatibility')} className={styles.hemingPrimary}>
            邮箱登录 / 注册
          </Link>
          {local ? <button type="button" className={styles.secondaryButton} disabled={pending} onClick={async () => {
            setPending(true);
            try {
              await commercePost('local-login', { account: 'buyer' });
              window.location.reload();
            } catch (e) { setError((e as Error).message); setPending(false); }
          }}>使用本地测试账号</button>
            : <a href={'/api/commerce/google?return=' + encodeURIComponent(isZiwei ? '/checkout/ziwei' : '/checkout/compatibility')} className={styles.secondaryButton}>使用 Google 登录</a>}
        </div>
      </>}
    </div>
  );
}

export function ReportOrder({ initial, operator = false, returned = false, support }: {
  initial: ReportOrderView; operator?: boolean; returned?: boolean; support?: string;
}) {
  const [order, setOrder] = useState(initial);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');
  const followupRequest = useRef<{ question: string; id: string } | null>(null);

  async function act(action: string, data?: object) {
    if (busy) return;
    setBusy(action);
    setError('');
    try {
      if (action === 'resume-checkout') {
        const { url } = await commercePost<{ url: string }>(action, { id: order.id });
        window.location.assign(url);
      } else {
        setOrder(await commercePost<ReportOrderView>(action, { id: order.id, ...data }));
        if (action === 'followup') {
          setQuestion('');
          followupRequest.current = null;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作未完成，请稍后重试。');
    } finally {
      setBusy('');
    }
  }

  useEffect(() => {
    if (!returned || initial.status !== 'pending') return;
    void act('refresh');
    // Query the provider once on return. The refresh action remains available when payment is still pending.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const paid = order.status === 'paid';
  const remaining = reportFollowupLimit - order.followups.length;
  const actionButton = (label: string, action: string) => (
    <button type="button" className={styles.secondaryButton} disabled={Boolean(busy)} onClick={() => void act(action)}>{label}</button>
  );
  function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (!text || busy) return;
    if (followupRequest.current?.question !== text) followupRequest.current = { question: text, id: crypto.randomUUID() };
    void act('followup', { question: text, requestId: followupRequest.current.id });
  }

  return (
    <div className={styles.commerceStack}>
      <div className={styles.hemingCard}>
        <p><strong>{orderLabels[order.status]}</strong> · {price(order.amountCents)}{order.provider === 'local' && ' · 本地测试订单'}</p>
        <p>订单号 <code>{order.id}</code></p>
        {order.birthA && <p>{order.productKind === 'ziwei' ? '命主' : '甲方'} · {dateLabel(order.birthA)}</p>}
        {order.birthB && <p>乙方 · {dateLabel(order.birthB)}</p>}
      </div>
      {busy && <p role="status">{busy === 'generate' || busy === 'ops-retry' || busy === 'followup' ? '正在生成，请稍候…' : '正在处理订单…'}</p>}
      {error && <p role="alert" className={styles.hemingError}>{error}</p>}
      {!operator && order.status === 'pending' && <div className={styles.commerceActions}>
        {order.provider === 'local' && actionButton('模拟付款成功', 'local-payment')}
        {order.provider === 'waffo' && actionButton('继续前往 Waffo 收银台', 'resume-checkout')}
        {order.provider === 'stripe' && <p>旧渠道订单，请先核对付款状态。</p>}
        {actionButton('刷新付款状态', 'refresh')}
      </div>}
      {order.status === 'refunding' && !operator && actionButton('刷新退款状态', 'refresh')}
      {!operator && order.status === 'expired' && <Link href={order.productKind === 'ziwei' ? '/chart' : '/chart?mode=compatibility'} className={styles.secondaryButton}>重新排盘购买</Link>}
      {paid && !order.delivered && <>
        {order.processing ? <p>报告正在处理，可稍后刷新状态。</p>
          : <p>{order.generationFailed ? '上次生成未完成，可以免费重试。' : `付款已确认，可以生成${order.productKind === 'ziwei' ? '完整紫微命盘详批' : '完整合盘报告'}。`}</p>}
        <div className={styles.commerceActions}>
          {!order.processing && actionButton(order.generationFailed ? '重试生成报告' : '生成完整报告', operator ? 'ops-retry' : 'generate')}
          {!operator && actionButton('刷新交付状态', 'refresh')}
        </div>
      </>}
      {operator && <div className={styles.commerceActions}>
        {actionButton('核对支付状态', 'ops-reconcile')}
        {paid && <button type="button" className={styles.secondaryButton} disabled={Boolean(busy)} onClick={() => {
          if (window.confirm('确认全额退款？退款生效后将收回报告访问权限。')) void act('ops-refund');
        }}>申请全额退款</button>}
      </div>}
      {paid && order.report && !operator && <>
        {order.report.map(chapter => <section key={chapter.title} className={styles.hemingCard}><h2>{chapter.title}</h2><p className="whitespace-pre-wrap">{chapter.body}</p></section>)}
        <section className={styles.hemingCard}>
          <h2>针对本报告追问</h2>
          <p>剩余 {remaining} 次</p>
          {order.followups.map((item, index) => <div className="mt-4" key={index}><h3>{item.question}</h3><p className="whitespace-pre-wrap">{item.answer}</p></div>)}
          {remaining > 0 && <form className={styles.commerceStack} onSubmit={submitQuestion}>
            <textarea aria-label="追问内容" value={question} onChange={event => setQuestion(event.target.value)} maxLength={1000} rows={3} className="input-base mt-3" />
            <button className={styles.hemingPrimary} disabled={Boolean(busy) || !question.trim()}>提交追问</button>
          </form>}
        </section>
      </>}
      {support && <p>订单协助或退款请联系 <a href={'mailto:' + support}>{support}</a>，并附上订单号。</p>}
      {!operator && <Link href="/account/reports">返回我的报告</Link>}
    </div>
  );
}

export function SignOut() {
  const [error, setError] = useState('');
  return <div><button type="button" className={styles.secondaryButton} onClick={async () => {
    try { await commercePost('logout'); window.location.assign('/'); }
    catch (e) { setError((e as Error).message); }
  }}>退出登录</button>{error && <p role="alert">{error}</p>}</div>;
}

export function LocalLogin({ account = 'buyer' }: { account?: 'buyer' | 'operator' }) {
  const [error, setError] = useState('');
  return <div><button type="button" className={styles.secondaryButton} onClick={async () => {
    try { await commercePost('local-login', { account }); window.location.reload(); }
    catch (e) { setError((e as Error).message); }
  }}>{account === 'operator' ? '使用本地运营账号' : '使用本地测试账号'}</button>{error && <p role="alert">{error}</p>}</div>;
}
