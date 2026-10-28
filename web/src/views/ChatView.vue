<template>
    <div class="app">
        <header>
            <span>DeepSeek 流式对话</span>
            <span class="account">
                <template v-if="user">
                    <img v-if="user.avatar" :src="user.avatar" class="avatar" alt="" />
                    <span class="name">{{ user.login }}</span>
                    <span v-if="speaking" class="tts-error" style="color: #8b93a5">语音…</span>
                    <span v-if="ttsError" class="tts-error" :title="ttsError">语音不可用</span>
                    <button class="link" :title="autoSpeak ? '关闭自动朗读' : '开启自动朗读'" @click="toggleSpeak">
                        {{ autoSpeak ? '🔊' : '🔇' }}
                    </button>
                    <select v-model="model" class="model" :disabled="streaming" title="本轮使用的模型">
                        <option v-for="m in models" :key="m.id" :value="m.id">{{ m.label }}</option>
                    </select>
                    <button class="link danger" :disabled="streaming" @click="doClear">清空</button>
                    <button class="link" @click="doLogout">退出</button>
                </template>
                <a v-else class="link" href="/api/auth/github">用 GitHub 登录</a>
            </span>
        </header>

        <main v-if="!user" class="login">
            <p class="title">需要登录才能开始</p>
            <a class="primary" href="/api/auth/github">用 GitHub 登录</a>
            <p class="tip">历史会保存到你的账号，换设备也能继续。</p>
        </main>

        <main v-else ref="listEl">
            <!-- 空状态：一条消息都没有时显示 -->
            <p v-if="!messages.length" class="empty">说点什么，模型会逐字回你。</p>

            <!-- 消息列表：用户右对齐、助手左对齐；正在流式的最后一条后面跟光标 -->
            <div v-for="(m, i) in messages" :key="i" class="msg" :class="m.role">
                {{ m.content }}<span
                    v-if="m.role === 'assistant' && streaming && i === messages.length - 1"
                    class="caret"
                >▍</span>
            </div>
        </main>

        <form v-if="user" @submit.prevent="send">
            <input
                ref="inputEl"
                v-model="input"
                placeholder="说点什么…"
                autocomplete="off"
                :maxlength="maxInputChars"
            />
            <span v-if="input.length > maxInputChars - 200" class="counter">{{ input.length }}/{{ maxInputChars }}</span>
            <button :disabled="streaming || !input.trim()">发送</button>
        </form>
    </div>
</template>

<script setup>
import { nextTick, onMounted, ref } from 'vue';
import { ApiError, clearMessages, fetchConfig, fetchMessages, fetchMe, logout, streamChat, ttsBlob } from '../api';

const messages = ref([]); // 消息列表：{ role, content }
const input = ref(''); // 输入框内容
const streaming = ref(false); // 是否正在接收流式回复
const listEl = ref(null); // 消息列表 DOM，用于滚动
const inputEl = ref(null); // 输入框 DOM，用于聚焦
const user = ref(null); // 当前登录用户，null = 未登录
const maxInputChars = ref(2000); // 单条输入上限，从后端配置读
const models = ref([]); // 可选模型 [{ id, label }]
const model = ref(localStorage.getItem('model') ?? ''); // 当前模型
const autoSpeak = ref(localStorage.getItem('autoSpeak') !== '0'); // 边出字边朗读

// ---------- 语音：整条消息生成完再播 ----------
const ttsError = ref(''); // 最近的语音失败原因（提示 8 秒）
const speaking = ref(false); // 是否正在合成/朗读
let speechEpoch = 0; // 每轮 +1，用来丢弃上一轮的播放

// 复用同一个 <audio>，在用户手势中解锁，之后隔多久都能播
const player = new Audio();
player.preload = 'auto';
let playerUnlocked = false;
const SILENT_WAV =
    'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

function unlockPlayer() {
    if (playerUnlocked) return;
    player.src = SILENT_WAV;
    player.play().then(() => {
        player.pause();
        playerUnlocked = true;
    }).catch(() => {});
}

