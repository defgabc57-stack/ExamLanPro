import test from 'node:test';
import assert from 'node:assert/strict';
import {gradeExam,normalizeAnswer} from '../src/lib/grading.js';
import {positiveInt,scheduledDate,hash} from '../src/lib/util.js';
import {nextRevision} from '../src/lib/revisions.js';
import {localDateIso} from '../src/lib/client.js';
import {questionStatistics} from '../src/lib/analytics.js';
import {BACKUP_TABLES,validateBackup} from '../src/lib/backup.js';

test('scaled kosong dan invalid bernilai nol; opsi indeks 0 tetap valid',()=>{
 const q={type:'scaled',options:[{score:5},{score:1}]};
 for(const answer of [null,undefined,'',-1,99,{},[]])assert.equal(gradeExam([q],{0:normalizeAnswer(q,answer,[0,1])}).score,0);
 assert.equal(gradeExam([q],{0:0}).score,100);
});
test('revisi UI dimulai dari maksimum server, termasuk revisi browser lama',()=>{
 const legacy=Date.now()*1000;
 assert.equal(positiveInt(legacy,1,Number.MAX_SAFE_INTEGER),legacy);
 assert.equal(nextRevision(0,legacy),legacy+1);
 assert.equal(nextRevision(4,2),5);
 assert.throws(()=>nextRevision(Number.MAX_SAFE_INTEGER));
 assert.throws(()=>positiveInt(Number.MAX_SAFE_INTEGER+1,1,Number.MAX_SAFE_INTEGER),e=>e.status===400);
});
test('jadwal wajib offset dan waktu Asia/Jakarta tetap tepat di UTC',()=>{
 assert.equal(scheduledDate('2026-10-12T08:00:00+07:00'),'2026-10-12 01:00:00.000');
 assert.throws(()=>scheduledDate('2026-10-12T08:00'),/zona waktu/);
 assert.equal(localDateIso('2026-10-12T08:00:00+07:00'),'2026-10-12T01:00:00.000Z');
});
test('analitik memisahkan soal, versi, dan paket walau posisi acak sama',()=>{
 const q={id:10,displayOrder:0,question:'Pertanyaan A',options:[{text:'Ya'}]};
 const rows=[
  {quiz_id:1,quiz:'A',position:0,question_snapshot_json:q,is_correct:1},
  {quiz_id:1,quiz:'A',position:3,question_snapshot_json:JSON.stringify(q),is_correct:0},
  {quiz_id:1,quiz:'A',position:0,question_snapshot_json:{...q,id:11,question:'B'},is_correct:1},
  {quiz_id:1,quiz:'A',position:0,question_snapshot_json:{...q,question:'Versi baru'},is_correct:1},
  {quiz_id:2,quiz:'B',position:0,question_snapshot_json:q,is_correct:1},
 ];
 const result=questionStatistics(rows);assert.equal(result.length,4);assert.equal(result[0].total,2);assert.equal(result[0].correct,1);
});
test('backup wajib media lengkap dan checksum valid; path traversal ditolak',()=>{
 const data=Buffer.from('gambar').toString('base64');
 const backup={version:2,tables:Object.fromEntries(BACKUP_TABLES.map(t=>[t,[]])),files:[{path:'/uploads/test.png',size:6,data,checksum:hash(data)}]};
 backup.tables.media_assets=[{file_path:'/uploads/test.png',size_bytes:6}];
 assert.equal(validateBackup(backup,'/tmp').size,1);
 assert.throws(()=>validateBackup({...backup,files:[]},'/tmp'),/tidak lengkap/);
 assert.throws(()=>validateBackup({...backup,files:[{...backup.files[0],data:'tampered'}]},'/tmp'),/Checksum/);
 assert.throws(()=>validateBackup({...backup,files:[{...backup.files[0],path:'/uploads/../secret.png'}]},'/tmp'),/Lokasi/);
});
