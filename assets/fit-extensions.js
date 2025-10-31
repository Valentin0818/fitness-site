(function(){
  // 小工具：建节点
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

  // 挂载点
  const mount = document.getElementById('fit-extensions');
  if(!mount){ console.warn('[FitKnow] 未找到 #fit-extensions'); return; }
  const root = mount.attachShadow({mode:'open'});

  // 样式
  const style = h('style', {html: `
    :host { all: initial }
    :root{ --bg:#0e0f13; --card:#151823; --muted:#9aa3b2; --accent:#6ee7b7; --text:#e6e9ef; --danger:#ef4444; --shadow:0 10px 30px rgba(0,0,0,.25) }
    *{ box-sizing: border-box; font: 14px/1.4 ui-sans-serif, system-ui }
    .wrap{ color:var(--text) }
    .grid{ display:grid; grid-template-columns: 1fr 1fr; gap:16px }
    .row{ display:flex; gap:8px; align-items:center }
    .card{ background:var(--card); border:1px solid rgba(255,255,255,.08); border-radius:14px; box-shadow:var(--shadow); overflow:hidden }
    .card-hd{ display:flex; justify-content:space-between; align-items:center; padding:12px 14px; border-bottom:1px solid rgba(255,255,255,.08) }
    .title{ font-weight:700 }
    .muted,.helper{ color:var(--muted) }
    .body{ padding:12px 14px }
    .input,.select,.textarea{ flex:1; background:#0c0e14; color:var(--text); border:1px solid rgba(255,255,255,.12); padding:8px 10px; border-radius:10px; outline:none }
    .textarea{ min-height:78px; resize:vertical }
    .btn{ border:1px solid rgba(255,255,255,.14); background:#0f1320; padding:8px 12px; border-radius:10px; cursor:pointer }
    .btn-accent{ background:rgba(110,231,183,.15); border-color:rgba(110,231,183,.35) }
    .btn-danger{ background:rgba(239,68,68,.15); border-color:rgba(239,68,68,.35) }
    .btn-ghost{ background:transparent }
    .pill{ background:rgba(255,255,255,.07); padding:6px 10px; border-radius:999px; margin-right:8px; }
    .right{ margin-left:auto }
    .sep{ height:1px; background:rgba(255,255,255,.08); margin:12px 0 }
    .list{ display:flex; flex-direction:column; gap:8px }
    .log-item{ background:#0f1320; border:1px solid rgba(255,255,255,.08); border-radius:12px; padding:10px }
    .flex{ display:flex; align-items:center; gap:8px }
    img{ max-width:100%; border-radius:12px; border:1px solid rgba(255,255,255,.1) }
    @media (max-width: 900px){ .grid{ grid-template-columns:1fr } }
  `});

  // IndexedDB 基础
  let db;
  function openDB(){
    return new Promise((res, rej)=>{
      const req = indexedDB.open('fitknow-db', 1);
      req.onupgradeneeded = (e)=>{
        const d = e.target.result;
        if(!d.objectStoreNames.contains('logs')){
          d.createObjectStore('logs', {keyPath:'id', autoIncrement:true});
        }
        if(!d.objectStoreNames.contains('albums')){
          d.createObjectStore('albums', {keyPath:'name'});
        }
        if(!d.objectStoreNames.contains('photos')){
          const s = d.createObjectStore('photos', {keyPath:'id', autoIncrement:true});
          s.createIndex('byAlbum','album',{unique:false});
        }
      };
      req.onsuccess = ()=>{ db = req.result; res(db); };
      req.onerror = ()=> rej(req.error);
    });
  }
  const tx = (name, mode='readonly')=> db.transaction(name, mode).objectStore(name);

  // 日志 CRUD
  const addLog = (log)=> new Promise((res,rej)=>{ const r = tx('logs','readwrite').add(log); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); });
  const delLog = (id)=> new Promise((res,rej)=>{ const r = tx('logs','readwrite').delete(id); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); });
  const listLogs = ()=> new Promise((res,rej)=>{ const r = tx('logs').getAll(); r.onsuccess=()=>res(r.result.sort((a,b)=>b.ts-a.ts)); r.onerror=()=>rej(r.error); });

  // 相册/照片（相册只存是否加密；密码不落盘）
  const upsertAlbum = (album)=> new Promise((res,rej)=>{ const r = tx('albums','readwrite').put(album); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); });
  const listAlbums  = ()=> new Promise((res,rej)=>{ const r = tx('albums').getAll(); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });
  const addPhoto = (album, blob)=> new Promise((res,rej)=>{ const r = tx('photos','readwrite').add({album, blob}); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });
  const listPhotos = (album)=> new Promise((res,rej)=>{
    const store = tx('photos'); const idx = store.index('byAlbum'); const req = idx.getAll(album);
    req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error);
  });

  // 视图
  const app = h('div', {class:'wrap'});
  const tabs = h('div', {class:'row', style:'margin-bottom:12px'},
    h('span', {class:'pill'}, '🏋️‍♀️ 训练笔记'),
    h('span', {class:'pill'}, '🖼️ 相册（可加密）'),
    h('span', {class:'right helper'}, '数据保存在本机，可导出 JSON。')
  );

  // 左：训练笔记
  const noteCard = h('div', {class:'card'},
    h('div', {class:'card-hd'}, h('div', {class:'title'}, '训练笔记'), h('div', {class:'muted'}, '记录每次训练与感受')),
    h('div', {class:'body'},
      h('div', {class:'row'},
        h('input', {class:'input', id:'date', type:'date'}),
        h('input', {class:'input', id:'session', placeholder:'本次训练主题（如：胸 + 三头）'}),
        h('select', {class:'select', id:'rating', title:'主观强度 RPE'},
          h('option', {value:''}, '强度（RPE）'),
          ...Array.from({length:10}, (_,i)=>h('option', {value:String(i+1)}, String(i+1)))
        )
      ),
      h('div', {class:'row'},
        h('textarea', {class:'textarea', id:'exercises', placeholder:'动作清单（每行：动作 | 组x次 | 重量）\\n例：卧推 | 4x6 | 60kg'})
      ),
      h('div', {class:'row'},
        h('textarea', {class:'textarea', id:'notes', placeholder:'主观感受、疼痛与技术要点…'})
      ),
      h('div', {class:'row'},
        h('button', {class:'btn btn-accent', id:'saveLog'}, '保存记录'),
        h('button', {class:'btn btn-ghost', id:'exportLogs'}, '导出 JSON')
      ),
      h('div', {class:'sep'}),
      h('div', {class:'list', id:'logList'}, h('div', {class:'helper'}, '暂无记录'))
    )
  );

  // 右：相册
  const albumCard = h('div', {class:'card'},
    h('div', {class:'card-hd'}, h('div', {class:'title'}, '健身相册（可加密）'), h('div', {class:'muted'}, '创建相册并选择是否加密')),
    h('div', {class:'body'},
      h('div', {class:'row'},
        h('input', {class:'input', id:'albumName', placeholder:'相册名称（如：增肌期 2025-Q1）'}),
        h('input', {class:'input', id:'albumPassword', placeholder:'相册密码（留空=公开）', type:'password'}),
        h('button', {class:'btn btn-accent', id:'createAlbum'}, '创建/更新相册')
      ),
      h('div', {id:'albumList', class:'list'}, h('div', {class:'helper'}, '暂无相册'))
    )
  );

  const grid = h('div', {class:'grid'}, noteCard, albumCard);
  app.append(tabs, grid);
  root.append(style, app);

  // 渲染：日志
  function renderLogs(items){
    const box = root.getElementById('logList'); box.innerHTML='';
    if(!items.length){ box.append(h('div',{class:'helper'},'暂无记录')); return; }
    for(const it of items){
      const head = `${it.date || ''} · ${it.session || '未命名'} · RPE ${it.rating || '-'}`;
      const ex = (it.exercises||'').split(/\\n+/).filter(Boolean).map(l=>`• ${l}`).join('\\n');
      const el = h('div', {class:'log-item'},
        h('div', {class:'flex'}, h('h4',{}, head), h('span',{class:'right helper'}, `#${it.id}`)),
        h('pre', {class:'helper', style:'white-space:pre-wrap; margin:6px 0'}, ex),
        h('div', {class:'helper', style:'white-space:pre-wrap'}, it.notes||''),
        h('div', {class:'row', style:'margin-top:8px'},
          h('button', {class:'btn btn-danger', onclick: async()=>{ await delLog(it.id); loadLogs(); }}, '删除')
        )
      );
      box.append(el);
    }
  }
  async function loadLogs(){ renderLogs(await listLogs()); }

  // 事件：保存/导出
  async function onSaveLog(){
    const v = (id)=> root.getElementById(id).value.trim();
    const log = { date:v('date')||new Date().toISOString().slice(0,10), session:v('session'), rating:v('rating'), exercises:v('exercises'), notes:v('notes'), ts:Date.now() };
    await addLog(log); await loadLogs();
    ['session','rating','exercises','notes'].forEach(id=> root.getElementById(id).value='');
  }
  async function onExportLogs(){
    const data = await listLogs();
    const blob = new Blob([JSON.stringify({ type:'fitknow-logs', version:1, data }, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = h('a', {href:url, download:`fitknow-logs-${new Date().toISOString().slice(0,10)}.json`});
    root.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  // 渲染：相册
  async function renderAlbums(){
    const wrap = root.getElementById('albumList'); wrap.innerHTML='';
    const albums = await listAlbums(); if(!albums.length){ wrap.append(h('div',{class:'helper'},'暂无相册')); return; }
    for(const a of albums){
      const row = h('div', {class:'log-item'},
        h('div', {class:'flex'}, h('strong',{}, a.name), a.locked? h('span',{class:'pill'},'🔒 加密'):h('span',{class:'pill'},'公开')),
        h('div', {class:'row', style:'margin-top:8px'},
          h('input', {class:'input', type:'file', accept:'image/*', oninput: async(e)=>{
            const file = e.target.files[0]; if(!file) return;
            await addPhoto(a.name, file); await showAlbum(a.name);
          }}),
          h('button', {class:'btn', onclick:()=> showAlbum(a.name)}, '查看')
        ),
        h('div', {id:`album-${a.name}`, class:'list', style:'margin-top:8px'})
      );
      wrap.append(row);
    }
  }
  async function showAlbum(name){
    const grid = root.getElementById(`album-${name}`); grid.innerHTML='';
    const photos = await listPhotos(name);
    if(!photos.length){ grid.append(h('div',{class:'helper'},'暂无照片')); return; }
    for(const p of photos){
      const url = URL.createObjectURL(p.blob);
      grid.append(h('img', {src:url, alt:name, onload:()=>URL.revokeObjectURL(url)}));
    }
  }
  async function onCreateAlbum(){
    const name = root.getElementById('albumName').value.trim();
    const pwd  = root.getElementById('albumPassword').value;
    if(!name){ alert('请填写相册名称'); return; }
    await upsertAlbum({ name, locked: !!pwd });
    root.getElementById('albumName').value='';
    root.getElementById('albumPassword').value='';
    renderAlbums();
  }

  // 绑定 & 初始化
  root.getElementById('saveLog').onclick   = onSaveLog;
  root.getElementById('exportLogs').onclick= onExportLogs;
  root.getElementById('createAlbum').onclick = onCreateAlbum;

  openDB().then(()=>{ loadLogs(); renderAlbums(); });
})();
