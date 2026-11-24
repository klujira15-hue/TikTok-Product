const managedTabs=new Map(), jobs=new Map();let captureSequence=Promise.resolve();
const localOrigin=url=>{try{const u=new URL(url);return u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)&&u.port==='4317'?u.origin:null;}catch{return null;}};
const isTikTok=url=>{try{const u=new URL(url);return u.protocol==='https:'&&(u.hostname==='tiktok.com'||u.hostname.endsWith('.tiktok.com'));}catch{return false;}};
async function post(job,path,body){const r=await fetch(job.server+path,{method:'POST',headers:{'Content-Type':'application/json','x-collector-token':job.token},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const b=await r.json();if(!r.ok)throw Error(b.error||'เชื่อมต่อโปรแกรมไม่ได้');return b;}
function commissionIds(payload){const ids=new Set();let count=0;function walk(o){if(!o||typeof o!=='object'||++count>100000)return;if(o.product_id&&o.affiliate_info)ids.add(String(o.product_id));if(o.original_url&&o.product_info?.tips){const m=o.original_url.match(/(?:product\/|pdp\/(?:[^/?]+\/)?)(\d+)/);if(m)ids.add(m[1]);}for(const x of Object.values(o))walk(x);}walk(payload);return ids;}
async function loaded(tabId){const tab=await chrome.tabs.get(tabId);if(tab.status==='complete')return;await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{chrome.tabs.onUpdated.removeListener(listener);reject(Error('TikTok โหลดไม่สำเร็จ'));},35000);const listener=(id,change)=>{if(id===tabId&&change.status==='complete'){clearTimeout(timeout);chrome.tabs.onUpdated.removeListener(listener);resolve();}};chrome.tabs.onUpdated.addListener(listener);});}
async function sendLookup(tabId,url){for(let i=0;i<3;i++){try{return await chrome.tabs.sendMessage(tabId,{type:'rujira-check-product-v2',url});}catch(e){if(i===2)throw e;await new Promise(r=>setTimeout(r,350));}}}
async function runJob(job){let tab;let failed=0;try{
  await post(job,'/api/search/commission',{id:job.id,status:'running'});
  tab=await chrome.tabs.create({url:'https://shop.tiktok.com/streamer',active:false});managedTabs.set(tab.id,job);await loaded(tab.id);
  for(const url of job.urls){if(job.cancelled)break;const m=url.match(/(?:product\/|pdp\/(?:[^/?]+\/)?)(\d+)/);if(!m){failed++;continue;}
    let timeout;const response=new Promise(resolve=>{timeout=setTimeout(()=>resolve(false),30000);job.pending={id:m[1],resolve};});
    const action=await sendLookup(tab.id,url);if(!action?.ok){clearTimeout(timeout);job.pending=null;throw Error(action?.error||'เปิดหน้าตรวจค่าคอมไม่ได้');}
    const received=await response;clearTimeout(timeout);job.pending=null;if(!received)failed++;
  }
  if(!job.cancelled)await post(job,'/api/search/commission',{id:job.id,status:failed?'partial':'complete'});
 }catch(e){await chrome.storage.local.set({error:e.message});try{await post(job,'/api/search/commission',{id:job.id,status:'unavailable'});}catch{}}
 finally{if(tab){managedTabs.delete(tab.id);try{await chrome.tabs.remove(tab.id);}catch{}}jobs.delete(job.id);}}
chrome.runtime.onMessage.addListener((m,sender,respond)=>{
  const server=localOrigin(sender.tab?.url||sender.url);
  if(m.channel==='rujira-connect-v2'&&server){chrome.storage.local.set({server,token:String(m.token||''),enabled:true}).then(()=>respond({ok:true,version:'1.1.0'}));return true;}
  if(m.channel==='rujira-cancel-v2'&&server){const job=jobs.get(m.jobId);if(job){job.cancelled=true;job.pending?.resolve(false);}respond({ok:true});return;}
  if(m.channel==='rujira-search-commission-v2'&&server){
    if(!m.token||typeof m.jobId!=='string'||!Array.isArray(m.urls)||m.urls.length>1000||m.urls.some(url=>!isTikTok(url))){respond({ok:false,error:'ข้อมูลคำสั่งค้นหาไม่ถูกต้อง'});return;}
    if(!jobs.has(m.jobId)){const job={id:m.jobId,server,token:m.token,urls:[...new Set(m.urls)],cancelled:false,pending:null};jobs.set(job.id,job);runJob(job);}
    respond({ok:true,started:true});return;
  }
  if(m.type!=='capture'||!sender.tab||!isTikTok(sender.url))return;
  captureSequence=captureSequence.then(async()=>{
    try{const managed=managedTabs.get(sender.tab.id);const config=managed||await chrome.storage.local.get(['server','token','enabled']);if(!managed&&!config.enabled){respond({ok:false});return;}
      let result;if(managed){const ids=commissionIds(m.payload);if(!ids.size){respond({ok:true,count:0});return;}result=await post(managed,'/api/search/commission',{id:managed.id,payload:m.payload});if(managed.pending&&ids.has(managed.pending.id))managed.pending.resolve(true);}
      else result=await post(config,'/api/capture',{sourceUrl:m.sourceUrl,payload:m.payload});
      await chrome.storage.local.set({lastAt:new Date().toISOString(),lastCount:managed?result.commissionDone:result.count,error:''});respond({ok:true,count:managed?result.commissionDone:result.count});
    }catch(e){await chrome.storage.local.set({error:e.message});respond({ok:false,error:e.message});}
  }).catch(e=>respond({ok:false,error:e.message}));return true;
});
