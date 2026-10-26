# 最简对话 demo（Vue + Express）

**没有大模型、没有流式。** 前后端分离，两个项目：

- `web/`  Vue 3 + Vite，开发端口 5173
- `server/`  Express，端口 3100

功能只有一件事：你发一句话，后端回一句占位的话。

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
│       ├── App.vue         根组件：只放全局壳
│       ├── views/
│       │   └── ChatView.vue   聊天页（模板 + 逻辑 + scoped 样式）
│       └── style.css          全局样式（只有 reset 和 body）
└── server/
    ├── package.json
    └── src/
        ├── app.js          Express 路由 + 假回复
        └── server.js       监听端口
```

## 现在有什么

| 功能 | 状态 |
|---|---|
| 发消息、显示回复 | ✅ |
| 空输入校验（400） | ✅ |
| 刷新页面恢复历史 | ✅（内存里，重启就清空） |
| 大模型 | ❌ 占位回复 |
| 流式 | ❌ 一次性返回 |

## 分支

```bash
git checkout main       # 完整版：接 DeepSeek、SSE 流式、React 前端
git checkout minimal    # 当前：Vue + Express，无模型
```

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
