// 业务层：生成回复。
// 现在是假回复；接真实模型时，只改这个文件。

export function generateReply(text) {
  return `我收到了：「${text}」。这是一个占位回复，还没有接入真实模型。`;
}
