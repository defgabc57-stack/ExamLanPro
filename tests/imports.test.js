import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {Document,Packer,Paragraph} from 'docx';
import {readImportFile} from '../src/lib/importers.js';
import {exportResultsXlsx} from '../src/lib/spreadsheets.js';

test('XLSX impor mempertahankan NIS berawalan nol dan teks rich text',async()=>{
 const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Siswa');
 sheet.addRow(['INDUK','NAMA','KELAS']);sheet.addRow(['00123',{richText:[{text:'Siswa '},{text:'Uji'}]},'X']);
 const file=new File([await workbook.xlsx.writeBuffer()],'siswa.xlsx');
 const result=await readImportFile(file,'students');
 assert.equal(result.ok,true);assert.deepEqual(result.valid,[{nis:'00123',name:'Siswa Uji',className:'X'}]);
});
test('DOCX membaca teks dalam beberapa run dan karakter XML',async()=>{
 const doc=new Document({sections:[{children:['TIPE: mc','PERTANYAAN: A & B?','A: Ya','B: Tidak','KUNCI: A','PEMBAHASAN: Benar','---'].map(text=>new Paragraph(text))}]});
 const result=await readImportFile(new File([await Packer.toBuffer(doc)],'soal.docx'),'questions');
 assert.equal(result.ok,true);assert.equal(result.valid[0].question,'A & B?');assert.equal(result.valid[0].answer,0);
});
test('impor menolak XLS lama, arsip invalid, dan lebih dari 2000 siswa',async()=>{
 await assert.rejects(()=>readImportFile(new File(['x'],'old.xls'),'students'),/Simpan ulang/);
 await assert.rejects(()=>readImportFile(new File(['not a zip'],'bad.xlsx'),'students'),/tidak dapat dibaca/);
 const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Siswa');sheet.addRow(['INDUK','NAMA','KELAS']);
 for(let i=0;i<2001;i++)sheet.addRow([String(i),'Siswa '+i,'X']);
 const large=new File([await workbook.xlsx.writeBuffer()],'large.xlsx');
 await assert.rejects(()=>readImportFile(large,'students'),/2000/);
});
test('ekspor XLSX menghasilkan workbook valid dan tidak mengeksekusi teks formula',async()=>{
 const bytes=await exportResultsXlsx([{id:1,name:'=1+1',nis:'00123',score:100,submitted_at:'2026-10-12T01:00:00Z'}]);
 const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes);
 assert.equal(workbook.worksheets[0].getCell('D2').value,'=1+1');assert.equal(workbook.worksheets[0].getCell('C2').value,'00123');
});
