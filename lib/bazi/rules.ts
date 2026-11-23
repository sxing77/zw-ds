import type {
  BaziPatternSignal,
  BaziPillar,
  DaYunItem,
  LiuNianSignal,
  TenGod,
  WuxingBreakdown,
} from './types';

const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'] as const;
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const;

const STEM_CHONG = new Set(['甲庚', '庚甲', '乙辛', '辛乙', '丙壬', '壬丙', '丁癸', '癸丁']);
const BRANCH_CHONG = new Set(['子午', '午子', '丑未', '未丑', '寅申', '申寅', '卯酉', '酉卯', '辰戌', '戌辰', '巳亥', '亥巳']);
const BRANCH_HE = new Set(['子丑', '丑子', '寅亥', '亥寅', '卯戌', '戌卯', '辰酉', '酉辰', '巳申', '申巳', '午未', '未午']);

function isTianKeDiChong(gz1: string, gz2: string): boolean {
  if (gz1.length < 2 || gz2.length < 2) return false;
  return STEM_CHONG.has(`${gz1[0]}${gz2[0]}`) && BRANCH_CHONG.has(`${gz1[1]}${gz2[1]}`);
}

/** 统计四柱天干与藏干中各类十神出现的柱位 */
function collectTenGodPillars(pillars: [BaziPillar, BaziPillar, BaziPillar, BaziPillar]) {
  const stemMap = new Map<TenGod, string[]>();
  const allMap = new Map<TenGod, string[]>();

  pillars.forEach((p, idx) => {
    if (idx !== 2) {
      const arr = stemMap.get(p.tenGodStem) ?? [];
      arr.push(p.label);
      stemMap.set(p.tenGodStem, arr);

      const allArr = allMap.get(p.tenGodStem) ?? [];
      allArr.push(p.label);
      allMap.set(p.tenGodStem, allArr);
    }
    p.hiddenStems.forEach(h => {
      const arr = allMap.get(h.tenGod) ?? [];
      if (!arr.includes(p.label)) arr.push(p.label);
      allMap.set(h.tenGod, arr);
    });
  });

  return { stemMap, allMap };
}

/**
 * 1. 检测原局十神组合与格局成败铁律（《子平真诠》《滴天髓》《三命通会》实战规则）
 */
