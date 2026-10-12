import ExcelJS from 'exceljs';
import {assert} from './util.js';
import {inspectZip} from './zip.js';

function cellText(value) {
  if(value==null)return '';
  if(typeof value==='object') {
    if(value.formula||value.sharedFormula)return cellText(value.result);
    if(value.richText)return value.richText.map(part=>part.text).join('');
    if(value.text!==undefined)return String(value.text);
    if(value instanceof Date)return value.toISOString();
    return '';
  }
  return String(value);
}
export async function readSpreadsheet(bytes) {
  await inspectZip(bytes);
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes);
  const sheet=workbook.worksheets[0];assert(sheet,'Lembar Excel tidak ditemukan');
  assert(sheet.rowCount<=2001,'Data harus berisi maksimal 2000 baris');
  assert(sheet.columnCount<=100,'Maksimal 100 kolom');
  const headers=sheet.getRow(1).values.slice(1).map(cellText);
  const nonempty=headers.filter(Boolean);assert(new Set(nonempty).size===nonempty.length,'Nama kolom Excel berulang');
  const rows=[];
  for(let n=2;n<=sheet.rowCount;n++) {
    const row=sheet.getRow(n);if(!row.hasValues)continue;
    const record=Object.create(null);
    headers.forEach((header,i)=>{if(header)record[header]=cellText(row.getCell(i+1).value)});
    rows.push(record);
  }
  return rows;
}
export async function exportResultsXlsx(rows) {
  const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Hasil');
  const keys=['id','quiz_id','nis','name','className','quiz','score','correct','wrong','submitted_at'];
  sheet.columns=keys.map(key=>({header:key,key,width:20}));
  for(const row of rows) sheet.addRow({...row,submitted_at:row.submitted_at?new Date(row.submitted_at).toISOString():''});
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
