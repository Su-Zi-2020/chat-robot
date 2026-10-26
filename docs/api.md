# 接口说明（最简版）

端口 **3100**。开发时前端通过 Vite proxy 访问 `/api`，不跨域。

## POST /api/chat

```http
POST /api/chat
Content-Type: application/json

{ "text": "你好" }
```

成功 `200`：

```json
{ "reply": "我收到了：「你好」。这是一个占位回复，还没有接入真实模型。" }
```

失败 `400`：

```json
{ "error": "text 不能为空" }
```

## GET /api/messages

```json
{
  "messages": [
    { "role": "user", "content": "你好" },
    { "role": "assistant", "content": "我收到了：「你好」…" }
  ]
}
```

## 将来接真实模型

会把 `POST /api/chat` 改成 **SSE 流式**：

```
data: {"delta":"你"}

data: {"delta":"好"}

data: {"done":true}
```

完整实现见 `main` 分支。
