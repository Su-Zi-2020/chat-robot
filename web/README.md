# web（待实现）

前端目录，目前留空。计划：

- Vite + React + TypeScript
- 一个聊天页：消息列表 + 输入框 + 停止按钮
- 用 `fetch` + `ReadableStream` 读 SSE（不用 EventSource，因为要 POST）

接口见 [`../docs/api.md`](../docs/api.md)。

开发时的代理：

```js
// vite.config.ts
server: { proxy: { '/api': 'http://localhost:8787' } }
```
