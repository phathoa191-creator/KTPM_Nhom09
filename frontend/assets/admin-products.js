(() => {
  const find = id=>document.querySelector(`[data-testid="${id}"]`);
  const form=find('admin-product-form'); if(!form)return;
  const panel=find('admin-panel'),rows=find('admin-product-rows'),feedback=find('page-feedback'),formFeedback=find('admin-product-form-feedback');
  const fields=Object.fromEntries(['sku','slug','name','category','price','stock','description','image-url','image-alt'].map(key=>[key,find('admin-product-'+key)]));
  let page=1,total=0,selected=null,generation=0,busy=false,uncertain=false;
  const buttons=()=>[find('admin-product-create'),find('admin-product-save')];
  const node=(tag,text,testid)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(testid)el.dataset.testid=testid;return el;};
  const format=value=>{const [whole,fraction='00']=String(value).split('.');return whole.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+(fraction==='00'?'':','+fraction)+' ₫';};
  function lock(){for(const button of buttons())button.disabled=busy||uncertain|| (button===find('admin-product-save')&&!selected)|| (button===find('admin-product-create')&&Boolean(selected));}
  function reset(){selected=null;form.reset();formFeedback.textContent='';lock();}
  function clear(){panel.hidden=true;rows.replaceChildren();reset();fields.category.replaceChildren();}
  async function request(url,options={}){
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
    const data=await response.json();return {response,data};
  }
  function draw(products){
    rows.replaceChildren();
    for(const product of products){
      const tr=node('tr',undefined,`admin-product-row-${product.id}`);
      for(const text of [product.sku,product.name,product.category,format(product.price),String(product.stock),product.isActive?'Đang kinh doanh':'Ngừng kinh doanh'])tr.append(node('td',text));
      const actions=node('td'),edit=node('button','Sửa',`admin-product-edit-${product.id}`),status=node('button',product.isActive?'Ngừng kinh doanh':'Kích hoạt',`admin-product-status-${product.id}`);
      edit.type='button';status.type='button';
      edit.addEventListener('click',async()=>{
        if(busy||uncertain)return;busy=true;lock();const current=generation;
        try{const {response,data}=await request(`/api/admin/products/${product.id}`);if(current!==generation)return;
          if(!response.ok){feedback.textContent=data.message;return;}
          selected=data.product;
          for(const key of ['sku','slug','name','price','stock','description'])fields[key].value=selected[key]??'';
          fields.category.value=String(selected.categoryId);fields['image-url'].value=selected.imageUrl??'';fields['image-alt'].value=selected.imageAlt??'';
          formFeedback.textContent='Đang sửa sản phẩm '+selected.sku+'.';
        }catch{if(current===generation)feedback.textContent='Không thể tải chi tiết sản phẩm.';}finally{busy=false;lock();}
      });
      status.addEventListener('click',()=>{if(busy||uncertain||!window.confirm(`${product.isActive?'Ngừng kinh doanh':'Kích hoạt'} ${product.name}?`))return;
        mutate(`/api/admin/products/${product.id}/status`,'PATCH',{version:product.version,isActive:!product.isActive});});
      actions.append(edit,status);tr.append(actions);rows.append(tr);
    }
  }
  async function load(){
    const current=++generation;clear();feedback.textContent='Đang tải dữ liệu quản trị...';
    try{
      const query=new URLSearchParams({q:find('admin-query').value,page:String(page),limit:'12',isActive:find('admin-filter').value});
      const [list,categories]=await Promise.all([request('/api/admin/products?'+query),request('/api/admin/categories')]);
      if(current!==generation)return;
      for(const result of [list,categories])if(!result.response.ok){feedback.textContent=result.response.status===401?'Vui lòng đăng nhập tài khoản ADMIN.':result.response.status===403?'Bạn không có quyền quản trị.':result.data.message;return;}
      fields.category.append(node('option','Chọn danh mục'));fields.category.children[0].value='';
      for(const category of categories.data.categories){const option=node('option',category.name+(category.isActive?'':' (ngừng hoạt động)'));option.value=String(category.id);fields.category.append(option);}
      total=list.data.total;draw(list.data.products);uncertain=false;panel.hidden=false;lock();
      find('admin-pagination').textContent=`Trang ${page}/${Math.max(1,Math.ceil(total/12))} · ${total} sản phẩm`;
      feedback.textContent=total?'Đã tải danh sách sản phẩm.':'Không có sản phẩm phù hợp.';
    }catch{if(current===generation)feedback.textContent='Không thể kết nối máy chủ. Vui lòng tải lại danh sách.';}
  }
  async function mutate(url,method,body){
    if(busy||uncertain)return;busy=true;lock();const current=generation;formFeedback.textContent='Đang lưu...';
    try{
      const {response,data}=await request(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(current!==generation)return;
      if(response.ok){await load();if(generation===current+1)feedback.textContent='Đã lưu sản phẩm thành công.';}
      else if([401,403].includes(response.status)){await load();}
      else {if(response.status>=500)uncertain=true;formFeedback.textContent=Object.values(data.errors||{}).join(' ')||data.message||'Không thể lưu. Hãy tải lại dữ liệu trước khi thử lại.';}
    }catch{if(current===generation){uncertain=true;formFeedback.textContent='Mất kết nối, chưa xác định kết quả. Hãy tải lại danh sách trước khi thao tác tiếp.';}}
    finally{busy=false;lock();}
  }
  form.addEventListener('submit',event=>{
    event.preventDefault();if(busy||uncertain)return;
    const body={sku:fields.sku.value,slug:fields.slug.value,name:fields.name.value,categoryId:Number(fields.category.value),price:fields.price.value,stock:fields.stock.value===''?null:Number(fields.stock.value),description:fields.description.value};
    if(fields['image-url'].value){body.imageUrl=fields['image-url'].value;body.imageAlt=fields['image-alt'].value;}
    if(selected)body.version=selected.version;
    mutate(selected?`/api/admin/products/${selected.id}`:'/api/admin/products',selected?'PATCH':'POST',body);
  });
  find('admin-product-new').addEventListener('click',()=>{if(!busy&&!uncertain)reset();});
  find('admin-search-form').addEventListener('submit',event=>{event.preventDefault();if(!busy){page=1;load();}});
  find('admin-reload').addEventListener('click',()=>{if(!busy)load();});
  find('admin-prev').addEventListener('click',()=>{if(!busy&&page>1){page--;load();}});
  find('admin-next').addEventListener('click',()=>{if(!busy&&page*12<total){page++;load();}});
  document.addEventListener('auth-state-changed',()=>{load();});
  window.addEventListener('pageshow',event=>{if(event.persisted)load();});
  load();
})();
