import {config} from 'dotenv';
config({path:'.env.local'});config();
import mysql from 'mysql2/promise';
import {repairFromCanonicalFile} from './full-schema-repair.js';
import {upgradeSecuritySchema} from './security-schema.js';
const database=process.env.DB_NAME||'examlan';
if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(database))throw new Error('DB_NAME tidak sah');
let connection;
try {
  connection=await mysql.createConnection({
    host:process.env.DB_HOST||'127.0.0.1',
    port:Number(process.env.DB_PORT||3306),
    user:process.env.DB_USER||'root',
    password:process.env.DB_PASSWORD||'',
    database,
    multipleStatements:false,
  });
  const [identity]=await connection.query('SELECT DATABASE() AS db, @@port AS port');
  console.log(`Target: ${identity[0].db} pada MySQL port ${identity[0].port}`);
  const result=await repairFromCanonicalFile(connection,database);
  await upgradeSecuritySchema(connection,database);
  console.log(`SELESAI: ${result.createdTables.length} tabel dibuat, ${result.addedColumns.length} kolom ditambah.`);
  console.log('Jalankan kembali untuk memeriksa idempotensi (semua perubahan seharusnya 0).');
} catch(error) {
  console.error('GAGAL:',error.message);
  console.error('DDL yang sudah berhasil tidak dapat di-rollback otomatis. Periksa pesan di atas dan lakukan backup sebelum melanjutkan.');
  process.exitCode=1;
} finally {
  if(connection) await connection.end();
}
