export type Msg = { role: 'user' | 'assistant'; content: string };

/** 拉取历史（刷新页面时用） */
export async function loadHistory(sessionId: string): Promise<Msg[]> {
  const res = await fetch(`/api/session/${encodeURIComponent(sessionId)}/messages`);
  if (!res.ok) return [];
  const data = await res.json();
  const list: Msg[] = (data.messages ?? [])
    .filter((m: { role: string }) => m.role === 'user' || m.role === 'assistant')
    .map((m: Msg) => ({ role: m.role, content: m.content }));
  return list;
}

/**
 * 发一句话并流式接收。
 * 服务端每帧是 `data: {"delta":"..."}` / `{"done":true}` / `{"error":"..."}`
 */
export async function streamChat(opts: {
  sessionId: string;
  text: string;
  signal?: AbortSignal;
  onDelta: (delta: string) => void;
}): Promise<void> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: opts.sessionId, text: opts.text }),
    signal: opts.signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}) as { error?: string });
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  if (!res.body) throw new Error('响应没有 body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;

      const payload = line.slice(5).trim();
      if (!payload) continue;

      const frame = JSON.parse(payload) as { delta?: string; done?: boolean; error?: string };
      if (frame.error) throw new Error(frame.error);
      if (frame.delta) opts.onDelta(frame.delta);
      if (frame.done) return;
    }
  }
}
