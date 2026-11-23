/**
 * lib/ai/chart-context —— 把排盘结果压成模型能读的命盘摘要
 *
 * 目标是「信息无损、长度可控」：12 宫全部展开，但每宫压成一行，
 * 一整张盘大约 900–1400 token，放在 system prompt 里不挤压正文空间。
 */

import { BRANCHES, SHICHEN, STEMS } from '@/lib/ziwei/constants';
import { getLiuNianSiHua } from '@/lib/ziwei/sihua';
import type { Palace, Star, ZiweiChart } from '@/lib/ziwei/types';

/** 子午流注：地支 → 对应脏腑（倪师体系看健康用「杀星最集中宫位」的地支取脏腑） */
export const BRANCH_ZANGFU: Record<number, string> = {
  0: '胆',
  1: '肝',
  2: '肺',
  3: '大肠',
  4: '胃',
  5: '脾',
  6: '心',
  7: '小肠',
  8: '膀胱',
  9: '肾',
  10: '心包',
  11: '三焦',
};

const SI_HUA_LABEL: Record<string, string> = {
  禄: '化禄',
  权: '化权',
  科: '化科',
  忌: '化忌',
};

/**
 * 六煞 —— 倪师讲「杀星」主要指这六颗（四煞 + 空劫）。
 * 天哭、天虚、蜚廉、天使这类虽也算煞曜，但力量级别不同，不能和六煞混为一谈。
 */
export const LIU_SHA = ['擎羊', '陀罗', '火星', '铃星', '地空', '地劫'];

/**
 * 按宫名取宫。
 *
 * 注意：引擎输出的宫名里，只有「命宫」带「宫」字，
 * 其余是「夫妻」「福德」「仆役」这种裸名（见 lib/ziwei/db-analysis.ts 注释）。
 * 所以传「夫妻宫」也必须能取到，这里两种写法都兼容。
 */
export function findPalaceByName(chart: ZiweiChart, name: string): Palace | null {
  const direct = chart.palaces.find(p => p.name === name);
  if (direct) return direct;
  const bare = name.replace(/宫$/, '');
  return chart.palaces.find(p => p.name === bare || `${p.name}宫` === name) ?? null;
}

function brightnessOf(star: Star): string {
  if (star.brightnessRaw && star.brightnessRaw !== '地') return star.brightnessRaw;
  if (star.brightness === 'bright') return '庙';
  if (star.brightness === 'dim') return '陷';
  return '';
}

function starLabel(star: Star): string {
  const b = brightnessOf(star);
  const h = star.siHua ? SI_HUA_LABEL[star.siHua] : '';
  return `${star.name}${b ? `(${b})` : ''}${h}`;
}

function joinStars(stars: Star[]): string {
  return stars.length ? stars.map(starLabel).join('、') : '无';
}

/** 某颗星落在哪个宫（找不到返回 null） */
export function findStarPalace(chart: ZiweiChart, starName: string): Palace | null {
  return chart.palaces.find(p => p.stars.some(s => s.name === starName)) ?? null;
}

function palaceNames(chart: ZiweiChart): Map<number, string> {
  const map = new Map<number, string>();
  for (const p of chart.palaces) map.set(p.branch, p.name);
  return map;
}

/**
 * 三方四正：本宫 + 三合两宫 + 对宫。
 * 紫微斗数里「三方四正」是判断一宫强弱的基本盘面。
 */
export function sanFangSiZheng(chart: ZiweiChart, branch: number): Palace[] {
  const targets = [branch, (branch + 4) % 12, (branch + 8) % 12, (branch + 6) % 12];
  return targets
    .map(b => chart.palaces.find(p => p.branch === b))
    .filter((p): p is Palace => Boolean(p));
}

