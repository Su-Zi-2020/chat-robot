import { useEffect, useRef, useState } from 'react';
import { loadHistory, streamChat, type Msg } from './api';

const SESSION_KEY = 'companion.sessionId';

function getSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export default function App() {
  const [sessionId] = useState(getSessionId);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 刷新后恢复历史
  useEffect(() => {
    loadHistory(sessionId).then((list) => {
      if (list.length) setMessages(list);
    });
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    setInput('');
    setError(null);
    setBusy(true);
    setMessages((prev) => [...prev, { role: 'user', content: text }, { role: 'assistant', content: '' }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChat({
        sessionId,
        text,
        signal: controller.signal,
        onDelta: (delta) => {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            next[next.length - 1] = { ...last, content: last.content + delta };
            return next;
          });
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('abort') || controller.signal.aborted) {
        setError('已停止');
      } else {
        setError(msg);
        // 把空的助手气泡去掉
        setMessages((prev) => (prev.at(-1)?.content === '' ? prev.slice(0, -1) : prev));
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="app">
      <header>
        <h1>小忆</h1>
        <span className="hint">{busy ? '正在回复…' : 'Enter 发送 · Shift+Enter 换行'}</span>
      </header>

      <main>
        {messages.length === 0 && (
          <p className="empty">说点什么吧。它会记住这个会话里的内容。</p>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.content || (m.role === 'assistant' && busy ? '…' : '')}
          </div>
        ))}
        <div ref={bottomRef} />
      </main>

      {error && <div className="error">{error}</div>}

      <footer>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="说点什么…"
          rows={1}
        />
        {busy ? (
          <button onClick={stop} className="stop">停止</button>
        ) : (
          <button onClick={send} disabled={!input.trim()}>发送</button>
        )}
      </footer>
    </div>
  );
}
