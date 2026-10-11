import bcrypt from 'bcryptjs';
import {query,transaction,run} from './db.js';
import {j,assert,str,positiveInt,fmtDate} from './util.js';
import {CAUSE_CODES} from './grading.js';
export const TYPES=['mc','complex','cause_effect','case_analysis','scaled'];
function allowedTime(q){const now=Date.now();return (!q.start_at||new Date(q.start_at).getTime()<=now)&&(!q.end_at||new Date(q.end_at).getTime()>=now)}
export async function publicQuizzes(){const rows=await query(`SELECT id,title,description,subject,class_name,duration_minutes,status,start_at,end_at,pin_enabled FROM quizzes WHERE status='ACTIVE' ORDER BY id DESC`);return rows.filter(allowedTime).map(q=>({...q,pin_enabled:!!q.pin_enabled}));}
export async function getQuestions(quizId,conn=null){const exec=conn?(sql,p)=>run(conn,sql,p):query;const rows=await exec(`SELECT q.*,m.file_path AS image FROM questions q LEFT JOIN media_assets m ON m.id=q.image_asset_id WHERE q.quiz_id=? ORDER BY q.display_order`,[quizId]);if(!rows.length)return [];
 const options=await exec(`SELECT qo.* FROM question_options qo JOIN questions q ON q.id=qo.question_id WHERE q.quiz_id=? ORDER BY qo.question_id,qo.display_order`,[quizId]);const group=new Map();options.forEach(x=>group.set(String(x.question_id),[...(group.get(String(x.question_id))||[]),x]));
 return rows.map(q=>{const arr=group.get(String(q.id))||[];const decoded=j(q.answer_code);return {id:q.id,type:q.type,question:q.question_text||'',statement:q.statement||'',reason:q.reason||'',passage:q.passage||'',explanation:q.explanation||'',image:q.image||'',options:arr.map(o=>({text:o.text_value,score:Number(o.score_value)||0})),answer:q.type==='cause_effect'?q.answer_code:(q.type==='complex'?null:Number(q.answer_code??arr.findIndex(o=>o.is_correct))),answers:q.type==='complex'?(Array.isArray(decoded)?decoded:arr.map((o,i)=>o.is_correct?i:-1).filter(x=>x>=0)):undefined};});
}
export async function teacherQuizzes(){const rows=await query('SELECT * FROM quizzes ORDER BY updated_at DESC');return Promise.all(rows.map(async q=>({...q,questions:await getQuestions(q.id),pin_hash:undefined})));}
export function validateQuestion(q,idx){assert(TYPES.includes(q.type),`Soal ${idx+1}: tipe tidak sah`);if(q.type==='cause_effect'){assert(str(q.statement)&&str(q.reason),`Soal ${idx+1}: pernyataan dan alasan wajib`);assert(CAUSE_CODES.includes(q.answer),`Soal ${idx+1}: kunci sebab-akibat tidak sah`);return;}
 assert(str(q.question),`Soal ${idx+1}: pertanyaan kosong`);
 const opts=(q.options||[]).map(x=>typeof x==='string'?{text:x}:x);assert(opts.length>=2&&opts.length<=8,`Soal ${idx+1}: opsi wajib 2-8`);assert(opts.every(x=>str(x.text)),`Soal ${idx+1}: opsi kosong`);
 if(q.type==='complex')assert(Array.isArray(q.answers)&&q.answers.length>0&&q.answers.every(x=>Number.isInteger(Number(x))&&Number(x)<opts.length&&Number(x)>=0),`Soal ${idx+1}: kunci jamak tidak sah`);
 else if(q.type==='scaled')assert(opts.every(o=>Number.isFinite(Number(o.score))&&Number(o.score)>=0),`Soal ${idx+1}: nilai skala tidak sah`);
 else assert(Number.isInteger(Number(q.answer))&&Number(q.answer)>=0&&Number(q.answer)<opts.length,`Soal ${idx+1}: kunci di luar opsi`);
}
export async function saveQuiz(body,teacher){const questions=body.questions||[];assert(Array.isArray(questions),'Data soal bukan array');assert(str(body.title),'Judul wajib diisi');const duration=positiveInt(body.duration_minutes,1,480);const statuses=['DRAFT','SIAP','ACTIVE','SELESAI','DIARSIPKAN'];assert(statuses.includes(body.status),'Status kuis tidak sah');assert(!(body.status==='ACTIVE'&&!questions.length),'Kuis aktif harus memiliki soal');questions.forEach(validateQuestion);
 return transaction(async conn=>{
  let id=body.id?positiveInt(body.id):null;let existing=null;
  if(id){const r=await run(conn,'SELECT * FROM quizzes WHERE id=? FOR UPDATE',[id]);existing=r[0];assert(existing,'Kuis tidak ditemukan',404)}
  let pinHash=existing?.pin_hash||null;let pinEnabled=body.pin_enabled?1:0;
  if(body.pin!==undefined&&str(body.pin))pinHash=await bcrypt.hash(String(body.pin),10);
  if(!pinEnabled)pinHash=null;
  const values=[str(body.title),str(body.description),str(body.subject),str(body.class_name),duration,body.status,fmtDate(body.start_at),fmtDate(body.end_at),pinHash,pinEnabled,body.review_enabled?1:0];
  if(id)await run(conn,`UPDATE quizzes SET title=?,description=?,subject=?,class_name=?,duration_minutes=?,status=?,start_at=?,end_at=?,pin_hash=?,pin_enabled=?,review_enabled=? WHERE id=?`,[...values,id]);
  else{const r=await run(conn,`INSERT INTO quizzes(title,description,subject,class_name,duration_minutes,status,start_at,end_at,pin_hash,pin_enabled,review_enabled) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,values);id=r.insertId;}
  // Deleting questions leaves existing attempt snapshots intact (question_id set null).
  await run(conn,'DELETE FROM questions WHERE quiz_id=?',[id]);
  for(let i=0;i<questions.length;i++){
   const q=questions[i];let mediaId=null;if(q.image){const media=await run(conn,'SELECT id FROM media_assets WHERE file_path=?',[q.image]);mediaId=media[0]?.id||null}
   const answerCode=q.type==='complex'?JSON.stringify(q.answers.map(Number)):(q.type==='cause_effect'?q.answer:(q.type==='scaled'?null:String(q.answer)));
   const ins=await run(conn,`INSERT INTO questions(quiz_id,type,question_text,statement,reason,passage,explanation,image_asset_id,display_order,answer_code) VALUES(?,?,?,?,?,?,?,?,?,?)`,[id,q.type,str(q.question),str(q.statement),str(q.reason),str(q.passage),str(q.explanation),mediaId,i,answerCode]);
   for(let n=0;n<(q.options||[]).length;n++){const opt=q.options[n];const o=typeof opt==='string'?{text:opt}:opt;const correct=q.type==='complex'?q.answers.map(Number).includes(n):Number(q.answer)===n;await run(conn,`INSERT INTO question_options(question_id,display_order,text_value,score_value,is_correct) VALUES (?,?,?,?,?)`,[ins.insertId,n,str(o.text),q.type==='scaled'?Number(o.score):null,correct?1:0])}
  }
  await run(conn,`INSERT INTO audit_logs(actor_type,teacher_id,action,target,created_at) VALUES('teacher',?,?,?,UTC_TIMESTAMP(3))`,[teacher.id,existing?'quiz.update':'quiz.create',String(id)]);
  return {ok:true,id};
 });
}
export async function changeReview(quizId,enabled){const r=await query('UPDATE quizzes SET review_enabled=? WHERE id=?',[enabled?1:0,quizId]);assert(r.affectedRows,'Kuis tidak ditemukan',404);return {ok:true}}
