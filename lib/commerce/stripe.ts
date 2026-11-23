import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { CommerceError } from './config';
import { commerceDb } from './db';
import { findOrder, markPaid, type Order } from './orders';

type Session = {
  id: string; url: string | null;
  livemode: boolean; mode: string; status: string; payment_status: string;
  amount_total: number; currency: string; client_reference_id: string;
  metadata: { order_id?: string };
  payment_intent: { id: string; latest_charge?: { refunded: boolean } } | null;
};

async function stripe<T>(path: string, params?: URLSearchParams, idempotencyKey?: string): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new CommerceError(503, '支付渠道暂未配置。');
  const headers = new Headers({ Authorization: 'Bearer ' + key });
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
  const res = await fetch('https://api.stripe.com/v1' + path, {
    method: params ? 'POST' : 'GET', body: params, headers, cache: 'no-store', signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) {
    console.warn('[commerce:stripe]', res.status, res.headers.get('request-id'));
    throw new CommerceError(502, '支付渠道暂时不可用，请重试或联系支持。');
  }
  return res.json();
}

function checkoutSession(id: string) {
  if (!/^cs_[a-zA-Z0-9_]+$/.test(id)) throw new CommerceError(400, '结账会话无效。');
  return stripe<Session>('/checkout/sessions/' + id + '?expand[]=payment_intent.latest_charge');
}

function stripeLive() {
  return /^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY ?? '');
}

async function reconcileSession(session: Session) {
  const id = session.metadata?.order_id;
  if (!id) return;
  const order = await findOrder(id);
  if (order.provider !== 'stripe' || session.client_reference_id !== order.id ||
      (order.stripe_session && order.stripe_session !== session.id) || session.livemode !== stripeLive() ||
      session.mode !== 'payment' || session.amount_total !== order.amount_cents || session.currency !== order.currency) {
    throw new CommerceError(409, '支付资料与订单不一致。');
  }
  await commerceDb().query(
    'UPDATE compatibility_orders SET stripe_session=$2 WHERE id=$1 AND stripe_session IS NULL', [id, session.id]);
  if (session.payment_intent?.latest_charge?.refunded) {
    await commerceDb().query(
      "UPDATE compatibility_orders SET status='refunded', payment_intent=$2, task_token=NULL, task_until=NULL WHERE id=$1 AND (payment_intent IS NULL OR payment_intent=$2)",
      [id, session.payment_intent.id]);
  } else if (session.payment_status === 'paid' && session.payment_intent?.id) {
    await markPaid(order, session.payment_intent.id);
  } else if (session.status === 'expired') {
    await commerceDb().query("UPDATE compatibility_orders SET status='expired' WHERE id=$1 AND status='pending'", [id]);
  }
}

export async function reconcileOrder(order: Order) {
  if (order.provider !== 'stripe' || !order.stripe_session) return;
  await reconcileSession(await checkoutSession(order.stripe_session));
  if (order.status === 'refunding' && order.stripe_refund) {
    const refund = await stripe<{ status: string }>('/refunds/' + encodeURIComponent(order.stripe_refund));
    if (refund.status === 'failed' || refund.status === 'canceled') {
      await commerceDb().query("UPDATE compatibility_orders SET status='paid' WHERE id=$1 AND status='refunding'", [order.id]);
    }
  }
}

export async function refundOrder(order: Order) {
  if (order.provider !== 'stripe' || !order.payment_intent || order.status !== 'paid') {
    throw new CommerceError(409, '当前订单无法申请退款。');
  }
  const refund = await stripe<{ id: string; status: string }>('/refunds', new URLSearchParams({
    payment_intent: order.payment_intent, 'metadata[order_id]': order.id,
  }), 'compatibility-refund-' + order.id + '-' + (order.stripe_refund ?? 'first'));
  await commerceDb().query(
    "UPDATE compatibility_orders SET status=$2, stripe_refund=$3, task_token=NULL, task_until=NULL WHERE id=$1 AND status='paid'",
    [order.id, refund.status === 'succeeded' ? 'refunded' : ['failed','canceled'].includes(refund.status) ? 'paid' : 'refunding', refund.id]);
}

export async function stripeWebhook(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get('stripe-signature')?.split(',') ?? [];
  const timestamp = signature.find(part => part.startsWith('t='))?.slice(2);
  if (!secret || !timestamp || !/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1_000 - Number(timestamp)) > 300) {
    throw new CommerceError(400, '支付回调签名无效。');
  }
  const raw = await request.text();
  const hash = createHmac('sha256', secret).update(timestamp + '.' + raw).digest();
  if (!signature.some(part => /^v1=[0-9a-f]{64}$/i.test(part) && timingSafeEqual(hash, Buffer.from(part.slice(3), 'hex')))) {
    throw new CommerceError(400, '支付回调签名无效。');
  }
  const event = JSON.parse(raw);
  if (event.livemode !== stripeLive()) throw new CommerceError(400, '支付回调环境不匹配。');
  const object = event.data?.object;
  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.expired'].includes(event.type)) {
    if (object?.metadata?.order_id) await reconcileSession(await checkoutSession(object.id));
  } else if (event.type === 'charge.refunded' && object?.refunded && typeof object.payment_intent === 'string') {
    await commerceDb().query(
      "UPDATE compatibility_orders SET status='refunded', task_token=NULL, task_until=NULL WHERE provider='stripe' AND payment_intent=$1", [object.payment_intent]);
  }
}
