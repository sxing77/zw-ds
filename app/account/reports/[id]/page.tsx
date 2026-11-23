import { notFound } from 'next/navigation';
import CommercePage from '@/components/CommercePage';
import { LocalLogin, ReportOrder } from '@/components/ReportCommerce';
import { currentUser } from '@/lib/commerce/auth';
import { CommerceError, commerceEnabled, localTest, uuid } from '@/lib/commerce/config';
import { findOrder, orderInfo } from '@/lib/commerce/orders';

export const dynamic = 'force-dynamic';
export const metadata = { title: '合盘报告与订单', robots: { index: false } };

export default async function ReportPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ checkout?: string }>;
}) {
  const [{ id }, { checkout }] = await Promise.all([params, searchParams]);
  if (!commerceEnabled() || !uuid.test(id)) notFound();
  const user = await currentUser();
  if (!user) return <CommercePage title="查看合盘报告">
    <p>请使用购买时的账号登录。</p>
    {localTest() ? <LocalLogin /> : <a href={'/api/commerce/google?return=/account/reports/' + id}>使用 Google 登录</a>}
  </CommercePage>;
  try {
    const order = await findOrder(id, user.id);
    const title = order.product_kind === 'ziwei' ? '紫微命盘详批全书' : '紫微双人合盘报告';
    return <CommercePage title={title}>
      <ReportOrder initial={orderInfo(order)} returned={checkout === 'returned'} support={process.env.COMMERCE_SUPPORT_EMAIL} />
    </CommercePage>;
  } catch (error) {
    if (error instanceof CommerceError && error.status === 404) notFound();
    throw error;
  }
}
