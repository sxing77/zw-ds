import type { NextRequest } from 'next/server';
import { buildHemingSystemPrompt } from '@/lib/ai/prompts';
import { buildHemingDatasetContext } from '@/lib/ai/heming-dataset';
import { AiConfigError, resolveProvider, streamChat, type ChatMessage } from '@/lib/ai/provider';
import { sseResponse } from '@/lib/ai/sse';
import { readChartBirth } from '@/lib/ai/validate';
import { generateChart } from '@/lib/ziwei/algorithm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const initialQuestion = '请按默认结构对这两张命盘做完整的合盘分析。';

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readBirth(value: unknown) {
  return record(value)?.unknownTime === true ? null : readChartBirth(value);
}

export async function POST(req: NextRequest): Promise<Response> {
  if (process.env.NODE_ENV === 'production') {
    return Response.json({ error: '请从完整合盘报告入口生成详解。' }, { status: 403 });
  }
  let body;
  try {
    body = record(await req.json());
  } catch {
    return Response.json({ error: '请求体不是合法 JSON。' }, { status: 400 });
  }

  // 兼容原有的 chartA / chartB 请求，但双方宫位都以服务端重新排盘为准。
  const birthA = readBirth(body?.birthA ?? record(body?.chartA)?.birthInfo);
  const birthB = readBirth(body?.birthB ?? record(body?.chartB)?.birthInfo);
  if (!birthA || !birthB) {
    return Response.json({ error: '请提供双方有效的公历生日和已知时辰。' }, { status: 400 });
  }
  if (body?.question !== undefined && (typeof body.question !== 'string' || body.question.length > 2000)) {
    return Response.json({ error: '追问须为 2000 字以内的文本。' }, { status: 400 });
  }

  let systemPrompt;
  try {
    const chartA = generateChart(birthA);
    const chartB = generateChart(birthB);
    systemPrompt = buildHemingSystemPrompt(chartA, chartB, await buildHemingDatasetContext(chartA, chartB));
  } catch {
    return Response.json({ error: '无法根据双方出生资料排盘，请核对日期和时辰。' }, { status: 422 });
  }

  try {
    resolveProvider();
  } catch (error) {
    if (!(error instanceof AiConfigError)) throw error;
    return Response.json({ error: '合盘详解暂未开放，你仍可查看双盘和免费合盘结果。' }, { status: 503 });
  }

  const payload: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
  ];
  const question = body?.question?.trim();
  const previous = record(body?.previous);
  if (question && typeof previous?.answer === 'string' && previous.answer.trim()) {
    const previousQuestion = typeof previous.question === 'string' ? previous.question.trim().slice(0, 2000) : '';
    payload.push({ role: 'user', content: previousQuestion || initialQuestion });
    payload.push({ role: 'assistant', content: previous.answer.slice(0, 8000) });
  }
  payload.push({ role: 'user', content: question || initialQuestion });
  const cancelled = new AbortController();
  const timeout = AbortSignal.timeout(90_000);
  const signal = AbortSignal.any([req.signal, cancelled.signal, timeout]);

  return sseResponse(
    streamChat(payload, { signal, requireCompletion: true }),
    () => timeout.aborted ? '合盘分析超时，请重试。' : '合盘详解未生成完成，请重试。',
    { errorEvent: true, onCancel: () => cancelled.abort() },
  );
}
