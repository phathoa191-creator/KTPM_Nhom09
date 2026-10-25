const {test}=require('node:test');const assert=require('node:assert/strict');
const {validate,createAdminProductsRepository,AdminError}=require('../../backend/src/admin/products');
const {createApp}=require('../../backend/src/server');const {createSessionStore}=require('../../backend/src/auth/login');
const version='0000000000000001',body={sku:'TEST-1',slug:'test-1',name:'Điện thoại',categoryId:1,price:'999999999.99',stock:1000000};
test('admin validation: exact money, boundaries, ASCII identifiers, nullable alt and protected fields',()=>{
 assert.equal(validate(body).price,'999999999.99');assert.equal(validate({...body,price:'0'}).price,'0.00');assert.equal(validate({...body,price:'0.1'}).price,'0.10');
 assert.equal(validate({...body,name:'😀'.repeat(100)}).name.length,200);
 for(const patch of [{price:'1000000000.00'},{price:'0.001'},{price:-1},{stock:1.2},{stock:-1},{stock:1000001},{name:' '},{name:'a'.repeat(201)},{sku:'\t\n\u00a0'},{sku:'a b'},{slug:'é'},{categoryId:0},{imageUrl:'javascript:alert(1)'},{imageUrl:'https://u:p@host.test/a'},{imageAlt:'x'},{role:'ADMIN'},{isActive:true}])assert.throws(()=>validate({...body,...patch}));
 for(const key of Object.keys(body)){const missing={...body};delete missing[key];assert.throws(()=>validate(missing));}
 assert.throws(()=>validate({version},'edit'));assert.throws(()=>validate({stock:1},'edit'));assert.throws(()=>validate({version,isActive:'false'},'status'));
 assert.deepEqual(validate({version,isActive:false},'status'),{version,isActive:false});assert.equal(validate({...body,imageUrl:'https://example.test/a',imageAlt:null}).imageAlt,null);
});
function fixture({oldVersion=version,category=true,image=true,fail='',number,missing=false,affected=1}={}){
 const calls=[],state={commits:0,rollbacks:0};const product={id:1,...body,version:'0000000000000002',isActive:true};
 const tx={async begin(level){state.level=level;},async commit(){if(fail==='commit')throw Error('private');state.commits++;},async rollback(){state.rollbacks++;},request(){const params={};return{input(k,t,v){params[k]=v;return this;},async query(text){calls.push({text,params});if(fail&&text.includes(fail)){const e=Error('private');e.number=number;throw e;}
 if(text.includes('FROM dbo.Products WITH'))return{recordset:missing?[]:[{categoryId:1,isActive:true,version:oldVersion}]};
 if(text.includes('FROM dbo.Categories WITH'))return{recordset:category?[{Id:1}]:[]};
 if(text.startsWith('INSERT INTO dbo.Products'))return{recordset:[{id:1}]};
 if(text.startsWith('SELECT Id FROM dbo.ProductImages'))return{recordset:image?[{Id:1}]:[]};
 if(text.startsWith('SELECT p.Id'))return{recordset:[product]};
 return{recordset:[],rowsAffected:[affected]};}};}};
 return{calls,state,product,repo:createAdminProductsRepository(async()=>({}),{transactionFactory:()=>tx})};
}
test('admin create/update/status use atomic transaction, parent version, only image SortOrder=0, no hard delete',async()=>{
 for(const image of [true,false]){
  const f=fixture({image});await f.repo.create(validate({...body,imageUrl:'https://example.test/1',imageAlt:'Ảnh'}));assert.equal(f.state.commits,1);assert.equal(f.state.rollbacks,0);assert.equal(f.state.level,require('mssql').ISOLATION_LEVEL.SERIALIZABLE);
  const insert=f.calls.find(c=>c.text.startsWith('INSERT INTO dbo.Products'));assert.equal(insert.params.price,'999999999.99');assert(!insert.text.includes('imageUrl'));
  assert(f.calls.some(c=>c.text.startsWith(image?'UPDATE dbo.ProductImages':'INSERT INTO dbo.ProductImages')));assert(!f.calls.some(c=>/DELETE/.test(c.text)));
 }
 const f=fixture();await f.repo.update(1,validate({version,price:'0.10',stock:2,imageUrl:'https://example.test/2'},'edit'));
 const update=f.calls.find(c=>c.text.startsWith('UPDATE dbo.Products'));assert.match(update.text,/Version=CONVERT\(BINARY\(8\),@version,2\)/);assert.equal(update.params.stock,2);assert.equal(update.params.price,'0.10');assert.match(f.calls[0].text,/UPDLOCK,HOLDLOCK/);
 assert.match(f.calls[0].text,/CONVERT\(VARCHAR\(16\),CONVERT\(BINARY\(8\),Version\),2\)/);
 const off=fixture({category:false});await off.repo.status(1,{version,isActive:false});assert.equal(off.state.commits,1);
 const on=fixture({category:false});await assert.rejects(on.repo.status(1,{version,isActive:true}),e=>e.code==='CATEGORY_UNAVAILABLE');assert.equal(on.state.rollbacks,1);
});
test('admin stale version (including checkout stock update), duplicate and SQL failures roll back',async()=>{
 for(const options of [{oldVersion:'0000000000000009'},{missing:true},{category:false},{affected:0},...['UPDATE dbo.Products','UPDATE dbo.ProductImages','commit'].map(fail=>({fail}))]){
  const f=fixture(options);await assert.rejects(f.repo.update(1,{version,stock:2,imageUrl:'https://example.test/x'}));assert.equal(f.state.commits,0);assert.equal(f.state.rollbacks,1);
 }
 for(const number of [2601,2627]){const f=fixture({fail:'INSERT INTO dbo.Products',number});await assert.rejects(f.repo.create(body),e=>e.code==='DUPLICATE_PRODUCT');assert.equal(f.state.rollbacks,1);}
 const imageFailure=fixture({fail:'UPDATE dbo.ProductImages'});await assert.rejects(imageFailure.repo.create({...body,imageUrl:'https://example.test/x'}));assert.equal(imageFailure.state.rollbacks,1);
});
test('admin endpoints enforce role on all routes, origin, list filters, CRUD statuses and sanitized errors',async()=>{
 const sessions=createSessionStore();const cookies={admin:'cellphones.sid='+sessions.create(7),customer:'cellphones.sid='+sessions.create(8)};let fail=false;const calls=[];
 const repo=Object.fromEntries(['list','detail','categories','create','update','status'].map(method=>[method,async(...args)=>{calls.push({method,args});if(fail)throw Error('private SQL');return method==='list'?{total:1,products:[body]}:method==='categories'?[]:body;}]));
 const app=createApp({sessions,loginRepository:{findById:async id=>({id,active:true,role:id===7?'ADMIN':'CUSTOMER'})},adminProductsRepository:repo});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const request=async(method,path,body,who='admin',extra={})=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/admin${path}`,{method,headers:{'Content-Type':'application/json',...(cookies[who]?{Cookie:cookies[who]}:{}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});assert.equal(r.headers.get('cache-control'),'no-store');return{status:r.status,body:await r.json()};};
 const routes=[['GET','/products'],['GET','/categories'],['GET','/products/1'],['POST','/products',body],['PATCH','/products/1',{version,stock:2}],['PATCH','/products/1/status',{version,isActive:false}]];
 try{
  for(const route of routes){assert.equal((await request(...route.slice(0,2),route[2],'none')).status,401);assert.equal((await request(...route.slice(0,2),route[2],'customer')).status,403);}assert.equal(calls.length,0);
  for(const route of routes){assert.equal((await request(...route)).status,route[0]==='POST'?201:200);}
  for(const route of routes.filter(r=>r[0]!=='GET'))assert.equal((await request(route[0],route[1],route[2],'admin',{Origin:'https://evil.test'})).status,403);
  assert.equal((await request('GET','/products?q=test&page=2&limit=12&isActive=false')).status,200);assert.deepEqual(calls.at(-1).args[0],{q:'test',page:2,limit:12,isActive:false});
  assert.equal((await request('GET','/products/0')).status,400);assert.equal((await request('GET','/products?limit=99')).status,400);assert.equal((await request('POST','/products',{})).status,400);
  fail=true;const r=await request('POST','/products',body);assert.equal(r.status,503);assert(!JSON.stringify(r.body).includes('private'));
 }finally{await new Promise(r=>server.close(r));}
});
