import {randomUUID} from 'node:crypto';
import {extractProducts,identity,score,safeUrl,hasProductEvidence,hasAffiliateCommission,isCommissionChecked} from './core.mjs';
import {relatedCategorySources,categoryFeed} from './coverage.mjs';
import {matchesSearch} from './search-relevance.mjs';

export function pageData(html){
  const matches=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const script=matches.find(m=>/\bid\s*=\s*["']__MODERN_ROUTER_DATA__["']/i.test(m[1]));
  if(!script){if(/security check|captcha|verify you are human/i.test(html))throw Error('TikTok ขอให้ตรวจสอบการเข้าถึง กรุณาเปิด TikTok ในเบราว์เซอร์');throw Error('TikTok ไม่ได้ส่งข้อมูลสินค้าที่อ่านได้ในรอบนี้');}
  return JSON.parse(script[2]);
}
export async function readTikTok(url,fetcher=fetch,signal){
  const clean=safeUrl(url,true);if(!clean||!clean.startsWith('https://'))throw Error('ลิงก์ TikTok ไม่ถูกต้อง');
  const response=await fetcher(clean,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000),headers:{accept:'text/html'}});
  if(!response.ok)throw Error('TikTok ตอบกลับ HTTP '+response.status);
  if(response.url&&!safeUrl(response.url,true))throw Error('TikTok ส่งต่อไปยังแหล่งข้อมูลอื่น');
  if(Number(response.headers?.get('content-length'))>12*1024*1024)throw Error('ข้อมูลหน้าเว็บใหญ่เกินขนาดที่รองรับ');
  const text=await response.text();if(text.length>12*1024*1024)throw Error('ข้อมูลหน้าเว็บใหญ่เกินขนาดที่รองรับ');return pageData(text);
}
export function mainSearchFeed(payload){
  const pages=payload?.loaderData?Object.values(payload.loaderData):[];
  const components=pages.find(p=>p?.page_config?.components_map)?.page_config.components_map||payload?.data?.components_map||[];
  return components.find(c=>c.component_name==='feed_list_search_word'||c.fe_config?.is_main_feed);
}
export class LiveSearch {
  constructor({fetcher=fetch,save=()=>{},autoContinue=false}={}){this.fetcher=fetcher;this.save=save;this.jobs=new Map();this.autoContinue=autoContinue;}
  start(query,{autoContinue=this.autoContinue}={}){
    const q=String(query||'').trim();if(!q||q.length>200)throw Error('กรอกคำค้น 1–200 ตัวอักษร');
    for(const [id,j]of this.jobs)if(Date.now()-j.created>2*3600000&&!j.discovering&&!j.detailsRunning)this.jobs.delete(id);
    if([...this.jobs.values()].filter(j=>!['cancelled','error'].includes(j.status)&&(j.discovering||j.detailsRunning||j.detailQueue?.length)).length>=3)throw Error('มีงานค้นหากำลังทำงาน กรุณารอหรือยกเลิกงานเดิม');
    const job={id:randomUUID(),query:q,status:'searching',created:Date.now(),startedAt:new Date().toISOString(),sourceUrl:'https://shop.tiktok.com/th/s?q='+encodeURIComponent(q),products:new Map(),discovering:true,detailQueue:[],detailsRunning:0,detailsDone:0,detailTotal:0,detailsErrors:0,commissionStatus:'waiting',commissionDone:new Set(),controller:new AbortController(),error:'',hasMore:false,feedHasMore:false,pendingSources:[],sources:[],sourceWarnings:[],page:1,autoContinue:!!autoContinue};
    this.jobs.set(job.id,job);this.run(job).catch(e=>{if(job.status!=='cancelled'){job.status='error';job.error=e.name==='AbortError'?'ยกเลิกการค้นหาแล้ว':e.message;}});return this.snapshot(job.id);
  }
  remember(job,p){const id=identity(p);const product={...job.products.get(id),...p,id};job.products.set(id,product);this.save(p);return product;}
  async run(job){
    try{
    const payload=await readTikTok(job.sourceUrl,this.fetcher,job.controller.signal);if(job.status==='cancelled')return;
    job.pendingSources=relatedCategorySources(payload,job.query);job.sources.push({url:job.sourceUrl,label:job.query,type:'keyword',pages:1});job.activeSource=job.sources[0];
    const feed=mainSearchFeed(payload);if(payload.loaderData&&!feed)throw Error('TikTok ไม่ส่งส่วนผลค้นหาหลักในรอบนี้');
    if(feed){const {component_data,...component}=feed;job.component=component;job.nextParams=component_data?.load_more_params;job.feedHasMore=!!component_data?.has_more;job.hasMore=job.feedHasMore||job.pendingSources.length>0;}
    const products=extractProducts(feed?{products:feed.component_data?.products||[]}:payload,'TikTok search: '+job.query);
    const queue=[];for(const p of products)if(p.url){const item=this.remember(job,{...p,searchObservedAt:new Date().toISOString()});if(p.reviews!==0&&p.rating!==0)queue.push(item);}
    job.activeSource.added=job.products.size;job.activeSource.status=job.feedHasMore?'active':'feed_finished';await this.enrich(job,queue);
    await this.drain(job);
    }finally{job.discovering=false;this.settle(job);}
  }
  enrich(job,queue){
    if(job.status==='cancelled')return;job.detailTotal+=queue.length;job.detailQueue.push(...queue);this.pumpDetails(job);
  }
  settle(job){if(['cancelled','error'].includes(job.status))return;if(!job.discovering){if(job.detailsRunning||job.detailQueue.length)job.status='enriching';else{job.status='complete';job.finishedAt=new Date().toISOString();}}}
  pumpDetails(job){
    while(job.detailsRunning<3&&job.detailQueue.length&&!['cancelled','error'].includes(job.status)){
      const p=job.detailQueue.shift();job.detailsRunning++;this.detailWorker(job,p);
    }
    this.settle(job);
  }
  async detailWorker(job,p){
    try{const data=await readTikTok(p.url,this.fetcher,job.controller.signal);if(job.status==='cancelled')return;const details=extractProducts(data,'TikTok product detail').find(x=>x.productId===p.productId);if(details)this.remember(job,{...details,url:p.url,detailStatus:'complete'});else{job.detailsErrors++;job.products.get(p.id).detailStatus='unavailable';}}
    catch(e){if(job.status==='cancelled')return;job.detailsErrors++;job.products.get(p.id).detailStatus='unavailable';}
    finally{job.detailsDone++;job.detailsRunning--;this.pumpDetails(job);}
  }
  more(id){const j=this.jobs.get(id);if(!j)throw Error('ไม่พบรอบค้นหา');if(j.status!=='complete')throw Error('กรุณารอผลชุดปัจจุบัน');if(!j.hasMore)throw Error('TikTok ไม่มีผลชุดถัดไป');j.status='loading_more';j.discovering=true;j.error='';this.nextPage(j).then(()=>this.drain(j)).catch(e=>{if(j.status!=='cancelled'){j.discovering=false;j.error='โหลดเพิ่มจาก TikTok ไม่สำเร็จ: '+e.message;this.settle(j);}});return this.snapshot(id);}
  async drain(j){j.discovering=true;try{while(j.autoContinue&&j.hasMore&&j.status!=='cancelled'){j.status='loading_more';try{await this.nextPage(j);}catch(e){if(j.status!=='cancelled')j.error='TikTok หยุดตอบผลชุดถัดไป: '+e.message;break;}}}finally{j.discovering=false;this.settle(j);}}

