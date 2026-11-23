import { Solar } from 'lunar-javascript';
import {
  DITIANSUI_TIANGAN,
  QIONGTONG_TABLE,
  SANMING_RIZHU_TABLE,
  ZIPING_GEJU_INFO,
} from './classics-data';
import {
  buildRiShiHint,
  detectBaziPatterns,
  detectUpcomingLiuNian,
} from './rules';
import type {
  BaziBirthInput,
  BaziChart,
  BaziPillar,
  DaYunItem,
  GanZhiRelation,
  HiddenStemItem,
  TenGod,
  Wuxing,
  WuxingBreakdown,
} from './types';

const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'] as const;
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const;

const STEM_WUXING: Record<string, Wuxing> = {
  '甲': '木', '乙': '木',
  '丙': '火', '丁': '火',
  '戊': '土', '己': '土',
  '庚': '金', '辛': '金',
  '壬': '水', '癸': '水',
};

const BRANCH_WUXING: Record<string, Wuxing> = {
  '寅': '木', '卯': '木',
  '巳': '火', '午': '火',
  '辰': '土', '戌': '土', '丑': '土', '未': '土',
  '申': '金', '酉': '金',
  '亥': '水', '子': '水',
};

const STEM_YINYANG: Record<string, '阳' | '阴'> = {
  '甲': '阳', '乙': '阴',
  '丙': '阳', '丁': '阴',
  '戊': '阳', '己': '阴',
  '庚': '阳', '辛': '阴',
  '壬': '阳', '癸': '阴',
};

const BRANCH_HIDDEN_STEMS: Record<string, string[]> = {
  '子': ['癸'],
  '丑': ['己', '癸', '辛'],
  '寅': ['甲', '丙', '戊'],
  '卯': ['乙'],
  '辰': ['戊', '乙', '癸'],
  '巳': ['丙', '庚', '戊'],
  '午': ['丁', '己'],
  '未': ['己', '丁', '乙'],
  '申': ['庚', '壬', '戊'],
  '酉': ['辛'],
  '戌': ['戊', '辛', '丁'],
  '亥': ['壬', '甲'],
};

// 十天干长生起位（阳顺阴逆）
const CHANGSHENG_NAMES = ['长生', '沐浴', '冠带', '临官', '帝旺', '衰', '病', '死', '墓', '绝', '胎', '养'] as const;
const CHANGSHENG_START: Record<string, { startBranch: number; dir: 1 | -1 }> = {
  '甲': { startBranch: 11, dir: 1 }, // 亥
  '丙': { startBranch: 2, dir: 1 },  // 寅
  '戊': { startBranch: 2, dir: 1 },  // 寅
  '庚': { startBranch: 5, dir: 1 },  // 巳
  '壬': { startBranch: 8, dir: 1 },  // 申
  '乙': { startBranch: 6, dir: -1 }, // 午
  '丁': { startBranch: 9, dir: -1 }, // 酉
  '己': { startBranch: 9, dir: -1 }, // 酉
  '辛': { startBranch: 0, dir: -1 }, // 子
  '癸': { startBranch: 3, dir: -1 }, // 卯
};

export function calcChangSheng(stem: string, branch: string): string {
  const cfg = CHANGSHENG_START[stem];
  const bIdx = BRANCHES.indexOf(branch as (typeof BRANCHES)[number]);
  if (!cfg || bIdx < 0) return '—';
  const offset = ((bIdx - cfg.startBranch) * cfg.dir + 12) % 12;
  return CHANGSHENG_NAMES[offset];
}

