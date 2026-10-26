
<template>
  <div class="app">
    <header>最简对话 demo（无模型 · 无流式）</header>

    <main ref="listEl">
      <p v-if="!messages.length" class="empty">说点什么，后端会原样回显。</p>
      <div
        v-for="(m, i) in messages"
        :key="i"
        class="msg"
        :class="m.role"
      >{{ m.content }}</div>
    </main>

    <form @submit.prevent="send">
      <input
        ref="inputEl"
        v-model="input"
        placeholder="说点什么…"
        autocomplete="off"
      />
      <button :disabled="busy || !input.trim()">发送</button>
    </form>
  </div>
</template>

<script setup>
import { nextTick, onMounted, ref } from 'vue';

const messages = ref([]);
const input = ref('');
const busy = ref(false);
const listEl = ref(null);
const inputEl = ref(null);

function scrollToBottom() {
  const el = listEl.value;
  if (el) el.scrollTop = el.scrollHeight;
}

async function loadHistory() {
  try {
    const res = await fetch('/api/messages');
    const data = await res.json();
    messages.value = data.messages ?? [];
  } catch {
    // 后端没起来时静默失败，页面上直接发消息会报错提示
  }
}

async function send() {
  const text = input.value.trim();
  if (!text || busy.value) return;

  messages.value.push({ role: 'user', content: text });
  input.value = '';
  busy.value = true;
  await nextTick();
  scrollToBottom();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '请求失败');
    messages.value.push({ role: 'assistant', content: data.reply });
  } catch (e) {
    messages.value.push({ role: 'assistant', content: `出错：${e.message}` });
  } finally {
    busy.value = false;
    await nextTick();
    scrollToBottom();
    inputEl.value?.focus();   // 光标回到输入框，可以接着打
  }
}

onMounted(async () => {
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

.empty { color: #8b93a5; text-align: center; margin-top: 40px; }

.msg {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}
.msg.user { align-self: flex-end; background: #4c8dff; color: #fff; }
.msg.assistant { align-self: flex-start; background: #171a21; border: 1px solid #262b36; }

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
input:focus { border-color: #4c8dff; }

button {
  padding: 0 18px;
  border: none;
  border-radius: 10px;
  background: #4c8dff;
  color: #fff;
  font: inherit;
  cursor: pointer;
}
button:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
