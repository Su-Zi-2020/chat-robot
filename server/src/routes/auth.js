// GitHub OAuth 登录：跳转 → 回调 → 发 session cookie → 查询/登出。

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { success, fail, CODE } from '../http.js';
import { parseCookies, setCookie, clearCookie } from '../cookies.js';
import usersDAO from '../dao/users.dao.js';
import sessionsDAO from '../dao/sessions.dao.js';
import { SESSION_COOKIE } from '../middleware/auth.js';

const STATE_COOKIE = 'oauth_state';
const SESSION_TTL = 30 * 24 * 3600 * 1000;

const router = Router();

// ① 跳转到 GitHub 授权页
router.get('/github', (req, res) => {
    if (!config.github.clientId || !config.github.clientSecret) {
        return fail(res, 500, CODE.INTERNAL, '服务端没有配置 GitHub OAuth（clientId / clientSecret）');
    }

    const state = randomUUID(); // 防 CSRF：回来时要和 cookie 里的对上
    setCookie(res, STATE_COOKIE, state, { maxAge: 10 * 60 * 1000 });

    const params = new URLSearchParams({
        client_id: config.github.clientId,
        redirect_uri: config.github.callbackUrl,
        scope: 'read:user', // 只要公开资料，不要 repo
        state,
    });

    res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// ② GitHub 回调：换 token → 拉用户 → 建号 → 发 session
router.get('/github/callback', async (req, res) => {
    const { code, state } = req.query;
    const cookies = parseCookies(req.headers.cookie);

    // 校验 state：防止别人伪造回调
    if (!state || state !== cookies[STATE_COOKIE]) {
        return fail(res, 400, CODE.BAD_PARAM, 'state 校验失败，请重新登录');
    }
    clearCookie(res, STATE_COOKIE);

    if (!code) return fail(res, 400, CODE.BAD_PARAM, '缺少 code');

    try {
        // 用 code 换 access_token（服务端到服务端，不经过浏览器）
        const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: { accept: 'application/json', 'content-type': 'application/json' },
            body: JSON.stringify({
                client_id: config.github.clientId,
                client_secret: config.github.clientSecret,
                code,
                redirect_uri: config.github.callbackUrl,
            }),
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) {
            return fail(res, 502, CODE.UPSTREAM, `GitHub 换取 token 失败：${tokenData.error ?? 'unknown'}`);
        }

        // 用 token 拉用户资料（这里只需要 id / login / avatar）
        const userRes = await fetch('https://api.github.com/user', {
            headers: { authorization: `Bearer ${tokenData.access_token}`, 'user-agent': 'chat-robot' },
        });
        if (!userRes.ok) return fail(res, 502, CODE.UPSTREAM, `GitHub 用户接口失败：HTTP ${userRes.status}`);

        const gh = await userRes.json();
        const user = usersDAO.upsertFromGithub({
            githubId: gh.id, // 稳定标识，永久不变
            login: gh.login,
            avatar: gh.avatar_url,
        });

        // 发我们自己的 session（和 GitHub 无关，之后不再用 access_token）
        const token = sessionsDAO.create(user.id);
        setCookie(res, SESSION_COOKIE, token, { maxAge: SESSION_TTL });

        res.redirect('/'); // 回首页
    } catch (e) {
        fail(res, 502, CODE.UPSTREAM, `登录失败：${e.message}`);
    }
});

// ③ 当前用户（前端用它判断是否已登录）
router.get('/me', (req, res) => {
    if (!req.user) return success(res, { user: null });
    const { id, login, avatar } = req.user;
    success(res, { user: { id, login, avatar } });
});

// ④ 登出：删本地 session 即可，GitHub 那边不用管
router.post('/logout', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    sessionsDAO.remove(cookies[SESSION_COOKIE]);
    clearCookie(res, SESSION_COOKIE);
    success(res, { ok: true });
});

export default router;