/** 计算日主(dayStem)对目标天干(targetStem)的十神 */
export function calcTenGod(dayStem: string, targetStem: string): TenGod {
  const dEl = STEM_WUXING[dayStem];
  const tEl = STEM_WUXING[targetStem];
  if (!dEl || !tEl) return '比肩';
  const samePol = STEM_YINYANG[dayStem] === STEM_YINYANG[targetStem];

  const order: Wuxing[] = ['木', '火', '土', '金', '水'];
  const dIdx = order.indexOf(dEl);
  const tIdx = order.indexOf(tEl);
  const diff = (tIdx - dIdx + 5) % 5;

  switch (diff) {
    case 0: return samePol ? '比肩' : '劫财';
    case 1: return samePol ? '食神' : '伤官';
    case 2: return samePol ? '偏财' : '正财';
    case 3: return samePol ? '七杀' : '正官';
    case 4: return samePol ? '偏印' : '正印';
    default: return '比肩';
  }
}

/** 计算单柱神煞（综合年日干支） */
function calcPillarShenSha(
  pillarIdx: number,
  stem: string,
  branch: string,
  ganZhi: string,
  yearStem: string,
  yearBranch: string,
  monthBranch: string,
  dayStem: string,
  dayBranch: string,
): string[] {
  const res = new Set<string>();

  // 1. 天乙贵人（以日干、年干查地支）
  const tianYiMap: Record<string, string[]> = {
    '甲': ['丑', '未'], '戊': ['丑', '未'], '庚': ['丑', '未'],
    '乙': ['子', '申'], '己': ['子', '申'],
    '丙': ['亥', '酉'], '丁': ['亥', '酉'],
    '壬': ['卯', '巳'], '癸': ['卯', '巳'],
    '辛': ['寅', '午'],
  };
  if (tianYiMap[dayStem]?.includes(branch) || tianYiMap[yearStem]?.includes(branch)) {
    res.add('天乙贵人');
  }

  // 2. 文昌贵人（以日干、年干查）
  const wenChangMap: Record<string, string> = {
    '甲': '巳', '乙': '午', '丙': '申', '戊': '申', '丁': '酉', '己': '酉',
    '庚': '亥', '辛': '子', '壬': '寅', '癸': '卯',
  };
  if (wenChangMap[dayStem] === branch || wenChangMap[yearStem] === branch) {
    res.add('文昌贵人');
  }

  // 3. 禄神（日干查支）
  const luMap: Record<string, string> = {
    '甲': '寅', '乙': '卯', '丙': '巳', '戊': '巳', '丁': '午', '己': '午',
    '庚': '申', '辛': '酉', '壬': '亥', '癸': '子',
  };
  if (luMap[dayStem] === branch) {
    res.add('禄神');
  }

  // 4. 羊刃（日干查支）
  const yangRenMap: Record<string, string> = {
    '甲': '卯', '丙': '午', '戊': '午', '庚': '酉', '壬': '子',
  };
  if (yangRenMap[dayStem] === branch) {
    res.add('羊刃');
  }

  // 5. 驿马、桃花、华盖、将星（以年支、日支查）
  const checkTriad = (baseBranch: string) => {
    if (['申', '子', '辰'].includes(baseBranch)) {
      if (branch === '寅') res.add('驿马');
      if (branch === '酉') res.add('桃花');
      if (branch === '辰') res.add('华盖');
      if (branch === '子') res.add('将星');
    } else if (['寅', '午', '戌'].includes(baseBranch)) {
      if (branch === '申') res.add('驿马');
      if (branch === '卯') res.add('桃花');
      if (branch === '戌') res.add('华盖');
      if (branch === '午') res.add('将星');
    } else if (['巳', '酉', '丑'].includes(baseBranch)) {
      if (branch === '亥') res.add('驿马');
      if (branch === '午') res.add('桃花');
      if (branch === '丑') res.add('华盖');
      if (branch === '酉') res.add('将星');
    } else if (['亥', '卯', '未'].includes(baseBranch)) {
      if (branch === '巳') res.add('驿马');
      if (branch === '子') res.add('桃花');
      if (branch === '未') res.add('华盖');
      if (branch === '卯') res.add('将星');
    }
  };
  if (pillarIdx !== 0) checkTriad(yearBranch);
  if (pillarIdx !== 2) checkTriad(dayBranch);

  // 6. 红鸾、天喜（以年支查）
  const yIdx = BRANCHES.indexOf(yearBranch as (typeof BRANCHES)[number]);
  if (yIdx >= 0) {
    const hongLuanIdx = (3 - yIdx + 12) % 12;
    const tianXiIdx = (hongLuanIdx + 6) % 12;
    if (BRANCHES[hongLuanIdx] === branch) res.add('红鸾');
    if (BRANCHES[tianXiIdx] === branch) res.add('天喜');
  }

  // 7. 月德贵人（以月支查天干）
  const yueDeMap: Record<string, string> = {
    '寅': '丙', '午': '丙', '戌': '丙',
    '申': '壬', '子': '壬', '辰': '壬',
    '亥': '甲', '卯': '甲', '未': '甲',
    '巳': '庚', '酉': '庚', '丑': '庚',
  };
  if (yueDeMap[monthBranch] === stem) {
    res.add('月德贵人');
  }

  // 8. 魁罡日（日柱专论）
  if (pillarIdx === 2 && ['壬辰', '庚戌', '庚辰', '戊戌'].includes(ganZhi)) {
    res.add('魁罡');
  }

  return Array.from(res);
}