function onePalaceLine(chart: ZiweiChart, p: Palace): string {
  const major = p.stars.filter(s => s.type === 'major');
  const lucky = p.stars.filter(s => s.type === 'lucky' || s.type === 'minor');
  const shaStars = p.stars.filter(s => s.type === 'sha');
  const liuSha = shaStars.filter(s => LIU_SHA.includes(s.name));
  const miscSha = shaStars.filter(s => !LIU_SHA.includes(s.name));

  const tags: string[] = [];
  if (p.isMingGong) tags.push('命宫');
  if (p.isShenGong) tags.push('身宫');
  if (p.isCurrentDaXian) tags.push('当前大限');

  const head = `${p.name}(${BRANCHES[p.branch]}/${STEMS[p.stem] ?? '?'})${
    tags.length ? `[${tags.join('·')}]` : ''
  }${p.daXianAge ? ` 大限${p.daXianAge[0]}-${p.daXianAge[1]}岁` : ''}`;

  const parts = [head, `主:${joinStars(major)}`];

  if (p.isEmpty) {
    const borrowed = p.borrowedStars?.length
      ? `借${p.borrowedFromName ?? '对宫'}主星 ${p.borrowedStars.join('、')}`
      : '空宫';
    parts.push(borrowed);
  }
  if (lucky.length) parts.push(`辅:${lucky.map(s => s.name).join('、')}`);
  if (liuSha.length) parts.push(`煞:${liuSha.map(s => s.name).join('、')}`);
  if (miscSha.length) parts.push(`杂煞:${miscSha.map(s => s.name).join('、')}`);
  if (p.selfSihua?.length) {
    parts.push(`自化:${p.selfSihua.map(s => `${s.starName}${SI_HUA_LABEL[s.siHua] ?? s.siHua}`).join('、')}`);
  }

  return `- ${parts.join('｜')}`;
}

/** 生年四化：哪颗星化什么、落在哪个宫（倪师体系最看重的信息之一） */
function natalSiHuaLine(chart: ZiweiChart): string {
  const hits: string[] = [];
  for (const p of chart.palaces) {
    for (const s of p.stars) {
      if (!s.siHua) continue;
      hits.push(`${s.name}${SI_HUA_LABEL[s.siHua]}→${p.name}`);
    }
  }
  return hits.length ? hits.join('、') : '无（本盘生年四化星未落于十二宫主辅星中）';
}

/** 当前公历年对应的流年四化，以及这四颗星落在本盘哪个宫 */
export function liuNianSiHuaLine(chart: ZiweiChart, year: number): string {
  const ln = getLiuNianSiHua(year);
  const parts = (['禄', '权', '科', '忌'] as const).map(h => {
    const star = ln.transforms[h];
    const pal = findStarPalace(chart, star);
    return `${star}化${h}${pal ? `→${pal.name}` : '（本盘无此星）'}`;
  });
  return `${year}年（${ln.stemName}干）流年四化：${parts.join('、')}`;
}

/**
 * 全盘杀星最集中的宫位 —— 倪师体系判健康用这个宫的地支定脏腑。
 *
 * 口径：优先只数六煞（羊陀火铃空劫），因为「杀星」在倪师语境里就是指这六颗；
 * 只有全盘六煞为零时才退回统计所有 type=sha 的杂煞，避免把天哭天虚这类
 * 力量较弱的星算成主凶，导致脏腑定位跑偏。
 *
 * 并列处理：多个宫煞星数量相同时全部返回（tops），不硬挑一个 ——
 * 硬挑会让健康结论取决于数组顺序，属于靠不住的实现。
 */
export interface ShaHeat {
  /** 并列最多的宫（≥1 个） */
  tops: { name: string; branch: number; zangfu: string }[];
  /** 主选宫，等于 tops[0] */
  palace: Palace;
  count: number;
  zangfu: string;
  basis: '六煞' | '杂煞';
}

export function shaHeatPalace(chart: ZiweiChart): ShaHeat | null {
  const rank = (countFn: (p: Palace) => number) =>
    chart.palaces
      .map(p => ({ palace: p, count: countFn(p) }))
      .filter(x => x.count > 0);

  let basis: '六煞' | '杂煞' = '六煞';
  let pool = rank(p => p.stars.filter(s => LIU_SHA.includes(s.name)).length);
  if (!pool.length) {
    basis = '杂煞';
    pool = rank(p => p.stars.filter(s => s.type === 'sha').length);
  }
  if (!pool.length) return null;

  const max = Math.max(...pool.map(x => x.count));
  const top = pool.filter(x => x.count === max);

  return {
    tops: top.map(x => ({
      name: x.palace.name,
      branch: x.palace.branch,
      zangfu: BRANCH_ZANGFU[x.palace.branch] ?? '未知',
    })),
    palace: top[0].palace,
    count: max,
    zangfu: BRANCH_ZANGFU[top[0].palace.branch] ?? '未知',
    basis,
  };
}

