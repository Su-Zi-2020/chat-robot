// 建表脚本：npm run db:init
// 参考 novel-server 的 novelDb/init.js —— 用 IF NOT EXISTS，可重复执行。

import { getDatabase } from '../config/database.js';

const db = getDatabase();

console.log('开始初始化数据库...');

// 消息表：user_id 为空表示"未登录的匿名历史"
db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL, -- 归属用户（强制登录后必有值）
        role TEXT NOT NULL, -- user | assistant
        content TEXT NOT NULL, -- 消息正文
        created_at INTEGER NOT NULL -- 毫秒时间戳
    );
`);

// 用户表：github_id 唯一，是稳定的身份标识（login 可以改，不能当主键）
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        github_id INTEGER NOT NULL UNIQUE,
        login TEXT NOT NULL,
        avatar TEXT,
        created_at INTEGER NOT NULL
    );
`);

// 登录会话表：token 就是 cookie 里的值
db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
    );
`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_id ON messages (id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);`);

// 迁移：把老的 messages 表重建为 user_id NOT NULL 的版本
const cols = db.prepare(`PRAGMA table_info(messages)`).all();
const userIdCol = cols.find((c) => c.name === 'user_id');

const needsRebuild = !userIdCol || userIdCol.notnull === 0;
if (needsRebuild) {
    const dropped = userIdCol
        ? db.prepare(`SELECT COUNT(*) AS c FROM messages WHERE user_id IS NULL`).get().c
        : 0;

    db.exec(`
        CREATE TABLE messages_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        INSERT INTO messages_new (id, user_id, role, content, created_at)
            SELECT id, user_id, role, content, created_at FROM messages WHERE user_id IS NOT NULL;
        DROP TABLE messages;
        ALTER TABLE messages_new RENAME TO messages;
    `);

    console.log(`messages 表已重建为 user_id NOT NULL；丢弃了 ${dropped} 条无主的匿名消息`);
}

db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_user ON messages (user_id, id);`);

// 每个用户的上下文状态：滚动摘要 + 已压到哪个消息 id
db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_state (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        summary TEXT NOT NULL DEFAULT '',        -- 滚动摘要（更早对话的压缩版）
        summary_until_id INTEGER NOT NULL DEFAULT 0, -- 摘要覆盖到的最大 message id
        updated_at INTEGER NOT NULL
    );
`);

console.log('messages / users / sessions / conversation_state 表已就绪');