/** 扫描四柱干支刑冲合会关系 */
function detectGanZhiRelations(pillars: BaziPillar[]): GanZhiRelation[] {
  const relations: GanZhiRelation[] = [];

  // 1. 天干五合 & 天干相冲
  const stemHeMap: Record<string, string> = {
    '甲己': '合化土', '己甲': '合化土',
    '乙庚': '合化金', '庚乙': '合化金',
    '丙辛': '合化水', '辛丙': '合化水',
    '丁壬': '合化木', '壬丁': '合化木',
    '戊癸': '合化火', '癸戊': '合化火',
  };
  const stemChongMap: Record<string, string> = {
    '甲庚': '相冲', '庚甲': '相冲',
    '乙辛': '相冲', '辛乙': '相冲',
    '丙壬': '相冲', '壬丙': '相冲',
    '丁癸': '相冲', '癸丁': '相冲',
  };

  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      const pair = `${pillars[i].stem}${pillars[j].stem}`;
      if (stemHeMap[pair]) {
        relations.push({
          type: '天干五合',
          pillars: [pillars[i].label, pillars[j].label],
          description: `${pillars[i].label}${pillars[i].stem}与${pillars[j].label}${pillars[j].stem}${stemHeMap[pair]}`,
        });
      }
      if (stemChongMap[pair]) {
        relations.push({
          type: '天干相冲',
          pillars: [pillars[i].label, pillars[j].label],
          description: `${pillars[i].label}${pillars[i].stem}与${pillars[j].label}${pillars[j].stem}天干相冲`,
        });
      }
    }
  }

  // 2. 地支六合、六冲、相害、相刑
  const liuHeMap: Record<string, string> = {
    '子丑': '六合化土', '丑子': '六合化土',
    '寅亥': '六合化木', '亥寅': '六合化木',
    '卯戌': '六合化火', '戌卯': '六合化火',
    '辰酉': '六合化金', '酉辰': '六合化金',
    '巳申': '六合化水', '申巳': '六合化水',
    '午未': '六合化火土', '未午': '六合化火土',
  };
  const liuChongSet = new Set(['子午', '午子', '丑未', '未丑', '寅申', '申寅', '卯酉', '酉卯', '辰戌', '戌辰', '巳亥', '亥巳']);
  const xiangHaiSet = new Set(['子未', '未子', '丑午', '午丑', '寅巳', '巳寅', '卯辰', '辰卯', '申亥', '亥申', '酉戌', '戌酉']);
  const xiangXingMap: Record<string, string> = {
    '子卯': '无礼之刑', '卯子': '无礼之刑',
    '寅巳': '恃势之刑', '巳寅': '恃势之刑', '巳申': '相刑', '申巳': '相刑', '寅申': '相刑', '申寅': '相刑',
    '丑戌': '持势之刑', '戌丑': '持势之刑', '戌未': '持势之刑', '未戌': '持势之刑', '丑未': '相刑', '未丑': '相刑',
    '辰辰': '自刑', '午午': '自刑', '酉酉': '自刑', '亥亥': '自刑',
  };

  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      const b1 = pillars[i].branch;
      const b2 = pillars[j].branch;
      const pair = `${b1}${b2}`;

      if (liuHeMap[pair]) {
        relations.push({
          type: '地支六合',
          pillars: [pillars[i].label, pillars[j].label],
          description: `${pillars[i].label}${b1}与${pillars[j].label}${b2}${liuHeMap[pair]}`,
        });
      }
      if (liuChongSet.has(pair)) {
        relations.push({
          type: '地支六冲',
          pillars: [pillars[i].label, pillars[j].label],
          description: `${pillars[i].label}${b1}与${pillars[j].label}${b2}六冲`,
        });
      }
      if (xiangHaiSet.has(pair)) {
        relations.push({
          type: '地支相害',
          pillars: [pillars[i].label, pillars[j].label],
          description: `${pillars[i].label}${b1}与${pillars[j].label}${b2}相害`,
        });
      }
      if (xiangXingMap[pair] && !liuChongSet.has(pair)) {
        relations.push({
          type: '地支相刑',
          pillars: [pillars[i].label, pillars[j].label],
          description: `${pillars[i].label}${b1}与${pillars[j].label}${b2}${xiangXingMap[pair]}`,
        });
      }
    }
  }

  // 3. 地支三合局
  const branchesPresent = new Set(pillars.map(p => p.branch));
  const sanHeList: Array<{ branches: [string, string, string]; name: string }> = [
    { branches: ['申', '子', '辰'], name: '申子辰三合水局' },
    { branches: ['亥', '卯', '未'], name: '亥卯未三合木局' },
    { branches: ['寅', '午', '戌'], name: '寅午戌三合火局' },
    { branches: ['巳', '酉', '丑'], name: '巳酉丑三合金局' },
  ];
  for (const sh of sanHeList) {
    if (sh.branches.every(b => branchesPresent.has(b))) {
      relations.push({
        type: '地支三合',
        pillars: pillars.filter(p => sh.branches.includes(p.branch)).map(p => p.label),
        description: sh.name,
      });
    }
  }

  return relations;
}

