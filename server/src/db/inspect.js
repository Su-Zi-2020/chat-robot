// 快速查看数据库：npm run db:tables
// 不用打开 VS Code 也能确认表结构和行数。

import { getDatabase } from '../config/database.js';

const db = getDatabase();

const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
    .all();

console.log('\n表名        行数');
console.log('----------  ----');
for (const { name } of tables) {
    const count = db.prepare(`SELECT COUNT(*) AS c FROM ${name}`).get().c;
    console.log(`${name.padEnd(11)} ${count}`);
}

// 最近 5 条消息，方便确认写入是否生效
const recent = db
    .prepare(`SELECT id, user_id, role, content FROM messages ORDER BY id DESC LIMIT 5`)
    .all();

if (recent.length) {
    console.log('\n最近 5 条消息：');
    for (const m of recent.reverse()) {
        const who = m.user_id == null ? '匿名' : `用户${m.user_id}`;
        console.log(`  #${m.id} [${who}][${m.role}] ${m.content.slice(0, 40)}`);
    }
}
console.log();
