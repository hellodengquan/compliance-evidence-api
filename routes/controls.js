const express = require('express');
const { getDb } = require('../db/database');

const router = express.Router();

router.post('/', (req, res) => {
  const { code, title, description, category, owner, audit_season } = req.body;

  if (!code || !title || !owner || !audit_season) {
    return res.status(400).json({ error: 'code, title, owner, audit_season 为必填项' });
  }

  const db = getDb();
  try {
    const stmt = db.prepare(
      'INSERT INTO controls (code, title, description, category, owner, audit_season) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(code, title, description || null, category || null, owner, audit_season);
    const control = db.prepare('SELECT * FROM controls WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(control);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: `控制项编号 ${code} 已存在` });
    }
    res.status(500).json({ error: '创建控制项失败' });
  }
});

router.get('/', (req, res) => {
  const { audit_season, category, owner } = req.query;
  const db = getDb();

  let sql = 'SELECT * FROM controls WHERE 1=1';
  const params = [];

  if (audit_season) {
    sql += ' AND audit_season = ?';
    params.push(audit_season);
  }
  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (owner) {
    sql += ' AND owner = ?';
    params.push(owner);
  }

  sql += ' ORDER BY code ASC';

  try {
    const controls = db.prepare(sql).all(...params);
    res.json(controls);
  } catch (err) {
    res.status(500).json({ error: '查询控制项失败' });
  }
});

router.get('/:id', (req, res) => {
  const db = getDb();
  try {
    const control = db.prepare('SELECT * FROM controls WHERE id = ?').get(req.params.id);
    if (!control) {
      return res.status(404).json({ error: '控制项不存在' });
    }
    res.json(control);
  } catch (err) {
    res.status(500).json({ error: '查询控制项失败' });
  }
});

router.put('/:id', (req, res) => {
  const { code, title, description, category, owner, audit_season } = req.body;
  const db = getDb();

  try {
    const existing = db.prepare('SELECT * FROM controls WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: '控制项不存在' });
    }

    const stmt = db.prepare(
      `UPDATE controls SET code = ?, title = ?, description = ?, category = ?, owner = ?, audit_season = ?
       WHERE id = ?`
    );
    stmt.run(
      code || existing.code,
      title || existing.title,
      description !== undefined ? description : existing.description,
      category !== undefined ? category : existing.category,
      owner || existing.owner,
      audit_season || existing.audit_season,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM controls WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: `控制项编号 ${code} 已存在` });
    }
    res.status(500).json({ error: '更新控制项失败' });
  }
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  try {
    const result = db.prepare('DELETE FROM controls WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: '控制项不存在' });
    }
    res.json({ message: '控制项已删除' });
  } catch (err) {
    res.status(500).json({ error: '删除控制项失败' });
  }
});

module.exports = router;
