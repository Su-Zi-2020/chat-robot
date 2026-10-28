# 上下文装配与滚动摘要

两个独立功能：**装配（读）** 和 **压缩（写）**。
实现：`server/src/services/context.js`、`server/src/services/tokens.js`。

## 参数

参数集中在 `server/src/config/context.js`，全部支持环境变量覆盖。

| 配置项 | 环境变量 | 默认值 | 含义 |
|---|---|---|---|
| `maxInputTokens` | `MAX_INPUT_TOKENS` | **24000** | 每次请求输入上限（token） |
| `recentMessages` | `RECENT_MESSAGES` | **24** | 压缩时保留原文的条数（不参与摘要） |
| `compactTriggerTokens` | `COMPACT_TRIGGER_TOKENS` | **18000** | 未摘要历史超过它就压缩 |
| `summaryMaxTokens` | `SUMMARY_MAX_TOKENS` | **800** | 摘要输出上限 |
| `minCompactGapMessages` | `MIN_COMPACT_GAP` | **24** | 两次压缩至少间隔多少条消息 |
| `maxMessageChars` | `MAX_MESSAGE_CHARS` | **2000** | 单条历史消息字符上限 |

**关键不变量**：

```
maxInputTokens > compactTriggerTokens + summaryMaxTokens + 保留区
24000          > 18000              + 800              + ~1440      ✅
```

启动时会校验这个不变量，破坏时打警告（否则会出现"未摘要就被裁掉"的消息）。

容量参考：24000 token ≈ 3.6 万汉字 ≈ 240 轮短对话。

## 消息顺序

```
[system]   角色卡：人设 + 示例        ← 常驻
[system]   摘要（更早的对话）          ← 有摘要时
[user/assistant] 最近原文
[system]   末尾复述（tail_prompt）     ← 常驻，放在最后防稀释
```

角色卡内容来自单例表 `persona`（`services/persona.js`，进程内缓存，保存后失效）。
完整人设文件在 `server/persona/`（SOUL.md + SKILL.md），由 `config.personaFullText` 控制是否全文注入。

## 装配 `buildContext(userId)`

```
1. 读 conversation_state：summary、summary_until_id
2. 取 id > summary_until_id 的【全部】原文（按 id 升序）
3. 拼装：摘要（system）→ 原文
4. 若总 token > maxInputTokens：从最老的问答开始成对丢弃，直到不超预算
```

**注意**：第 2 步必须取"全部"，不能只取最后 N 条——否则 `until_id` 和窗口之间会
出现"既没进摘要、也没发给模型"的空洞（实测踩过）。

返回的消息数组**不含**人设 system 和本轮输入（由调用方追加）。

## 压缩 `compactIfNeeded(userId)`

异步、幂等，失败只记日志。

```
1. 取保留区（最近 recentMessages 条）之外的历史
2. 保留区不够满 → 返回 false
3. 历史条数 < minCompactGapMessages → 返回 false
4. 历史 token < compactTriggerTokens → 返回 false
5. 调模型：已有摘要 + 新增对话 → 新摘要（≤ summaryMaxTokens）
6. 写 conversation_state：summary、summary_until_id = 保留区最小 id - 1
```

触发点是**回复发出之后**（`chat` 路由的 `finally` 之后），不阻塞用户。

## 摘要提示词要点

- 只保留以后有用的：事实、偏好、进行中的事、情绪、边界
- 不复述过程、不评价、不加标题
- 同一件事以最新说法为准
- **不改写角色的人格设定**，只记录对话内容和用户信息
- 不超过 300 字

## token 估算

不做精确 tokenizer，按比例粗估（误差 ±20%）：

```js
cjk 汉字 / 1.5 + 其他字符 / 4 + 每条 4 token 开销
```

够用：只用于"是否压缩"和"是否裁剪"的判断。

## 已验证

- 60 条消息（30 轮）→ 装配出 12 条、约 216 token（预算内直接返回）
- 调低触发阈值后压缩 → 摘要 22 token，覆盖到 id=112
- 再次调用返回 false（幂等）
