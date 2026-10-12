import {createHash,randomBytes,randomInt,randomUUID} from 'node:crypto';
export function uid(){return randomUUID()}
export function token(){return randomBytes(32).toString('base64url')}
export function hash(value){return createHash('sha256').update(String(value)).digest('hex')}
export function shuffle(input){const result=[...input];for(let i=result.length-1;i>0;i--){const j=randomInt(i+1);[result[i],result[j]]=[result[j],result[i]]}return result}
export function j(value,fallback=null){if(value===undefined||value===null)return fallback;try{return typeof value==='string'?JSON.parse(value):value}catch{return fallback}}
export function date(value){return value?new Date(value):null}
export function str(value){return String(value??'').trim()}
export function positiveInt(value,min=1,max=100000){const v=Number(value);if(!Number.isSafeInteger(v)||v<min||v>max)throw httpError(`Nilai harus bilangan bulat ${min}-${max}`);return v}
export function fmtDate(v){if(!v)return null;const d=new Date(v);assert(Number.isFinite(d.getTime()),'Tanggal tidak sah');return d.toISOString().slice(0,23).replace('T',' ')}
export function scheduledDate(v){if(!v)return null;assert(typeof v==='string'&&/(Z|[+-]\d{2}:\d{2})$/.test(v),'Jadwal harus menyertakan zona waktu');return fmtDate(v)}
export function httpError(message,status=400){const e=new Error(message);e.status=status;return e}
export function assert(cond,message,status=400){if(!cond)throw httpError(message,status)}
