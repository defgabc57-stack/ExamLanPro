import fs from 'node:fs/promises';
import path from 'node:path';
import {BACKUP_TABLES,validateBackup,mediaLocation} from './backup.js';
import {assert,fmtDate} from './util.js';

// Restore only into a separately migrated, empty database. Never delete data.
export async function restoreBackup(conn,snapshot,root) {
  const files=validateBackup(snapshot,root),created=[];
  const [db]=await conn.query('SELECT DATABASE() AS name');
  assert(db[0]?.name,'Pilih database tujuan');
  const [columns]=await conn.execute('SELECT TABLE_NAME AS table_name,COLUMN_NAME AS column_name,DATA_TYPE AS data_type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=?',[db[0].name]);
  const types=new Map(columns.map(c=>[c.table_name+'.'+c.column_name,c.data_type]));
  for(const table of BACKUP_TABLES){const [rows]=await conn.query('SELECT COUNT(*) AS count FROM `'+table+'`');assert(Number(rows[0].count)===0,'Database tujuan harus kosong: '+table);}
  // Validate field names and types before writing any files.
  for(const table of BACKUP_TABLES)for(const row of snapshot.tables[table])for(const key of Object.keys(row))assert(/^[a-z_][a-z0-9_]*$/i.test(key)&&types.has(table+'.'+key),'Kolom backup tidak dikenal: '+table+'.'+key);
  await fs.mkdir(path.join(root,'public','uploads'),{recursive:true});
  const uploads=await fs.realpath(path.join(root,'public','uploads'));
  try {
    await conn.beginTransaction();
    for(const [filePath,bytes] of files) {
      const location=mediaLocation(root,filePath);
      assert(await fs.realpath(path.dirname(location))===uploads,'Direktori media tidak sah');
      try {const existing=await fs.readFile(location);assert(existing.equals(bytes),'File media tujuan berbeda: '+filePath);assert(!(await fs.lstat(location)).isSymbolicLink(),'Symlink media tidak diizinkan');}
      catch(error){if(error.code!=='ENOENT')throw error;await fs.writeFile(location,bytes,{flag:'wx'});created.push(location);}
    }
    for(const table of BACKUP_TABLES)for(const row of snapshot.tables[table]) {
      const keys=Object.keys(row);
      const values=keys.map(key=>{
        const value=row[key],type=types.get(table+'.'+key);
        if(value==null)return null;
        if(['datetime','timestamp'].includes(type))return fmtDate(value);
        if(type==='json')return typeof value==='string'?value:JSON.stringify(value);
        return value;
      });
      await conn.execute('INSERT INTO `'+table+'` ('+keys.map(k=>'`'+k+'`').join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')',values);
    }
    await conn.commit();return {tables:BACKUP_TABLES.length,files:files.size};
  }catch(error){await conn.rollback();await Promise.all(created.map(file=>fs.unlink(file)));throw error;}
}