/**
 * 主入口：整张盘序列化成 markdown 文本
 * @param label 用于合盘区分双方（如「甲方」）
 */
export function serializeChart(chart: ZiweiChart, label?: string, nowYear?: number): string {
  const b = chart.birthInfo;
  const li = chart.lunarInfo;
  const shichen = SHICHEN[b.hour]?.name ?? `时辰序号${b.hour}`;
  const currentDx = chart.daXians[chart.currentDaXianIndex];
  const year = nowYear ?? new Date().getFullYear();

  const lines: string[] = [];

  lines.push(`### ${label ? `${label}` : '命盘'}基本资料`);
  lines.push(
    [
      `性别：${b.gender === 'male' ? '男' : '女'}（${chart.yinYangGender ?? '—'}）`,
      `公历：${b.year}年${b.month}月${b.day}日 ${shichen}（时辰序号 ${b.hour}）`,
      `农历：${li.yearStem !== undefined ? STEMS[li.yearStem] : ''}${
        li.yearBranch !== undefined ? BRANCHES[li.yearBranch] : ''
      }年${li.isLeapMonth ? '闰' : ''}${Math.abs(li.lunarMonth)}月${li.lunarDay}日`,
      `四柱（节气）：${li.fourPillars?.join(' ') ?? '—'}`,
      `五行局：${chart.wuxingJuName}`,
      `命主：${chart.mingZhu ?? '—'}　身主：${chart.shenZhu ?? '—'}`,
      b.city ? `出生地：${b.province ?? ''}${b.city}${b.longitude ? `（东经 ${b.longitude}）` : ''}` : '',
    ]
      .filter(Boolean)
      .join('｜'),
  );

  lines.push('');
  lines.push('### 十二宫（地支/宫干）');
  for (const p of [...chart.palaces].sort((x, y) => x.branch - y.branch)) {
    lines.push(onePalaceLine(chart, p));
  }

  lines.push('');
  lines.push('### 四化');
  lines.push(`生年四化：${natalSiHuaLine(chart)}`);
  lines.push(liuNianSiHuaLine(chart, year));

  lines.push('');
  lines.push('### 运限');
  if (currentDx) {
    lines.push(
      `当前年龄：${chart.currentAge} 岁｜当前大限：${currentDx.palaceName}（${currentDx.startAge}-${currentDx.endAge} 岁）${
        currentDx.stemName ? `，大限宫干 ${currentDx.stemName}` : ''
      }`,
    );
    if (currentDx.siHua) {
      lines.push(
        `大限四化：${currentDx.siHua.lu}化禄、${currentDx.siHua.quan}化权、${currentDx.siHua.ke}化科、${currentDx.siHua.ji}化忌`,
      );
    }
  } else {
    lines.push(`当前年龄：${chart.currentAge} 岁｜尚在童限，未入大限`);
  }

  const ming = chart.palaces.find(p => p.branch === chart.mingGongBranch);
  if (ming) {
    const sf = sanFangSiZheng(chart, ming.branch);
    lines.push('');
    lines.push('### 命宫三方四正');
    lines.push(sf.map(p => `${p.name}(${BRANCHES[p.branch]})：${joinStars(p.stars.filter(s => s.type === 'major'))}`).join('｜'));
  }

  const sha = shaHeatPalace(chart);
  if (sha) {
    const list = sha.tops.map(t => `${t.name}（${BRANCHES[t.branch]}宫）→ ${t.zangfu}`).join('、');
    lines.push('');
    lines.push(`### 杀星分布\n杀星最集中的宫位（各 ${sha.count} 颗${sha.basis}）：${list}`);
  }

  return lines.join('\n');
}

/** 取某宫（按宫名，如「夫妻宫」或「夫妻」）的完整描述，用于针对性提问 */
export function serializePalace(chart: ZiweiChart, palaceName: string): string {
  const p = findPalaceByName(chart, palaceName);
  if (!p) return '';
  const names = palaceNames(chart);
  const sf = sanFangSiZheng(chart, p.branch);
  return [
    onePalaceLine(chart, p),
    `三方四正：${sf
      .map(x => `${x.name}[${x.stars.filter(s => s.type === 'major').map(s => s.name).join('、') || '空宫'}]`)
      .join('｜')}`,
    `对宫：${names.get((p.branch + 6) % 12) ?? '—'}`,
  ].join('\n');
}
