import { getDatabase } from "@/db/database";

export async function getSetting(key: string, fallback: string) {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM app_setting WHERE key = ?", [key]);
  return row?.value ?? fallback;
}

export async function setSetting(key: string, value: string) {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT INTO app_setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value]
  );
}

export async function getNumberSetting(key: string, fallback: number) {
  const value = await getSetting(key, String(fallback));
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
