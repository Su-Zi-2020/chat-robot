// test.js  ——  ESM 模块，需 package.json 里 "type": "module" 或文件名用 .mjs
import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';

const rl = createInterface({ input: stdin, output: stdout, terminal: true });

// ====== 开关：改成 false 就能看到“去掉 rl.prompt()”的效果 ======
const SHOULD_PROMPT_AFTER_CANCEL = false;
// ============================================================

let inConfirm = false; // 防止 Ctrl+C 重入

rl.setPrompt('你 > ');
rl.prompt();

rl.on('line', (line) => {
    if (inConfirm) return; // 确认阶段由 question 接管，忽略 line
    if (line.trim() === '') {
        console.log('（空输入）');
    } else {
        console.log(`你好，${line}`);
    }
    rl.prompt();
});

// 按 Ctrl+C 时进入“确认退出”流程
rl.on('SIGINT', () => {
    if (inConfirm) return; // 已经在确认中，忽略重复 Ctrl+C
    inConfirm = true;

    console.log('\n'); // 换行，避免提示符和输入挤在一起
    rl.question('确定要退出吗？(y/n) ', (answer) => {
        inConfirm = false;

        if (answer.trim().toLowerCase() === 'y') {
            console.log('再见');
            rl.close();
            process.exit(0);
        }

        console.log('好的，继续。');

        if (SHOULD_PROMPT_AFTER_CANCEL) {
            rl.prompt(); // ← 关键：恢复提示符和输入流
        } else {
            // 不调 prompt()：光标停在空行，没有 "你 > "，体验上像卡死
            // 但输入流通常仍然是通的，你可以试着“盲打”看看
            console.log('【测试点】这里故意没有调用 rl.prompt()，观察终端是否像卡住。');
        }
    });
});

rl.on('close', () => {
    // Ctrl+D 也会走到这里
    process.exit(0);
});