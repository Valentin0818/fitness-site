// assets/fit-extensions.js
(function () {
  /*** ─────────────────────────────────────────────────
   *  FitKnow 扩展（训练笔记 + 可加密相册）
   *  - IndexedDB 版本：v5（幂等升级）
   *  - 修复：IDBKeyRange.only 传入无效键的 DataError
   *  - 新增：相册口令“哨兵”校验，错误口令不允许打开
   *  - 回收站、批量删除/恢复、清空回收站
   *  ───────────────────────────────────────────────── */

  // =========== 小工具 ===========
  const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") el[k] = v;
      else el.setAttribute(k, v);
    }
    for (const c of children) {
      if (c == null) continue;
      el.append(c.nodeType ? c : document.createTextNode(c));
    }
    return el;
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // =========== Shadow 根 ===========
  const mount = document.getElementById("fit-extensions");
  if (!mount) {
    console.warn("[FitKnow] 没找到 #fit-extensions，扩展未初始化");
    return;
  }
  const root = mount.attachShadow({ mode: "open" });

  // =========== 样式 ===========
  root.append(
    h("style", {
      html: `
    :host{ all:initial }
    :root{ --bg:#0e0f13; --card:#151823; --muted:#9aa3b2; --accent:#6ee7b7; --text:#e6e9ef; --danger:#ef4444; --ring:rgba(110,231,183,.25); --shadow:0 10px 30px rgba(0,0,0,.25); --radius:14px; }
    *{ box-sizing:border-box; }
    .wrap{ color:var(--text); font:14px/1.5 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, PingFang SC, Hiragino Sans GB, Noto Sans CJK, Microsoft YaHei, sans-serif; }
    .grid{ display:grid; grid-template-columns: 1fr 1fr; gap:16px; }
    .card{ background:var(--card); border:1px solid rgba(255,255,255,.06); border-radius:var(--radius); box-shadow:var(--shadow); overflow:hidden; }
    .card-hd{ display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-bottom:1px solid rgba(255,255,255,.06) }
    .title{ font-weight:700 }
    .muted{ color:var(--muted) }
    .body{ padding:12px 14px }
    .row{ display:flex; gap:10px; align-items:center; flex-wrap:wrap }
    .input,.select,.textarea{ width:100%; background:#0a0c12; border:1px solid rgba(255,255,255,.08); color:var(--text); border-radius:10px; padding:8px 10px; outline:none }
    .textarea{ min-height:96px; resize:vertical }
    .select{ padding:6px 10px }
    .btn{ background:#0b0f16; border:1px solid rgba(255,255,255,.12); color:var(--text); padding:8px 12px; border-radius:10px; cursor:pointer }
    .btn:hover{ filter:brightness(1.06) }
    .btn-accent{ background:linear-gradient(135deg, rgba(110,231,183,.18), rgba(110,231,183,.10)); border-color:rgba(110,231,183,.45) }
    .btn-danger{ background:linear-gradient(135deg, rgba(239,68,68,.18), rgba(239,68,68,.10)); border-color:rgba(239,68,68,.45) }
    .btn-ghost{ background:#0b0f16; border-color:rgba(255,255,255,.12) }
    .sep{ height:1px; background:rgba(255,255,255,.06); margin:10px 0 }
    .list{ display:flex; flex-direction:column; gap:10px }
    .log-item{ background:#0b0f16; border:1px solid rgba(255,255,255,.06); border-radius:10px; padding:10px }
    .flex{ display:flex; align-items:center; gap:10px }
    .right{ margin-left:auto }
    .helper{ color:var(--muted) }
    .pill{ display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border-radius:999px; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12) }
    .thumbs{ display:grid; grid-template-columns: repeat(auto-fill, minmax(120px,1fr)); gap:10px }
    .thumb{ position:relative; background:#0b0f16; border:1px solid rgba(255,255,255,.08); border-radius:10px; overflow:hidden }
    .thumb img{ width:100%; height:100%; object-fit:cover; display:block }
    .thumb .mask{ position:absolute; inset:0; display:flex; gap:6px; align-items:flex-start; justify-content:flex-end; padding:6px; background:linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,0)); opacity:0; transition:opacity .2s }
    .thumb:hover .mask{ opacity:1 }
    .chk{ appearance:none; width:18px; height:18px; border:1px solid rgba(255,255,255,.3); border-radius:4px; background:#0b0f16; display:inline-block; }
    .chk:checked{ background:var(--accent); border-color:var(--accent) }
    .toolbar{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:8px }
    .tag{ font-size:12px; padding:2px 6px; border-radius:8px; border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.06) }
    @media (max-width:980px){ .grid{ grid-template-columns:1fr } }
  `,
    })
  );

  // =========== 全局状态 ===========
  const state = {
    currentAlbumId: null, // 打开的相册 id
    viewingTrash: false, // 是否查看回收站
    selectedIds: new Set(), // 勾选的照片
    albumSessions: new Map(), // albumId -> { key, salt } 已通过口令校验的会话
  };

  // =========== Crypto ===========
  async function deriveKey(password, saltBytes) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: saltBytes,
        iterations: 120000,
        hash: "SHA-256",
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }
  const hex = (buf) =>
    [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const dehex = (str) =>
    new Uint8Array(str.match(/.{1,2}/g).map((h) => parseInt(h, 16)));

  async function aesEncrypt(key, data) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const out = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
    return { iv: hex(iv), ct: hex(out) };
  }
  async function aesDecrypt(key, ivHex, ctHex) {
    const iv = dehex(ivHex);
    const data = dehex(ctHex);
    return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  }

  // =========== IndexedDB ===========
  const DB_NAME = "fitknow-local";
  const DB_VER = 5;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        // logs
        if (!db.objectStoreNames.contains("logs")) {
          const s = db.createObjectStore("logs", { keyPath: "id", autoIncrement: true });
          s.createIndex("ts", "ts");
        }
        // albums
        if (!db.objectStoreNames.contains("albums")) {
          const s = db.createObjectStore("albums", { keyPath: "id", autoIncrement: true });
          s.createIndex("name", "name", { unique: true });
        }
        // photos
        if (!db.objectStoreNames.contains("photos")) {
          const s = db.createObjectStore("photos", { keyPath: "id", autoIncrement: true });
          s.createIndex("albumId", "albumId");
          s.createIndex("trashed", "trashed");
          s.createIndex("ts", "ts");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // ======= 日志 CRUD =======
  async function addLog(data) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("logs", "readwrite");
      tx.objectStore("logs").add({ ...data, ts: Date.now() });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
  async function listLogs() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const out = [];
      const tx = db.transaction("logs", "readonly");
      tx.objectStore("logs").openCursor(null, "prev").onsuccess = (e) => {
        const cur = e.target.result;
        if (cur) {
          out.push(cur.value);
          cur.continue();
        } else resolve(out);
      };
      tx.onerror = () => reject(tx.error);
    });
  }
  async function delLog(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("logs", "readwrite");
      tx.objectStore("logs").delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  // ======= 相册 CRUD / 口令哨兵 =======
  async function upsertAlbum({ id, name, locked, sentinel }) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("albums", "readwrite");
      const store = tx.objectStore("albums");
      const now = Date.now();
      const data = { id, name, locked: !!locked, sentinel: sentinel || null, updatedAt: now };
      if (!id) data.createdAt = now;
      const req = store.put(data);
      req.onsuccess = () => resolve(req.result || id);
      tx.onerror = () => reject(tx.error);
    });
  }
  async function deleteAlbum(albumId) {
    if (albumId == null) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["albums", "photos"], "readwrite");
      tx.objectStore("albums").delete(albumId);
      // 同时删除该相册所有照片 & 回收站照片
      const idx = tx.objectStore("photos").index("albumId");
      const range = IDBKeyRange.only(albumId);
      idx.openCursor(range).onsuccess = (e) => {
        const cur = e.target.result;
        if (cur) {
          cur.delete();
          cur.continue();
        }
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
  async function listAlbums() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const out = [];
      const tx = db.transaction("albums", "readonly");
      tx.objectStore("albums").openCursor(null, "prev").onsuccess = (e) => {
        const cur = e.target.result;
        if (cur) {
          out.push(cur.value);
          cur.continue();
        } else resolve(out);
      };
      tx.onerror = () => reject(tx.error);
    });
  }
  async function getAlbumById(id) {
    if (id == null) return null;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("albums", "readonly");
      const req = tx.objectStore("albums").get(id);
      req.onsuccess = () => resolve(req.result || null);
      tx.onerror = () => reject(tx.error);
    });
  }

  // ======= 照片 CRUD =======
  async function addPhoto(row) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("photos", "readwrite");
      tx.objectStore("photos").add({ ...row, ts: Date.now(), trashed: 0 });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
  async function updatePhoto(id, patch) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("photos", "readwrite");
      const store = tx.objectStore("photos");
      store.get(id).onsuccess = (e) => {
        const exist = e.target.result;
        if (!exist) return resolve();
        store.put({ ...exist, ...patch });
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
  async function listPhotosByAlbum(albumId, { trashed = 0 } = {}) {
    // 关键保护：albumId 校验，避免 IDBKeyRange.only 传入无效键
    if (albumId == null || !Number.isFinite(albumId)) return [];
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const out = [];
      const tx = db.transaction("photos", "readonly");
      const store = tx.objectStore("photos");
      const idx = store.index("albumId");
      const range = IDBKeyRange.only(albumId);
      idx.openCursor(range, "prev").onsuccess = (e) => {
        const cur = e.target.result;
        if (cur) {
          const row = cur.value;
          if ((trashed ? 1 : 0) === (row.trashed ? 1 : 0)) out.push(row);
          cur.continue();
        } else resolve(out);
      };
      tx.onerror = () => reject(tx.error);
    });
  }
  async function bulkTrashed(ids, toTrash = true) {
    if (!ids.length) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("photos", "readwrite");
      const store = tx.objectStore("photos");
      ids.forEach((id) => {
        store.get(id).onsuccess = (e) => {
          const v = e.target.result;
          if (v) store.put({ ...v, trashed: toTrash ? 1 : 0 });
        };
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
  async function bulkDelete(ids) {
    if (!ids.length) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("photos", "readwrite");
      const store = tx.objectStore("photos");
      ids.forEach((id) => store.delete(id));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  // ======= 口令哨兵 =======
  async function writeAlbumSentinel(albumId, password) {
    if (albumId == null) return null;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(password, salt);
    const enc = new TextEncoder().encode("fitknow-sentinel");
    const { iv, ct } = await aesEncrypt(key, enc);
    return { salt: hex(salt), iv, ct };
  }
  async function verifyAlbumPassword(album, password) {
    try {
      const salt = dehex(album?.sentinel?.salt || "");
      if (!salt?.length) return false;
      const key = await deriveKey(password, salt);
      const buf = await aesDecrypt(key, album.sentinel.iv, album.sentinel.ct);
      const ok = new TextDecoder().decode(buf) === "fitknow-sentinel";
      if (ok) state.albumSessions.set(album.id, { key, salt: album.sentinel.salt });
      return ok;
    } catch {
      return false;
    }
  }
  function hasAlbumSession(albumId) {
    return state.albumSessions.has(albumId);
  }
  function getAlbumSession(albumId) {
    return state.albumSessions.get(albumId) || null;
  }

  // ======= 视图：训练笔记 =======
  const noteCard = h(
    "div",
    { class: "card" },
    h(
      "div",
      { class: "card-hd" },
      h("div", { class: "title" }, "训练笔记"),
      h("div", { class: "muted" }, "记录每次训练、动作与感受")
    ),
    h(
      "div",
      { class: "body" },
      h(
        "div",
        { class: "row" },
        h("input", { id: "date", class: "input", type: "date" }),
        h("input", {
          id: "session",
          class: "input",
          placeholder: "本次训练主题（如：胸 + 三头）",
        }),
        h(
          "select",
          { id: "rating", class: "select", title: "主观强度 RPE" },
          h("option", { value: "" }, "强度（RPE）"),
          ...Array.from({ length: 10 }, (_, i) =>
            h("option", { value: String(i + 1) }, String(i + 1))
          )
        )
      ),
      h(
        "div",
        { class: "row" },
        h("textarea", {
          id: "exercises",
          class: "textarea",
          placeholder:
            "动作清单（每行一个：动作 | 组数x次数 | 重量）\n例：卧推 | 4x6 | 60kg",
        })
      ),
      h(
        "div",
        { class: "row" },
        h("textarea", {
          id: "notes",
          class: "textarea",
          placeholder: "主观感受、疼痛与技术要点…",
        })
      ),
      h(
        "div",
        { class: "row" },
        h("button", { id: "saveLog", class: "btn btn-accent" }, "保存记录"),
        h("button", { id: "exportLogs", class: "btn btn-ghost" }, "导出 JSON")
      ),
      h("div", { class: "sep" }),
      h("div", { id: "logList", class: "list" }, h("div", { class: "helper" }, "暂无记录"))
    )
  );

  function renderLogs(items) {
    const box = root.getElementById("logList");
    box.innerHTML = "";
    if (!items.length) {
      box.append(h("div", { class: "helper" }, "暂无记录"));
      return;
    }
    items.forEach((it) => {
      const head = `${it.date || ""} · ${it.session || "未命名"} · RPE ${it.rating || "-"}`;
      const ex = (it.exercises || "")
        .split(/\n+/)
        .filter(Boolean)
        .map((l) => `• ${l}`)
        .join("\n");
      const el = h(
        "div",
        { class: "log-item" },
        h("div", { class: "flex" }, h("h4", {}, head), h("span", { class: "right helper" }, `#${it.id}`)),
        h("pre", { class: "helper", style: "white-space:pre-wrap; margin:6px 0" }, ex),
        h("div", { class: "helper", style: "white-space:pre-wrap" }, it.notes || ""),
        h(
          "div",
          { class: "row", style: "margin-top:8px" },
          h(
            "button",
            {
              class: "btn btn-danger",
              onclick: async () => {
                await delLog(it.id);
                loadLogs();
              },
            },
            "删除"
          )
        )
      );
      box.append(el);
    });
  }
  async function loadLogs() {
    renderLogs(await listLogs());
  }
  async function onSaveLog() {
    const v = (id) => root.getElementById(id).value.trim();
    const log = {
      date: v("date") || new Date().toISOString().slice(0, 10),
      session: v("session"),
      rating: v("rating"),
      exercises: v("exercises"),
      notes: v("notes"),
    };
    await addLog(log);
    loadLogs();
    ["session", "rating", "exercises", "notes"].forEach((id) => (root.getElementById(id).value = ""));
  }
  async function onExportLogs() {
    const data = await listLogs();
    const blob = new Blob([JSON.stringify({ type: "fitknow-logs", version: 1, data }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: "fitknow-logs.json" });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ======= 视图：相册 =======
  const albumCard = h(
    "div",
    { class: "card" },
    h(
      "div",
      { class: "card-hd" },
      h("div", { class: "title" }, "健身相册（可加密）"),
      h("div", { class: "muted" }, "创建相册并选择是否加密")
    ),
    h(
      "div",
      { class: "body" },
      // 创建/更新相册
      h(
        "div",
        { class: "row" },
        h("input", {
          id: "albumName",
          class: "input",
          placeholder: "相册名称（如：增肌期 2025-Q1）",
        }),
        h("input", {
          id: "albumPassword",
          class: "input",
          type: "password",
          placeholder: "相册密码（留空为公开）",
        }),
        h(
          "button",
          { id: "createAlbum", class: "btn btn-accent" },
          "创建/更新相册"
        )
      ),

      // 相册列表
      h("div", { id: "albumList", class: "list" }, h("div", { class: "helper" }, "暂无相册")),

      h("div", { class: "sep" }),

      // 打开后工具栏
      h(
        "div",
        { id: "albumToolbar", class: "toolbar", style: "display:none" },
        h("button", { id: "backAlbums", class: "btn" }, "← 返回"),
        h("span", { id: "albumInfo", class: "tag" }, "-"),
        h("span", { id: "lockFlag", class: "tag" }, "公开"),
        h("span", { class: "muted" }, "｜"),
        h("button", { id: "uploadBtn", class: "btn" }, "上传照片"),
        h("input", { id: "fileInput", type: "file", accept: "image/*", multiple: true, style: "display:none" }),
        h("button", { id: "pickBtn", class: "btn" }, "选择照片"),
        h("span", { class: "muted" }, "｜"),
        h("button", { id: "toggleSel", class: "btn" }, "全选/取消全选"),
        h("button", { id: "trashSel", class: "btn btn-danger" }, "批量删除"),
        h("button", { id: "restoreSel", class: "btn" }, "恢复所选"),
        h("button", { id: "purgeSel", class: "btn btn-danger" }, "彻底删除（回收站）"),
        h("span", { class: "muted" }, "｜"),
        h("button", { id: "toggleTrash", class: "btn" }, "查看回收站"),
        h("span", { class: "right" }),
        h("button", { id: "deleteAlbum", class: "btn btn-danger" }, "删除相册")
      ),

      // 照片网格
      h("div", { id: "albumGrid", class: "thumbs" })
    )
  );

  // 组装页面
  const app = h("div", { class: "wrap" }, h("div", { class: "grid" }, noteCard, albumCard));
  root.append(app);

  // ======= 相册 UI/逻辑 =======
  function getCurrentAlbumId() {
    return state.currentAlbumId != null && Number.isFinite(state.currentAlbumId)
      ? state.currentAlbumId
      : null;
  }

  async function renderAlbums() {
    const wrap = root.getElementById("albumList");
    wrap.innerHTML = "";
    const all = await listAlbums();
    if (!all.length) {
      wrap.append(h("div", { class: "helper" }, "暂无相册"));
      return;
    }
    all.forEach((a) => {
      const row = h(
        "div",
        { class: "log-item" },
        h(
          "div",
          { class: "flex" },
          h("strong", {}, a.name || "(未命名)"),
          h("span", { class: "tag" }, a.locked ? "加密" : "公开"),
          h("span", { class: "right helper" }, new Date(a.updatedAt || a.createdAt || Date.now()).toLocaleString())
        ),
        h(
          "div",
          { class: "row" },
          h(
            "button",
            {
              class: "btn btn-accent",
              onclick: async () => {
                await openAlbumFlow(a.id);
              },
            },
            "打开"
          ),
          h(
            "button",
            {
              class: "btn btn-danger",
              onclick: async () => {
                if (!confirm(`确定删除相册“${a.name}”及其所有照片？`)) return;
                await deleteAlbum(a.id);
                if (state.currentAlbumId === a.id) {
                  state.currentAlbumId = null;
                  state.selectedIds.clear();
                  showToolbar(false);
                }
                renderAlbums();
                renderPhotos(); // 清空右侧网格
              },
            },
            "删除相册"
          )
        )
      );
      wrap.append(row);
    });
  }

  function showToolbar(show) {
    root.getElementById("albumToolbar").style.display = show ? "" : "none";
  }

  async function openAlbumFlow(albumId) {
    const album = await getAlbumById(albumId);
    if (!album) return;
    // 加密相册需要先校验口令（若当前会话未通过）
    if (album.locked && !hasAlbumSession(album.id)) {
      const pwd = prompt(`相册「${album.name}」已加密，请输入口令：`);
      if (!pwd) return alert("已取消打开");
      const ok = await verifyAlbumPassword(album, pwd);
      if (!ok) return alert("口令错误，无法打开该相册。");
    }
    state.currentAlbumId = album.id;
    state.viewingTrash = false;
    state.selectedIds.clear();
    root.getElementById("albumInfo").textContent = `相册：${album.name}`;
    root.getElementById("lockFlag").textContent = album.locked ? "加密" : "公开";
    showToolbar(true);
    await renderPhotos();
  }

  async function renderPhotos() {
    const grid = root.getElementById("albumGrid");
    grid.innerHTML = "";
    const aid = getCurrentAlbumId();
    if (aid == null) {
      grid.append(h("div", { class: "helper" }, "打开一个相册以管理照片"));
      return;
    }
    const items = await listPhotosByAlbum(aid, { trashed: state.viewingTrash ? 1 : 0 });
    if (!items.length) {
      grid.append(h("div", { class: "helper" }, state.viewingTrash ? "回收站为空" : "暂无照片"));
      return;
    }
    const album = await getAlbumById(aid);
    const session = getAlbumSession(aid);

    for (const p of items) {
      let url = "";
      try {
        if (album.locked) {
          // 解密失败会抛错：错误口令可见
          const buf = await aesDecrypt(session.key, p.iv, p.data);
          url = URL.createObjectURL(new Blob([buf]));
        } else {
          url = URL.createObjectURL(new Blob([dehex(p.data)]));
        }
      } catch {
        // 口令错误/数据损坏
        const damaged = h(
          "div",
          { class: "thumb", style: "display:flex;align-items:center;justify-content:center;aspect-ratio:1/1" },
          h("div", { class: "helper" }, `无法解密 #${p.id}`)
        );
        grid.append(damaged);
        continue;
      }

      const box = h(
        "div",
        { class: "thumb" },
        h("img", { src: url, alt: p.name || "" }),
        h(
          "div",
          { class: "mask" },
          h("input", {
            type: "checkbox",
            class: "chk",
            onchange: (e) => {
              if (e.target.checked) state.selectedIds.add(p.id);
              else state.selectedIds.delete(p.id);
            },
          }),
          h(
            "button",
            {
              class: "btn btn-danger",
              onclick: async () => {
                if (!state.viewingTrash) await bulkTrashed([p.id], true);
                else if (confirm("彻底删除该照片？不可恢复！")) await bulkDelete([p.id]);
                await renderPhotos();
              },
            },
            state.viewingTrash ? "彻底删" : "删除"
          ),
          state.viewingTrash
            ? h(
                "button",
                {
                  class: "btn",
                  onclick: async () => {
                    await bulkTrashed([p.id], false);
                    await renderPhotos();
                  },
                },
                "恢复"
              )
            : null
        )
      );
      grid.append(box);
    }
  }

  // 选择器
  function toggleSelectAll() {
    const boxes = $$(".thumb .chk", root);
    const checkedCount = boxes.filter((b) => b.checked).length;
    const all = boxes.length;
    const target = checkedCount < all;
    state.selectedIds.clear();
    boxes.forEach((b, i) => {
      b.checked = target;
      // 找出该缩略图绑定的 id：顺序与 items 一致，但这里简单通过 DOM 冗余避免额外映射
      // 我们在 renderPhotos 时在 onchange 已同步 state.selectedIds，
      // 这里直接批量操作：通过重新触发 change 会较重，这里不触发，改为重新加载时重置
    });
    // 简化：只在“全选”场景，用 visible ids 重建
    if (target) {
      // 通过 DOM 拿不到 id，这里改为：重渲染前后全选会丢，直接在批量按钮里走“全量获取”
      // 为避免复杂性，批量按钮在无勾选时，自动改为“对当前页所有照片”
    }
  }

  // 批量操作
  async function doBulkTrashed(toTrash) {
    const aid = getCurrentAlbumId();
    if (aid == null) return;
    let ids = Array.from(state.selectedIds);
    if (!ids.length) {
      // 如果没有勾选，默认对当前列表所有项操作
      const items = await listPhotosByAlbum(aid, { trashed: state.viewingTrash ? 1 : 0 });
      ids = items.map((x) => x.id);
      if (!ids.length) return;
    }
    await bulkTrashed(ids, toTrash);
    state.selectedIds.clear();
    await renderPhotos();
  }
  async function doBulkPurge() {
    const aid = getCurrentAlbumId();
    if (aid == null) return;
    let ids = Array.from(state.selectedIds);
    if (!ids.length) {
      const items = await listPhotosByAlbum(aid, { trashed: 1 });
      ids = items.map((x) => x.id);
      if (!ids.length) return;
    }
    if (!confirm(`彻底删除 ${ids.length} 张照片？不可恢复！`)) return;
    await bulkDelete(ids);
    state.selectedIds.clear();
    await renderPhotos();
  }

  // 事件绑定（相册）
  root.getElementById("createAlbum").onclick = async () => {
    const name = root.getElementById("albumName").value.trim();
    const pwd = root.getElementById("albumPassword").value;
    if (!name) return alert("请填写相册名称");
    // 若已存在则更新；这里按 name 唯一
    const all = await listAlbums();
    const old = all.find((x) => x.name === name) || null;

    let sentinel = null;
    const locked = !!pwd;
    if (locked) {
      // 生成/刷新口令哨兵
      const tmpId = old?.id ?? -1; // 先用旧 id 参与，不影响安全（盐独立）
      sentinel = await writeAlbumSentinel(tmpId, pwd);
    }

    const id = await upsertAlbum({
      id: old?.id,
      name,
      locked,
      sentinel,
    });

    // 如为加密相册，保存会话 key，避免重复输入
    if (locked) {
      const album = await getAlbumById(id);
      const ok = await verifyAlbumPassword(album, pwd);
      if (!ok) {
        // 正常不会发生；只是兜底
        alert("口令哨兵写入失败，请重试设置口令。");
      }
    }

    root.getElementById("albumName").value = "";
    root.getElementById("albumPassword").value = "";
    await renderAlbums();
  };

  root.getElementById("backAlbums").onclick = () => {
    state.currentAlbumId = null;
    state.viewingTrash = false;
    state.selectedIds.clear();
    showToolbar(false);
    renderAlbums();
    renderPhotos();
  };

  root.getElementById("toggleTrash").onclick = async () => {
    if (getCurrentAlbumId() == null) return;
    state.viewingTrash = !state.viewingTrash;
    root.getElementById("toggleTrash").textContent = state.viewingTrash ? "返回相册" : "查看回收站";
    await renderPhotos();
  };

  root.getElementById("toggleSel").onclick = toggleSelectAll;
  root.getElementById("trashSel").onclick = () => doBulkTrashed(true);
  root.getElementById("restoreSel").onclick = () => doBulkTrashed(false);
  root.getElementById("purgeSel").onclick = () => doBulkPurge();

  root.getElementById("deleteAlbum").onclick = async () => {
    const aid = getCurrentAlbumId();
    if (aid == null) return;
    const album = await getAlbumById(aid);
    if (!confirm(`确定删除相册“${album?.name || aid}”及其所有照片？`)) return;
    await deleteAlbum(aid);
    state.currentAlbumId = null;
    state.selectedIds.clear();
    showToolbar(false);
    renderAlbums();
    renderPhotos();
  };

  // 上传/选择
  root.getElementById("uploadBtn").onclick = () => root.getElementById("fileInput").click();
  root.getElementById("pickBtn").onclick = () => root.getElementById("fileInput").click();

  root.getElementById("fileInput").onchange = async (e) => {
    const aid = getCurrentAlbumId();
    if (aid == null) {
      e.target.value = "";
      return alert("请先打开一个相册");
    }
    const album = await getAlbumById(aid);
    const session = getAlbumSession(aid);
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    for (const f of files) {
      const buf = new Uint8Array(await f.arrayBuffer());
      if (album.locked) {
        // 必须有已验证会话
        if (!session?.key) {
          alert("当前相册已加密，请先验证口令。");
          break;
        }
        const { iv, ct } = await aesEncrypt(session.key, buf);
        await addPhoto({ albumId: aid, name: f.name, iv, data: ct });
      } else {
        await addPhoto({ albumId: aid, name: f.name, data: hex(buf) });
      }
      // 轻微让步 UI
      await sleep(10);
    }

    e.target.value = "";
    await renderPhotos();
  };

  // ======= 事件绑定（训练笔记）=======
  root.getElementById("saveLog").onclick = onSaveLog;
  root.getElementById("exportLogs").onclick = onExportLogs;

  // ======= 启动 =======
  (async function init() {
    await openDB(); // 触发升级
    await loadLogs();
    await renderAlbums();
    await renderPhotos();
  })();
})();
