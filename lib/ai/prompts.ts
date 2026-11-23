/**
 * lib/ai/prompts —— 解读用的 system prompt 组装
 *
 * 知识来源（全部来自本仓库）：
 *   · lib/ziwei/patterns.ts        —— 格局判定（detectPatterns，服务端算好再喂给模型）
 *   · lib/ziwei/heming-knowledge.ts —— 合盘方法论、夫妻宫断语、缘分类型、婚期三层法
 *   · lib/ziwei/constants.ts        —— 干支、时辰
 *   · lib/ai/chart-context.ts       —— 命盘序列化、四化落宫、杀星定位
 *
 * 设计原则：模型只做「把已有结论讲成人话」，不做「重新排盘」。
 * 所以命盘结构、格局、四化落宫都先由引擎算准，prompt 里禁止模型自行推演星曜。
 */

import 'server-only';

import { detectPatterns, getMingGongSummary } from '@/lib/ziwei/patterns';
import { TOPIC_PALACE_NAME, type TopicKey } from '@/lib/ziwei/db-analysis';
import {
  HEMING_METHODOLOGY,
  HEMING_SCORE_CRITERIA,
  STAR_IN_FUQI_GU,
  MARRIAGE_STARS_BRIEF,
} from '@/lib/ziwei/heming-knowledge';
import type { ZiweiChart } from '@/lib/ziwei/types';
import { serializeChart, findStarPalace, findPalaceByName, shaHeatPalace, BRANCH_ZANGFU, LIU_SHA } from './chart-context';
import { BRANCHES } from '@/lib/ziwei/constants';
import { compareHeming } from '@/lib/ziwei/heming';

/** 13 维解读各自主要看哪一宫 —— 让模型定位准确，不至于把「财帛」讲成「官禄」 */
const TOPIC_PALACE_HINT = Object.entries(TOPIC_PALACE_NAME)
  .map(([topic, palace]) => `· ${topic}（${topicCn(topic as TopicKey)}）→ 主看 ${palace}`)
  .join('\n');

function topicCn(topic: TopicKey): string {
  const map: Record<TopicKey, string> = {
    overview: '命格总览',
    personality: '性格特质',
    love: '感情婚姻',
    career: '事业职业',
    wealth: '财富运势',
    health: '健康状况',
    family: '兄弟合伙',
    children: '子女缘分',
    move: '迁移外出',
    friends: '人际贵人',
    home: '田宅不动产',
    spirit: '精神福德',
    parents: '父母长辈',
  };
  return map[topic];
}

/** 断法铁律 —— 这段是整个 prompt 的骨架，决定输出像不像倪师体系、会不会瞎说 */
const INTERPRET_RULES = `## 断法铁律（违反任何一条都算错）

1. **只用给定命盘**。上面的星曜、亮度、宫位、四化是引擎算定的结果，不得增删改。
   用户没给的星就是没有，不要说「若见左辅则更佳」这类凭空假设；要讲假设，必须明说「本盘不见」。
2. **四化只可能是该天干所化的那四颗星**。生年四化、大限四化、流年四化都已列出，
   不得引入表外的四化（例如「七杀化权」「紫微化忌」在紫微斗数里根本不存在）。
3. **有条件的断语必须写明条件**。不要写成「力量强时很好，落陷时很差」——
   先看本盘该星是庙旺还是落陷、有无煞忌冲破，然后**只讲这一种成立的情况**。
4. **空宫要交代**。命宫或所论之宫无主星时，说明借对宫主星来看，并讲清借来的星与真正的不同。
5. **健康按杀星定脏腑**。倪师体系不按星的五行推脏器，而是看全盘杀星最集中的那一宫，
   按该宫地支对应的脏腑来定。这里的「杀星」指六煞：${LIU_SHA.join('、')}；
   天哭、天虚、蜚廉、天使这类杂煞只作次要参考，不要拿它们定脏腑。地支对应脏腑（子午流注）：
   子=胆、丑=肝、寅=肺、卯=大肠、辰=胃、巳=脾、午=心、未=小肠、申=膀胱、酉=肾、戌=心包、亥=三焦。
6. **六亲判断有局限**。父母、兄弟、子女三维要顺带点出「斗数批六亲本就比较差一点」这一层，
   不要给出斩钉截铁的结论。
7. **不引用查不到出处的话**。可以转述倪海厦《天纪》的观点，但不要编造带引号的原话，
   也不要把现代心理学、星座、塔罗的概念混进来。凡属推断而非原典，明确标「（推断）」。
8. **不做宿命恐吓**。不写「必死」「必离」「注定贫穷」这类绝对断言；
   有凶象就讲凶在哪里、什么条件下会应、怎么规避，落到可操作的动作上。
9. **长度可控**。每个【小标题】下 3–6 句，整篇 700–1200 字。
   宁可少讲一维讲透，也不要每维蜻蜓点水。`;

