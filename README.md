# 对话 demo（Vue + Express + DeepSeek）

**流式对话，已接入 DeepSeek。** 前后端分离，两个项目：

- `web/`  Vue 3 + Vite，开发端口 5173
- `server/`  Express，端口 3100

你发一句话，模型逐字回给你，历史保留在内存里（多轮有效）。

## 配置 API key

后端从两处读 key，**环境变量优先**：

```bash
# 方式一：环境变量（推荐，部署时用）
export DEEPSEEK_API_KEY=sk-xxxx
```

```js
// 方式二：本地文件 server/config/config.js（已被 .gitignore 忽略）
export const config = {
  apiKey: 'sk-xxxx',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
};
```

两个都没有时，接口返回 `code: 2001` 并提示去配置，不会静默失败。

## 数据库

SQLite，零配置，文件在 `server/data/agent.db`（已 gitignore）。

```bash
cd server
npm run db:init     # 首次运行：建表（可重复执行）
npm start
```

| 命令 | 作用 |
|---|---|
| `npm run db:init` | 建表 / 补列（可重复执行） |
| `npm run db:tables` | 终端里看表名、行数、最近 5 条消息 |
| `npm run db:reset` | 删库重建（清空所有历史和用户） |

也可以用 VS Code 插件 **SQLite Viewer**（`qwtel.sqlite-viewer`）直接点开 `server/data/agent.db`。
注意库是 WAL 模式：服务运行时新写入可能要 checkpoint 后才可见（停掉服务再看最稳）。

- 连接配置：`src/config/database.js`（WAL、busy_timeout）
- SQL 全在 `src/dao/messages.dao.js`
- 换库只改这两个文件

## 跑起来（两个终端）

```bash
# 终端 A：后端
cd server
npm install        # 第一次
npm run dev        # 改代码自动重启 → http://localhost:3100

# 终端 B：前端
cd web
npm install        # 第一次
npm run dev        # → http://localhost:5173
```

打开 **http://localhost:5173**（注意是 5173，不是 3100）。

`vite.config.js` 里配了 proxy，`/api/*` 会转发到 3100，所以：

- 后端不用装 `cors`
- 前端写 `fetch('/api/chat')` 就行，不用写完整地址

## 接口

```http
POST /api/chat
{ "text": "你好" }
→ { "reply": "我收到了：「你好」。这是一个占位回复…" }
```

```http
GET /api/messages
→ { "messages": [{ "role": "user", "content": "…" }, …] }
```

## 结构

```
agent/
├── web/
│   ├── index.html          Vite 的入口（不能删，见下）
│   ├── vite.config.js      proxy: /api → localhost:3100
│   └── src/
│       ├── main.js         挂载 #app
│       ├── App.vue         根组件：全局壳 + 全局样式
│       └── views/
│           └── ChatView.vue   聊天页（模板 + 逻辑 + scoped 样式）
└── server/
    ├── package.json
    └── src/
        ├── app.js          组装层：挂中间件和路由
        ├── server.js       监听端口
        ├── http.js         业务码 + 响应信封（success / fail）
        ├── config.js       配置：环境变量优先，其次本地 config/config.js
        ├── config/
        │   └── database.js SQLite 连接（单例、WAL）
        ├── db/
        │   └── init.js     建表脚本（npm run db:init）
        ├── dao/
        │   └── messages.dao.js 消息表读写，SQL 都在这
        ├── services/
        │   └── llm.js      模型调用：把 SSE 流包成异步生成器
        └── routes/
            ├── chat.js     POST /api/chat（流式转发模型）
            └── messages.js POST /api/messages（查库）
```

## 现在有什么

| 功能 | 状态 |
|---|---|
| 发消息、显示回复 | ✅ |
| 空输入校验（400） | ✅ |
| 刷新页面恢复历史 | ✅ |
| 重启后历史还在 | ✅ SQLite（`server/data/agent.db`） |
| 大模型 | ✅ DeepSeek（OpenAI 兼容协议） |
| 流式 | ✅ SSE 逐字输出，前端带光标动画 |
| 多轮上下文 | ✅ 带最近 20 条历史 |
| 出错提示 | ✅ 上游失败返回 502 + code 2001，流中断发 error 帧 |

## 分支

| 分支 | 内容 |
|---|---|
| `main` | 当前版本：Vue 3 + Express，SSE 流式 + DeepSeek |
| `prototype-react` | 早期的完整原型：React + SSE 流式 + 接 DeepSeek（参考用） |


## 生产部署（以后）

前端 `npm run build` 出 `dist/`，两种托管方式二选一：

- nginx 托管 `dist/`，`/api` 反代到 Node；
- 或 Express `app.use(express.static('../web/dist'))`，一个进程搞定。


## 为什么 index.html 不能删

它不是“页面”，是 **Vite 的构建入口**——只负责挂一个 `<div id="app">` 和引入 `main.js`。删掉之后：

```
[UNRESOLVED_ENTRY] Cannot resolve entry module index.html.
```

想看页面代码，去 `src/views/ChatView.vue`。
