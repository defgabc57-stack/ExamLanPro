import {config} from 'dotenv';
config({path:'.env.local'});config();
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
import {restoreBackup} from '../src/lib/restore-backup.js';
const filename=process.argv[2];
if(!filename)throw new Error('Gunakan npm run backup:restore -- /lokasi/backup.json dengan DB_NAME tujuan kosong yang sudah dimigrasi.');
const conn=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME||'examlan',timezone:'Z'});
try{const result=await restoreBackup(conn,JSON.parse(await fs.readFile(filename,'utf8')),process.cwd());console.log('Backup dipulihkan:',result,'Sesi guru tidak dipulihkan; login ulang.');}
catch(error){console.error('Pemulihan gagal:',error.message);process.exitCode=1;}
finally{await conn.end();}
