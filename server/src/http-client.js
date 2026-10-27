// 带 curl 兜底的 JSON 请求。
//
// 背景：本地开了代理类工具（如 Steam++ / Clash）时，它们会做 HTTPS 中间人，
// 用自签证书替换真实证书。curl 走系统钥匙串（信任它），Node 的 fetch 只用内置根
// 证书，会报 UNABLE_TO_VERIFY_LEAF_SIGNATURE → "fetch failed"。
//
// 所以：优先用 fetch；只有遇到证书类错误时，回退到 curl（生产环境不会有这个回退）。

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

const TLS_ERRORS = new Set([
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'CERT_HAS_EXPIRED',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
]);

function isTlsError(e) {
    const code = e?.cause?.code ?? e?.code;
    return TLS_ERRORS.has(code);
}

async function viaCurl(url, { method = 'GET', headers = {}, body } = {}) {
    const args = ['-sS', '--max-time', '20', '-X', method, '-w', '\n%{http_code}'];

    for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
    if (body) args.push('--data-binary', body);
    args.push(url);

    const { stdout } = await exec('curl', args, { maxBuffer: 1024 * 1024 });

    const idx = stdout.lastIndexOf('\n');
    const payload = stdout.slice(0, idx);
    const status = Number(stdout.slice(idx + 1)) || 0;

    return { status, json: payload ? JSON.parse(payload) : null };
}

/**
 * 发一个 JSON 请求，返回 { status, json }。
 * @param {string} url
 * @param {{method?:string, headers?:object, body?:string}} opts
 */
export async function requestJson(url, opts = {}) {
    try {
        const res = await fetch(url, opts);
        const json = await res.json().catch(() => null);
        return { status: res.status, json };
    } catch (e) {
        if (!isTlsError(e)) throw e; // 其他网络错误原样抛出

        console.warn('[http-client] TLS 校验失败，改用 curl 重试:', url, e.cause?.code);
        return viaCurl(url, opts);
    }
}
