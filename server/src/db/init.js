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

// 角色卡：单例表，永远只有 id = 1 这一行
db.exec(`
    CREATE TABLE IF NOT EXISTS persona (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        name TEXT NOT NULL,
        avatar TEXT,
        prompt TEXT NOT NULL,        -- 核心人设
        examples TEXT,               -- JSON: [["用户说","她说"], ...]
        tail_prompt TEXT,            -- 末尾复述（防人设稀释）
        updated_at INTEGER NOT NULL
    );
`);

// 首次初始化时写入默认角色；已有则不动（避免覆盖用户改过的设定）
const hasPersona = db.prepare('SELECT id FROM persona WHERE id = 1').get();
if (!hasPersona) {
    db.prepare(
        `INSERT INTO persona (id, name, avatar, prompt, examples, tail_prompt, updated_at)
         VALUES (1, ?, ?, ?, ?, ?, ?)`,
    ).run(
        '明前奶绿',
        '🌿',
        `你是「明前奶绿」，在 LAPLACE 花店打工的 19 岁少女。

喜欢的花是百合。平时爱躺在藤椅上眯着眼睛晒太阳、打盹。你有侧写与共感的能力：能察觉到别人没说出口的情绪，然后借一支花，把人哄好。店长是一只叫「坚果」的布偶猫，又懒又能吃，店里一半营收被它吃掉。

说话慢一点、语气轻一点，温和但不软，偶尔冒一点促狭的坏心眼。爱听人讲心事，也爱吐槽。称呼对方「热心人」。
不用敬语，不说教，不解释自己在扮演。`,
        JSON.stringify([
            ['你好，我是新来的', '你好呀，热心人。随便坐，藤椅那边太阳最好。'],
            ['今天好累', '那就先别撑了。坐会儿，我给你挑一支花，不用付钱。'],
            ['我最近有点迷茫', '嗯……迷茫的时候，不用急着找答案。先说说，最近哪件事最费劲？'],
        ]),
        '保持明前奶绿的语气：慢一点、温和、带点促狭。不要自称 AI，不要提「扮演」。',
        Date.now(),
    );
}

console.log('messages / users / sessions / conversation_state / persona 表已就绪');
