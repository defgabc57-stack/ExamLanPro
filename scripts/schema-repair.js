
/**
 * Memperbaiki kolom tabel quizzes yang belum tersedia.
 * Aman dijalankan berulang kali tanpa menghapus data.
 */

export async function repairQuizSubject(connection, database) {
  // Pastikan tabel quizzes tersedia
  const [tables] = await connection.execute(
    `SELECT COUNT(*) AS total
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [database, 'quizzes']
  );

  if (!Number(tables[0]?.total)) {
    throw new Error(
      'Tabel quizzes belum ada. Jalankan npm run db:init.'
    );
  }

  // Daftar kolom yang harus tersedia
  const requiredColumns = [
    {
      name: 'subject',
      sql: `ALTER TABLE quizzes
            ADD COLUMN subject VARCHAR(150) NULL
            AFTER description`
    },
    {
      name: 'class_name',
      sql: `ALTER TABLE quizzes
            ADD COLUMN class_name VARCHAR(80) NULL
            AFTER subject`
    }
  ];

  let changed = false;

  for (const column of requiredColumns) {
    const [rows] = await connection.execute(
      `SELECT COUNT(*) AS total
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = ?
         AND COLUMN_NAME = ?`,
      [database, 'quizzes', column.name]
    );

    if (Number(rows[0]?.total) > 0) {
      console.log(`SKIP: quizzes.${column.name} sudah ada`);
      continue;
    }

    await connection.query(column.sql);

    console.log(`OK: quizzes.${column.name} ditambahkan`);
    changed = true;
  }

  return { changed };
}
