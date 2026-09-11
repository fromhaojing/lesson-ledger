
CREATE TABLE IF NOT EXISTS import_batch (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  source_uri TEXT,
  imported_at TEXT NOT NULL,
  total_rows INTEGER DEFAULT 0,
  success_rows INTEGER DEFAULT 0,
  failed_rows INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS lesson (
  id TEXT PRIMARY KEY,
  import_batch_id TEXT,
  title TEXT NOT NULL,
  student_names TEXT NOT NULL,
  date_text TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  grade TEXT,
  course_type TEXT,
  default_amount REAL DEFAULT 0,
  final_amount REAL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  notification_id TEXT,
  notification_scheduled_at TEXT,
  confirmed_at TEXT,
  cancelled_at TEXT,
  note TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (import_batch_id) REFERENCES import_batch(id)
);

CREATE TABLE IF NOT EXISTS app_setting (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lesson_date_text ON lesson(date_text);
CREATE INDEX IF NOT EXISTS idx_lesson_start_at ON lesson(start_at);
CREATE INDEX IF NOT EXISTS idx_lesson_status ON lesson(status);
CREATE INDEX IF NOT EXISTS idx_lesson_import_batch_id ON lesson(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_lesson_title ON lesson(title);
CREATE INDEX IF NOT EXISTS idx_lesson_student_names ON lesson(student_names);
