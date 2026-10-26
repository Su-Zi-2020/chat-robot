# 接口契约（v0 · 尚未实现）

前后端只通过这份契约耦合。改这里之前，先想清楚两边怎么同步。

## POST /api/chat

发一句话，流式拿回回答。

**请求**

```http
POST /api/chat
Content-Type: application/json

{ "sessionId": "s-abc123", "text": "我叫阿泽" }
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `sessionId` | string | 浏览器生成并保存；服务端用它找历史 |
| `text` | string | 用户输入 |

**响应**：`200 text/event-stream`

```
data: {"delta":"你"}

data: {"delta":"好"}

data: {"done":true,"usage":{"input":12,"output":3}}

```

| 帧 | 含义 |
|---|---|
| `{"delta": "..."}` | 增量文本，追加到当前气泡 |
| `{"done": true}` | 本轮结束（携带可选用量统计） |
| `{"error": "..."}` | 出错，前端展示并结束 |

**错误**

| 状态码 | 场景 | 前端处理 |
|---|---|---|
| 400 | `text` 为空 / 超长 | 提示用户 |
| 429 | 限流 | 提示稍后再试 |
| 502 | 上游模型失败 | 显示"服务暂时不可用" |

## 其他（按需再加）

| 接口 | 用途 |
|---|---|
| `GET /api/session/:id/messages` | 刷新页面后恢复历史 |
| `POST /api/session` | 新建会话（返回 sessionId） |
| `GET /api/events` | 服务端主动推送（主动搭话） |
| `DELETE /api/session/:id` | 清空会话 |

## 约定

- **历史只存在服务端**，前端每轮只发 `sessionId + text`；
- key 只在服务端，前端永远拿不到；
- 前端断开（关页面）时，服务端要中断上游请求，用 `AbortSignal`。
