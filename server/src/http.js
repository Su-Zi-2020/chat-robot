// 接口层的公共约定：业务码 + 统一响应信封。
// 所有路由和 app.js 都用这里，所以单独一个文件；再拆成两个就太碎了。

// 业务码：0 成功；1xxx 请求/参数问题；2xxx 上游依赖；5xxx 服务自身
export const CODE = {
    SUCCESS: 0, // 成功
    BAD_PARAM: 1001, // 参数错误：缺字段、类型不对、空值、超长
    BAD_JSON: 1002, // 请求体不是合法 JSON
    TOO_LARGE: 1003, // 请求体过大（超过 100KB）
    NOT_FOUND: 1004, // 接口不存在（路径没匹配上）
    UNAUTHORIZED: 1005, // 未登录或登录已过期
    UPSTREAM: 2001, // 上游模型服务失败：连不上、返回错误、没配 key
    INTERNAL: 5000, // 服务内部错误（未捕获异常）
};

// 成功响应：固定 HTTP 200 + 信封
export const success = (res, data = null) =>
    res.status(200).json({ code: CODE.SUCCESS, message: 'success', data });

// 失败响应：真实状态码 + 信封（httpStatus 与 code 一一对应，见 docs/api.md）
export const fail = (res, httpStatus, code, message) =>
    res.status(httpStatus).json({ code, message });
