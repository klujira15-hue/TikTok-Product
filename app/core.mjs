import {createHash} from 'node:crypto';
export const hasProductEvidence=p=>Number.isFinite(p?.rating)&&p.rating>0&&p.rating<=5&&Number.isFinite(p?.reviews)&&p.reviews>0;
export const isCommissionChecked=p=>/TikTok Creator/i.test(p?.commissionSource||'')&&['eligible','not_affiliate','unavailable'].includes(p?.affiliateStatus);
export const hasAffiliateCommission=p=>isCommissionChecked(p)&&p.affiliateStatus==='eligible'&&Number.isFinite(p.commission)&&p.commission>0&&(p.commissionAmount==null||p.commissionAmount>0)&&(p.commissionAmountMax==null||p.commissionAmountMax>0);
export const numeric=['price','originalPrice','sold','sold24h','sold7d','sold30d','rating','reviews','shopRating','stock','commission','commissionAmount','commissionAmountMin','commissionAmountMax','affiliatePrice','adsCommission','creators','videos'];
export function safeUrl(value, product=false){
  if(!value) return '';
  try { const u=new URL(String(value)); if(!['https:','http:'].includes(u.protocol)||u.username||u.password) return ''; if(product && !(u.hostname==='tiktok.com'||u.hostname.endsWith('.tiktok.com'))) return ''; return u.href; }catch{return '';}
}
export function normalize(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('รูปแบบสินค้าไม่ถูกต้อง');
  for(const k of ['productId','shopId'])if(typeof input[k]==='number'&&!Number.isSafeInteger(input[k]))throw Error('กรุณาใส่ '+k+' เป็นข้อความเพื่อไม่ให้เลข ID คลาดเคลื่อน');
  const p={};
  for(const k of ['name','productId','shopId','shop','category','notes','hook','script','source','commissionSource','commissionObservedAt','shopRatingSource','shopRatingObservedAt','affiliateStatus','affiliateReason']) if(input[k]!=null) p[k]=String(input[k]).slice(0,12000);
  for(const k of numeric) if(Object.hasOwn(input,k)) {const v=input[k]; if(v===''||v==null) p[k]=null; else {const n=Number(v); if(!Number.isFinite(n)||n<0) throw Error('ค่าตัวเลขไม่ถูกต้อง: '+k); if((k==='rating'||k==='shopRating')&&n>5) throw Error('คะแนนดาวต้องไม่เกิน 5'); if((k==='commission'||k==='adsCommission')&&n>100) throw Error('ค่าคอมต้องไม่เกิน 100%'); p[k]=n;}}
  for(const k of ['url','affiliateUrl','image']) if(Object.hasOwn(input,k)){p[k]=safeUrl(input[k],k!=='image'); if(input[k]&&!p[k]) throw Error('ลิงก์ไม่ถูกต้อง: '+k);}
  if(Object.hasOwn(input,'favorite')) p.favorite=!!input.favorite;
  if(Object.hasOwn(input,'stage')) {if(!['inbox','shortlist','scripting','filming','published'].includes(input.stage)) throw Error('สถานะไม่ถูกต้อง');p.stage=input.stage;}
  if(input.observedAt){if(!Number.isFinite(Date.parse(input.observedAt)))throw Error('วันที่ข้อมูลไม่ถูกต้อง'); p.observedAt=new Date(input.observedAt).toISOString();}
  return p;
}
export function identity(p){
  if(p.productId && !/^\d+$/.test(p.productId)) throw Error('Product ID ต้องเป็นเลขและเก็บเป็นข้อความ');
  const match=p.url?.match(/(?:product\/|product_id=|pdp\/(?:[^/?]+\/)?)(\d+)/); if(!p.productId&&match)p.productId=match[1];
  if(p.productId) return 'tt:'+p.productId;
  if(p.url) return 'url:'+createHash('sha256').update(p.url).digest('hex').slice(0,24);
  throw Error('ต้องมี Product ID หรือลิงก์สินค้า');
}
export function score(p,all){
  const peers=p.category?all.filter(x=>x.category===p.category && x.sold!=null):[];
  const parts=[];
  const add=(key,label,weight,value)=>parts.push({key,label,weight,value:value==null?null:Math.max(0,Math.min(1,value))});
  add('sold','ยอดขายเทียบหมวด',25,p.sold==null||peers.length<3?null:peers.filter(x=>x.sold<=p.sold).length/peers.length);
  add('rating','ดาวสินค้า',20,p.rating==null?null:p.rating/5);
  add('shopRating','ดาวร้าน',20,p.shopRating==null?null:p.shopRating/5);
  add('reviews','จำนวนรีวิว',10,p.reviews==null?null:Math.log10(1+p.reviews)/4);
  const prev=p.previousSold7d;
  add('growth','เติบโต 7 วัน',10,prev==null||prev<=0||p.sold7d==null?null:Math.max(0,(p.sold7d-prev)/prev));
  add('commission','ค่าคอม',10,p.commission==null?null:p.commission/20);
  add('stock','สต็อก',5,p.stock==null?null:p.stock/100);
  const coverage=parts.filter(x=>x.value!=null).reduce((a,x)=>a+x.weight,0);
  const value=coverage?Math.round(parts.reduce((a,x)=>a+(x.value??0)*x.weight,0)/coverage*100):null;
  const missingCritical=['shopRating','commission'].filter(k=>p[k]==null);
  const eligible=coverage>=70&&!missingCritical.length&&!['not_affiliate','unavailable'].includes(p.affiliateStatus);
  const angelChecks=[{label:'คะแนน ≥ 90',ok:value!=null&&value>=90},{label:'ดาวสินค้า ≥ 4.8',ok:p.rating!=null&&p.rating>=4.8},{label:'ดาวร้าน ≥ 4.8',ok:p.shopRating!=null&&p.shopRating>=4.8},{label:'ยอดขาย ≥ 5,000',ok:p.sold!=null&&p.sold>=5000},{label:'รีวิว ≥ 500',ok:p.reviews!=null&&p.reviews>=500},{label:'ค่าคอม ≥ 10%',ok:p.commission!=null&&p.commission>=10},{label:'มีสต็อกเมื่อทราบข้อมูล',ok:p.stock==null||p.stock>0}];
  const angel=eligible&&angelChecks.every(x=>x.ok);
  return {value,coverage,eligible,angel,angelChecks,missingCritical,grade:p.affiliateStatus==='not_affiliate'?'ไม่ร่วม Affiliate':p.affiliateStatus==='unavailable'?'ตรวจไม่ได้':!eligible?'ข้อมูลไม่พอ':value>=90?'S':value>=80?'A':value>=70?'B':value>=60?'C':'D',parts};
}
const pick=(o,keys)=>{for(const k of keys)if(o?.[k]!=null)return o[k];};
function number(v){if(v==null||v==='')return undefined;if(typeof v==='object')v=pick(v,['amount','value','price']);if(v==null)return undefined;const s=String(v).replace(/[,฿%\s]/g,'');const m=s.match(/^(\d+(?:\.\d+)?)\s*([kKmM])?(?:sold|ขายแล้ว|ชิ้น)?$/);return m?Number(m[1])*(m[2]?.toLowerCase()==='k'?1000:m[2]?.toLowerCase()==='m'?1000000:1):undefined;}
export function extractProducts(payload,source='web-capture'){
  const result=new Map();let visited=0;
  function walk(o,depth=0){
    if(!o||typeof o!=='object'||depth>30||++visited>100000)return;
    if(Array.isArray(o)){for(const x of o)walk(x,depth+1);return;}
    if(o.original_url&&o.product_info?.closed_loop_product)walk({...o.product_info.closed_loop_product,product_url:o.original_url},depth+1);
    if(o.original_url&&o.product_info?.tips){
      const reason=String(o.product_info.tips.description||o.product_info.tips.title||'');
      const url=safeUrl(o.original_url,true);const p={url};
      if(url){try{identity(p);if(p.productId){const status=/not an affiliate product/i.test(reason)?'not_affiliate':'unavailable';result.set(p.productId,{...result.get(p.productId),productId:p.productId,url,affiliateStatus:status,affiliateReason:reason,commission:null,commissionAmount:null,commissionAmountMin:null,commissionAmountMax:null,affiliatePrice:null,commissionSource:source,commissionObservedAt:new Date().toISOString(),source});}}catch{}}
    }
    if(o.product_info?.product_id){
      const p=o.product_info;
      const detailed={...p,seller_info:o.shop_info||p.seller,category_name:o.categories?.find(c=>c.is_leaf)?.category_name,product_price_info:{sale_price_decimal:p.price?.min_sku_price,origin_price_decimal:p.price?.min_sku_original_price},rate_info:{score:p.review?.product_rating,review_count:p.review?.review_count}};
      if(p.skus?.length&&p.skus.every(s=>s.stock!=null&&Number.isFinite(Number(s.stock))&&Number(s.stock)>=0))detailed.stock=p.skus.reduce((sum,s)=>sum+Number(s.stock),0);
      walk(detailed,depth+1);
    }
    const id=pick(o,['product_id','productId']);
    const name=pick(o,['product_name','product_title','title','name']);
    if(id!=null&&!o.review_id&&!o.reviewer_name&&!(typeof id==='number'&&!Number.isSafeInteger(id))&&/^\d+$/.test(String(id))&&typeof name==='string'){
      const shop=o.seller_info||o.shop||o.seller||o.shop_info||{};
      const price=o.product_price_info?.sale_price_decimal??pick(o,['sale_price','sales_price','salePrice','price','min_price']);
      const img=pick(o,['image','image_url','cover','cover_url','main_image','product_image']);
      const image=typeof img==='string'?img:img?.url_list?.[0]||pick(img,['url'])||o.images?.[0]?.url_list?.[0];
      const p={productId:String(id),name,source,observedAt:new Date().toISOString()};
      const shopName=pick(shop,['name','shop_name','seller_name'])||o.shop_name||o.store_name;
      const shopId=pick(shop,['id','shop_id','seller_id'])||o.shop_id||o.seller_id;
      if(shopName)p.shop=String(shopName);if(shopId)p.shopId=String(shopId);if(o.category_name)p.category=String(o.category_name);
      const link=o.seo_url?.canonical_url??pick(o,['detail_link','product_url','pdp_url','share_url']);
      if(safeUrl(link,true))p.url=link;
      if(safeUrl(image))p.image=image;
      const fields={price,originalPrice:o.product_price_info?.origin_price_decimal??pick(o,['original_price','market_price','list_price']),sold:o.sold_info?.sold_count??pick(o,['sold_count','sales_count','sold','units_sold','sold_quantity']),rating:o.rate_info?.score??o.review?.product_rating??pick(o,['rating','product_rating','rating_score']),reviews:o.rate_info?.review_count??o.review?.review_count??pick(o,['review_count','reviews_count','comment_count']),stock:pick(o,['stock','stock_count','inventory']),shopRating:pick(shop,['rating','shop_rating','rating_score']),commission:pick(o,['commission_rate','commission_percent']),sold7d:o.sold_7d,sold24h:o.sold_24h,sold30d:o.sold_30d};
      for(const [k,v] of Object.entries(fields)){const n=number(v);if(n!=null&&n>=0&&(!['rating','shopRating'].includes(k)||n<=5)&&(!k.toLowerCase().includes('commission')||n<=100))p[k]=n;}
      const rate=number(o.affiliate_info?.commission_rate);
      const amountRaw=o.affiliate_info?.commission_with_currency??o.affiliate_info?.est_commission_expense;
      const amount=number(amountRaw);
      if(rate!=null&&rate>=0&&rate<=10000)p.commission=rate/100; // Creator link/check returns basis points: 500 = 5%.
      if(amount!=null){p.commissionAmount=amount;p.commissionAmountMin=null;p.commissionAmountMax=null;}
      else if(typeof amountRaw==='string'){const bounds=amountRaw.replace(/[,฿\s]/g,'').match(/^(\d+(?:\.\d+)?)[–~-](\d+(?:\.\d+)?)$/);if(bounds&&Number(bounds[2])>=Number(bounds[1])){p.commissionAmount=null;p.commissionAmountMin=Number(bounds[1]);p.commissionAmountMax=Number(bounds[2]);}}
      if(o.affiliate_info&&(p.commission!=null||p.commissionAmount!=null)){p.affiliateStatus='eligible';p.affiliateReason='';p.commissionSource=source;p.commissionObservedAt=p.observedAt;const ap=number(o.format_price??o.format_available_price);if(ap!=null)p.affiliatePrice=ap;}
      if(p.shopRating!=null){p.shopRatingSource=source;p.shopRatingObservedAt=p.observedAt;}
      if(o.stock_num!=null){const stock=number(o.stock_num);if(stock!=null)p.stock=stock;}
      if(p.rating===0&&p.reviews===0)p.rating=null;
      result.set(p.productId,{...result.get(p.productId),...p});
    }
    for(const [key,v] of Object.entries(o))if(!(key==='product_info'&&o.product_info?.product_id))walk(v,depth+1);
  }
  // HAR is read only for response content. Request headers, cookies and tokens are never stored.
  if(payload?.log?.entries){for(const e of payload.log.entries){let u;try{u=new URL(e.request.url);}catch{continue;}if(!(u.hostname==='tiktok.com'||u.hostname.endsWith('.tiktok.com')))continue;try{const c=e.response?.content;if(c?.text){const t=c.encoding==='base64'?Buffer.from(c.text,'base64').toString('utf8'):c.text;walk(JSON.parse(t));}}catch{}}}
  else walk(payload);
  return [...result.values()];
}
export function csv(rows,cols){const cell=x=>{let s=String(x??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};return '\uFEFF'+[cols,...rows.map(p=>cols.map(k=>p[k]))].map(r=>r.map(cell).join(',')).join('\r\n');}
