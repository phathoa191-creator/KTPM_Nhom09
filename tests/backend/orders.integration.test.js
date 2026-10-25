const {test}=require('node:test');const assert=require('node:assert/strict');const sql=require('mssql');const {randomUUID}=require('node:crypto');
const {buildDatabaseConfig}=require('../../backend/src/config/database');const {createOrdersRepository}=require('../../backend/src/orders/orders');const {createCartRepository}=require('../../backend/src/cart/cart');
test('UC06 SQL opt-in: existing synthetic cart, snapshot, replay, rollback after insert, outer restoration',{
 skip:process.env.UC06_SQL_INTEGRATION!=='1'||process.env.UC06_SQL_WRITE_APPROVED!=='YES'
},async()=>{
 process.loadEnvFile(require('node:path').join(__dirname,'../../.env'));
 const userId=Number(process.env.UC06_TEST_USER_ID);assert(Number.isInteger(userId)&&userId>0,'Explicit synthetic test user required');
 const pool=await new sql.ConnectionPool(buildDatabaseConfig()).connect();let tx,began=false,baseline,stocks;
 const normal=createCartRepository(async()=>pool);
 try{
  const user=await pool.request().input('id',sql.Int,userId).query("SELECT Id FROM dbo.Users WHERE Id=@id AND Email LIKE 'selenium-uc01-%@example.test' AND IsActive=1");assert.equal(user.recordset.length,1,'Only existing synthetic user; never seed');
  baseline=await normal.read(userId);assert(baseline.items.length&&!baseline.hasUnavailableItems,'Prepare valid synthetic cart separately after approval');
  stocks=await pool.request().input('id',sql.Int,userId).query('SELECT p.Id,p.Stock FROM dbo.Products p JOIN dbo.CartItems i ON i.ProductId=p.Id JOIN dbo.Carts c ON c.Id=i.CartId WHERE c.UserId=@id ORDER BY p.Id');
  tx=new sql.Transaction(pool);await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);began=true;
  const adapter=(fail=false)=>({begin:async()=>{await tx.request().query('SAVE TRANSACTION uc06_operation');},commit:async()=>{},rollback:async()=>{await tx.request().query('ROLLBACK TRANSACTION uc06_operation');},request:()=>{
   const req=tx.request();if(fail){const query=req.query.bind(req);req.query=async text=>{if(text.includes('UPDATE dbo.Products'))throw Error('injected after order/items insert');return query(text);};}return req;
  }});
  const data={requestKey:randomUUID(),recipientName:'UC06 Test',phone:'0901234567',shippingAddress:'Synthetic test address'};
  const isolated=createCartRepository(async()=>({request:()=>tx.request()}));
  await assert.rejects(createOrdersRepository(async()=>pool,{transactionFactory:()=>adapter(true)}).place(userId,data));
  assert.deepEqual(await isolated.read(userId),baseline);
  const repo=createOrdersRepository(async()=>pool,{transactionFactory:()=>adapter()});
  const first=await repo.place(userId,data);assert.equal(first.total,baseline.total);assert.equal(first.replayed,false);assert.equal((await isolated.read(userId)).items.length,0);
  const replay=await repo.place(userId,data);assert.equal(replay.id,first.id);assert.equal(replay.replayed,true);
  const items=await tx.request().input('id',sql.Int,first.id).query('SELECT ProductId,ProductName,ProductSku,CONVERT(VARCHAR(50),UnitPrice) price,Quantity,CONVERT(VARCHAR(50),LineTotal) lineTotal FROM dbo.OrderItems WHERE OrderId=@id ORDER BY ProductId');
  assert.deepEqual(items.recordset,baseline.items.slice().sort((a,b)=>a.productId-b.productId).map(i=>({ProductId:i.productId,ProductName:i.name,ProductSku:i.sku,price:i.unitPrice,Quantity:i.quantity,lineTotal:i.lineTotal})));
  // Verify each product directly; no commits are issued by the repository adapter.
  for(const item of baseline.items){const r=await tx.request().input('id',sql.Int,item.productId).query('SELECT Stock FROM dbo.Products WHERE Id=@id');assert.equal(r.recordset[0].Stock,stocks.recordset.find(p=>p.Id===item.productId).Stock-item.quantity);}
 }finally{
  try{if(began)await tx.rollback();if(baseline)assert.deepEqual(await normal.read(userId),baseline);if(stocks)for(const row of stocks.recordset){const r=await pool.request().input('id',sql.Int,row.Id).query('SELECT Stock FROM dbo.Products WHERE Id=@id');assert.equal(r.recordset[0].Stock,row.Stock);}}finally{await pool.close();}
 }
});