export function detectBaziPatterns(
  pillars: [BaziPillar, BaziPillar, BaziPillar, BaziPillar],
  wuxing: WuxingBreakdown,
): BaziPatternSignal[] {
  const signals: BaziPatternSignal[] = [];
  const { stemMap, allMap } = collectTenGodPillars(pillars);

  const hasStem = (tg: TenGod) => (stemMap.get(tg)?.length ?? 0) > 0;
  const hasAny = (tg: TenGod) => (allMap.get(tg)?.length ?? 0) > 0;
  const getCols = (tgs: TenGod[]) =>
    Array.from(new Set(tgs.flatMap(tg => allMap.get(tg) ?? [])));

  const isStrong = wuxing.strength === '身强' || wuxing.strength === '中和偏强';
  const dayStem = pillars[2].stem;
  const dayBranch = pillars[2].branch;
  const dayGZ = pillars[2].ganZhi;
  const monthBranch = pillars[1].branch;

  // 1) 伤官见官 vs 伤官佩印
  if (hasStem('伤官') && hasStem('正官')) {
    if (hasAny('正印') || hasAny('偏印')) {
      signals.push({
        name: '伤官佩印（化伤护官）',
        level: '吉格',
        pillars: getCols(['伤官', '正官', '正印', '偏印']),
        summary: '天干伤官与正官同见，幸得原局有印星通关制伤护官，反主聪明有城府、文武兼资、以才华驾驭权柄。',
        classicQuote: '《子平真诠》：「伤官见官，为祸百端；若有印绶制伤，反成贵格。」',
      });
    } else if (hasAny('正财') || hasAny('偏财')) {
      signals.push({
        name: '伤官生财以解见官',
        level: '双面',
        pillars: getCols(['伤官', '正官', '正财', '偏财']),
        summary: '原局伤官见官，喜见财星化伤生官；事业多主靠专业才艺或商业变现开路，唯防岁运冲克财星时引发口舌是非。',
      });
    } else {
      signals.push({
        name: '伤官见官',
        level: '留意',
        pillars: getCols(['伤官', '正官']),
        summary: '天干伤官克正官且缺印星通关，主个性锐利不喜受拘束，职场易与上级或规章产生摩擦，宜走独立专业或技术路线。',
        classicQuote: '古诀：「伤官见官，不惹官灾必有口舌；若走印运或财运则可化解。」',
      });
    }
  }

  // 2) 食神制杀 / 杀印相生 / 官杀混杂
  if (hasAny('七杀')) {
    if (hasStem('正官') && hasStem('七杀')) {
      signals.push({
        name: '官杀混杂',
        level: '留意',
        pillars: getCols(['正官', '七杀']),
        summary: '正官与七杀并透天干，主人生肩负多重责任或选择摇摆，感情与事业容易双线并行；若大运去杀留官或去官留杀则清贵。',
      });
    }
    if (hasAny('食神') && (isStrong || hasStem('食神'))) {
      signals.push({
        name: '食神制杀',
        level: '吉格',
        pillars: getCols(['食神', '七杀']),
        summary: '食神制伏七杀，将压力与挑战转化为执行力与权威，极利创业、管理、军警法务或高竞争行业，忌枭印夺食破局。',
        classicQuote: '《三命通会》：「食神制杀，英雄独压万人。」',
      });
    }
    if (hasAny('正印') || hasAny('偏印')) {
      signals.push({
        name: '杀印相生',
        level: '吉格',
        pillars: getCols(['七杀', '正印', '偏印']),
        summary: '七杀生印、印再生身，化压力为贵人与权柄，抗压能力极强，越到关键硬仗越能逢凶化吉、得长辈或平台提拔。',
      });
    }
  }

  // 3) 枭神夺食（偏印克食神）
  if (hasStem('偏印') && hasStem('食神')) {
    if (hasAny('偏财') || hasAny('正财')) {
      signals.push({
        name: '枭印夺食得财制化',
        level: '双面',
        pillars: getCols(['偏印', '食神', '偏财', '正财']),
        summary: '天干枭食相战，幸有财星制枭护食；平时容易想得多、行动力受阻，但遇财运或主动求财落地即可破局。',
      });
    } else {
      signals.push({
        name: '枭神夺食',
        level: '留意',
        pillars: getCols(['偏印', '食神']),
        summary: '偏印贴克食神且原局缺财星解救，主思虑多疑、计划易生变故，亦须留意脾胃消化与情绪内耗，宜多行善布施、遇偏财岁运可解。',
        classicQuote: '《渊海子平》：「枭神见食，若无偏财制伏，主多谋少成、饮食失调。」',
      });
    }
  }

  // 4) 食伤生财
  if ((hasAny('食神') || hasAny('伤官')) && (hasAny('正财') || hasAny('偏财'))) {
    signals.push({
      name: '食伤生财',
      level: '吉格',
      pillars: getCols(['食神', '伤官', '正财', '偏财']),
      summary: '才华技艺（食伤）直接转化为实在财富（财星），不靠死守呆板规则，最宜以专业能力、内容、咨询、贸易或产品生财。',
    });
  }

  // 5) 财星坏印 vs 官印相生
  if ((hasStem('正财') || hasStem('偏财')) && hasStem('正印') && !isStrong) {
    signals.push({
      name: '贪财坏印',
      level: '留意',
      pillars: getCols(['正财', '偏财', '正印']),
      summary: '身弱而财星透干克制正印，切忌为短期利益牺牲信誉、学业或稳定根基；行官杀运通关或比劫运助身可转吉。',
    });
  } else if (hasAny('正官') && hasAny('正印')) {
    signals.push({
      name: '官印相生',
      level: '吉格',
      pillars: getCols(['正官', '正印']),
      summary: '官星生印、印星护身，主行事光明稳健、信用度高，易在体制、大平台或正规专业领域获得稳定职权与名望。',
    });
  }

  // 6) 羊刃驾杀 / 比劫夺财
  const hasYangRen = pillars.some(p => p.shenSha.includes('羊刃'));
  if (hasYangRen && (hasAny('七杀') || hasAny('正官'))) {
    signals.push({
      name: '阳刃驾杀（制刃成权）',
      level: '吉格',
      pillars: pillars.filter(p => p.shenSha.includes('羊刃')).map(p => p.label),
      summary: '命带羊刃而见官杀制伏，主胆识过人、执行决断力极强，能担大任、成大事；最忌岁运冲破羊刃。',
    });
  } else if (!isStrong && (stemMap.get('比肩')?.length ?? 0) + (stemMap.get('劫财')?.length ?? 0) >= 2 && hasAny('正财')) {
    signals.push({
      name: '比劫见财（防分夺）',
      level: '双面',
      pillars: getCols(['比肩', '劫财', '正财']),
      summary: '比劫多见而财星显露，朋友同辈助力与竞争并存；合伙求财须明晰账目权责，不宜轻信口头担保或盲目借贷。',
    });
  }

  // 7) 特殊组合：金水伤官 / 木火通明 / 魁罡日
  if ((dayStem === '庚' || dayStem === '辛') && ['亥', '子', '丑'].includes(monthBranch) && hasAny('伤官')) {
    signals.push({
      name: '金水伤官',
      level: '吉格',
      pillars: ['月柱', '日柱'],
      summary: '金水伤官主冰雪聪明、才思敏捷、审美与表达出众；喜见丙丁火调候暖局（金水伤官喜见官），则富贵清显。',
    });
  }
  if ((dayStem === '甲' || dayStem === '乙') && ['巳', '午', '寅', '卯'].includes(monthBranch) && ['丙', '丁'].some(s => pillars.some(p => p.stem === s))) {
    signals.push({
      name: '木火通明',
      level: '吉格',
      pillars: ['月柱', '日柱'],
      summary: '木火相生而秀气吐露，主悟性高、文采与表达力极佳，极具艺术、教育、文化或品牌策划天赋。',
    });
  }
  if (['庚辰', '庚戌', '壬辰', '戊戌'].includes(dayGZ)) {
    const chongDay = pillars.some((p, i) => i !== 2 && BRANCH_CHONG.has(`${p.branch}${dayBranch}`));
    signals.push({
      name: chongDay ? '魁罡逢冲' : '魁罡纯清',
      level: chongDay ? '双面' : '吉格',
      pillars: ['日柱'],
      summary: chongDay
        ? '日坐魁罡而原局地支相冲，性格刚烈果敢但起伏较大，须收敛锋芒、忌冲动决断。'
        : '日坐魁罡，主聪慧果断、自带威严与领导魄力，喜身旺而忌刑冲财官过重。',
    });
  }

  return signals;
}

