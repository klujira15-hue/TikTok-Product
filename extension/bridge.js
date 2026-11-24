let current=false;const cache=new Set();
function update(){chrome.storage.local.get(['enabled'],s=>{current=!!s.enabled;window.postMessage({channel:'rujira-toggle-v1',enabled:current},location.origin);});}
update();chrome.storage.onChanged.addListener(update);
window.addEventListener('message',e=>{if(!current||e.source!==window||e.origin!==location.origin||e.data?.channel!=='rujira-products-v1')return;const raw=JSON.stringify(e.data.payload);if(raw.length>4*1024*1024||cache.has(raw))return;cache.add(raw);if(cache.size>100)cache.delete(cache.values().next().value);chrome.runtime.sendMessage({type:'capture',sourceUrl:location.origin,payload:e.data.payload},r=>{if(chrome.runtime.lastError||!r?.ok)cache.delete(raw);});});
