/**
 * Shaxta turniketlari (IN-MINE-1, OUT-MINE-1) uchun takroriy access_logs qatorlarini olib tashlaydi:
 * bir xil device_id + event_type + face_id_hash (bo'sh bo'lsa — person_name) va ~45 s vaqt segmentida
 * faqat eng yangi (eng katta id) qator qoldiriladi.
 *
 * Ishlash (backend papkasida):
 *   npx ts-node scripts/clean-mine-turnstile-duplicate-logs.ts
 *
 * Boshqa SQLite yo'li:
 *   set SQLITE_DATABASE=C:\path\to\database.sqlite && npx ts-node scripts/clean-mine-turnstile-duplicate-logs.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import * as sqlite3 from 'sqlite3';

const WINDOW_SEC = Math.max(
  15,
  Number.parseInt(process.env.HIKVISION_MINE_DEDUPE_CLEAN_WINDOW_SEC ?? '45', 10) || 45,
);

function resolveDbPath(): string {
  const fromEnv = (process.env.SQLITE_DATABASE ?? process.env.DB_PATH ?? '').trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const backendRoot = path.join(__dirname, '..');
  const defaultSqlite = path.join(backendRoot, 'database.sqlite');
  if (fs.existsSync(defaultSqlite)) return defaultSqlite;
  throw new Error(
    `SQLite fayl topilmadi. SQLITE_DATABASE yoki DB_PATH o'rnating yoki ${defaultSqlite} mavjudligini tekshiring.`,
  );
}

async function main(): Promise<void> {
  const dbPath = resolveDbPath();
  const db = new sqlite3.Database(dbPath);

  const run = (sql: string) =>
    new Promise<number>((resolve, reject) => {
      db.run(sql, function onRun(this: sqlite3.RunResult, err: Error | null) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });

  const sql = `
DELETE FROM access_logs
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY
               device_id,
               event_type,
               COALESCE(
                 NULLIF(TRIM(face_id_hash), ''),
                 LOWER(TRIM(REPLACE(COALESCE(person_name, ''), ' ', '')))
               ),
               CAST(strftime('%s', access_time) / ${WINDOW_SEC} AS INTEGER)
             ORDER BY id DESC
           ) AS rn
    FROM access_logs
    WHERE device_id IN ('IN-MINE-1', 'OUT-MINE-1')
      AND (
        (face_id_hash IS NOT NULL AND TRIM(face_id_hash) <> '')
        OR (person_name IS NOT NULL AND TRIM(person_name) <> '')
      )
  ) AS x
  WHERE x.rn > 1
);
`;

  const deleted = await run(sql);
  // eslint-disable-next-line no-console
  console.log(`OK: ${dbPath} — o'chirilgan qatorlar: ${deleted} (shaxta oynasi ${WINDOW_SEC}s)`);
  db.close();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
