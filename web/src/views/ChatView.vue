<template>
    <div class="app">
        <header>DeepSeek 流式对话</header>

        <main ref="listEl">
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

        <form @submit.prevent="send">
            <input ref="inputEl" v-model="input" placeholder="说点什么…" autocomplete="off" />
            <button :disabled="streaming || !input.trim()">发送</button>
        </form>
    </div>
</template>

<script setup>
import { nextTick, onMounted, ref } from 'vue';
import { fetchMessages, streamChat } from '../api';

const messages = ref([]); // 消息列表：{ role, content }
const input = ref(''); // 输入框内容
const streaming = ref(false); // 是否正在接收流式回复
const listEl = ref(null); // 消息列表 DOM，用于滚动
const inputEl = ref(null); // 输入框 DOM，用于聚焦

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

    // 先占一个空气泡，后面按增量往里填
    messages.value.push({ role: 'assistant', content: '' });
    const index = messages.value.length - 1;

    await nextTick();
    scrollToBottom();

    try {
        await streamChat({
            text,
            onDelta: (delta) => { // 每收到一段增量就追加并滚动
                messages.value[index].content += delta;
                scrollToBottom();
            },
        });
    } catch (e) {
        // 失败时把空气泡替换成错误提示，不额外插入新气泡
        messages.value[index].content = `出错：${e.message}`;
    } finally {
        streaming.value = false;
        await nextTick();
        scrollToBottom();
        inputEl.value?.focus(); // 光标回到输入框，方便连续输入
    }
}

onMounted(async () => { // 首次进入：加载历史 → 滚到底 → 聚焦输入框
    await loadHistory();
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
}

main {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
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

button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}
</style>
