<script setup>
import { nextTick, onMounted, ref } from 'vue';

const messages = ref([]);
const input = ref('');
const busy = ref(false);
const listEl = ref(null);

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
  }
}

onMounted(async () => {
  await loadHistory();
  await nextTick();
  scrollToBottom();
});
</script>

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
      <input v-model="input" placeholder="说点什么…" autocomplete="off" :disabled="busy" />
      <button :disabled="busy || !input.trim()">发送</button>
    </form>
  </div>
</template>
