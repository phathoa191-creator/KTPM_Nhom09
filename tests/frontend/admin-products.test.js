const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../frontend/assets/admin-products.js'),'utf8');const tick=()=>new Promise(r=>setImmediate(r));
async function setup(initialStatus=200){
 class El{constructor(){this.children=[];this.listeners={};this.dataset={};this.value='';this.textContent='';}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}addEventListener(k,f){this.listeners[k]=f;}reset(){for(const key of ['sku','slug','name','category','price','stock','description','image-url','image-alt'])elements['admin-product-'+key].value='';}}
 const ids=['admin-product-form','admin-panel','admin-product-rows','page-feedback','admin-product-form-feedback','admin-product-create','admin-product-save','admin-product-new','admin-query','admin-filter','admin-search-form','admin-reload','admin-prev','admin-next','admin-pagination',...['sku','slug','name','category','price','stock','description','image-url','image-alt'].map(k=>'admin-product-'+k)];
 const elements=Object.fromEntries(ids.map(id=>[id,new El()]));elements['admin-filter'].value='all';
 const product={id:1,sku:'SKU',slug:'sku',name:'<img onerror=x>',categoryId:1,category:'Điện thoại',price:'19490000.00',stock:5,isActive:true,version:'0000000000000001',description:'Mô tả',imageUrl:null};
 let status=initialStatus,writeStatus=200,offline=false,waiting=false,release,confirm=true;const calls=[],listeners={};
 vm.runInNewContext(source,{URLSearchParams,document:{querySelector:s=>elements[s.match(/"([^"]+)"/)[1]],createElement:()=>new El(),addEventListener:(k,f)=>listeners[k]=f},window:{addEventListener(){},confirm:()=>confirm},fetch:async(url,options)=>{
 calls.push({url,options});if(options.method&&waiting)await new Promise(r=>release=r);if(options.method&&offline)throw Error('offline');
 const code=options.method?writeStatus:status;
 return{status:code,ok:code<400,json:async()=>code>=400?{message:code===409?'Sản phẩm đã thay đổi. Hãy tải lại.':'Có lỗi.',errors:code===400?{price:'Giá không hợp lệ.'}:undefined}:url==='/api/admin/categories'?{categories:[{id:1,name:'Điện thoại',isActive:true}]}:url.startsWith('/api/admin/products?')?{products:[product],total:25}:{product}};
 }});await tick();
 const submit=()=>elements['admin-product-form'].listeners.submit({preventDefault(){}});
 const click=k=>elements[k].listeners.click();
 const rowAction=n=>elements['admin-product-rows'].children[0].children[6].children[n].listeners.click();
 return{elements,calls,listeners,submit,click,rowAction,setStatus:v=>status=v,setWriteStatus:v=>writeStatus=v,setOffline:v=>offline=v,setWaiting:v=>waiting=v,release:()=>release(),setConfirm:v=>confirm=v};
}
test('admin UI handles access denial, safe text, list search/paging and exact price submission',async()=>{
 for(const status of [401,403]){const ui=await setup(status);assert.equal(ui.elements['admin-panel'].hidden,true);assert.match(ui.elements['page-feedback'].textContent,status===401?/đăng nhập/:/không có quyền/);}
 const ui=await setup(),e=ui.elements;assert.equal(e['admin-panel'].hidden,false);assert.equal(e['admin-product-rows'].children[0].children[1].textContent,'<img onerror=x>');
 e['admin-query'].value='Phone';ui.click('admin-next');await tick();assert(ui.calls.some(c=>c.url.includes('page=2')));
 e['admin-search-form'].listeners.submit({preventDefault(){}});await tick();assert(ui.calls.at(-2).url.includes('q=Phone'));
 for(const [key,value]of Object.entries({sku:'NEW',slug:'new',name:'Điện thoại mới',category:'1',price:'0.10',stock:'3',description:'Mô tả'}))e['admin-product-'+key].value=value;
 ui.submit();await tick();const post=ui.calls.find(c=>c.options.method==='POST');assert.equal(JSON.parse(post.options.body).price,'0.10');assert.equal(post.options.credentials,'same-origin');assert.match(e['page-feedback'].textContent,/thành công/);
});
test('admin edit carries version, handles stale/validation, confirms status and prevents duplicate/ambiguous retries',async()=>{
 const ui=await setup(),e=ui.elements;await ui.rowAction(0);assert.equal(e['admin-product-name'].value,'<img onerror=x>');
 ui.setWriteStatus(409);ui.submit();await tick();const patch=ui.calls.find(c=>c.options.method==='PATCH');assert.equal(JSON.parse(patch.options.body).version,'0000000000000001');assert.match(e['admin-product-form-feedback'].textContent,/đã thay đổi/);
 ui.setWriteStatus(400);ui.submit();await tick();assert.equal(e['admin-product-form-feedback'].textContent,'Giá không hợp lệ.');
 ui.setWriteStatus(200);ui.setConfirm(false);const before=ui.calls.length;ui.rowAction(1);await tick();assert.equal(ui.calls.length,before);
 ui.setConfirm(true);ui.rowAction(1);await tick();assert(ui.calls.some(c=>c.url.endsWith('/status')&&JSON.parse(c.options.body).isActive===false));
 ui.setWaiting(true);ui.submit();await tick();ui.submit();const count=ui.calls.filter(c=>c.options.method).length;ui.setStatus(401);ui.listeners['auth-state-changed']();assert.equal(e['admin-product-rows'].children.length,0);await tick();ui.release();await tick();assert.equal(e['admin-panel'].hidden,true);assert.equal(e['admin-product-name'].value,'');assert.equal(ui.calls.filter(c=>c.options.method).length,count);
 const lost=await setup();lost.setOffline(true);lost.submit();await tick();lost.submit();await tick();assert.equal(lost.calls.filter(c=>c.options.method).length,1);assert.match(lost.elements['admin-product-form-feedback'].textContent,/chưa xác định kết quả/);
});
test('admin UTF-8 and stable form locators; no skeleton or unsafe rendering',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../../frontend/admin/products.html'),'utf8');
 for(const text of [source,html]){assert(!text.includes('\ufffd'));assert(!/(?:Ã.|Â.|Ä.|Æ.|á»|áº)/u.test(text));}
 assert(!source.includes('innerHTML'));assert(!html.includes('data-skeleton'));assert(!html.includes('DEMO-PHONE-01'));
 for(const id of ['admin-products','admin-product-form','admin-product-sku','admin-product-name','admin-product-save','admin-product-create','admin-product-image-url'])assert(html.includes(`data-testid="${id}"`));
 for(const label of ['Bảo trì sản phẩm','Tên sản phẩm','Tồn kho','Lưu chỉnh sửa'])assert(html.includes(label));
});
