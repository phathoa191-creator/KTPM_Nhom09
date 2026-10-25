const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../frontend/assets/cart-manage.js'),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
async function setup(){
 class El{constructor(){this.children=[];this.dataset={};this.listeners={};this.value='';}append(...x){this.children.push(...x);}replaceChildren(...x){this.children=x;}setAttribute(){}addEventListener(k,f){this.listeners[k]=f;}}
 const elements=Object.fromEntries(['cart-item-rows','cart-panel','cart-empty','cart-login','page-feedback','cart-total','cart-count','cart-warning'].map(id=>[id,new El()]));
 const item={productId:12,sku:'SKU',name:'<script>test</script>',quantity:3,unitPrice:'19490000.00',lineTotal:'58470000.00',availability:'available',imageUrl:'javascript:alert(1)'};
 let items=[item],total='58470000.00',confirm=true,offline=false,waiting=false,release,owner=true;const calls=[],listeners={};
 vm.runInNewContext(source,{document:{querySelector:s=>elements[s.match(/"([^"]+)"/)[1]],createElement:()=>new El(),addEventListener:(k,f)=>listeners[k]=f},window:{addEventListener(){},confirm:()=>confirm},URL,location:{href:'http://localhost/cart-manage.html'},fetch:async(url,options)=>{
 calls.push({url,options});if(options.method){if(waiting)await new Promise(r=>release=r);if(offline)throw Error('offline');if(options.method==='DELETE'){items=[];total='0.00';}else{items=[{...item,quantity:2,lineTotal:'38980000.00'}];total='38980000.00';}return {ok:true,status:200,json:async()=>({message:'Thành công.'})};}
 return {ok:owner,status:owner?200:401,json:async()=>({items,total,totalQuantity:items.reduce((a,i)=>a+i.quantity,0),hasUnavailableItems:false})};}});
 await tick();const controls=()=>elements['cart-item-rows'].children[0];
 const click=(remove=false)=>controls().children[4].children[remove?1:0].listeners.click({preventDefault(){}});
 return {elements,calls,listeners,controls,click,setConfirm:v=>confirm=v,setOffline:v=>offline=v,setWaiting:v=>waiting=v,release:()=>release(),logout:()=>{owner=false;listeners['auth-state-changed']();}};
}
test('management renders safe values, validates quantity, reloads SQL totals, confirms delete and empties cart',async()=>{
 const ui=await setup(),e=ui.elements;assert.match(e['cart-total'].textContent,/58.470.000/);const row=ui.controls();assert.equal(row.children[0].children[0].children[1].children[0].textContent,'<script>test</script>');assert.equal(row.children[0].children[0].children[0].src,'assets/images/demo-phone-01.svg');
 row.children[2].children[0].value='0';ui.click();await tick();assert.equal(ui.calls.length,1);
 row.children[2].children[0].value='2';ui.click();await tick();assert.match(e['cart-total'].textContent,/38.980.000/);assert.equal(ui.calls[1].options.method,'PATCH');assert.deepEqual(JSON.parse(ui.calls[1].options.body),{quantity:2});assert.equal(ui.calls[1].options.credentials,'same-origin');
 ui.setConfirm(false);ui.click(true);await tick();assert.equal(ui.calls.filter(c=>c.options.method==='DELETE').length,0);
 ui.setConfirm(true);ui.click(true);await tick();assert.equal(e['cart-empty'].hidden,false);assert.equal(e['cart-panel'].hidden,true);
});
test('management blocks duplicates, ignores late logout response and blocks retry after ambiguous failure',async()=>{
 const ui=await setup();ui.setWaiting(true);ui.click();await tick();ui.click();assert.equal(ui.calls.filter(c=>c.options.method).length,1);ui.logout();assert.equal(ui.elements['cart-item-rows'].children.length,0);await tick();ui.release();await tick();assert.equal(ui.elements['cart-panel'].hidden,true);assert.equal(ui.elements['cart-login'].hidden,false);
 const lost=await setup();lost.setOffline(true);lost.click();await tick();lost.click();await tick();assert.equal(lost.calls.filter(c=>c.options.method).length,1);assert.match(lost.elements['page-feedback'].textContent,/chưa xác định kết quả/);
});
test('management UTF-8, real data, stable locators and preserved checkout navigation',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../../frontend/cart-manage.html'),'utf8');
 for(const text of [source,html]){assert(!text.includes('\ufffd'));assert(!/(?:Ã.|Â.|Ä.|Æ.|á»|áº)/u.test(text));}
 assert(!source.includes('innerHTML'));assert(!html.includes('data-skeleton'));assert(!html.includes('cart-item-demo-phone-01'));assert(!html.includes('manage-cart-clear'));
 const cart=fs.readFileSync(path.join(__dirname,'../../frontend/cart.html'),'utf8');assert.match(cart,/href="checkout.html" data-testid="cart-checkout-link"/);assert.match(cart,/href="cart-manage.html" data-testid="cart-manage-link"/);
 assert(source.includes('manage-cart-quantity-${item.sku}'));assert(source.includes('manage-cart-remove-${item.sku}'));
});
