export function relatedCategorySources(payload,query){
 const page=Object.values(payload?.loaderData||{}).find(p=>p?.page_config);
 const links=(page?.page_config.components_map||[]).filter(c=>c.component_name==='related_link_categories').flatMap(c=>c.component_data?.related_links||[]);
 // TikTok supplies related discovery categories, often broader and in English.
 // Query eligibility belongs on each product, not on this category's label.
 const unique=new Map();for(const row of links){try{const u=new URL(row.link);if(u.protocol!=='https:'||u.hostname!=='shop.tiktok.com'||u.username||u.password||!/^\/th\/c\/[^/]+\/\d+$/.test(u.pathname)||!row.name)continue;const categoryId=u.pathname.split('/').at(-1);unique.set(categoryId,{url:u.href,label:row.name,type:'category',categoryId});}catch{}}
 return [...unique.values()];
}
export function categoryFeed(payload){
 const page=Object.values(payload?.loaderData||{}).find(p=>p?.page_config);
 return page?.page_config.components_map?.find(c=>c.component_name==='homepage_products')?.component_data?.categoryProductsData;
}
