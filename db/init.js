const { getDb } = require('./database');

const CREATE_CONTROLS = `
CREATE TABLE IF NOT EXISTS controls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  owner TEXT NOT NULL,
  audit_season TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);
`;

const CREATE_EVIDENCE = `
CREATE TABLE IF NOT EXISTS evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  control_id INTEGER NOT NULL,
  submitter TEXT NOT NULL,
  description TEXT,
  file_path TEXT,
  file_name TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (control_id) REFERENCES controls(id) ON DELETE CASCADE
);
`;

const CREATE_REVIEWS = `
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evidence_id INTEGER NOT NULL,
  reviewer TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  comment TEXT,
  reviewed_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (evidence_id) REFERENCES evidence(id) ON DELETE CASCADE
);
`;

const CREATE_IDX_EVIDENCE_CONTROL = `
CREATE INDEX IF NOT EXISTS idx_evidence_control_id ON evidence(control_id);
`;

const CREATE_IDX_REVIEWS_EVIDENCE = `
CREATE INDEX IF NOT EXISTS idx_reviews_evidence_id ON reviews(evidence_id);
`;

const CREATE_IDX_CONTROLS_SEASON = `
CREATE INDEX IF NOT EXISTS idx_controls_audit_season ON controls(audit_season);
`;

const CREATE_IDX_EVIDENCE_STATUS = `
CREATE INDEX IF NOT EXISTS idx_evidence_status ON evidence(status);
`;

const TRIGGER_EVIDENCE_UPDATE = `
CREATE TRIGGER IF NOT EXISTS trg_evidence_updated
AFTER UPDATE ON evidence
BEGIN
  UPDATE evidence SET updated_at = datetime('now', 'localtime') WHERE id = NEW.id;
END;
`;

const TRIGGER_CONTROL_UPDATE = `
CREATE TRIGGER IF NOT EXISTS trg_control_updated
AFTER UPDATE ON controls
BEGIN
  UPDATE controls SET updated_at = datetime('now', 'localtime') WHERE id = NEW.id;
END;
`;

function initDatabase() {
  const db = getDb();

  db.exec(CREATE_CONTROLS);
  db.exec(CREATE_EVIDENCE);
  db.exec(CREATE_REVIEWS);
  db.exec(CREATE_IDX_EVIDENCE_CONTROL);
  db.exec(CREATE_IDX_REVIEWS_EVIDENCE);
  db.exec(CREATE_IDX_CONTROLS_SEASON);
  db.exec(CREATE_IDX_EVIDENCE_STATUS);
  db.exec(TRIGGER_EVIDENCE_UPDATE);
  db.exec(TRIGGER_CONTROL_UPDATE);

  console.log('数据库初始化完成');
}

if (require.main === module) {
  initDatabase();
  console.log('可直接运行 npm run init-db 初始化数据库');
}

module.exports = { initDatabase };
