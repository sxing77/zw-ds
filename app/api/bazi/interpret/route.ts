import type { NextRequest } from 'next/server';
import { AiConfigError, resolveProvider, streamChat, type ChatMessage } from '@/lib/ai/provider';
import { sseResponse } from '@/lib/ai/sse';
import { readChartBirth } from '@/lib/ai/validate';
import { generateBaziChart } from '@/lib/bazi/engine';
import type { BaziChart } from '@/lib/bazi/types';
import { SHICHEN } from '@/lib/ziwei/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MESSAGES = 24;
const MAX_CONTENT_CHARS = 8000;

function sanitizeMessages(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((m): m is { role: string; content: string } =>
      Boolean(m && typeof m === 'object' && typeof (m as { content?: unknown }).content === 'string'),
    )
    .map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content.slice(0, MAX_CONTENT_CHARS),
    }))
    .slice(-MAX_MESSAGES) as ChatMessage[];
}

function buildBaziSystemPrompt(chart: BaziChart, unknownTime: boolean): string {
  const b = chart.birthInfo;
  const genderLabel = b.gender === 'male' ? '乾造（男命）' : '坤造（女命）';
  const shichenName = SHICHEN[b.hour]?.name ?? `${b.hour * 2}:00`;
  if (unknownTime) {
    const pillars = chart.pillars.slice(0, 3).map(p => `${p.label} ${p.ganZhi}`).join('、');
    return `你在解读一份出生时辰不详的八字参考盘。以下三柱按暂用时刻计算，若出生接近节气或换日边界，年月日柱仍需复核。
${genderLabel}。参考盘的年、月、日三柱为 ${pillars}。
仅讨论这三柱提示的传统象义和局限。时柱不可确定，不据此判断完整格局、旺衰、用神、大运起运或具体年份应事。不作健康、财务或重大人生预测。`;
  }

  const pillarLines = chart.pillars
    .map(
      p =>
        `- **${p.label}：${p.ganZhi}**（天干：${p.stem}[${p.stemWuXing}·${p.tenGodStem}] / 地支：${p.branch}[${p.branchWuXing}]，藏干：${p.hiddenStems.map(h => `${h.stem}(${h.tenGod}·${h.weight})`).join('、')}，纳音：${p.naYin}，十二长生：${p.diShi}，空亡：${p.xunKong}${p.shenSha.length ? `，神煞：${p.shenSha.join('、')}` : ''}）`,
    )
    .join('\n');

  const relationLines = chart.relations.length
    ? chart.relations.map(r => `- [${r.type}] ${r.description}`).join('\n')
    : '- 原局四柱无明显刑冲合会';

  const daYunLines = chart.daYuns
    .map(
      (d, idx) =>
        `- ${d.startAge}–${d.endAge}岁（${d.startYear}–${d.endYear}）：**${d.ganZhi}**（天干${d.tenGodStem} / 地支${d.tenGodBranch}，${d.naYin}）${idx === chart.currentDaYunIndex ? ' ←【当前所行大运】' : ''}`,
    )
    .join('\n');

  const wx = chart.wuxing;
  const refs = chart.classicalRefs;

  const patternLines = chart.patterns?.length
    ? chart.patterns.map(p => `- [${p.level}] **${p.name}**（${p.pillars.join('·')}）：${p.summary}${p.classicQuote ? ` ${p.classicQuote}` : ''}`).join('\n')
    : '- 原局十神组合平和，按常规月令格局论';

  const liunianLines = chart.upcomingYears?.length
    ? chart.upcomingYears
        .filter(y => y.importance !== '平' || y.year <= new Date().getFullYear() + 2)
        .map(y => `- ${y.year} ${y.ganZhi}年（${y.tenGodStem}，大运${y.daYunGanZhi}）${y.tags.length ? `【${y.tags.join('、')}】` : ''}：${y.hint}`)
        .join('\n')
    : '';

  return `你是一位精通《滴天髓》《穷通宝鉴》《三命通会》《子平真诠》的子平八字命理宗师。
请严格根据下方由历法引擎精确排出的【四柱八字命盘】与【古籍原典直断依据】为用户批命或解答追问。

## 一、 命盘硬性事实（绝对禁止篡改或自行重排）
- **命造**：${genderLabel} · 公历 ${b.year}年${b.month}月${b.day}日 ${shichenName}（${chart.lunarDateText}）
- **胎元 / 命宫 / 身宫**：胎元 ${chart.taiYuan} · 命宫 ${chart.mingGong} · 身宫 ${chart.shenGong}
- **四柱八字**：
${pillarLines}

- **五行力量与旺衰判定**：
  - 日主：**${chart.pillars[2].stem}${wx.dayMasterElement}**（${wx.dayMasterYinYang}${wx.dayMasterElement}）
  - 五行占比：木 ${wx.percentages['木']}% · 火 ${wx.percentages['火']}% · 土 ${wx.percentages['土']}% · 金 ${wx.percentages['金']}% · 水 ${wx.percentages['水']}%
  - 同党（印比）${wx.samePartyScore}% vs 异党（财官食伤）${wx.otherPartyScore}% → 综合判定：**${wx.strength}**
  - 月令主格局：**${wx.geJuName}**
  - 扶抑喜用五行：**${wx.favorableElements.join('、')}**（忌神参考：${wx.unfavorableElements.join('、')}）
  - 《穷通宝鉴》调候用神：**${wx.tiaoHouYongShen.join('、')}**

- **原局干支刑冲合会**：
${relationLines}

- **大运排盘**：
${daYunLines}

- **原局十神组合与格局成败铁律（引擎已精算）**：
${patternLines}

- **近十年流年应期与冲合节点（引擎已精算）**：
${liunianLines || '暂无特殊岁运冲合标记'}

## 二、 命盘精准命中的古籍原典依据（必须融合引证）
1. **${refs.ditiansui.title}**：
   - 原文：「${refs.ditiansui.verse}」
   - 要旨：${refs.ditiansui.explanation}
2. **${refs.qiongtong.title}**：
   - 调候用神：${refs.qiongtong.tiaoHou.join('、')}
   - 断语：${refs.qiongtong.summary}
3. **《三命通会》论${refs.sanmingRizhu.ganZhi}日柱（${refs.sanmingRizhu.naYin}·${refs.sanmingRizhu.grade}）**：
   - 断语：${refs.sanmingRizhu.summary}
   - 时柱参考：${refs.sanmingRizhu.timingHint ?? ''}
4. **《子平真诠》论${refs.zipingGeju.name}**：
   - 断语：${refs.zipingGeju.summary}

## 三、 批命铁律与输出规范
1. **严守排盘事实**：以上列出的天干、地支、藏干、十神、神煞和大运以本次引擎结果为准，不自行重排或补写未提供的配置。
2. **有据可依**：回答当前问题，选取最相关的盘面或古籍依据。区分盘面事实与传统象义，不编造引文，不把不同流派的用神判断混为一谈。
3. **措辞克制**：把流年提示作为有条件的传统解读。不作健康诊断、财务指导或必然应事的判断。
4. **格式规范**：使用分段清晰的 Markdown，小标题使用 \`**【标题】**\` 独占一行，首段直接切入核心命局结论，无需客套寒暄。`;
}

