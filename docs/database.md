# 数据库结构

SQLite，文件在 `server/data/agent.db`（已 gitignore）。三张表，关系很简单：

```
users 1 ──── N sessions      （一个用户可以有多个登录会话：多设备/多浏览器）
users 1 ──── N messages      （一个用户的历史）
messages.user_id IS NULL ──── 未登录的匿名历史
```

建表脚本：`server/src/db/init.js`（`npm run db:init`，可重复执行）。
读写封装：`server/src/dao/*.dao.js`。

## users

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | INTEGER | PK, 自增 | 本地用户 ID，业务数据都挂它 |
| `github_id` | INTEGER | **NOT NULL, UNIQUE** | GitHub 账号 ID，永久不变 |
| `login` | TEXT | NOT NULL | GitHub 用户名，**会变**，只做展示 |
| `avatar` | TEXT | 可空 | 头像 URL |
| `created_at` | INTEGER | NOT NULL | 首次登录时间（毫秒） |

**为什么用 `github_id` 而不是 `login` 做唯一键**：GitHub 用户改名后 `login` 变了，
但 `id` 不变。用 `login` 会在用户改名时把同一个人当成两个账号。

## sessions

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `token` | TEXT | PK | 随机 UUID，就是 cookie `sid` 的值 |
| `user_id` | INTEGER | NOT NULL, FK → users(id) | 会话属于谁 |
| `created_at` | INTEGER | NOT NULL | 签发时间 |
| `expires_at` | INTEGER | NOT NULL | 过期时间（签发 + 30 天） |

索引：`idx_sessions_expires (expires_at)` —— 用于批量清理过期会话。

`ON DELETE CASCADE`：删用户时会话一起删。

**为什么不存 GitHub 的 access_token**：只在登录那一刻用它读一次用户资料，
读完就丢。它可被撤销、可能过期，不是身份标识。

## messages

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | INTEGER | PK, 自增 | 同时是排序依据和分页游标 |
| `role` | TEXT | NOT NULL | `user` / `assistant` |
| `content` | TEXT | NOT NULL | 消息正文 |
| `created_at` | INTEGER | NOT NULL | 毫秒时间戳 |
| `user_id` | INTEGER | **NOT NULL** | 归属用户（强制登录后必有值） |

索引：

| 索引 | 用途 |
|---|---|
| `idx_messages_id (id)` | 按时间取最近 N 条 |
| `idx_messages_user (user_id, id)` | 某个用户的历史（走索引，不全表扫） |

**强制登录后**：所有消息都挂在具体用户上，没有匿名桶。`npm run db:init` 会把
旧表（user_id 可空）重建成 NOT NULL，并丢弃无主的匿名消息。

## 典型查询

```sql
-- 带上下文调模型：取某用户最近 20 条（先倒序取，再翻转）
SELECT id, role, content, created_at
FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT 20;

-- 历史接口：全量
SELECT id, role, content, created_at AS createdAt
FROM messages WHERE user_id = ? ORDER BY id;

-- 登录：按 github_id 找用户
SELECT * FROM users WHERE github_id = ?;

-- 校验会话（只认未过期的）
SELECT * FROM sessions WHERE token = ? AND expires_at > ?;

-- 定期清理
DELETE FROM sessions WHERE expires_at < ?;
```

## 几个设计选择

| 选择 | 原因 |
|---|---|
| `created_at` 用 INTEGER 毫秒 | 比 DATETIME 字符串好排序、好比较、无时区歧义 |
| 没有 `conversations` 表 | 当前一个用户只有一条连续的对话流，不需要分段 |
| 消息成对写入（事务） | 不会出现"有问无答"的残缺轮次 |
| WAL 模式 | 读写并发更好，崩溃恢复更安全 |
| messages 不建外键到 users | 删用户时不想级联删掉历史；也确实不需要约束 |

## 将来要加什么

| 需求 | 改动 |
|---|---|
| 一个用户多段对话 | 新增 `conversations(id, user_id, title, created_at)`，messages 加 `conversation_id` |
| 记忆功能 | 新增 `memories` 表，挂 `user_id` |
| 消息太多 | `messages` 加 `(user_id, id)` 分页游标，接口改成分页 |
| 换 Postgres | 只改 `config/database.js` 和 `dao/*.js`，SQL 基本兼容 |
