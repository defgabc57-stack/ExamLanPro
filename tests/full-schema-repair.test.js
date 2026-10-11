import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseSchema,repairAllSchema} from '../scripts/full-schema-repair.js';
const SOURCE = await readFile(new URL('../db/migrations/001_init.sql',import.meta.url),'utf8');
const canonical = parseSchema(SOURCE);
const noLog={log(){},warn(){}};
function fakeDb(legacy={}) {
  const tables=new Map(Object.entries(legacy).map(([table, data])=>[
    table, {columns:new Map(Object.entries(data.columns||{})),rows:data.rows||0}
  ]));
  const issued=[];
  return {
    tables,issued,
    async execute(sql) {
      if(sql.includes('information_schema.TABLES')) {
        return [[...tables.keys()].map(table_name=>({table_name}))];
      }
      if(sql.includes('information_schema.COLUMNS')) {
        return [[...tables.entries()].flatMap(([table_name,value]) =>
          [...value.columns.entries()].map(([column_name,column_type])=>({table_name,column_name,column_type})))];
      }
      throw Error('unexpected execute '+sql);
    },
    async query(sql) {
      issued.push(sql);
      const create=sql.match(/^CREATE TABLE IF NOT EXISTS\s+`?([a-z_]+)`?/i);
      if(create) {
        const def=canonical.find(s=>s.table===create[1]);
        tables.set(create[1],{columns:new Map([...def.columns].map(([name,value])=>[name, /^BIGINT\s+UNSIGNED/i.test(value) ? 'bigint unsigned' : value])), rows:0});
        return [[],[]];
      }
      const alter=sql.match(/^ALTER TABLE `([a-z_]+)` ADD COLUMN `([a-z_]+)` (.+)$/i);
      if(alter) {
        tables.get(alter[1]).columns.set(alter[2],alter[3]);return [[],[]];
      }
      const count=sql.match(/^SELECT COUNT\(\*\) AS total FROM `([a-z_]+)`/i);
      if(count)return [[{total: tables.get(count[1]).rows}],[]];
      throw Error('unexpected query: '+sql);
    }
  };
}
test('parser mengekstrak 17 tabel sesuai skema utama',()=>{
  assert.equal(canonical.length,17);
  assert.ok(canonical.find(x=>x.table==='quizzes').columns.has('duration_minutes'));
  assert.ok(canonical.find(x=>x.table==='quizzes').columns.has('updated_at'));
  for(const name of ['exam_results','time_extension_requests','trash_items'])assert.ok(canonical.some(x=>x.table===name));
});
test('membuat tabel baru yang belum ada lalu dapat dijalankan dua kali',async()=>{
  const db=fakeDb();
  const first=await repairAllSchema(db,'examlan',SOURCE,noLog);
  assert.equal(first.createdTables.length,17);
  assert.deepEqual(first.addedColumns,['questions.answer_code']);
  assert.ok(db.tables.has('exam_results'));
  assert.ok(db.tables.has('trash_items'));
  const second=await repairAllSchema(db,'examlan',SOURCE,noLog);
  assert.equal(second.createdTables.length,0);
  assert.equal(second.addedColumns.length,0);
});
test('melengkapi kolom quizzes lama tanpa menghapus data',async()=>{
  const db=fakeDb({quizzes:{columns:{id:'bigint unsigned',title:'varchar(255)',description:'text'},rows:25}});
  const result=await repairAllSchema(db,'examlan',SOURCE,noLog);
  assert.ok(result.addedColumns.includes('quizzes.duration_minutes'));
  assert.ok(result.addedColumns.includes('quizzes.updated_at'));
  assert.ok(result.addedColumns.includes('quizzes.class_name'));
  assert.ok(result.warnings.some(w=>w.includes('60 menit')));
  assert.equal(db.tables.get('quizzes').rows,25);
  assert.ok(db.issued.some(sql=>sql.includes('ADD COLUMN `duration_minutes` INT UNSIGNED NOT NULL DEFAULT 60')));
  assert.ok(!db.issued.some(sql=>/^\s*(?:DROP\s+TABLE|TRUNCATE|DELETE\s+FROM)\b/i.test(sql)));
});
test('gagal sebelum perubahan saat jenis id lama tidak kompatibel dengan FK',async()=>{
  const db=fakeDb({quizzes:{columns:{id:'int',title:'varchar(255)'},rows:1}});
  await assert.rejects(()=>repairAllSchema(db,'examlan',SOURCE,noLog),/BIGINT UNSIGNED/);
  assert.equal(db.issued.length,0);
});
test('menolak menebak nilai kolom wajib pada tabel lama berisi data',async()=>{
  const db=fakeDb({quizzes:{columns:{id:'bigint unsigned',description:'text'},rows:5}});
  await assert.rejects(()=>repairAllSchema(db,'examlan',SOURCE,noLog),/kolom wajib title/);
});