export async function POST(req: NextRequest): Promise<Response> {
  if (process.env.NODE_ENV === 'production') return Response.json({ error: '八字详解暂未开放，你仍可查看命盘。' }, { status: 403 });
  let body: { birth?: unknown; chart?: { birthInfo?: unknown }; unknownTime?: unknown; messages?: unknown } | null;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: '请求体不是合法 JSON' }, { status: 400 });
  }

  const birth = readChartBirth(body?.birth ?? body?.chart?.birthInfo);
  if (!birth) return Response.json({ error: '请提供有效的出生资料。' }, { status: 400 });

  const messages = sanitizeMessages(body?.messages);
  if (!messages.length) {
    return Response.json({ error: 'messages 为空' }, { status: 400 });
  }

  try {
    resolveProvider();
  } catch (err) {
    if (!(err instanceof AiConfigError)) throw err;
    return Response.json({ error: '八字详解暂未开放，你仍可查看命盘。' }, { status: 503 });
  }

  let systemPrompt;
  try {
    systemPrompt = buildBaziSystemPrompt(generateBaziChart(birth), body?.unknownTime === true);
  } catch {
    return Response.json({ error: '无法根据出生资料生成八字命盘。' }, { status: 422 });
  }
  const payload: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];
  const cancelled = new AbortController();
  const timeout = AbortSignal.timeout(90_000);
  const signal = AbortSignal.any([req.signal, cancelled.signal, timeout]);
  return sseResponse(
    streamChat(payload, { signal, requireCompletion: true, temperature: 0.4 }),
    () => timeout.aborted ? '八字详解生成超时，请重试。' : '八字详解未生成完成，请重试。',
    { errorEvent: true, onCancel: () => cancelled.abort() },
  );
}
