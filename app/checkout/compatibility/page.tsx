import Link from 'next/link';
import CommercePage from '@/components/CommercePage';
import { Checkout } from '@/components/ReportCommerce';
import { currentUser } from '@/lib/commerce/auth';
import { localTest, salesEnabled } from '@/lib/commerce/config';

export const dynamic = 'force-dynamic';
export const metadata = { title: '确认合盘报告', robots: { index: false } };

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ login?: string }> }) {
  const enabled = salesEnabled();
  const user = enabled ? await currentUser() : null;
  const { login } = await searchParams;
  return <CommercePage title="确认合盘报告">
    {enabled ? <Checkout email={user?.email} loginFailed={login === 'failed'} local={localTest()} />
      : <p>购买服务暂未开放。<Link href="/chart?mode=compatibility">继续查看免费合盘</Link></p>}
  </CommercePage>;
}
