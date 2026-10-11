import test from 'node:test';import assert from 'node:assert/strict';
import {hash,shuffle,positiveInt} from '../src/lib/util.js';
test('sha256 token konsisten, tidak menyimpan raw token',()=>{assert.equal(hash('demo'),hash('demo'));assert.equal(hash('demo').length,64)});
test('shuffle mempertahankan anggota tanpa mengubah input',()=>{const source=[1,2,3,4];const out=shuffle(source);assert.deepEqual([...out].sort(),source);assert.deepEqual(source,[1,2,3,4])});
test('validasi integer ketat',()=>{assert.throws(()=>positiveInt('abc'));assert.throws(()=>positiveInt(0));assert.equal(positiveInt('10'),10)});
