import 'server-only';
import { randomUUID } from 'node:crypto';
import { streamChat } from '@/lib/ai/provider';
import { buildHemingDatasetContext } from '@/lib/ai/heming-dataset';
import { generateChart } from '@/lib/ziwei/algorithm';
import { BRANCHES } from '@/lib/ziwei/constants';
import { compareHeming } from '@/lib/ziwei/heming';
import { CommerceError } from './config';
import { commerceDb } from './db';
import { type Order } from './orders';
import { REPORT_PRODUCTS, reportChapters, reportFollowupLimit, type ReportChapter } from './report-format';

function chartFacts(a: ReturnType<typeof generateChart>, b: ReturnType<typeof generateChart>) {
  const placements = [a, b].map(chart => chart.palaces.map(palace => ({
    palace: palace.name, branch: BRANCHES[palace.branch],
    mainStars: palace.stars.filter(star => star.type === 'major').map(star => star.name),
    borrowedStars: palace.borrowedStars,
    borrowedFrom: palace.borrowedFromName,
  })));
  return { ...compareHeming(a, b), placements };
}

function ziweiFacts(chart: ReturnType<typeof generateChart>) {
  return {
    wuxingJu: chart.wuxingJuName,
    mingGong: BRANCHES[chart.mingGongBranch],
    shenGong: BRANCHES[chart.shenGongBranch],
    daYun: chart.daXians.slice(0, 6).map(d => ({
      range: `${d.startAge}-${d.endAge}岁`,
      palace: d.palaceName,
      stem: d.stemName,
    })),
    palaces: chart.palaces.map(palace => ({
      palace: palace.name,
      branch: BRANCHES[palace.branch],
      isMing: palace.isMingGong,
      isShen: palace.isShenGong,
      mainStars: palace.stars.filter(star => star.type === 'major').map(star => ({
        name: star.name,
        brightness: star.brightness,
        siHua: star.siHua,
      })),
      borrowedStars: palace.borrowedStars,
      borrowedFrom: palace.borrowedFromName,
    })),
  };
}

async function generateZiweiReport(order: Order, question?: string) {
  const chart = generateChart(order.birth_a);
  const facts = ziweiFacts(chart);
  const chapters = REPORT_PRODUCTS.ziwei.chapters.map(c => c.title);

  if (order.provider === 'local' && process.env.COMMERCE_LOCAL_USE_MODEL !== '1') {
    if (question) {
      return `本地测试答复（${chart.wuxingJuName}，命宫在${BRANCHES[chart.mingGongBranch]}）：可结合当前大限与三方四正星曜落宫，优先聚焦官禄与财帛宫四化引动的年份推进核心决策。`;
    }
    const mingPalace = chart.palaces.find(p => p.isMingGong);
    const caiPalace = chart.palaces.find(p => p.name.includes('财帛'));
    const guanPalace = chart.palaces.find(p => p.name.includes('官禄'));
    const fuqiPalace = chart.palaces.find(p => p.name.includes('夫妻'));
    const starList = (p?: typeof mingPalace) =>
      p?.stars.filter(s => s.type === 'major').map(s => `${s.name}${s.siHua ? '化' + s.siHua : ''}`).join('、') ||
      (p?.borrowedStars?.length ? `空宫借${p.borrowedFromName}（${p.borrowedStars.join('、')}）` : '空宫');
    const bodies = [
      `本命${chart.wuxingJuName}，命宫落${BRANCHES[chart.mingGongBranch]}位（${starList(mingPalace)}），身宫在${BRANCHES[chart.shenGongBranch]}位。先天格局以命身联动为轴，宜顺应主星本性发挥所长。`,
      `官禄宫见${starList(guanPalace)}，财帛宫见${starList(caiPalace)}。事业与求财宜先看主星落陷旺度与四化流向，稳步积累胜过盲目跨界。`,
      `夫妻宫见${starList(fuqiPalace)}。亲密关系与日常相处需兼顾对宫与三方照会，沟通宜先明确彼此底线与节奏。`,
      `当前大限依次行经${facts.daYun.slice(0, 3).map(d => `${d.range}${d.palace}`).join('、')}。建议在大限转折与流年四化交叠之年提前做好规划与风险留白。`,
    ];
    return chapters.map((title, index) => ({ title, body: bodies[index] }) satisfies ReportChapter);
  }

  const system = [
    '你撰写简体中文紫微斗数个人命盘详批报告。严格依据引擎提供的本命盘面与大限事实解释传统象义，不自行重排命盘或编造未提供的星曜。',
    '结合倪海厦《天纪》与《紫微斗数全集》传统论断口径，区分本宫主星与空宫借星，把盘面事实与推演建议分开。',
    '不打评分、不制造焦虑、不预测寿命或绝对吉凶，依据不足时坦诚说明。',
    '用户追问时，已生成的报告只提供上下文；报告与盘面冲突时，以本次引擎事实为准。',
    '本命盘面与大限事实：',
    JSON.stringify(facts),
  ].join('\n\n');

  const prompt = question
    ? '基于已生成的报告和命盘，200 至 450 字回答本次追问。报告：\n' + JSON.stringify(order.report) + '\n追问：\n' + question
    : '依顺序写四章，每章 200 至 450 字。第一章定调命身格局与主星特质；第二章析官禄、财帛、迁移三宫事业与求财路径；' +
      '第三章析夫妻宫与六亲缘分及相处课题；第四章结合大限走势给出近年岁运进退提示。' +
      '只输出一个 JSON 数组，恰好四个字符串，分别为以下各章正文：' + chapters.join('、');

  let text = '';
  for await (const chunk of streamChat(
    [{ role: 'system', content: system }, { role: 'user', content: prompt }],
    { signal: AbortSignal.timeout(75_000), requireCompletion: true, temperature: 0.4 },
  )) {
    text += chunk;
    if (text.length > 18_000) throw new Error('Report response too long');
  }
  if (question && text.trim()) return text.trim();
  const parts: unknown = JSON.parse(text.trim().replace(/^\x60{3}(?:json)?\s*|\s*\x60{3}$/gi, ''));
  if (!Array.isArray(parts) || parts.length !== chapters.length ||
      !parts.every(part => typeof part === 'string' && part.trim().length >= 60)) throw new Error('Incomplete report');
  return chapters.map((title, index) => ({ title, body: parts[index].trim() }) satisfies ReportChapter);
}