/** 计算五行权重、日主旺衰、月令格局与喜用神 */
function analyzeWuxingAndGeju(
  pillars: [BaziPillar, BaziPillar, BaziPillar, BaziPillar],
): WuxingBreakdown {
  const counts: Record<Wuxing, number> = { '木': 0, '火': 0, '土': 0, '金': 0, '水': 0 };
  const scores: Record<Wuxing, number> = { '木': 0, '火': 0, '土': 0, '金': 0, '水': 0 };

  const stemWeights = [10, 12, 10, 10]; // 年干、月干、日干、时干
  const branchWeights = [12, 36, 16, 14]; // 月令权重最高（36分），日支次之（16分）
  const hiddenRatios: Record<number, number[]> = {
    1: [1.0],
    2: [0.7, 0.3],
    3: [0.6, 0.25, 0.15],
  };

  pillars.forEach((p, idx) => {
    counts[p.stemWuXing] += 1;
    counts[p.branchWuXing] += 1;
    scores[p.stemWuXing] += stemWeights[idx];

    const ratios = hiddenRatios[p.hiddenStems.length] ?? [1.0];
    p.hiddenStems.forEach((hs, hIdx) => {
      scores[hs.wuXing] += branchWeights[idx] * (ratios[hIdx] ?? 0.2);
    });
  });

  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0) || 100;
  const percentages: Record<Wuxing, number> = {
    '木': Math.round((scores['木'] / totalScore) * 100),
    '火': Math.round((scores['火'] / totalScore) * 100),
    '土': Math.round((scores['土'] / totalScore) * 100),
    '金': Math.round((scores['金'] / totalScore) * 100),
    '水': Math.round((scores['水'] / totalScore) * 100),
  };

  const dayStem = pillars[2].stem;
  const monthBranch = pillars[1].branch;
  const dayMasterElement = STEM_WUXING[dayStem];
  const dayMasterYinYang = STEM_YINYANG[dayStem];

  const order: Wuxing[] = ['木', '火', '土', '金', '水'];
  const dmIdx = order.indexOf(dayMasterElement);
  const yinElement = order[(dmIdx + 4) % 5];     // 生我（印枭）
  const shiElement = order[(dmIdx + 1) % 5];     // 我生（食伤）
  const caiElement = order[(dmIdx + 2) % 5];     // 我克（财才）
  const guanElement = order[(dmIdx + 3) % 5];    // 克我（官杀）

  const samePartyRaw = scores[dayMasterElement] + scores[yinElement];
  const samePartyScore = Math.round((samePartyRaw / totalScore) * 100);
  const otherPartyScore = 100 - samePartyScore;

  let strength: WuxingBreakdown['strength'];
  if (samePartyScore >= 58) strength = '身强';
  else if (samePartyScore >= 48) strength = '中和偏强';
  else if (samePartyScore >= 38) strength = '中和偏弱';
  else strength = '身弱';

  const isStrong = samePartyScore >= 48;
  const favorableElements: Wuxing[] = isStrong
    ? [shiElement, caiElement, guanElement]
    : [yinElement, dayMasterElement];
  const unfavorableElements: Wuxing[] = isStrong
    ? [dayMasterElement, yinElement]
    : [guanElement, caiElement, shiElement];

  // 月令格局判定（《子平真诠》透干优先，不透取月令本气）
  const monthHidden = pillars[1].hiddenStems;
  const outerStems = [pillars[0].stem, pillars[1].stem, pillars[3].stem];
  let mainTenGod: TenGod = monthHidden[0]?.tenGod ?? '比肩';
  for (const hs of monthHidden) {
    if (outerStems.includes(hs.stem) && hs.tenGod !== '比肩' && hs.tenGod !== '劫财') {
      mainTenGod = hs.tenGod;
      break;
    }
  }

  let geJuName = `${mainTenGod}格`;
  if (mainTenGod === '比肩') geJuName = '建禄格';
  else if (mainTenGod === '劫财') geJuName = dayMasterYinYang === '阳' ? '月刃格' : '建禄格';

  const geJuDescription =
    ZIPING_GEJU_INFO[geJuName]?.summary ??
    ZIPING_GEJU_INFO['正官格'].summary;

  const tiaoHouYongShen = QIONGTONG_TABLE[dayStem]?.[monthBranch]?.tiaoHou ?? ['丙', '癸'];

  return {
    counts,
    scores: {
      '木': Math.round(scores['木']),
      '火': Math.round(scores['火']),
      '土': Math.round(scores['土']),
      '金': Math.round(scores['金']),
      '水': Math.round(scores['水']),
    },
    percentages,
    dayMasterElement,
    dayMasterYinYang,
    samePartyScore,
    otherPartyScore,
    strength,
    favorableElements,
    unfavorableElements,
    tiaoHouYongShen,
    geJuName,
    geJuDescription,
  };
}

