// 数据层：现在是内存数组，将来换成 SQLite 只改这个文件。
// 单用户 demo，重启就清空。

const messages = [];

export function listMessages() {
  return messages;
}

/** 一问一答成对写入，保证不会出现"有问无答" */
export function appendExchange(userText, assistantText) {
  messages.push({ role: 'user', content: userText });
  messages.push({ role: 'assistant', content: assistantText });
}
