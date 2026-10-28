# 角色设定源文件

这两个文件来自社区项目 [colourfulmaster/milkgreen-skill](https://github.com/colourfulmaster/milkgreen-skill)
（CC-BY-NC-4.0，非官方、禁止商用），是本项目角色的**源文件**，不直接进入模型上下文。

- `SOUL.md`：人格定义（内核 / 我绝不 / 事实）
- `SKILL.md`：互动技能（声音模式 / 7 维分流 / 决策原则）

运行时的 `persona` 表存的是从这里**提炼出的常驻版本**（约 550 token）。
改动设定时：先改这里 → 再同步 `persona` 表 → 重启服务。

未进入常驻的部分（8 种声音模式细则、下头梗识别等）留给后续的按需注入（世界书）。
