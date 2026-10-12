import {config} from 'dotenv';
config({path:'.env.local'});config();
import mysql from 'mysql2/promise';
import {readdir,readFile} from 'node:fs/promises';
import {repairFromCanonicalFile} from './full-schema-repair.js';
import {upgradeSecuritySchema} from './security-schema.js';

const database=process.env.DB_NAME||'examlan';
if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(database))throw new Error('DB_NAME tidak sah.');
let connection;
try {
  connection=await mysql.createConnection({
    host:process.env.DB_HOST||'127.0.0.1',
    port:Number(process.env.DB_PORT||3306),
    user:process.env.DB_USER||'root',
    password:process.env.DB_PASSWORD||'',
    multipleStatements:false,
  });
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await connection.query(`USE \`${database}\``);
  await connection.query('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(255) PRIMARY KEY,applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB');
  // Jangan hanya percaya schema_migrations: cocokkan langsung dengan struktur nyata.
  const result=await repairFromCanonicalFile(connection,database);
  await upgradeSecuritySchema(connection,database);
  for (const name of ['001_init.sql','002_question_answer.sql']) {
    await connection.execute('INSERT IGNORE INTO schema_migrations(name) VALUES(?)',[name]);
  }
  // Migrasi baru yang mungkin ditambahkan kelak tetap diproses secara berurutan.
  const files=(await readdir(new URL('../db/migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')&&!['001_init.sql','002_question_answer.sql'].includes(n)).sort();
  for(const name of files){
    const [seen]=await connection.execute('SELECT name FROM schema_migrations WHERE name=?',[name]);
    if(seen.length){console.log('SKIP',name);continue;}
    const contents=await readFile(new URL('../db/migrations/'+name,import.meta.url),'utf8');
    const parts=contents.replace(/^\s*--[^\n]*$/gm,'').split(/;\s*(?=\n|$)/).map(s=>s.trim()).filter(Boolean);
    for(const sql of parts){await connection.query(sql);}
    await connection.execute('INSERT INTO schema_migrations(name) VALUES(?)',[name]);
    console.log('OK',name);
  }
  console.log(`Database ${database} siap (${result.createdTables.length} tabel & ${result.addedColumns.length} kolom ditambahkan).`);
}catch(err){
  console.error('Migrasi gagal:',err.message);
  process.exitCode=1;
}finally{if(connection)await connection.end();}
