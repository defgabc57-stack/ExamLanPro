import fs from 'node:fs/promises';
import path from 'node:path';
import {db,run} from './db.js';
import {hash,assert} from './util.js';

// Authentication sessions and rate-limit buckets are intentionally not restored.
export const BACKUP_TABLES=['teachers','media_assets','students','quizzes','questions','question_options','attempts','attempt_questions','attempt_answers','exam_results','result_breakdowns','retake_permissions','participant_retake_permissions','time_extension_requests','audit_logs','trash_items','backup_runs'];
export function mediaLocation(root,filePath) {
  assert(/^\/uploads\/[A-Za-z0-9_-]+\.(png|jpe?g|webp)$/i.test(filePath),'Lokasi media backup tidak sah');
  return path.join(root,'public',filePath.slice(1));
}
export async function captureBackup(root=process.cwd()) {
  const conn=await db().getConnection();
  try {
    await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    const snapshot={version:2,exportedAt:new Date().toISOString(),tables:{},files:[]};
    for(const table of BACKUP_TABLES) snapshot.tables[table]=await run(conn,'SELECT * FROM `'+table+'`');
    for(const media of snapshot.tables.media_assets) {
      const location=mediaLocation(root,media.file_path);
      const uploads=await fs.realpath(path.join(root,'public','uploads'));
      assert((await fs.realpath(location)).startsWith(uploads+path.sep),'Media tidak berada dalam direktori uploads');
      const bytes=await fs.readFile(location);
      assert(bytes.length===Number(media.size_bytes),'Ukuran media berubah: '+media.file_path);
      snapshot.files.push({path:media.file_path,size:bytes.length,checksum:hash(bytes.toString('base64')),data:bytes.toString('base64')});
    }
    await conn.commit();return snapshot;
  }catch(error){await conn.rollback();throw error}finally{conn.release()}
}
export function validateBackup(snapshot,root) {
  assert(snapshot?.version===2&&snapshot.tables&&Array.isArray(snapshot.files),'Backup lengkap versi 2 diperlukan');
  for(const table of BACKUP_TABLES) assert(Array.isArray(snapshot.tables[table]),'Tabel backup tidak lengkap: '+table);
  const files=new Map();
  for(const file of snapshot.files) {
    mediaLocation(root,file.path);assert(!files.has(file.path),'Media backup berulang');
    assert(typeof file.data==='string'&&hash(file.data)===file.checksum,'Checksum media tidak sesuai');
    const bytes=Buffer.from(file.data,'base64');assert(bytes.toString('base64')===file.data&&bytes.length===file.size,'Data media tidak sah');
    files.set(file.path,bytes);
  }
  for(const media of snapshot.tables.media_assets) assert(files.has(media.file_path)&&files.get(media.file_path).length===Number(media.size_bytes),'Media backup tidak lengkap: '+media.file_path);
  return files;
}