/**
 * 2. 《三命通会》日柱 × 时柱精断（结合十神归宿 + 日禄归时 / 时上一位贵等古法）
 */
export function buildRiShiHint(
  pillars: [BaziPillar, BaziPillar, BaziPillar, BaziPillar],
): string {
  const dayStem = pillars[2].stem;
  const hourPillar = pillars[3];
  const hourBranch = hourPillar.branch;
  const hourTenGod = hourPillar.tenGodStem;

  // 日禄归时格检测（时支为日干之禄，且原局不见官星破禄）
  const luBranchMap: Record<string, string> = {
    '甲': '寅', '乙': '卯', '丙': '巳', '戊': '巳', '丁': '午', '己': '午',
    '庚': '申', '辛': '酉', '壬': '亥', '癸': '子',
  };
  if (luBranchMap[dayStem] === hourBranch) {
    return `【日禄归时】日主${dayStem}之禄神落于时支${hourBranch}，晚年根基稳固、自立成家，若原局官杀不过重，主中年后财禄渐丰、晚景安泰。`;
  }

  // 时上一位贵（时干透七杀且仅此一位）
  const shaCount = pillars.filter((p, i) => i !== 2 && p.tenGodStem === '七杀').length;
  if (hourTenGod === '七杀' && shaCount === 1) {
    return `【时上一位贵】时干独透七杀（${hourPillar.ganZhi}），主中晚年有魄力掌实权或立独门家业，若日主健旺或有食神制伏，晚运反主威望显达。`;
  }

  const timeGodHints: Record<TenGod, string> = {
    '日主': '时柱见比肩，晚年独立自主，子女个性有主见，宜早作财务规划。',
    '比肩': '时干透比肩，晚运自强不息，子女独立性高，合伙事宜宜界限清晰。',
    '劫财': '时干透劫财，中晚年防替亲友担责破耗，子女宜放手让其自主历练。',
    '食神': '时干坐食神，主晚年心态从容、衣食丰足、有口福与享福之象，子女温和孝顺。',
    '伤官': '时干坐伤官，晚年仍精力活跃、好钻研或靠专长余热发光，唯须防言辞直率得罪晚辈。',
    '偏财': '时干坐偏财，中晚年仍有投资或副业偏财机会，财来财去宜留固定资产守库。',
    '正财': '时干坐正财，主勤俭持家、晚景财务稳健，子女踏实可靠。',
    '七杀': '时干坐七杀，晚年仍闲不住、操心事业或子孙事务，须注意劳逸结合护心肺。',
    '正官': '时干坐正官，主晚年重名誉规矩、子女端正有成，若身强则为晚年贵气之象。',
    '偏印': '时干坐偏印，晚年喜清静或钻研宗教哲学、养生技艺，宜多与外界保持交流。',
    '正印': '时干坐正印，主晚年得长辈遗泽或子女反哺照顾，精神安稳、好学不倦。',
  };

  return `时柱${hourPillar.ganZhi}（${hourTenGod}坐${hourPillar.hiddenStems.map(h => h.tenGod).join('/')}）：${timeGodHints[hourTenGod]}`;
}

