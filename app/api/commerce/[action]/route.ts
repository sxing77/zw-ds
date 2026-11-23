import { commerceEnabled, commerceRequest, CommerceError, googleLoginEnabled, json, localTest, reportPath, salesEnabled, siteOrigin, uuid } from '@/lib/commerce/config';
import { resolveProvider } from '@/lib/ai/provider';
import { currentUser, finishGoogle, isOperator, loginWithEmail, logout, registerWithEmail, requireUser, signInLocal, startGoogle } from '@/lib/commerce/auth';
import { createOrder, findOrder, markPaid, orderInfo, type Order } from '@/lib/commerce/orders';
import { reconcileOrder, refundOrder, stripeWebhook } from '@/lib/commerce/stripe';
import { reconcileWaffo, refundWaffo, waffoCheckoutUrl, waffoWebhook } from '@/lib/commerce/waffo';
import { deliverReport } from '@/lib/commerce/generate';
import { commerceDb } from '@/lib/commerce/db';
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 100;
type Context = { params: Promise<{ action: string }> };

function checkoutUrl(order: Order, origin: string) {
  if (order.provider === 'waffo') return waffoCheckoutUrl(order, origin);
  if (order.provider === 'stripe' && order.status === 'pending') {
    throw new CommerceError(409, '请先核对这笔旧渠道订单的付款状态。');
  }
  return origin + reportPath + '/' + order.id;
}

export async function GET(request: Request, { params }: Context) {
  const { action } = await params;
  if (action === 'me') {
    if (!commerceEnabled()) {
      return json({ enabled: false, user: null, googleEnabled: false, localTest: false });
    }
    try {
      const user = await currentUser();
      return json({
        enabled: true,
        user: user ? { email: user.email, isOperator: isOperator(user) } : null,
        googleEnabled: googleLoginEnabled(),
        localTest: localTest(),
      });
    } catch {
      return json({ enabled: false, user: null, googleEnabled: false, localTest: false });
    }
  }
  return commerceRequest(async () => {
    if (action === 'google') return startGoogle(request);
    if (action === 'google-callback') return finishGoogle(request);
    throw new CommerceError(404, '页面不存在。');
  });
}

export async function POST(request: Request, { params }: Context) {
  const { action } = await params;
  return commerceRequest(async () => {
    if (action === 'waffo-webhook') {
      await waffoWebhook(request);
      return json({ received: true });
    }
    if (action === 'stripe-webhook') {
      await stripeWebhook(request);
      return json({ received: true });
    }
    const origin = siteOrigin(request);
    if (request.headers.get('origin') !== origin) throw new CommerceError(403, '请求来源无效。');

    const raw = await request.text();
    if (raw.length > 8_000) throw new CommerceError(413, '请求内容过长。');
    let body;
    try { body = JSON.parse(raw); }
    catch { throw new CommerceError(400, '请检查提交内容。'); }
    if (!body || typeof body !== 'object') throw new CommerceError(400, '请检查提交内容。');

    if (action === 'register') {
      const rate = checkRateLimit('auth-register', getClientIp(request), 5, 15 * 60_000);
      if (!rate.allowed) throw new CommerceError(429, `注册请求过于频繁，请 ${rate.retryAfterSec} 秒后再试。`);
      const result = await registerWithEmail(body.email, body.password);
      return json({ ok: true, email: result.email });
    }
    if (action === 'login') {
      const rate = checkRateLimit('auth-login', getClientIp(request), 12, 15 * 60_000);
      if (!rate.allowed) throw new CommerceError(429, `登录尝试过于频繁，请 ${rate.retryAfterSec} 秒后再试。`);
      const result = await loginWithEmail(body.email, body.password);
      return json({ ok: true, email: result.email });
    }
    if (action === 'local-login') {
      await signInLocal(body.account);
      return json({ ok: true });
    }
    if (action === 'logout') {
      await logout();
      return json({ ok: true });
    }

    const operations = action.startsWith('ops-');
    const user = await requireUser(operations);
    if (action === 'checkout') {
      if (!salesEnabled()) throw new CommerceError(503, '购买服务暂未开放。');
      if (!localTest() || process.env.COMMERCE_LOCAL_USE_MODEL === '1') {
        try { resolveProvider(); }
        catch { throw new CommerceError(503, '报告生成服务暂不可用，尚未创建订单。'); }
      }
      const productKind = body.productKind === 'ziwei' ? 'ziwei' : 'compatibility';
      const order = await createOrder(user.id, body.requestId, body.birthA, body.birthB, productKind);
      return json({ url: await checkoutUrl(order, origin), id: order.id });
    }

    if (typeof body.id !== 'string') throw new CommerceError(400, '订单号无效。');
    const ownerId = operations ? undefined : user.id;
    const order = await findOrder(body.id, ownerId);
    if (['ops-reconcile', 'ops-retry', 'ops-refund'].includes(action)) {
      await commerceDb().query('INSERT INTO commerce_operator_actions (order_id,operator_id,action) VALUES ($1,$2,$3)',
        [order.id, user.id, action]);
    }
    switch (action) {
      case 'resume-checkout':
        return json({ url: await checkoutUrl(order, origin) });
      case 'local-payment':
        if (!localTest() || order.provider !== 'local') throw new CommerceError(404, '页面不存在。');
        await markPaid(order, null);
        break;
      case 'refresh':
      case 'ops-reconcile':
        if (order.provider === 'waffo') await reconcileWaffo(order);
        else await reconcileOrder(order);
        break;
      case 'generate':
      case 'ops-retry':
        await deliverReport(order);
        break;
      case 'followup': {
        const question = typeof body.question === 'string' ? body.question.trim() : '';
        if (!question || question.length > 1_000) throw new CommerceError(400, '请输入 1 至 1000 字的提问。');
        if (typeof body.requestId !== 'string' || !uuid.test(body.requestId)) throw new CommerceError(400, '追问编号无效，请刷新页面。');
        await deliverReport(order, question, body.requestId);
        break;
      }
      case 'ops-refund':
        if (localTest() && order.provider === 'local') {
          await commerceDb().query("UPDATE compatibility_orders SET status='refunded', task_token=NULL, task_until=NULL WHERE id=$1 AND status='paid'", [order.id]);
          break;
        }
        if (order.provider === 'waffo') await refundWaffo(order);
        else await refundOrder(order);
        break;
      default:
        throw new CommerceError(404, '页面不存在。');
    }
    return json(orderInfo(await findOrder(order.id, ownerId), operations));
  });
}
