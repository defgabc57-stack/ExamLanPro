import {config} from 'dotenv';config({path:'.env.local'});config();
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
const username=process.env.ADMIN_USERNAME||'admin';const password=process.env.ADMIN_PASSWORD;
if(!password||password.length<10){console.error('Tetapkan ADMIN_PASSWORD minimal 10 karakter di environment sebelum menjalankan admin:create');process.exit(1)}
const c=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME||'examlan'});
try{const ph=await bcrypt.hash(password,12);const [r]=await c.execute('INSERT INTO teachers(username,password_hash,password_changed_at) VALUES(?,?,NULL)',[username,ph]);console.log('Guru dibuat:',username,'id',r.insertId,'(ganti sandi setelah login)')}catch(e){console.error('Gagal membuat guru:',e.message);process.exitCode=1}finally{await c.end()}
