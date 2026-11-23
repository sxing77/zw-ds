import { notFound } from 'next/navigation';
import CommercePage from '@/components/CommercePage';
import { LocalLogin, ReportOrder, SignOut } from '@/components/ReportCommerce';
import { currentUser, isOperator } from '@/lib/commerce/auth';
import { CommerceError, commerceEnabled, localTest } from '@/lib/commerce/config';
import { findOrder, orderInfo } from '@/lib/commerce/orders';
import styles from '@/components/ZiweiSite.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: '订单运维', robots: { index: false } };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  if (!commerceEnabled()) notFound();
  const user = await currentUser();
  if (!user || !isOperator(user)) {
    if (localTest()) return <CommercePage title="订单运维"><LocalLogin account="operator" /></CommercePage>;
    if (!user) return <CommercePage title="订单运维"><a href="/api/commerce/google?return=/ops/orders">使用 Google 登录</a></CommercePage>;
    notFound();
  }
  const { id } = await searchParams;
  let order;
  try { if (typeof id === 'string' && id.trim()) order = await findOrder(id.trim()); }
  catch (error) { if (!(error instanceof CommerceError && error.status === 404)) throw error; }

  return <CommercePage title="订单运维">
    <div className={styles.commerceStack}>
      <SignOut />
      <form action="/ops/orders" className={styles.commerceActions}>
        <input name="id" aria-label="订单号" required defaultValue={id} className="input-base" />
        <button type="submit" className={styles.secondaryButton}>查订单</button>
      </form>
      {order ? <ReportOrder key={order.id} initial={orderInfo(order, true)} operator />
        : id && <p role="status">找不到该订单。</p>}
    </div>
  </CommercePage>;
}
