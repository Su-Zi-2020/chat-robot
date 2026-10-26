# 接口说明（最简版）

## POST /api/chat

```http
POST /api/chat
Content-Type: application/json

{ "text": "你好" }
```

成功：

```json
{ "reply": "我收到了：「你好」。这是一个占位回复，还没有接入真实模型。" }
```

失败：

| 状态码 | 响应 | 场景 |
|---|---|---|
| 400 | `{ "error": "text 不能为空" }` | 空输入 |
| 400 | `{ "error": "请求体不是合法 JSON" }` | 格式错误 |

## GET /api/messages

```json
{ "messages": [
  { "role": "user", "content": "你好" },
  { "role": "assistant", "content": "我收到了：「你好」……" }
] }
```

## 将来要改成什么

接真实模型时，这里会变成 SSE 流式：

```
data: {"delta":"你"}

data: {"done":true}
```

完整版分支（`git checkout main`）里已经有这份实现。
