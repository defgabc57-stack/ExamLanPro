import {readFile} from 'node:fs/promises';

/**
 * Pencocokan skema ExamLAN secara idempoten.
 * Tidak menghapus tabel, kolom, atau data. DDL MySQL melakukan auto-commit:
 * lakukan backup database sebelum menjalankan di database berisi data penting.
 */
const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const KEY_PARENTS = new Set(['teachers', 'media_assets', 'students', 'quizzes', 'questions', 'attempts', 'exam_results']);

export function parseSchema(sql) {
  const withoutComments = sql.replace(/^\s*--[^\n]*$/gm, '');
  const statements = withoutComments.split(/;\s*(?=\n|$)/).map(s => s.trim()).filter(Boolean);
  return statements.filter(s => /^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\b/i.test(s)).map(statement => {
    const match = statement.match(/^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+`?([A-Za-z0-9_]+)`?\s*\(/i);
    if (!match || !SAFE_NAME.test(match[1])) throw new Error('Definisi CREATE TABLE tidak dikenali.');
    const table = match[1];
    const columns = new Map();
    const lines = statement.split('\n');
    for (const line of lines.slice(1)) {
      const trimmed = line.trim().replace(/,$/, '');
      if (!trimmed || /^(?:PRIMARY\s+KEY|UNIQUE\s+KEY|KEY\s+|CONSTRAINT\s+|FOREIGN\s+KEY|\)\s*ENGINE)/i.test(trimmed)) continue;
      const field = trimmed.match(/^`?([A-Za-z0-9_]+)`?\s+(.+)$/);
      if (field && SAFE_NAME.test(field[1])) columns.set(field[1], field[2]);
    }
    return {table, createSql:statement, columns};
  });
}

async function getExistingTables(conn, database) {
  const [rows] = await conn.execute(
    'SELECT TABLE_NAME AS table_name FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE=?',
    [database, 'BASE TABLE']
  );
  return new Set(rows.map(r => String(r.table_name).toLowerCase()));
}
async function getExistingColumns(conn, database) {
  const [rows] = await conn.execute(
    `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, COLUMN_TYPE AS column_type
     FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=?`, [database]
  );
  const byTable = new Map();
  for (const r of rows) {
    const table = String(r.table_name).toLowerCase();
    if (!byTable.has(table)) byTable.set(table, new Map());
    byTable.get(table).set(String(r.column_name).toLowerCase(), String(r.column_type));
  }
  return byTable;
}

