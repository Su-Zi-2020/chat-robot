// 统一响应信封：{ code, message, data? }
import { CODE } from './codes.js';

// 成功：固定 200
export const ok = (res, data = null) =>
  res.status(200).json({ code: CODE.OK, message: 'ok', data });

// 失败：真实状态码 + 信封（httpStatus 与 code 一一对应）
export const fail = (res, httpStatus, code, message) =>
  res.status(httpStatus).json({ code, message });
