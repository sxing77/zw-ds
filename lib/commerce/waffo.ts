import 'server-only';
import { createHash, sign, verify } from 'node:crypto';
import { CommerceError, reportPath, uuid, waffoConfig } from './config';
import { commerceDb } from './db';
import { findOrder, type Order } from './orders';

type WaffoConfig = ReturnType<typeof waffoConfig>;
const checkoutSeconds = 30 * 60;
const paymentIdPattern = /^PAY_[a-z0-9]+$/i;

async function post<T>(config: WaffoConfig, path: string, input: object, idempotencyKey?: string): Promise<T> {
  const body = JSON.stringify(input);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const digest = createHash('sha256').update(body).digest('base64');
  const signature = sign('RSA-SHA256', Buffer.from(`POST\n${path}\n${timestamp}\n${digest}`), config.privateKey).toString('base64');
  const response = await fetch('https://api.waffo.ai' + path, {
    method: 'POST', body, cache: 'no-store', signal: AbortSignal.timeout(10_000),
    headers: { 'Content-Type': 'application/json', 'X-Merchant-Id': config.merchantId, 'X-Timestamp': timestamp,
      'X-Signature': signature, ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}) },
  }).catch(() => { throw new CommerceError(502, 'Waffo 暂时无法连接，请稍后重试。'); });
  const result = await response.json().catch(() => null) as { data?: T; errors?: unknown[] } | null;
  if (!response.ok || !result?.data || result.errors?.length) {
    console.warn('[commerce:waffo]', path, response.status);
    throw new CommerceError(response.status === 409 ? 409 : 502, 'Waffo 未完成操作，请先核对订单状态。');
  }
  return result.data;
}

function orderConfig(order: Order) {
  const config = waffoConfig();
  if (order.waffo_store && (order.waffo_store !== config.store || order.waffo_environment !== config.environment)) {
    throw new CommerceError(409, '订单属于另一套 Waffo 商店或环境，请联系支持。');
  }
  return config;
}

function cents(amount: unknown) {
  return typeof amount === 'string' && /^\d{1,8}(?:\.\d{1,2})?$/.test(amount) ? Math.round(Number(amount) * 100) : null;
}

function matchesPrice(order: Order, amount: unknown, currency: unknown) {
  return cents(amount) === order.amount_cents && typeof currency === 'string' && currency.toLowerCase() === order.currency;
}

function checkoutLink(url: string, environment: WaffoConfig['environment']) {
  if (!URL.canParse(url)) throw new CommerceError(502, 'Waffo 收银台地址无效。');
  const parsed = new URL(url);
  if (!['https://checkout.waffo.ai', 'https://pancake.waffo.ai'].includes(parsed.origin) || parsed.username || parsed.password) {
    throw new CommerceError(502, 'Waffo 收银台地址无效。');
  }
  if (environment === 'test') parsed.searchParams.set('test', 'true');
  return parsed;
}

const paymentReview = () => new CommerceError(409, 'Waffo 付款金额或币种需运营核对，请联系支持。');

export async function waffoCheckoutUrl(order: Order, origin: string) {
  const destination = origin + reportPath + '/' + order.id;
  if (order.status === 'expired') throw new CommerceError(409, '这笔结账已过期，请重新排盘购买。');
  if (order.status !== 'pending') return destination;
  const config = orderConfig(order);
  const db = commerceDb();

  if (order.waffo_checkout_started_at) {
    await reconcileWaffo(order);
    order = await findOrder(order.id);
    if (order.status !== 'pending') return destination;
  } else {
    const waffoProduct = (order.product_kind ?? 'compatibility') === 'ziwei' ? config.ziweiProduct : config.product;
    await db.query(`UPDATE compatibility_orders SET waffo_checkout_started_at=now(), waffo_environment=$2, waffo_store=$3, waffo_product=$4
      WHERE id=$1 AND status='pending' AND waffo_checkout_started_at IS NULL`, [order.id, config.environment, config.store, waffoProduct]);
    order = await findOrder(order.id);
    if (order.status !== 'pending') return destination;
    orderConfig(order);
  }

  let url = order.waffo_checkout_url;
  if (!url) {
    // Waffo retains idempotency keys for 60 s. Do not create another payable link after an ambiguous timeout.
    if (!order.waffo_checkout_started_at || Date.now() - order.waffo_checkout_started_at.getTime() >= 45_000) {
      throw new CommerceError(409, '收银台状态待确认，请刷新付款状态或联系支持。');
    }
    const session = await post<{ checkoutUrl: string; expiresAt: string }>(config, '/v1/actions/checkout/create-session', {
      productId: order.waffo_product,
      currency: order.currency.toUpperCase(),
      priceSnapshot: { amount: (order.amount_cents / 100).toFixed(2), taxIncluded: true, taxCategory: config.taxCategory },
      orderMerchantExternalId: order.id, successUrl: destination + '?checkout=returned',
      expiresInSeconds: checkoutSeconds, allowPromotionCodes: false,
    }, `${order.product_kind ?? 'compatibility'}-checkout-${order.id}`);
    const expiry = new Date(session.expiresAt);
    if (typeof session.checkoutUrl !== 'string' || !Number.isFinite(expiry.getTime())) throw new CommerceError(502, 'Waffo 收银台暂不可用。');
    url = checkoutLink(session.checkoutUrl, config.environment).href;
    await db.query('UPDATE compatibility_orders SET waffo_checkout_url=$2, waffo_checkout_expires_at=$3 WHERE id=$1 AND waffo_checkout_url IS NULL',
      [order.id, url, expiry]);
  }
  const link = checkoutLink(url, config.environment);
  const { token } = await post<{ token: string }>(config, '/v1/actions/auth/issue-session-token', {
    productId: order.waffo_product, buyerIdentity: order.user_id,
  });
  if (!token) throw new CommerceError(502, '无法登录 Waffo 收银台，请稍后重试。');
  link.hash = new URLSearchParams({ token }).toString();
  return link.href;
}

