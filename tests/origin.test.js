import test from 'node:test';
import assert from 'node:assert/strict';
import {isAllowedOrigin} from '../src/lib/origin.js';
const local={host:'localhost:3001',requestUrl:'http://0.0.0.0:3001/api/auth/guru/login',appUrl:'http://localhost:3001'};
test('localhost:3001 diizinkan walau req.url internal 0.0.0.0:3001',()=>{
  assert.equal(isAllowedOrigin({...local,origin:'http://localhost:3001'}),true);
});
test('127.0.0.1:3001 diizinkan saat user mengakses host tersebut',()=>{
  assert.equal(isAllowedOrigin({...local,host:'127.0.0.1:3001',origin:'http://127.0.0.1:3001'}),true);
});
test('port lain dan domain penyerang ditolak',()=>{
  for(const origin of ['http://localhost:3002','http://localhost.evil.com:3001','https://evil.com','null','file://host','http://localhost:3001.evil.com']){
    assert.equal(isAllowedOrigin({...local,origin}),false,origin);
  }
});
test('host yang benar tapi protokol berbeda ditolak',()=>{
  assert.equal(isAllowedOrigin({...local,origin:'https://localhost:3001'}),false);
});
test('proxy HTTPS boleh memakai APP_URL yang eksplisit',()=>{
  assert.equal(isAllowedOrigin({origin:'https://sekolah.example',host:'127.0.0.1:3001',requestUrl:'http://127.0.0.1:3001/api/a',appUrl:'https://sekolah.example'}),true);
});
test('host palsu atau malformed origin ditolak',()=>{
  assert.equal(isAllowedOrigin({...local,host:'localhost:3001/evil',origin:'http://localhost:3001',appUrl:'http://dummy.test'}),false);
  assert.equal(isAllowedOrigin({...local,origin:'http://localhost:3001/path'}),false);
});
test('request tanpa header Origin tetap diizinkan (klien nonbrowser)',()=>{
  assert.equal(isAllowedOrigin({...local,origin:null}),true);
});
