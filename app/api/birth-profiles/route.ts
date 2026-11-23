import { currentUser, requireUser } from '@/lib/commerce/auth';
import { commerceEnabled, commerceRequest, CommerceError, googleLoginEnabled, json, localTest, siteOrigin, uuid } from '@/lib/commerce/config';
import { commerceDb } from '@/lib/commerce/db';
import { BIRTH_NAME_LIMIT, LAST_BIRTH_YEAR, type BirthFormState, type BirthProfile } from '@/lib/ziwei/birth-form';
import { PROVINCES } from '@/lib/ziwei/cities';
import { formToSolarDate } from '@/lib/ziwei/share';

export const runtime = 'nodejs';

export async function GET() {
  if (!commerceEnabled()) return json({ signIn: null });
  return commerceRequest(async () => {
    const user = await currentUser();
    if (!user) {
      return json({ signIn: localTest() ? 'local' : googleLoginEnabled() ? 'google' : null });
    }
    const { rows: profiles } = await commerceDb().query<BirthProfile>(
      'SELECT id, form FROM birth_profiles WHERE user_id=$1 ORDER BY created_at, id', [user.id],
    );
    return json({ accountId: user.id, profiles });
  });
}

function parseForm(value: unknown): BirthFormState {
  if (!value || typeof value !== 'object') throw new CommerceError(400, '请填写出生资料。');
  const { name, year, month, day, calendar = 'solar', clockHour, clockMinute, unknownTime, province, city, longitude, gender } = value as Partial<BirthFormState>;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > BIRTH_NAME_LIMIT) {
    throw new CommerceError(400, `请填写不超过 ${BIRTH_NAME_LIMIT} 字的姓名或称呼。`);
  }
  if (typeof year !== 'string' || !/^\d{4}$/.test(year) || Number(year) > LAST_BIRTH_YEAR ||
      typeof month !== 'string' || !/^-?[1-9]\d?$/.test(month) || typeof day !== 'string' || !/^[1-9]\d?$/.test(day) ||
      (calendar !== 'solar' && calendar !== 'lunar') || !formToSolarDate({ year, month, day, calendar })) {
    throw new CommerceError(400, '请选择有效的出生日期。');
  }
  if (typeof unknownTime !== 'boolean' || typeof clockHour !== 'string' || !/^\d{1,2}$/.test(clockHour) || Number(clockHour) > 23 ||
      typeof clockMinute !== 'string' || !/^\d{1,2}$/.test(clockMinute) || Number(clockMinute) > 59 ||
      (gender !== 'male' && gender !== 'female')) {
    throw new CommerceError(400, '请核对出生时间和性别。');
  }
  const region = PROVINCES.find(option => option.name === province);
  if (typeof province !== 'string' || typeof city !== 'string' || (province && !region) ||
      (city && !region?.cities.some(option => option.name === city)) ||
      typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    throw new CommerceError(400, '请选择有效的出生地点。');
  }
  return { name: name.trim(), year, month, day, calendar, clockHour: String(Number(clockHour)),
    clockMinute: String(Number(clockMinute)), unknownTime, province, city, longitude, gender };
}

async function changeProfile(request: Request, action: 'create' | 'update' | 'delete') {
  return commerceRequest(async () => {
    if (request.headers.get('origin') !== siteOrigin(request)) throw new CommerceError(403, '请求来源无效。');
    const user = await requireUser();
    const raw = await request.text();
    if (raw.length > 4_000) throw new CommerceError(413, '提交的资料过长。');
    let data: { id?: unknown; form?: unknown; accountId?: unknown } | null;
    try { data = JSON.parse(raw); }
    catch { throw new CommerceError(400, '请检查提交内容。'); }
    if (data?.accountId !== user.id) throw new CommerceError(401, '登录账号已变化，请重新选择资料。');
    if (typeof data?.id !== 'string' || !uuid.test(data.id)) throw new CommerceError(400, '出生资料编号无效。');

    const db = commerceDb();
    if (action === 'delete') {
      await db.query('DELETE FROM birth_profiles WHERE user_id=$1 AND id=$2', [user.id, data.id]);
      return json({ id: data.id });
    }
    const form = parseForm(data.form);
    const params = [user.id, data.id, JSON.stringify(form)];
    const { rows: [profile] } = action === 'create'
      ? await db.query<BirthProfile>(`INSERT INTO birth_profiles (user_id, id, form) VALUES ($1,$2,$3)
          ON CONFLICT (user_id, id) DO UPDATE SET form=excluded.form WHERE birth_profiles.form=excluded.form
          RETURNING id, form`, params)
      : await db.query<BirthProfile>('UPDATE birth_profiles SET form=$3 WHERE user_id=$1 AND id=$2 RETURNING id, form', params);
    if (!profile && action === 'create') throw new CommerceError(409, '出生资料已更改，请重新保存。');
    if (!profile) throw new CommerceError(404, '找不到这份出生资料。');
    return json(profile);
  });
}

export const POST = (request: Request) => changeProfile(request, 'create');
export const PATCH = (request: Request) => changeProfile(request, 'update');
export const DELETE = (request: Request) => changeProfile(request, 'delete');