type Refund = { status: string; pspAmountDetails?: { amount: string; currency: string } };
type Payment = { id: string; orderId: string; status: string; orderMerchantExternalId: string;
  snapshotAmountDetails?: { total: string; currency: string }; refunds: Refund[] };

async function recordPayment(order: Order, paymentId: string, refunded: boolean, confirmedCharge = false) {
  await commerceDb().query(`UPDATE compatibility_orders
    SET status=$3, waffo_payment_id=$2, paid_at=COALESCE(paid_at,now()),
      waffo_payment_review=CASE WHEN $4 THEN false ELSE waffo_payment_review END,
      task_token=CASE WHEN $3='refunded' THEN NULL ELSE task_token END,
      task_until=CASE WHEN $3='refunded' THEN NULL ELSE task_until END
    WHERE provider='waffo' AND id=$1 AND (waffo_payment_id IS NULL OR waffo_payment_id=$2)
      AND ($4 OR NOT waffo_payment_review)
      AND (status IN ('pending','expired') OR ($3='refunded' AND status IN ('paid','refunding')))`,
  [order.id, paymentId, refunded ? 'refunded' : 'paid', confirmedCharge]);
}

const refundReference = (order: Order) => 'compatibility-refund-' + order.id;

export async function reconcileWaffo(order: Order) {
  if (!order.waffo_checkout_started_at || order.status === 'refunded') return;
  if (order.waffo_payment_review) throw paymentReview();
  const config = orderConfig(order);
  const { payments, onetimeOrders } = await post<{ payments: Payment[]; onetimeOrders: { id: string }[] }>(config, '/v1/graphql', {
    query: `query ($ref: String!, $store: String!) {
      onetimeOrders(storeId: $store, filter: { orderMerchantExternalId: { eq: $ref } }) { id }
      payments(filter: { orderMerchantExternalId: { eq: $ref } }, limit: 10) {
        id orderId status orderMerchantExternalId snapshotAmountDetails { total currency }
        refunds { status pspAmountDetails { amount currency } }
      }
    }`, variables: { ref: order.id, store: config.store },
  });
  const matches = payments.filter(payment => payment.orderMerchantExternalId === order.id);
  const paid = matches.filter(payment => payment.status === 'succeeded' && (!order.waffo_payment_id || order.waffo_payment_id === payment.id));
  if (paid.length > 1) throw new CommerceError(409, '检测到多笔 Waffo 付款，请联系支持核对。');
  const [payment] = paid;
  if (payment) {
    if (!onetimeOrders.some(candidate => candidate.id === payment.orderId) || !paymentIdPattern.test(payment.id) ||
        !matchesPrice(order, payment.snapshotAmountDetails?.total, payment.snapshotAmountDetails?.currency)) {
      throw paymentReview();
    }
    const fullRefund = payment.refunds.some(refund => refund.status === 'succeeded' &&
      matchesPrice(order, refund.pspAmountDetails?.amount, refund.pspAmountDetails?.currency));
    await recordPayment(order, payment.id, fullRefund);
    if ((order.status === 'refunding' || order.status === 'paid') && !fullRefund) {
      const { refundTickets } = await post<{ refundTickets: { id: string; status: string }[] }>(config, '/v1/graphql', {
        query: `query ($ref: String!) { refundTickets(filter: { refundTicketMerchantExternalId: { eq: $ref } }) { id status } }`,
        variables: { ref: refundReference(order) },
      });
      const active = refundTickets.find(ticket => ['pending', 'approved', 'processing'].includes(ticket.status));
      if (active) {
        await commerceDb().query(`UPDATE compatibility_orders SET status='refunding', waffo_refund_ticket=$2, task_token=NULL, task_until=NULL
          WHERE id=$1 AND status='paid'`, [order.id, active.id]);
      } else if (refundTickets.some(ticket => ticket.id === order.waffo_refund_ticket && ['failed', 'rejected', 'canceled'].includes(ticket.status))) {
        await commerceDb().query("UPDATE compatibility_orders SET status='paid' WHERE id=$1 AND status='refunding' AND waffo_refund_ticket=$2",
          [order.id, order.waffo_refund_ticket]);
      }
    }
    return;
  }
  const expiry = order.waffo_checkout_expires_at?.getTime() ?? order.waffo_checkout_started_at.getTime() + (checkoutSeconds + 60) * 1_000;
  if (expiry <= Date.now() && matches.every(payment => ['canceled','failed','expired'].includes(payment.status))) {
    await commerceDb().query("UPDATE compatibility_orders SET status='expired' WHERE id=$1 AND status='pending'", [order.id]);
  }
}

