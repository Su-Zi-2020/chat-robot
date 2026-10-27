// 进程入口：监听端口 + 友好的端口占用提示。

import app from './app.js';
import sessionsDAO from './dao/sessions.dao.js';

const PORT = Number(process.env.PORT || 3100);

const server = app.listen(PORT, () => {
    console.log(`后端已启动： http://localhost:${PORT}`);

    // 清理过期 session：启动时一次，之后每小时一次
    const cleanup = () => {
        try {
            sessionsDAO.removeExpired();
        } catch (e) {
            console.error('[sessions] 清理失败:', e.message);
        }
    };
    cleanup();
    setInterval(cleanup, 3600 * 1000).unref(); // unref：不阻止进程正常退出
});

server.on('error', (e) => { // 端口被占用时给出可操作的提示，而不是抛一堆栈
    if (e.code === 'EADDRINUSE') {
        console.error(`端口 ${PORT} 被占用。换一个：PORT=3200 npm start`);
        process.exit(1);
    }
    throw e;
});
