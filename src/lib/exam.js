import bcrypt from 'bcryptjs';
import {resolveParticipant} from './participants.js';
import {consumeRateLimit,clearRateLimit} from './rate-limit.js';
import {query,transaction,run} from './db.js';
import {assert,str,hash,token,shuffle,positiveInt,j} from './util.js';
import {getQuestions} from './quizzes.js';
import {publicQuestion,normalizeAnswer,gradeExam} from './grading.js';
function requireToken(raw){assert(typeof raw==='string'&&raw.length>=24,'Token ujian tidak sah',401);return hash(raw)}
export async function attemptByToken(raw,conn=null,lock=false){const sql=`SELECT a.*,q.title,q.review_enabled FROM attempts a JOIN quizzes q ON q.id=a.quiz_id WHERE a.token_hash=? ${lock?'FOR UPDATE':''}`;const rows=conn?await run(conn,sql,[requireToken(raw)]):await query(sql,[requireToken(raw)]);assert(rows.length,'Sesi ujian tidak ditemukan',401);return rows[0]}
async function snapshots(attemptId,conn=null){const exec=conn?(sql,p)=>run(conn,sql,p):query;const qs=await exec('SELECT position,snapshot_json,option_order_json FROM attempt_questions WHERE attempt_id=? ORDER BY position',[attemptId]);return qs.map(x=>({position:x.position,question:j(x.snapshot_json,{}),order:j(x.option_order_json,[])}));}
async function saved(attemptId,conn=null){const exec=conn?(sql,p)=>run(conn,sql,p):query;const rows=await exec('SELECT question_position,answer_json,client_revision FROM attempt_answers WHERE attempt_id=?',[attemptId]);return Object.fromEntries(rows.map(x=>[x.question_position,j(x.answer_json)]))}
export async function checkEligibility({quizId,accessCode}){
 const student=await resolveParticipant(accessCode);quizId=positiveInt(quizId);
 const [q]=await query('SELECT * FROM quizzes WHERE id=?',[quizId]);assert(q,'Kuis tidak ditemukan',404);assert(q.status==='ACTIVE','Kuis belum aktif');
 assert(!q.class_name||q.class_name===student.class_name,'Kuis tidak tersedia untuk kelas Anda',403);
 assert((!q.start_at||new Date(q.start_at)<=new Date())&&(!q.end_at||new Date(q.end_at)>=new Date()),'Jadwal akses kuis tidak tersedia');
 const [old]=await query('SELECT id,status FROM attempts WHERE quiz_id=? AND participant_key=? ORDER BY id DESC LIMIT 1',[quizId,student.key]);
 const [completed]=await query("SELECT COUNT(*) AS count FROM attempts WHERE quiz_id=? AND participant_key=? AND status='SUBMITTED'",[quizId,student.key]);
 const [permission]=await query('SELECT remaining,expires_at FROM participant_retake_permissions WHERE quiz_id=? AND participant_key=?',[quizId,student.key]);
 const remaining=permission?.remaining||0;
 return {eligible:!completed.count||(remaining>0&&(!permission.expires_at||new Date(permission.expires_at)>new Date())),hasActive:old?.status==='ACTIVE',remaining,hasResult:completed.count>0};
}
export async function startAttempt({quizId,accessCode,pin}){
 quizId=positiveInt(quizId);
 const authenticated=await resolveParticipant(accessCode);
 const pinBucket='quiz-pin:'+quizId+':'+authenticated.key;
 // Rate limiting outside the attempt transaction must survive a PIN rollback.
 await consumeRateLimit(pinBucket,5,300);
 return transaction(async conn=>{
  const quiz=(await run(conn,'SELECT * FROM quizzes WHERE id=? FOR UPDATE',[quizId]))[0];assert(quiz&&quiz.status==='ACTIVE','Kuis tidak tersedia');assert((!quiz.start_at||new Date(quiz.start_at)<=new Date())&&(!quiz.end_at||new Date(quiz.end_at)>=new Date()),'Di luar jadwal kuis');
  const existing=await resolveParticipant(accessCode,conn);
  assert(existing.id===authenticated.id,'Kode akses telah berubah',401);
  assert(!quiz.class_name||quiz.class_name===existing.class_name,'Kuis tidak tersedia untuk kelas Anda',403);
  if(quiz.pin_enabled)assert(quiz.pin_hash&&await bcrypt.compare(String(pin||''),quiz.pin_hash),'PIN kuis salah',403);
  const nis=existing.nis||'',name=existing.name,className=existing.class_name;
  const [completed]=await run(conn,"SELECT COUNT(*) AS count FROM attempts WHERE quiz_id=? AND participant_key=? AND status='SUBMITTED'",[quizId,existing.key]);
  if(completed.count){const r=(await run(conn,'SELECT * FROM participant_retake_permissions WHERE quiz_id=? AND participant_key=? FOR UPDATE',[quizId,existing.key]))[0];assert(r&&r.remaining>0&&(!r.expires_at||new Date(r.expires_at)>new Date()),'Guru belum memberi izin mengulang ujian',403);await run(conn,'UPDATE participant_retake_permissions SET remaining=remaining-1 WHERE quiz_id=? AND participant_key=?',[quizId,existing.key]);}
  const other=(await run(conn,"SELECT id FROM attempts WHERE quiz_id=? AND participant_key=? AND status='ACTIVE' ORDER BY id DESC LIMIT 1 FOR UPDATE",[quizId,existing.key]))[0];assert(!other,'Ada sesi ujian aktif. Gunakan lanjutkan ujian pada perangkat yang sama.',409);
  const questions=await getQuestions(quizId,conn);assert(questions.length,'Kuis belum memiliki soal');const raw=token();const mins=positiveInt(quiz.duration_minutes,1,480);
  const row=await run(conn,`INSERT INTO attempts(quiz_id,student_id,participant_key,nis_snapshot,name_snapshot,class_snapshot,token_hash,started_at,ends_at,updated_at) VALUES (?,?,?,?,?,?,?,UTC_TIMESTAMP(3),DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? MINUTE),UTC_TIMESTAMP(3))`,[quizId,existing.id,existing.key,nis,name,className,hash(raw),mins]);
  const ordered=shuffle(questions);for(let i=0;i<ordered.length;i++){const q=ordered[i];const order=q.type==='cause_effect'?[]:shuffle(q.options.map((_,k)=>k));await run(conn,`INSERT INTO attempt_questions(attempt_id,question_id,position,snapshot_json,option_order_json) VALUES(?,?,?,?,?)`,[row.insertId,q.id,i,JSON.stringify(q),JSON.stringify(order)])}
  await clearRateLimit(pinBucket);
  return {ok:true,token:raw};
 });
}
export async function resumeAttempt(raw){const a=await attemptByToken(raw);const qs=await snapshots(a.id);const answers=await saved(a.id);const [lastRevision]=await query('SELECT COALESCE(MAX(client_revision),0) AS revision FROM attempt_answers WHERE attempt_id=?',[a.id]);let result=null;
 if(a.status==='SUBMITTED'){const r=(await query('SELECT id,score,correct_count,wrong_count FROM exam_results WHERE attempt_id=?',[a.id]))[0];result=r||null}
 return {status:a.status,student:{name:a.name_snapshot,nis:a.nis_snapshot,className:a.class_snapshot},quiz:{id:a.quiz_id,title:a.title,review_enabled:!!a.review_enabled},endsAt:a.ends_at,serverNow:new Date().toISOString(),revision:Number(lastRevision.revision),questions:qs.map(({position,question,order})=>publicQuestion(question,position,order)),answers,result};}