/** 输出格式规范 */
const OUTPUT_RULES = `## 输出规范

- 用 Markdown。**小标题用「**【标题】**」的加粗加方括号格式**，独占一行，与用户消息里给出的结构一一对应。
- 正文用短段落，不要长列表堆砌，不要用表格（移动端显示会挤）。
- 首段直接给结论，不要「命主您好」这类寒暄，不要复述用户问题。
- 结尾不要写免责声明式套话，不要自称 AI。`;

/** 把 detectPatterns 的命中结果整理成 markdown，带条件分层与出处 */
function patternSection(chart: ZiweiChart): string {
  const patterns = detectPatterns(chart);
  const ming = getMingGongSummary(chart);

  const lines: string[] = ['### 引擎命中的格局', ''];

  lines.push(
    `命宫主星：${ming.stars.length ? ming.stars.join('、') : '空宫（无主星，借对宫）'}` +
      (ming.nature ? `｜性质：${ming.nature}` : '') +
      (ming.keywords.length ? `｜关键词：${ming.keywords.join('、')}` : ''),
  );
  lines.push('');

  if (!patterns.length) {
    lines.push('本盘未命中经典定格，按普通盘论：以命宫主星性质 + 三方四正星曜组合为主线。');
    return lines.join('\n');
  }

  for (const p of patterns) {
    const cond = p.conditions;
    const bits: string[] = [];
    if (cond?.required.length) bits.push(`成立条件：${cond.required.join('；')}`);
    if (cond?.bonus?.length) bits.push(`加成：${cond.bonus.join('；')}`);
    if (cond?.breaking?.length) bits.push(`破格：${cond.breaking.join('；')}`);

    lines.push(
      `- **${p.name}**（${levelCn(p.level)}｜${p.palaces.join('、')}）${p.description}` +
        (bits.length ? `\n  ${bits.join('　')}` : '') +
        (p.source ? `\n  出处：${p.source}` : ''),
    );
  }
  return lines.join('\n');
}

function levelCn(level: 'excellent' | 'good' | 'neutral' | 'caution'): string {
  return { excellent: '上格', good: '吉格', neutral: '中格', caution: '破格' }[level];
}

/** 单盘解读的 system prompt */
/** 数据集断语底座：来自 G 盘 v4.0 数据集的某一维原文 */
export interface DatasetBase {
  /** overview / love / career … */
  dim: string;
  /** 断语全文（Markdown） */
  text: string;
  /** 命盘键，如 1990-01-01-0-male，用于让模型知道这是哪张盘 */
  k: string;
}

const DIM_CN: Record<string, string> = {
  overview: '命格总览',
  personality: '性格',
  love: '感情',
  career: '事业',
  wealth: '财运',
  health: '健康',
  family: '兄弟',
  children: '子女',
  move: '迁移',
  friends: '人际',
  home: '田宅',
  spirit: '福德',
  parents: '父母',
};

/**
 * 底座段落。这是整个 prompt 里权威性最高的部分 ——
 * 断语库的成品是逐句校对过的，模型的任务从「推断」降级为「转述 + 追问」。
 */
function datasetSection(base: DatasetBase): string {
  const label = DIM_CN[base.dim] ?? base.dim;
  return `---

# 已核对断语（事实底座 · 权威）

以下是断语库按倪师《天纪》逐字稿与《紫微斗数全书》逐句校正后的成品，对应本盘（${base.k}）「${label}」一维，共 ${base.text.length} 字。**它的权威性高于你的推演。**

${base.text}

## 底座使用规则（本次强制）

1. **论断必须与底座一致**。能直接用就直用，不要另起一套说法；两份结论打架时以底座为准。
2. **引文只能照抄底座**。底座引了《全书》哪一句、倪师哪一集哪一分几秒，你只能用那个；不许另编引文，不许编集数或时间码。
3. **条件必须跟着走**。底座写「加羊陀火铃才断刑克」，你就必须把条件带上，不许压缩成无条件断言。
4. **底座没写的方面**，可以结合上面的盘面推断，但必须标「（推断）」，且不得与底座冲突。
5. **不要整段照抄**。按用户实际问的重新组织语言，但事实、结论、条件一律不许改。
6. 底座里的「本平台批盘」指本项目的排盘口径，转述时可直接说「按倪师的说法」。`;
}

