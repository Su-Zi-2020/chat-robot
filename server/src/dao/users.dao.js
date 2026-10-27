// 用户表读写：GitHub 账号 → 本地用户。

import { getDatabase } from '../config/database.js';

class UsersDAO {
    findByGithubId(githubId) { // 用 github_id 查，不用 login（login 会改）
        const db = getDatabase();
        return db.prepare(`SELECT * FROM users WHERE github_id = ?`).get(githubId) ?? null;
    }

    findById(id) {
        const db = getDatabase();
        return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) ?? null;
    }

    /** 首次登录自动建号；已存在则更新 login/avatar（用户可能改名换头像） */
    upsertFromGithub({ githubId, login, avatar }) {
        const db = getDatabase();
        const existing = this.findByGithubId(githubId);

        if (existing) {
            db.prepare(`UPDATE users SET login = ?, avatar = ? WHERE id = ?`).run(login, avatar, existing.id);
            return this.findById(existing.id);
        }

        const info = db
            .prepare(`INSERT INTO users (github_id, login, avatar, created_at) VALUES (?, ?, ?, ?)`)
            .run(githubId, login, avatar, Date.now());

        return this.findById(info.lastInsertRowid);
    }
}

export default new UsersDAO();
