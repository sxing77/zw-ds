/**
 * POST /api/interpret —— 单盘 AI 解读（流式）
 *
 * 请求：{ chart: ZiweiChart, messages: [{ role, content }], topic?: string }
 * 响应：SSE，data: {"delta":{"text":"..."}} … data: [DONE]
 *
 * 两条路径：
 *   · 数据集命中 —— 把已核对的断语作为事实底座塞进 prompt，模型只做重述与追问
 *   · 未命中（未配数据集 / 生日超出范围 / 做过真太阳时校正）—— 走纯引擎 + prompt
 *
 * 与前端契约见 components/InsightPanel.tsx 的 streamResponse / components/ChatPanel.tsx。
 */

import type { NextRequest } from 'next/server';
import { buildInterpretSystemPrompt, type DatasetBase } from '@/lib/ai/prompts';
import { chartKey, guessDimension, lookupChart, pickDimension } from '@/lib/ai/dataset';
import { AiConfigError, AiUpstreamError, streamChat, type ChatMessage } from '@/lib/ai/provider';
import { sseResponse, sseText } from '@/lib/ai/sse';
import { isZiweiChart } from '@/lib/ai/validate';
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit';
import type { ZiweiChart } from '@/lib/ziwei/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MESSAGES = 24;
const MAX_CONTENT_CHARS = 8000;

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

/** 只保留模型需要的字段，顺便挡住超长注入 */
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

/**
 * 尝试取断语底座。任何一步失败都返回 null，绝不影响解读本身。
 */
async function resolveBase(
  chart: ZiweiChart,
  topic: string | undefined,
  messages: ChatMessage[],
): Promise<DatasetBase | null> {
  try {
    const key = chartKey(chart);
    if (!key) return null; // 做过真太阳时校正，键对不上数据集

    const rec = await lookupChart(key);
    if (!rec) return null;

    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    const wanted = topic?.trim() || guessDimension(lastUser?.content ?? '');
    const picked = pickDimension(rec, wanted);
    if (!picked) return null;

    return { dim: picked.dim, text: picked.text, k: key };
  } catch (err) {
    console.warn('[interpret] 数据集查表失败，降级为纯引擎解读：', err);
    return null;
  }
}

function friendlyError(err: unknown): string {
  if (err instanceof AiConfigError) {
    if (process.env.NODE_ENV === 'development') console.warn(err.message);
    return '命盘详解暂未开放，你仍可查看命盘。';
  }
  if (err instanceof AiUpstreamError && process.env.NODE_ENV === 'development') {
    console.warn('解读服务返回异常', err.status);
  }
  return '\n\n解读中断，请稍后重试。';
}

export async function POST(req: NextRequest): Promise<Response> {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && process.env.INTERPRET_PREVIEW_ENABLED !== '1') {
    return sseText('命盘详解暂未开放，你仍可查看命盘。');
  }

  // 同源校验：防第三方网站直接套壳刷接口
  const origin = req.headers.get('origin');
  if (origin && origin !== req.nextUrl.origin) {
    return Response.json({ error: '请求来源无效' }, { status: 403 });
  }

  // 按 IP 限流（每 10 分钟最多 15 次），防止脚本刷爆模型账单
  const ip = getClientIp(req);
  const rate = checkRateLimit('interpret', ip, 15, 10 * 60_000);
  if (!rate.allowed) {
    return Response.json(
      { error: `请求过于频繁，请 ${rate.retryAfterSec} 秒后再试。` },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    );
  }

  let body: { chart?: unknown; messages?: unknown; topic?: unknown; preview?: unknown };
  try {
    body = await req.json();
  } catch {
    return badRequest('请求体不是合法 JSON');
  }

  if (!isZiweiChart(body.chart)) {
    return badRequest('缺少合法的 chart（需包含 birthInfo、palaces[12]、daXians）');
  }

  // 生产环境强制走试读模式，不信任客户端传 preview: false 绕过付费
  const isPreview = isProd ? true : body.preview !== false;
  const rawMessages = sanitizeMessages(body.messages);
  const messages = isPreview ? rawMessages.slice(-1) : rawMessages;
  if (!messages.length) {
    return badRequest('messages 为空');
  }

  if (!process.env.AI_PROVIDER && !process.env.AI_API_KEY && !process.env.DEEPSEEK_API_KEY && !process.env.GEMINI_API_KEY) {
    // 早失败：别等到拼完 prompt 才发现没 key
    return sseText('命盘详解暂未开放，你仍可查看命盘。');
  }

  const rawTopic = typeof body.topic === 'string' ? body.topic : undefined;
  const topic = isPreview && rawTopic && rawTopic !== 'overview' ? 'overview' : rawTopic;
  const base = await resolveBase(body.chart, topic, messages);

  const previewRule = isPreview
    ? '\n\n【试读模式限制】本次仅作免费试读：严格只输出前两节（**【命格定性】**与**【主星解读】**，或点选宫位/四化时的前两节），每节 2–3 句话、总计不超过 220 字；绝对不要输出三方四正、当前大限、优势与注意或后续建议。'
    : '';
  const systemPrompt = buildInterpretSystemPrompt(body.chart, base) + previewRule;
  const payload: ChatMessage[] = [{ role: 'system', content: systemPrompt }, ...messages];

  return sseResponse(
    streamChat(payload, { signal: req.signal }),
    friendlyError,
  );
}
