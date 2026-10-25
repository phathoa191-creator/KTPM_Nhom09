const {test}=require('node:test');const assert=require('node:assert/strict');
const {validate,totalItems,createOrdersRepository}=require('../../backend/src/orders/orders');
const valid={requestKey:'12345678-1234-1234-1234-123456789012',recipientName:' A ',phone:'0901234567',shippingAddress:' B '};
test('checkout validates exact phone CHECK and UTF-16 schema lengths',()=>{
 assert.equal(validate(valid).recipientName,'A'); assert.equal(validate(valid).phone,'0901234567');
 for(const body of [null,{}, {...valid,phone:901234567},{...valid,phone:'090123456 '},{...valid,phone:'1901234567'},{...valid,requestKey:'x'},{...valid,recipientName:' '},{...valid,recipientName:'a'.repeat(101)},{...valid,shippingAddress:'a'.repeat(501)},{...valid,paymentMethod:'CARD'}]) assert.throws(()=>validate(body));
 assert.equal(validate({...valid,shippingAddress:'a'.repeat(500)}).shippingAddress.length,500);
});
test('checkout exact money and overflow',()=>{
 assert.equal(totalItems([{quantity:3,unitPrice:'19490000.00'}]),'58470000.00');
 assert.equal(totalItems([{quantity:3,unitPrice:'0.10'},{quantity:1,unitPrice:'0.20'}]),'0.50');
 for(const item of [{quantity:100,unitPrice:'1.00'},{quantity:1.2,unitPrice:'1.00'},{quantity:2,unitPrice:'9999999999999999.99'}]) assert.throws(()=>totalItems([item]));
});
function fixture({replay=false,fail='',stock=10,quantity=3,empty=false,affected=1}={}){
 const calls=[],state={commits:0,rollbacks:0};const tx={async begin(level){state.level=level;},async commit(){if(fail==='commit')throw Error('private');state.commits++;},async rollback(){state.rollbacks++;},request(){const params={};return {input(k,t,v){params[k]=v;return this;},async query(text){calls.push({text,params});if(fail&&text.includes(fail))throw Error('private');
 if(text.includes('FROM dbo.Carts'))return {recordset:[{id:9}]};
 if(text.includes('FROM dbo.Orders'))return {recordset:replay?[{id:8,orderCode:'OLD',total:'0.30'}]:[]};
 if(text.startsWith('SELECT')&&text.includes('FROM dbo.CartItems'))return {recordset:empty?[]:[{id:6,productId:4,quantity}]};
 if(text.includes('FROM dbo.Products'))return {recordset:[{name:'Phone',sku:'SKU',unitPrice:'0.10',stock,active:true,categoryActive:true}]};
 if(text.includes('INSERT INTO dbo.Orders'))return {recordset:[{id:8,orderCode:'NEW'}]};
 return {rowsAffected:[text.includes('DELETE')?1:affected],recordset:[]};}};}};
 return {calls,state,repo:createOrdersRepository(async()=>({}),{transactionFactory:()=>tx})};
}
test('checkout creates snapshot, conditional stock and clears cart atomically',async()=>{
 const f=fixture();const r=await f.repo.place(7,validate(valid));assert.equal(r.total,'0.30');assert.equal(r.replayed,false);assert.equal(f.state.commits,1);assert.equal(f.state.rollbacks,0);
 assert.equal(f.calls[0].params.userId,7);assert.match(f.calls[0].text,/UPDLOCK,HOLDLOCK/);
 const insert=f.calls.find(c=>c.text.includes('INSERT INTO dbo.OrderItems'));assert(!insert.text.includes('LineTotal'));assert.equal(insert.params.price,'0.10');assert.equal(insert.params.name,'Phone');
 assert(f.calls.some(c=>c.text.includes('Stock>=@quantity')));
});
test('same key returns original order before empty-cart check',async()=>{
 const f=fixture({replay:true,empty:true});assert.equal((await f.repo.place(7,validate(valid))).replayed,true);assert.equal(f.calls.length,2);assert.equal(f.state.commits,1);
});
test('all write failures, timeout/deadlock stand-ins and insufficient stock roll back',async()=>{
 for(const options of [{stock:2},{quantity:100},{empty:true},{affected:0},...['INSERT INTO dbo.Orders','INSERT INTO dbo.OrderItems','UPDATE dbo.Products','DELETE FROM dbo.CartItems','UPDATE dbo.Carts','commit'].map(fail=>({fail}))]){
 const f=fixture(options);await assert.rejects(f.repo.place(7,validate(valid)));assert.equal(f.state.commits,0);assert.equal(f.state.rollbacks,1);
 }
});
const {createApp}=require('../../backend/src/server');const {createSessionStore}=require('../../backend/src/auth/login');
test('orders API auth, origin, session owner, replay status and sanitized errors',async()=>{
 const sessions=createSessionStore(),cookie='cellphones.sid='+sessions.create(7);let replayed=false,fail=false,calls=0;
 const app=createApp({sessions,loginRepository:{findById:async id=>({id,active:true,role:'CUSTOMER'})},ordersRepository:{async place(id,data){calls++;assert.equal(id,7);assert(!('userId'in data));if(fail)throw Error('private SQL');return {orderCode:'X',total:'0.30',replayed};}}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const call=async(body,headers={Cookie:cookie})=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/orders`,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 try{assert.equal((await call(valid,{})).status,401);assert.equal((await call(valid,{Cookie:cookie,Origin:'https://evil.test'})).status,403);assert.equal(calls,0);assert.equal((await call({})).status,400);assert.equal((await call({...valid,userId:99,total:0})).status,201);replayed=true;assert.equal((await call(valid)).status,200);fail=true;const r=await call(valid);assert.equal(r.status,503);assert(!JSON.stringify(r.body).includes('private'));}finally{await new Promise(r=>server.close(r));}
});
// Deterministic lock-model tests exercise overlapping repository calls without SQL writes.
function concurrentStore(){
 const state={stock:1,carts:new Map([[7,true],[8,true]]),orders:new Map(),inserts:0};let tail=Promise.resolve();
 const factory=()=>{let release,snapshot;return {async begin(){const previous=tail;tail=new Promise(r=>release=r);await previous;snapshot={stock:state.stock,carts:new Map(state.carts),orders:new Map(state.orders),inserts:state.inserts};},async commit(){release();},async rollback(){Object.assign(state,snapshot);release();},request(){const p={};return {input(k,t,v){p[k]=v;return this;},async query(text){
 if(text.includes('FROM dbo.Carts'))return {recordset:[{id:p.userId}]};
 if(text.includes('FROM dbo.Orders'))return {recordset:state.orders.has(p.userId+':'+p.requestKey)?[state.orders.get(p.userId+':'+p.requestKey)]:[]};
 if(text.startsWith('SELECT')&&text.includes('FROM dbo.CartItems'))return {recordset:state.carts.get(p.cartId)?[{id:p.cartId,productId:1,quantity:1}]:[]};
 if(text.includes('FROM dbo.Products'))return {recordset:[{name:'P',sku:'S',unitPrice:'1.00',stock:state.stock,active:true,categoryActive:true}]};
 if(text.includes('INSERT INTO dbo.Orders')){const order={id:++state.inserts,orderCode:p.code,total:p.total};state.orders.set(p.userId+':'+p.requestKey,order);return {recordset:[order]};}
 if(text.includes('UPDATE dbo.Products')){if(state.stock<p.quantity)return {rowsAffected:[0]};state.stock-=p.quantity;}
 if(text.startsWith('DELETE'))state.carts.set(p.cartId,false);
 return {recordset:[],rowsAffected:[1]};}};}};};
 return {state,repo:createOrdersRepository(async()=>({}),{transactionFactory:factory})};
}
test('overlapping requests: same key replays, different keys consume cart once, last stock has one winner (lock model)',async()=>{
 for(const [user,key]of [[7,valid.requestKey],[7,'22345678-1234-1234-1234-123456789012'],[8,valid.requestKey]]){
 const f=concurrentStore();const results=await Promise.allSettled([f.repo.place(7,validate(valid)),f.repo.place(user,validate({...valid,requestKey:key}))]);
 assert.equal(f.state.inserts,1);assert.equal(f.state.stock,0);
 if(user===7&&key===valid.requestKey){assert(results.every(r=>r.status==='fulfilled'));assert.equal(results[1].value.replayed,true);}
 else {assert.equal(results[1].status,'rejected');assert.equal(results[1].reason.code,user===7?'EMPTY_CART':'INSUFFICIENT_STOCK');}
 }
});
