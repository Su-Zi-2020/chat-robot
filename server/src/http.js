// 接口层的公共约定：业务码 + 统一响应信封。
// 所有路由和 app.js 都用这里，所以单独一个文件；再拆成两个就太碎了。

// 业务码：0 成功；1xxx 请求/参数问题；5xxx 服务问题
export const CODE = {
    OK: 0,
    BAD_PARAM: 1001,
    BAD_JSON: 1002,
    TOO_LARGE: 1003,
    NOT_FOUND: 1004,
    INTERNAL: 5000,
};

// 成功：固定 200
export const ok = (res, data = null) =>
    res.status(200).json({ code: CODE.OK, message: 'ok', data });

// 失败：真实状态码 + 信封（httpStatus 与 code 一一对应）
export const fail = (res, httpStatus, code, message) =>
    res.status(httpStatus).json({ code, message });
