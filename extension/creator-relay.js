const pendingLookups=new Map();
window.addEventListener('message',event=>{if(event.source!==window||event.origin!==location.origin||event.data?.channel!=='rujira-driver-response-v2')return;const pending=pendingLookups.get(event.data.requestId);if(pending){clearTimeout(pending.timer);pendingLookups.delete(event.data.requestId);pending.respond({ok:event.data.ok,error:event.data.error});}});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 if(message.type!=='rujira-check-product-v2')return;
 const requestId=crypto.randomUUID();const timer=setTimeout(()=>{pendingLookups.delete(requestId);respond({ok:false,error:'หน้าตรวจค่าคอมไม่ตอบกลับ กรุณาตรวจการเข้าสู่ระบบ Creator'});},45000);
 pendingLookups.set(requestId,{respond,timer});window.postMessage({channel:'rujira-driver-request-v2',requestId,url:message.url},location.origin);return true;
});