/**
 * 生成完整四柱八字命盘与古籍引证
 */
export function generateBaziChart(input: BaziBirthInput): BaziChart {
  const effHour = input.hour >= 0 && input.hour <= 11 ? input.hour * 2 : 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const solar = (Solar as any).fromYmdHms(input.year, input.month, input.day, effHour, 0, 0);
  const lunar = solar.getLunar();
  const ec = lunar.getEightChar();

  const yearGZ = ec.getYear() as string;
  const monthGZ = ec.getMonth() as string;
  const dayGZ = ec.getDay() as string;
  const timeGZ = ec.getTime() as string;

  const rawPillars = [
    {
      label: '年柱' as const,
      ganZhi: yearGZ,
      naYin: (ec.getYearNaYin?.() as string) || '—',
      diShi: (ec.getYearDiShi?.() as string) || '',
      xunKong: (ec.getYearXunKong?.() as string) || '—',
    },
    {
      label: '月柱' as const,
      ganZhi: monthGZ,
      naYin: (ec.getMonthNaYin?.() as string) || '—',
      diShi: (ec.getMonthDiShi?.() as string) || '',
      xunKong: (ec.getMonthXunKong?.() as string) || '—',
    },
    {
      label: '日柱' as const,
      ganZhi: dayGZ,
      naYin: (ec.getDayNaYin?.() as string) || '—',
      diShi: (ec.getDayDiShi?.() as string) || '',
      xunKong: (ec.getDayXunKong?.() as string) || '—',
    },
    {
      label: '时柱' as const,
      ganZhi: timeGZ,
      naYin: (ec.getTimeNaYin?.() as string) || '—',
      diShi: (ec.getTimeDiShi?.() as string) || '',
      xunKong: (ec.getTimeXunKong?.() as string) || '—',
    },
  ];

  const dayStem = dayGZ[0];
  const dayBranch = dayGZ[1];
  const yearStem = yearGZ[0];
  const yearBranch = yearGZ[1];
  const monthBranch = monthGZ[1];

  const weightLabels: Array<'本气' | '中气' | '余气'> = ['本气', '中气', '余气'];

  const pillars = rawPillars.map((rp, idx): BaziPillar => {
    const stem = rp.ganZhi[0];
    const branch = rp.ganZhi[1];
    const hiddenRaw = BRANCH_HIDDEN_STEMS[branch] ?? [];
    const hiddenStems: HiddenStemItem[] = hiddenRaw.map((hs, hIdx) => ({
      stem: hs,
      wuXing: STEM_WUXING[hs] ?? '土',
      tenGod: calcTenGod(dayStem, hs),
      weight: weightLabels[hIdx] ?? '余气',
    }));

    return {
      label: rp.label,
      ganZhi: rp.ganZhi,
      stem,
      branch,
      stemWuXing: STEM_WUXING[stem] ?? '土',
      branchWuXing: BRANCH_WUXING[branch] ?? '土',
      tenGodStem: idx === 2 ? '日主' : calcTenGod(dayStem, stem),
      hiddenStems,
      naYin: rp.naYin,
      diShi: rp.diShi || calcChangSheng(dayStem, branch),
      ziZuo: calcChangSheng(stem, branch),
      xunKong: rp.xunKong,
      shenSha: calcPillarShenSha(
        idx,
        stem,
        branch,
        rp.ganZhi,
        yearStem,
        yearBranch,
        monthBranch,
        dayStem,
        dayBranch,
      ),
    };
  }) as [BaziPillar, BaziPillar, BaziPillar, BaziPillar];

  const wuxing = analyzeWuxingAndGeju(pillars);
  const relations = detectGanZhiRelations(pillars);

  // 大运推算
  const yun = ec.getYun(input.gender === 'male' ? 1 : 0);
  const daYunRaw = (yun?.getDaYun?.() as Array<{
    getGanZhi: () => string;
    getStartAge: () => number;
    getEndAge: () => number;
    getStartYear: () => number;
    getEndYear: () => number;
  }>) || [];

  const daYuns: DaYunItem[] = daYunRaw
    .filter(d => Boolean(d.getGanZhi?.()))
    .slice(0, 8)
    .map((d, idx) => {
      const gz = d.getGanZhi();
      const s = gz[0];
      const b = gz[1];
      const mainHidden = (BRANCH_HIDDEN_STEMS[b] ?? ['戊'])[0];
      return {
        index: idx,
        ganZhi: gz,
        stem: s,
        branch: b,
        tenGodStem: calcTenGod(dayStem, s),
        tenGodBranch: calcTenGod(dayStem, mainHidden),
        naYin: SANMING_RIZHU_TABLE[gz]?.naYin ?? '—',
        startAge: d.getStartAge(),
        endAge: d.getEndAge(),
        startYear: d.getStartYear(),
        endYear: d.getEndYear(),
      };
    });

  const currentYear = new Date().getFullYear();
  let currentDaYunIndex = daYuns.findIndex(
    d => currentYear >= d.startYear && currentYear <= d.endYear,
  );
  if (currentDaYunIndex < 0) currentDaYunIndex = 0;

  const ditiansuiEntry = DITIANSUI_TIANGAN[dayStem] ?? DITIANSUI_TIANGAN['甲'];
  const qiongtongEntry = QIONGTONG_TABLE[dayStem]?.[monthBranch] ?? {
    tiaoHou: ['丙', '癸'],
    summary: '调候以寒暖燥湿平衡为要。',
  };
  const sanmingEntry = SANMING_RIZHU_TABLE[dayGZ] ?? {
    naYin: pillars[2].naYin,
    grade: '中等' as const,
    summary: `${dayGZ}日生人，坐支${dayBranch}，宜结合月令提纲与喜用神综合论断。`,
  };
  const zipingEntry = ZIPING_GEJU_INFO[wuxing.geJuName] ?? ZIPING_GEJU_INFO['正官格'];

  const prevJie = lunar.getPrevJie?.();
  const nextJie = lunar.getNextJie?.();
  const solarTermsHint =
    prevJie && nextJie
      ? `交节：${prevJie.getName()}（${prevJie.getSolar().toYmd()}） → ${nextJie.getName()}（${nextJie.getSolar().toYmd()}）`
      : '四柱严格按二十四节气交节时刻定年柱与月柱';

  const patterns = detectBaziPatterns(pillars, wuxing);
  const riShiHint = buildRiShiHint(pillars);
  const upcomingYears = detectUpcomingLiuNian(pillars, daYuns, calcTenGod);

  return {
    birthInfo: input,
    lunarDateText: `农历 ${lunar.getYearInGanZhi()}年 ${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
    solarTermsHint,
    pillars,
    taiYuan: (ec.getTaiYuan?.() as string) || '—',
    mingGong: (ec.getMingGong?.() as string) || '—',
    shenGong: (ec.getShenGong?.() as string) || '—',
    wuxing,
    relations,
    patterns,
    riShiHint,
    upcomingYears,
    daYunStartAge: daYuns[0]?.startAge ?? 1,
    daYunStartYear: daYuns[0]?.startYear ?? input.year + 1,
    daYuns,
    currentDaYunIndex,
    classicalRefs: {
      ditiansui: {
        title: `《滴天髓》论${dayStem}${wuxing.dayMasterElement}`,
        verse: ditiansuiEntry.verse,
        explanation: ditiansuiEntry.explanation,
      },
      qiongtong: {
        title: `《穷通宝鉴》${dayStem}${wuxing.dayMasterElement}生于${monthBranch}月`,
        season: `${monthBranch}月令`,
        tiaoHou: qiongtongEntry.tiaoHou,
        summary: qiongtongEntry.summary,
      },
      sanmingRizhu: {
        ganZhi: dayGZ,
        naYin: sanmingEntry.naYin,
        grade: sanmingEntry.grade,
        summary: sanmingEntry.summary,
        timingHint: riShiHint,
      },
      zipingGeju: {
        name: zipingEntry.name,
        summary: zipingEntry.summary,
      },
    },
  };
}
