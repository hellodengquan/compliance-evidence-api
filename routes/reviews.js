const express = require('express');
const { getDb } = require('../db/database');

const router = express.Router();

const VALID_REVIEW_STATUSES = ['pending', 'approved', 'rejected', 'resubmit'];

const STATUS_TRANSITION_MAP = {
  approved: 'approved',
  rejected: 'rejected',
  resubmit: 'submitted'
};

router.post('/', (req, res) => {
  const { evidence_id, reviewer, comment } = req.body;

  if (!evidence_id || !reviewer) {
    return res.status(400).json({ error: 'evidence_id 和 reviewer 为必填项' });
  }

  const db = getDb();
  try {
    const result = db.transaction(() => {
      const evidence = db.prepare('SELECT * FROM evidence WHERE id = ?').get(Number(evidence_id));
      if (!evidence) {
        const err = new Error('关联的证据不存在');
        err.statusCode = 404;
        throw err;
      }

      const pendingReview = db.prepare(
        "SELECT * FROM reviews WHERE evidence_id = ? AND status = 'pending'"
      ).get(Number(evidence_id));
      if (pendingReview) {
        const err = new Error('该证据已有待处理的审核记录，请勿重复发起');
        err.statusCode = 409;
        throw err;
      }

      const insertStmt = db.prepare(
        'INSERT INTO reviews (evidence_id, reviewer, status, comment) VALUES (?, ?, ?, ?)'
      );
      const insertResult = insertStmt.run(Number(evidence_id), reviewer, 'pending', comment || null);

      db.prepare("UPDATE evidence SET status = 'under_review' WHERE id = ?").run(Number(evidence_id));

      const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(insertResult.lastInsertRowid);
      return review;
    })();

    res.status(201).json(result);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ error: err.message || '创建审核记录失败' });
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
    const result = db.transaction(() => {
      const existing = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
      if (!existing) {
        const err = new Error('审核记录不存在');
        err.statusCode = 404;
        throw err;
      }

      if (existing.status !== 'pending') {
        const err = new Error(`审核记录已处于 ${existing.status} 状态，不可再变更`);
        err.statusCode = 400;
        throw err;
      }

      const updateReviewStmt = db.prepare(
        'UPDATE reviews SET status = ?, comment = ?, reviewed_at = datetime(\'now\', \'localtime\') WHERE id = ? AND status = \'pending\''
      );
      const updateResult = updateReviewStmt.run(status, comment || existing.comment, req.params.id);

      if (updateResult.changes === 0) {
        const err = new Error('审核状态已被其他操作变更，请刷新后重试');
        err.statusCode = 409;
        throw err;
      }

      const evidenceStatus = STATUS_TRANSITION_MAP[status] || 'submitted';
      db.prepare('UPDATE evidence SET status = ? WHERE id = ?').run(evidenceStatus, existing.evidence_id);

      const updated = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
      return updated;
    })();

    res.json(result);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ error: err.message || '更新审核状态失败' });
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