function stopSpeech() { // 停播，作废本轮
    speechEpoch += 1;
    speaking.value = false;
    player.pause();
}

/** 按标点把长文本切成不超过 300 字的段（后端单次上限 500 字） */
function splitForTts(text) {
    const chunks = [];
    let buf = '';
    for (const piece of text.split(/(?<=[。！？!?…\n])/)) {
        if ([...buf].length + [...piece].length > 300 && buf) {
            chunks.push(buf);
            buf = '';
        }
        buf += piece;
    }
    if (buf.trim()) chunks.push(buf);
    return chunks.map((c) => c.trim()).filter((c) => [...c].length >= 2);
}

/** 一次性拿到整条消息的所有音频，再按顺序播放 */
async function speakWhole(text, epoch) {
    if (!autoSpeak.value || !text.trim()) return;

    const chunks = splitForTts(text);
    if (!chunks.length) return;

    speaking.value = true;
    try {
        // 并发合成所有段：总等待 ≈ 最慢的一段，而不是累加
        const blobs = await Promise.all(chunks.map((c) => ttsBlob(c)));
        if (epoch !== speechEpoch) return;

        for (const blob of blobs) {
            if (epoch !== speechEpoch) break;

            const url = URL.createObjectURL(blob);
            await new Promise((resolve) => {
                player.onended = player.onerror = () => resolve();
                player.src = url;
                player.play().catch((e) => {
                    console.warn('[tts] 播放被拒绝:', e.name, e.message);
                    resolve();
                });
            });
            URL.revokeObjectURL(url);
        }
    } catch (e) {
        console.warn('[tts] 合成失败:', e.message);
        ttsError.value = e.message;
        setTimeout(() => {
            if (ttsError.value === e.message) ttsError.value = '';
        }, 8000);
    } finally {
        if (epoch === speechEpoch) speaking.value = false;
    }
}

function toggleSpeak() {
    unlockPlayer();
    autoSpeak.value = !autoSpeak.value;
    localStorage.setItem('autoSpeak', autoSpeak.value ? '1' : '0');
    if (!autoSpeak.value) stopSpeech();
}

async function doClear() { // 清空本地 + 服务端历史，不可恢复
    if (streaming.value) return;
    stopSpeech();
    if (!confirm('清空全部聊天记录？数据库里的也会删除，无法恢复。')) return;
    try {
        await clearMessages();
        messages.value = [];
    } catch (e) {
        alert(e instanceof ApiError ? e.message : '清空失败，请稍后重试');
    }
}

function scrollToBottom() { // 滚到底部（发消息、收到增量、加载完成后调用）
    const el = listEl.value;
    if (el) el.scrollTop = el.scrollHeight;
}

async function loadHistory() { // 页面加载时恢复历史
    try {
        messages.value = await fetchMessages();
    } catch {
        // 后端没起来时静默失败；发消息时会显示具体错误
    }
}

async function send() { // 发送：上屏 → 占位气泡 → 流式回填 → 收尾
    const text = input.value.trim();
    if (!text || streaming.value) return; // 空输入或正在回复时直接返回

    messages.value.push({ role: 'user', content: text });
    input.value = '';
    streaming.value = true;

    unlockPlayer(); // 借这次点击解锁音频播放（之后隔多久都能播）
    stopSpeech(); // 新一轮开始，丢弃上一轮未播完的语音
    const epoch = speechEpoch;

    // 先占一个空气泡，后面按增量往里填
    messages.value.push({ role: 'assistant', content: '' });
    const index = messages.value.length - 1;

    await nextTick();
    scrollToBottom();

    let ok = false; // 只有正常答完才朗读，别把错误提示读出来
    try {
        await streamChat({
            text,
            model: model.value,
            onDelta: (delta) => { // 只追加文字，语音等整条生成完再统一合成
                messages.value[index].content += delta;
                scrollToBottom();
            },
        });
        ok = true;
    } catch (e) {
        // 1005 = 未登录/登录过期：退回登录门（不靠文案判断）
        if (e instanceof ApiError && e.code === 1005) {
            user.value = null;
            return;
        }
        // 其他失败：把空气泡替换成错误提示
        messages.value[index].content = `出错：${e.message}`;
    } finally {
        if (ok && autoSpeak.value) speakWhole(messages.value[index].content, epoch); // 整条合成后再播
        streaming.value = false;
        await nextTick();
        scrollToBottom();
        inputEl.value?.focus(); // 光标回到输入框，方便连续输入
    }
}

