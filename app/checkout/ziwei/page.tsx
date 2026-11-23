import Link from 'next/link';
import CommercePage from '@/components/CommercePage';
import { Checkout } from '@/components/ReportCommerce';
import { currentUser } from '@/lib/commerce/auth';
import { localTest, salesEnabled } from '@/lib/commerce/config';

export const dynamic = 'force-dynamic';
export const metadata = { title: '确认紫微详批报告', robots: { index: false } };

export default async function ZiweiCheckoutPage({ searchParams }: { searchParams: Promise<{ login?: string }> }) {
  const enabled = salesEnabled();
  const user = enabled ? await currentUser() : null;
  const { login } = await searchParams;
  return <CommercePage title="确认紫微命盘详批">
    {enabled ? <Checkout kind="ziwei" email={user?.email} loginFailed={login === 'failed'} local={localTest()} />
      : <p>购买服务暂未开放。<Link href="/chart">返回紫微排盘</Link></p>}
  </CommercePage>;
}
