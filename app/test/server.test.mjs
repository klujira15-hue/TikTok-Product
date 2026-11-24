import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {mkdtempSync,rmSync} from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
test('capture auth, imports, atomic validation, persistence, history, backup and formula-safe CSV',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'rujira-test-'));const port=14317;const base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['server.mjs'],{cwd:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),env:{...process.env,PORT:String(port),DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
 try{await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error('Server exit '+code)));setTimeout(()=>reject(Error('Server timeout')),8000).unref();});
 const call=async(url,b,headers={})=>{const r=await fetch(base+url,b===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(b)});return {status:r.status,body:await r.json()};};
 assert.equal((await call('/api/capture',{payload:{}})).status,401);
 assert.equal((await call('/api/products',{productId:'123',name:'=HYPERLINK("evil")',price:100,sold:6000,rating:4.9,reviews:500})).status,200);
 assert.equal((await call('/api/import',{products:[{productId:'456',name:'rollback'},{productId:'789',rating:9}]})).status,400);
 let state=(await call('/api/state')).body;assert.equal(state.products.length,1);assert.equal(state.products[0].commission,undefined);
 await call('/api/products',{productId:'123',favorite:true});assert.equal((await call('/api/history?id=tt:123')).body.length,1);
 const token=state.captureToken;const response=await call('/api/capture',{sourceUrl:'https://shop.tiktok.com',payload:{data:{productList:[{product_id:'123',title:'สินค้าจริง',sold_count:6500}]}}},{'x-collector-token':token});assert.equal(response.body.count,1);
 state=(await call('/api/state')).body;assert.equal(state.products[0].sold,6500);assert.equal(state.products[0].favorite,true);assert.equal(state.products[0].price,100);assert.equal((await call('/api/history?id=tt:123')).body.length,2);
 assert.equal((await call('/api/products',{productId:'999'},{Origin:'https://evil.test'})).status,403);
 const backup=(await call('/api/backup')).body;assert.equal(backup.snapshots.length,2);
 await call('/api/delete',{id:'tt:123'});assert.equal((await call('/api/state')).body.products.length,0);
 assert.equal((await call('/api/restore',backup)).body.count,1);assert.equal((await call('/api/state')).body.products[0].sold,6500);
 await call('/api/products',{productId:'123',name:'=1+1',affiliateStatus:'eligible',commission:10,commissionAmount:12.90,commissionSource:'TikTok Creator / test fixture'});await call('/api/products',{productId:'555',name:'UNRATED MUST NOT EXPORT',rating:null,reviews:0,favorite:true});await call('/api/products',{productId:'666',name:'ZERO COMMISSION MUST NOT EXPORT',rating:4.8,reviews:100,commission:0,affiliateStatus:'eligible',commissionSource:'TikTok Creator / test fixture',favorite:true});await call('/api/products',{productId:'777',name:'UNVERIFIED MUST NOT EXPORT',rating:4.8,reviews:100,commission:20,favorite:true});const csv=await(await fetch(base+'/api/export')).text();assert.ok(csv.includes("'=1+1"));assert.equal(csv.includes('UNRATED MUST NOT EXPORT'),false);const savedCsv=await(await fetch(base+'/api/export?scope=saved')).text();assert.equal(savedCsv.includes('UNRATED MUST NOT EXPORT'),false);for(const text of ['ZERO COMMISSION MUST NOT EXPORT','UNVERIFIED MUST NOT EXPORT']){assert.equal(csv.includes(text),false);assert.equal(savedCsv.includes(text),false);}
 }finally{child.kill();await new Promise(r=>child.once('close',r));rmSync(dir,{recursive:true,force:true});}
});
