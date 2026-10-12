import test from 'node:test';
import assert from 'node:assert/strict';
import {repairQuizSubject} from '../scripts/schema-repair.js';
function fakeDb({hasTable=true,columns=[]}={}){
  const statements=[];
  return {
    statements,
    async execute(sql,params){
      statements.push(sql);
      if(sql.includes('information_schema.TABLES'))return [[{total:hasTable?1:0}]];
      if(sql.includes('information_schema.COLUMNS'))return [[{total:columns.includes(params[2])?1:0}]];
      throw new Error('SQL tidak diharapkan: '+sql);
    },
    async query(sql){statements.push(sql);return [[],[]]}
  };
}
test('perbaikan menambah kedua kolom yang belum tersedia',async()=>{
  const db=fakeDb();
  assert.deepEqual(await repairQuizSubject(db,'examlan'),{changed:true});
  assert.equal(db.statements.filter(s=>s.startsWith('ALTER TABLE')).length,2);
});
test('perbaikan idempotent saat kolom subject sudah ada',async()=>{
  const db=fakeDb({columns:['subject','class_name']});
  assert.deepEqual(await repairQuizSubject(db,'examlan'),{changed:false});
  assert.equal(db.statements.filter(s=>s.startsWith('ALTER TABLE')).length,0);
});
test('perbaikan memberi pesan jika tabel quizzes belum ada',async()=>{
  const db=fakeDb({hasTable:false});
  await assert.rejects(()=>repairQuizSubject(db,'examlan'),/db:init/);
});

for(const existing of ['subject','class_name'])test('perbaikan hanya menambah kolom pasangan '+existing,async()=>{const db=fakeDb({columns:[existing]});await repairQuizSubject(db,'examlan');const alters=db.statements.filter(s=>s.startsWith('ALTER TABLE'));assert.equal(alters.length,1);assert.ok(!alters[0].includes('ADD COLUMN '+existing+' '))});
