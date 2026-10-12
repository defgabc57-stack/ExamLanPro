import yauzl from 'yauzl';
import {assert} from './util.js';

export const MAX_UNPACKED=30*1024*1024;
// Check ZIP metadata before parsing, then enforce the same bound on actual data.
export function inspectZip(bytes,requestedFile=null) {
  return new Promise((resolve,reject)=>{
    yauzl.fromBuffer(bytes,{lazyEntries:true,validateEntrySizes:true},(error,zip)=>{
      if(error)return reject(error);
      let declared=0,expanded=0,entries=0,result=null,done=false;
      const fail=e=>{if(done)return;done=true;zip.close();reject(e)};
      zip.on('error',fail);
      zip.on('end',()=>{if(done)return;done=true;resolve(result)});
      zip.on('entry',entry=>{
        try {
          declared+=entry.uncompressedSize;
          assert(++entries<=10000&&declared<=MAX_UNPACKED,'Isi arsip terlalu besar');
          assert(!(entry.generalPurposeBitFlag&1),'Arsip terenkripsi tidak didukung');
          if(entry.fileName.endsWith('/')){zip.readEntry();return}
          const collect=entry.fileName===requestedFile;
          if(collect)assert(result===null,'Dokumen XML berulang');
          zip.openReadStream(entry,(err,stream)=>{
            if(err)return fail(err);
            const chunks=[];
            stream.on('data',chunk=>{expanded+=chunk.length;if(expanded>MAX_UNPACKED){stream.destroy();fail(new Error('Isi dokumen terlalu besar'))}else if(collect)chunks.push(chunk)});
            stream.on('error',fail);
            stream.on('end',()=>{if(done)return;if(collect)result=Buffer.concat(chunks).toString('utf8');zip.readEntry()});
          });
        }catch(e){fail(e)}
      });
      zip.readEntry();
    });
  });
}
