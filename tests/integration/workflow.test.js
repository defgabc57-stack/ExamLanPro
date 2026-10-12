import test from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {repairFromCanonicalFile} from '../../scripts/full-schema-repair.js';
import {upgradeSecuritySchema} from '../../scripts/security-schema.js';

// Explicit opt-in, a new database per run, and loopback only. Never use DB_NAME.
test('MySQL et HTTP: audit regressions', {timeout:120000}, async t=>{
 assert.equal(process.env.EXAMLAN_INTEGRATION,'1','Run with EXAMLAN_INTEGRATION=1 and TEST_MYSQL_PORT pointing to an isolated local MySQL.');
 const database='examlan_test_'+process.pid+'_'+Date.now();
 const options={host:'127.0.0.1',port:Number(process.env.TEST_MYSQL_PORT||13306),user:'root',password:process.env.TEST_MYSQL_PASSWORD||'',timezone:'Z'};
 const conn=await mysql.createConnection(options),restoreDatabase=database+'_restore';
 let server,db;const mediaRoot=await fs.mkdtemp(path.join(os.tmpdir(),'examlan-media-'));
 t.after(async()=>{
  if(server&&server.exitCode===null){const stopped=once(server,'exit');server.kill();await stopped;}
  if(db)await db.end();
  await conn.query('DROP DATABASE IF EXISTS `'+restoreDatabase+'`');
  await conn.query('DROP DATABASE `'+database+'`');await conn.end();
  await fs.rm(mediaRoot,{recursive:true,force:true});
 });
 await conn.query('CREATE DATABASE `'+database+'`');await conn.query('USE `'+database+'`');
 const noLog={log(){},warn(){}};
 await repairFromCanonicalFile(conn,database,noLog);await upgradeSecuritySchema(conn,database);
 process.env.DB_HOST='127.0.0.1';process.env.DB_PORT=String(options.port);process.env.DB_USER=options.user;process.env.DB_PASSWORD=options.password;process.env.DB_NAME=database;
 const lib=await import('../../src/lib/db.js');db=lib.db();const {query}=lib;
 const {upsertStudent,allowRetake,analytics,trashItem,restoreTrash}=await import('../../src/lib/admin.js');
 const {issueStudentAccess,resolveParticipant}=await import('../../src/lib/participants.js');
 const {startAttempt,resumeAttempt,saveAnswers,submitAttempt,checkEligibility}=await import('../../src/lib/exam.js');
 const {saveQuiz}=await import('../../src/lib/quizzes.js');
 const {captureBackup}=await import('../../src/lib/backup.js');
 const {restoreBackup}=await import('../../src/lib/restore-backup.js');
 const {token}=await import('../../src/lib/util.js');
 const teacherId=(await query('INSERT INTO teachers(username,password_hash,password_changed_at) VALUES(?,?,UTC_TIMESTAMP(3))',['audit-teacher',await bcrypt.hash('RegressionPass123!',4)])).insertId;
 const teacher={id:teacherId};
 const student=await upsertStudent({name:'Peserta Tanpa NIS',className:'X'},teacher);
 const other=await upsertStudent({nis:'002',name:'Peserta Lain',className:'X'},teacher);
 const mc={type:'mc',question:'Pilih jawaban benar',options:[{text:'Benar'},{text:'Salah'}],answer:0};
 const scaled={type:'scaled',question:'Skala',options:[{text:'Tinggi',score:5},{text:'Rendah',score:1}],answer:0};
 const quiz=(await saveQuiz({title:'Regresi',duration_minutes:60,status:'ACTIVE',class_name:'X',questions:[mc,scaled]},teacher)).id;
 let attempt;
 await t.test('access code autentik; identitas payload tidak dipercaya dan kelas dibatasi',async()=>{
  await assert.rejects(()=>startAttempt({quizId:quiz,nis:'002',name:'Peserta Lain',className:'X'}),e=>e.status===401);
  await assert.rejects(()=>startAttempt({quizId:quiz,accessCode:token()}),e=>e.status===401);
  attempt=await startAttempt({quizId:quiz,accessCode:student.accessCode,name:'Palsu',className:'Y',nis:'palsu'});
  const resumed=await resumeAttempt(attempt.token);assert.equal(resumed.student.name,'Peserta Tanpa NIS');assert.equal(resumed.student.nis,'');
  const wrong=(await saveQuiz({title:'Kelas lain',duration_minutes:60,status:'ACTIVE',class_name:'Y',questions:[mc]},teacher)).id;
  await assert.rejects(()=>startAttempt({quizId:wrong,accessCode:other.accessCode}),e=>e.status===403);
 });
 await t.test('autosave, revisi lama, resume, submit final dan submit idempotent',async()=>{
  const session=await resumeAttempt(attempt.token);const answers=session.questions.map(q=>({position:q.position,answer:q.options.findIndex(o=>['Benar','Tinggi'].includes(o.text))}));
  const legacy=Date.now()*1000;
  await saveAnswers(attempt.token,{answers,revision:legacy});
  await saveAnswers(attempt.token,{answers:answers.map(a=>({...a,answer:1-a.answer})),revision:legacy-1});
  const resumed=await resumeAttempt(attempt.token);assert.equal(resumed.revision,legacy);assert.deepEqual(resumed.answers,Object.fromEntries(answers.map(a=>[a.position,a.answer])));
  const result=await submitAttempt(attempt.token,answers,legacy+1);assert.equal(result.result.score,100);
  assert.equal((await submitAttempt(attempt.token)).idempotent,true);
  await assert.rejects(()=>saveAnswers(attempt.token,{answers,revision:legacy+2}),e=>e.status===409);
 });
 await t.test('retake tanpa NIS tetap memakai ID siswa setelah nama dan kode berubah',async()=>{
  await assert.rejects(()=>startAttempt({quizId:quiz,accessCode:student.accessCode,name:'Nama baru'}),e=>e.status===403);
  await upsertStudent({id:student.id,name:'Nama Baru',className:'X'},teacher);
  const rotated=await issueStudentAccess(student.id,teacher);
  await assert.rejects(()=>startAttempt({quizId:quiz,accessCode:student.accessCode}),e=>e.status===401);
  await allowRetake({quizId:quiz,studentId:student.id,remaining:1},teacher);
  assert.equal((await checkEligibility({quizId:quiz,accessCode:rotated.accessCode})).eligible,true);
  const repeated=await startAttempt({quizId:quiz,accessCode:rotated.accessCode});
  const [permission]=await query('SELECT remaining FROM participant_retake_permissions WHERE quiz_id=? AND participant_key=?',[quiz,'student:'+student.id]);assert.equal(permission.remaining,0);
  const [a]=await query('SELECT id FROM attempts WHERE token_hash=SHA2(?,256)',[repeated.token]);
  await query('UPDATE attempts SET ends_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE id=?',[a.id]);
  assert.equal((await submitAttempt(repeated.token)).result.score,0);
  await assert.rejects(()=>startAttempt({quizId:quiz,accessCode:rotated.accessCode}),e=>e.status===403);
 });
 await t.test('dua request mulai bersamaan hanya membuat satu sesi',async()=>{
  const pair=await Promise.allSettled([startAttempt({quizId:quiz,accessCode:other.accessCode}),startAttempt({quizId:quiz,accessCode:other.accessCode})]);
  assert.equal(pair.filter(p=>p.status==='fulfilled').length,1);assert.equal(pair.find(p=>p.status==='rejected').reason.status,409);
 });
 await t.test('PIN salah tetap dihitung setelah transaksi ujian di-rollback',async()=>{
  const pinQuiz=(await saveQuiz({title:'PIN',duration_minutes:60,status:'ACTIVE',class_name:'X',questions:[mc],pin_enabled:true,pin:'123456'},teacher)).id;
  for(let n=0;n<5;n++)await assert.rejects(()=>startAttempt({quizId:pinQuiz,accessCode:other.accessCode,pin:'salah'}),e=>e.status===403);
  await assert.rejects(()=>startAttempt({quizId:pinQuiz,accessCode:other.accessCode,pin:'123456'}),e=>e.status===429);
 });
 await t.test('pemulihan siswa dari trash mempertahankan kode akses dan ID',async()=>{
  await trashItem('students',other.id,teacher);
  await assert.rejects(()=>resolveParticipant(other.accessCode),e=>e.status===401);
  const [trash]=await query("SELECT id FROM trash_items WHERE entity_type='students' AND entity_id=? ORDER BY id DESC LIMIT 1",[String(other.id)]);
  await restoreTrash(trash.id,teacher);assert.equal((await resolveParticipant(other.accessCode)).id,other.id);
 });
 await t.test('analitik memakai soal asli, tidak posisi acak',async()=>{
  const report=await analytics(quiz);assert.equal(report.detail.length,2);assert.ok(report.detail.every(d=>d.total===2));
 });
 await t.test('upgrade dapat diulang tanpa mengganti kode atau izin yang sudah dipakai',async()=>{
  const [before]=await query('SELECT access_code_hash FROM students WHERE id=?',[student.id]);
  await upgradeSecuritySchema(conn,database);await upgradeSecuritySchema(conn,database);
  const [after]=await query('SELECT access_code_hash FROM students WHERE id=?',[student.id]);assert.equal(after.access_code_hash,before.access_code_hash);
  const [permission]=await query('SELECT remaining FROM participant_retake_permissions WHERE quiz_id=? AND participant_key=?',[quiz,'student:'+student.id]);assert.equal(permission.remaining,0);
 });
 await t.test('backup media + relasi pulih ke DB kosong; DB berisi data ditolak',async()=>{
  await fs.mkdir(path.join(mediaRoot,'public/uploads'),{recursive:true});const bytes=Buffer.from('regression-media');await fs.writeFile(path.join(mediaRoot,'public/uploads/test.png'),bytes);
  const media=(await query('INSERT INTO media_assets(file_path,mime_type,size_bytes) VALUES(?,?,?)',['/uploads/test.png','image/png',bytes.length])).insertId;
  await query('UPDATE students SET photo_asset_id=? WHERE id=?',[media,student.id]);
  const backup=await captureBackup(mediaRoot);assert.equal(backup.files.length,1);
  await conn.query('CREATE DATABASE `'+restoreDatabase+'`');await conn.query('USE `'+restoreDatabase+'`');await repairFromCanonicalFile(conn,restoreDatabase,noLog);await upgradeSecuritySchema(conn,restoreDatabase);
  const destination=path.join(mediaRoot,'restored');await restoreBackup(conn,backup,destination);
  assert.deepEqual(await fs.readFile(path.join(destination,'public/uploads/test.png')),bytes);
  const [restored]=await conn.query('SELECT name,photo_asset_id FROM students WHERE id=?',[student.id]);assert.equal(restored[0].name,'Nama Baru');assert.equal(Number(restored[0].photo_asset_id),media);
  const [results]=await conn.query('SELECT COUNT(*) AS count FROM exam_results');assert.equal(results[0].count,2);
  await assert.rejects(()=>restoreBackup(conn,backup,destination),/harus kosong/);await conn.query('USE `'+database+'`');
 });
 const port=16300+(process.pid%1000),base='http://127.0.0.1:'+port;
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{cwd:process.cwd(),env:{...process.env,APP_URL:base,NEXT_TELEMETRY_DISABLED:'1'},stdio:'ignore'});
 for(let n=0;n<100;n++){try{if((await fetch(base)).ok)break;}catch{}if(server.exitCode!==null)throw new Error('Next server gagal start');await new Promise(r=>setTimeout(r,100));if(n===99)throw new Error('Next server tidak siap');}
 const post=async(route,body,cookie='',headers={})=>fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:base,...(cookie?{Cookie:cookie}:{}),...headers},body:JSON.stringify(body)});
 const cookie=res=>res.headers.get('set-cookie')?.split(';')[0];
 let current;
 await t.test('HTTP: rotasi password mencabut dua sesi lama dan mempertahankan sesi baru',async()=>{
  const login={username:'audit-teacher',password:'RegressionPass123!'};
  const a=await post('auth/guru/login',login),b=await post('auth/guru/login',login);assert.equal(a.status,200);assert.equal(b.status,200);
  const changed=await post('auth/guru/password',{oldPassword:login.password,newPassword:'ChangedPass123!'},cookie(a));assert.equal(changed.status,200);current=cookie(changed);
  for(const old of [cookie(a),cookie(b)])assert.equal((await (await fetch(base+'/api/auth/guru/status',{headers:{Cookie:old}})).json()).teacher,null);
  assert.equal((await (await fetch(base+'/api/auth/guru/status',{headers:{Cookie:current}})).json()).teacher.id,teacherId);
 });
 await t.test('HTTP: header IP palsu dan kapitalisasi username tidak melewati rate limit',async()=>{
  for(let i=0;i<5;i++){const r=await post('auth/guru/login',{username:i%2?'AUDIT-TEACHER':'audit-teacher',password:'wrong'},'',{'x-forwarded-for':'192.0.2.'+i});assert.equal(r.status,401);}
  const blocked=await post('auth/guru/login',{username:'Audit-Teacher',password:'wrong'},'',{'x-forwarded-for':'203.0.113.5'});assert.equal(blocked.status,429);
 });
 await t.test('HTTP: daftar guru tidak membocorkan hash kode; lookup NIS publik dihapus',async()=>{
  const data=await (await fetch(base+'/api/guru/data',{headers:{Cookie:current}})).json();assert.ok(data.students.length>=2);assert.ok(data.students.every(s=>!('access_code_hash' in s)));
  assert.equal((await fetch(base+'/api/public/student?nis=002')).status,401);
 });
 await t.test('HTTP: XLSX dan DOCX impor berjalan pada build produksi',async()=>{
  const {Document,Packer,Paragraph}=await import('docx');const doc=new Document({sections:[{children:['TIPE: mc','PERTANYAAN: Uji','A: Ya','B: Tidak','KUNCI: A','---'].map(text=>new Paragraph(text))}]});
  const form=new FormData();form.set('kind','questions');form.set('file',new File([await Packer.toBuffer(doc)],'test.docx'));
  const r=await fetch(base+'/api/guru/import/preview',{method:'POST',headers:{Cookie:current,Origin:base},body:form});assert.equal(r.status,200);assert.equal((await r.json()).valid.length,1);
  const exported=await fetch(base+'/api/guru/results/xlsx',{headers:{Cookie:current}});assert.equal(exported.status,200);assert.ok((await exported.arrayBuffer()).byteLength>1000);
 });
});
