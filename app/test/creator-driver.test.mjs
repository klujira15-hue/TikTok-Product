import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
test('Creator driver checks a URL through native input events and never commits Add products',async()=>{
 const clicks=[],events=[],messages=[];let modal=false;let registered;
 class Input {set value(v){this.current=v;}get value(){return this.current||'';}focus(){}dispatchEvent(event){events.push(event.type);if(event.type==='input')buttons[1].disabled=false;}}
 const input=new Input();const makeButton=(text,click,disabled=false)=>({textContent:text,disabled,getClientRects:()=>[{}],click(){clicks.push(text);click?.();}});
 const buttons=[makeButton('Add new products',()=>modal=true),makeButton('Product URLs',()=>{},true),makeButton('Add products',()=>{throw Error('Must never add products');})];
 const window={addEventListener:(name,fn)=>registered=fn,postMessage:m=>messages.push(m)};
 const context={window,location:{origin:'https://shop.tiktok.com',hostname:'shop.tiktok.com',pathname:'/streamer/showcase/product/list'},HTMLInputElement:Input,InputEvent:class{constructor(type){this.type=type;}},Event:class{constructor(type){this.type=type;}},Date,setTimeout:fn=>{queueMicrotask(fn);return 1;},document:{querySelector:()=>modal?input:null,querySelectorAll:selector=>selector==='button'?buttons:[]}};
 vm.runInNewContext(readFileSync(new URL('../../extension/creator-driver.js',import.meta.url),'utf8'),context);
 registered({source:window,origin:context.location.origin,data:{channel:'rujira-driver-request-v2',requestId:'a',url:'https://shop.tiktok.com/th/pdp/123'}});
 await new Promise(r=>setImmediate(r));assert.equal(input.value,'https://shop.tiktok.com/th/pdp/123');assert.deepEqual(events,['input','change']);assert.deepEqual(clicks,['Add new products','Product URLs']);assert.equal(messages[0].ok,true);
});
