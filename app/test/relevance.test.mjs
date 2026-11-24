import test from 'node:test';import assert from 'node:assert/strict';
import {matchesSearch} from '../search-relevance.mjs';
import {LiveSearch} from '../live-search.mjs';
const pants={name:'กางเกงขายาวเอวสูง',category:'Pants'};
test('Pants intent excludes shirts, diapers and underwear, even with pants in the title or shop name',()=>{
 assert.ok(matchesSearch(pants,'กางเกง'));
 assert.ok(matchesSearch({name:'รุ่นกระบอกกลาง R10',category:'Pants'},'กางเกง'));
 assert.ok(matchesSearch({name:'แพ็ค 4 กางเกงวอร์ม เสื้อผ้า กีฬา',category:'Joggers'},'กางเกง'));
 for(const p of [{name:'เสื้อยืดผู้หญิง',category:'เสื้อยืด',shop:'ร้านกางเกง'},{name:'เสื้อแมตช์กับกางเกง',category:'T-Shirts'},{name:'ผ้าอ้อมแบบกางเกง',category:'Baby Diapers'},{name:'กางเกงในผู้ชาย',category:'Shorts'},{name:'กางเกงขาสั้น',category:'Underwear'},{name:'ชุดเซ็ต เสื้อพร้อมกางเกง',category:'Sets'}])assert.equal(matchesSearch(p,'กางเกง'),false,p.name);
});
test('Explicit diaper and underwear searches remain separate, and query modifiers must match',()=>{
 assert.ok(matchesSearch({name:'ผ้าอ้อมแบบกางเกง NB-4XL'},'ผ้าอ้อม'));
 assert.ok(matchesSearch({name:'กางเกงในผู้ชาย'},'กางเกงใน'));
 assert.equal(matchesSearch(pants,'ผ้าอ้อม'),false);
 assert.equal(matchesSearch({name:'พัดลมตั้งโต๊ะ',shop:'ครีมกันแดด'},'ครีมกันแดด'),false);
 assert.ok(matchesSearch({name:'ครีมกันแดด SPF50'},'ครีมกันแดด'));
 assert.equal(matchesSearch(pants,'กางเกง สีแดง'),false);
 assert.ok(matchesSearch({name:'กางเกงขายาว สีแดง'},'กางเกง สีแดง'));
 assert.equal(matchesSearch({name:'กางเกงใส่กับเสื้อยืด',category:'Pants'},'เสื้อ'),false);
 assert.equal(matchesSearch({name:'รุ่นเอวสูง แมตช์เสื้อได้ทุกแบบ',category:'Pants'},'เสื้อ'),false);
});
test('Mixed TikTok pagination filters unrelated products before scoring and commission dispatch, including late details',async()=>{
 const raw=(id,title)=>({product_id:id,title,seo_url:{canonical_url:'https://shop.tiktok.com/th/pdp/'+id},rate_info:{score:4.8,review_count:20}});
 const a=raw('111','กางเกงขายาว'),b=raw('222','เสื้อยืด'),c=raw('333','ผ้าอ้อมแบบกางเกง'),d=raw('444','กางเกง'),e=raw('555','กางเกงขาสั้น');
 const response=v=>({ok:true,headers:{get:()=>null},text:async()=>'<script id="__MODERN_ROUTER_DATA__">'+JSON.stringify(v)+'</script>'});
 const service=new LiveSearch({autoContinue:true,fetcher:async url=>{
 if(url.includes('/product_list'))return {ok:true,json:async()=>({code:0,data:{products:[b,c,d,e],has_more:false}})};
 if(url.includes('/th/s?'))return response({loaderData:{page:{page_config:{components_map:[{component_name:'feed_list_search_word',component_data:{products:[a],has_more:true,load_more_params:{offset:30}}}]}}}});
 const p=[a,b,c,d,e].find(p=>url.endsWith('/'+p.product_id));return response({products:[p.product_id==='444'?{...p,category_name:'เสื้อยืด'}:p]});
 }});
 const id=service.start('กางเกง').id;let job;for(let i=0;i<50;i++){job=service.snapshot(id);if(job.status==='complete'&&!job.hasMore)break;await new Promise(r=>setTimeout(r,5));}
 for(const p of [a,e])service.commission(id,{...p,affiliate_info:{commission_rate:1000,commission_with_currency:'฿12.90'}});job=service.snapshot(id);assert.deepEqual(job.products.map(p=>p.productId),['111','555']);assert.equal(job.excludedUnrelated,3);assert.equal(job.scanned,5);
 const after=service.commission(id,{...c,affiliate_info:{commission_rate:1500}});assert.deepEqual(after.products.map(p=>p.productId),['111','555']);assert.equal(after.commissionDone,2);
});
