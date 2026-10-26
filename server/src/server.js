import app from './app.js';

const PORT = Number(process.env.PORT || 3100);

const server = app.listen(PORT, () => {
  console.log(`后端已启动： http://localhost:${PORT}`);
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 被占用。换一个：PORT=3200 npm start`);
    process.exit(1);
  }
  throw e;
});
