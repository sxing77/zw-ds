import 'server-only';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { reportAmountCents } from './report-format';

export const amountCents = reportAmountCents;
export const currency = 'usd';
export const reportPath = '/account/reports';

export function localTest() {
  return process.env.NODE_ENV === 'development' && process.env.COMMERCE_LOCAL_TEST === '1';
}

export function commerceEnabled() {
  return Boolean(process.env.DATABASE_URL) && (localTest() || process.env.COMMERCE_ENABLED === '1');
}

function configuredSite() {
  return process.env.COMMERCE_SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
}

export function googleLoginEnabled() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && configuredSite()?.startsWith('https://'));
}

export function salesEnabled() {
  if (!commerceEnabled()) return false;
  if (localTest()) return true;
  try { paymentProvider(); }
  catch { return false; }
  return Boolean(process.env.COMMERCE_SUPPORT_EMAIL);
}

export function siteOrigin(request: Request) {
  if (localTest()) {
    const host = request.headers.get('host') ?? '';
    if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)) throw new CommerceError(404, '页面不存在。');
    const url = new URL('http://' + host);
    if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return url.origin;
    throw new CommerceError(404, '页面不存在。');
  }
  const value = configuredSite();
  if (!value || !value.startsWith('https://')) throw new CommerceError(503, '购买服务暂未开放。');
  return new URL(value).origin;
}

export function paymentProvider() {
  if (localTest()) return 'local';
  waffoConfig();
  return 'waffo';
}

export function waffoConfig() {
  const { WAFFO_MERCHANT_ID: merchantId, WAFFO_PRIVATE_KEY: privatePem, WAFFO_WEBHOOK_PUBLIC_KEY: publicPem,
    WAFFO_STORE_ID: store, WAFFO_PRODUCT_ID: product, WAFFO_ZIWEI_PRODUCT_ID: ziweiProductEnv, WAFFO_ENVIRONMENT: environment,
    WAFFO_TAX_CATEGORY: taxCategory = 'digital_goods' } = process.env;
  const unavailable = () => new CommerceError(503, 'Waffo 收款暂未开放。');
  if (!merchantId || !privatePem || !publicPem || !store?.startsWith('STO_') || !product?.startsWith('PROD_') ||
      (environment !== 'test' && !(environment === 'prod' && process.env.COMMERCE_LIVE_PAYMENTS === '1'))) throw unavailable();
  if (ziweiProductEnv && !ziweiProductEnv.startsWith('PROD_')) throw unavailable();
  try {
    const privateKey = createPrivateKey(privatePem.replace(/\\n/g, '\n'));
    const publicKey = createPublicKey(publicPem.replace(/\\n/g, '\n'));
    if (privateKey.asymmetricKeyType !== 'rsa' || publicKey.asymmetricKeyType !== 'rsa') throw unavailable();
    return {
      merchantId,
      privateKey,
      publicKey,
      store,
      product,
      ziweiProduct: ziweiProductEnv || product,
      environment,
      taxCategory,
    };
  } catch { throw unavailable(); }
}

export class CommerceError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function commerceRequest(action: () => Promise<Response>) {
  try {
    if (!commerceEnabled()) throw new CommerceError(503, '购买服务暂未开放。');
    return await action();
  } catch (error) {
    if (error instanceof CommerceError) return json({ error: error.message }, error.status);
    console.error('[commerce]', error instanceof Error ? error.name : 'UnknownError');
    return json({ error: '服务暂时不可用，请稍后重试。' }, 500);
  }
}

export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
