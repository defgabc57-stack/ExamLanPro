import {config} from 'dotenv';
config({path:'.env.local'});config();
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
const username=process.env.ADMIN_USERNAME||'admin';
const password=process.env.ADMIN_PASSWORD;
if(!password||password.length<10){
  console.error('Isi ADMIN_PASSWORD baru minimal 10 karakter sebelum admin:reset.');
  process.exit(1);
}
const conn=await mysql.createConnection({
  host:process.env.DB_HOST||'127.0.0.1',
  port:Number(process.env.DB_PORT||3306),
  user:process.env.DB_USER||'root',
  password:process.env.DB_PASSWORD||'',
  database:process.env.DB_NAME||'examlan',
  multipleStatements:false
});
try{
  await conn.beginTransaction();
  const [rows]=await conn.execute('SELECT id FROM teachers WHERE username=? FOR UPDATE',[username]);
  if(rows.length!==1)throw new Error('Akun guru tidak ditemukan. Gunakan npm run admin:create untuk membuatnya.');
  const teacherId=rows[0].id;
  const passwordHash=await bcrypt.hash(password,12);
  await conn.execute('UPDATE teachers SET password_hash=?,password_changed_at=NULL WHERE id=?',[passwordHash,teacherId]);
  await conn.execute('DELETE FROM teacher_sessions WHERE teacher_id=?',[teacherId]);
  await conn.commit();
  console.log('Password akun guru berhasil diubah:',username,'(sesi lama dikeluarkan).');
}catch(error){await conn.rollback();console.error('Gagal reset admin:',error.message);process.exitCode=1;
}finally{await conn.end();}
