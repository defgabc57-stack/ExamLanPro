import {query} from './db.js';
import {hash,httpError} from './util.js';

// Atomic database buckets work across workers. Never trust client IP headers.
export async function consumeRateLimit(key, limit=5, windowSeconds=300) {
  await query('DELETE FROM rate_limit_buckets WHERE expires_at<=UTC_TIMESTAMP(3) LIMIT 100');
  const bucket=hash(key);
  await query(`INSERT INTO rate_limit_buckets(bucket_hash,request_count,expires_at)
    VALUES(?,1,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? SECOND))
    ON DUPLICATE KEY UPDATE
      request_count=IF(expires_at<=UTC_TIMESTAMP(3),1,request_count+1),
      expires_at=IF(expires_at<=UTC_TIMESTAMP(3),VALUES(expires_at),expires_at)`,[bucket,windowSeconds]);
  const [row]=await query('SELECT request_count FROM rate_limit_buckets WHERE bucket_hash=?',[bucket]);
  if (!row || row.request_count>limit) throw httpError('Terlalu banyak percobaan. Ulangi dalam 5 menit.',429);
}
export async function clearRateLimit(key) {
  await query('DELETE FROM rate_limit_buckets WHERE bucket_hash=?',[hash(key)]);
}
