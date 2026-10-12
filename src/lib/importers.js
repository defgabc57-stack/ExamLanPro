import {parseBinaryImport} from './import-parser.js';
import Papa from 'papaparse';
import {assert,str} from './util.js';
import {CAUSE_CODES} from './grading.js';
import {validateQuestion} from './quizzes.js';
const headers=['tipe','pertanyaan','teks_kasus','pernyataan','alasan','opsi_a','opsi_b','opsi_c','opsi_d','kunci_jawaban','pembahasan'];
export function parseWordText(text){const chunks=text.split(/\r?\n\s*---+\s*\r?\n/).map(x=>x.trim()).filter(Boolean);return chunks.map(block=>{const obj={};let last='';for(const line of block.split(/\r?\n/)){const match=line.match(/^\s*(TIPE|PERTANYAAN|KASUS|PERNYATAAN|ALASAN|A|B|C|D|E|KUNCI|PEMBAHASAN|SKALA_[A-E])\s*:\s*(.*)$/i);if(match){last=match[1].toUpperCase();obj[last]=match[2]}else if(last)obj[last]+='\n'+line;}
 const scale={};for(const key of ['A','B','C','D','E']){const value=obj['SKALA_'+key];if(value){const parts=value.split('|').map(x=>x.trim());scale['opsi_'+key.toLowerCase()]=parts[0];scale['skala_'+key.toLowerCase()]=parts[1]??String(key.charCodeAt(0)-64)}}
 return {tipe:obj.TIPE||'mc',pertanyaan:obj.PERTANYAAN||'',teks_kasus:obj.KASUS||'',pernyataan:obj.PERNYATAAN||'',alasan:obj.ALASAN||'',opsi_a:obj.A||'',opsi_b:obj.B||'',opsi_c:obj.C||'',opsi_d:obj.D||'',opsi_e:obj.E||'',kunci_jawaban:obj.KUNCI||'',pembahasan:obj.PEMBAHASAN||'',...scale};}).filter(x=>x.pertanyaan||x.pernyataan||x.kunci_jawaban)}
export function questionRow(row){const type=str(row.tipe||'mc').toLowerCase();const optKeys=['a','b','c','d','e'];const options=optKeys.map((key,i)=>{const text=str(row[`opsi_${key}`]);const scoreRaw=row[`skala_${key}`];return {text,score:scoreRaw==null||scoreRaw===''?i+1:Number(scoreRaw)}}).filter(o=>o.text);const key=str(row.kunci_jawaban);
 const q={type,question:str(row.pertanyaan),passage:str(row.teks_kasus),statement:str(row.pernyataan),reason:str(row.alasan),explanation:str(row.pembahasan),options};
 if(type==='complex'){q.answers=key.split(/[,;\s]+/).filter(Boolean).map(x=>/^[a-e]$/i.test(x)?x.toUpperCase().charCodeAt(0)-65:Number(x));}
 else if(type==='cause_effect'){q.answer=key;}
 else if(type==='scaled'){q.answer=0;}
 else{q.answer=/^[a-e]$/i.test(key)?key.toUpperCase().charCodeAt(0)-65:Number(key)}
 return q;
}
export function validateRows(rows,kind){const errors=[];const valid=[];const seen=new Set();for(let i=0;i<rows.length;i++){try{const row=rows[i];if(kind==='students'){
  const nis=str(row.INDUK??row.NIS??row.nis);const name=str(row.NAMA??row.nama);const className=str(row.KELAS??row.kelas);assert(name&&className,'Nama dan kelas wajib diisi');assert(nis.length<=30&&name.length<=255&&className.length<=80,'Nilai terlalu panjang');if(nis){assert(!seen.has(nis),'NIS berulang dalam file');seen.add(nis)}valid.push({nis,name,className});
 }else{const q=questionRow(row);validateQuestion(q,i);valid.push(q)}}catch(e){errors.push({row:i+2,error:e.message})}}return {valid,errors,count:rows.length,ok:errors.length===0};}
export async function readImportFile(file,kind){assert(file&&file.size,'Silakan pilih file');assert(file.size<=5*1024*1024,'Ukuran maksimal 5 MB');const name=str(file.name).toLowerCase();const ext=name.split('.').pop();assert(['xlsx','csv','txt','docx'].includes(ext),ext==='xls'?'Format XLS lama tidak didukung. Simpan ulang sebagai XLSX atau CSV.':'Format file tidak didukung');assert(!(kind==='students'&&['txt','docx'].includes(ext)),'File siswa harus Excel atau CSV');const bytes=Buffer.from(await file.arrayBuffer());let rows=[];
 if(ext==='xlsx')rows=await parseBinaryImport(bytes,ext);
 else if(ext==='docx')rows=parseWordText(await parseBinaryImport(bytes,ext));
 else if(ext==='txt'){rows=parseWordText(bytes.toString('utf8'))}
 else {const parsed=Papa.parse(bytes.toString('utf8').replace(/^\uFEFF/,''),{header:true,skipEmptyLines:true,delimiter:''});assert(!parsed.errors.length,'CSV tidak valid: '+parsed.errors[0]?.message);rows=parsed.data;}
 assert(rows.length&&rows.length<=2000,'Data harus berisi 1 hingga 2000 baris');return validateRows(rows,kind);
}
export {headers};
