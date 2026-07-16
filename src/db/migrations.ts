import { getDatabase } from "@/db/database";

type Database = Awaited<ReturnType<typeof getDatabase>>;

type Migration = {
  version: number;
  up: (db: Database) => Promise<void>;
};

const migrationTableSchema = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
`;

const initialSchema = `
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
`;

export const defaultSettings = [
  ["remind_before_minutes", "5"],
  ["remind_timing", "before"],
  ["notifications_enabled", "true"],
  ["notification_schedule_days", "14"],
  ["notification_schedule_limit", "50"],
  ["currency", "CNY"],
  ["default_amount", "150"],
  ["theme_mode", "unspecified"],
  ["theme_color", "mint"]
] as const;

const migrations: Migration[] = [
  {
    version: 1,
    async up(db) {
      await db.execAsync(initialSchema);
      await seedDefaultSettings(db);
    }
  },
  {
    version: 2,
    async up(db) {
      const now = new Date().toISOString();
      await db.runAsync(
        `UPDATE lesson
         SET status = 'cancelled',
             final_amount = 0,
             cancelled_at = COALESCE(cancelled_at, updated_at, created_at, ?),
             updated_at = ?
         WHERE status = 'absent'`,
        [now, now]
      );
    }
  },
  {
    version: 3,
    async up(db) {
      await db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_lesson_title ON lesson(title);
        CREATE INDEX IF NOT EXISTS idx_lesson_student_names ON lesson(student_names);
      `);
    }
  }
];

export async function runMigrations() {
  const db = await getDatabase();
  await db.execAsync(migrationTableSchema);

  const appliedVersions = await getAppliedMigrationVersions(db);
  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue;

    await db.withTransactionAsync(async () => {
      await migration.up(db);
      await db.runAsync("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", [
        migration.version,
        new Date().toISOString()
      ]);
    });
  }

  await seedDefaultSettings(db);
}

async function getAppliedMigrationVersions(db: Database) {
  const rows = await db.getAllAsync<{ version: number }>("SELECT version FROM schema_migrations");
  return new Set(rows.map((row) => row.version));
}

async function seedDefaultSettings(db: Database) {
  for (const [key, value] of defaultSettings) {
    await db.runAsync("INSERT OR IGNORE INTO app_setting (key, value) VALUES (?, ?)", [key, value]);
  }
}
