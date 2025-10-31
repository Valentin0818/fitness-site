(function(){
  // ============ 小工具 ============
  const h = (tag, attrs={}, ...children)=>{
    const el = document.createElement(tag);
    for(const [k,v] of Object.entries(attrs||{})){
      if(k.startsWith('on') && typeof v === 'function') el[k] = v;
      else if(k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v);
    }
    for(const c of children){ if(c!=null) el.append(c.nodeType?c:document.createTextNode(c)); }
    return el;
  };
  const fmtBytes = (n)=> {
    if(n<1024) return n+' B';
    if(n<1024**2) return (n/1024).toFixed(1)+' KB';
    if(n<1024**3) return (n/1024**2).toFixed(1)+' MB';
    return (n/1024**3).toFixed(1)+' GB';
  };

  // ============ 挂载点 ============
  const mount = document.getElementById('fit-extensions');
  if(!mount){ console.warn('[FitKnow] 未找到挂载点 #fit-extensions，脚本跳过'); return; }
  const root = mount.attachShadow({mode:'open'});

  // ============ 样式 ============
  const style = h('style', {html: `
    :host{ all:initial }
    :root{
      --bg:#0e0f13; --card:#151823; --muted:#9aa3b2; --accent:#6ee7b7; --text:#e6e9ef; --danger:#ef4444;
      --shadow:0 10px 30px rgba(0,0,0,.25); --ring:0 0 0 2px rgba(110,231,183,.35);
    }
    *{ box-sizing:border-box; font-family: ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "PingFang SC", "Hiragino Sans GB","Noto Sans CJK","Microsoft YaHei", sans-serif; }
    .wrap{ color:var(--text); background: transparent; }
    .grid{ display:grid; grid-template-columns: 1fr 1fr; gap:16px; }
    .row{ display:flex; gap:8px; }
    .card{ background:var(--card); border:1px solid rgba(255,255,255,.08); border-radius:16px; box-shadow:var(--shadow); overflow:hidden; }
    .card-hd{ padding:14px 14px 10px; border-bottom:1px solid rgba(255,255,255,.06); display:flex; align-items:center; justify-content:space-between; }
    .title{ font-weight:700 }
    .muted{ color:var(--muted); font-size:12px }
    .body{ padding:12px; }
    .input,.select,.textarea{ flex:1; background:#0a0c12; border:1px solid rgba(255,255,255,.12); color:var(--text); border-radius:10px; padding:8px 10px; outline:none; }
    .input:focus,.select:focus,.textarea:focus{ box-shadow:var(--ring); }
    .textarea{ min-height:88px; resize:vertical; }
    .btn{ background: linear-gradient(135deg, rgba(122,162,255,.18), rgba(88,245,165,.18));
          border:1px solid rgba(255,255,255,.12); border-radius:10px; padding:8px 12px; color:var(--text); cursor:pointer; }
    .btn:hover{ filter:brightness(1.05) }
    .btn-accent{ background: linear-gradient(135deg, rgba(110,231,183,.25), rgba(122,162,255,.20)); }
    .btn-ghost{ background: transparent; }
    .btn-danger{ background: rgba(239,68,68,.15); border-color: rgba(239,68,68,.45); }
    .sep{ height:1px; background: rgba(255,255,255,.08); margin:12px -12px; }
    .list{ display:flex; flex-direction:column; gap:10px; }
    .log-item{ padding:10px; background:#0f121a; border:1px solid rgba(255,255,255,.08); border-radius:12px; }
    .flex{ display:flex; align-items:center; gap:8px }
    .right{ margin-left:auto }
    .helper{ color:var(--muted) }
    .pill{ padding:6px 10px; border:1px solid rgba(255,255,255,.15); border-radius:999px; background: rgba(255,255,255,.06); font-size:12px; }
    .row-top{ display:flex; gap:8px; align-items:center; justify-content:space-between; flex-wrap:wrap; margin-bottom:8px; }
    .badge{ font-size:11px; padding:2px 8px; border-radius:999px; border:1px solid rgba(255,255,255,.15); color:var(--muted) }
    .badge.ok{ color:#10b981; border-color:rgba(16,185,129,.4); }
    .albums .item{ padding:10px; background:#0f121a; border:1px solid rgba(255,255,255,.08); border-radius:12px; display:flex; gap:8px; align-items:center; }
    .albums .name{ font-weight:600 }
    .albums .ops{ margin-left:auto; display:flex; gap:8px }
    .viewer{ margin-top:16px; padding:12px; background:#0f121a; border:1px solid rgba(255,255,255,.08); border-radius:16px; }
    .photos{ display:grid; grid-template-columns: repeat( auto-fill, minmax(160px, 1fr) ); gap:12px; }
    .thumb{ position:relative; background:#0a0c12; border:1px solid rgba(255,255,255,.08); border-radius:12px; overflow:hidden; }
    .thumb img{ display:block; width:100%; height:auto; aspect-ratio: 1 / 1; object-fit:cover; }
    .pick{ position:absolute; top:8px; left:8px; width:18px; height:18px; accent-color:var(--accent); }
    .x{ position:absolute; top:8px; right:8px; padding:4px 8px; font-size:12px; line-height:1; border:1px solid rgba(255,255,255,.18);
        background: rgba(239,68,68,.9); color:#fff; border-radius:8px; cursor:pointer; box-shadow: var(--shadow); }
    .x:hover{ filter:brightness(1.05); }
    .x.danger{ background: rgba(220,38,38,.95); }
    .toolbar{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:12px; }
    .info{ font-size:12px; color:var(--muted) }
    @media (max-width: 900px){ .grid{ grid-template-columns: 1fr; } }
  `});
  root.append(style);

  // ============ 布局 ============
  const app = h('div', {class:'wrap'});

  // 顶部提示
  const tabs = h('div', {class:'row', style:'margin-bottom:12px'},
    h('span', {class:'pill'}, '🏋️‍♀️ 训练笔记'),
    h('span', {class:'pill'}, '🖼️ 相册（可加密）'),
    h('span', {class:'right helper'}, '数据保存在本机浏览器，可导出 JSON 备份。')
  );

  // ------ 训练笔记卡片 ------
  const noteCard = h('div', {class:'card'},
    h('div', {class:'card-hd'}, h('div', {class:'title'}, '训练笔记'), h('div', {class:'muted'}, '记录每次训练、动作与感受')),
    h('div', {class:'body'},
      h('div', {class:'row'},
        h('input', {class:'input', id:'date', type:'date'}),
        h('input', {class:'input', id:'session', placeholder:'本次训练主题（如：胸 + 三头）'}),
        h('select', {class:'select', id:'rating', title:'主观强度 RPE'},
          h('option', {value:''}, '强度（RPE）'),
          ...Array.from({length:10}, (_,i)=>h('option', {value:String(i+1)}, String(i+1)))
        )
      ),
      h('div', {class:'row'}, h('textarea', {class:'textarea', id:'exercises', placeholder:'动作清单（每行一个：动作 | 组数x次数 | 重量）\n例：卧推 | 4x6 | 60kg'})),
      h('div', {class:'row'}, h('textarea', {class:'textarea', id:'notes', placeholder:'主观感受、疼痛与技术要点…'})),
      h('div', {class:'row'},
        h('button', {class:'btn btn-accent', id:'saveLog'}, '保存记录'),
        h('button', {class:'btn btn-ghost', id:'exportLogs'}, '导出 JSON')
      ),
      h('div', {class:'sep'}),
      h('div', {class:'list', id:'logList'}, h('div', {class:'helper'}, '暂无记录'))
    )
  );

  // ------ 相册卡片（创建/列表） ------
  const albumCard = h('div', {class:'card'},
    h('div', {class:'card-hd'}, h('div', {class:'title'}, '健身相册（可加密）'), h('div', {class:'muted'}, '创建相册并选择是否加密')),
    h('div', {class:'body'},
      h('div', {class:'row'},
        h('input', {class:'input', id:'albumName', placeholder:'相册名称（如：增肌期 2025-Q1）'}),
        h('input', {class:'input', id:'albumPassword', placeholder:'相册密码（可留空为公开）', type:'password'}),
        h('button', {class:'btn btn-accent', id:'createAlbum'}, '创建/更新相册')
      ),
      h('div', {class:'sep'}),
      h('div', {id:'albumList', class:'list'}, h('div', {class:'helper'}, '暂无相册'))
    )
  );

  const grid = h('div', {class:'grid'}, noteCard, albumCard);
  app.append(tabs, grid);

  // 相册查看器（打开相册后显示）
  const viewer = h('div', {class:'viewer', style:'display:none'});
  app.append(viewer);

  root.append(app);

  // ============ IndexedDB ============
  const DB_NAME = 'fitknow_db';
  const DB_VER  = 2;
  function openDB(){
    return new Promise((resolve, reject)=>{
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = (e)=>{
        const db = req.result;
        if(!db.objectStoreNames.contains('logs')){
          const os = db.createObjectStore('logs', {keyPath:'id', autoIncrement:true});
          os.createIndex('ts','ts');
        }
        if(!db.objectStoreNames.contains('albums')){
          const os = db.createObjectStore('albums', {keyPath:'id', autoIncrement:true});
          os.createIndex('name','name',{unique:true});
        }
        if(!db.objectStoreNames.contains('photos')){
          const os = db.createObjectStore('photos', {keyPath:'id', autoIncrement:true});
          os.createIndex('albumId','albumId');
          os.createIndex('deletedAt','deletedAt');
        }
      };
      req.onsuccess = ()=> resolve(req.result);
      req.onerror = ()=> reject(req.error);
    });
  }
  // 通用事务
  async function txStore(name, mode, fn){
    const db = await openDB();
    return new Promise((resolve, reject)=>{
      const tx = db.transaction(name, mode);
      const store = tx.objectStore(name);
      Promise.resolve(fn(store)).then(()=>tx.commit?.()).catch(reject);
      tx.oncomplete = ()=> resolve();
      tx.onerror = ()=> reject(tx.error);
    });
  }

  // ---- 日志 CRUD ----
  async function addLog(log){ const db=await openDB(); return new Promise((res,rej)=>{ const tx=db.transaction('logs','readwrite'); tx.objectStore('logs').add(log); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }); }
  async function listLogs(){
    const db = await openDB();
    return new Promise((res, rej)=>{
      const tx = db.transaction('logs','readonly');
      const req = tx.objectStore('logs').index('ts').getAll();
      req.onsuccess = ()=> res((req.result||[]).sort((a,b)=>b.ts-a.ts));
      req.onerror = ()=> rej(req.error);
    });
  }
  async function delLog(id){
    const db = await openDB();
    return new Promise((res, rej)=>{
      const tx = db.transaction('logs','readwrite');
      tx.objectStore('logs').delete(id);
      tx.oncomplete = ()=> res();
      tx.onerror = ()=> rej(tx.error);
    });
  }

  // ---- 相册 CRUD ----
  async function listAlbums(){
    const db = await openDB();
    return new Promise((res, rej)=>{
      const tx = db.transaction('albums','readonly');
      const req = tx.objectStore('albums').getAll();
      req.onsuccess = ()=> res(req.result||[]);
      req.onerror = ()=> rej(req.error);
    });
  }
  async function upsertAlbum(album){
    album.ts = Date.now();
    const db = await openDB();
    return new Promise((res, rej)=>{
      const tx = db.transaction('albums','readwrite');
      tx.objectStore('albums').put(album);
      tx.oncomplete = ()=> res();
      tx.onerror = ()=> rej(tx.error);
    });
  }

  // ---- 照片 CRUD ----
  async function addPhoto(rec){ const db=await openDB(); return new Promise((res,rej)=>{ const tx=db.transaction('photos','readwrite'); tx.objectStore('photos').add(rec); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }); }
  async function listPhotosByAlbum(albumId){
    const db = await openDB();
    return new Promise((res, rej)=>{
      const tx = db.transaction('photos','readonly');
      const idx = tx.objectStore('photos').index('albumId');
      const req = idx.getAll(albumId);
      req.onsuccess = ()=> res(req.result||[]);
      req.onerror = ()=> rej(req.error);
    });
  }
  async function getPhoto(id){
    const db = await openDB();
    return new Promise((res, rej)=>{
      const tx = db.transaction('photos','readonly');
      const req = tx.objectStore('photos').get(id);
      req.onsuccess = ()=> res(req.result||null);
      req.onerror = ()=> rej(req.error);
    });
  }
  async function updatePhoto(p){
    const db = await openDB();
    return new Promise((res, rej)=>{
      const tx = db.transaction('photos','readwrite');
      tx.objectStore('photos').put(p);
      tx.oncomplete = ()=> res();
      tx.onerror = ()=> rej(tx.error);
    });
  }
  async function deletePhoto(id){
    const db = await openDB();
    return new Promise((res, rej)=>{
      const tx = db.transaction('photos','readwrite');
      tx.objectStore('photos').delete(id);
      tx.oncomplete = ()=> res();
      tx.onerror = ()=> rej(tx.error);
    });
  }

  // ============ 回收站功能（软删除/还原/清除） ============
  async function trashPhoto(id){
    const p = await getPhoto(id);
    if(!p) return;
    p.deletedAt = Date.now();
    await updatePhoto(p);
  }
  async function restorePhoto(id){
    const p = await getPhoto(id);
    if(!p) return;
    delete p.deletedAt;
    await updatePhoto(p);
  }
  async function purgePhoto(id){ await deletePhoto(id); }
  async function listPhotosByAlbumWithTrash(albumId, {onlyTrash=false, includeTrash=false}={}){
    const all = await listPhotosByAlbum(albumId);
    return all.filter(p=>{
      const t = !!p.deletedAt;
      if(onlyTrash) return t;
      if(includeTrash) return true;
      return !t;
    });
  }

  // ============ 加密工具（PBKDF2 + AES-GCM） ============
  const encCache = new Map(); // albumId -> {password:string}
  function str2buf(s){ return new TextEncoder().encode(s); }
  async function deriveKey(password, salt){
    const base = await crypto.subtle.importKey('raw', str2buf(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      {name:'PBKDF2', salt, iterations:120000, hash:'SHA-256'},
      base,
      {name:'AES-GCM', length:256},
      false,
      ['encrypt','decrypt']
    );
  }
  async function encryptBlob(blob, password){
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const key  = await deriveKey(password, salt);
    const data = new Uint8Array(await blob.arrayBuffer());
    const ct   = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, data));
    return {ct, iv, salt, type: blob.type, size: blob.size};
  }
  async function decryptToBlob(record, password){
    const {ct, iv, salt, type} = record;
    const key = await deriveKey(password, new Uint8Array(salt));
    const pt  = new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM', iv:new Uint8Array(iv)}, key, new Uint8Array(ct)));
    return new Blob([pt], {type});
  }

  // ============ 训练笔记渲染 ============
  function renderLogsView(items){
    const box = root.getElementById('logList');
    box.innerHTML = '';
    if(!items.length){ box.append(h('div',{class:'helper'},'暂无记录')); return; }
    for(const it of items){
      const head = `${it.date || ''} · ${it.session || '未命名'} · RPE ${it.rating || '-'}`;
      const ex = (it.exercises||'').split(/\n+/).filter(Boolean).map(line=>`• ${line}`).join('\n');
      const el = h('div', {class:'log-item'},
        h('div', {class:'flex'}, h('h4',{}, head), h('span',{class:'right helper'}, `#${it.id}`)),
        h('pre', {class:'helper', style:'white-space:pre-wrap;margin:6px 0'}, ex),
        h('div', {class:'helper', style:'white-space:pre-wrap'}, it.notes||''),
        h('div', {class:'row', style:'margin-top:8px'},
          h('button', {class:'btn btn-danger', onclick: async()=>{ await delLog(it.id); loadLogs(); }}, '删除')
        )
      );
      box.append(el);
    }
  }
  async function loadLogs(){ renderLogsView(await listLogs()); }
  async function onSaveLog(){
    const v = (id)=> root.getElementById(id).value.trim();
    const log = { date:v('date')||new Date().toISOString().slice(0,10), session:v('session'), rating:v('rating'), exercises:v('exercises'), notes:v('notes'), ts:Date.now() };
    await addLog(log); loadLogs();
    ['session','rating','exercises','notes'].forEach(id=> root.getElementById(id).value='');
  }
  async function onExportLogs(){
    const data = await listLogs();
    const blob = new Blob([JSON.stringify({ type:'fitknow-logs', version:1, data }, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = h('a', {href:url, download:'fitknow-logs.json'}); a.click(); URL.revokeObjectURL(url);
  }

  // ============ 相册渲染 ============
  async function renderAlbums(){
    const list = root.getElementById('albumList');
    list.innerHTML = '';
    const rows = await listAlbums();
    if(!rows.length){ list.append(h('div',{class:'helper'},'暂无相册')); return; }
    for(const a of rows){
      list.append(
        h('div',{class:'albums item'},
          h('div', {class:'name'}, a.name || '未命名'),
          h('span', {class:`badge ${a.locked?'':'ok'}`}, a.locked?'加密':'公开'),
          h('span', {class:'info'}, a.ts ? new Date(a.ts).toLocaleString() : ''),
          h('div', {class:'ops'},
            h('button', {class:'btn', onclick: ()=> openAlbum(a)}, '打开')
          )
        )
      );
    }
  }

  // 选择模式 & 回收站状态
  let selectMode = false;
  let selectedIds = new Set();
  let showTrash = false;         // false=正常相册；true=回收站
  let currentAlbum = null;

  // 解密密码缓存（仅内存）
  const albumPasswords = new Map(); // albumId -> password string

  async function openAlbum(album){
    currentAlbum = album;
    selectedIds.clear(); selectMode=false; showTrash=false;

    viewer.style.display = '';
    viewer.innerHTML = '';

    const bar = h('div', {class:'toolbar'},
      h('button', {class:'btn', onclick: ()=>{ viewer.style.display='none'; currentAlbum=null; }}, '返回'),
      h('span', {class:'badge'}, `相册：${album.name}`),
      h('span', {class:`badge ${album.locked?'':'ok'}`}, album.locked?'加密':'公开'),
      h('span', {class:'info right', id:'albumInfo'}, '')
    );

    // 上传 & 密码输入
    const actions = h('div', {class:'row-top'},
      h('div', {class:'row'},
        h('input', {class:'input', id:'filePick', type:'file', multiple:true, accept:'image/*'}),
        h('button', {class:'btn btn-accent', onclick: ()=> onUploadPhotos(album)}, '上传照片')
      ),
      album.locked ? h('div', {class:'row'},
        h('input', {class:'input', id:'albumPwd', type:'password', placeholder:'查看/加密所需密码'}),
        h('button', {class:'btn', onclick: ()=>{
          const pwd = root.getElementById('albumPwd').value;
          if(!pwd){ alert('请输入密码'); return; }
          albumPasswords.set(album.id, pwd);
          renderPhotos(album);
        }}, '解锁/刷新')
      ) : null
    );

    const toolbar = h('div', {class:'toolbar', id:'photoToolbar'});
    const gridBox = h('div', {id:'photoGrid'});

    viewer.append(bar, actions, toolbar, gridBox);
    await renderPhotos(album);
  }

  async function onUploadPhotos(album){
    const input = root.getElementById('filePick');
    const files = Array.from(input.files||[]);
    if(!files.length){ alert('请选择图片'); return; }

    let pwd = '';
    if(album.locked){
      pwd = root.getElementById('albumPwd')?.value || albumPasswords.get(album.id) || '';
      if(!pwd){ alert('加密相册需要密码'); return; }
      albumPasswords.set(album.id, pwd);
    }

    for(const f of files){
      try{
        if(album.locked){
          const {ct, iv, salt, type, size} = await encryptBlob(f, pwd);
          await addPhoto({ albumId: album.id, name: f.name, enc: true, ct, iv, salt, type, size, ts: Date.now() });
        }else{
          // 公开相册直接存 Blob
          await addPhoto({ albumId: album.id, name: f.name, enc: false, blob: f, type: f.type, size: f.size, ts: Date.now() });
        }
      }catch(err){
        console.error('上传失败', err);
        alert(`上传失败：${f.name}`);
      }
    }
    input.value = '';
    await renderPhotos(album);
  }

  async function renderPhotos(album){
    const info = root.getElementById('albumInfo');
    const toolbar = root.getElementById('photoToolbar');
    const gridBox = root.getElementById('photoGrid');
    toolbar.innerHTML = '';
    gridBox.innerHTML = '';

    const items = await listPhotosByAlbumWithTrash(album.id, {onlyTrash: showTrash});
    // 工具条
    toolbar.append(
      h('button', {class:'btn', onclick: ()=>{ selectMode=!selectMode; selectedIds.clear(); renderPhotos(album); }},
        selectMode ? '退出选择' : '选择照片'),
      h('button', {class:'btn', onclick: ()=>{ showTrash=!showTrash; selectedIds.clear(); renderPhotos(album); }},
        showTrash ? '返回相册' : '查看回收站'),
      selectMode ? h('button', {class:'btn', onclick: ()=>{
        const allThumbs = gridBox.querySelectorAll('[data-photo-id]');
        const allIds = Array.from(allThumbs).map(n=>n.getAttribute('data-photo-id'));
        const allSelected = allIds.length && allIds.every(id=>selectedIds.has(id));
        if(allSelected) selectedIds.clear(); else allIds.forEach(id=> selectedIds.add(id));
        renderPhotos(album);
      }}, '全选/取消全选') : null,
      selectMode && !showTrash ? h('button', {class:'btn btn-accent', onclick: async()=>{
        if(!selectedIds.size) return;
        if(!confirm(`确定删除选中的 ${selectedIds.size} 张？它们将进入回收站。`)) return;
        for(const id of selectedIds) await trashPhoto(Number(id));
        selectedIds.clear(); renderPhotos(album);
      }}, '批量删除（回收站）') : null,
      selectMode && showTrash ? h('button', {class:'btn', onclick: async()=>{
        if(!selectedIds.size) return;
        for(const id of selectedIds) await restorePhoto(Number(id));
        selectedIds.clear(); renderPhotos(album);
      }}, '批量还原') : null,
      selectMode && showTrash ? h('button', {class:'btn btn-danger', onclick: async()=>{
        if(!selectedIds.size) return;
        if(!confirm(`彻底删除 ${selectedIds.size} 张？此操作不可恢复！`)) return;
        for(const id of selectedIds) await purgePhoto(Number(id));
        selectedIds.clear(); renderPhotos(album);
      }}, '彻底删除') : null,
    );

    info.textContent = `${showTrash?'回收站':'照片'}：${items.length} 张`;

    if(!items.length){
      gridBox.append(h('div', {class:'helper'}, showTrash ? '回收站为空' : '此相册暂无照片'));
      return;
    }

    const grid = h('div', {class:'photos'});
    const pwd = album.locked ? (root.getElementById('albumPwd')?.value || albumPasswords.get(album.id) || '') : '';

    for(const p of items){
      let url = '';
      try{
        if(p.enc){
          if(!pwd) throw new Error('需要密码');
          const blob = await decryptToBlob(p, pwd);
          url = URL.createObjectURL(blob);
        }else{
          const blob = p.blob instanceof Blob ? p.blob : new Blob([p.blob], {type:p.type||'image/*'});
          url = URL.createObjectURL(blob);
        }
      }catch(err){
        grid.append(h('div',{class:'thumb'}, h('div',{class:'helper', style:'padding:10px'}, `无法解密 #${p.id}（请先解锁）`)));
        continue;
      }

      const idStr = String(p.id);
      const checked = selectedIds.has(idStr);
      const checkbox = selectMode ? h('input', {
        type:'checkbox', class:'pick', checked,
        onchange:(e)=>{ e.target.checked ? selectedIds.add(idStr) : selectedIds.delete(idStr); }
      }) : null;

      const delBtn = !selectMode && !showTrash ? h('button', {
        class:'x', title:'删除（移入回收站）',
        onclick: async ()=>{ if(!confirm('确定删除此照片？')) return; await trashPhoto(p.id); renderPhotos(album); }
      }, '删除') : null;

      const restoreBtn = !selectMode && showTrash ? h('button', {
        class:'x', title:'还原',
        onclick: async ()=>{ await restorePhoto(p.id); renderPhotos(album); }
      }, '还原') : null;

      const purgeBtn = !selectMode && showTrash ? h('button', {
        class:'x danger', title:'彻底删除',
        onclick: async ()=>{ if(!confirm('彻底删除不可恢复，继续？')) return; await purgePhoto(p.id); renderPhotos(album); }
      }, '清除') : null;

      const meta = h('div', {class:'info', style:'padding:8px'},
        `${p.name||'未命名'} · ${fmtBytes(p.size||0)}`
      );

      const img = h('img', {src:url, alt:p.name||''});
      const box = h('div', {class:'thumb', 'data-photo-id': idStr}, img, checkbox, delBtn, restoreBtn, purgeBtn, meta);
      grid.append(box);
    }

    gridBox.append(grid);
  }

  // ============ 事件 ============
  root.getElementById('saveLog').onclick = onSaveLog;
  root.getElementById('exportLogs').onclick = onExportLogs;
  root.getElementById('createAlbum').onclick = async ()=>{
    const name = root.getElementById('albumName').value.trim();
    const pwd  = root.getElementById('albumPassword').value;
    if(!name){ alert('请填写相册名称'); return; }
    // 如果已存在同名，相当于更新“加密标记”
    const all = await listAlbums();
    const exist = all.find(a=> a.name === name);
    const album = exist ? {...exist} : { name };
    album.locked = !!pwd;
    await upsertAlbum(album);
    root.getElementById('albumName').value = '';
    root.getElementById('albumPassword').value = '';
    await renderAlbums();
  };

  // ============ 初始化 ============
  (async function init(){
    root.getElementById('date').value = new Date().toISOString().slice(0,10);
    await loadLogs();
    await renderAlbums();
  })();
})();
