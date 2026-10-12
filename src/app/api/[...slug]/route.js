import {NextResponse} from 'next/server';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {exportResultsXlsx} from '@/lib/spreadsheets.js';
import {issueStudentAccess} from '@/lib/participants.js';
import {Document,Packer,Paragraph,TextRun,HeadingLevel} from 'docx';
import {requireTeacher,teacherSession,loginTeacher,logoutTeacher,changePassword} from '@/lib/auth.js';
import {publicQuizzes,saveQuiz,changeReview} from '@/lib/quizzes.js';
import {checkEligibility,startAttempt,resumeAttempt,saveAnswers,submitAttempt,getReview,requestExtension,extensionStatus} from '@/lib/exam.js';
import {dashboard,teacherData,listResults,upsertStudent,importStudents,allowRetake,pendingExtensions,decideExtension,trashItem,listTrash,restoreTrash,createBackup,clearResults,analytics,systemStatus,audit} from '@/lib/admin.js';
import {readImportFile} from '@/lib/importers.js';
import {query} from '@/lib/db.js';
import {assert,positiveInt,str} from '@/lib/util.js';
import {isAllowedOrigin} from '@/lib/origin.js';
export const runtime='nodejs';export const dynamic='force-dynamic';
const response=x=>NextResponse.json(x,{headers:{'Cache-Control':'no-store'}});
async function body(req){return await req.json().catch(()=>({}));}
function download(content,name,type){return new NextResponse(content,{headers:{'Content-Type':type,'Content-Disposition':`attachment; filename="${name}"`,'Cache-Control':'no-store'}});}
function csv(data,headers){const escape=s=>'"'+String(s??'').replaceAll('"','""')+'"';return '\uFEFF'+[headers.map(escape).join(','),...data.map(r=>headers.map(k=>escape(r[k])).join(','))].join('\r\n')}
async function dispatch(req,context){const route=(await context.params).slug.join('/');const method=req.method;const url=new URL(req.url);const args=Object.fromEntries(url.searchParams);
 if(method==='POST'&&!isAllowedOrigin({origin:req.headers.get('origin'),host:req.headers.get('host'),requestUrl:req.url,appUrl:process.env.APP_URL}))throw Object.assign(new Error('Origin tidak diizinkan'),{status:403});
 if(route==='auth/guru/login'&&method==='POST')return response(await loginTeacher(await body(req),req));
 if(route==='auth/guru/status')return response({teacher:await teacherSession()});
 if(route==='public/quizzes')return response({quizzes:await publicQuizzes()});
 if(route==='ujian/check'&&method==='POST')return response(await checkEligibility(await body(req)));
 if(route==='ujian/mulai'&&method==='POST')return response(await startAttempt(await body(req)));
 if(route==='ujian/sesi')return response(await resumeAttempt(str(args.token)));
 if(route==='ujian/answers'&&method==='POST'){const b=await body(req);return response(await saveAnswers(b.token,b));}
 if(route==='ujian/submit'&&method==='POST'){const b=await body(req);return response(await submitAttempt(b.token,b.answers,b.revision));}
 if(route==='ujian/review')return response(await getReview(args.token,args.reviewToken));
 if(route==='ujian/extension/request'&&method==='POST'){const b=await body(req);return response(await requestExtension(b.token));}
 if(route==='ujian/extension/status')return response(await extensionStatus(args.token));
 const teacher=await requireTeacher();if(teacher.changePasswordRequired&&!['auth/guru/password','auth/guru/logout'].includes(route))throw Object.assign(new Error('Ganti sandi awal sebelum mengakses dashboard'),{status:403});
 if(route==='auth/guru/logout'&&method==='POST')return response(await logoutTeacher());
 if(route==='auth/guru/password'&&method==='POST')return response(await changePassword(await body(req)));
 if(route==='guru/dashboard')return response(await dashboard());
 if(route==='guru/data')return response(await teacherData());
 if(route==='guru/kuis'&&method==='POST')return response(await saveQuiz(await body(req),teacher));
 if(route==='guru/siswa'&&method==='POST')return response(await upsertStudent(await body(req),teacher));
 if(route==='guru/siswa/access'&&method==='POST'){const b=await body(req);return response(await issueStudentAccess(b.id,teacher));}
 if(route==='guru/siswa/import'&&method==='POST'){const f=await req.formData(),report=await readImportFile(f.get('file'),'students');assert(report.ok,'Periksa file: '+JSON.stringify(report.errors));return response(await importStudents(report.valid,teacher));}
 if(route==='guru/hasil')return response({results:await listResults(args)});
 if(route==='guru/hasil/delete'&&method==='POST'){const b=await body(req);const ids=Array.isArray(b.ids)?b.ids:[b.id];for(const id of ids)await trashItem('results',id,teacher);return response({ok:true,count:ids.length})}
 if(route==='guru/siswa/delete'&&method==='POST'){const b=await body(req);return response(await trashItem('students',b.id,teacher));}
 if(route==='guru/retake'&&method==='POST')return response(await allowRetake(await body(req),teacher));
 if(route==='guru/review'&&method==='POST'){const b=await body(req);await changeReview(positiveInt(b.quizId),!!b.enabled);await audit(teacher,'review.toggle',b.quizId);return response({ok:true});}
 if(route==='guru/extensions')return response({extensions:await pendingExtensions()});
 if(route==='guru/extensions/decision'&&method==='POST'){const b=await body(req);return response(await decideExtension(b.id,b.approve,b.minutes,teacher));}
 if(route==='guru/analytics')return response(await analytics(args.quizId));
 if(route==='guru/trash')return response({items:await listTrash()});
 if(route==='guru/trash/restore'&&method==='POST'){const b=await body(req);return response(await restoreTrash(b.id,teacher));}
 if(route==='guru/backup'&&method==='POST')return response(await createBackup('manual',teacher));
 if(route==='guru/reset-results'&&method==='POST'){const b=await body(req);assert(b.confirm==='HAPUS HASIL','Konfirmasi harus HAPUS HASIL');return response(await clearResults(teacher))}
 if(route==='guru/audit'){const rows=await query('SELECT id,actor_type,action,target,created_at FROM audit_logs ORDER BY created_at DESC LIMIT 100');return response({logs:rows})}
 if(route==='guru/health')return response(await systemStatus());
 if(route==='guru/upload'&&method==='POST'){
  const fd=await req.formData(),file=fd.get('file');assert(file&&file.size&&file.size<=3*1024*1024,'Gambar wajib diisi, maks 3 MB');const bytes=Buffer.from(await file.arrayBuffer());const isPng=bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a';const isJpg=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;const isWebp=bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';assert(isPng||isJpg||isWebp,'Hanya gambar PNG, JPEG, atau WebP');const ext=isPng?'png':isJpg?'jpg':'webp';const filename=randomBytes(18).toString('hex')+'.'+ext;const dir=path.join(process.cwd(),'public','uploads');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,filename),bytes,{flag:'wx'});const asset='/uploads/'+filename;await query('INSERT INTO media_assets(file_path,mime_type,size_bytes) VALUES(?,?,?)',[asset,isPng?'image/png':isJpg?'image/jpeg':'image/webp',bytes.length]);return response({ok:true,url:asset});
 }
 if(route==='guru/import/preview'&&method==='POST'){const fd=await req.formData(),kind=fd.get('kind')==='students'?'students':'questions';const result=await readImportFile(fd.get('file'),kind);return response({...result,valid:result.valid.slice(0,2000)});}
 if(route==='guru/import/questions'&&method==='POST'){const fd=await req.formData();const result=await readImportFile(fd.get('file'),'questions');assert(result.ok,'Impor gagal: '+JSON.stringify(result.errors));return response({ok:true,questions:result.valid});}
 if(route==='guru/templates'){
  const names={questions:'Template_Import_Soal_ExamLAN.xlsx',students:'Template_Import_Data_Siswa_ExamLAN.xlsx',word:'Template_Import_Soal_ExamLAN.docx'};const filename=names[args.kind];assert(filename,'Jenis template tidak ditemukan',404);const bytes=await fs.readFile(path.join(process.cwd(),'templates',filename));return download(bytes,filename,filename.endsWith('.docx')?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 }
 if(route==='guru/results/csv'){const rows=await listResults(args);const headers=['id','nis','name','className','quiz','score','correct','wrong','submitted_at'];return download(csv(rows,headers),'hasil-examlan.csv','text/csv; charset=utf-8')}
 if(route==='guru/results/xlsx'){const rows=await listResults(args);return download(await exportResultsXlsx(rows),'hasil-examlan.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');}
 if(route==='guru/kuis/word'){const id=positiveInt(args.id);const record=(await query('SELECT title FROM quizzes WHERE id=?',[id]))[0];assert(record,'Kuis tidak ditemukan',404);const {getQuestions}=await import('@/lib/quizzes.js');const qs=await getQuestions(id);const children=[new Paragraph({text:record.title,heading:HeadingLevel.HEADING_1}),...qs.flatMap((q,i)=>{const lines=[`TIPE: ${q.type}`,`PERTANYAAN: ${q.question}`,`KASUS: ${q.passage}`,`PERNYATAAN: ${q.statement}`,`ALASAN: ${q.reason}`,...(q.options||[]).map((o,j)=>`${String.fromCharCode(65+j)}: ${o.text}`),`KUNCI: ${q.type==='complex'?q.answers.join(','):q.type==='scaled'?'':q.answer}`,`PEMBAHASAN: ${q.explanation}`,'---'];return lines.map(line=>new Paragraph({children:[new TextRun({text:line})]}));})];const doc=new Document({sections:[{children}]});const bytes=await Packer.toBuffer(doc);return download(bytes,`kuis-${id}.docx`,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');}
 throw Object.assign(new Error('Endpoint tidak ditemukan'),{status:404});
}
async function handler(req,context){try{return await dispatch(req,context)}catch(e){console.error('[ExamLAN API]',e.message);return NextResponse.json({ok:false,error:e.message||'Kesalahan internal'},{status:e.status||((e.code==='ER_DUP_ENTRY')?409:500),headers:{'Cache-Control':'no-store'}})}}
export {handler as GET,handler as POST,handler as DELETE,handler as PATCH};
