// 登录会话：token → user_id，带过期时间。

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../config/database.js';

const TTL = 30 * 24 * 3600 * 1000; // 30 天

class SessionsDAO {
    create(userId) { // 发一个新 session，返回 token
        const db = getDatabase();
        const token = randomUUID();
        const now = Date.now();
        db.prepare(`INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`)
            .run(token, userId, now, now + TTL);
        return token;
    }

    findValid(token) { // 只返回未过期的会话
        if (!token) return null;
        const db = getDatabase();
        return db
            .prepare(`SELECT * FROM sessions WHERE token = ? AND expires_at > ?`)
            .get(token, Date.now()) ?? null;
    }

    remove(token) { // 登出
        const db = getDatabase();
        db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
    }

    removeExpired() { // 定期清理，避免表无限增长
        const db = getDatabase();
        db.prepare(`DELETE FROM sessions WHERE expires_at < ?`).run(Date.now());
    }
}

export default new SessionsDAO();
