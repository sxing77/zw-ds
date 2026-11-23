/**
 * lib/ai/validate —— 请求体校验
 *
 * 前端传上来的 chart 是完整对象，但接口是公开的，
 * 只校验「palaces 长度为 12」不够：里面塞数字也会过，然后在 prompt 组装时空指针。
 * 这里逐层校验，畸形输入直接 400，不让它走到业务逻辑里炸。
 */

import 'server-only';

import type { BirthInfo, ZiweiChart } from '@/lib/ziwei/types';
import { LUNAR_YEAR_MAX, LUNAR_YEAR_MIN } from '@/lib/ziwei/lunar-solar';
import { isValidGregorianDate } from '@/lib/ziwei/true-solar-time';

interface LooseRecord {
  [key: string]: unknown;
}

function isRecord(v: unknown): v is LooseRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function readChartBirth(value: unknown): BirthInfo | null {
  if (!isRecord(value)) return null;
  const { year, month, day, hour, gender } = value;
  if (typeof year !== 'number' || year < LUNAR_YEAR_MIN || year > LUNAR_YEAR_MAX ||
      typeof month !== 'number' || typeof day !== 'number' || !isValidGregorianDate(year, month, day) ||
      typeof hour !== 'number' || !Number.isInteger(hour) || hour < 0 || hour > 11 ||
      (gender !== 'male' && gender !== 'female')) return null;
  return { year, month, day, hour, gender };
}

export function isZiweiChart(value: unknown): value is ZiweiChart {
  if (!isRecord(value)) return false;

  const birth = value.birthInfo;
  if (!isRecord(birth)) return false;
  if (typeof birth.year !== 'number' || typeof birth.month !== 'number' || typeof birth.day !== 'number') return false;
  if (typeof birth.hour !== 'number' || birth.hour < 0 || birth.hour > 11) return false;
  if (birth.gender !== 'male' && birth.gender !== 'female') return false;

  if (typeof value.mingGongBranch !== 'number') return false;
  if (typeof value.currentAge !== 'number') return false;

  const palaces = value.palaces;
  if (!Array.isArray(palaces) || palaces.length !== 12) return false;
  for (const p of palaces) {
    if (!isRecord(p)) return false;
    if (typeof p.name !== 'string' || typeof p.branch !== 'number' || typeof p.stem !== 'number') return false;
    if (!Array.isArray(p.stars)) return false;
    for (const s of p.stars) {
      if (!isRecord(s) || typeof s.name !== 'string' || typeof s.type !== 'string') return false;
    }
  }

  if (!Array.isArray(value.daXians)) return false;
  if (!isRecord(value.lunarInfo)) return false;

  return true;
}
