const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db/database');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    cb(null, `${base}_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

const VALID_STATUSES = ['submitted', 'under_review', 'approved', 'rejected', 'resubmit'];

router.post('/', upload.single('file'), (req, res) => {
  const { control_id, submitter, description } = req.body;

  if (!control_id || !submitter) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'control_id 和 submitter 为必填项' });
  }

  const db = getDb();
  try {
    const control = db.prepare('SELECT * FROM controls WHERE id = ?').get(Number(control_id));
    if (!control) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: '关联的控制项不存在' });
    }

    const filePath = req.file ? req.file.path : null;
    const fileName = req.file ? req.file.originalname : null;

    const stmt = db.prepare(
      'INSERT INTO evidence (control_id, submitter, description, file_path, file_name, status) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(
      Number(control_id),
      submitter,
      description || null,
      filePath,
      fileName,
      'submitted'
    );

    const evidence = db.prepare('SELECT * FROM evidence WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(evidence);
  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: '提交证据失败' });
  }
});

router.get('/', (req, res) => {
  const { control_id, submitter, status } = req.query;
  const db = getDb();

  let sql = 'SELECT * FROM evidence WHERE 1=1';
  const params = [];

  if (control_id) {
    sql += ' AND control_id = ?';
    params.push(Number(control_id));
  }
  if (submitter) {
    sql += ' AND submitter = ?';
    params.push(submitter);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  sql += ' ORDER BY created_at DESC';

  try {
    const list = db.prepare(sql).all(...params);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: '查询证据失败' });
  }
});

router.get('/:id', (req, res) => {
  const db = getDb();
  try {
    const evidence = db.prepare('SELECT * FROM evidence WHERE id = ?').get(req.params.id);
    if (!evidence) {
      return res.status(404).json({ error: '证据不存在' });
    }
    res.json(evidence);
  } catch (err) {
    res.status(500).json({ error: '查询证据失败' });
  }
});

router.put('/:id/status', (req, res) => {
  const { status } = req.body;

  if (!status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `状态必须为: ${VALID_STATUSES.join(', ')}` });
  }

  const db = getDb();
  try {
    const existing = db.prepare('SELECT * FROM evidence WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: '证据不存在' });
    }

    db.prepare('UPDATE evidence SET status = ? WHERE id = ?').run(status, req.params.id);
    const updated = db.prepare('SELECT * FROM evidence WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: '更新证据状态失败' });
  }
});

router.get('/:id/download', (req, res) => {
  const db = getDb();
  try {
    const evidence = db.prepare('SELECT * FROM evidence WHERE id = ?').get(req.params.id);
    if (!evidence) {
      return res.status(404).json({ error: '证据不存在' });
    }
    if (!evidence.file_path) {
      return res.status(404).json({ error: '该证据无附件' });
    }

    const filePath = path.resolve(evidence.file_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' });
    }

    res.download(filePath, evidence.file_name || path.basename(filePath));
  } catch (err) {
    res.status(500).json({ error: '下载证据文件失败' });
  }
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  try {
    const evidence = db.prepare('SELECT * FROM evidence WHERE id = ?').get(req.params.id);
    if (!evidence) {
      return res.status(404).json({ error: '证据不存在' });
    }

    if (evidence.file_path && fs.existsSync(evidence.file_path)) {
      fs.unlinkSync(evidence.file_path);
    }

    db.prepare('DELETE FROM evidence WHERE id = ?').run(req.params.id);
    res.json({ message: '证据已删除' });
  } catch (err) {
    res.status(500).json({ error: '删除证据失败' });
  }
});

module.exports = router;
