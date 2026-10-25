const express = require('express');
const sql = require('mssql');
class AdminError extends Error {
  constructor(status, code, message, errors) { super(message); Object.assign(this, { status, code, errors }); }
}
const invalid = errors => new AdminError(400, 'INVALID_PRODUCT', 'Thông tin sản phẩm không hợp lệ.', errors);
const idValid = value => /^[1-9][0-9]{0,9}$/.test(String(value)) && Number(value) <= 2147483647;
function validate(body, mode = 'create') {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid({ form: 'Dữ liệu phải là đối tượng JSON.' });
  const allowed = mode === 'status' ? ['version', 'isActive'] : ['sku','slug','name','categoryId','price','stock','description','imageUrl','imageAlt', ...(mode === 'create' ? [] : ['version'])];
  const errors = {}, values = {};
  if (Object.keys(body).some(key => !allowed.includes(key))) errors.form = 'Có trường không được phép cập nhật.';
  if (mode !== 'create' && (typeof body.version !== 'string' || !/^[0-9a-f]{16}$/i.test(body.version))) errors.version = 'Phiên bản sản phẩm không hợp lệ. Hãy tải lại dữ liệu.';
  if (mode !== 'create') values.version = body.version;
  if (mode === 'status') {
    if (typeof body.isActive !== 'boolean') errors.isActive = 'Trạng thái phải là boolean.';
    values.isActive = body.isActive;
  } else {
    if (mode === 'create') for (const key of ['sku','slug','name','categoryId','price','stock']) if (!Object.hasOwn(body,key)) errors[key] = 'Trường bắt buộc.';
    if (mode !== 'create' && !Object.keys(body).some(key => key !== 'version')) errors.form = 'Chưa có trường cần sửa.';
    for (const key of ['sku','slug','name']) if (Object.hasOwn(body,key)) {
      const value = body[key]; const max = { sku:50, slug:200, name:200 }[key];
      // Additional business rule: ASCII URL-safe identifiers, beyond SQL's nonblank CHECK.
      if (typeof value !== 'string' || !value.trim() || value.trim().length > max || (key !== 'name' && !/^[A-Za-z0-9_-]+$/.test(value.trim()))) errors[key] = key === 'name' ? 'Tên từ 1 đến 200 đơn vị UTF-16.' : `Chỉ dùng chữ ASCII, số, dấu - hoặc _, tối đa ${max} ký tự.`;
      else values[key] = value.trim();
    }
    if (Object.hasOwn(body,'categoryId')) {
      if (!Number.isInteger(body.categoryId) || !idValid(body.categoryId)) errors.categoryId = 'Danh mục không hợp lệ.';
      else values.categoryId = body.categoryId;
    }
    if (Object.hasOwn(body,'price')) {
      if (typeof body.price !== 'string' || !/^\d{1,9}(?:\.\d{1,2})?$/.test(body.price)) errors.price = 'Giá là chuỗi thập phân từ 0 đến 999999999.99, tối đa hai số lẻ.';
      else { const [whole, fraction = ''] = body.price.split('.'); values.price = `${BigInt(whole)}.${fraction.padEnd(2,'0')}`; }
    }
    if (Object.hasOwn(body,'stock')) {
      if (!Number.isInteger(body.stock) || body.stock < 0 || body.stock > 1000000) errors.stock = 'Tồn kho là số nguyên từ 0 đến 1000000.';
      else values.stock = body.stock;
    }
    for (const [key,max] of [['description',20000],['imageAlt',200]]) if (Object.hasOwn(body,key)) {
      if (key === 'imageAlt' && body[key] === null) values[key] = null;
      else if (typeof body[key] !== 'string' || body[key].length > max) errors[key] = `Tối đa ${max} đơn vị UTF-16.`;
      else values[key] = body[key];
    }
    if (Object.hasOwn(body,'imageUrl')) {
      if (mode === 'create' && body.imageUrl === '') values.imageUrl = '';
      else try {
        if (typeof body.imageUrl !== 'string' || body.imageUrl.length > 2048 || body.imageUrl !== body.imageUrl.trim()) throw Error();
        const url = new URL(body.imageUrl);
        if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw Error();
        values.imageUrl = body.imageUrl;
      } catch { errors.imageUrl = 'URL ảnh phải là HTTP(S), tối đa 2048 đơn vị UTF-16; không chứa thông tin đăng nhập.'; }
    }
    if (Object.hasOwn(body,'imageAlt') && !Object.hasOwn(body,'imageUrl')) errors.imageUrl = 'Gửi URL ảnh khi cập nhật mô tả ảnh.';
  }
  if (Object.keys(errors).length) throw invalid(errors);
  return values;
}
const selectProduct = `p.Id AS id,p.CategoryId AS categoryId,p.Sku AS sku,p.Slug AS slug,p.Name AS name,
 p.Description AS description,CONVERT(VARCHAR(50),p.Price) AS price,p.Stock AS stock,p.IsActive AS isActive,
 CONVERT(VARCHAR(16),CONVERT(BINARY(8),p.Version),2) AS version,c.Name AS category,c.IsActive AS categoryActive,
 image.ImageUrl AS imageUrl,image.AltText AS imageAlt`;