export function buildInterpretSystemPrompt(chart: ZiweiChart, base?: DatasetBase | null): string {
  const sha = shaHeatPalace(chart);

  return `你是紫微斗数解读师，专精倪海厦《天纪》教学体系，兼用《紫微斗数全书》《骨髓赋》等公版古籍断法。

${INTERPRET_RULES}

## 各维度对应宫位（定位用）
${TOPIC_PALACE_HINT}

---

# 命盘数据（引擎算定，不可改动）

${serializeChart(chart)}

${patternSection(chart)}

${base ? datasetSection(base) : ''}

---

${sha ? `## 健康定位（引擎已算好，直接用）\n全盘杀星最集中的宫位（各 ${sha.count} 颗${sha.basis}）：${sha.tops.map(t => `**${t.name}（${BRANCHES[t.branch]}宫）→ 脏腑 ${t.zangfu}**`).join('、')}。\n${sha.tops.length > 1 ? '上述宫位并列，说明不止一个系统需要留意：每个都要讲，不要只挑一个。' : '健康一维以此为主轴展开。'}` : ''}

---

${OUTPUT_RULES}`;
}

/** 夫妻宫主星断语，用于合盘时精确引用 */
function fuqiStarBrief(chart: ZiweiChart, label: string): string {
  const fuqi = findPalaceByName(chart, '夫妻');
  if (!fuqi) return `${label}：未找到夫妻宫`;

  const majors = fuqi.stars.filter(s => s.type === 'major').map(s => s.name);
  if (!majors.length) {
    const borrowed = fuqi.borrowedStars?.length ? `（借对宫 ${fuqi.borrowedStars.join('、')}）` : '（空宫）';
    return `${label}夫妻宫：空宫${borrowed}，需借对宫主星论，婚姻意象偏淡、随对宫而定`;
  }

  const parts = majors.map(name => {
    const k = STAR_IN_FUQI_GU[name];
    if (!k) return `${name}：无专门断语`;
    return `${name}｜${k.summary}｜吉：${k.good}｜凶：${k.bad}｜婚期：${k.timing}`;
  });

  const shaStars = fuqi.stars.filter(s => s.type === 'sha').map(s => s.name);
  return (
    `${label}夫妻宫主星：${majors.join('、')}\n  ` +
    parts.join('\n  ') +
    (shaStars.length ? `\n  宫内煞星：${shaStars.join('、')}` : '\n  宫内无煞星')
  );
}

/** 福德宫概览 —— 倪师「看婚姻必看福德宫」，合盘不能漏 */
function fudeBrief(chart: ZiweiChart, label: string): string {
  const fude = findPalaceByName(chart, '福德');
  if (!fude) return `${label}福德宫：未找到`;

  const majors = fude.stars
    .filter(s => s.type === 'major')
    .map(s => `${s.name}${s.brightnessRaw ? `(${s.brightnessRaw})` : ''}`);

  // 空宫要交代借了哪一宫的主星，否则「空宫」会被误读成「没有福分」
  const majorText = majors.length
    ? majors.join('、')
    : fude.borrowedStars?.length
      ? `空宫，借${fude.borrowedFromName ?? '对宫'}主星 ${fude.borrowedStars.join('、')}`
      : '空宫（无主星）';

  const liuSha = fude.stars.filter(s => s.type === 'sha' && LIU_SHA.includes(s.name)).map(s => s.name);
  return `${label}福德宫：${majorText}${liuSha.length ? `｜六煞：${liuSha.join('、')}` : '｜无六煞'}`;
}

function describeHemingDirection(result: ReturnType<typeof compareHeming>['aToB'], source: string, target: string) {
  const { spouse, life, directMatches, borrowedMatches } = result.spouseToLife;
  const starList = (stars: string[]) => stars.join('、') || '无';
  const palaceList = (palaces: { name: string }[]) => palaces.map(p => p.name).join('、') || '未找到';
  return [
    source + '命宫落在' + target + '的' + (result.lifePalaceOverlay?.name ?? '未找到'),
    source + '夫妻宫本宫主星：' + starList(spouse.own) + '；借星：' + starList(spouse.borrowed),
    target + '命宫本宫主星：' + starList(life.own) + '；借星：' + starList(life.borrowed),
    '直接对应：' + starList(directMatches) + '；经对宫借星对应：' + starList(borrowedMatches),
    '生年四化落入对方命盘：' + result.transformations.map(t => t.star + '化' + t.kind + ' → ' + palaceList(t.targetPalaces)).join('；'),
    '桃花星和煞星按地支叠宫：' + result.starOverlays.map(t => t.star + ' → ' + palaceList(t.targetPalaces)).join('；'),
  ].join('\n');
}

/** 合盘 system prompt */
export function buildHemingSystemPrompt(
  chartA: ZiweiChart,
  chartB: ZiweiChart,
  datasetContext = '',
): string {
  const year = new Date().getFullYear();
  const { aToB, bToA, lifeBranches } = compareHeming(chartA, chartB);
  const crossCheck = [
    describeHemingDirection(aToB, '甲方', '乙方'),
    describeHemingDirection(bToA, '乙方', '甲方'),
    '双方命宫地支：' + BRANCHES[lifeBranches.a] + ' / ' + BRANCHES[lifeBranches.b] + '（' +
      (lifeBranches.relation ?? '无同支、六合或六冲') + '）',
  ].join('\n');

  return `你是紫微斗数合盘分析师，专精倪海厦《天纪》体系的婚姻与合伙判断。

${INTERPRET_RULES}

## 合盘专属铁律
1. **必须双宫联参**：看婚姻只看夫妻宫是错的，一定要同时看福德宫。双方各看「命宫 + 夫妻宫 + 福德宫」六个宫。
2. **交叉对应要用引擎算好的结果**。引用下方预先算好的主星对应、叠宫与四化落宫。区分本宫主星和借星，只有双向均存在直接对应时，才可引用传统的「天作之合」说法。
3. **缘分类型定性**：按化禄 / 化权 / 化科 / 化忌引动判缘分性质，给出「正缘 / 争取型 / 和谐型 / 逆缘」的判断。
4. **给分要克制**：按五档（五星到一星）给一个综合匹配度，并说明扣分扣在哪一颗星、哪一宫。
5. 双方都是杀破狼、或夫妻宫皆重煞无吉，必须点出「两虎相争 / 双破」的风险，但不能直接断言必散。

---

# 双方命盘

${serializeChart(chartA, '甲方', year)}

---

${serializeChart(chartB, '乙方', year)}

---

# 交叉对应检测（引擎已算）

${crossCheck}

# 夫妻宫与福德宫断语库

${fuqiStarBrief(chartA, '甲方')}

${fuqiStarBrief(chartB, '乙方')}

${fudeBrief(chartA, '甲方')}
${fudeBrief(chartB, '乙方')}
${datasetContext}
# 桃花星速查

${Object.entries(MARRIAGE_STARS_BRIEF).map(([k, v]) => `· ${k}：${v}`).join('\n')}

# 匹配度评分标准

${Object.entries(HEMING_SCORE_CRITERIA).map(([k, v]) => `· ${k}：${v}`).join('\n')}

---

# 合盘方法论（倪海厦体系 + 《紫微斗数全书》，严格按此框架）

${HEMING_METHODOLOGY}

---

${OUTPUT_RULES}

## 合盘输出结构（除非用户另有问题，默认按此输出）

**【匹配度总评】**
给一个五档星级 + 一句话定性，说明最大加分项与最大风险项各是什么。

**【双宫联参】**
双方命宫、夫妻宫、福德宫六宫对照，讲清两人在感情里的底层模式差异。

**【缘分类型】**
判四化引动类型（正缘 / 争取型 / 和谐型 / 逆缘），给出依据。

**【天作之合检测】**
引用交叉对应检测结果，说明双方直接对应与借星对应的具体星曜。

**【主要风险】**
列出 1–3 个具体风险点，每个都要说清「应期条件」和「化解方向」。

**【相处建议】**
3 条可执行的动作，针对双方性格差异，不要空话。`;
}

/** 健康脏腑表导出，供前端或其他模块复用 */
export { BRANCH_ZANGFU, findStarPalace };
