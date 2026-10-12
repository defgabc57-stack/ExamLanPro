import {fork} from 'node:child_process';
import path from 'node:path';
import {httpError} from './util.js';

let activeParsers=0;
export function parseBinaryImport(bytes,ext) {
  if(activeParsers>=2)return Promise.reject(httpError('Dua impor sedang diproses. Coba lagi sesaat.',429));
  return new Promise((resolve,reject)=>{
    const worker=fork(path.join(process.cwd(),'src/lib/import-worker.js'),[],{
      execArgv:['--max-old-space-size=192'],serialization:'advanced',stdio:['ignore','ignore','ignore','ipc'],
    });
    activeParsers++;
    let settled=false;
    const finish=(error,value)=>{if(settled)return;settled=true;activeParsers--;clearTimeout(timeout);worker.kill();error?reject(error):resolve(value)};
    const timeout=setTimeout(()=>finish(httpError('Parsing impor melewati batas waktu',400)),15000);
    worker.once('message',message=>finish(message.ok?null:httpError('Berkas tidak dapat dibaca: '+message.error,400),message.value));
    worker.once('error',error=>finish(error));
    worker.once('exit',()=>finish(httpError('Berkas tidak dapat diproses dalam batas memori',400)));
    worker.send({bytes,ext},error=>{if(error)finish(error)});
  });
}
