// Additive, restartable upgrades: keep historical attempts and legacy permissions.
export async function upgradeSecuritySchema(conn, database) {
  for (const [table, column, definition] of [
    ['students','access_code_hash','CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL'],
    ['attempts','participant_key','VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NULL'],
  ]) {
    const [rows] = await conn.execute('SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?',[database,table,column]);
    if (!Number(rows[0].total)) await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
  const [indexes] = await conn.execute('SELECT COUNT(*) AS total FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND INDEX_NAME=?',[database,'students','uq_student_access_code']);
  if (!Number(indexes[0].total)) await conn.query('ALTER TABLE students ADD UNIQUE KEY uq_student_access_code(access_code_hash)');
  const [attemptIndexes] = await conn.execute('SELECT COUNT(*) AS total FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND INDEX_NAME=?',[database,'attempts','idx_attempt_participant']);
  if (!Number(attemptIndexes[0].total)) await conn.query('ALTER TABLE attempts ADD KEY idx_attempt_participant(quiz_id,participant_key,status)');
  await conn.query(`CREATE TABLE IF NOT EXISTS participant_retake_permissions (
    quiz_id BIGINT UNSIGNED NOT NULL,
    participant_key VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    remaining TINYINT UNSIGNED NOT NULL,
    reason TEXT NULL, expires_at DATETIME(3) NULL, granted_by BIGINT UNSIGNED NULL,
    granted_at DATETIME(3) NOT NULL,
    PRIMARY KEY (quiz_id,participant_key),
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  await conn.query(`CREATE TABLE IF NOT EXISTS rate_limit_buckets (
    bucket_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    request_count INT UNSIGNED NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    KEY idx_rate_limit_expiry(expires_at)
  ) ENGINE=InnoDB`);
  // Resolve old registered identities without rewriting historical snapshots.
  await conn.query(`UPDATE attempts a LEFT JOIN students s ON s.nis=NULLIF(a.nis_snapshot,'')
    SET a.participant_key=CONCAT('student:',COALESCE(a.student_id,s.id))
    WHERE a.participant_key IS NULL AND COALESCE(a.student_id,s.id) IS NOT NULL`);
  await conn.query(`UPDATE attempts a JOIN (
    SELECT name,class_name,MIN(id) AS id FROM students WHERE nis IS NULL GROUP BY name,class_name HAVING COUNT(*)=1
  ) s ON s.name=a.name_snapshot AND s.class_name=a.class_snapshot
    SET a.participant_key=CONCAT('student:',s.id)
    WHERE a.participant_key IS NULL AND a.nis_snapshot=''`);
  await conn.query(`UPDATE attempts SET participant_key=CONCAT('legacy:',SHA2(CONCAT(quiz_id,':',nis_snapshot,':',name_snapshot,':',class_snapshot),256)) WHERE participant_key IS NULL`);
  // Migrate still-valid legacy NIS permissions once; later grants use stable IDs.
  await conn.query(`INSERT IGNORE INTO participant_retake_permissions(quiz_id,participant_key,remaining,reason,expires_at,granted_by,granted_at)
    SELECT p.quiz_id,CONCAT('student:',s.id),p.remaining,p.reason,p.expires_at,p.granted_by,p.granted_at
    FROM retake_permissions p JOIN students s ON s.nis=p.nis`);
}
