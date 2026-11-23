/**
 * lib/ai/dataset-key —— 数据集键的纯计算（无 IO、无 server-only）
 *
 * 单独拆出来是为了能在脚本和测试里直接 import：
 * dataset.ts 那边有 `import 'server-only'`，一旦把计算逻辑写在里面，
 * `npx tsx scripts/xxx.ts` 就跑不动了。
 */

import type { ZiweiChart } from '@/lib/ziwei/types';

/** 数据集 13 维的键，与断语库、InsightPanel 的 topic 完全一致 */
export const DATASET_DIMS = [
  'overview',
  'personality',
  'love',
  'career',
  'wealth',
  'health',
  'family',
  'children',
  'move',
  'friends',
  'home',
  'spirit',
  'parents',
] as const;

export type DatasetDimension = (typeof DATASET_DIMS)[number];

export interface DatasetRecord {
  k: string;
  /** 命宫第一颗主星，命宫空宫时为 null */
  ms: string | null;
  /** 13 维断语全文（Markdown） */
  c: Record<string, string>;
}

export interface ParsedKey {
  year: number;
  month: number;
  day: number;
  hour: number;
  gender: 'male' | 'female';
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * 钟点 → 时辰序号（子 0 … 亥 11）。
 * 23 点与 0 点同属子时，所以先 +1 再整除 2。
 */
export function hourFromClock(clockHour: number): number {
  return Math.floor(((clockHour + 1) % 24) / 2);
}

/**
 * 从命盘拼数据集的 k 键。
 *
 * 返回 null 的两种情况，都是为了不给出「张冠李戴的断语」：
 *   1. birthInfo 缺字段或时辰序号越界（防御）
 *   2. 做过真太阳时校正 / 子时换日，birthInfo.hour 与用户填的钟点对不上 ——
 *      数据集是按原始时辰序号排的（README:148 明说不做真太阳时），
 *      此时按校正后的时辰查会查到另一张盘，宁可降级。
 */
export function chartKey(chart: ZiweiChart): string | null {
  const b = chart.birthInfo;
  if (!b || !Number.isInteger(b.year) || !Number.isInteger(b.month) || !Number.isInteger(b.day)) {
    return null;
  }
  if (!Number.isInteger(b.hour) || b.hour < 0 || b.hour > 11) return null;

  if (b.origInput) {
    const rawHour = hourFromClock(b.origInput.clockHour);
    const sameDay =
      b.origInput.year === b.year && b.origInput.month === b.month && b.origInput.day === b.day;
    if (!sameDay || rawHour !== b.hour) return null;
  }

  return `${b.year}-${pad(b.month)}-${pad(b.day)}-${b.hour}-${b.gender}`;
}

export function parseKey(k: string): ParsedKey | null {
  const m = k.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{1,2})-(male|female)$/);
  if (!m) return null;
  const [, y, mo, d, h, g] = m;
  const parsed: ParsedKey = {
    year: Number(y),
    month: Number(mo),
    day: Number(d),
    hour: Number(h),
    gender: g as 'male' | 'female',
  };
  if (parsed.month < 1 || parsed.month > 12 || parsed.day < 1 || parsed.day > 31) return null;
  if (parsed.hour < 0 || parsed.hour > 11) return null;
  return parsed;
}

/**
 * 数据集行号（0-based）。
 * 行序：按日期升序，每天 24 行，每个时辰 male 在前、female 在后。
 * 例：1990-06-15 时辰 4 男 → 165 × 24 + 4 × 2 = 3968（第 3969 行，实测吻合）
 */
export function rowIndexFromKey(p: ParsedKey): number {
  const days = Math.round(
    (Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(p.year, 0, 1)) / 86_400_000,
  );
  return days * 24 + p.hour * 2 + (p.gender === 'male' ? 0 : 1);
}

/** 取某一维（维度不存在时退回 overview） */
export function pickDimension(
  rec: DatasetRecord,
  dim?: string | null,
): { dim: DatasetDimension; text: string } | null {
  const wanted = (
    dim && (DATASET_DIMS as readonly string[]).includes(dim) ? dim : 'overview'
  ) as DatasetDimension;
  const text = rec.c?.[wanted];
  if (text) return { dim: wanted, text };
  const fallback = rec.c?.overview;
  return fallback ? { dim: 'overview', text: fallback } : null;
}

/**
 * 从用户问题里猜一个维度。前端没传 topic 时用它补位。
 * 只做粗粒度关键词匹配，命中不了就 overview —— 宁可多给总览，不可给错维度。
 */
export function guessDimension(text: string): DatasetDimension {
  const rules: Array<[DatasetDimension, RegExp]> = [
    ['love', /感情|爱情|婚姻|结婚|恋爱|另一半|配偶|桃花|分手|离婚|夫妻/],
    ['career', /事业|工作|职业|升职|跳槽|创业|老板|职场|转行/],
    ['wealth', /财运|赚钱|投资|理财|收入|钱|财帛|破财|股票/],
    ['health', /健康|身体|疾病|生病|养生|体质|手术|脏腑/],
    ['children', /子女|孩子|生育|儿子|女儿|怀孕/],
    ['parents', /父母|父亲|母亲|长辈/],
    ['family', /兄弟|姐妹|手足/],
    ['move', /迁移|搬迁|出国|外地|出行|驿马/],
    ['friends', /人际|朋友|同事|下属|部属|贵人/],
    ['home', /田宅|房产|买房|搬家|家宅/],
    ['spirit', /福德|精神|内心|情绪|心态|享受/],
    ['personality', /性格|个性|脾气|待人/],
  ];
  for (const [dim, re] of rules) {
    if (re.test(text)) return dim;
  }
  return 'overview';
}
