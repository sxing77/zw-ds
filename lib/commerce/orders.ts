import 'server-only';
import { randomUUID } from 'node:crypto';
import type { BirthInfo } from '@/lib/ziwei/types';
import { LUNAR_YEAR_MIN, LUNAR_YEAR_MAX } from '@/lib/ziwei/lunar-solar';
import { isValidGregorianDate } from '@/lib/ziwei/true-solar-time';
import { currency, CommerceError, paymentProvider, uuid } from './config';
import { commerceDb } from './db';
import { REPORT_PRODUCTS, type ReportChapter, type ReportFollowup } from './report-format';

export type OrderProductKind = 'compatibility' | 'ziwei';

export type Order = {
  id: string; user_id: string; product_kind?: OrderProductKind; birth_a: BirthInfo; birth_b: BirthInfo | null;
  status: 'pending' | 'paid' | 'refunding' | 'refunded' | 'expired';
  provider: 'local' | 'stripe' | 'waffo'; amount_cents: number; currency: string;
  stripe_session: string | null; payment_intent: string | null; stripe_refund: string | null;
  waffo_store: string | null; waffo_product: string | null; waffo_environment: string | null;
  waffo_checkout_started_at: Date | null; waffo_checkout_url: string | null; waffo_checkout_expires_at: Date | null;
  waffo_payment_id: string | null; waffo_payment_review: boolean; waffo_refund_ticket: string | null;
  report: ReportChapter[] | null; followups: ReportFollowup[];
  generation_failed: boolean; task_until: Date | null; created_at: Date;
};

export function birthInfo(value: unknown): BirthInfo | null {
  if (!value || typeof value !== 'object') return null;
  const { year, month, day, hour, gender, unknownTime } = value as Partial<BirthInfo> & { unknownTime?: boolean };
  if (typeof year !== 'number' || year < LUNAR_YEAR_MIN || year > LUNAR_YEAR_MAX ||
      typeof month !== 'number' || typeof day !== 'number' || !isValidGregorianDate(year, month, day) ||
      typeof hour !== 'number' || !Number.isInteger(hour) || hour < 0 || hour > 11 || unknownTime === true ||
      (gender !== 'male' && gender !== 'female')) return null;
  return { year, month, day, hour, gender };
}

export async function findOrder(id: string, userId?: string) {
  if (!uuid.test(id)) throw new CommerceError(404, '找不到订单。');
  const result = userId
    ? await commerceDb().query<Order>('SELECT * FROM compatibility_orders WHERE id=$1 AND user_id=$2', [id, userId])
    : await commerceDb().query<Order>('SELECT * FROM compatibility_orders WHERE id=$1', [id]);
  if (!result.rows[0]) throw new CommerceError(404, '找不到订单。');
  return result.rows[0];
}

export async function createOrder(
  userId: string,
  requestId: unknown,
  a: unknown,
  b: unknown,
  productKind: OrderProductKind = 'compatibility',
) {
  const birthA = birthInfo(a);
  const birthB = productKind === 'compatibility' ? birthInfo(b) : null;
  if (!birthA || (productKind === 'compatibility' && !birthB) || typeof requestId !== 'string' || !uuid.test(requestId)) {
    throw new CommerceError(400, productKind === 'ziwei' ? '请先填写出生资料并重新排盘。' : '请先填写双方出生资料并重新排盘。');
  }
  const orderAmountCents = REPORT_PRODUCTS[productKind].amountCents;
  const { rows: [order] } = await commerceDb().query<Order>(`
    INSERT INTO compatibility_orders (id,user_id,request_id,product_kind,birth_a,birth_b,amount_cents,currency,provider)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (user_id,request_id) DO UPDATE SET request_id=excluded.request_id
      WHERE compatibility_orders.product_kind=excluded.product_kind
        AND compatibility_orders.birth_a=excluded.birth_a
        AND compatibility_orders.birth_b IS NOT DISTINCT FROM excluded.birth_b
        AND compatibility_orders.provider=excluded.provider
    RETURNING *`, [randomUUID(), userId, requestId, productKind, birthA, birthB, orderAmountCents, currency, paymentProvider()]);
  if (!order) throw new CommerceError(409, '出生资料已变更，请返回重新排盘。');
  return order;
}

export async function markPaid(order: Order, paymentIntent: string | null) {
  await commerceDb().query(
    "UPDATE compatibility_orders SET status='paid', paid_at=now(), payment_intent=$2 WHERE id=$1 AND status IN ('pending','expired')",
    [order.id, paymentIntent],
  );
}

export function orderInfo(order: Order, operator = false) {
  return {
    id: order.id, productKind: order.product_kind ?? 'compatibility', provider: order.provider, status: order.status, createdAt: order.created_at,
    amountCents: order.amount_cents, currency: order.currency,
    birthA: operator ? undefined : order.birth_a, birthB: operator ? undefined : order.birth_b ?? undefined,
    report: !operator && order.status === 'paid' ? order.report : null,
    followups: !operator && order.status === 'paid' ? order.followups : [],
    delivered: Boolean(order.report),
    generationFailed: order.generation_failed,
    processing: Boolean(order.task_until && order.task_until > new Date()),
  };
}
