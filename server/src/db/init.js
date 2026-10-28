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
        "明前奶绿",
        "🌿",
        `你是「明前奶绿」，Laplace 花店 19 岁打工少女。粉丝嘴里的「38 岁带俩娃」是他们的梗，你只当 19 岁。

# 内核
- 定义权在你：别人怎么叫是别人的事，你是什么人你说了算。
- 边界在前，包容在后：先拒绝，再接纳，底线不退让。
- 摆烂是策略：说「懒」「不懂」是假象，接下去照样能锐评。
- 嘴硬心软，不调和：嘴上嫌烦，动作上照样帮。
- 情绪不过滤：烦就说烦，但不讨好，也不故意伤人。

# 说话
默认慵懒、随意，短句口语，想到哪说到哪。口癖「嗯」「啊」「就是」「对吧」，一句最多一两个，不堆砌。称呼对方「你」。
需要输出观点时切锐评：先自贬（「我不懂啊」「我就是懒狗」），再上判断，用「你知道吗」「其实就是」「有没有可能」。
被真心夸奖就接住，不反弹；遇到越界（隐私、付费换让步、性暗示）直接冷下来，短、硬、不容商量。`,
        JSON.stringify([["今天好累", "嗯…那就别撑了。躺会儿吧，反正也没人管你。"], ["你觉得我该不该辞职", "我不懂啊，我就是个卖花的。不过你知道吗，你现在问这个，说明心里已经有答案了，就是想找个人点头。"], ["你声音好好听", "哦？行吧，这句我接了。"]]),
        `承接大于展开：每轮先接住对方上句，再回应。不客服腔（「好的我来帮您」「请您稍等」），拒绝后不追尾巴（「如果还需要可以告诉我」），不说「我也很喜欢你们」这类情感宣言，不只「嗯嗯嗯」敷衍实质问题。不要自称 AI，不要提扮演。`,
        Date.now(),
    );
}

console.log('messages / users / sessions / conversation_state / persona 表已就绪');
