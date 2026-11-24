import test from 'node:test';import assert from 'node:assert/strict';
import {hasAffiliateCommission} from '../core.mjs';import {LiveSearch} from '../live-search.mjs';
test('Only positive commission confirmed by TikTok Creator qualifies, including amount and range edge cases',()=>{
 const verified={affiliateStatus:'eligible',commissionSource:'TikTok Creator / live search',commission:10,commissionAmount:12};
 assert.ok(hasAffiliateCommission(verified));
 for(const patch of [{commission:0},{commission:null},{commissionAmount:0},{affiliateStatus:'not_affiliate'},{affiliateStatus:'unavailable'},{commissionSource:'TikTok search: กางเกง'},{commissionSource:''},{commissionAmount:null,commissionAmountMax:0}])assert.equal(hasAffiliateCommission({...verified,...patch}),false,JSON.stringify(patch));
 assert.ok(hasAffiliateCommission({...verified,commissionAmount:null,commissionAmountMin:4.23,commissionAmountMax:14.10}));
});
test('Pending, zero, not-affiliate and unavailable stay out of products while lookup queue still drives detection',async()=>{
 const product=id=>({product_id:id,title:'กางเกง '+id,seo_url:{canonical_url:'https://shop.tiktok.com/th/pdp/'+id},rate_info:{score:4.8,review_count:40}});
 const service=new LiveSearch({fetcher:async url=>({ok:true,headers:{get:()=>null},text:async()=>'<script id="__MODERN_ROUTER_DATA__">'+JSON.stringify({products:url.includes('/th/s?')?['111','222','333','444','555'].map(product):[product(url.split('/').at(-1))]})+'</script>'})});
 const id=service.start('กางเกง').id;let job;for(let i=0;i<40;i++){job=service.snapshot(id);if(job.status==='complete')break;await new Promise(r=>setTimeout(r,5));}
 assert.equal(job.total,0);assert.equal(job.commissionPending,5);assert.equal(job.commissionQueue.length,5);assert.deepEqual(Object.keys(job.commissionQueue[0]),['productId','url']);
 const good=service.commission(id,{...product('111'),affiliate_info:{commission_rate:1000,commission_with_currency:'฿12'}});
 assert.equal(good.total,1);assert.equal(good.commissionDone,1);assert.equal(good.commissionPending,4);
 service.commission(id,{...product('222'),affiliate_info:{commission_rate:0,commission_with_currency:'฿0'}});
 service.commission(id,{data:{results:[{original_url:'https://shop.tiktok.com/th/pdp/333',product_info:{tips:{description:'This product is not an affiliate product. Contact the seller to enroll it into the affiliate program.'}}},{original_url:'https://shop.tiktok.com/th/pdp/444',product_info:{tips:{description:'This product is unavailable'}}}]}});
 job=service.snapshot(id);assert.deepEqual(job.products.map(p=>p.productId),['111']);assert.equal(job.commissionTotal,5);assert.equal(job.commissionDone,4);assert.equal(job.commissionZero,1);assert.equal(job.commissionNotAffiliate,1);assert.equal(job.commissionUnavailable,1);assert.equal(job.commissionPending,1);assert.deepEqual(job.commissionQueue.map(p=>p.productId),['555']);
 // A subsequent Creator response revoking commission removes the existing row.
 job=service.commission(id,{...product('111'),affiliate_info:{commission_rate:0,commission_with_currency:'฿0'}});assert.equal(job.total,0);
});
