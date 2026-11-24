import test from 'node:test';import assert from 'node:assert/strict';import {LiveSearch} from '../live-search.mjs';
const raw=(id,name)=>({product_id:id,title:name,seo_url:{canonical_url:'https://shop.tiktok.com/th/pdp/'+id},rate_info:{score:4.8,review_count:100}});
const html=data=>({ok:true,headers:{get:()=>null},text:async()=>'<script id="__MODERN_ROUTER_DATA__">'+JSON.stringify(data)+'</script>'});
const feed=(products,more)=>({loaderData:{page:{page_config:{components_map:[{component_name:'feed_list_search_word',component_data:{products,has_more:more,load_more_params:{offset:30}}}]}}}});
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,2));}throw Error('Condition not reached');}
test('Discovery advances to the next TikTok page while product detail responses are still blocked',async()=>{
 const releases=[];let nextRequested=false;
 const service=new LiveSearch({autoContinue:true,fetcher:async url=>{
 if(url.includes('/product_list')){nextRequested=true;return {ok:true,json:async()=>({code:0,data:{products:[raw('222','สินค้าสอง')],has_more:false}})};}
 if(url.includes('/th/s?'))return html(feed([raw('111','สินค้าหนึ่ง')],true));
 return new Promise(resolve=>releases.push(()=>resolve(html({products:[raw(url.split('/').at(-1),'สินค้า')]}))));
 }});const id=service.start('สินค้า').id;
 await until(()=>nextRequested&&service.snapshot(id).scanned===2&&releases.length===2&&!service.snapshot(id).discoveryRunning);
 let j=service.snapshot(id);assert.equal(j.status,'enriching');assert.equal(j.detailsDone,0);assert.equal(j.detailsPending,2);assert.equal(j.commissionQueue.length,2);assert.equal(j.total,0);
 for(const release of releases)release();await until(()=>service.snapshot(id).status==='complete');j=service.snapshot(id);assert.equal(j.detailsDone,2);assert.equal(j.detailsPending,0);
});
test('Cancelling a large detail queue prevents additional detail requests and late detail mutations',async()=>{
 const releases=[];let detailRequests=0;
 const service=new LiveSearch({fetcher:async url=>{
 if(url.includes('/th/s?'))return html(feed(Array.from({length:30},(_,i)=>raw(String(i+1),'สินค้า')),false));
 detailRequests++;return new Promise(resolve=>releases.push(()=>resolve(html({products:[raw(url.split('/').at(-1),'สินค้าเปลี่ยนหลังยกเลิก')]}))));
 }});const id=service.start('สินค้า').id;await until(()=>releases.length===3);service.cancel(id);for(const release of releases)release();await until(()=>service.snapshot(id).detailsRunning===0);
 const j=service.snapshot(id);assert.equal(j.status,'cancelled');assert.equal(detailRequests,3);assert.equal(j.detailsPending,0);assert.ok([...service.jobs.get(id).products.values()].every(p=>p.name==='สินค้า'));
});
test('New arbitrary product queries go directly to TikTok without adding keywords or preloading inventory',async()=>{
 const requested=[],names=new Map();let seq=0;
 const service=new LiveSearch({fetcher:async url=>{
 const u=new URL(url);if(u.pathname==='/th/s'){const query=u.searchParams.get('q');requested.push(query);const id=String(++seq);names.set(id,query);return html(feed([raw(id,query)],false));}
 const id=u.pathname.split('/').at(-1);return html({products:[raw(id,names.get(id))]});
 }});
 const queries=Array.from({length:80},(_,i)=>'สินค้าใหม่ รุ่นQXZ'+i.toString().padStart(3,'0'));
 for(const query of queries){const id=service.start(query).id;await until(()=>service.snapshot(id).status==='complete');let j=service.snapshot(id);assert.equal(j.scanned,1);assert.equal(j.commissionQueue.length,1);assert.equal(j.total,0);const pid=j.commissionQueue[0].productId;j=service.commission(id,{...raw(pid,query),affiliate_info:{commission_rate:1000,commission_with_currency:'฿10'}});assert.equal(j.total,1);assert.equal(j.products[0].name,query);}
 assert.deepEqual(requested,queries);
});
