import 'server-only';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { CommerceError, localTest, siteOrigin } from './config';
import { commerceDb } from './db';

type User = { id: string; email: string; subject: string; password_hash?: string | null };
const sessionName = () => localTest() ? 'ziwei-local-sid' : '__Host-ziwei-sid';
const oauthName = '__Host-ziwei-oauth';
const digest = (value: string) => createHash('sha256').update(value);
const token = () => randomBytes(32).toString('base64url');
export function safeReturn(value?: string | null) {
  if (value === '/account/reports' || value === '/ops/orders' ||
      value === '/' || value === '/?mode=compatibility' || value === '/chart' ||
      value === '/chart?mode=compatibility' || value === '/bazi' ||
      value === '/checkout/ziwei' || value === '/checkout/compatibility' ||
      /^\/account\/reports\/[a-f0-9-]{36}$/i.test(value ?? '')) return value!;
  return '/account/reports';
}

export async function currentUser() {
  const value = (await cookies()).get(sessionName())?.value;
  if (!value) return null;
  const { rows } = await commerceDb().query<User>(
    'SELECT u.* FROM commerce_sessions s JOIN commerce_users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()',
    [digest(value).digest('hex')],
  );
  return rows[0] ?? null;
}

export async function requireUser(admin = false) {
  const user = await currentUser();
  if (!user) throw new CommerceError(401, '请先登录。');
  if (admin && !isOperator(user)) throw new CommerceError(403, '无查单权限。');
  return user;
}

export function isOperator(user: User) {
  if (localTest() && user.subject === 'local:operator') return true;
  return user.subject.startsWith('google:') &&
    (process.env.COMMERCE_ADMIN_EMAILS ?? '').split(',').some(email => email.trim().toLowerCase() === user.email);
}

async function createSession(userId: string) {
  await logout();
  const value = token();
  const maxAge = 30 * 24 * 60 * 60;
  await commerceDb().query('INSERT INTO commerce_sessions VALUES ($1,$2,$3)',
    [digest(value).digest('hex'), userId, new Date(Date.now() + maxAge * 1_000)]);
  (await cookies()).set(sessionName(), value, { httpOnly: true, secure: !localTest(), sameSite: 'lax', path: '/', maxAge });
}

async function signIn(subject: string, email: string) {
  const { rows: [user] } = await commerceDb().query<User>(
    'INSERT INTO commerce_users (id, subject, email) VALUES ($1,$2,$3) ON CONFLICT (subject) DO UPDATE SET email = excluded.email RETURNING *',
    [randomUUID(), subject, email.toLowerCase()],
  );
  await createSession(user.id);
}

function normalizeEmail(raw: unknown): string {
  if (typeof raw !== 'string') throw new CommerceError(400, '请输入有效的邮箱地址。');
  const email = raw.trim().toLowerCase();
  if (!email || email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new CommerceError(400, '请输入有效的邮箱地址。');
  }
  return email;
}

function validatePassword(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length < 8 || raw.length > 128) {
    throw new CommerceError(400, '密码长度需在 8 到 128 位之间。');
  }
  return raw;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hex] = stored.split(':');
  if (!salt || !hex) return false;
  const expected = Buffer.from(hex, 'hex');
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function registerWithEmail(rawEmail: unknown, rawPassword: unknown) {
  const email = normalizeEmail(rawEmail);
  const password = validatePassword(rawPassword);
  const subject = 'email:' + email;
  const db = commerceDb();
  const existing = await db.query<User>('SELECT id FROM commerce_users WHERE subject=$1', [subject]);
  if (existing.rows[0]) throw new CommerceError(409, '该邮箱已注册，请直接登录。');
  const passwordHash = hashPassword(password);
  try {
    const { rows: [user] } = await db.query<User>(
      'INSERT INTO commerce_users (id, subject, email, password_hash) VALUES ($1,$2,$3,$4) RETURNING id, subject, email',
      [randomUUID(), subject, email, passwordHash],
    );
    await createSession(user.id);
    return { email: user.email };
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23505') {
      throw new CommerceError(409, '该邮箱已注册，请直接登录。');
    }
    throw err;
  }
}

