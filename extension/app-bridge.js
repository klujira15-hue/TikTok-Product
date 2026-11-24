// Local app bridge. No account cookies or tokens leave TikTok.
const appOrigin=location.origin;
document.documentElement.dataset.rujiraConnector='1.1.1';
window.addEventListener('message',event=>{
  if(event.source!==window||event.origin!==appOrigin)return;
  const m=event.data;if(!m||!['rujira-connect-v2','rujira-search-commission-v2','rujira-cancel-v2'].includes(m.channel))return;
  chrome.runtime.sendMessage({...m,server:appOrigin},response=>{
    const error=chrome.runtime.lastError?.message;
    window.postMessage({channel:'rujira-extension-response-v2',jobId:m.jobId,kind:m.channel,response:error?{ok:false,error}:response},appOrigin);
  });
});
window.postMessage({channel:'rujira-extension-ready-v2'},appOrigin);
