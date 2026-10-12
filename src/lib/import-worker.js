import {readSpreadsheet} from './spreadsheets.js';
import {readWordText} from './word.js';
process.once('message',async({bytes,ext})=>{
  try {process.send({ok:true,value:ext==='xlsx'?await readSpreadsheet(bytes):await readWordText(bytes)});}
  catch(e){process.send({ok:false,error:e.message});}
  finally{process.disconnect();}
});
