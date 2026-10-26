# 接口规范 · v0.2

> 状态：**已实现并验证**（2026-10-27）。
> Base URL：`http://localhost:3100`（开发时前端经 Vite proxy 以 `/api` 前缀访问）。
> 改接口时，请同步改前端 `web/src` 与本文档。

## 0. 通用约定

**所有接口都是 POST**，请求体一律 `Content-Type: application/json`（没有参数也要发 `{}`）。

**HTTP 状态永远是 200。** 业务结果看响应体里的 `code`：

```json
{ "code": 0, "message": "ok", "data": { ... } }
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `code` | number | `0` 表示成功，非 0 表示失败 |
| `message` | string | 给用户看的提示；成功时为 `"ok"` |
| `data` | object \| null | 成功时的业务数据；失败时不返回 |

**业务码**

| code | 含义 | 触发场景 |
|---|---|---|
| 0 | 成功 | — |
| 1001 | 参数错误 | 缺字段、类型错、空值、超长 |
| 1002 | 请求体不是合法 JSON | 解析失败 |
| 1003 | 请求体过大 | 超过 100KB |
| 1004 | 接口不存在 | 路径没匹配上（含用 GET 调 POST 接口） |
| 5000 | 服务内部错误 | 未捕获异常 |

**前端判定方式固定为：

```js
const data = await res.json();
if (data.code !== 0) throw new Error(data.message);
```

不要判断 `res.ok`——它几乎永远是 true。

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
{ "code": 0, "message": "ok", "data": { "reply": "我收到了：「你好」。…" } }
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
  "message": "ok",
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

预期：全部返回 `200` + JSON；失败时只有 `code` 和 `message`。

## 5. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-10-27 v0.1 | 首版；补类型校验、长度上限、JSON 兜底 |
| 2026-10-27 v0.2 | **改为「全 POST + HTTP 恒 200 + 信封」**；`GET /api/messages` → `POST /api/messages`；引入业务码 |
