import {cookies} from 'next/headers';
import bcrypt from 'bcryptjs';
import {query,transaction,run} from './db.js';
import {hash,token,uid,httpError,assert,str} from './util.js';
const COOKIE='examlan_teacher';
const IDLE=30*60*1000;
const attempts=new Map();
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
export async function loginTeacher({username,password},request){
 username=str(username);const key=username+'|'+(request.headers.get('x-forwarded-for')||'LAN').slice(0,128);const s=attempts.get(key)||{count:0,until:0};if(s.until>Date.now())throw httpError('Terlalu banyak percobaan. Ulangi dalam 5 menit.',429);
 const teacher=(await query('SELECT * FROM teachers WHERE username=?',[username]))[0];
 const valid=teacher&&await bcrypt.compare(String(password||''),teacher.password_hash.replace(/^\$2y\$/,'$2b$'));
 if(!valid){s.count++;if(s.count>=5){s.count=0;s.until=Date.now()+300000;}attempts.set(key,s);throw httpError('Nama pengguna atau kata sandi tidak sesuai.',401)}
 attempts.delete(key);const raw=token();const id=uid();await query('INSERT INTO teacher_sessions (id,teacher_id,token_hash,last_activity_at,expires_at) VALUES (?,?,?,UTC_TIMESTAMP(3),DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 30 MINUTE))',[id,teacher.id,hash(raw)]);
 (await cookies()).set(COOKIE,raw,{httpOnly:true,sameSite:'lax',secure:process.env.APP_URL?.startsWith('https://')||false,path:'/',maxAge:1800});return {ok:true,username:teacher.username,changePasswordRequired:!teacher.password_changed_at};
}
export async function logoutTeacher(){const c=await cookies(),raw=c.get(COOKIE)?.value;if(raw)await query('DELETE FROM teacher_sessions WHERE token_hash=?',[hash(raw)]);c.delete(COOKIE);return {ok:true}}
export async function changePassword({oldPassword,newPassword}){const teacher=await requireTeacher();assert(String(newPassword||'').length>=10,'Kata sandi baru minimal 10 karakter');const rows=await query('SELECT password_hash FROM teachers WHERE id=?',[teacher.id]);assert(await bcrypt.compare(String(oldPassword||''),rows[0].password_hash.replace(/^\$2y\$/,'$2b$')),'Kata sandi lama salah',403);const newHash=await bcrypt.hash(newPassword,12);await query('UPDATE teachers SET password_hash=?,password_changed_at=UTC_TIMESTAMP(3) WHERE id=?',[newHash,teacher.id]);return {ok:true}}