async function doLogout() { // 退出：清服务端 session + 清空界面，回到登录门
    await logout();
    user.value = null;
    messages.value = [];
}

onMounted(async () => { // 首次进入：读配置 → 查登录态 → （已登录才）加载历史 → 滚到底 → 聚焦输入框
    const cfg = await fetchConfig();
    maxInputChars.value = cfg.maxInputChars ?? 2000;
    models.value = cfg.models ?? [];
    if (!model.value) model.value = cfg.model ?? '';
    if (!models.value.some((m) => m.id === model.value)) model.value = cfg.model ?? '';

    try {
        user.value = await fetchMe();
    } catch {
        user.value = null; // 查不到登录态就按未登录处理，不阻塞页面
    }
    if (user.value) await loadHistory();
    await nextTick();
    scrollToBottom();
    inputEl.value?.focus();
});
</script>

<style scoped>
.app {
    max-width: 640px;
    height: 100vh;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
}

header {
    padding: 16px 20px;
    border-bottom: 1px solid #262b36;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.account {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 400;
    font-size: 13px;
    color: #8b93a5;
}

.avatar {
    width: 22px;
    height: 22px;
    border-radius: 50%;
}

.link {
    background: none;
    border: none;
    padding: 0;
    color: #4c8dff;
    cursor: pointer;
    font: inherit;
    text-decoration: none;
}

main {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.login {
    align-items: center;
    justify-content: center;
    gap: 14px;
    text-align: center;
}

.login .title {
    margin: 0;
    color: #e6e8ee;
    font-size: 15px;
}

.login .tip {
    margin: 0;
    color: #8b93a5;
    font-size: 12px;
}

.primary {
    display: inline-block;
    padding: 10px 20px;
    border-radius: 10px;
    background: #4c8dff;
    color: #fff;
    text-decoration: none;
    font-size: 14px;
}

.empty {
    color: #8b93a5;
    text-align: center;
    margin-top: 40px;
}

.msg {
    max-width: 80%;
    padding: 10px 14px;
    border-radius: 12px;
    white-space: pre-wrap;
    word-break: break-word;
}

.msg.user {
    align-self: flex-end;
    background: #4c8dff;
    color: #fff;
}

.msg.assistant {
    align-self: flex-start;
    background: #171a21;
    border: 1px solid #262b36;
}

.caret {
    color: #4c8dff;
    animation: blink 1s step-end infinite;
}

@keyframes blink {
    50% {
        opacity: 0;
    }
}

form {
    display: flex;
    gap: 8px;
    padding: 14px 20px 20px;
    border-top: 1px solid #262b36;
}

input {
    flex: 1;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid #262b36;
    background: #171a21;
    color: inherit;
    font: inherit;
    outline: none;
}

input:focus {
    border-color: #4c8dff;
}

button {
    padding: 0 18px;
    border: none;
    border-radius: 10px;
    background: #4c8dff;
    color: #fff;
    font: inherit;
    cursor: pointer;
}

.tts-error {
    color: #e5484d;
    font-size: 12px;
    cursor: help;
}

.model {
    padding: 2px 6px;
    border: 1px solid #d5d9e2;
    border-radius: 6px;
    background: #fff;
    color: #333;
    font-size: 12px;
}

.link.danger {
    color: #e5484d;
}

.link:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.counter {
    align-self: center;
    color: #8b93a5;
    font-size: 12px;
    white-space: nowrap;
}
</style>
