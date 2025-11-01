// assets/fit-extensions.js
(function () {
  // ---------- 小工具 ----------
  const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k.startsWith('on') && typeof v === 'function') el[k] = v;
      else if (k === 'html') el.innerHTML = v;
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    for (const c of children) {
      if (c == null) continue;
      el.append(c.nodeType ? c : document.createTextNode(c));
    }
    return el;
  };
  const $ = (sel, root = document) => root.querySelector(sel);

  // ---------- Shadow DOM 容器 ----------
  const mount = document.getElementById('fit-extensions');
  if (!mount) {
    console.warn('[FitKnow] 未找到挂载点 #fit-extensions，脚本已跳过');
    return;
  }
  const root = mount.attachShadow({ mode: 'open' });

  // ---------- 样式 ----------
  const style = h('style', {
    html: `
:host { all: initial }
:root { --bg:#0e0f13; --card:#151823; --muted:#9aa3b2; --accent:#6ee7b7; --text:#e6e9ef; --danger:#ef4444; --ring:#7aa2ff; --shadow:0 10px 30px rgba(0,0,0,.25) }

*{box-sizing:border-box} .wrap{font:14px/1.6 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;color:var(--text)}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.card{background:linear-gradient(180deg,rgba(21,24,38,.9),rgba(21,24,38,.7));border:1px solid rgba(255,255,255,.08);border-radius:14px;box-shadow:var(--shadow)}
.card-hd{display:flex;align-items:baseline;justify-content:space-between;padding:12px 14px 0}
.title{font-weight:700}
.muted{color:var(--muted);font-size:12px}
.body{padding:12px 14px 14px}
.row{display:flex;gap:8px;align-items:center}
.flex{display:flex;gap:8px;align-items:center}
.right{margin-left:auto}
.sep{height:1px;background:rgba(255,255,255,.08);margin:10px 0}
.list{display:flex;flex-direction:column;gap:10px}
.helper{color:var(--muted);font-size:12px}

.input,.select,.textarea{width:100%;background:#0b0c12;border:1px solid rgba(255,255,255,.12);color:var(--text);border-radius:10px;padding:8px 10px;outline:none}
.input:focus,.select:focus,.textarea:focus{box-shadow:0 0 0 2px rgba(122,162,255,.35)}
.textarea{min-height:100px;resize:vertical}

.btn{background:linear-gradient(135deg,rgba(122,162,255,.18),rgba(88,245,165,.18));border:1px solid rgba(255,255,255,.12);padding:8px 12px;border-radius:10px;color:var(--text);cursor:pointer}
.btn:hover{filter:brightness(1.05)}
.btn-ghost{background:transparent;border:1px solid rgba(255,255,255,.12)}
.btn-accent{background:linear-gradient(135deg,rgba(110,231,183,.25),rgba(122,162,255,.25))}
.btn-danger{background:linear-gradient(135deg,rgba(239,68,68,.18),rgba(239,68,68,.28));border-color:rgba(239,68,68,.45)}

.pill{display:inline-block;padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);font-size:12px}
.wrap h4{margin:0}

.album-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.thumb-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:10px}
@media (max-width:1200px){ .thumb-grid{grid-template-columns:repeat(4,1fr)} }
@media (max-width:800px){ .grid{grid-template-columns:1fr} .thumb-grid{grid-template-columns:repeat(3,1fr)} }

.thumb{position:relative;background:#0b0c12;border:1px solid rgba(255,255,255,.08);border-radius:10px;overflow:hidden}
.thumb img{display:block;width:100%;height:140px;object-fit:cover}
.thumb .cap{display:flex;align-items:center;justify-content:space-between;padding:6px 8px;font-size:12px}
.ck{position:absolute;top:6px;left:6px;background:rgba(0,0,0,.55);border-radius:6px;padding:4px}
.badge{padding:2px 6px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.07);font-size:11px}

.log-item{padding:10px;border:1px dashed rgba(255,255,255,.16);border-radius:10px}
`
  });

  // ---------- IndexedDB ----------
  const DB_NAME = 'fitknow_db';
  const DB_VER = 3;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = (e) => {
        const db = req.result;

        // logs
        if (!db.objectStoreNames.contains('logs')) {
          const s = db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
          s.createIndex('ts', 'ts');
        }

        // albums
        if (!db.objectStoreNames.contains('albums')) {
          const s = db.createObjectStore('albums', { keyPath: 'id', autoIncrement: true });
          s.createIndex('name', 'name', { unique: true });
        }

        // photos
        if (!db.objectStoreNames.contains('photos')) {
          const s = db.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
          s.createIndex('albumId', 'albumId');
          s.createIndex('trash', 'trash');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // ---- DB helpers
  async function addLog(log) {
    const db = await openDB();
    const tx = db.transaction('logs', 'readwrite');
    return new Promise((res, rej) => {
      tx.objectStore('logs').add(log).onsuccess = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }
  async function listLogs() {
    const db = await openDB();
    const tx = db.transaction('logs', 'readonly');
    return new Promise((res, rej) => {
      const out = [];
      tx.objectStore('logs').openCursor(null, 'prev').onsuccess = (e) => {
        const c = e.target.result;
        if (c) { out.push(c.value); c.continue(); } else res(out);
      };
      tx.onerror = () => rej(tx.error);
    });
  }
  async function delLog(id) {
    const db = await openDB();
    const tx = db.transaction('logs', 'readwrite');
    return new Promise((res, rej) => {
      tx.objectStore('logs').delete(Number(id)).onsuccess = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  // albums
  async function listAlbums() {
    const db = await openDB();
    const tx = db.transaction('albums', 'readonly');
    return new Promise((res, rej) => {
      const out = [];
      tx.objectStore('albums').openCursor().onsuccess = (e) => {
        const c = e.target.result;
        if (c) { out.push(c.value); c.continue(); } else res(out);
      };
      tx.onerror = () => rej(tx.error);
    });
  }
  async function getAlbum(id) {
    const db = await openDB();
    const tx = db.transaction('albums', 'readonly');
    return new Promise((res, rej) => {
      tx.objectStore('albums').get(Number(id)).onsuccess = (e) => res(e.target.result || null);
      tx.onerror = () => rej(tx.error);
    });
  }
  async function upsertAlbum(album) {
    const db = await openDB();
    const tx = db.transaction('albums', 'readwrite');
    const store = tx.objectStore('albums');

    // 关键：规范化 id，避免 DataError
    if (Object.prototype.hasOwnProperty.call(album, 'id')) {
      const n = Number(album.id);
      if (Number.isFinite(n)) album.id = n;
      else delete album.id; // 新建交给 autoIncrement
    }

    return new Promise((res, rej) => {
      store.put(album).onsuccess = (e) => res(e.target.result);
      tx.onerror = () => rej(tx.error);
    });
  }
  async function removeAlbum(id) {
    // 同时删除其下所有照片
    const db = await openDB();
    const tx = db.transaction(['albums', 'photos'], 'readwrite');
    const pStore = tx.objectStore('photos');

    const idx = pStore.index('albumId');
    const cursorReq = idx.openCursor(IDBKeyRange.only(Number(id)));
    cursorReq.onsuccess = (e) => {
      const c = e.target.result;
      if (c) { pStore.delete(c.primaryKey); c.continue(); }
    };
    await new Promise((res, rej) => { cursorReq.onerror = () => rej(cursorReq.error); cursorReq.onsuccess && tx.oncomplete === null && (tx.oncomplete = () => res()); });

    return new Promise((res, rej) => {
      tx.objectStore('albums').delete(Number(id)).onsuccess = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  // photos
  async function addPhoto(rec) {
    const db = await openDB();
    const tx = db.transaction('photos', 'readwrite');
    return new Promise((res, rej) => {
      tx.objectStore('photos').add(rec).onsuccess = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }
  async function updatePhoto(rec) {
    const db = await openDB();
    const tx = db.transaction('photos', 'readwrite');
    return new Promise((res, rej) => {
      tx.objectStore('photos').put(rec).onsuccess = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }
  async function deletePhoto(id) {
    const db = await openDB();
    const tx = db.transaction('photos', 'readwrite');
    return new Promise((res, rej) => {
      tx.objectStore('photos').delete(Number(id)).onsuccess = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }
  async function listPhotosByAlbum(albumId, inTrash = false) {
    const db = await openDB();
    const tx = db.transaction('photos', 'readonly');
    const store = tx.objectStore('photos');
    const idx = store.index('albumId');
    const key = Number(albumId);
    const out = [];
    return new Promise((res, rej) => {
      if (!Number.isFinite(key)) { res([]); return; }
      idx.openCursor(IDBKeyRange.only(key)).onsuccess = (e) => {
        const c = e.target.result;
        if (c) {
          const v = c.value;
          if (!!v.trash === !!inTrash) out.push(v);
          c.continue();
        } else res(out);
      };
      tx.onerror = () => rej(tx.error);
    });
  }

  // ---------- 加密 ----------
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  async function deriveKey(password, salt) {
    const baseKey = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }
  async function encryptBytes(key, bytes) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
    return { iv, ct: new Uint8Array(ct) };
  }
  async function decryptBytes(key, iv, ct) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new Uint8Array(pt);
  }

  // 用于密码校验的 verifier：随机 16 字节明文 -> 加密并存 album.verifier
  async function makeVerifier(key) {
    const marker = crypto.getRandomValues(new Uint8Array(16));
    const { iv, ct } = await encryptBytes(key, marker);
    return { iv, data: ct };
  }
  async function verifyPassword(key, verifier) {
    try {
      await decryptBytes(key, new Uint8Array(verifier.iv), new Uint8Array(verifier.data));
      return true;
    } catch {
      return false;
    }
  }

  // ---------- 视图 ----------
  const app = h('div', { class: 'wrap' });

  // 顶部提示
  const tabs = h('div', { class: 'row', style: 'margin-bottom:12px' },
    h('span', { class: 'pill' }, '🏋️‍♀️ 训练笔记'),
    h('span', { class: 'pill' }, '🖼️ 相册（可加密）'),
    h('span', { class: 'right helper' }, '数据保存在本机浏览器，可导出 JSON 备份。')
  );

  // 左：训练笔记
  const noteCard = h('div', { class: 'card' },
    h('div', { class: 'card-hd' },
      h('div', { class: 'title' }, '训练笔记'),
      h('div', { class: 'muted' }, '记录每次训练、动作与感受')
    ),
    h('div', { class: 'body' },
      h('div', { class: 'row' },
        h('input', { class: 'input', id: 'date', type: 'date' }),
        h('input', { class: 'input', id: 'session', placeholder: '本次训练主题（如：胸 + 三头）' }),
        (() => {
          const sel = h('select', { class: 'select', id: 'rating', title: '主观强度 RPE' },
            h('option', { value: '' }, '强度（RPE）'),
          );
          for (let i = 1; i <= 10; i++) sel.append(h('option', { value: String(i) }, String(i)));
          return sel;
        })()
      ),
      h('div', { class: 'row' },
        h('textarea', {
          class: 'textarea',
          id: 'exercises',
          placeholder: '动作清单（每行一个：动作 | 组数x次数 | 重量）\n例：卧推 | 4x6 | 60kg'
        })
      ),
      h('div', { class: 'row' },
        h('textarea', { class: 'textarea', id: 'notes', placeholder: '主观感受、疼痛与技术要点…' })
      ),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-accent', id: 'saveLog' }, '保存记录'),
        h('button', { class: 'btn btn-ghost', id: 'exportLogs' }, '导出 JSON')
      ),
      h('div', { class: 'sep' }),
      h('div', { class: 'list', id: 'logList' }, h('div', { class: 'helper' }, '暂无记录'))
    )
  );

  // 右：相册
  const albumCard = h('div', { class: 'card' },
    h('div', { class: 'card-hd' },
      h('div', { class: 'title' }, '健身相册（可加密）'),
      h('div', { class: 'muted' }, '创建相册并选择是否加密')
    ),
    h('div', { class: 'body' },
      h('div', { class: 'row' },
        h('input', { class: 'input', id: 'albumName', placeholder: '相册名称（如：增肌期 2025-Q1）' }),
        h('input', { class: 'input', id: 'albumPassword', placeholder: '相册密码（可留空为公开）', type: 'password' }),
        h('button', { class: 'btn btn-accent', id: 'createAlbum' }, '创建/更新相册')
      ),
      h('div', { id: 'albumList', class: 'list' }, h('div', { class: 'helper' }, '暂无相册'))
    )
  );

  const grid = h('div', { class: 'grid' }, noteCard, albumCard);
  app.append(tabs, grid);
  root.append(style, app);

  // ---------- 笔记渲染 ----------
  function renderLogs(items) {
    const box = root.getElementById('logList');
    box.innerHTML = '';
    if (!items.length) { box.append(h('div', { class: 'helper' }, '暂无记录')); return; }
    items.forEach(it => {
      const head = `${it.date || ''} · ${it.session || '未命名'} · RPE ${it.rating || '-'}`;
      const ex = (it.exercises || '').split(/\n+/).filter(Boolean).map(line => `• ${line}`).join('\n');
      const el = h('div', { class: 'log-item' },
        h('div', { class: 'flex' }, h('h4', {}, head), h('span', { class: 'right helper' }, `#${it.id}`)),
        h('pre', { class: 'helper', style: 'white-space:pre-wrap; margin:6px 0' }, ex),
        h('div', { class: 'helper', style: 'white-space:pre-wrap' }, it.notes || ''),
        h('div', { class: 'row', style: 'margin-top:8px' },
          h('button', { class: 'btn btn-danger', onclick: async () => { await delLog(it.id); loadLogs(); } }, '删除')
        )
      );
      box.append(el);
    });
  }
  async function loadLogs() { renderLogs(await listLogs()); }
  async function onSaveLog() {
    const v = (id) => root.getElementById(id).value.trim();
    const log = {
      date: v('date') || new Date().toISOString().slice(0, 10),
      session: v('session'),
      rating: v('rating'),
      exercises: v('exercises'),
      notes: v('notes'),
      ts: Date.now()
    };
    await addLog(log);
    loadLogs();
    ['session', 'rating', 'exercises', 'notes'].forEach(id => root.getElementById(id).value = '');
  }
  async function onExportLogs() {
    const data = await listLogs();
    const blob = new Blob([JSON.stringify({ type: 'fitknow-logs', version: 1, data }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'fitknow-logs.json'; a.click();
    URL.revokeObjectURL(url);
  }
  root.getElementById('saveLog').onclick = onSaveLog;
  root.getElementById('exportLogs').onclick = onExportLogs;

  // ---------- 相册 UI & 逻辑 ----------
  const state = {
    currentAlbum: null,
    viewingTrash: false,
    selected: new Set(),
    cryptoKey: null
  };

  function albumItem(a) {
    const badge = h('span', { class: 'badge' }, a.locked ? '加密' : '公开');
    const row = h('div', { class: 'flex', style: 'gap:10px;align-items:center' },
      h('div', {}, `${a.name}`),
      h('span', { class: 'helper' }, new Date(a.createdAt || a.ts || Date.now()).toLocaleString()),
      badge,
      h('span', { class: 'right' }),
      h('button', {
        class: 'btn', onclick: async () => {
          await openAlbumView(a);
        }
      }, '打开'),
      h('button', {
        class: 'btn btn-danger', onclick: async () => {
          if (!confirm(`确定删除相册「${a.name}」？此操作会删除其中所有照片且不可恢复。`)) return;
          await removeAlbum(a.id);
          renderAlbums();
          // 清空右侧相册视图（如果开着）
          albumPanel.innerHTML = '';
        }
      }, '删除相册')
    );
    return h('div', { class: 'card', style: 'padding:8px' }, row);
  }

  async function renderAlbums() {
    const box = root.getElementById('albumList');
    box.innerHTML = '';
    const items = await listAlbums();
    if (!items.length) { box.append(h('div', { class: 'helper' }, '暂无相册')); return; }
    items.forEach(a => box.append(albumItem(a)));
  }

  async function onCreateAlbum() {
    const name = root.getElementById('albumName').value.trim();
    const pwd = root.getElementById('albumPassword').value;

    if (!name) { alert('请填写相册名称'); return; }
    const all = await listAlbums();
    const exist = all.find(a => a.name === name);

    let album;
    if (exist) {
      // 更新
      album = {
        id: Number(exist.id),
        name: exist.name,
        locked: !!pwd,
        createdAt: exist.createdAt || exist.ts || Date.now(),
        salt: exist.salt || null,
        verifier: exist.verifier || null
      };
    } else {
      // 新建
      album = {
        name,
        locked: !!pwd,
        createdAt: Date.now()
      };
    }

    // 若需要加密而相册还没有 salt / verifier，则生成
    if (album.locked) {
      const salt = album.salt ? new Uint8Array(album.salt) : crypto.getRandomValues(new Uint8Array(16));
      const key = await deriveKey(pwd, salt);
      if (!album.salt) album.salt = salt;
      if (!album.verifier) album.verifier = await makeVerifier(key);
    } else {
      // 公开相册去掉密码材料
      album.salt = null;
      album.verifier = null;
    }

    await upsertAlbum(album);

    root.getElementById('albumName').value = '';
    root.getElementById('albumPassword').value = '';
    renderAlbums();
  }
  root.getElementById('createAlbum').onclick = onCreateAlbum;

  // 右侧打开后的相册面板
  const albumPanel = h('div', { class: 'card', style: 'margin-top:12px;grid-column:1/-1' });
  grid.append(albumPanel);

  async function openAlbumView(album) {
    state.currentAlbum = album;
    state.viewingTrash = false;
    state.selected.clear();
    state.cryptoKey = null;

    // 如果加密，需要输入密码并校验
    if (album.locked) {
      const pwd = prompt(`相册「${album.name}」已加密，请输入密码：`);
      if (pwd == null) return; // 取消
      const salt = new Uint8Array(album.salt);
      const key = await deriveKey(pwd, salt);
      const ok = await verifyPassword(key, album.verifier);
      if (!ok) { alert('密码错误'); return; }
      state.cryptoKey = key;
    }

    renderAlbumPanel();
    await renderPhotos();
  }

  function renderAlbumPanel() {
    const a = state.currentAlbum;
    if (!a) { albumPanel.innerHTML = ''; return; }

    albumPanel.innerHTML = '';
    const bar = h('div', { class: 'body' },
      h('div', { class: 'album-bar' },
        h('button', { class: 'btn btn-ghost', onclick: () => { state.currentAlbum = null; albumPanel.innerHTML = ''; } }, '← 返回'),
        h('span', {}, '相册：'),
        h('strong', {}, a.name),
        h('span', { class: 'badge' }, a.locked ? '加密' : '公开'),
        h('span', { class: 'right' }),
        h('button', {
          class: 'btn', onclick: async () => {
            fileInput.value = ''; fileInput.click();
          }
        }, '上传照片'),
        h('button', {
          class: 'btn', onclick: async () => {
            selectInput.value = ''; selectInput.click();
          }
        }, '选择照片'),
        h('button', {
          class: 'btn', onclick: () => {
            // 全选/取消全选
            const gridEl = root.getElementById('thumbGrid');
            if (!gridEl) return;
            const ids = Array.from(gridEl.querySelectorAll('[data-id]')).map(d => Number(d.getAttribute('data-id')));
            const allSelected = ids.every(id => state.selected.has(id));
            if (allSelected) state.selected.clear();
            else ids.forEach(id => state.selected.add(id));
            renderPhotos();
          }
        }, '全选/取消全选'),
      ),
      h('div', { class: 'album-bar', style: 'margin-top:8px' },
        h('button', {
          class: 'btn btn-ghost', onclick: async () => {
            state.viewingTrash = !state.viewingTrash;
            state.selected.clear();
            await renderPhotos();
          }
        }, state.viewingTrash ? '返回相册' : '查看回收站'),
        h('button', {
          class: 'btn btn-danger', onclick: async () => {
            // 批量删除（移动到回收站或从回收站彻底删除）
            const ids = Array.from(state.selected);
            if (!ids.length) { alert('请先选择照片'); return; }
            if (!state.viewingTrash) {
              // 移入回收站
              const list = await listPhotosByAlbum(a.id, false);
              const map = new Map(list.map(p => [p.id, p]));
              for (const id of ids) {
                const p = map.get(id);
                if (p) { p.trash = true; await updatePhoto(p); }
              }
            } else {
              // 回收站中彻底删除
              if (!confirm('彻底删除所选照片？此操作不可恢复')) return;
              for (const id of ids) await deletePhoto(id);
            }
            state.selected.clear();
            await renderPhotos();
          }
        }, state.viewingTrash ? '彻底删除（回收站）' : '批量删除'),
        h('button', {
          class: 'btn', onclick: async () => {
            // 恢复所选（仅回收站模式）
            if (!state.viewingTrash) { alert('请切换到回收站再进行恢复'); return; }
            const ids = Array.from(state.selected);
            if (!ids.length) { alert('请先选择照片'); return; }
            const list = await listPhotosByAlbum(a.id, true);
            const map = new Map(list.map(p => [p.id, p]));
            for (const id of ids) {
              const p = map.get(id);
              if (p) { p.trash = false; await updatePhoto(p); }
            }
            state.selected.clear();
            await renderPhotos();
          }
        }, '恢复所选')
      )
    );

    const gridBox = h('div', { class: 'body' },
      h('div', { id: 'thumbGrid', class: 'thumb-grid' })
    );

    albumPanel.append(bar, gridBox);
  }

  async function renderPhotos() {
    const a = state.currentAlbum;
    if (!a) return;
    const gridEl = root.getElementById('thumbGrid');
    gridEl.innerHTML = '';
    const list = await listPhotosByAlbum(a.id, state.viewingTrash);

    if (!list.length) {
      gridEl.append(h('div', { class: 'helper', style: 'grid-column:1/-1' }, state.viewingTrash ? '回收站为空' : '打开一个相册以管理照片'));
      return;
    }

    for (const p of list) {
      let blobUrl = '';
      try {
        if (p.locked) {
          // 解密再显示
          if (!state.cryptoKey) throw new Error('no key');
          const bytes = await decryptBytes(state.cryptoKey, new Uint8Array(p.iv), new Uint8Array(p.data));
          blobUrl = URL.createObjectURL(new Blob([bytes], { type: p.type || 'image/jpeg' }));
        } else {
          blobUrl = URL.createObjectURL(new Blob([p.data], { type: p.type || 'image/jpeg' }));
        }
      } catch (e) {
        console.warn('解密失败或数据损坏', e);
      }

      const ck = h('input', {
        type: 'checkbox',
        onchange: (e) => {
          if (e.target.checked) state.selected.add(p.id);
          else state.selected.delete(p.id);
        }
      });
      if (state.selected.has(p.id)) ck.checked = true;

      const item = h('div', { class: 'thumb', 'data-id': String(p.id) },
        h('div', { class: 'ck' }, ck),
        blobUrl
          ? h('img', { src: blobUrl, alt: p.name || '' })
          : h('div', { style: 'height:140px;display:flex;align-items:center;justify-content:center', class: 'helper' }, '无法预览'),
        h('div', { class: 'cap' },
          h('span', { class: 'helper' }, p.name || ''),
          h('span', { class: 'badge' }, p.trash ? '回收站' : (p.locked ? '加密' : '公开'))
        )
      );
      gridEl.append(item);
    }
  }

  // 文件选择/上传
  const fileInput = h('input', { type: 'file', accept: 'image/*', multiple: true, style: 'display:none' });
  const selectInput = h('input', { type: 'file', accept: 'image/*', multiple: true, style: 'display:none' });
  root.append(fileInput, selectInput);

  async function handleFiles(files) {
    const a = state.currentAlbum;
    if (!a) return;
    const useEnc = !!a.locked;
    if (useEnc && !state.cryptoKey) { alert('未解锁相册，无法加密保存'); return; }

    for (const file of files) {
      const buf = new Uint8Array(await file.arrayBuffer());
      let rec;
      if (useEnc) {
        const { iv, ct } = await encryptBytes(state.cryptoKey, buf);
        rec = {
          albumId: Number(a.id),
          name: file.name,
          type: file.type,
          locked: true,
          trash: false,
          ts: Date.now(),
          iv: iv,
          data: ct
        };
      } else {
        rec = {
          albumId: Number(a.id),
          name: file.name,
          type: file.type,
          locked: false,
          trash: false,
          ts: Date.now(),
          data: buf
        };
      }
      await addPhoto(rec);
    }
    await renderPhotos();
  }

  fileInput.onchange = async (e) => {
    if (e.target.files && e.target.files.length) await handleFiles(e.target.files);
    fileInput.value = '';
  };
  selectInput.onchange = async (e) => {
    if (e.target.files && e.target.files.length) await handleFiles(e.target.files);
    selectInput.value = '';
  };

  // ---------- 启动 ----------
  openDB().then(() => { loadLogs(); renderAlbums(); });
})();
