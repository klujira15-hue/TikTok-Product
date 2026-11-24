// Runs only on TikTok. Network requests are never replayed or modified.
(()=>{
  let enabled=false;const channel='rujira-products-v1';
  window.addEventListener('message',e=>{if(e.source===window&&e.data?.channel==='rujira-toggle-v1')enabled=!!e.data.enabled;});
  const keys=['product_id','productId','item_id','product_name','product_title','title','name','sale_price','sales_price','salePrice','price','min_price','original_price','market_price','list_price','sold_count','sales_count','sold','units_sold','sold_quantity','rating','product_rating','rating_score','review_count','reviews_count','comment_count','stock','stock_count','inventory','commission_rate','commission_percent','sold_7d','sold_24h','sold_30d','detail_link','product_url','pdp_url','share_url','image','image_url','cover','cover_url','main_image','product_image','images','shop','seller','shop_info','shop_name','shop_id','category_name'];
  keys.push('product_price_info','rate_info','sold_info','seller_info','seo_url','affiliate_info','format_price','format_available_price','store_name','stock_num','seller_id','review');
  const nested=['amount','value','price','name','shop_name','seller_name','id','shop_id','seller_id','rating','shop_rating','rating_score','url','uri','url_list','sale_price_decimal','origin_price_decimal','score','review_count','sold_count','canonical_url','min_sku_price','min_sku_original_price','commission_rate','est_commission_expense','commission_with_currency','product_rating'];
  function clean(v,depth=0){if(depth>4)return undefined;if(v==null||['string','number','boolean'].includes(typeof v))return v;if(Array.isArray(v))return v.slice(0,10).map(x=>clean(x,depth+1));if(typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>nested.includes(k)).map(([k,x])=>[k,clean(x,depth+1)]));}
  function inspect(data){
    if(!enabled)return;let visits=0;const products=[],checks=[];
    function walk(o,d=0){
      if(!o||typeof o!=='object'||d>30||++visits>70000)return;
      if(Array.isArray(o)){for(const x of o)walk(x,d+1);return;}
      if(o.original_url&&o.product_info?.closed_loop_product)walk({...o.product_info.closed_loop_product,product_url:o.original_url},d+1);
      if(o.original_url&&o.product_info?.tips)checks.push({original_url:o.original_url,product_info:{tips:{title:o.product_info.tips.title,description:o.product_info.tips.description}}});
      if(o.product_info?.product_id){const p=o.product_info;const detailed={...p,seller_info:o.shop_info||p.seller,category_name:o.categories?.find(c=>c.is_leaf)?.category_name,product_price_info:{sale_price_decimal:p.price?.min_sku_price,origin_price_decimal:p.price?.min_sku_original_price},rate_info:{score:p.review?.product_rating,review_count:p.review?.review_count}};if(p.skus?.length&&p.skus.every(s=>s.stock!=null&&Number.isFinite(Number(s.stock))&&Number(s.stock)>=0))detailed.stock=p.skus.reduce((a,s)=>a+Number(s.stock),0);walk(detailed,d+1);}
      const id=o.product_id??o.productId;const name=o.product_name??o.product_title??o.title??o.name;
      if(id!=null&&typeof name==='string'&&!o.review_id&&!o.reviewer_name&&products.length<2000)products.push(Object.fromEntries(Object.entries(o).filter(([k])=>keys.includes(k)).map(([k,v])=>[k,clean(v)])));
      for(const [k,v]of Object.entries(o))if(!(k==='product_info'&&o.product_info?.product_id))walk(v,d+1);
    }
    walk(data);if(products.length||checks.length)window.postMessage({channel,payload:{products,checks}},location.origin);
  }
  function parse(text){if(text.length>12*1024*1024)return;try{inspect(JSON.parse(text,(key,value,ctx)=>typeof value==='number'&&!Number.isSafeInteger(value)&&Number.isInteger(value)?ctx?.source??value:value));}catch{}}
  const originalFetch=window.fetch;
  window.fetch=function(...args){const result=Reflect.apply(originalFetch,this,args);result.then(r=>{if(!enabled)return;let host;try{host=new URL(r.url).hostname;}catch{return;}if(!(host==='tiktok.com'||host.endsWith('.tiktok.com')))return;const ct=r.headers.get('content-type')||'';if(ct.includes('json'))r.clone().text().then(parse).catch(()=>{});}).catch(()=>{});return result;};
  const send=XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send=function(...args){this.addEventListener('load',()=>{if(!enabled)return;try{const host=new URL(this.responseURL).hostname;if(!(host==='tiktok.com'||host.endsWith('.tiktok.com')))return;if(this.responseType==='json')inspect(this.response);else if(!this.responseType||this.responseType==='text')parse(this.responseText);}catch{}});return Reflect.apply(send,this,args);};
  // Read product data embedded at page load as well as network responses.
  function embedded(){if(!enabled)return;for(const s of document.querySelectorAll('script[type="application/json"],script#__UNIVERSAL_DATA_FOR_REHYDRATION__,script#SIGI_STATE'))parse(s.textContent||'');}
  document.addEventListener('DOMContentLoaded',embedded);window.addEventListener('message',e=>{if(e.source===window&&e.data?.channel==='rujira-toggle-v1'&&e.data.enabled)embedded();});
})();
