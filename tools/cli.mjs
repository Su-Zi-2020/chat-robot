#!/usr/bin/env node
// 终端工具（开发用，不部署）：只负责读输入、写输出、处理快捷键。
// 模型调用在 server/llm.js，会话历史在 server/session.js。

import { createInterface } from 'node:readline';
import { stdin, stdout, stderr, exit } from 'node:process';
import { createSession } from '../server/session.js';
import { resolveConfig } from '../server/llm.js';

const STREAM = !process.argv.includes('--no-stream');
const EXIT_WORDS = new Set(['exit', 'quit', ':q']);

const session = createSession({ stream: STREAM });

function reportError(e) {
  stdout.write('\n');
  stderr.write(`[请求失败] ${e.message}\n`);
}

// 一次性模式：从管道或文件读入，答完就退出
async function runOnce() {
  const chunks = [];
  for await (const c of stdin) chunks.push(c);
  const prompt = Buffer.concat(chunks).toString('utf8').trim();

  if (!prompt) {
    stderr.write('没有收到输入。用法：echo "你的问题" | node tools/cli.mjs\n');
    exit(1);
  }

  stdout.write('AI > ');
  try {
    await session.send(prompt, { onDelta: (d) => stdout.write(d) });
    stdout.write('\n');
  } catch (e) {
    reportError(e);
    exit(1);
  }
}

// 交互模式：多轮对话，直到 exit 或 Ctrl-C
async function runRepl() {
  const { model, baseUrl } = resolveConfig();
  stdout.write(`模型 ${model}  ·  端点 ${baseUrl}  ·  ${STREAM ? '流式' : '非流式'}\n`);
  stdout.write('输入内容回车发送；exit 退出；Ctrl-C 中止。\n\n');

  const rl = createInterface({ input: stdin, output: stdout, terminal: true });

  rl.on('SIGINT', () => {
    stdout.write('\n再见\n');
    rl.close();
  });

  rl.setPrompt('你 > ');
  rl.prompt();

  for await (const raw of rl) {
    const text = raw.trim();
    if (!text) {
      rl.prompt();
      continue;
    }
    if (EXIT_WORDS.has(text)) break;

    stdout.write('AI > ');
    try {
      await session.send(text, { onDelta: (d) => stdout.write(d) });
      stdout.write('\n');
    } catch (e) {
      reportError(e);
    }
    rl.prompt();
  }

  rl.close();
}

await (stdin.isTTY ? runRepl() : runOnce());
