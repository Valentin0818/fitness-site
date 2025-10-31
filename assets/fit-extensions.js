/* FitKnow 扩展（训练笔记 + 相册/加密/回收站）
 * 复制本文件为 /assets/fit-extensions.js 并在页面中引入：
 * <section id="extensions"><div id="fit-extensions"></div></section>
 * <script src="assets/fit-extensions.js"></script>
 */
(function () {
  // ---------- 小工具 ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "html") el.innerHTML = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") el[k] = v;
      else el.setAttribute(k, v);
    }
    children.flat().forEach((c) =>
      el.append(c && c.nodeType ? c : document.createTextNode(c ?? ""))
    );
    return el;
  };
  const b64 = {
    toBase64: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))),
    fromBase64: (str) =>
      Uint8Array.from(atob(str), (c) => c.charCodeAt(0)).buffer,
  };

  // ---------- Shadow DOM 容器 ----------
  const mount = document.getElementById("fit-extensions");
  if (!mount) {
    console.warn("[FitKnow] 未找到挂载点 #fit-extensions，已跳过加载。");
    return;
  }
  const root = mount.attachShadow({ mode: "open" });

  // ---------- 样式 ----------
  root.append(
    h(
      "style",
      {
        html: `
:host { all: initial; }
:root{
  --bg:#0e0f13; --panel:#121521; --card:#151823; --muted:#9aa3b2; --text:#e6e9ef;
  --accent:#6ee7b7; --accent2:#7aa2ff; --danger:#ef4444; --ring:rgba(122,162,255,.35);
  --shadow:0 10px 30px rgba(0,0,0,.25); --radius:14px;
}
*{box-sizing:border-box} body{font-synthesis-weight:none}
.wrap{font:14px/1.45 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;color:var(--text);}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media (max-width: 960px){ .grid{grid-template-columns:1fr} }
.card{background:linear-gradient(180deg, rgba(21,24,38,.85), rgba(21,24,38,.6));border:1px solid rgba(255,255,255,.08);
  border-radius:var(--radius); box-shadow:var(--shadow)}
.card-hd{display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-bottom:1px solid rgba(255,255,255,.06)}
.title{font-weight:700}
.muted{color:var(--muted)}
.body{padding:14px}
.row{display:flex; gap:10px; align-items:center; margin-bottom:10px; flex-wrap:wrap}
.input,.select,.textarea{background:#0b0d15;border:1px solid rgba(255,255,255,.12);color:var(--text);
  border-radius:10px; padding:9px 10px; outline:none; box-shadow: inset 0 0 0 0 var(--ring)}
.input:focus,.select:focus,.textarea:focus{box-shadow:0 0 0 2px var(--ring)}
.input{min-width:170px}
.select{min-width:150px}
.textarea{width:100%; min-height:86px; resize:vertical}
.btn{cursor:pointer;border:1px solid rgba(255,255,255,.12); border-radius:10px; padding:8px 12px; background:#111528; color:var(--text)}
.btn:hover{filter:brightness(1.05)}
.btn-accent{background:linear-gradient(135deg, rgba(122,162,255,.20), rgba(110,231,183,.20))}
.btn-ghost{background:transparent}
.btn-danger{background:rgba(239,68,68,.12); border-color:rgba(239,68,68,.45)}
.sep{height:1px; background:rgba(255,255,255,.06); margin:12px 0}
.list{display:flex; flex-direction:column; gap:10px}
.helper{color:var(--muted)}
.pill{padding:6px 10px; border-radius:999px; background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.18); font-size:12px}
.right{margin-left:auto}
.grid-photos{display:grid; grid-template-columns:repeat(auto-fill, minmax(120px,1fr)); gap:10px; margin-top:10px}
.thumb{position:relative; border:1px solid rgba(255,255,255,.08); border-radius:12px; overflow:hidden; background:#0b0d15}
.thumb img{display:block; width:100%; height:100%; object-fit:cover; aspect-ratio:1/1}
.thumb .ck{position:absolute; top:6px; left:6px; width:18px; height:18px}
.badge{font-size:12px; padding:4px 8px; border-radius:999px; border:1px solid rgba(255,255,255,.16)}
.badge.green{background:rgba(110,231,183,.16); border-color:rgba(110,231,183,.45)}
.badge.gray{background:rgba(255,255,255,.08)}
.album-item{display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 12px; border:1px solid rgba(255,255,255,.08); border-radius:12px}
.small{font-size:12px}
.actions{display:flex; gap:8px; flex-wrap:wrap}
.hidden{display:none !important}
`
      }
    )
  );

  // ---------- IndexedDB ----------
  const DB_NAME = "fitknow";
  const DB_VERSION = 3;
  let db;
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const d = req.result;
        if (!d.objectStoreNames.contains("logs")) {
          const s = d.createObjectStore("logs", { keyPath: "id", autoIncrement: true });
          s.createIndex("ts", "ts");
        }
        if (!d.objectStoreNames.contains("albums")) {
          const s = d.createObjectStore("albums", { keyPath: "id", autoIncrement: true });
          s.createIndex("name", "name", { unique: false });
        }
        if (!d.objectStoreNames.contains("photos")) {
          const s = d.createObjectStore("photos", { keyPath: "id", autoIncrement: true });
          s.createIndex("albumId", "albumId");
          s.createIndex("deleted", "deleted");
        }
      };
      req.onsuccess = () => {
        db = req.result;
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }
  const tx = (stores, mode = "readonly") => db.transaction(stores, mode);

  // logs
  const addLog = (log) =>
    new Promise((res, rej) => {
      const r = tx(["logs"], "readwrite").objectStore("logs").add({ ...log });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  const listLogs = () =>
    new Promise((res, rej) => {
      const store = tx(["logs"]).objectStore("logs").index("ts");
      const out = [];
      store.openCursor(null, "prev").onsuccess = (e) => {
        const c = e.target.result;
        if (!c) return res(out);
        out.push(c.value);
        c.continue();
      };
      store.openCursor().onerror = () => rej(store.error);
    });
  const delLog = (id) =>
    new Promise((res, rej) => {
      const r = tx(["logs"], "readwrite").objectStore("logs").delete(id);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });

  // albums
  const upsertAlbum = (album) =>
    new Promise((res, rej) => {
      const r = tx(["albums"], "readwrite").objectStore("albums").put(album);
      r.onsuccess = () => res(r.result ?? album.id);
      r.onerror = () => rej(r.error);
    });
  const listAlbums = () =>
    new Promise((res, rej) => {
      const out = [];
      const cur = tx(["albums"]).objectStore("albums").openCursor();
      cur.onsuccess = (e) => {
        const c = e.target.result;
        if (!c) return res(out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
        out.push(c.value);
        c.continue();
      };
      cur.onerror = () => rej(cur.error);
    });
  const getAlbum = (id) =>
    new Promise((res, rej) => {
      const r = tx(["albums"]).objectStore("albums").get(id);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  const deleteAlbum = (id) =>
    new Promise((res, rej) => {
      const t = tx(["albums", "photos"], "readwrite");
      t.objectStore("albums").delete(id);
      const idx = t.objectStore("photos").index("albumId");
      const req = idx.openCursor(IDBKeyRange.only(id));
      req.onsuccess = (e) => {
        const c = e.target.result;
        if (!c) return;
        t.objectStore("photos").delete(c.value.id);
        c.continue();
      };
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });

  // photos
  const addPhoto = (p) =>
    new Promise((res, rej) => {
      const r = tx(["photos"], "readwrite").objectStore("photos").add(p);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  const listPhotos = (albumId, where = {}) =>
    new Promise((res, rej) => {
      const out = [];
      const idx = tx(["photos"]).objectStore("photos").index("albumId");
      const req = idx.openCursor(IDBKeyRange.only(albumId));
      req.onsuccess = (e) => {
        const c = e.target.result;
        if (!c) return res(out.sort((a, b) => b.createdAt - a.createdAt));
        const v = c.value;
        let ok = true;
        for (const k in where) if (v[k] !== where[k]) ok = false;
        if (ok) out.push(v);
        c.continue();
      };
      req.onerror = () => rej(req.error);
    });
  const updatePhoto = (id, patch) =>
    new Promise((res, rej) => {
      const s = tx(["photos"], "readwrite").objectStore("photos");
      const r = s.get(id);
      r.onsuccess = () => {
        const v = { ...r.result, ...patch };
        const w = s.put(v);
        w.onsuccess = () => res(v);
        w.onerror = () => rej(w.error);
      };
      r.onerror = () => rej(r.error);
    });
  const deletePhotoHard = (id) =>
    new Promise((res, rej) => {
      const r = tx(["photos"], "readwrite").objectStore("photos").delete(id);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });

  // ---------- 加密工具（相册设置密码才会用到） ----------
  const keyCache = new Map(); // albumId -> CryptoKey
  async function deriveKey(password, saltB64) {
    const enc = new TextEncoder();
    const salt =
      saltB64 ? b64.fromBase64(saltB64) : crypto.getRandomValues(new Uint8Array(16)).buffer;
    const keyMat = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" },
      keyMat,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
    return { key, saltB64: b64.toBase64(salt) };
  }
  async function encBlob(key, file) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const buf = await file.arrayBuffer();
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, buf);
    return { blob: new Blob([ct]), iv: b64.toBase64(iv.buffer) };
  }
  async function decBlob(key, blob, ivB64) {
    const iv = b64.fromBase64(ivB64);
    const ct = await blob.arrayBuffer();
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new Blob([pt]);
  }

  // ---------- 视图骨架 ----------
  const app = h("div", { class: "wrap" });
  // 顶部标签
  const tabs = h(
    "div",
    { class: "row", style: "margin-bottom:12px" },
    h("span", { class: "pill" }, "🏋️‍♀️ 训练笔记"),
    h("span", { class: "pill" }, "🖼️ 相册（可加密）"),
    h("span", { class: "right helper" }, "数据保存在本机浏览器，可导出 JSON 备份。")
  );

  // ---------- 训练笔记 ----------
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
        h("input", { class: "input", id: "date", type: "date" }),
        h("input", { class: "input", id: "session", placeholder: "本次训练主题（如：胸 + 三头）" }),
        (() => {
          const sel = h("select", { class: "select", id: "rating", title: "主观强度 RPE" });
          sel.append(h("option", { value: "", text: "强度（RPE）" }));
          for (let i = 1; i <= 10; i++) sel.append(h("option", { value: String(i), text: String(i) }));
          return sel;
        })()
      ),
      h(
        "div",
        { class: "row" },
        h(
          "textarea",
          {
            class: "textarea",
            id: "exercises",
            placeholder: "动作清单（每行一个：动作 | 组数x次数 | 重量）\n例：卧推 | 4x6 | 60kg",
          },
          ""
        )
      ),
      h(
        "div",
        { class: "row" },
        h("textarea", { class: "textarea", id: "notes", placeholder: "主观感受、疼痛与技术要点…" }, "")
      ),
      h(
        "div",
        { class: "row" },
        h(
          "button",
          {
            class: "btn btn-accent",
            id: "saveLog",
            onclick: async () => {
              const v = (id) => root.getElementById(id).value.trim();
              const log = {
                date: v("date") || new Date().toISOString().slice(0, 10),
                session: v("session"),
                rating: v("rating"),
                exercises: v("exercises"),
                notes: v("notes"),
                ts: Date.now(),
              };
              await addLog(log);
              ["session", "rating", "exercises", "notes"].forEach(
                (id) => (root.getElementById(id).value = "")
              );
              loadLogs();
            },
          },
          "保存记录"
        ),
        h(
          "button",
          {
            class: "btn btn-ghost",
            id: "exportLogs",
            onclick: async () => {
              const data = await listLogs();
              const blob = new Blob(
                [JSON.stringify({ type: "fitknow-logs", version: 1, data }, null, 2)],
                { type: "application/json" }
              );
              const url = URL.createObjectURL(blob);
              const a = h("a", { href: url, download: "fitknow-logs.json" });
              root.append(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
            },
          },
          "导出 JSON"
        )
      ),
      h("div", { class: "sep" }),
      h("div", { class: "list", id: "logList" }, h("div", { class: "helper" }, "暂无记录"))
    )
  );

  async function loadLogs() {
    const items = await listLogs();
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
        .map((line) => `• ${line}`)
        .join("\n");
      const el = h(
        "div",
        { class: "log-item" },
        h("div", { class: "row", style: "margin:0 0 6px 0" }, h("div", { text: head }), h("span", { class: "right helper", text: `#${it.id}` })),
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

  // ---------- 相册 ----------
  // 相册列表卡片（左侧输入创建，右侧显示列表）
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
      { class: "body", id: "albumListView" },
      h(
        "div",
        { class: "row" },
        h("input", {
          class: "input",
          id: "albumName",
          placeholder: "相册名称（如：增肌期 2025-Q1）",
        }),
        h("input", {
          class: "input",
          id: "albumPassword",
          type: "password",
          placeholder: "相册密码（可留空为公开）",
        }),
        h(
          "button",
          {
            class: "btn btn-accent",
            id: "createAlbum",
            onclick: onCreateAlbum,
          },
          "创建/更新相册"
        )
      ),
      h("div", { id: "albumList", class: "list" }, h("div", { class: "helper" }, "暂无相册"))
    ),
    // 单个相册视图（打开后显示）
    h(
      "div",
      { class: "body hidden", id: "albumDetailView" },
      h(
        "div",
        { class: "row" },
        h(
          "button",
          {
            class: "btn",
            onclick: () => switchView("list"),
          },
          "← 返回"
        ),
        h("span", { id: "albumTitle", class: "pill" }),
        h("span", { id: "albumPrivacy", class: "badge gray" }),
        h(
          "button",
          {
            class: "btn btn-accent",
            id: "btnUpload",
            onclick: () => root.getElementById("fileInput").click(),
          },
          "上传照片"
        ),
        h("input", {
          id: "fileInput",
          type: "file",
          accept: "image/*",
          multiple: true,
          class: "hidden",
          onchange: onFilesSelected,
        }),
        h(
          "button",
          { class: "btn", id: "btnPick", onclick: () => root.getElementById("fileInput").click() },
          "选择照片"
        ),
        h(
          "button",
          {
            class: "btn",
            id: "btnToggleTrash",
            onclick: () => {
              state.viewingTrash = !state.viewingTrash;
              loadAlbumPhotos();
            },
          },
          "查看回收站"
        )
      ),
      h(
        "div",
        { class: "row" },
        h(
          "button",
          {
            class: "btn",
            id: "btnToggleAll",
            onclick: () => {
              const all = state.currentPhotos;
              if (!all.length) return;
              const shouldAll = !state._allSelected;
              state.selected = new Set(shouldAll ? all.map((p) => p.id) : []);
              state._allSelected = shouldAll;
              renderPhotoGrid();
            },
          },
          "全选/取消全选"
        ),
        h(
          "button",
          {
            class: "btn btn-danger",
            id: "btnDeleteOrRestore",
            onclick: onBulkDeleteOrRestore,
          },
          "批量删除"
        ),
        h(
          "button",
          {
            class: "btn btn-danger",
            id: "btnEmptyTrash",
            onclick: onEmptyTrash,
          },
          "恢复所选"
        ),
        h(
          "button",
          {
            class: "btn btn-danger right",
            id: "btnDeleteAlbum",
            onclick: onDeleteAlbum,
          },
          "删除整本相册"
        )
      ),
      h("div", { id: "photoGrid", class: "grid-photos" })
    )
  );

  // 状态
  const state = {
    albumId: null,
    album: null,
    viewingTrash: false,
    selected: new Set(),
    currentPhotos: [],
    _allSelected: false,
  };

  // 渲染相册列表
  async function renderAlbums() {
    const list = root.getElementById("albumList");
    list.innerHTML = "";
    const albums = await listAlbums();
    if (!albums.length) {
      list.append(h("div", { class: "helper" }, "暂无相册"));
      return;
    }
    albums.forEach((a) => {
      const locked = !!a.locked;
      const item = h(
        "div",
        { class: "album-item" },
        h("div", {}, h("strong", { text: a.name }), h("div", { class: "small helper", text: new Date(a.updatedAt || a.createdAt || Date.now()).toLocaleString() })),
        h(
          "div",
          { class: "actions" },
          h("span", { class: "badge " + (locked ? "green" : "gray"), text: locked ? "加密" : "公开" }),
          h(
            "button",
            {
              class: "btn btn-accent",
              onclick: () => openAlbum(a.id),
            },
            "打开"
          )
        )
      );
      list.append(item);
    });
  }

  function switchView(which) {
    const listV = root.getElementById("albumListView");
    const detailV = root.getElementById("albumDetailView");
    if (which === "list") {
      detailV.classList.add("hidden");
      listV.classList.remove("hidden");
      state.albumId = null;
      state.album = null;
      state.viewingTrash = false;
      state.selected.clear();
    } else {
      listV.classList.add("hidden");
      detailV.classList.remove("hidden");
    }
  }

  async function onCreateAlbum() {
    const name = root.getElementById("albumName").value.trim();
    const pwd = root.getElementById("albumPassword").value;
    if (!name) {
      alert("请输入相册名称");
      return;
    }
    let album = (await listAlbums()).find((x) => x.name === name) || {
      name,
      createdAt: Date.now(),
    };
    if (pwd) {
      const { key, saltB64 } = await deriveKey(pwd, album.saltB64);
      album.locked = true;
      album.saltB64 = saltB64;
      keyCache.set(album.id || name, key); // 先临时放，以 id 未生成时用 name 作为键
    } else {
      album.locked = false;
      album.saltB64 = album.saltB64 || null;
    }
    album.updatedAt = Date.now();
    const id = await upsertAlbum(album);
    // 如果之前用 name 暂存了 key，换成 id
    const tempKey = keyCache.get(name);
    if (tempKey) {
      keyCache.delete(name);
      keyCache.set(id, tempKey);
    }
    root.getElementById("albumName").value = "";
    root.getElementById("albumPassword").value = "";
    renderAlbums();
  }

  async function openAlbum(id) {
    const album = await getAlbum(id);
    state.albumId = id;
    state.album = album;
    state.viewingTrash = false;
    state.selected.clear();
    state._allSelected = false;

    // 对加密相册：准备密钥
    if (album.locked && !keyCache.get(id)) {
      const pwd = prompt("此相册已加密，请输入密码：");
      if (!pwd) return alert("未输入密码，无法打开。");
      try {
        const { key } = await deriveKey(pwd, album.saltB64);
        keyCache.set(id, key);
      } catch (e) {
        alert("密码不正确或浏览器不支持加密。");
        return;
      }
    }

    // 顶部信息
    root.getElementById("albumTitle").textContent = album.name;
    root.getElementById("albumPrivacy").textContent = album.locked ? "加密" : "公开";
    root.getElementById("albumPrivacy").className = "badge " + (album.locked ? "green" : "gray");
    root.getElementById("btnToggleTrash").textContent = "查看回收站";
    root.getElementById("btnDeleteOrRestore").textContent = "批量删除";
    root.getElementById("btnEmptyTrash").textContent = "恢复所选";

    switchView("detail");
    await loadAlbumPhotos();
  }

  async function loadAlbumPhotos() {
    if (!state.albumId) return;
    const viewingTrash = state.viewingTrash;
    const photos = await listPhotos(state.albumId, { deleted: viewingTrash ? true : false });
    state.currentPhotos = photos;
    state.selected.clear();
    state._allSelected = false;

    // 顶部按钮文字切换
    root.getElementById("btnToggleTrash").textContent = viewingTrash ? "返回相册" : "查看回收站";
    root.getElementById("btnDeleteOrRestore").textContent = viewingTrash ? "批量删除（回收站）" : "批量删除";
    root.getElementById("btnEmptyTrash").textContent = viewingTrash ? "恢复所选" : "恢复所选";

    renderPhotoGrid();
  }

  function renderPhotoGrid() {
    const grid = root.getElementById("photoGrid");
    grid.innerHTML = "";
    if (!state.currentPhotos.length) {
      grid.append(h("div", { class: "helper" }, state.viewingTrash ? "回收站为空" : "暂无照片"));
      return;
    }
    state.currentPhotos.forEach((p) => {
      const checked = state.selected.has(p.id);
      const urlPromise = (async () => {
        if (p.enc) {
          try {
            const key = keyCache.get(state.albumId);
            const dec = await decBlob(key, p.blob, p.iv);
            return URL.createObjectURL(dec);
          } catch {
            return "";
          }
        } else {
          return URL.createObjectURL(p.blob);
        }
      })();

      const item = h(
        "div",
        { class: "thumb" },
        h("input", {
          type: "checkbox",
          class: "ck",
          checked,
          onclick: (e) => {
            if (e.target.checked) state.selected.add(p.id);
            else state.selected.delete(p.id);
          },
        }),
        h("img", { alt: p.name })
      );
      urlPromise.then((u) => {
        const img = item.querySelector("img");
        img.src = u;
        img.onload = () => setTimeout(() => URL.revokeObjectURL(u), 3000);
      });
      grid.append(item);
    });
  }

  async function onFilesSelected(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length || !state.albumId) return;

    const album = state.album;
    let key = null;
    if (album.locked) key = keyCache.get(state.albumId);

    for (const f of files) {
      const rec = {
        albumId: state.albumId,
        name: f.name,
        size: f.size,
        type: f.type || "image/*",
        createdAt: Date.now(),
        deleted: false,
      };
      if (album.locked) {
        const { blob, iv } = await encBlob(key, f);
        rec.enc = true;
        rec.iv = iv;
        rec.blob = blob;
      } else {
        rec.enc = false;
        rec.iv = null;
        rec.blob = f;
      }
      await addPhoto(rec);
    }
    // 更新相册时间
    await upsertAlbum({ ...album, updatedAt: Date.now() });
    await loadAlbumPhotos();
    e.target.value = ""; // 清空选择
  }

  async function onBulkDeleteOrRestore() {
    if (!state.selected.size) {
      alert("请先勾选照片");
      return;
    }
    const ids = Array.from(state.selected);
    if (!state.viewingTrash) {
      // 移至回收站
      for (const id of ids) await updatePhoto(id, { deleted: true, deletedAt: Date.now() });
    } else {
      // 彻底删除
      if (!confirm(`将彻底删除 ${ids.length} 张照片，无法恢复，确定吗？`)) return;
      for (const id of ids) await deletePhotoHard(id);
    }
    state.selected.clear();
    await loadAlbumPhotos();
  }

  async function onEmptyTrash() {
    if (!state.selected.size) {
      // 恢复所有已选为空 -> 尝试恢复全部
      const photos = state.currentPhotos;
      if (!photos.length) return;
      if (!confirm(`恢复回收站内所有 ${photos.length} 张照片？`)) return;
      for (const p of photos) await updatePhoto(p.id, { deleted: false, deletedAt: null });
    } else {
      // 恢复所选
      for (const id of state.selected) await updatePhoto(id, { deleted: false, deletedAt: null });
    }
    state.selected.clear();
    await loadAlbumPhotos();
  }

  async function onDeleteAlbum() {
    if (!state.albumId) return;
    const a = state.album;
    if (!confirm(`确定删除相册《${a.name}》及其全部照片吗？此操作不可恢复。`)) return;
    await deleteAlbum(state.albumId);
    keyCache.delete(state.albumId);
    switchView("list");
    renderAlbums();
  }

  // ---------- 组装 ----------
  app.append(
    tabs,
    h("div", { class: "grid" }, noteCard, albumCard)
  );
  root.append(app);

  // ---------- 初始化 ----------
  openDB().then(async () => {
    await loadLogs();
    await renderAlbums();
  });
})();
