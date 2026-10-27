// 建表脚本：npm run db:init
// 参考 novel-server 的 novelDb/init.js —— 用 IF NOT EXISTS，可重复执行。

import { getDatabase } from '../config/database.js';

const db = getDatabase();

console.log('开始初始化数据库...');

// 消息表：user_id 为空表示"未登录的匿名历史"
db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER, -- 归属用户；NULL = 匿名
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

// 迁移：老库的 messages 没有 user_id，补上（可重复执行）
const cols = db.prepare(`PRAGMA table_info(messages)`).all().map((c) => c.name);
if (!cols.includes('user_id')) {
    db.exec(`ALTER TABLE messages ADD COLUMN user_id INTEGER`);
    console.log('已为 messages 补上 user_id 列');
}
db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_user ON messages (user_id, id);`);

console.log('messages / users / sessions 表已就绪');
