# 接口规范 · v0.3

> 状态：**已实现并验证**（2026-10-27）。
> Base URL：`http://localhost:3100`（开发时前端经 Vite proxy 以 `/api` 前缀访问）。
> 改接口时，请同步改前端 `web/src` 与本文档。

## 0. 通用约定

**所有接口都是 POST**，请求体一律 `Content-Type: application/json`（没有参数也要发 `{}`）。

**例外**：`POST /api/chat` 的**响应**是 `text/event-stream`（流式），但**请求**仍是 JSON。
流开始后的数据不走信封，格式见第 1 节。

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
| 1005 | 401 | 未登录 / 登录过期 | 缺少或过期的 session cookie |
| 5000 | 500 | 服务内部错误 | 未捕获异常 |

`code` 和 `HTTP` 一一对应，前端**只看 `code` 就够了**；状态码是给日志、网关、监控用的。

**登录要求**：`POST /api/chat`、`POST /api/messages` 需要登录态（cookie `sid`）。
未登录返回 `401` + `{"code":1005,"message":"请先用 GitHub 登录"}`；前端据此显示登录入口。

**前端判定方式固定为：

```js
const data = await res.json();
if (data.code !== 0) throw new Error(data.message);
```

用 `code` 而不是 `res.ok`，原因是：两者的信息重复，但 `code` 在响应体里，
未来接入网关、降级页时更不容易丢；而连接层失败（后端没起、断网）
`fetch` 会直接 reject，仍然要靠 `try/catch` 兜住。

## 1. POST /api/chat（流式）

发一句话，**以 SSE 流式返回**（已接入 DeepSeek，OpenAI 兼容协议）。

服务端会带上最近 20 条历史一起发给模型，所以支持多轮。

**请求**

| 字段 | 类型 | 必填 | 约束 |
|---|---|---|---|
| `text` | string | 是 | 去空白后非空，长度 ≤ 2000 字符 |

```http
POST /api/chat
Content-Type: application/json
Accept: text/event-stream

{ "text": "你好" }
```

**成功响应**：`200`，`Content-Type: text/event-stream`

```
data: {"type":"start"}

data: {"delta":"收到"}

data: {"delta":"你的"}

data: {"type":"done"}

```

| 帧 | 含义 | 前端动作 |
|---|---|---|
| `{"type":"start"}` | 流开始 | 可放空气泡 |
| `{"delta":"…"}` | 增量文本 | 追加到当前气泡 |
| `{"type":"done"}` | 结束 | 停止光标动画 |
| `{"type":"error","message":"…"}` | 生成中途失败 | 显示错误，停止光标 |

**注意**：流一旦开始，**不能再返回信封**。所以：

- 建连前失败 → JSON 信封（见下表）；
- 已开始推送后失败 → 发一帧 `{"type":"error"}`，然后关闭。

**失败（流开始前）**：仍是 JSON 信封，非 200。

| 触发条件 | HTTP | code |
|---|---|---|
| 缺 `text` / 类型不是字符串 | 400 | 1001 |
| 去空白后为空 | 400 | 1001 |
| 超过 2000 字符 | 400 | 1001 |
| 请求体不是合法 JSON | 400 | 1002 |
| 没配置 API key | 500 | 2001 |
| 模型连不上 / 返回错误 | 502 | 2001 |

**落库时机**：只有 `done` 之后才把 user + assistant 成对写入历史；客户端中途断开则不写。

**客户端断开**：服务端通过 `res.on('close')` 感知，立刻停止推送。

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

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | number | 自增主键，前端可用来去重 |
| `role` | string | `user` / `assistant` |
| `content` | string | 消息正文 |
| `createdAt` | number | 毫秒时间戳 |

数据存在 SQLite（`server/data/agent.db`），重启不丢。

## 3. 公开配置

前端用它渲染输入上限等，**不需要登录**。

```http
POST /api/config
Content-Type: application/json

{}
```

```json
{ "code": 0, "message": "success", "data": { "maxInputChars": 2000 } }
```

`maxInputChars` 来自 `server/src/config/context.js`，前后端不再各写一份常量。

## 4. 角色卡（单例）

```http
POST /api/persona
Content-Type: application/json

{}
```

```json
{
  "code": 0, "message": "success",
  "data": {
    "persona": {
      "name": "小忆",
      "avatar": "🌙",
      "prompt": "你是「小忆」，22 岁插画师……",
      "examples": [["今天好累", "嗯，那别硬撑了。先去躺着。"]],
      "tailPrompt": "保持小忆的语气：简短、口语、直接。不要自称 AI。"
    }
  }
}
```

修改（需登录）：

```http
POST /api/persona/save
{ "name": "小忆", "prompt": "……", "examples": [["用户说","她说"]], "tailPrompt": "……" }
```

限制：`name` ≤20 字、`prompt` ≤1000 字、`tailPrompt` ≤120 字、`examples` ≤5 组且每组 ≤100 字。

### 清空历史

```http
POST /api/messages/clear
```

删除当前用户的**全部消息 + 摘要**（不可恢复），返回删除条数：

```json
{ "code": 0, "message": "success", "data": { "removed": 10 } }
```

## 5. 登录接口

| 接口 | 说明 | 成功 |
|---|---|---|
| `GET /api/auth/github` | 302 跳到 GitHub 授权页 | 302 |
| `GET /api/auth/github/callback` | GitHub 回调：换 token、建号、发 session | 302 回首页 |
| `GET /api/auth/me` | 当前登录用户 | `200 { code:0, data:{ user } }`，未登录时 `user: null` |
| `POST /api/auth/logout` | 删当前 session | `200 { code:0 }` |

**登录态**：cookie `sid=<token>`（HttpOnly、SameSite=Lax、30 天）。
服务端用它与 `sessions` 表比对，过期或不存在都视为未登录。

**失败**：

| 触发条件 | HTTP | code |
|---|---|---|
| state 校验失败 | 400 | 1001 |
| 缺少 code | 400 | 1001 |
| 换 token / 拉用户失败 | 502 | 2001 |
| 服务端没配 GitHub OAuth | 500 | 5000 |

## 6. 规划中（未实现，勿依赖）

| 变更 | 说明 |
|---|---|
| `POST /api/chat` 改 SSE 流式 | 届时信封不再适用，改为 `data: {"delta":…}` 帧 |
| 请求体加 `sessionId` | 多会话隔离 |
| `POST /api/messages` 加分页 | `{ limit, before }` |
| `POST /api/clear` | 清空会话（本期不做） |

## 7. 契约测试（复制即跑）

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

## 8. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-10-27 v0.1 | 首版；补类型校验、长度上限、JSON 兜底 |
| 2026-10-27 v0.2 | 改为「全 POST + 统一信封」；`GET /api/messages` → `POST /api/messages` |
| 2026-10-27 v0.3 | 成功固定 200，失败用真实状态码；`code` 与 HTTP 一一对应 |
| 2026-10-27 v0.4 | `/api/chat` 改为 SSE 流式（mock 数据）；流开始后不再返回信封 |
| 2026-10-27 v0.5 | 接入 DeepSeek 真实模型；新增 `UPSTREAM=2001`、`error` 帧；支持多轮历史 |
| 2026-10-27 v0.6 | **强制 GitHub 登录**：chat/messages 需登录态，新增 `UNAUTHORIZED=1005` |
