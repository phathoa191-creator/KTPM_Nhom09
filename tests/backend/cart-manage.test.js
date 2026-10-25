const {test}=require('node:test');const assert=require('node:assert/strict');
const {createApp}=require('../../backend/src/server');const {createSessionStore}=require('../../backend/src/auth/login');
const {createCartRepository,CartError}=require('../../backend/src/cart/cart');
test('UC09 routes enforce owner, auth, origin, exact quantity and product ID',async()=>{
 const sessions=createSessionStore(),cookie='cellphones.sid='+sessions.create(7),calls=[];
 let fail=false;
 const app=createApp({sessions,loginRepository:{findById:async id=>({id,active:true,role:'CUSTOMER'})},cartRepository:{
  update:async(...args)=>{calls.push(args);if(fail)throw Error('private SQL');return {productId:args[1],quantity:args[2]};},
  remove:async(...args)=>{calls.push(args);if(fail)throw new CartError(404,'CART_ITEM_NOT_FOUND','Missing');return {productId:args[1]};}
 }});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const call=async(method,id='12',body,headers={Cookie:cookie})=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/cart/items/${id}`,{method,headers:{'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});assert.equal(r.headers.get('cache-control'),'no-store');return {status:r.status,body:await r.json()};};
 try{
  for(const method of ['PATCH','DELETE']){assert.equal((await call(method,'12',{quantity:2},{})).status,401);assert.equal((await call(method,'12',{quantity:2},{Cookie:cookie,Origin:'https://evil.test'})).status,403);}
  for(const quantity of [0,-1,1.5,'2',100,null])assert.equal((await call('PATCH','12',{quantity})).status,400);
  for(const id of ['0','-1','1.2','12abc','2147483648','01'])for(const method of ['PATCH','DELETE'])assert.equal((await call(method,id,{quantity:2})).status,400);
  for(const body of [{},null,[],{quantity:2,userId:99}])assert.equal((await call('PATCH','12',body)).status,400);
  assert.equal(calls.length,0);
  for(const quantity of [1,99])assert.equal((await call('PATCH','12',{quantity})).status,200);
  assert.deepEqual(calls,[[7,12,1],[7,12,99]]);assert.equal((await call('DELETE')).status,200);assert.deepEqual(calls.at(-1),[7,12]);
  fail=true;const error=await call('PATCH','12',{quantity:2});assert.equal(error.status,503);assert(!JSON.stringify(error.body).includes('private'));assert.equal((await call('DELETE')).status,404);
 }finally{await new Promise(r=>server.close(r));}
});
function fixture({cart=true,item=true,stock=100,active=true,categoryActive=true,fail='',affected=1}={}){
 const calls=[],state={commit:0,rollback:0};
 const tx={async begin(level){state.level=level;},async commit(){if(fail==='commit')throw Error('fail');state.commit++;},async rollback(){state.rollback++;},request(){const params={};return {input(k,t,v){params[k]=v;return this;},async query(text){calls.push({text,params});if(fail&&text.includes(fail))throw Error('fail');
 if(text.startsWith('SELECT')&&text.includes('FROM dbo.Carts'))return {recordset:cart?[{id:50}]:[]};
 if(text.startsWith('SELECT')&&text.includes('FROM dbo.Products'))return {recordset:[{stock,active,categoryActive}]};
 if(text.startsWith('SELECT')&&text.includes('FROM dbo.CartItems'))return {recordset:item?[{id:60}]:[]};
 return {rowsAffected:[affected],recordset:[]};}};}};
 return {calls,state,repo:createCartRepository(async()=>({}),{transactionFactory:()=>tx})};
}
test('UC09 SQL scope, replacement, lock order, timestamps and deletion of unavailable products',async()=>{
 for(const quantity of [1,99]){const f=fixture();assert.equal((await f.repo.update(7,12,quantity)).quantity,quantity);assert.equal(f.state.level,require('mssql').ISOLATION_LEVEL.SERIALIZABLE);assert.match(f.calls[0].text,/UPDLOCK,HOLDLOCK/);assert.equal(f.calls[0].params.userId,7);
 const write=f.calls.find(c=>c.text.startsWith('UPDATE dbo.CartItems'));assert.match(write.text,/Quantity=@quantity WHERE CartId=@cartId AND ProductId=@productId/);assert.deepEqual(write.params,{cartId:50,productId:12,quantity});assert.equal(f.state.commit,1);assert(!f.calls.some(c=>/INSERT|Orders|UPDATE dbo.Products|DELETE FROM dbo.Carts/.test(c.text)));}
 const f=fixture({stock:0,active:false});await f.repo.remove(7,12);assert.equal(f.state.commit,1);assert(!f.calls.some(c=>c.text.includes('dbo.Products')));assert.match(f.calls[2].text,/DELETE FROM dbo.CartItems WHERE CartId=@cartId AND ProductId=@productId/);
});
test('UC09 missing scoped item, stock/category conflicts and any write failure roll back',async()=>{
 for(const options of [{cart:false},{item:false},{stock:1},{active:false},{categoryActive:false},{affected:0},...['UPDATE dbo.CartItems','UPDATE dbo.Carts','commit'].map(fail=>({fail}))]){
  const f=fixture(options);await assert.rejects(f.repo.update(7,12,2));assert.equal(f.state.commit,0);assert.equal(f.state.rollback,1);
 }
 for(const options of [{item:false},{cart:false},{fail:'DELETE FROM dbo.CartItems'},{fail:'UPDATE dbo.Carts'}]){const f=fixture(options);await assert.rejects(f.repo.remove(7,12));assert.equal(f.state.rollback,1);}
});

// In-memory SQL model serializes at the first cart query. It exercises the actual
// UC-06/07/09 repository methods; it does not prove SQL Server lock behavior.
function lockModel(){
 const state={quantity:3,stock:100,orders:[],events:[]};let tail=Promise.resolve();
 const factory=()=>{let release,snapshot;return {
  async begin(){},async commit(){state.events.push('commit');release();},async rollback(){state.quantity=snapshot.quantity;state.stock=snapshot.stock;state.orders=snapshot.orders;release();},
  request(){const p={};return {input(k,t,v){p[k]=v;return this;},async query(text){text=text.trimStart();
   if(text.startsWith('SELECT Id AS id FROM dbo.Carts')){const previous=tail;tail=new Promise(r=>release=r);await previous;snapshot={quantity:state.quantity,stock:state.stock,orders:[...state.orders]};state.events.push('lock');return {recordset:[{id:50}]};}
   if(text.includes('FROM dbo.Orders'))return {recordset:[]};
   if(text.startsWith('SELECT')&&text.includes('FROM dbo.Products'))return {recordset:[{stock:state.stock,active:true,categoryActive:true,name:'Phone',sku:'SKU',unitPrice:'1.00'}]};
   if(text.startsWith('SELECT')&&text.includes('FROM dbo.CartItems'))return {recordset:state.quantity===null?[]:[{id:60,productId:12,quantity:state.quantity}]};
   if(text.includes('INSERT INTO dbo.Orders')){state.orders.push({quantity:state.quantity});return {recordset:[{id:1,orderCode:'CPS-TEST'}]};}
   if(text.includes('INSERT INTO dbo.CartItems')||text.startsWith('UPDATE dbo.CartItems'))state.quantity=p.quantity;
   if(text.startsWith('DELETE FROM dbo.CartItems')){const count=state.quantity===null?0:1;state.quantity=null;return {rowsAffected:[count]};}
   if(text.startsWith('UPDATE dbo.Products'))state.stock-=p.quantity;
   return {recordset:[],rowsAffected:[1]};
  }};}
 };};
 const cart=createCartRepository(async()=>({}),{transactionFactory:factory});
 const orders=require('../../backend/src/orders/orders').createOrdersRepository(async()=>({}),{transactionFactory:factory});
 return {state,cart,orders};
}
test('overlapping UC09 PATCH/DELETE with UC07 and UC06 serialize without changing order snapshots (SQL lock model)',async()=>{
 let m=lockModel();await Promise.all([m.cart.update(7,12,2),m.cart.add(7,12,1)]);assert.equal(m.state.quantity,3);assert.equal(m.state.stock,100);
 m=lockModel();await Promise.all([m.cart.add(7,12,1),m.cart.update(7,12,2)]);assert.equal(m.state.quantity,2);
 m=lockModel();await Promise.all([m.cart.remove(7,12),m.cart.add(7,12,1)]);assert.equal(m.state.quantity,1);assert.equal(m.state.stock,100);
 const data={requestKey:'12345678-1234-1234-1234-123456789012',recipientName:'A',phone:'0901234567',shippingAddress:'B'};
 m=lockModel();await Promise.all([m.cart.update(7,12,2),m.orders.place(7,data)]);assert.equal(m.state.quantity,null);assert.equal(m.state.stock,98);assert.deepEqual(m.state.orders,[{quantity:2}]);
 m=lockModel();const after=await Promise.allSettled([m.orders.place(7,data),m.cart.update(7,12,2)]);assert.equal(after[1].reason.code,'CART_ITEM_NOT_FOUND');assert.equal(m.state.stock,97);assert.deepEqual(m.state.orders,[{quantity:3}]);
 m=lockModel();const removed=await Promise.allSettled([m.cart.remove(7,12),m.orders.place(7,data)]);assert.equal(removed[1].reason.code,'EMPTY_CART');assert.equal(m.state.stock,100);assert.equal(m.state.orders.length,0);
 m=lockModel();const ordered=await Promise.allSettled([m.orders.place(7,data),m.cart.remove(7,12)]);assert.equal(ordered[1].reason.code,'CART_ITEM_NOT_FOUND');assert.deepEqual(m.state.orders,[{quantity:3}]);assert.equal(m.state.stock,97);
});
