/**
 * lib/ai/sse —— 把文本增量包成前端要的 SSE 格式
 *
 * 前端（InsightPanel / ChatPanel / heming）解析的就是这一种：
 *   data: {"delta":{"text":"..."}}
 *   data: [DONE]
 *
 * 流开始后的错误默认沿用文本帧。支持识别错误事件的调用方可请求独立的 error 帧。
 */

import 'server-only';

export const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

function frame(text: string): string {
  return `data: ${JSON.stringify({ delta: { text } })}\n\n`;
}

const DONE = 'data: [DONE]\n\n';

/** 把异步字符串流包成 SSE Response */
export function sseResponse(
  source: AsyncGenerator<string>,
  onError?: (e: unknown) => string,
  options?: { errorEvent?: boolean; onCancel?: () => void },
): Response {
  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const text of source) {
          if (cancelled) return;
          if (text) controller.enqueue(encoder.encode(frame(text)));
        }
      } catch (err) {
        if (cancelled) return;
        const msg = onError
          ? onError(err)
          : `\n\n> 解读中断：${err instanceof Error ? err.message : '未知错误'}`;
        const event = options?.errorEvent ? 'data: ' + JSON.stringify({ error: msg }) + '\n\n' : frame(msg);
        controller.enqueue(encoder.encode(event));
      } finally {
        if (!cancelled) {
          controller.enqueue(encoder.encode(DONE));
          controller.close();
        }
      }
    },
    cancel() {
      cancelled = true;
      options?.onCancel?.();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

/** 直接把一段固定文本当作流返回（用于配置缺失等可读错误） */
export function sseText(text: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(frame(text)));
      controller.enqueue(encoder.encode(DONE));
      controller.close();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}
