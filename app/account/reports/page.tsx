import Link from 'next/link';
import CommercePage from '@/components/CommercePage';
import { LocalLogin, SignOut } from '@/components/ReportCommerce';
import { currentUser, isOperator } from '@/lib/commerce/auth';
import { commerceEnabled, localTest } from '@/lib/commerce/config';
import { commerceDb } from '@/lib/commerce/db';
import { orderLabels } from '@/lib/commerce/report-format';
import styles from '@/components/ZiweiSite.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: '我的报告', robots: { index: false } };

export default async function ReportsPage() {
  const enabled = commerceEnabled();
  const user = enabled ? await currentUser() : null;
  const { rows } = user ? await commerceDb().query<{ id: string; product_kind?: 'compatibility' | 'ziwei'; status: keyof typeof orderLabels; created_at: Date }>(
    'SELECT id,product_kind,status,created_at FROM compatibility_orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [user.id]) : { rows: [] };

  return <CommercePage title="我的报告">
    {!enabled ? <p>账号服务暂未开放。</p> : !user ? <div className={styles.commerceStack}>
      <p>登录后可查看报告与订单。</p>
      <div className={styles.commerceActions}>
        <Link href="/login?return=/account/reports" className={styles.hemingPrimary}>邮箱登录 / 注册</Link>
        {localTest() ? <LocalLogin /> : <a href="/api/commerce/google?return=/account/reports" className={styles.secondaryButton}>使用 Google 登录</a>}
      </div>
    </div> : <div className={styles.commerceStack}>
      <div className={styles.commerceActions}><p>{user.email}</p><SignOut />{isOperator(user) && <Link href="/ops/orders">查单后台</Link>}</div>
      {!rows.length && <p>暂无订单。<Link href="/chart">前往紫微排盘</Link></p>}
      {rows.map(order => <Link className={styles.hemingCard} key={order.id} href={'/account/reports/' + order.id}>
        {order.product_kind === 'ziwei' ? '紫微命盘详批全书' : '紫微合盘报告'} · {orderLabels[order.status]} · {order.created_at.toISOString().slice(0, 10)}
      </Link>)}
    </div>}
  </CommercePage>;
}
