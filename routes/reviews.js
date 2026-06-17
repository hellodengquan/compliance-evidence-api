const express = require('express');
const { getDb } = require('../db/database');

const router = express.Router();

const VALID_REVIEW_STATUSES = ['pending', 'approved', 'rejected', 'resubmit'];

const STATUS_TRANSITION_MAP = {
  approved: 'approved',
  rejected: 'rejected',
  resubmit: 'resubmit'
};

router.post('/', (req, res) => {
  const { evidence_id, reviewer, comment } = req.body;

  if (!evidence_id || !reviewer) {
    return res.status(400).json({ error: 'evidence_id 和 reviewer 为必填项' });
  }

  const db = getDb();
  try {
    const evidence = db.prepare('SELECT * FROM evidence WHERE id = ?').get(Number(evidence_id));
    if (!evidence) {
      return res.status(404).json({ error: '关联的证据不存在' });
    }

    const stmt = db.prepare(
      'INSERT INTO reviews (evidence_id, reviewer, status, comment) VALUES (?, ?, ?, ?)'
    );
    const result = stmt.run(Number(evidence_id), reviewer, 'pending', comment || null);

    db.prepare("UPDATE evidence SET status = 'under_review' WHERE id = ?").run(Number(evidence_id));

    const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(review);
  } catch (err) {
    res.status(500).json({ error: '创建审核记录失败' });
  }
});

router.get('/', (req, res) => {
  const { evidence_id, reviewer, status } = req.query;
  const db = getDb();

  let sql = 'SELECT * FROM reviews WHERE 1=1';
  const params = [];

  if (evidence_id) {
    sql += ' AND evidence_id = ?';
    params.push(Number(evidence_id));
  }
  if (reviewer) {
    sql += ' AND reviewer = ?';
    params.push(reviewer);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  sql += ' ORDER BY reviewed_at DESC';

  try {
    const list = db.prepare(sql).all(...params);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: '查询审核记录失败' });
  }
});

router.get('/:id', (req, res) => {
  const db = getDb();
  try {
    const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
    if (!review) {
      return res.status(404).json({ error: '审核记录不存在' });
    }
    res.json(review);
  } catch (err) {
    res.status(500).json({ error: '查询审核记录失败' });
  }
});

router.put('/:id/status', (req, res) => {
  const { status, comment } = req.body;

  if (!status || !VALID_REVIEW_STATUSES.includes(status)) {
    return res.status(400).json({ error: `审核状态必须为: ${VALID_REVIEW_STATUSES.join(', ')}` });
  }

  if (status === 'pending') {
    return res.status(400).json({ error: '不能将审核状态重置为 pending' });
  }

  const db = getDb();
  try {
    const existing = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: '审核记录不存在' });
    }

    if (existing.status !== 'pending') {
      return res.status(400).json({ error: `审核记录已处于 ${existing.status} 状态，不可再变更` });
    }

    const updateReview = db.prepare(
      'UPDATE reviews SET status = ?, comment = ? WHERE id = ?'
    );
    updateReview.run(status, comment || existing.comment, req.params.id);

    const evidenceStatus = STATUS_TRANSITION_MAP[status] || 'submitted';
    db.prepare('UPDATE evidence SET status = ? WHERE id = ?').run(evidenceStatus, existing.evidence_id);

    const updated = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: '更新审核状态失败' });
  }
});

router.get('/evidence/:evidenceId/history', (req, res) => {
  const db = getDb();
  try {
    const evidence = db.prepare('SELECT * FROM evidence WHERE id = ?').get(req.params.evidenceId);
    if (!evidence) {
      return res.status(404).json({ error: '证据不存在' });
    }

    const history = db.prepare(
      'SELECT * FROM reviews WHERE evidence_id = ? ORDER BY reviewed_at ASC'
    ).all(req.params.evidenceId);

    res.json(history);
  } catch (err) {
    res.status(500).json({ error: '查询审核历史失败' });
  }
});

module.exports = router;
