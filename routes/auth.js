const express = require('express');

const router = express.Router();

const USERS = [
  { username: '王五', role: 'reviewer' },
  { username: '赵六', role: 'reviewer' },
  { username: 'admin', role: 'admin' },
  { username: '张三', role: 'owner' }
];

router.post('/login', (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: 'username 为必填项' });
  }

  const user = USERS.find(u => u.username === username);
  if (!user) {
    return res.status(404).json({ error: `用户 ${username} 不存在` });
  }

  req.session.user = { username: user.username, role: user.role };
  res.json({ message: '登录成功', user: req.session.user });
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: '登出失败' });
    }
    res.json({ message: '已登出' });
  });
});

router.get('/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: '未登录' });
  }
  res.json({ user: req.session.user });
});

module.exports = router;
