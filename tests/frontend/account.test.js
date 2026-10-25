const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../../frontend/assets/account.js'),'utf8');
const tick = () => new Promise(r=>setImmediate(r));
async function setup() {
  const listeners={},calls=[],events=[]; let owner=7, status=200, waiting=false, release, offline=false;
  class Element {
    constructor(){this.value='';this.textContent='';this.hidden=false;this.disabled=false;this.attributes={};this.listeners={};}
    addEventListener(k,f){this.listeners[k]=f;} setAttribute(k,v){this.attributes[k]=v;} removeAttribute(k){delete this.attributes[k];}
    reset(){for(const id of ['account-name','account-phone','account-address'])elements[id].value='';}
  }
  const ids=['account-form','account-name','account-phone','account-address','account-email','account-save','account-login','account-form-feedback','page-feedback','account-fullName-error','account-phone-error','account-address-error'];
  const elements=Object.fromEntries(ids.map(id=>[id,new Element()]));
  vm.runInNewContext(source,{document:{querySelector:s=>elements[s.match(/"([^"]+)"/)[1]],addEventListener:(k,f)=>listeners[k]=f,dispatchEvent:e=>events.push(e.type)},window:{addEventListener(){}},CustomEvent:class {constructor(type){this.type=type;}},fetch:async(url,options)=>{
    calls.push({url,options}); const current=owner;
    if(options.method==='PATCH'&&waiting)await new Promise(r=>release=r);
    if(offline)throw Error('offline');
    const code=current?status:401;
    return {status:code,ok:code===200,json:async()=>code===200?{fullName:'<img onerror=x> '+current,email:current+'@test',phone:null,address:null}:{message:'Thông tin không hợp lệ.',errors:{phone:'Số điện thoại không hợp lệ.'}}};
  }});
  await tick(); return {elements,calls,events,listeners,setOwner:v=>owner=v,setStatus:v=>status=v,setWaiting:v=>waiting=v,setOffline:v=>offline=v,release:()=>release(),submit:()=>elements['account-form'].listeners.submit({preventDefault(){}})};
}
test('account renders safe values and sends credentials, field errors, success and header refresh event',async()=>{
  const ui=await setup(),e=ui.elements;
  assert.equal(e['account-name'].value,'<img onerror=x> 7');assert.equal(e['account-email'].value,'7@test');assert.equal(e['account-phone'].value,'');assert.equal(ui.calls[0].options.cache,'no-store');
  e['account-phone'].value='bad';ui.setStatus(400);await ui.submit();assert.equal(e['account-phone'].attributes['aria-invalid'],'true');assert.match(e['account-phone-error'].textContent,/không hợp lệ/);
  ui.setStatus(200);await ui.submit();const post=ui.calls.at(-1);assert.equal(post.options.method,'PATCH');assert.equal(post.options.credentials,'same-origin');assert.deepEqual(Object.keys(JSON.parse(post.options.body)),['fullName','phone','address']);assert.equal(ui.events.at(-1),'account-profile-updated');assert.equal(e['account-form-feedback'].textContent,'Đã lưu thông tin tài khoản.');
  ui.setOffline(true);await ui.submit();assert.match(e['account-form-feedback'].textContent,/Không thể kết nối/);assert.equal(e['account-save'].disabled,false);
});
test('account blocks double saves and clears profile on logout, ignoring late PATCH response',async()=>{
  const ui=await setup(),e=ui.elements;ui.setWaiting(true);const pending=ui.submit();await tick();await ui.submit();assert.equal(ui.calls.filter(c=>c.options.method==='PATCH').length,1);
  ui.setOwner(null);ui.listeners['auth-state-changed']();assert.equal(e['account-name'].value,'');assert.equal(e['account-email'].value,'');assert.equal(e['account-form'].hidden,true);await tick();ui.release();await pending;
  assert.equal(e['account-form'].hidden,true);assert.equal(e['account-name'].value,'');assert.equal(ui.events.length,0);assert.equal(e['account-login'].hidden,false);
  ui.setOwner(8);ui.listeners['auth-state-changed']();await tick();assert.equal(e['account-email'].value,'8@test');
});
test('account HTML/script UTF-8, stable selectors, read-only email and disabled password form',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../../frontend/account.html'),'utf8');
  for(const file of ['account.html','assets/account.js']){
    const bytes=fs.readFileSync(path.join(__dirname,'../../frontend',file));const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    assert(!text.includes('\ufffd'));assert(!/(?:Ã.|Â.|Ä.|Æ.|á»|áº)/u.test(text));
  }
  for(const label of ['Quản lý tài khoản','Họ tên','Số điện thoại','Địa chỉ','Lưu thông tin','Đổi mật khẩu chưa được hỗ trợ'])assert(html.includes(label));
  assert.match(html,/<meta charset="utf-8">/);assert.match(html,/<input[^>]*data-testid="account-email"[^>]*readonly/);assert.match(html,/<form data-testid="password-form" hidden inert>/);
  assert(!source.includes('innerHTML'));assert(!html.includes('data-skeleton'));
  assert(fs.readFileSync(path.join(__dirname,'../../frontend/assets/auth.js'),'utf8').includes("document.addEventListener('account-profile-updated', refresh)"));
});
