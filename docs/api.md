# 接口规范 · v0.1

> 状态：**已实现并验证**（2026-10-27）。
> Base URL：`http://localhost:3100`（开发时前端经 Vite proxy 以 `/api` 前缀访问，不跨域）。
> 改接口时，请同步改前端 `web/src/api` 与本文档。

## 0. 通用约定

**请求**：除 GET 外，一律 `Content-Type: application/json`。

**成功**：`2xx`，响应体为 JSON 对象。

**失败**：`4xx` / `5xx`，响应体**永远是 JSON**，格式固定为：

```json
{ "error": "人类可读的中文提示" }
```

不会返回 HTML 错误页（已通过兜底中间件保证）。

**状态码语义**

| 码 | 含义 | 前端处理 |
|---|---|---|
| 200 | 成功 | 正常渲染 |
| 400 | 请求参数有问题（空、类型错、超长、坏 JSON） | 直接展示 `error` 文案 |
| 404 | 接口不存在 | 说明是前端调错了，展示通用错误 |
| 413 | 请求体过大（>100KB） | 展示通用错误 |
| 500 | 服务内部错误 | 展示"服务异常"，可提供重试 |

**没有实现**（不要依赖）：鉴权、限流、CORS 头、gzip。

## 1. POST /api/chat

发一句话，拿回一条回复（当前为假回复，不调用模型）。

### 请求

| 字段 | 类型 | 必填 | 约束 |
|---|---|---|---|
| `text` | string | 是 | 去空白后非空，长度 ≤ 2000 字符 |

```http
POST /api/chat
Content-Type: application/json

{ "text": "你好" }
```

### 成功 `200`

```json
{ "reply": "我收到了：「你好」。这是一个占位回复，还没有接入真实模型。" }
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `reply` | string | 助手回复的完整文本 |

### 失败 `400`

| 触发条件 | `error` 文案 |
|---|---|
| 缺少 `text` 或类型不是字符串 | `text 必须是字符串` |
| 去空白后为空 | `text 不能为空` |
| 超过 2000 字符 | `text 过长（上限 2000 字）` |
| 请求体不是合法 JSON | `请求体不是合法 JSON` |

### 边界行为（已验证）

- `{"text":"  "}` → 400，不会写入历史；
- `{"text":123}` → 400，**不做类型强转**；
- 校验失败时历史不变（不会出现"有问无答"）；
- 成功时同时写入两条历史（user + assistant），保证成对。

## 2. GET /api/messages

返回全部历史（当前不分页、不区分会话）。

```http
GET /api/messages
```

### 成功 `200`

```json
{
  "messages": [
    { "role": "user", "content": "你好" },
    { "role": "assistant", "content": "我收到了：「你好」…" }
  ]
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `messages` | array | 按时间正序，最新在最后 |
| `messages[].role` | `"user"` \| `"assistant"` | 角色 |
| `messages[].content` | string | 文本内容 |

**注意**：当前没有 `id` 字段。后续加持久化时会补 `id`、`createdAt`，属于**向后兼容的新增字段**。

## 3. 规划中（未实现，勿依赖）

| 变更 | 影响 |
|---|---|
| `POST /api/chat` 改为 SSE 流式 | 响应变为 `text/event-stream`，帧格式 `{"delta"}` / `{"done"}` |
| 增加 `sessionId` | 请求体新增字段，`GET /api/messages` 增加 query 参数 |
| 分页 | `GET /api/messages?limit=&before=` |
| `DELETE /api/messages` | 清空会话（本期不做） |

## 4. 契约测试（复制即跑）

```bash
BASE=http://localhost:3100

# 正常
curl -s -X POST $BASE/api/chat -H 'content-type: application/json' -d '{"text":"你好"}'

# 四类 400
curl -s -X POST $BASE/api/chat -H 'content-type: application/json' -d '{"text":"  "}'
curl -s -X POST $BASE/api/chat -H 'content-type: application/json' -d '{"text":123}'
curl -s -X POST $BASE/api/chat -H 'content-type: application/json' -d '{}'
curl -s -X POST $BASE/api/chat -H 'content-type: application/json' -d '{oops'

# 404
curl -s $BASE/api/chat
curl -s $BASE/api/nope

# 历史
curl -s $BASE/api/messages
```

预期：所有响应均为 JSON；错误响应只含一个 `error` 字段。

## 5. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-10-27 | 首版规范；补齐类型校验、长度上限、JSON 404、JSON 错误兜底 |
