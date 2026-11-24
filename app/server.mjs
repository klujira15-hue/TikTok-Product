import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {randomBytes} from 'node:crypto';
import {normalize,identity,score,extractProducts,csv,numeric,hasProductEvidence,hasAffiliateCommission} from './core.mjs';
import {LiveSearch} from './live-search.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const data=process.env.DATA_DIR||path.join(os.homedir(),'Documents','Codex','RujiraProductFinder','data');mkdirSync(data,{recursive:true});
const db=new DatabaseSync(path.join(data,'rujira.sqlite'));db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS snapshots(id INTEGER PRIMARY KEY, product_id TEXT, at TEXT, body TEXT); CREATE INDEX IF NOT EXISTS snapshot_product ON snapshots(product_id,at); CREATE TABLE IF NOT EXISTS logs(id INTEGER PRIMARY KEY, at TEXT, source TEXT, count INTEGER);');
const token=randomBytes(24).toString('hex');const port=Number(process.env.PORT||4317);
const origin=`http://127.0.0.1:${port}`;
const all=()=>db.prepare('SELECT body FROM products').all().map(x=>JSON.parse(x.body));
const liveSearch=new LiveSearch({save:product=>upsert(product),autoContinue:true});
function upsert(input,recordSnapshot=true){const p=normalize(input);const id=identity(p);const oldrow=db.prepare('SELECT body FROM products WHERE id=?').get(id);let old=oldrow?JSON.parse(oldrow.body):{};
  // Merge a previously saved short link when an observed canonical product arrives.
  if(!oldrow&&p.url){const candidate=all().find(x=>x.url===p.url);if(candidate){old=candidate;db.prepare('DELETE FROM products WHERE id=?').run(candidate.id);db.prepare('UPDATE snapshots SET product_id=? WHERE product_id=?').run(id,candidate.id);}}
  const now=new Date().toISOString();const product={favorite:false,stage:'inbox',...old,...p,id,updatedAt:now};
  const measurements=numeric.filter(k=>Object.hasOwn(p,k));
  if(measurements.length&&recordSnapshot){product.observedAt=p.observedAt||now;db.prepare('INSERT INTO snapshots(product_id,at,body) VALUES(?,?,?)').run(id,product.observedAt,JSON.stringify(Object.fromEntries(numeric.filter(k=>product[k]!==undefined).map(k=>[k,product[k]]))));}
  db.prepare('INSERT INTO products VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(id,JSON.stringify(product));return product;
}
function batch(items){if(!Array.isArray(items)||items.length>10000)throw Error('รองรับไม่เกิน 10,000 รายการต่อครั้ง');db.exec('BEGIN');try{const ids=new Set(items.map(p=>upsert(p).id));db.exec('COMMIT');return ids.size;}catch(e){db.exec('ROLLBACK');throw e;}}
async function body(req){let s='';for await(const chunk of req){s+=chunk;if(Buffer.byteLength(s)>25*1024*1024)throw Error('ไฟล์ใหญ่เกิน 25 MB');}return JSON.parse(s||'{}');}
const server=http.createServer(async(req,res)=>{
  const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  try{
    if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host)){json(403,{error:'Local access only'});return;}
    const u=new URL(req.url,origin);const route=u.pathname;
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    if(req.method!=='GET'&&!['/api/capture','/api/search/commission'].includes(route)&&req.headers.origin&&!['http://localhost:'+port,origin].includes(req.headers.origin)){json(403,{error:'Origin rejected'});return;}
    if(req.method==='POST'&&route==='/api/search'){const b=await body(req);json(202,liveSearch.start(b.query,{autoContinue:b.autoContinue!==false}));return;}
    if(req.method==='GET'&&route==='/api/search'){json(200,liveSearch.snapshot(u.searchParams.get('id')));return;}
    if(req.method==='POST'&&route==='/api/search/cancel'){const b=await body(req);json(200,liveSearch.cancel(b.id));return;}
    if(req.method==='POST'&&route==='/api/search/more'){const b=await body(req);json(202,liveSearch.more(b.id));return;}
    if(req.method==='POST'&&route==='/api/search/auto'){const b=await body(req);if(typeof b.enabled!=='boolean')throw Error('สถานะค้นหาต่อต้องเป็น true/false');json(200,liveSearch.automatic(b.id,b.enabled));return;}
    if(req.method==='POST'&&route==='/api/search/commission'){if(req.headers['x-collector-token']!==token){json(401,{error:'ต้องจับคู่ส่วนขยายกับโปรแกรมอีกครั้ง'});return;}const b=await body(req);if(b.status&&!['waiting','running','complete','partial','unavailable'].includes(b.status))throw Error('สถานะไม่ถูกต้อง');json(200,liveSearch.commission(b.id,b.payload,b.status));return;}
    if(req.method==='GET'&&route==='/api/state'){
      const products=all();const enriched=products.map(p=>{const baseline=db.prepare('SELECT body FROM snapshots WHERE product_id=? AND at<=? ORDER BY at DESC,id DESC LIMIT 1').get(p.id,new Date(Date.now()-7*86400000).toISOString());const old=baseline?JSON.parse(baseline.body):{};return {...p,previousSold7d:old.sold7d??null};});
      json(200,{products:enriched.map(p=>({...p,score:score(p,enriched)})),logs:db.prepare('SELECT * FROM logs ORDER BY id DESC LIMIT 20').all(),captureToken:token,version:'1.4.0'});return;
    }
    if(req.method==='GET'&&route==='/api/history'){json(200,db.prepare('SELECT at,body FROM snapshots WHERE product_id=? ORDER BY at,id').all(u.searchParams.get('id')).map(x=>({at:x.at,...JSON.parse(x.body)})));return;}
    if(req.method==='POST'&&route==='/api/products'){json(200,upsert(await body(req)));return;}
    if(req.method==='POST'&&route==='/api/import'){const b=await body(req);const rows=b.format==='raw'?extractProducts(b.payload,'imported-web-response'):b.products;const count=batch(rows);db.prepare('INSERT INTO logs(at,source,count) VALUES(?,?,?)').run(new Date().toISOString(),'import',count);json(200,{count});return;}
    if(req.method==='POST'&&route==='/api/capture'){
      if(req.headers['x-collector-token']!==token){json(401,{error:'รหัสจับคู่ไม่ถูกต้อง กรุณาคัดลอกรหัสใหม่จากโปรแกรม'});return;}
      const b=await body(req);let host;try{host=new URL(b.sourceUrl).hostname;}catch{throw Error('แหล่งข้อมูลไม่ถูกต้อง');}if(!(host==='tiktok.com'||host.endsWith('.tiktok.com')))throw Error('รองรับเฉพาะคำตอบจาก TikTok');
      const rows=extractProducts(b.payload,'web:'+host);const count=batch(rows);db.prepare('INSERT INTO logs(at,source,count) VALUES(?,?,?)').run(new Date().toISOString(),host,count);json(200,{count});return;
    }
    if(req.method==='POST'&&route==='/api/delete'){const b=await body(req);db.prepare('DELETE FROM products WHERE id=?').run(b.id);db.prepare('DELETE FROM snapshots WHERE product_id=?').run(b.id);json(200,{ok:true});return;}
    if(req.method==='GET'&&route==='/api/export'){const cols=['productId','name','shopId','shop','category','url','affiliateUrl','price','originalPrice','sold','sold24h','sold7d','sold30d','rating','reviews','shopRating','stock','commission','commissionAmount','commissionAmountMin','commissionAmountMax','affiliatePrice','affiliateStatus','affiliateReason','commissionSource','commissionObservedAt','shopRatingSource','shopRatingObservedAt','adsCommission','creators','videos','favorite','stage','hook','script','notes','source','observedAt'];const searchId=u.searchParams.get('searchId');const rows=searchId?liveSearch.snapshot(searchId).products:u.searchParams.get('scope')==='saved'?all().filter(p=>p.favorite):all();res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="rujira-products.csv"'});res.end(csv(rows.filter(p=>hasProductEvidence(p)&&hasAffiliateCommission(p)),cols));return;}
    if(req.method==='GET'&&route==='/api/backup'){res.writeHead(200,{'Content-Type':'application/json','Content-Disposition':'attachment; filename="rujira-backup.json"'});res.end(JSON.stringify({version:1,products:all(),snapshots:db.prepare('SELECT product_id,at,body FROM snapshots').all()},null,2));return;}
    if(req.method==='POST'&&route==='/api/restore'){const b=await body(req);if(b.version!==1||!Array.isArray(b.products)||!Array.isArray(b.snapshots))throw Error('รูปแบบสำรองไม่ถูกต้อง');db.exec('BEGIN');try{for(const row of b.products)upsert(row,false);for(const row of b.snapshots){if(!Number.isFinite(Date.parse(row.at)))throw Error('วันที่ไม่ถูกต้อง');const p=normalize(JSON.parse(row.body));const clean=JSON.stringify(Object.fromEntries(numeric.filter(k=>Object.hasOwn(p,k)).map(k=>[k,p[k]])));const found=db.prepare('SELECT id FROM snapshots WHERE product_id=? AND at=? AND body=?').get(row.product_id,row.at,clean);if(!found)db.prepare('INSERT INTO snapshots(product_id,at,body) VALUES(?,?,?)').run(row.product_id,row.at,clean);}db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}json(200,{count:b.products.length});return;}
    const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};
    if(req.method==='GET'&&files[route]){res.writeHead(200,{'Content-Type':route.endsWith('.js')?'text/javascript; charset=utf-8':route.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; img-src 'self' https: http: data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'",'X-Content-Type-Options':'nosniff'});res.end(readFileSync(path.join(root,'public',files[route])));return;}
    json(404,{error:'ไม่พบรายการ'});
  }catch(e){json(400,{error:e.message});}
});
server.listen(port,'127.0.0.1',()=>console.log(`NP TikTok Product Finder: ${origin}\nData: ${data}\nCtrl+C to stop`));
