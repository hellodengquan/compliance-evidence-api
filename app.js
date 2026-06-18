const express = require('express');
const session = require('express-session');
const SqliteStoreFactory = require('better-sqlite3-session-store');
const { initDatabase } = require('./db/init');
const { getDb, closeDb } = require('./db/database');
const controlsRouter = require('./routes/controls');
const evidenceRouter = require('./routes/evidence');
const reviewsRouter = require('./routes/reviews');
const exportsRouter = require('./routes/exports');
const authRouter = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'compliance-evidence-secret-change-in-prod';

initDatabase();

const SqliteStore = SqliteStoreFactory(session);
const sessionStore = new SqliteStore({
  client: getDb(),
  expired: {
    clear: true,
    intervalMs: 900000
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: sessionStore,
  name: 'compliance.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'strict'
  }
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use('/api/auth', authRouter);
app.use('/api/controls', controlsRouter);
app.use('/api/evidence', evidenceRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/exports', exportsRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, _next) => {
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: '文件大小超出限制（最大 50MB）' });
    }
    return res.status(400).json({ error: `文件上传错误: ${err.message}` });
  }
  console.error(err.stack);
  res.status(500).json({ error: '服务器内部错误' });
});

app.use((req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

const server = app.listen(PORT, () => {
  console.log(`合规证据归集系统已启动: http://localhost:${PORT}`);
  console.log(`Session 存储: SQLite (持久化)`);
  console.log(`Cookie SameSite: Strict`);
});

process.on('SIGINT', () => {
  console.log('\n正在关闭服务...');
  server.close(() => {
    closeDb();
    console.log('服务已关闭');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  server.close(() => {
    closeDb();
    process.exit(0);
  });
});

module.exports = app;
