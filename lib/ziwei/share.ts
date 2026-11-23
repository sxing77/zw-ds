import type { BirthCalendar, BirthFormState } from './birth-form';
import type { BirthInfo } from './types';
import { branchFromSolarMinutes, isValidGregorianDate, resolveZiweiDayOffset, shiftGregorianDate } from './true-solar-time';
import { LUNAR_YEAR_MAX, LUNAR_YEAR_MIN, lunarToSolar } from './lunar-solar';

export type { BirthCalendar } from './birth-form';

export function formToSolarDate(form: Pick<BirthFormState, 'year' | 'month' | 'day' | 'calendar'>) {
  if (!/^\d+$/.test(form.year) || !/^-?\d+$/.test(form.month) || !/^\d+$/.test(form.day)) return null;
  const year = Number(form.year);
  const month = Number(form.month);
  const day = Number(form.day);
  if (year < LUNAR_YEAR_MIN || year > LUNAR_YEAR_MAX) return null;
  if (form.calendar === 'lunar') {
    const date = lunarToSolar(year, Math.abs(month), day, month < 0);
    return date && date.year <= LUNAR_YEAR_MAX && date.year >= LUNAR_YEAR_MIN ? date : null;
  }
  return isValidGregorianDate(year, month, day) ? { year, month, day } : null;
}

function longitudeClock(clockHour: number, clockMinute: number, longitude: number, utcOffsetMinutes = 480) {
  const standardMeridian = (utcOffsetMinutes / 60) * 15;
  const minutes = clockHour * 60 + clockMinute + (longitude - standardMeridian) * 4;
  const dayOffset = Math.floor(minutes / 1440);
  const normalizedMinutes = minutes - dayOffset * 1440;
  return { dayOffset, normalizedMinutes, branch: branchFromSolarMinutes(normalizedMinutes) };
}

/** 当地标准时间经经度修正后的时辰支 (0–11)。 */
export function calcTrueSolarBranch(clockHour: number, clockMinute: number, longitude: number, utcOffsetMinutes = 480): number {
  return longitudeClock(clockHour, clockMinute, longitude, utcOffsetMinutes).branch;
}

/** 晚子时按次日排盘。日期和时辰统一按同一个经度修正后的时钟推导。 */
export function formToBirthInfo(form: BirthFormState): BirthInfo {
  const date = formToSolarDate(form);
  if (!date) throw new RangeError(form.calendar === 'lunar' ? '农历出生日期不存在或超出支持范围。' : '公历出生日期不存在或超出支持范围。');
  const solar = form.unknownTime ? null : longitudeClock(Number(form.clockHour), Number(form.clockMinute), form.longitude, form.utcOffsetMinutes ?? 480);
  return {
    ...(solar ? shiftGregorianDate(date, resolveZiweiDayOffset(solar)) : date),
    hour: solar?.branch ?? 0,
    gender: form.gender,
    name: form.name || undefined,
    province: form.province || undefined,
    city: form.city || undefined,
    longitude: form.province ? form.longitude : undefined,
  };
}

/** BirthFormState → URLSearchParams（用于分享链接） */
export function formToSearchParams(form: BirthFormState): URLSearchParams {
  const p = new URLSearchParams();
  if (form.name) p.set('n', form.name);
  p.set('y', form.year);
  p.set('m', form.month);
  p.set('d', form.day);
  if (form.calendar === 'lunar') p.set('cal', 'lunar');
  if (form.unknownTime) {
    p.set('u', '1');
  } else {
    p.set('h', form.clockHour);
    p.set('mi', form.clockMinute);
  }
  if (form.province) p.set('p', form.province);
  if (form.city) p.set('c', form.city);
  if (form.longitude !== 120) p.set('lo', String(form.longitude));
  if (form.utcOffsetMinutes !== undefined && form.utcOffsetMinutes !== 480) p.set('tz', String(form.utcOffsetMinutes));
  p.set('g', form.gender === 'male' ? 'm' : 'f');
  return p;
}

/** 从分享链接恢复有效的出生资料。 */
export function searchParamsToForm(params: URLSearchParams): BirthFormState | null {
  const year = params.get('y');
  const month = params.get('m');
  const day = params.get('d');
  const calendar = params.get('cal');
  if (calendar !== null && calendar !== 'solar' && calendar !== 'lunar') return null;
  if (!year || !month || !day || !formToSolarDate({ year, month, day, calendar: calendar ?? undefined })) return null;
  const clockHour = params.get('h') || '8';
  const clockMinute = params.get('mi') || '0';
  const longitude = Number(params.get('lo') || '120');
  const tzRaw = params.get('tz');
  const utcOffsetMinutes = tzRaw !== null && /^-?\d+$/.test(tzRaw) ? Number(tzRaw) : undefined;
  if (!/^\d{1,2}$/.test(clockHour) || Number(clockHour) > 23 ||
      !/^\d{1,2}$/.test(clockMinute) || Number(clockMinute) > 59 ||
      !Number.isFinite(longitude) || Math.abs(longitude) > 180) return null;
  return {
    name: (params.get('n') || '').slice(0, 40),
    year: String(Number(year)),
    month: String(Number(month)),
    day: String(Number(day)),
    ...(calendar === 'lunar' ? { calendar } : {}),
    unknownTime: params.get('u') === '1',
    clockHour: String(Number(clockHour)),
    clockMinute: String(Number(clockMinute)),
    province: params.get('p') || '',
    city: params.get('c') || '',
    longitude,
    ...(utcOffsetMinutes !== undefined ? { utcOffsetMinutes } : {}),
    gender: params.get('g') === 'f' ? 'female' : 'male',
  };
}
