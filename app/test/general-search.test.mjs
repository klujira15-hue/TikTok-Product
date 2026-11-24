import test from 'node:test';import assert from 'node:assert/strict';
import {matchesSearch,searchTerms} from '../search-relevance.mjs';import {relatedCategorySources} from '../coverage.mjs';
test('Thai long-sleeve intent allows intervening garment words while preserving sleeve length and product type',()=>{
 assert.deepEqual(searchTerms('เสื้อแขนยาว'),['เสื้อ','แขนยาว']);
 for(const p of [{name:'เสื้อเชิ้ตผ้าฝ้ายแขนยาว',category:'Blouses & Shirts'},{name:'เสื้อยืดผู้หญิง แขนยาว',category:'T-Shirts'},{name:'Long sleeve cotton shirt',category:'Shirts'},{name:'คาร์ดิแกนแขนยาว',category:"Women's Knitwear"}])assert.ok(matchesSearch(p,'เสื้อแขนยาว'),p.name);
 for(const p of [{name:'เสื้อแขนสั้น ทรงยาว',category:'T-Shirts'},{name:'กางเกงขายาว ใส่กับเสื้อแขนยาว',category:'Pants'},{name:'ผ้าอ้อมแบบกางเกง'},{name:'เสื้อแขนสั้น',category:'Hoodies & Sweatshirts'}])assert.equal(matchesSearch(p,'เสื้อแขนยาว'),false,p.name);
});
test('General Thai compounds match words with intervening descriptions, retaining every meaningful modifier',()=>{
 for(const [q,p] of [['ครีมกันแดด',{name:'ครีมบำรุงผิว กันแดด SPF50'}],['พัดลม',{name:'พัดลมตั้งโต๊ะ 16 นิ้ว'}],['รองเท้าวิ่ง',{name:'รองเท้าผู้หญิงสำหรับวิ่ง'}],['เครื่องดูดฝุ่น',{name:'Cordless vacuum cleaner'}]])assert.ok(matchesSearch(p,q),q);
 for(const [q,p] of [['ครีมกันแดด',{name:'ครีมบำรุงผิวทั่วไป'}],['พัดลม',{name:'เครื่องปรับอากาศ',shop:'พัดลมไฟฟ้า'}],['รองเท้าวิ่ง สีแดง',{name:'รองเท้าวิ่ง สีดำ'}],['เสื้อแขนยาวผู้หญิง',{name:'เสื้อแขนยาวผู้ชาย',category:"Men's Shirts"}]])assert.equal(matchesSearch(p,q),false,q);
});
test('Related English categories are explored for every query, while products still need the full original intent',()=>{
 for(const [q,label] of [['เสื้อแขนยาว','Hoodies & Sweatshirts'],['ครีมกันแดด','Facial Sunscreen'],['พัดลม','Electric Fans']]){
 const d={loaderData:{page:{page_config:{components_map:[{component_name:'related_link_categories',component_data:{related_links:[{name:label,link:'https://shop.tiktok.com/th/c/products/123'}]}}]}}}};
 assert.equal(relatedCategorySources(d,q).length,1,q);
 }
});