async function generateReport(order: Order, question?: string) {
  if ((order.product_kind ?? 'compatibility') === 'ziwei') {
    return generateZiweiReport(order, question);
  }
  if (!order.birth_b) throw new CommerceError(400, '缺少合盘乙方出生资料。');
  const chartA = generateChart(order.birth_a);
  const chartB = generateChart(order.birth_b);
  const facts = chartFacts(chartA, chartB);
  if (order.provider === 'local' && process.env.COMMERCE_LOCAL_USE_MODEL !== '1') {
    if (question) return '本地测试答复。可以先各举一个具体例子，确认双方期待，再约定下次怎么处理。';
    const bodies = [
      '甲方命宫在' + BRANCHES[facts.lifeBranches.a] + '，乙方命宫在' + BRANCHES[facts.lifeBranches.b] +
        '，双方地支关系：' + (facts.lifeBranches.relation || '未见同支、六合或六冲') + '。',
      [facts.aToB, facts.bToA].map(({ spouseToLife: s }, i) =>
        (i ? '乙方看甲方：' : '甲方看乙方：') + '夫妻宫与命宫直接对应 ' + (s.directMatches.join('、') || '无') +
        '，借星对应 ' + (s.borrowedMatches.join('、') || '无') + '。').join('\n'),
      [facts.aToB, facts.bToA].map(({ transformations }, i) =>
        (i ? '乙方看甲方：' : '甲方看乙方：') + transformations.map(t =>
          t.star + '化' + t.kind + '落' + (t.targetPalaces.map(p => p.name).join('、') || '未找到')).join('，')).join('\n'),
      '两人各自举出一次意见不同的经历，先复述对方的需求，再约定下次如何沟通。',
    ];
    return reportChapters.map((title, index) => ({ title, body: bodies[index] }));
  }

  const datasetContext = process.env.COMMERCE_HEMING_DATASET === '1' && process.env.ZIWEI_DATASET_DIR
    ? await buildHemingDatasetContext(chartA, chartB)
    : '';
  const system = [
    '你撰写简体中文紫微斗数双人合盘报告。根据引擎提供的本命事实解释传统象义，不重排命盘或推断未提供的流年。',
    '区分甲看乙和乙看甲，区分本宫主星与借星。每个主要结论指出方向、对应的宫位或星曜，以及它能支持什么解读。',
    '把盘面事实和相处推断分开。依据不足时直接说明，不编造引文、不打匹配分、不预测分手、婚期或健康与财务结果。',
    '用户追问时，已生成的报告只提供上下文。报告与盘面冲突时，以本次引擎事实为准。',
    '引擎事实。aToB 是甲看乙，bToA 是乙看甲，宫位列表依次为甲、乙。',
    JSON.stringify(facts),
    datasetContext,
  ].filter(Boolean).join('\n\n');
  const prompt = question
    ? '基于已生成的报告和盘面，200 至 500 字回答本次追问。报告：\n' + JSON.stringify(order.report) + '\n追问：\n' + question
    : '依顺序写四章，每章 200 至 500 字。第一章对照双方命宫与福德宫；第二章分别讲甲看乙、乙看甲的夫妻宫与命宫；' +
      '第三章区分两向四化并写明落宫；第四章给出一项互补、一项可能的摩擦及一条可实践的沟通建议。' +
      '只输出一个 JSON 数组，恰好四个字符串，分别为以下各章正文：' + reportChapters.join('、');
  let text = '';
  for await (const chunk of streamChat([{ role: 'system', content: system }, { role: 'user', content: prompt }],
    { signal: AbortSignal.timeout(75_000), requireCompletion: true, temperature: 0.4 })) {
    text += chunk;
    if (text.length > 18_000) throw new Error('Report response too long');
  }
  if (question && text.trim()) return text.trim();
  const parts: unknown = JSON.parse(text.trim().replace(/^\x60{3}(?:json)?\s*|\s*\x60{3}$/gi, ''));
  if (!Array.isArray(parts) || parts.length !== reportChapters.length ||
      !parts.every(part => typeof part === 'string' && part.trim().length >= 60)) throw new Error('Incomplete report');
  return reportChapters.map((title, index) => ({ title, body: parts[index].trim() }) satisfies ReportChapter);
}

