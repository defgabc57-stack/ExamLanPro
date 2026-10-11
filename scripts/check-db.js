import {config} from 'dotenv';
config({path:'.env.local'});config();
import mysql from 'mysql2/promise';
const host=process.env.DB_HOST||'127.0.0.1';
const port=Number(process.env.DB_PORT||3306);
let connection;
try {
  connection=await mysql.createConnection({
    host, port, user:process.env.DB_USER||'root',
    password:process.env.DB_PASSWORD||'', connectTimeout:5000
  });
  const [rows]=await connection.query('SELECT VERSION() AS server_version');
  console.log(`MySQL/MariaDB terhubung ke ${host}:${port} (${rows[0].server_version}).`);
  console.log(`Database target: ${process.env.DB_NAME||'examlan'}`);
} catch(err) {
  console.error(`Gagal menghubungi MySQL XAMPP di ${host}:${port}: ${err.code||err.message}`);
  console.error('Cek port MySQL di XAMPP, DB_HOST, user/password, akses Windows Firewall, dan bind-address MariaDB.');
  process.exitCode=1;
} finally {
  if(connection) await connection.end();
}