export async function saveAnswers(raw,body){assert(Array.isArray(body.answers),'Jawaban wajib berupa daftar');const revision=positiveInt(body.revision,1,Number.MAX_SAFE_INTEGER);
 return transaction(async conn=>{const a=await attemptByToken(raw,conn,true);assert(a.status==='ACTIVE','Ujian telah selesai',409);assert(new Date(a.ends_at)>new Date(),'Waktu habis',409);
  const qs=await snapshots(a.id,conn),valid=new Set(qs.map(q=>q.position));
  for(const item of body.answers){const position=Number(item.position);assert(Number.isInteger(position)&&valid.has(position),'Nomor soal tidak sah');await run(conn,`INSERT INTO attempt_answers(attempt_id,question_position,answer_json,client_revision) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE answer_json=IF(VALUES(client_revision)>client_revision,VALUES(answer_json),answer_json),client_revision=GREATEST(client_revision,VALUES(client_revision)),saved_at=UTC_TIMESTAMP(3)`,[a.id,position,JSON.stringify(item.answer??null),revision]);}
  await run(conn,'UPDATE attempts SET updated_at=UTC_TIMESTAMP(3) WHERE id=?',[a.id]);return {ok:true,revision};
 });}
export async function submitAttempt(raw,finalAnswers=[],finalRevision=0){return transaction(async conn=>{const a=await attemptByToken(raw,conn,true);
 if(a.status==='SUBMITTED'){const prior=(await run(conn,'SELECT id,score,correct_count,wrong_count FROM exam_results WHERE attempt_id=?',[a.id]))[0];assert(prior,'Hasil ujian tidak ditemukan',404);return {ok:true,idempotent:true,result:prior}}
 assert(a.status==='ACTIVE','Ujian sudah tidak aktif',409);const qs=await snapshots(a.id,conn);const expired=new Date(a.ends_at).getTime()<=Date.now();if(!expired&&Array.isArray(finalAnswers)&&finalAnswers.length){const valid=new Set(qs.map(q=>q.position));const revision=positiveInt(finalRevision,1,Number.MAX_SAFE_INTEGER);for(const item of finalAnswers){const position=Number(item.position);assert(Number.isInteger(position)&&valid.has(position),'Nomor soal tidak valid');await run(conn,`INSERT INTO attempt_answers(attempt_id,question_position,answer_json,client_revision) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE answer_json=IF(VALUES(client_revision)>client_revision,VALUES(answer_json),answer_json),client_revision=GREATEST(client_revision,VALUES(client_revision)),saved_at=UTC_TIMESTAMP(3)`,[a.id,position,JSON.stringify(item.answer??null),revision])}}const rawAnswers=await saved(a.id,conn);const answered=Object.values(rawAnswers).filter(x=>x!==null&&x!==''&&(!Array.isArray(x)||x.length>0)).length;
 assert(expired||answered===qs.length,`Masih ada ${qs.length-answered} soal yang belum dijawab`,409);
 const realAnswers={};qs.forEach(({position,question,order})=>realAnswers[position]=normalizeAnswer(question,rawAnswers[position],order));
 const graded=gradeExam(qs.map(q=>q.question),realAnswers);const rt=token();const record=await run(conn,`INSERT INTO exam_results(attempt_id,quiz_id,nis_snapshot,name_snapshot,class_snapshot,score,correct_count,wrong_count,submitted_at,review_token_hash) VALUES(?,?,?,?,?,?,?,?,UTC_TIMESTAMP(3),?)`,[a.id,a.quiz_id,a.nis_snapshot,a.name_snapshot,a.class_snapshot,graded.score,graded.correct_count,graded.wrong_count,hash(rt)]);
 for(const b of graded.breakdown){await run(conn,`INSERT INTO result_breakdowns(result_id,position,question_snapshot_json,given_answer_json,is_correct,student_answer_text,correct_answer_text) VALUES(?,?,?,?,?,?,?)`,[record.insertId,b.position,JSON.stringify(b.question),JSON.stringify(b.answer),b.correct?1:0,JSON.stringify(b.answer),b.question.type==='complex'?JSON.stringify(b.question.answers):String(b.question.answer??'')]);}
 await run(conn,`UPDATE attempts SET status='SUBMITTED',submitted_at=UTC_TIMESTAMP(3) WHERE id=?`,[a.id]);
 // Maintain last five results while preserving references in trash.
 const history=await run(conn,`SELECT r.id FROM exam_results r JOIN attempts a ON a.id=r.attempt_id WHERE r.quiz_id=? AND a.participant_key=? ORDER BY r.submitted_at DESC,r.id DESC`,[a.quiz_id,a.participant_key]);
 for(const old of history.slice(5)){const rows=await run(conn,'SELECT * FROM exam_results WHERE id=?',[old.id]);const detail=await run(conn,'SELECT * FROM result_breakdowns WHERE result_id=?',[old.id]);await run(conn,`INSERT INTO trash_items(entity_type,entity_id,payload_json) VALUES('results',?,?)`,[String(old.id),JSON.stringify({result:rows[0],breakdowns:detail})]);await run(conn,'DELETE FROM exam_results WHERE id=?',[old.id]);}
 return {ok:true,result:{id:record.insertId,score:graded.score,correct_count:graded.correct_count,wrong_count:graded.wrong_count},reviewToken:rt};
 });}