/**
 * 3. 未来 10 年流年应期推演（岁运并临、天克地冲、夫妻宫引动、冲提纲）
 */
export function detectUpcomingLiuNian(
  pillars: [BaziPillar, BaziPillar, BaziPillar, BaziPillar],
  daYuns: DaYunItem[],
  calcTenGodFn: (dayStem: string, targetStem: string) => TenGod,
  startYear = new Date().getFullYear(),
  yearsCount = 10,
): LiuNianSignal[] {
  const dayStem = pillars[2].stem;
  const dayGZ = pillars[2].ganZhi;
  const monthGZ = pillars[1].ganZhi;
  const dayBranch = pillars[2].branch;
  const results: LiuNianSignal[] = [];

  for (let i = 0; i < yearsCount; i++) {
    const year = startYear + i;
    const stem = STEMS[((year - 4) % 10 + 10) % 10];
    const branch = BRANCHES[((year - 4) % 12 + 12) % 12];
    const ganZhi = `${stem}${branch}`;
    const tenGodStem = calcTenGodFn(dayStem, stem);

    const dy =
      daYuns.find(d => year >= d.startYear && year <= d.endYear) ?? daYuns[0];
    const dyGZ = dy?.ganZhi ?? '';

    const tags: string[] = [];
    const hints: string[] = [];

    if (dyGZ && ganZhi === dyGZ) {
      tags.push('岁运并临');
      hints.push(`流年与大运同为${ganZhi}，主该年生活环境、事业或健康出现重大节点变动`);
    }
    if (isTianKeDiChong(ganZhi, dayGZ)) {
      tags.push('天克地冲日柱');
      hints.push(`流年${ganZhi}与日柱${dayGZ}天克地冲，感情婚姻、合作关系或自身状态变动极大`);
    } else if (BRANCH_CHONG.has(`${branch}${dayBranch}`)) {
      tags.push('冲夫妻宫');
      hints.push(`流年地支${branch}冲动日支${dayBranch}（夫妻宫），留意感情沟通、搬迁或出差变动`);
    } else if (BRANCH_HE.has(`${branch}${dayBranch}`)) {
      tags.push('合夫妻宫');
      hints.push(`流年地支${branch}与日支${dayBranch}六合，利感情升温、脱单定情或合作促成`);
    }

    if (isTianKeDiChong(ganZhi, monthGZ)) {
      tags.push('冲提纲');
      hints.push(`流年与月柱${monthGZ}天克地冲，工作岗位、居住环境或长辈事务易有较大调整`);
    } else if (dyGZ && isTianKeDiChong(ganZhi, dyGZ)) {
      tags.push('岁运天克地冲');
      hints.push(`流年${ganZhi}冲克当前大运${dyGZ}，大事决策宜先稳后进`);
    }

    const importance: LiuNianSignal['importance'] =
      tags.some(t => t.includes('并临') || t.includes('天克地冲') || t === '冲提纲')
        ? '高'
        : tags.length > 0
        ? '中'
        : '平';

    results.push({
      year,
      ganZhi,
      tenGodStem,
      daYunGanZhi: dyGZ,
      tags,
      importance,
      hint: hints.length > 0 ? hints.join('；') + '。' : `${ganZhi}年（${tenGodStem}透干），运势随${dyGZ || '大运'}平稳推进。`,
    });
  }

  return results;
}
