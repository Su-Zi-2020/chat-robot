// 建表脚本：npm run db:init
// 参考 novel-server 的 novelDb/init.js —— 用 IF NOT EXISTS，可重复执行。

import { getDatabase } from '../config/database.js';

const db = getDatabase();

console.log('开始初始化数据库...');

db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL, -- user | assistant
        content TEXT NOT NULL, -- 消息正文
        created_at INTEGER NOT NULL -- 毫秒时间戳
    );
`);

// 按 id 取最近 N 条时要排序，建个索引
db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_id ON messages (id);`);

console.log('messages 表已就绪');
