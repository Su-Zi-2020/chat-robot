// 临时存储：内存数组，和接口放一起。
// 后面接 SQLite 时，这个文件整个删掉，改由 dao/ 提供数据访问。
// 现在留着单独一个文件，只是因为 chat 和 messages 两个接口都要用它。

const messages = [];

export function listMessages() {
  return messages;
}

/** 一问一答成对写入，保证不会出现"有问无答" */
export function appendExchange(userText, assistantText) {
  messages.push({ role: 'user', content: userText });
  messages.push({ role: 'assistant', content: assistantText });
}
