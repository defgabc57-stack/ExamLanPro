import {cookies} from 'next/headers';
import bcrypt from 'bcryptjs';
import {query,transaction,run} from './db.js';
import {hash,token,uid,httpError,assert,str} from './util.js';
import {consumeRateLimit,clearRateLimit} from './rate-limit.js';
const COOKIE='examlan_teacher';
const IDLE=30*60*1000;

export async function teacherSession({touch=true}={}){
 const value=(await cookies()).get(COOKIE)?.value;
 if(!value)return null;
 const rows=await query(`SELECT ts.id,ts.teacher_id,ts.last_activity_at,ts.expires_at,t.username,t.password_changed_at FROM teacher_sessions ts JOIN teachers t ON t.id=ts.teacher_id WHERE ts.token_hash=? LIMIT 1`,[hash(value)]);
 const s=rows[0];if(!s)return null;
 if(new Date(s.expires_at).getTime()<Date.now()||Date.now()-new Date(s.last_activity_at).getTime()>IDLE){await query('DELETE FROM teacher_sessions WHERE id=?',[s.id]);return null}
 if(touch)await query('UPDATE teacher_sessions SET last_activity_at=UTC_TIMESTAMP(3),expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 30 MINUTE) WHERE id=?',[s.id]);
 return {id:s.teacher_id,username:s.username,changePasswordRequired:!s.password_changed_at};
}
export async function requireTeacher(){const teacher=await teacherSession();if(!teacher)throw httpError('Sesi guru berakhir. Silakan masuk lagi.',401);return teacher;}
function setSessionCookie(c,raw){c.set(COOKIE,raw,{httpOnly:true,sameSite:'lax',secure:process.env.APP_URL?.startsWith('https://')||false,path:'/',maxAge:1800});}
export async function loginTeacher({username,password}){
 username=str(username);assert(username&&username.length<=80,'Username tidak sah');assert(typeof password==='string'&&password.length<=1024,'Kata sandi tidak sah');
 const [identity]=await query('SELECT id FROM teachers WHERE username=?',[username]);
 const bucket='teacher-login:'+(identity?'id:'+identity.id:'name:'+username.normalize('NFKC').toLowerCase());
 await consumeRateLimit(bucket);
 const raw=token();
 const teacher=await transaction(async conn=>{
  const [t]=await run(conn,'SELECT * FROM teachers WHERE username=? FOR UPDATE',[username]);
  assert(t&&await bcrypt.compare(password,t.password_hash.replace(/^\$2y\$/,'$2b$')),'Nama pengguna atau kata sandi tidak sesuai.',401);
  await run(conn,'INSERT INTO teacher_sessions (id,teacher_id,token_hash,last_activity_at,expires_at) VALUES (?,?,?,UTC_TIMESTAMP(3),DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 30 MINUTE))',[uid(),t.id,hash(raw)]);
  return t;
 });
 await clearRateLimit(bucket);setSessionCookie(await cookies(),raw);
 return {ok:true,username:teacher.username,changePasswordRequired:!teacher.password_changed_at};
}
export async function logoutTeacher(){const c=await cookies(),raw=c.get(COOKIE)?.value;if(raw)await query('DELETE FROM teacher_sessions WHERE token_hash=?',[hash(raw)]);c.delete(COOKIE);return {ok:true}}
export async function changePassword({oldPassword,newPassword}){
 const teacher=await requireTeacher(),c=await cookies(),current=c.get(COOKIE)?.value;
 assert(typeof newPassword==='string'&&newPassword.length>=10&&Buffer.byteLength(newPassword,'utf8')<=72,'Kata sandi baru minimal 10 karakter dan maksimal 72 byte');
 const raw=token(),newHash=await bcrypt.hash(newPassword,12);
 await transaction(async conn=>{
  const [row]=await run(conn,'SELECT password_hash FROM teachers WHERE id=? FOR UPDATE',[teacher.id]);
  const [active]=await run(conn,'SELECT id FROM teacher_sessions WHERE teacher_id=? AND token_hash=? AND expires_at>UTC_TIMESTAMP(3)',[teacher.id,hash(current)]);
  assert(active,'Sesi guru berakhir. Silakan masuk lagi.',401);
  assert(await bcrypt.compare(String(oldPassword||''),row.password_hash.replace(/^\$2y\$/,'$2b$')),'Kata sandi lama salah',403);
  await run(conn,'UPDATE teachers SET password_hash=?,password_changed_at=UTC_TIMESTAMP(3) WHERE id=?',[newHash,teacher.id]);
  await run(conn,'DELETE FROM teacher_sessions WHERE teacher_id=?',[teacher.id]);
  await run(conn,'INSERT INTO teacher_sessions(id,teacher_id,token_hash,last_activity_at,expires_at) VALUES(?,?,?,UTC_TIMESTAMP(3),DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 30 MINUTE))',[uid(),teacher.id,hash(raw)]);
 });
 setSessionCookie(c,raw);return {ok:true};
}
