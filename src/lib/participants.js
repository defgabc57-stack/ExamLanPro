import {query,run} from './db.js';
import {assert,hash,str,positiveInt,token} from './util.js';

export const participantKey=id=>'student:'+positiveInt(id,1,Number.MAX_SAFE_INTEGER);
export async function resolveParticipant(accessCode,conn=null) {
  const code=str(accessCode);
  assert(/^[A-Za-z0-9_-]{43}$/.test(code),'Kode akses peserta tidak sah',401);
  const rows=conn?await run(conn,'SELECT id,nis,name,class_name FROM students WHERE access_code_hash=?',[hash(code)]):await query('SELECT id,nis,name,class_name FROM students WHERE access_code_hash=?',[hash(code)]);
  assert(rows.length===1,'Kode akses peserta tidak sah',401);
  return {...rows[0],key:participantKey(rows[0].id)};
}
export async function issueStudentAccess(id,teacher) {
  id=positiveInt(id);const code=token();
  const result=await query('UPDATE students SET access_code_hash=? WHERE id=?',[hash(code),id]);
  assert(result.affectedRows,'Siswa tidak ditemukan',404);
  await query("INSERT INTO audit_logs(actor_type,teacher_id,action,target,created_at) VALUES('teacher',?,'student.access.rotate',?,UTC_TIMESTAMP(3))",[teacher.id,String(id)]);
  return {ok:true,accessCode:code};
}
