// 极简 cookie 解析/序列化，避免为两个字段引入 cookie-parser。
// 只处理登录需要的场景：读写单个 key。

export function parseCookies(header = '') { // 把 "a=1; b=2" 解析成对象
    const out = {};
    for (const part of header.split(';')) {
        const i = part.indexOf('=');
        if (i === -1) continue;
        const k = part.slice(0, i).trim();
        const v = part.slice(i + 1).trim();
        if (k) out[k] = decodeURIComponent(v);
    }
    return out;
}

export function setCookie(res, name, value, { maxAge, httpOnly = true, path = '/' } = {}) { // 追加一个 Set-Cookie
    const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`];
    if (httpOnly) parts.push('HttpOnly');
    parts.push('SameSite=Lax'); // 跨站 POST 不带 cookie，挡掉大部分 CSRF
    if (process.env.NODE_ENV === 'production') parts.push('Secure'); // 生产必须 HTTPS
    if (maxAge != null) parts.push(`Max-Age=${Math.floor(maxAge / 1000)}`);
    appendSetCookie(res, parts.join('; '));
}

export function clearCookie(res, name, { path = '/' } = {}) { // 让浏览器立刻删掉
    appendSetCookie(res, `${name}=; Path=${path}; Max-Age=0; HttpOnly; SameSite=Lax`);
}

function appendSetCookie(res, cookie) {
    const prev = res.getHeader('Set-Cookie');
    const list = prev ? (Array.isArray(prev) ? prev : [prev]) : [];
    res.setHeader('Set-Cookie', [...list, cookie]);
}