  automatic(id,enabled){const j=this.jobs.get(id);if(!j)throw Error('ไม่พบรอบค้นหา');if(j.status==='cancelled')throw Error('รอบนี้หยุดแล้ว กรุณาค้นหาใหม่');j.autoContinue=!!enabled;if(j.autoContinue)j.error='';if(j.autoContinue&&!j.discovering&&['complete','enriching'].includes(j.status)&&j.hasMore){j.status='loading_more';this.drain(j);}return this.snapshot(id);}
  async nextPage(j){
    if(!j.feedHasMore&&j.pendingSources.length){
      const source=j.pendingSources.shift();j.sources.push(source);j.activeSource=source;source.pages=1;source.seenIds=new Set();
      try{const data=await readTikTok(source.url,this.fetcher,j.controller.signal);if(j.status==='cancelled')return;const feed=categoryFeed(data);if(!feed)throw Error('TikTok ไม่ส่งข้อมูลหมวดสินค้า');j.sourceType='category';j.feedHasMore=!!feed.hasMore;j.page++;source.status='active';const queue=this.collect(j,feed.productList||[],source.url);j.hasMore=j.feedHasMore||j.pendingSources.length>0;await this.enrich(j,queue);}
      catch(e){if(j.status==='cancelled')return;source.status='error';j.sourceWarnings.push(source.label+': '+e.message);j.feedHasMore=false;j.hasMore=j.pendingSources.length>0;j.status='complete';}return;
    }
    if(j.sourceType==='category'){
      const source=j.activeSource;const r=await this.fetcher('https://shop.tiktok.com/api/shop/th/homepage_desktop/products_by_category',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({category_id:Number(source.categoryId),count:20,exclude_product_ids:[...source.seenIds]}),signal:AbortSignal.any([j.controller.signal,AbortSignal.timeout(25000)]),redirect:'error'});
      if(!r.ok)throw Error('HTTP '+r.status);const b=await r.json();if(b.code!==0||!b.data)throw Error(b.message||'คำตอบหมวดสินค้าไม่ถูกต้อง');if(j.status==='cancelled')return;
      const before=source.seenIds.size;const queue=this.collect(j,b.data.productList||[],source.url);j.page++;source.pages++;j.feedHasMore=!!b.data.hasMore&&source.seenIds.size>before;j.hasMore=j.feedHasMore||j.pendingSources.length>0;source.status=j.feedHasMore?'active':'feed_finished';await this.enrich(j,queue);return;
    }
    const params={...j.nextParams,seller_id:'',search_word:j.query,exclude_product_ids:[...j.products.values()].map(p=>p.productId)};
    const r=await this.fetcher('https://shop.tiktok.com/api/shop/brandy_desktop/s/product_list',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({component_info:JSON.stringify(j.component),load_more_params:JSON.stringify(params)}),signal:AbortSignal.any([j.controller.signal,AbortSignal.timeout(25000)]),redirect:'error'});
    if(!r.ok)throw Error('HTTP '+r.status);const b=await r.json();if(b.code!==0||!b.data)throw Error(b.message||'คำตอบไม่ถูกต้อง');if(j.status==='cancelled')return;
    const queue=[];let newCount=0;for(const p of extractProducts({products:b.data.products||[]},'TikTok search: '+j.query)){if(!p.url||j.products.has(identity(p)))continue;newCount++;const item=this.remember(j,{...p,searchObservedAt:new Date().toISOString()});if(p.reviews!==0&&p.rating!==0)queue.push(item);}
    const advanced=JSON.stringify(j.nextParams)!==JSON.stringify(b.data.load_more_params);j.page++;j.activeSource.pages++;j.activeSource.added=(j.activeSource.added||0)+newCount;j.nextParams=b.data.load_more_params;j.feedHasMore=!!b.data.has_more&&(newCount>0||advanced);j.hasMore=j.feedHasMore||j.pendingSources.length>0;j.activeSource.status=j.feedHasMore?'active':'feed_finished';await this.enrich(j,queue);
  }
  collect(j,raw,source){const before=j.products.size;const queue=[];for(const p of extractProducts({products:raw},'TikTok category: '+source)){if(p.productId)j.activeSource.seenIds.add(p.productId);if(!p.url||j.products.has(identity(p)))continue;const item=this.remember(j,{...p,searchObservedAt:new Date().toISOString()});if(p.reviews!==0&&p.rating!==0)queue.push(item);}j.activeSource.added=(j.activeSource.added||0)+(j.products.size-before);return queue;}
  snapshot(id){
    const j=this.jobs.get(id);if(!j)throw Error('ไม่พบรอบค้นหา กรุณาค้นหาอีกครั้ง');
    const candidates=[...j.products.values()],relevant=candidates.filter(p=>matchesSearch(p,j.query)),qualified=relevant.filter(hasProductEvidence);
    const products=qualified.filter(hasAffiliateCommission),pending=qualified.filter(p=>!isCommissionChecked(p));
    return {id:j.id,query:j.query,status:j.status,sourceUrl:j.sourceUrl,sources:j.sources.map(({seenIds,...s})=>({...s,receivedUnique:seenIds?.size})),sourcesPending:j.pendingSources.length,sourceWarnings:j.sourceWarnings,coverage:'available_web_feeds',coverageNote:'ผลจากคำค้นและหมวดที่ TikTok ส่งในรอบนี้ ไม่ใช่สินค้าทั้งแพลตฟอร์ม',startedAt:j.startedAt,finishedAt:j.finishedAt,total:products.length,scanned:candidates.length,excluded:candidates.length-products.length,excludedUnrelated:candidates.length-relevant.length,excludedEvidence:relevant.length-qualified.length,commissionTotal:qualified.length,commissionPending:pending.length,commissionNotAffiliate:qualified.filter(p=>p.affiliateStatus==='not_affiliate'&&isCommissionChecked(p)).length,commissionUnavailable:qualified.filter(p=>p.affiliateStatus==='unavailable'&&isCommissionChecked(p)).length,commissionZero:qualified.filter(p=>isCommissionChecked(p)&&p.affiliateStatus==='eligible'&&!hasAffiliateCommission(p)).length,commissionQueue:pending.map(p=>({productId:p.productId,url:p.url})),page:j.page,hasMore:j.hasMore,autoContinue:j.autoContinue,discoveryRunning:j.discovering,detailsPending:j.detailQueue.length+j.detailsRunning,detailsRunning:j.detailsRunning,detailsDone:j.detailsDone,detailTotal:j.detailTotal,detailsErrors:j.detailsErrors,commissionStatus:j.commissionStatus,commissionDone:qualified.filter(isCommissionChecked).length,error:j.error,products:products.map(p=>({...p,score:score(p,products)}))};
  }
  commission(id,payload,status){const j=this.jobs.get(id);if(!j)throw Error('ไม่พบรอบค้นหา');if(j.status==='cancelled')return this.snapshot(id);if(payload){for(const row of extractProducts(payload,'TikTok Creator / live search')){const key=identity(row);if(!j.products.has(key)||(row.commission==null&&row.commissionAmount==null&&!row.affiliateStatus))continue;this.remember(j,row);j.commissionDone.add(key);}}if(status)j.commissionStatus=status;else j.commissionStatus=j.commissionDone.size>=j.products.size?'complete':'running';return this.snapshot(id);}
  cancel(id){const j=this.jobs.get(id);if(j){j.autoContinue=false;j.status='cancelled';j.detailQueue.length=0;j.controller.abort();}return {ok:true};}
}
