import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {extractProducts} from '../core.mjs';
test('extension fetch hook preserves web results and sends only allowlisted product fields',async()=>{
 const events=[],listeners={};let sent=0;const response={url:'https://shop.tiktok.com/api/shop/th/homepage_desktop/products_by_component',headers:{get:()=> 'application/json'},clone:()=>({text:async()=>JSON.stringify({data:{productList:[{product_id:'1234567890123456789',title:'เสื้อแขนยาว',product_price_info:{sale_price_decimal:'129',origin_price_decimal:'200'},rate_info:{score:4.9,review_count:'500'},sold_info:{sold_count:6000},seller_info:{shop_name:'ร้าน',seller_id:'9876543210987654321'},seo_url:{canonical_url:'https://shop.tiktok.com/th/pdp/1234567890123456789'},access_token:'never-send',bind_video:{item_id:'999',title:'not a product'}}]},token:'never-send'})})};
 class XHR {send(){sent++;}addEventListener(){}}
 const w={addEventListener:(k,f)=>(listeners[k]??=[]).push(f),postMessage:m=>events.push(m),fetch:async()=>response};
 vm.runInNewContext(readFileSync(new URL('../../extension/hook.js',import.meta.url),'utf8'),{window:w,location:{origin:'https://shop.tiktok.com'},document:{addEventListener(){},querySelectorAll:()=>[]},XMLHttpRequest:XHR,URL,JSON});
 await w.fetch('/api');await new Promise(r=>setImmediate(r));assert.equal(events.length,0);
 for(const f of listeners.message)f({source:w,data:{channel:'rujira-toggle-v1',enabled:true}});
 const returned=await w.fetch('/api');assert.equal(returned,response);await new Promise(r=>setImmediate(r));assert.equal(events.length,1);assert.equal(JSON.stringify(events).includes('never-send'),false);
 const products=extractProducts(events[0].payload);assert.equal(products.length,1);assert.equal(products[0].price,129);assert.equal(products[0].shopId,'9876543210987654321');assert.equal(products[0].url,'https://shop.tiktok.com/th/pdp/1234567890123456789');
});
