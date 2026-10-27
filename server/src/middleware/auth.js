// 登录态中间件：读完 cookie 里的 sid，查 sessions，挂 req.user。
// 未登录时 req.user 为 null，不直接拦截（由路由自己决定要不要登录）。

import { parseCookies } from '../cookies.js';
import sessionsDAO from '../dao/sessions.dao.js';
import usersDAO from '../dao/users.dao.js';

export const SESSION_COOKIE = 'sid';

export function attachUser(req, _res, next) { // 把当前登录用户挂到 req 上
    const cookies = parseCookies(req.headers.cookie);
    const session = sessionsDAO.findValid(cookies[SESSION_COOKIE]);

    req.user = session ? usersDAO.findById(session.user_id) : null;
    next();
}
