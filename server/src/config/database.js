// 数据库连接（单例）。参考 novel-server 的 config/database.js。
// 路径默认是 server/data/agent.db，可用环境变量 DB_PATH 覆盖。

import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH ?? join(__dirname, '../../data/agent.db');

let db = null;

export function getDatabase() { // 首次调用才真正打开数据库
    if (db) return db;

    mkdirSync(dirname(DB_PATH), { recursive: true }); // data 目录不存在时自动创建
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL'); // 读写并发更好，崩溃时也更安全
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000'); // 锁等待 5 秒，避免偶发 SQLITE_BUSY

    console.log(`数据库: ${DB_PATH}`);
    return db;
}
