/**
 * lib/ai/provider —— OpenAI 兼容协议的模型接入层
 *
 * 只做三件事：解析配置、发起流式请求、把 SSE 增量吐成字符串。
 * 不绑定任何一家 SDK，所以 deepseek / gemini / openai / 自建网关都能用。
 *
 * 配置优先级（后者覆盖前者）：
 *   1. 内置预设（DEFAULTS）
 *   2. <PROVIDER>_BASE_URL / <PROVIDER>_MODEL
 *   3. AI_BASE_URL / AI_MODEL / AI_API_KEY（通用覆盖，接自建网关用）
 */

import 'server-only';
import { readSseData } from './read-sse';

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ProviderConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** 配置不全（没 key / 没 base url）时抛这个，route 层据此回 500 + 可读提示 */
export class AiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiConfigError';
  }
}

/** 上游返回非 2xx 时抛这个 */
export class AiUpstreamError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'AiUpstreamError';
    this.status = status;
  }
}

const DEFAULTS: Record<string, { baseUrl: string; model: string; keyEnv: string }> = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    keyEnv: 'DEEPSEEK_API_KEY',
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.0-flash',
    keyEnv: 'GEMINI_API_KEY',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    keyEnv: 'OPENAI_API_KEY',
  },
  // 自建 / 中转：必须自行提供 base url 与 model
  custom: { baseUrl: '', model: '', keyEnv: 'AI_API_KEY' },
};

function env(key: string): string {
  return (process.env[key] ?? '').trim();
}

export function resolveProvider(): ProviderConfig {
  const provider = (env('AI_PROVIDER') || 'deepseek').toLowerCase();
  const preset = DEFAULTS[provider] ?? DEFAULTS.custom;
  const upper = provider.toUpperCase();

  const baseUrl = env('AI_BASE_URL') || env(`${upper}_BASE_URL`) || preset.baseUrl;
  const model = env('AI_MODEL') || env(`${upper}_MODEL`) || preset.model;
  const apiKey = env('AI_API_KEY') || env(preset.keyEnv) || env(`${upper}_API_KEY`);

  if (!apiKey) {
    throw new AiConfigError(
      `未配置模型密钥：请在 .env.local 里设置 ${preset.keyEnv}（当前 AI_PROVIDER=${provider}）`,
    );
  }
  if (!baseUrl) {
    throw new AiConfigError(
      `未配置接口地址：AI_PROVIDER=${provider} 需要同时设置 ${upper}_BASE_URL 或 AI_BASE_URL`,
    );
  }
  if (!model) {
    throw new AiConfigError(
      `未配置模型名：AI_PROVIDER=${provider} 需要同时设置 ${upper}_MODEL 或 AI_MODEL`,
    );
  }

  return { provider, baseUrl: baseUrl.replace(/\/+$/, ''), apiKey, model };
}

/**
 * 发起流式对话，逐段 yield 文本增量。
 *
 * 解析的是上游的 OpenAI 风格 SSE：
 *   data: {"choices":[{"delta":{"content":"..."}}]}
 *   data: [DONE]
 */
export async function* streamChat(
  messages: ChatMessage[],
  options: { temperature?: number; signal?: AbortSignal; requireCompletion?: boolean } = {},
): AsyncGenerator<string> {
  const cfg = resolveProvider();

  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      stream: true,
      temperature: options.temperature ?? 0.7,
    }),
    signal: options.signal,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new AiUpstreamError(
      res.status,
      `上游模型返回 ${res.status}${detail ? `：${detail.slice(0, 300)}` : ''}`,
    );
  }
  if (!res.body) throw new AiUpstreamError(502, '上游模型未返回响应体');

  let finished = false;
  for await (const payload of readSseData(res.body)) {
    if (payload.trim() === '[DONE]') return;
    let event;
    try { event = JSON.parse(payload); } catch {
      if (options.requireCompletion) throw new AiUpstreamError(502, '上游模型流格式错误');
      continue;
    }
    if (options.requireCompletion && event?.error) throw new AiUpstreamError(502, '上游模型返回流式错误');
    const choice = event?.choices?.[0];
    const text = choice?.delta?.content;
    if (typeof text === 'string' && text) yield text;
    if (choice?.finish_reason === 'stop') finished = true;
    else if (options.requireCompletion && choice?.finish_reason) {
      throw new AiUpstreamError(502, '上游模型未能完成解读');
    }
  }
  if (options.requireCompletion && !finished) {
    throw new AiUpstreamError(502, '上游模型流提前关闭');
  }
}
