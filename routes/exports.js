const express = require('express');
const { getDb } = require('../db/database');

const router = express.Router();

router.get('/audit-season', (req, res) => {
  const db = getDb();
  try {
    const seasons = db.prepare(
      'SELECT DISTINCT audit_season FROM controls ORDER BY audit_season DESC'
    ).all();
    res.json(seasons.map(s => s.audit_season));
  } catch (err) {
    res.status(500).json({ error: '查询审计季列表失败' });
  }
});

router.get('/summary', (req, res) => {
  const { audit_season, status } = req.query;

  if (!audit_season) {
    return res.status(400).json({ error: 'audit_season 为必填项' });
  }

  const db = getDb();
  try {
    let sql = `
      SELECT
        c.id AS control_id,
        c.code AS control_code,
        c.title AS control_title,
        c.category,
        c.owner AS control_owner,
        e.id AS evidence_id,
        e.submitter,
        e.description AS evidence_description,
        e.file_name,
        e.status AS evidence_status,
        e.created_at AS evidence_created_at,
        r.id AS review_id,
        r.reviewer,
        r.status AS review_status,
        r.comment AS review_comment,
        r.reviewed_at
      FROM controls c
      LEFT JOIN evidence e ON e.control_id = c.id
      LEFT JOIN reviews r ON r.evidence_id = e.id
      WHERE c.audit_season = ?
    `;
    const params = [audit_season];

    if (status) {
      sql += ' AND e.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY c.code ASC, e.created_at ASC, r.reviewed_at ASC';

    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: '查询审核汇总失败' });
  }
});

router.get('/csv', (req, res) => {
  const { audit_season, status } = req.query;

  if (!audit_season) {
    return res.status(400).json({ error: 'audit_season 为必填项' });
  }

  const db = getDb();
  try {
    let sql = `
      SELECT
        c.code,
        c.title,
        c.category,
        c.owner,
        e.submitter,
        e.description,
        e.file_name,
        e.status,
        e.created_at,
        r.reviewer,
        r.status AS review_status,
        r.comment,
        r.reviewed_at
      FROM controls c
      LEFT JOIN evidence e ON e.control_id = c.id
      LEFT JOIN reviews r ON r.evidence_id = e.id
      WHERE c.audit_season = ?
    `;
    const params = [audit_season];

    if (status) {
      sql += ' AND e.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY c.code ASC, e.created_at ASC';

    const rows = db.prepare(sql).all(...params);

    const headers = [
      '控制项编号', '控制项名称', '分类', '责任人',
      '提交人', '证据描述', '附件名称', '证据状态', '证据提交时间',
      '审核人', '审核状态', '审核意见', '审核时间'
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvLines = [headers.map(escapeCsv).join(',')];
    for (const row of rows) {
      csvLines.push([
        row.code, row.title, row.category, row.owner,
        row.submitter, row.description, row.file_name, row.status, row.created_at,
        row.reviewer, row.review_status, row.comment, row.reviewed_at
      ].map(escapeCsv).join(','));
    }

    const csvContent = '\uFEFF' + csvLines.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="audit_report_${audit_season}.csv"`
    );
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ error: '导出审核列表失败' });
  }
});

router.get('/statistics', (req, res) => {
  const { audit_season } = req.query;

  if (!audit_season) {
    return res.status(400).json({ error: 'audit_season 为必填项' });
  }

  const db = getDb();
  try {
    const totalControls = db.prepare(
      'SELECT COUNT(*) AS count FROM controls WHERE audit_season = ?'
    ).get(audit_season).count;

    const evidenceStats = db.prepare(`
      SELECT
        COUNT(*) AS total_evidence,
        SUM(CASE WHEN e.status = 'submitted' THEN 1 ELSE 0 END) AS submitted,
        SUM(CASE WHEN e.status = 'under_review' THEN 1 ELSE 0 END) AS under_review,
        SUM(CASE WHEN e.status = 'approved' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN e.status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
        SUM(CASE WHEN e.status = 'resubmit' THEN 1 ELSE 0 END) AS resubmit
      FROM evidence e
      JOIN controls c ON e.control_id = c.id
      WHERE c.audit_season = ?
    `).get(audit_season);

    const controlsWithEvidence = db.prepare(`
      SELECT COUNT(DISTINCT c.id) AS count
      FROM controls c
      JOIN evidence e ON e.control_id = c.id
      WHERE c.audit_season = ?
    `).get(audit_season).count;

    res.json({
      audit_season,
      total_controls: totalControls,
      controls_with_evidence: controlsWithEvidence,
      controls_without_evidence: totalControls - controlsWithEvidence,
      evidence: evidenceStats
    });
  } catch (err) {
    res.status(500).json({ error: '查询统计数据失败' });
  }
});

module.exports = router;
