// Match product identity, never seller names, URLs, notes or recommendations.
const clean=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\u200b-\u200d\ufeff]/g,'').replace(/\s+/g,' ').trim();
const diaper=/ผ้าอ้อม|แพมเพิส|diapers?|napp(?:y|ies)|incontinence/i;
const underwear=/กางเกงใน|ชั้นใน|บ็อกเซอร์|บ๊อกเซอร์|underwear|briefs?|panties|boxers?/i;
const pants=/กางเกง|ยีนส์|สแล็ค|เลกกิ้ง|เลคกิ้ง|\b(?:pants?|trousers?|jeans?|shorts?|joggers?|leggings?)\b/i;
const tops=/เสื้อ|คาร์ดิแกน|สเวตเตอร์|\b(?:shirts?|t-shirts?|tees?|blouses?|tops?|hoodies?|sweaters?|jackets?|knitwear|cardigans?|coats?|rashguards?)\b/i;
const unrelatedPantsCategory=/เสื้อ|กระโปรง|เดรส|ชุดเดรส|ผ้าอ้อม|ชั้นใน|กางเกงใน|shirts?|blouses?|tops?|dresses?|skirts?|underwear|briefs?|panties|boxers?|diapers?|napp(?:y|ies)/i;
const segmenter=new Intl.Segmenter('th',{granularity:'word'});
const phrases=/กางเกงใน|กางเกง|ยีนส์|เสื้อเชิ้ต|เสื้อยืด|เสื้อ|แขนยาว|แขนสั้น|ขายาว|ขาสั้น|ผู้หญิง|ผู้ชาย|เครื่องดูดฝุ่น|กันแดด/g;
const stopWords=new Set(['สำหรับ','และ','แบบ','ของ','กับ']);
const termCache=new Map();
export function searchTerms(query){
 const q=clean(query),terms=[];let offset=0;
 if(termCache.has(q))return termCache.get(q);
 for(const match of q.matchAll(phrases)){terms.push(...[...segmenter.segment(q.slice(offset,match.index))].filter(s=>s.isWordLike).map(s=>s.segment),match[0]);offset=match.index+match[0].length;}
 terms.push(...[...segmenter.segment(q.slice(offset))].filter(s=>s.isWordLike).map(s=>s.segment));const result=Object.freeze([...new Set(terms.filter(t=>!stopWords.has(t)))]);if(termCache.size>=256)termCache.delete(termCache.keys().next().value);termCache.set(q,result);return result;
}
function matchesTerm(term,name,text){
 if(name.includes(term))return true;
 if(/^(?:กางเกง|pants?|trousers?)$/.test(term))return pants.test(text);
 if(/^(?:ยีนส์|jeans?)$/.test(term))return /ยีนส์|\bjeans?\b/i.test(text);
 if(/^(?:เสื้อ|shirts?|tops?)$/.test(term))return tops.test(text);
 if(term==='เสื้อยืด')return /\bt-?shirts?\b|\btees?\b/i.test(text);
 if(term==='เสื้อเชิ้ต')return /\bshirts?\b|\bblouses?\b/i.test(text)&&!/\bt-?shirts?\b/i.test(text);
 if(term==='แขนยาว')return /long[ -]sleeve(?:d|s)?/i.test(text);
 if(term==='แขนสั้น')return /short[ -]sleeve(?:d|s)?/i.test(text);
 if(term==='ขายาว')return /\b(?:long pants|trousers|full[ -]length)\b/i.test(text);
 if(term==='ขาสั้น')return /\bshorts?\b/i.test(text);
 if(term==='ผู้หญิง')return /women|ladies|female/i.test(text);
 if(term==='ผู้ชาย')return /\bmen\b|\bmale\b/i.test(text);
 if(term==='เครื่องดูดฝุ่น')return /\bvacuum(?: cleaner)?s?\b/i.test(text);
 if(term==='กันแดด')return /sunscreen|sunblock|sun protection/i.test(text);
 return false;
}

export function matchesSearch(product,query){
  const q=clean(query),name=clean(product?.name),category=clean(product?.category);
  if(!q||!name)return false;
  const text=name+' '+category;
  // Specific intents override the broad word "กางเกง" inside their names.
  if(diaper.test(q)){if(!diaper.test(text))return false;}
  else if(underwear.test(q)){if(diaper.test(text)||!underwear.test(text))return false;}
  else if(pants.test(q)){
    if(diaper.test(text)||underwear.test(text)||unrelatedPantsCategory.test(category))return false;
    if(!pants.test(text))return false;
    // A shirt mentioning matching pants is still a shirt; sets are not pants alone.
    if(/^(?:\[[^\]]*\]\s*)*(?:เสื้อ|t-shirt|shirt|blouse)/i.test(name)||/ชุด(?:เซ[็ทต]|เสื้อ)|เซ[็ทต].*เสื้อ(?!ผ้า)|เสื้อ(?!ผ้า).*(?:พร้อม|และ|\+).*กางเกง/.test(name))return false;
  }else if(tops.test(q)){
    if(diaper.test(text)||underwear.test(text)||!tops.test(text))return false;
    if(pants.test(category)&&!tops.test(category))return false;
    if(/^(?:กางเกง|ยีนส์)/.test(name))return false;
  }
  // Preserve meaningful modifiers while allowing other words between Thai terms.
  const terms=searchTerms(q);return terms.length>0&&terms.every(term=>matchesTerm(term,name,text));
}