export async function loginWithEmail(rawEmail: unknown, rawPassword: unknown) {
  const email = normalizeEmail(rawEmail);
  if (typeof rawPassword !== 'string' || !rawPassword) {
    throw new CommerceError(400, '请输入密码。');
  }
  const subject = 'email:' + email;
  const { rows: [user] } = await commerceDb().query<User>(
    'SELECT id, subject, email, password_hash FROM commerce_users WHERE subject=$1',
    [subject],
  );
  if (!user?.password_hash || !verifyPassword(rawPassword, user.password_hash)) {
    throw new CommerceError(401, '邮箱或密码不正确。');
  }
  await createSession(user.id);
  return { email: user.email };
}

export async function logout() {
  const jar = await cookies();
  const value = jar.get(sessionName())?.value;
  if (value) await commerceDb().query('DELETE FROM commerce_sessions WHERE token_hash = $1', [digest(value).digest('hex')]);
  jar.set(sessionName(), '', { httpOnly: true, secure: !localTest(), sameSite: 'lax', path: '/', maxAge: 0 });
}

export async function signInLocal(account: unknown) {
  if (!localTest() || (account !== 'buyer' && account !== 'operator' && account !== 'other')) throw new CommerceError(404, '页面不存在。');
  await signIn('local:' + account, account + '@example.test');
}

function googleConfig(request: Request) {
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: secret } = process.env;
  if (!clientId || !secret) throw new CommerceError(503, 'Google 登录暂未开放。');
  return { clientId, secret, callback: siteOrigin(request) + '/api/commerce/google-callback' };
}

export async function startGoogle(request: Request) {
  const { clientId, callback } = googleConfig(request);
  const state = token();
  const verifier = token();
  const returnPath = safeReturn(new URL(request.url).searchParams.get('return'));
  (await cookies()).set(oauthName, state + '.' + verifier + '.' + encodeURIComponent(returnPath),
    { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 });
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId, redirect_uri: callback, response_type: 'code', scope: 'openid email',
    state, code_challenge: digest(verifier).digest('base64url'), code_challenge_method: 'S256',
  }).toString();
  return Response.redirect(url, 303);
}

export async function finishGoogle(request: Request) {
  const { clientId, secret, callback } = googleConfig(request);
  const params = new URL(request.url).searchParams;
  const jar = await cookies();
  const [state, verifier, returnValue] = jar.get(oauthName)?.value.split('.') ?? [];
  jar.set(oauthName, '', { httpOnly: true, secure: true, path: '/', maxAge: 0 });
  const code = params.get('code');
  const origin = siteOrigin(request);
  const returnPath = safeReturn(returnValue && decodeURIComponent(returnValue));
  const failed = new URL(returnPath, origin);
  failed.searchParams.set('login', 'failed');
  if (!code || !state || !verifier || params.get('state') !== state) {
    return Response.redirect(failed, 303);
  }
  const tokens = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', body: new URLSearchParams({ code, client_id: clientId, client_secret: secret,
      redirect_uri: callback, grant_type: 'authorization_code', code_verifier: verifier }),
    signal: AbortSignal.timeout(10_000),
  });
  const { access_token } = tokens.ok ? await tokens.json() : {};
  if (typeof access_token !== 'string') return Response.redirect(failed, 303);
  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: 'Bearer ' + access_token }, cache: 'no-store', signal: AbortSignal.timeout(10_000),
  });
  const profile = profileResponse.ok ? await profileResponse.json() : {};
  if (profile.email_verified !== true || typeof profile.sub !== 'string' || typeof profile.email !== 'string') {
    return Response.redirect(failed, 303);
  }
  await signIn('google:' + profile.sub, profile.email);
  return Response.redirect(origin + returnPath, 303);
}