export async function refundWaffo(order: Order) {
  if (order.status !== 'paid' || !order.waffo_payment_id) throw new CommerceError(409, '当前订单无法申请退款。');
  const config = orderConfig(order);
  const { ticket } = await post<{ ticket?: { id: string; status: string } }>(config, '/v1/actions/refund-ticket/create-ticket', {
    paymentId: order.waffo_payment_id, reason: 'Full refund requested by customer',
    requestedAmount: { amount: (order.amount_cents / 100).toFixed(2), currency: order.currency.toUpperCase() },
    refundTicketMerchantExternalId: refundReference(order),
  }, refundReference(order));
  if (!ticket?.id) throw new CommerceError(502, 'Waffo 退款单尚未确认，请先查单。');
  if (['failed', 'rejected', 'canceled'].includes(ticket.status)) throw new CommerceError(409, 'Waffo 退款未通过，请先查单。');
  await commerceDb().query(`UPDATE compatibility_orders SET status='refunding', waffo_refund_ticket=$2, task_token=NULL, task_until=NULL
    WHERE id=$1 AND status='paid'`, [order.id, ticket.id]);
}

export async function waffoWebhook(request: Request) {
  const config = waffoConfig();
  const fields = new URLSearchParams((request.headers.get('x-waffo-signature') ?? '').replace(/\s*,\s*/g, '&').replace(/\+/g, '%2B'));
  const t = fields.get('t') ?? '';
  const signature = fields.get('v1') ?? '';
  const age = Date.now() - Number(t);
  const raw = await request.text();
  if (raw.length > 100_000 || !/^\d{13}$/.test(t) || age < -60_000 || age > 45 * 60_000 || !/^[\w+/]+={0,2}$/.test(signature) ||
      !verify('RSA-SHA256', Buffer.from(t + '.' + raw), config.publicKey, Buffer.from(signature, 'base64'))) {
    throw new CommerceError(400, 'Waffo 回调签名无效。');
  }
  const event = JSON.parse(raw);
  const kind = event?.eventType;
  const reference = event?.data?.orderMerchantExternalId;
  if (event?.mode !== config.environment || event?.storeId !== config.store ||
      !['order.completed', 'refund.succeeded', 'refund.failed'].includes(kind) || typeof reference !== 'string' || !uuid.test(reference)) return;
  const { rows: [order] } = await commerceDb().query<Order>(
    "SELECT * FROM compatibility_orders WHERE id=$1 AND provider='waffo' AND waffo_store=$2 AND waffo_environment=$3",
    [reference, config.store, config.environment]);
  if (!order || order.status === 'refunded') return;
  const data = event.data;
  if (kind === 'refund.succeeded' && data.refundStatus === 'succeeded' && typeof data.paymentId === 'string' &&
      paymentIdPattern.test(data.paymentId) && matchesPrice(order, data.refundedAmount, data.currency) &&
      matchesPrice(order, data.originalChargedAmount, data.currency)) {
    await recordPayment(order, data.paymentId, true, true);
    return;
  }
  if (kind === 'order.completed' && data.paymentStatus === 'succeeded' && typeof data.paymentId === 'string' &&
      paymentIdPattern.test(data.paymentId) && data.chargedAmount != null) {
    if (!matchesPrice(order, data.chargedAmount, data.currency)) {
      await commerceDb().query(`UPDATE compatibility_orders SET waffo_payment_review=true, waffo_payment_id=$2,
          status='pending', task_token=NULL, task_until=NULL
        WHERE id=$1 AND status IN ('pending','expired','paid') AND (waffo_payment_id IS NULL OR waffo_payment_id=$2)`,
      [order.id, data.paymentId]);
      console.warn('[commerce:waffo] payment amount or currency mismatch', order.id);
      return;
    }
    await recordPayment(order, data.paymentId, false, true);
    return;
  }
  await reconcileWaffo(order);
}