function ensureCompatibleParentIds(tables, existingTables, columns) {
  for (const t of tables) {
    if (!KEY_PARENTS.has(t.table) || !existingTables.has(t.table.toLowerCase())) continue;
    const id = columns.get(t.table.toLowerCase())?.get('id');
    if (!id || !/^bigint(?:\(\d+\))?\s+unsigned$/i.test(id.trim())) {
      throw new Error(
        `Struktur ${t.table}.id tidak cocok (sekarang: ${id || 'tidak ada'}, diperlukan BIGINT UNSIGNED). ` +
        'Jangan ubah primary key secara otomatis karena bisa merusak relasi. ' +
        'Cadangkan database dan periksa SHOW CREATE TABLE ' + t.table + ' di phpMyAdmin.'
      );
    }
  }
}
function chooseColumnDefinition(table, column, definition) {
  // Untuk tabel quizzes lama yang sudah berisi data, durasi perlu nilai awal.
  // Nilai ini sementara; admin harus memeriksa durasi setiap paket sesudah migrasi.
  if (table === 'quizzes' && column === 'duration_minutes') {
    return 'INT UNSIGNED NOT NULL DEFAULT 60';
  }
  if (table === 'attempts' && column === 'updated_at') {
    return 'DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)';
  }
  return definition;
}
function needsExistingRowsCheck(definition) {
  return /\bNOT\s+NULL\b/i.test(definition)
    && !/\bDEFAULT\b/i.test(definition)
    && !/\bAUTO_INCREMENT\b/i.test(definition);
}
export async function repairAllSchema(conn, database, sourceSql, logger = console) {
  if (!SAFE_NAME.test(database)) throw new Error('DB_NAME tidak sah.');
  const tables = parseSchema(sourceSql);
  if (tables.length !== 17) throw new Error(`Diharapkan 17 definisi tabel, ditemukan ${tables.length}. Periksa 001_init.sql.`);
  const tableNames = await getExistingTables(conn, database);
  const actualColumns = await getExistingColumns(conn, database);
  // Pemeriksaan awal sebelum perubahan, terutama jika DB lama bukan berasal dari skema ini.
  ensureCompatibleParentIds(tables, tableNames, actualColumns);
  // Validasi kolom wajib pada tabel lama SEBELUM menjalankan DDL apapun.
  // Dengan begitu migrasi tidak meninggalkan perubahan sebagian untuk kasus yang
  // sudah jelas memerlukan pemetaan data secara manual.
  for (const spec of tables) {
    if (!tableNames.has(spec.table.toLowerCase())) continue;
    const have = actualColumns.get(spec.table.toLowerCase()) || new Map();
    for (const [col, canonicalDefinition] of spec.columns) {
      if (have.has(col.toLowerCase())) continue;
      if (col === 'id') {
        throw new Error(`Tabel ${spec.table} tidak memiliki kolom id. Perlu migrasi manual agar data lama tidak rusak.`);
      }
      if (needsExistingRowsCheck(chooseColumnDefinition(spec.table, col, canonicalDefinition))) {
        const [counts] = await conn.query(`SELECT COUNT(*) AS total FROM \`${spec.table}\``);
        if (Number(counts[0]?.total) > 0) {
          throw new Error(`Tabel ${spec.table} sudah berisi data tetapi kolom wajib ${col} belum ada dan tidak memiliki default. ` +
            'Perlu memetakan data lama secara manual, tidak akan menebak isinya.');
        }
      }
    }
  }
  const stats = {createdTables:[], addedColumns:[], warnings:[], skippedTables:[]};
  for (const spec of tables) {
    const table = spec.table;
    if (!tableNames.has(table.toLowerCase())) {
      try {
        await conn.query(spec.createSql);
      } catch (err) {
        throw new Error(`Gagal membuat tabel ${table}: ${err.message}. ` +
          'Kemungkinan struktur PRIMARY KEY/FOREIGN KEY tabel lama tidak cocok. Jangan menghapus tabel lama.', {cause:err});
      }
      stats.createdTables.push(table);
      logger.log(`CREATE ${table}`);
      tableNames.add(table.toLowerCase());
      actualColumns.set(table.toLowerCase(), new Map([...spec.columns].map(([k,v]) => [k.toLowerCase(),v])));
      continue;
    }
    stats.skippedTables.push(table);
    const have = actualColumns.get(table.toLowerCase()) || new Map();
    for (const [col, canonicalDefinition] of spec.columns) {
      if (have.has(col.toLowerCase())) continue;
      if (col === 'id') {
        throw new Error(`Tabel ${table} tidak memiliki kolom id. Perlu migrasi manual agar data lama tidak rusak.`);
      }
      const definition = chooseColumnDefinition(table, col, canonicalDefinition);
      if (needsExistingRowsCheck(definition)) {
        const [countRows] = await conn.query(`SELECT COUNT(*) AS total FROM \`${table}\``);
        if (Number(countRows[0]?.total) > 0) {
          throw new Error(`Tabel ${table} sudah berisi data tetapi kolom wajib ${col} belum ada dan tidak memiliki default. ` +
            'Perlu memetakan data lama secara manual, tidak akan menebak isinya.');
        }
      }
      try {
        await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${definition}`);
      } catch (err) {
        throw new Error(`Gagal menambah ${table}.${col}: ${err.message}`, {cause:err});
      }
      stats.addedColumns.push(`${table}.${col}`);
      have.set(col.toLowerCase(), definition);
      logger.log(`ADD ${table}.${col}`);
      if (table === 'quizzes' && col === 'duration_minutes') {
        stats.warnings.push('Durasi paket lama yang belum punya duration_minutes diisi awal 60 menit. Periksa dan sesuaikan lewat dashboard guru.');
      }
    }
  }
  // Migration 002: definisi jawaban soal tambahan yang digunakan editor soal.
  const questionCols = actualColumns.get('questions') || new Map();
  if (!questionCols.has('answer_code')) {
    await conn.query('ALTER TABLE `questions` ADD COLUMN `answer_code` VARCHAR(255) NULL');
    stats.addedColumns.push('questions.answer_code');
    logger.log('ADD questions.answer_code');
  }
  // Verifikasi akhir dari DATABASE yang nyata, bukan dari estimasi memori.
  const finalTables = await getExistingTables(conn, database);
  const finalColumns = await getExistingColumns(conn, database);
  const incomplete = [];
  for (const spec of tables) {
    if (!finalTables.has(spec.table.toLowerCase())) {incomplete.push(`tabel ${spec.table}`); continue;}
    const have = finalColumns.get(spec.table.toLowerCase()) || new Map();
    for (const col of spec.columns.keys()) if (!have.has(col.toLowerCase())) incomplete.push(`${spec.table}.${col}`);
  }
  if (!finalColumns.get('questions')?.has('answer_code')) incomplete.push('questions.answer_code');
  if (incomplete.length) throw new Error(`Verifikasi skema belum lengkap: ${incomplete.join(', ')}`);
  for (const warning of stats.warnings) logger.warn('PERHATIAN:', warning);
  return stats;
}

export async function repairFromCanonicalFile(conn, database, logger = console) {
  const sql = await readFile(new URL('../db/migrations/001_init.sql', import.meta.url), 'utf8');
  return repairAllSchema(conn, database, sql, logger);
}
