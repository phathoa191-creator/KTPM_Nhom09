const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../../frontend/assets/checkout.js'),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
test('checkout HTML and scripts preserve Vietnamese UTF-8 text',()=>{
 const {TextDecoder}=require('node:util');
 for(const file of ['checkout.html','assets/checkout.js','assets/auth.js','assets/app.js']){
  const bytes=fs.readFileSync(require('node:path').join(__dirname,'../../frontend',file));
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  assert(!text.includes('\uFFFD'),`${file}: replacement character`);
  assert(!/(?:Ã.|Â.|Ä.|Æ.|á»|áº)/u.test(text),`${file}: mojibake`);
 }
 const html=fs.readFileSync(require.resolve('../../frontend/checkout.html'),'utf8');
 assert.match(html,/<meta charset="utf-8">/i);
 for(const label of ['Đặt hàng','Đăng nhập để đặt hàng','Sản phẩm','Đơn giá','Số lượng','Thành tiền','Người nhận','Số điện thoại','Địa chỉ giao hàng','Xác nhận đặt hàng','Thanh toán khi nhận hàng (COD). Đơn hàng phục vụ demo học tập.','Quay lại giỏ hàng','Giá và tồn kho được kiểm tra lại khi đặt hàng. Thêm giỏ không giữ chỗ sản phẩm.'])assert(html.includes(label),label);
 // Only the two original header prompts legitimately contain question marks.
 const visible=html.replace(/<[^>]*>/g,'');
 assert(!visible.replace('Bạn cần tìm gì?','').includes('?'));
 for(const message of ['Tổng tiền tạm tính: ','Vui lòng đăng nhập để đặt hàng.','Giỏ hàng đang trống.','Đang xác nhận đơn hàng...','Đặt hàng thành công. Mã đơn: ','Mất kết nối. Nhấn xác nhận để thử lại cùng mã yêu cầu.'])assert(source.includes(message),message);
});

test('static checkout responses serve the exact UTF-8 file bytes without database access',async()=>{
 const {createApp}=require('../../backend/src/server');
 const app=createApp({poolProvider:async()=>{throw Error('Static files must not access SQL');}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{
  for(const path of ['/checkout.html','/assets/checkout.js']){
   const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`);
   assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/charset=utf-8/i);
   assert.deepEqual(Buffer.from(await response.arrayBuffer()),fs.readFileSync(require('node:path').join(__dirname,'../../frontend',path)));
  }
 }finally{await new Promise(r=>server.close(r));}
});
async function setup(){
 class El{constructor(){this.hidden=false;this.disabled=false;this.dataset={};this.children=[];this.value='';this.textContent='';this.listeners={};}append(...x){this.children.push(...x);}replaceChildren(){this.children=[];}addEventListener(k,f){this.listeners[k]=f;}reset(){for(const id of ['checkout-recipient','checkout-phone','checkout-address'])elements[id].value='';}}
 const ids=['checkout-form','checkout-panel','checkout-items','checkout-form-feedback','page-feedback','checkout-success','checkout-submit','checkout-login','cart-total','checkout-recipient','checkout-phone','checkout-address'];
 const elements=Object.fromEntries(ids.map(id=>[id,new El()]));const listeners={},calls=[];let owner=7,mode='network',resolvePost;
 vm.runInNewContext(source,{document:{querySelector:s=>elements[s.match(/"([^"]+)"/)[1]],createElement:()=>new El(),addEventListener:(k,f)=>listeners[k]=f},window:{addEventListener(){}},crypto:{randomUUID:()=> '12345678-1234-1234-1234-123456789012'},fetch:async(url,options)=>{
 calls.push({url,options});if(url==='/api/auth/me')return {ok:true,json:async()=>({user:owner?{id:owner}:null})};
 if(url==='/api/cart')return {ok:true,json:async()=>({items:[{name:'<b>Phone</b>',sku:'SKU',unitPrice:'19490000.00',quantity:3,lineTotal:'58470000.00'}],total:'58470000.00',hasUnavailableItems:false})};
 if(mode==='network')throw Error('offline');if(mode==='wait')await new Promise(r=>resolvePost=r);
 return {ok:true,status:201,json:async()=>({orderCode:'CPS-ONE',total:'58470000.00'})};}});
 await tick();return {elements,calls,listeners,setOwner:x=>owner=x,setMode:x=>mode=x,release:()=>resolvePost(),submit:()=>elements['checkout-form'].listeners.submit({preventDefault(){}})};
}
test('checkout renders real values, validates phone and retries identical request after lost response',async()=>{
 const ui=await setup(),e=ui.elements;assert.equal(e['cart-total'].textContent,'Tổng tiền tạm tính: 58.470.000 ₫');assert.equal(e['checkout-items'].children[0].children[0].textContent,'<b>Phone</b>');
 e['checkout-recipient'].value='A';e['checkout-address'].value='B';e['checkout-phone'].value='123';await ui.submit();assert.equal(ui.calls.filter(c=>c.url==='/api/orders').length,0);
 e['checkout-phone'].value='0901234567';await ui.submit();ui.setMode('success');await ui.submit();
 const posts=ui.calls.filter(c=>c.url==='/api/orders');assert.equal(posts.length,2);assert.equal(posts[0].options.body,posts[1].options.body);assert.equal(posts[0].options.credentials,'same-origin');assert.match(e['checkout-success'].textContent,/CPS-ONE/);assert.equal(e['checkout-panel'].hidden,true);
 ui.setOwner(null);ui.listeners['auth-state-changed']();assert.equal(e['checkout-success'].textContent,'');await tick();assert.equal(e['checkout-login'].hidden,false);
});
test('checkout blocks double submit and ignores late order response after account change',async()=>{
 const ui=await setup(),e=ui.elements;for(const [id,v]of [['checkout-recipient','A'],['checkout-address','B'],['checkout-phone','0901234567']])e[id].value=v;
 ui.setMode('wait');const first=ui.submit();await tick();await ui.submit();assert.equal(ui.calls.filter(c=>c.url==='/api/orders').length,1);
 ui.setOwner(8);ui.listeners['auth-state-changed']();await tick();ui.release();await first;assert.equal(e['checkout-success'].hidden,true);assert.equal(e['checkout-success'].textContent,'');assert.equal(e['checkout-recipient'].value,'');
});
