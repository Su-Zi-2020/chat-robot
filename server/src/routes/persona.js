// POST /api/persona      读取当前角色（单例，公开信息）
// POST /api/persona/save 修改角色（需登录）

import { Router } from 'express';
import { success, fail, CODE } from '../http.js';
import { getPersona, savePersona } from '../services/persona.js';
import { requireUser } from '../middleware/auth.js';

const LIMITS = {
    name: 20,
    prompt: 1000,
    tailPrompt: 120,
    avatar: 8,
    examples: 5,
    example: 100,
};

const router = Router();

router.post('/', (_req, res) => {
    success(res, { persona: getPersona() });
});

router.post('/save', requireUser, (req, res) => {
    const { name, avatar, prompt, examples, tailPrompt } = req.body ?? {};

    if (typeof name !== 'string' || !name.trim() || [...name.trim()].length > LIMITS.name) {
        return fail(res, 400, CODE.BAD_PARAM, `name 必填，且不超过 ${LIMITS.name} 字`);
    }
    if (typeof prompt !== 'string' || !prompt.trim() || [...prompt.trim()].length > LIMITS.prompt) {
        return fail(res, 400, CODE.BAD_PARAM, `prompt 必填，且不超过 ${LIMITS.prompt} 字`);
    }
    if (tailPrompt !== undefined && (typeof tailPrompt !== 'string' || [...tailPrompt].length > LIMITS.tailPrompt)) {
        return fail(res, 400, CODE.BAD_PARAM, `tailPrompt 不超过 ${LIMITS.tailPrompt} 字`);
    }
    if (avatar !== undefined && (typeof avatar !== 'string' || [...avatar].length > LIMITS.avatar)) {
        return fail(res, 400, CODE.BAD_PARAM, `avatar 不超过 ${LIMITS.avatar} 个字符`);
    }

    let pairs = [];
    if (examples !== undefined) {
        if (!Array.isArray(examples) || examples.length > LIMITS.examples) {
            return fail(res, 400, CODE.BAD_PARAM, `examples 是最多 ${LIMITS.examples} 组的数组`);
        }
        for (const pair of examples) {
            if (!Array.isArray(pair) || pair.length !== 2 || pair.some((s) => typeof s !== 'string' || !s.trim())) {
                return fail(res, 400, CODE.BAD_PARAM, 'examples 每一项必须是 [用户说的, 角色说的] 两个非空字符串');
            }
            if (pair.some((s) => [...s].length > LIMITS.example)) {
                return fail(res, 400, CODE.BAD_PARAM, `每条示例不超过 ${LIMITS.example} 字`);
            }
            pairs.push(pair.map((s) => s.trim()));
        }
    }

    const persona = savePersona({
        name: name.trim(),
        avatar: avatar ?? '',
        prompt: prompt.trim(),
        examples: pairs,
        tailPrompt: (tailPrompt ?? '').trim(),
    });
    success(res, { persona });
});

export default router;
