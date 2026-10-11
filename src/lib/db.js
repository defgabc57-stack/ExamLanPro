import mysql from 'mysql2/promise';
let pool;
export function db(){if(!pool){pool=mysql.createPool({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME||'examlan',waitForConnections:true,connectionLimit:12,decimalNumbers:true,dateStrings:false,timezone:'Z',multipleStatements:false});}return pool;}
export async function query(sql,params=[]){const [rows]=await db().execute(sql,params);return rows}
export async function transaction(fn){const conn=await db().getConnection();try{await conn.beginTransaction();const result=await fn(conn);await conn.commit();return result}catch(e){await conn.rollback();throw e}finally{conn.release()}}
export async function run(conn,sql,params=[]){const [r]=await conn.execute(sql,params);return r}
