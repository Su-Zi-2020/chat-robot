// 消息表的读写。所有 SQL 都在这里，路由只调方法。
// 参考 novel-server 的 dao/*.dao.js：class + 导出单例。

import { getDatabase } from '../config/database.js';

class MessagesDAO {
    // 所有查询都按 user_id 过滤；传 null 表示未登录的匿名历史。
    // 用 SQLite 的 IS 而不是 =，因为 IS 能正确匹配 NULL。

    /** 取最近 limit 条，按时间正序返回（先 ID 倒序取，再翻转） */
    listRecent(limit = 100, userId = null) {
        const db = getDatabase();
        return db
            .prepare(
                `SELECT id, role, content, created_at AS createdAt FROM messages
                 WHERE user_id IS ? ORDER BY id DESC LIMIT ?`,
            )
            .all(userId, limit)
            .reverse();
    }

    /** 取全部（历史接口用，目前消息量小） */
    listAll(userId = null) {
        const db = getDatabase();
        return db
            .prepare(
                `SELECT id, role, content, created_at AS createdAt FROM messages
                 WHERE user_id IS ? ORDER BY id`,
            )
            .all(userId);
    }

    /** 一问一答成对写入：放在同一个事务里，不会只写成功一半 */
    appendExchange(userText, assistantText, userId = null) {
        const db = getDatabase();
        const now = Date.now();
        const insert = db.prepare(`INSERT INTO messages (user_id, role, content, created_at) VALUES (?, ?, ?, ?)`);

        const tx = db.transaction(() => {
            const user = insert.run(userId, 'user', userText, now);
            const assistant = insert.run(userId, 'assistant', assistantText, now);
            return { userId: user.lastInsertRowid, assistantId: assistant.lastInsertRowid };
        });

        return tx();
    }
}

export default new MessagesDAO();
