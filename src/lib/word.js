import {XMLParser} from 'fast-xml-parser';
import {inspectZip} from './zip.js';
import {assert} from './util.js';

export async function readWordText(bytes) {
  const xml=await inspectZip(bytes,'word/document.xml');
  assert(xml,'Dokumen Word tidak valid');
  assert(!/<!DOCTYPE|<!ENTITY/i.test(xml),'Deklarasi entitas XML tidak diizinkan');
  const tree=new XMLParser({preserveOrder:true,ignoreAttributes:true,trimValues:false,processEntities:true}).parse(xml);
  function text(nodes) {
    let result='';
    for(const node of nodes||[])for(const [key,value]of Object.entries(node)) {
      if(key==='#text')result+=value;
      else if(key==='w:tab')result+='\t';
      else if(key==='w:br'||key==='w:cr')result+='\n';
      else if(Array.isArray(value))result+=text(value)+(key==='w:p'?'\n':'');
    }
    return result;
  }
  return text(tree);
}
