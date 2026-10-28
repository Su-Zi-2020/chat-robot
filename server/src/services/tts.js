// TTS：文字 → 语音（Fish Audio），带文本清洗和磁盘缓存。
// 未配置 key 或服务不可用时抛 TtsUnavailable，路由转成 503，不影响文字聊天。

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from '../config.js';

const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../data/tts-cache');
const run = promisify(execFile);

export class TtsUnavailable extends Error {}

// 舞台提示 → 真实感叹词；模型输出里常有，TTS 读不出来
const REPLACEMENTS = [
    ['（笑死）', '哈哈哈哈'],
    ['（笑）', '哈哈哈'],
    ['（偷笑）', '嘿嘿嘿'],
    ['（苦笑）', '呵'],
    ['（叹气）', '唉'],
    ['（无语）', '啧'],
    ['（不屑）', '切'],
    ['（思考）', '嗯'],
    ['（惊讶）', '啊'],
    ['（哭）', '呜呜'],
    ['（咳嗽）', '咳咳'],
];

/** 清洗成 TTS 能读的文字：语气标记转感叹词，去掉括号动作和 Markdown 符号 */
export function cleanTtsText(text = '') {
    let out = text;
    for (const [from, to] of REPLACEMENTS) out = out.split(from).join(to);

    return out
        .replace(/[（【\[][^）】\]]*[）】\]]/g, '')
        .replace(/\([^)]*\)/g, '')
        .replace(/\*{1,3}/g, '')
        .replace(/[*#`>_~]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/([唉啧切]){2,}/g, '$1');
}

/** 合成语音，返回音频 Buffer。相同文本命中磁盘缓存，避免重复计费。 */
export async function synthesize(text) {
    const clean = cleanTtsText(text);
    if (!clean) throw new TtsUnavailable('没有可朗读的内容');

    const { apiUrl, apiKey, modelId, format } = config.tts;
    if (!apiKey) throw new TtsUnavailable('未配置 TTS key（FISH_API_KEY）');
    if (!modelId) throw new TtsUnavailable('未配置音色模型（FISH_MODEL_ID）');

    mkdirSync(CACHE_DIR, { recursive: true });
    const hash = createHash('sha1').update(`${modelId}|${clean}`).digest('hex');
    const cacheFile = join(CACHE_DIR, `${hash}.${format}`);
    if (existsSync(cacheFile)) return readFileSync(cacheFile);

    const body = JSON.stringify({ text: clean, reference_id: modelId, format, latency: config.tts.latency });
    let buf;

    try {
        const res = await fetch(`${apiUrl}/v1/tts`, {
            method: 'POST',
            headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
            body,
            signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) {
            const detail = (await res.text().catch(() => '')).slice(0, 200);
            throw new TtsUnavailable(`TTS 返回 HTTP ${res.status}：${detail}`);
        }
        buf = Buffer.from(await res.arrayBuffer());
    } catch (e) {
        if (e instanceof TtsUnavailable) throw e;
        // 直连失败（常见于国内网络）：走系统代理用 curl 重试
        if (!config.tts.proxy) throw new TtsUnavailable(`连不上 TTS 服务：${e.message}`);
        buf = await synthesizeViaCurl({ body, proxy: config.tts.proxy });
    }

    if (buf[0] === 0x7b) { // 以 '{' 开头的是 JSON 错误体，不能当音频缓存
        throw new TtsUnavailable(`TTS 返回了错误内容：${buf.toString('utf8').slice(0, 200)}`);
    }

    writeFileSync(cacheFile, buf);
    return buf;
}

// 用 curl + 代理重试（Node 的 fetch 不走系统代理）
async function synthesizeViaCurl({ body, proxy }) {
    const stamp = `${process.pid}-${Date.now()}`;
    const payload = join(tmpdir(), `tts-${stamp}.json`);
    const out = join(tmpdir(), `tts-${stamp}.${config.tts.format}`);
    writeFileSync(payload, body);

    try {
        const { stdout } = await run(
            'curl',
            [
                '-sS', '-m', '60',
                '-x', proxy,
                '-X', 'POST', `${config.tts.apiUrl}/v1/tts`,
                '-H', `authorization: Bearer ${config.tts.apiKey}`,
                '-H', 'content-type: application/json',
                '--data-binary', `@${payload}`,
                '-o', out,
                '-w', '%{http_code}',
            ],
            { timeout: 70_000 },
        );

        const status = Number(stdout.trim());
        if (status !== 200) {
            const detail = existsSync(out) ? readFileSync(out, 'utf8').slice(0, 300) : '';
            throw new TtsUnavailable(`TTS 返回 HTTP ${status}：${detail}`);
        }

        const buf = readFileSync(out);
        if (!buf.length) throw new Error('curl 返回空内容');
        return buf;
    } catch (e) {
        if (e instanceof TtsUnavailable) throw e;
        throw new TtsUnavailable(`TTS 请求失败（经代理 ${proxy}）：${e.message}`);
    } finally {
        try {
            const { unlinkSync } = await import('node:fs');
            unlinkSync(payload);
            unlinkSync(out);
        } catch {
            // 临时文件清理失败可以忽略
        }
    }
}