export async function deliverReport(order: Order, question?: string, requestId?: string) {
  if (order.status !== 'paid') throw new CommerceError(409, '付款确认后才能阅读完整报告。');
  if (!question && order.report) return;
  if (question && !order.report) throw new CommerceError(409, '请先生成完整报告。');
  const taskToken = randomUUID();
  const db = commerceDb();
  if (requestId) {
    const duplicate = await db.query(
      'SELECT 1 FROM compatibility_orders WHERE id=$1 AND followups @> $2::jsonb',
      [order.id, JSON.stringify([{ requestId }])],
    );
    if (duplicate.rowCount) return;
  }
  const claimed = await db.query<Order>(`
    UPDATE compatibility_orders SET task_token=$2, task_until=now()+interval '2 minutes', generation_failed=false
    WHERE id=$1 AND status='paid' AND (task_until IS NULL OR task_until<=now())
      AND (($3::boolean AND report IS NOT NULL AND jsonb_array_length(followups)<$4 AND NOT followups @> $5::jsonb)
        OR (NOT $3::boolean AND report IS NULL))
    RETURNING *`, [order.id, taskToken, Boolean(question), reportFollowupLimit, JSON.stringify([{ requestId }])]);
  if (!claimed.rows[0]) throw new CommerceError(409, '已有任务在处理，或本报告的追问次数已用完。请刷新状态。');
  try {
    const output = await generateReport(claimed.rows[0], question);
    const saved = await db.query(question
      ? "UPDATE compatibility_orders SET followups=followups || $3::jsonb, task_token=NULL, task_until=NULL WHERE id=$1 AND task_token=$2 AND status='paid'"
      : "UPDATE compatibility_orders SET report=$3::jsonb, task_token=NULL, task_until=NULL WHERE id=$1 AND task_token=$2 AND status='paid'",
    [order.id, taskToken, JSON.stringify(question ? [{ question, answer: output, requestId }] : output)]);
    if (!saved.rowCount) throw new Error('Report task is no longer active');
  } catch (error) {
    await db.query("UPDATE compatibility_orders SET generation_failed=true, task_token=NULL, task_until=NULL WHERE id=$1 AND task_token=$2",
      [order.id, taskToken]);
    console.warn('[commerce:report]', order.id, error instanceof Error ? error.name : 'UnknownError');
    throw new CommerceError(502, '这次生成未完成。你可以重试，订单和可用追问次数保持有效。');
  }
}