export async function getReview(raw,reviewToken){let result;
 if(reviewToken){result=(await query('SELECT r.*,q.review_enabled FROM exam_results r JOIN quizzes q ON q.id=r.quiz_id WHERE r.review_token_hash=?',[requireToken(reviewToken)]))[0]}
 else{const a=await attemptByToken(raw);result=(await query('SELECT r.*,q.review_enabled FROM exam_results r JOIN quizzes q ON q.id=r.quiz_id WHERE r.attempt_id=?',[a.id]))[0]}
 assert(result,'Hasil tidak ditemukan',404);return {enabled:!!result.review_enabled,items:result.review_enabled?(await query('SELECT position,question_snapshot_json,given_answer_json,is_correct FROM result_breakdowns WHERE result_id=? ORDER BY position',[result.id])).map(b=>({position:b.position,question:j(b.question_snapshot_json),answer:j(b.given_answer_json),correct:!!b.is_correct})):[]};}
export async function requestExtension(raw){return transaction(async conn=>{const a=await attemptByToken(raw,conn,true);assert(a.status==='ACTIVE','Ujian sudah selesai');assert(new Date(a.ends_at)<=new Date(),'Permintaan hanya setelah waktu habis');const r=(await run(conn,'SELECT id,status FROM time_extension_requests WHERE attempt_id=? FOR UPDATE',[a.id]))[0];if(r){assert(r.status!=='REJECTED','Permintaan telah ditolak');return {ok:true,status:r.status}}await run(conn,`INSERT INTO time_extension_requests(attempt_id,requested_at) VALUES(?,UTC_TIMESTAMP(3))`,[a.id]);return {ok:true,status:'PENDING'};});}
export async function extensionStatus(raw){const a=await attemptByToken(raw);const r=(await query('SELECT status,added_minutes,new_ends_at FROM time_extension_requests WHERE attempt_id=?',[a.id]))[0];return {status:r?.status||'NONE',endsAt:a.ends_at,addedMinutes:r?.added_minutes||0}}
