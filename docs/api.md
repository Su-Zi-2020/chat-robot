# 接口规范 · v0.3

> 状态：**已实现并验证**（2026-10-27）。
> Base URL：`http://localhost:3100`（开发时前端经 Vite proxy 以 `/api` 前缀访问）。
> 改接口时，请同步改前端 `web/src` 与本文档。

## 0. 通用约定

**所有接口都是 POST**，请求体一律 `Content-Type: application/json`（没有参数也要发 `{}`）。

**成功固定 `200`。失败用真实状态码**（400 / 404 / 413 / 500），不发明 2xx 的子状态。
响应体统一信封：

```json
{ "code": 0, "message": "success", "data": { ... } }
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `code` | number | `0` 表示成功，非 0 表示失败 |
| `message` | string | 给用户看的提示；成功时为 `"success"` |
| `data` | object \| null | 成功时的业务数据；失败时不返回 |

**业务码**

| code | HTTP | 含义 | 触发场景 |
|---|---|---|---|
| 0 | 200 | 成功 | — |
| 1001 | 400 | 参数错误 | 缺字段、类型错、空值、超长 |
| 1002 | 400 | 请求体不是合法 JSON | 解析失败 |
| 1003 | 413 | 请求体过大 | 超过 100KB |
| 1004 | 404 | 接口不存在 | 路径没匹配上（含用 GET 调 POST 接口） |
| 5000 | 500 | 服务内部错误 | 未捕获异常 |

`code` 和 `HTTP` 一一对应，前端**只看 `code` 就够了**；状态码是给日志、网关、监控用的。

**前端判定方式固定为：

```js
const data = await res.json();
if (data.code !== 0) throw new Error(data.message);
```

用 `code` 而不是 `res.ok`，原因是：两者的信息重复，但 `code` 在响应体里，
未来接入网关、降级页时更不容易丢；而连接层失败（后端没起、断网）
`fetch` 会直接 reject，仍然要靠 `try/catch` 兜住。

## 1. POST /api/chat

发一句话，拿回一条回复（当前为假回复，未调用模型）。

**请求**

| 字段 | 类型 | 必填 | 约束 |
|---|---|---|---|
| `text` | string | 是 | 去空白后非空，长度 ≤ 2000 字符 |

```http
POST /api/chat
Content-Type: application/json

{ "text": "你好" }
```

**成功**

```json
{ "code": 0, "message": "success", "data": { "reply": "我收到了：「你好」。…" } }
```

**失败**

| 触发条件 | 响应 |
|---|---|
| 缺 `text` / 类型不是字符串 | `{"code":1001,"message":"text 必须是字符串"}` |
| 去空白后为空 | `{"code":1001,"message":"text 不能为空"}` |
| 超过 2000 字符 | `{"code":1001,"message":"text 过长（上限 2000 字）"}` |
| 请求体不是合法 JSON | `{"code":1002,"message":"请求体不是合法 JSON"}` |

**边界行为（已验证）**

- 任何失败都不会写入历史，不会出现"有问无答"；
- 成功时成对写入 user + assistant 两条；
- 不做类型强转：`{"text":123}` 直接拒绝。

## 2. POST /api/messages

取全部历史（当前不分页、不区分会话）。**用 POST 的理由**：统一方法，不区分读写，少一套体积/风控规则。

```http
POST /api/messages
Content-Type: application/json

{}
```

**成功**

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "messages": [
      { "role": "user", "content": "你好" },
      { "role": "assistant", "content": "我收到了：「你好」…" }
    ]
  }
}
```

当前没有 `id` / `createdAt`，加持久化时会补，属于**向后兼容的新增字段**。

## 3. 规划中（未实现，勿依赖）

| 变更 | 说明 |
|---|---|
| `POST /api/chat` 改 SSE 流式 | 届时信封不再适用，改为 `data: {"delta":…}` 帧 |
| 请求体加 `sessionId` | 多会话隔离 |
| `POST /api/messages` 加分页 | `{ limit, before }` |
| `POST /api/clear` | 清空会话（本期不做） |

## 4. 契约测试（复制即跑）

```bash
BASE=http://localhost:3100
J='content-type: application/json'

curl -s -X POST $BASE/api/chat -H "$J" -d '{"text":"你好"}'
curl -s -X POST $BASE/api/chat -H "$J" -d '{"text":"  "}'
curl -s -X POST $BASE/api/chat -H "$J" -d '{"text":123}'
curl -s -X POST $BASE/api/chat -H "$J" -d '{oops'
curl -s -X POST $BASE/api/messages -H "$J" -d '{}'
curl -s -X POST $BASE/nope -H "$J" -d '{}'
```

预期：

| 请求 | HTTP | code |
|---|---|---|
| 正常 / 取历史 | 200 | 0 |
| 空 text / 非字符串 / 坏 JSON | 400 | 1001 / 1002 |
| 未知接口 | 404 | 1004 |

## 5. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-10-27 v0.1 | 首版；补类型校验、长度上限、JSON 兜底 |
| 2026-10-27 v0.2 | 改为「全 POST + 统一信封」；`GET /api/messages` → `POST /api/messages` |
| 2026-10-27 v0.3 | **成功固定 200，失败用真实状态码**；`code` 与 HTTP 一一对应 |
