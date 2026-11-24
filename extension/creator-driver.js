// MAIN world: React must receive input events in the same JavaScript world.
// Only performs the existing read-only URL check flow. Never clicks Add products.
(()=>{
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const findButton=text=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===text&&e.getClientRects().length&&!e.disabled);
const lookupInput=()=>document.querySelector('input[placeholder="Enter product URLs here. For example: https://productURL.com/product."]');
async function until(fn,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){const v=fn();if(v)return v;await pause(150);}throw Error('เปิดหน้าตรวจค่าคอมไม่ได้ กรุณาตรวจการเข้าสู่ระบบ TikTok Creator');}
async function checkProduct(url){
  if(!lookupInput()){
    if(!findButton('Add new products')){const menu=await until(()=>[...document.querySelectorAll('[role="menuitem"],.arco-menu-item')].find(e=>e.textContent.trim()==='Showcase Products'));menu.click();}
    const open=await until(()=>findButton('Add new products'));open.click();await until(lookupInput);await pause(700);
  }
  const input=lookupInput();const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
  input.focus();setter.call(input,url);input.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'insertText',data:url}));input.dispatchEvent(new Event('change',{bubbles:true}));
  // Allow React to commit before looking up the exact observed button.
  await pause(200);const button=await until(()=>findButton('Product URLs'));button.click();
}
window.addEventListener('message',event=>{
  const message=event.data;if(event.source!==window||event.origin!==location.origin||message?.channel!=='rujira-driver-request-v2'||location.hostname!=='shop.tiktok.com'||!location.pathname.startsWith('/streamer'))return;
  checkProduct(message.url).then(()=>window.postMessage({channel:'rujira-driver-response-v2',requestId:message.requestId,ok:true},location.origin),e=>window.postMessage({channel:'rujira-driver-response-v2',requestId:message.requestId,ok:false,error:e.message},location.origin));
});
})();
