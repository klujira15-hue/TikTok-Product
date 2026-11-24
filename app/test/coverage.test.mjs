import test from 'node:test';import assert from 'node:assert/strict';
import {LiveSearch} from '../live-search.mjs';import {relatedCategorySources} from '../coverage.mjs';import {matchesSearch} from '../search-relevance.mjs';
const payload=components=>({loaderData:{page:{page_config:{components_map:components}}}});
const raw=(id,title)=>({product_id:id,title,seo_url:{canonical_url:'https://shop.tiktok.com/th/pdp/'+id},rate_info:{score:4.8,review_count:300}});
const response=data=>({ok:true,headers:{get:()=>null},text:async()=>'<script id="__MODERN_ROUTER_DATA__">'+JSON.stringify(data)+'</script>'});
test('Compound Thai jeans search matches jeans names and category synonyms while excluding cotton pants and shirts',()=>{
 for(const p of [{name:'ยีนส์ทรงบาเรล เอวสูง',category:'Jeans'},{name:'กางเกงขายาวผ้ายีนส์',category:'ยีนส์'},{name:'Vintage straight jeans',category:"Men's Jeans"}])assert.ok(matchesSearch(p,'กางเกงยีนส์'),p.name);
 for(const p of [{name:'กางเกงผ้าคอตตอน',category:'Pants'},{name:'เสื้อแจ็คเก็ตยีนส์',category:'Jackets'},{name:'ผ้าอ้อมแบบกางเกง'}])assert.equal(matchesSearch(p,'กางเกงยีนส์'),false);
 assert.equal(matchesSearch({name:'กางเกงยีนส์สีฟ้า'},'กางเกงยีนส์ สีดำ'),false);
});
test('Broader discovery follows safe TikTok-supplied categories without rejecting broad English category labels',()=>{
 const data=payload([{component_name:'related_link_categories',component_data:{related_links:[{name:'Jeans',link:'https://shop.tiktok.com/th/c/jeans/601276'},{name:'Jeans',link:'https://evil.test/th/c/jeans/1'},{name:'Shirts',link:'https://shop.tiktok.com/th/c/shirts/2'},{name:'Jeans',link:'https://shop.tiktok.com/th/c/jeans/601276'}]}}]);
 assert.deepEqual(relatedCategorySources(data,'กางเกงยีนส์').map(s=>s.categoryId),['601276','2']);
});
test('Keyword feed exhaustion continues into related category pages, deduplicates IDs and preserves all eligibility filters',async()=>{
 const categoryUrl='https://shop.tiktok.com/th/c/jeans/601276',requests=[];const a=raw('111','กางเกงยีนส์'),b=raw('222','ยีนส์ทรงบาเรล'),c=raw('333','กางเกงคอตตอน'),d=raw('444','Straight jeans');
 const service=new LiveSearch({autoContinue:true,fetcher:async(url,opts)=>{
 requests.push({url,body:opts?.body});
 if(url.includes('products_by_category'))return {ok:true,json:async()=>({code:0,data:{productList:[b,c,d],hasMore:false}})};
 if(url===categoryUrl)return response(payload([{component_name:'homepage_products',component_data:{categoryProductsData:{productList:[a,b],hasMore:true},recommendedForYouProductsData:{productList:[raw('999','เสื้อ')]} }}]));
 if(url.includes('/th/s?'))return response(payload([{component_name:'feed_list_search_word',component_data:{products:[a],has_more:false}},{component_name:'related_link_categories',component_data:{related_links:[{name:'Jeans',link:categoryUrl}]}}]));
 return response({products:[[a,b,c,d].find(p=>url.endsWith('/'+p.product_id))]});
 }});const id=service.start('กางเกงยีนส์').id;let job;
 for(let i=0;i<80;i++){job=service.snapshot(id);if(job.status==='complete'&&!job.hasMore)break;await new Promise(r=>setTimeout(r,5));}
 assert.equal(job.sources.length,2);assert.equal(job.page,3);assert.equal(job.scanned,4);assert.equal(job.excludedUnrelated,1);assert.deepEqual(job.commissionQueue.map(p=>p.productId),['111','222','444']);assert.equal(job.total,0);
 for(const p of [a,b,d])service.commission(id,{...p,affiliate_info:{commission_rate:1000,commission_with_currency:'฿10'}});
 job=service.snapshot(id);assert.equal(job.total,3);assert.equal(job.commissionPending,0);assert.equal(job.coverage,'available_web_feeds');assert.match(job.coverageNote,/ไม่ใช่สินค้าทั้งแพลตฟอร์ม/);
 const body=JSON.parse(requests.find(r=>r.url.includes('products_by_category')).body);assert.equal(body.category_id,601276);assert.equal(body.count,20);assert.deepEqual(body.exclude_product_ids,['111','222']);
});
test('A category API repeating IDs cannot loop forever or multiply results',async()=>{
 const p=raw('111','กางเกงยีนส์'),url='https://shop.tiktok.com/th/c/jeans/601276';let calls=0;
 const service=new LiveSearch({autoContinue:true,fetcher:async u=>{
 if(u.includes('products_by_category')){calls++;return {ok:true,json:async()=>({code:0,data:{productList:[p],hasMore:true}})};}
 if(u===url)return response(payload([{component_name:'homepage_products',component_data:{categoryProductsData:{productList:[p],hasMore:true}}}]));
 if(u.includes('/th/s?'))return response(payload([{component_name:'feed_list_search_word',component_data:{products:[p],has_more:false}},{component_name:'related_link_categories',component_data:{related_links:[{name:'Jeans',link:url}]}}]));
 return response({products:[p]});
 }});const id=service.start('กางเกงยีนส์').id;let j;for(let i=0;i<80;i++){j=service.snapshot(id);if(j.status==='complete'&&!j.hasMore)break;await new Promise(r=>setTimeout(r,5));}assert.equal(calls,1);assert.equal(j.scanned,1);assert.equal(j.hasMore,false);assert.equal(j.error,'');
});
test('A category page overlapping the keyword feed still advances its own exclusions to reach new products',async()=>{
 const a=raw('111','กางเกงยีนส์'),b=raw('222','กางเกงยีนส์'),c=raw('333','กางเกงยีนส์'),url='https://shop.tiktok.com/th/c/jeans/601276';const bodies=[];
 const service=new LiveSearch({autoContinue:true,fetcher:async(u,o)=>{
 if(u.includes('products_by_category')){bodies.push(JSON.parse(o.body));return {ok:true,json:async()=>({code:0,data:bodies.length===1?{productList:[b],hasMore:true}:{productList:[c],hasMore:false}})};}
 if(u===url)return response(payload([{component_name:'homepage_products',component_data:{categoryProductsData:{productList:[a],hasMore:true}}}]));
 if(u.includes('/th/s?'))return response(payload([{component_name:'feed_list_search_word',component_data:{products:[a,b],has_more:false}},{component_name:'related_link_categories',component_data:{related_links:[{name:'Jeans',link:url}]}}]));
 return response({products:[[a,b,c].find(p=>u.endsWith('/'+p.product_id))]});
 }});const id=service.start('กางเกงยีนส์').id;let j;for(let i=0;i<80;i++){j=service.snapshot(id);if(j.status==='complete'&&!j.hasMore)break;await new Promise(r=>setTimeout(r,5));}
 assert.equal(bodies.length,2);assert.deepEqual(bodies[0].exclude_product_ids,['111']);assert.deepEqual(bodies[1].exclude_product_ids,['111','222']);assert.equal(j.scanned,3);assert.equal(j.sources[1].receivedUnique,3);assert.equal(j.sources[1].added,1);
});