const productFrom = `FROM dbo.Products p JOIN dbo.Categories c ON c.Id=p.CategoryId
 OUTER APPLY (SELECT ImageUrl,AltText FROM dbo.ProductImages WHERE ProductId=p.Id AND SortOrder=0) image`;
function createAdminProductsRepository(poolProvider, { transactionFactory = pool => new sql.Transaction(pool) } = {}) {
  const bind = (request, values) => { for (const [key,type,value] of values) request.input(key,type,value); return request; };
  async function write(id, data, statusOnly = false) {
    const tx = transactionFactory(await poolProvider()); let began = false;
    const query = (text, params = []) => bind(tx.request(), params).query(text);
    try {
      await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE); began = true;
      let old;
      if (id !== undefined) {
        old = (await query(`SELECT CategoryId AS categoryId,IsActive AS isActive,CONVERT(VARCHAR(16),CONVERT(BINARY(8),Version),2) AS version
          FROM dbo.Products WITH (UPDLOCK,HOLDLOCK) WHERE Id=@id`, [['id',sql.Int,id]])).recordset[0];
        if (!old) throw new AdminError(404,'PRODUCT_NOT_FOUND','Không tìm thấy sản phẩm.');
        if (old.version.toLowerCase() !== data.version.toLowerCase()) throw new AdminError(409,'PRODUCT_CHANGED','Sản phẩm đã thay đổi. Hãy tải lại trước khi sửa.');
      }
      const categoryId = data.categoryId ?? old?.categoryId;
      if (!statusOnly || data.isActive) {
        const category = (await query('SELECT Id FROM dbo.Categories WITH (HOLDLOCK) WHERE Id=@categoryId AND IsActive=1', [['categoryId',sql.Int,categoryId]])).recordset[0];
        if (!category) throw new AdminError(409,'CATEGORY_UNAVAILABLE','Danh mục không tồn tại hoặc đã ngừng hoạt động.');
      }
      const types = { sku:sql.VarChar(50),slug:sql.VarChar(200),name:sql.NVarChar(200),categoryId:sql.Int,price:sql.VarChar(30),stock:sql.Int,description:sql.NVarChar(sql.MAX),isActive:sql.Bit };
      if (id === undefined) {
        const result = await query(`INSERT INTO dbo.Products (CategoryId,Sku,Slug,Name,Description,Price,Stock,IsActive,CreatedAt,UpdatedAt)
          OUTPUT INSERTED.Id AS id VALUES (@categoryId,@sku,@slug,@name,@description,CONVERT(DECIMAL(18,2),@price),@stock,1,SYSUTCDATETIME(),SYSUTCDATETIME())`,
        Object.entries({ ...data, description:data.description ?? '' }).filter(([key]) => key in types).map(([key,value])=>[key,types[key],value]));
        id = result.recordset[0].id;
      } else {
        const keys = Object.keys(data).filter(key=>key in types);
        const sets = keys.map(key=>`${{ sku:'Sku',slug:'Slug',name:'Name',categoryId:'CategoryId',price:'Price',stock:'Stock',description:'Description',isActive:'IsActive' }[key]}=${key==='price'?'CONVERT(DECIMAL(18,2),@price)':'@'+key}`);
        const result = await query(`UPDATE dbo.Products SET ${[...sets,'UpdatedAt=SYSUTCDATETIME()'].join(',')}
          WHERE Id=@id AND Version=CONVERT(BINARY(8),@version,2)`,
        [['id',sql.Int,id],['version',sql.VarChar(16),data.version],...keys.map(key=>[key,types[key],data[key]])]);
        if (result.rowsAffected[0] !== 1) throw new AdminError(409,'PRODUCT_CHANGED','Sản phẩm đã thay đổi. Hãy tải lại.');
      }
      if (data.imageUrl) {
        const params = [['id',sql.Int,id],['imageUrl',sql.NVarChar(2048),data.imageUrl],['imageAlt',sql.NVarChar(200),data.imageAlt ?? null]];
        const image = (await query('SELECT Id FROM dbo.ProductImages WITH (UPDLOCK,HOLDLOCK) WHERE ProductId=@id AND SortOrder=0',[['id',sql.Int,id]])).recordset[0];
        const result = await query(image ? 'UPDATE dbo.ProductImages SET ImageUrl=@imageUrl,AltText=@imageAlt WHERE ProductId=@id AND SortOrder=0' :
          'INSERT INTO dbo.ProductImages (ProductId,ImageUrl,AltText,SortOrder) VALUES (@id,@imageUrl,@imageAlt,0)',params);
        if (result.rowsAffected[0] !== 1) throw Error('Image write failed');
      }
      const product = (await query(`SELECT ${selectProduct} ${productFrom} WHERE p.Id=@id`,[['id',sql.Int,id]])).recordset[0];
      await tx.commit(); began = false; return product;
    } catch (error) {
      if (began) await tx.rollback().catch(()=>{});
      if ([2601,2627].includes(error.number)) throw new AdminError(409,'DUPLICATE_PRODUCT','SKU hoặc Slug đã tồn tại.');
      throw error;
    }
  }
  return {
    create: data => write(undefined,data), update: (id,data)=>write(id,data), status: (id,data)=>write(id,data,true),
    async categories() { return (await (await poolProvider()).request().query('SELECT Id AS id,Name AS name,IsActive AS isActive FROM dbo.Categories ORDER BY Id')).recordset; },
    async detail(id) { return (await (await poolProvider()).request().input('id',sql.Int,id).query(`SELECT ${selectProduct} ${productFrom} WHERE p.Id=@id`)).recordset[0] || null; },
    async list({q,page,limit,isActive}) {
      const request = (await poolProvider()).request();
      bind(request,[['pattern',sql.NVarChar(402),'%'+q.replace(/[~%_\[]/g,c=>'~'+c)+'%'],['offset',sql.Int,(page-1)*limit],['limit',sql.Int,limit],['active',sql.Bit,isActive]]);
      const where = `WHERE (@active IS NULL OR p.IsActive=@active) AND (p.Name LIKE @pattern ESCAPE N'~' OR p.Sku LIKE @pattern ESCAPE N'~')`;
      const result = await request.query(`SELECT COUNT(*) AS total FROM dbo.Products p ${where}; SELECT ${selectProduct} ${productFrom} ${where} ORDER BY p.Id OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;`);
      return {total:result.recordsets[0][0].total,products:result.recordsets[1],page,limit};
    }
  };
}
function createAdminProductsRouter({auth,repository}) {
  const router = express.Router(); router.use(auth.requireAuth,auth.requireRole('ADMIN'));
  const run = handler => async(req,res)=>{ try { await handler(req,res); } catch(error) {
    if(error instanceof AdminError) return res.status(error.status).json({code:error.code,message:error.message,...(error.errors?{errors:error.errors}:{})});
    res.status(503).json({code:'ADMIN_PRODUCTS_UNAVAILABLE',message:'Không thể xử lý sản phẩm lúc này. Với thao tác ghi, hãy tải lại danh sách để kiểm tra kết quả trước khi thử lại.'});
  } };
  router.get('/categories',run(async(_req,res)=>res.json({categories:await repository.categories()})));
  router.get('/products',run(async(req,res)=>{
    const {q='',page='1',limit='12',isActive='all'}=req.query;
    if(typeof q!=='string'||q.trim().length>200||!idValid(page)||Number(page)>1000000||!idValid(limit)||Number(limit)>48||!['all','true','false'].includes(isActive)) throw invalid({query:'Bộ lọc hoặc phân trang không hợp lệ.'});
    res.json(await repository.list({q:q.trim(),page:Number(page),limit:Number(limit),isActive:isActive==='all'?null:isActive==='true'}));
  }));
  router.param('id',(req,res,next,id)=>idValid(id)?next():res.status(400).json({code:'INVALID_PRODUCT_ID',message:'Mã sản phẩm không hợp lệ.'}));
  router.get('/products/:id',run(async(req,res)=>{const product=await repository.detail(Number(req.params.id));if(!product)throw new AdminError(404,'PRODUCT_NOT_FOUND','Không tìm thấy sản phẩm.');res.json({product});}));
  router.post('/products',auth.sameOrigin,express.json({limit:'128kb'}),run(async(req,res)=>res.status(201).json({product:await repository.create(validate(req.body))})));
  router.patch('/products/:id',auth.sameOrigin,express.json({limit:'128kb'}),run(async(req,res)=>res.json({product:await repository.update(Number(req.params.id),validate(req.body,'edit'))})));
  router.patch('/products/:id/status',auth.sameOrigin,express.json({limit:'4kb'}),run(async(req,res)=>res.json({product:await repository.status(Number(req.params.id),validate(req.body,'status'))})));
  return router;
}
module.exports={createAdminProductsRepository,createAdminProductsRouter,validate,AdminError};
