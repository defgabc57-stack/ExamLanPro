import test from 'node:test';
import assert from 'node:assert/strict';
import {repairQuizSubject} from '../scripts/schema-repair.js';
function fakeDb({hasTable=true,hasColumn=false}={}){
  const statements=[];
  return {
    statements,
    async execute(sql){
      statements.push(sql);
      if(sql.includes('information_schema.TABLES'))return [[{total:hasTable?1:0}]];
      if(sql.includes('information_schema.COLUMNS'))return [[{total:hasColumn?1:0}]];
      throw new Error('SQL tidak diharapkan: '+sql);
    },
    async query(sql){statements.push(sql);return [[],[]]}
  };
}
test('perbaikan menambah hanya kolom subject ketika kolom tidak ada',async()=>{
  const db=fakeDb();
  assert.deepEqual(await repairQuizSubject(db,'examlan'),{changed:true});
  assert.equal(db.statements.filter(s=>s.startsWith('ALTER TABLE')).length,1);
});
test('perbaikan idempotent saat kolom subject sudah ada',async()=>{
  const db=fakeDb({hasColumn:true});
  assert.deepEqual(await repairQuizSubject(db,'examlan'),{changed:false});
  assert.equal(db.statements.filter(s=>s.startsWith('ALTER TABLE')).length,0);
});
test('perbaikan memberi pesan jika tabel quizzes belum ada',async()=>{
  const db=fakeDb({hasTable:false});
  await assert.rejects(()=>repairQuizSubject(db,'examlan'),/db:init/);
});
