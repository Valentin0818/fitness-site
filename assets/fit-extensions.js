/* assets/fit-extensions.js */
(function () {
  // ========== 小工具 ==========
  const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") el[k] = v;
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    for (const c of children) {
      if (c == null) continue;
      el.append(c.nodeType ? c : document.createTextNode(c));
    }
    return el;
  };
  const fmtTime = (ts) =>
    new Date(ts).toLocaleString([], {
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  const buf2b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const b642buf = (b64) =>
    Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
  const textEnc = new TextEncoder();
  const textDec = new TextDecoder();

  // ========== Shadow DOM ==========
  const mount = document.getElementById("fit-extensions");
  if (!mount) {
    console.warn("[FitKnow] 未找到挂载点 #fit-extensions，跳过加载");
    return;
  }
  const root = mount.attachShadow({ mode: "open" });

  // ========== 样式 ==========
  root.append(
    h(
      "style",
      {
        html: `
:host{ all:initial; }
:root{ --bg:#0e0f13; --card:#151823; --muted:#9aa3b2; --accent:#6ee7b7; --text:#e6e9ef; --danger:#ef4444; --ring:rgba(110,231,183,.35); --shadow:0 10px 30px rgba(0,0,0,.25); --radius:16px;}
*{box-sizing:border-box; font-family: ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;}
.wrap{ color:var(--text); }
.grid{ display:grid; grid-template-columns: 1fr 1fr; gap:16px; }
@media (max-width:920px){ .grid{ grid-template-columns: 1fr; } }

.card{ background:linear-gradient(180deg, rgba(21,24,35,.85), rgba(21,24,35,.65)); border:1px solid rgba(255,255,255,.08); border-radius:var(--radius); box-shadow:var(--shadow); }
.card-hd{ display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid rgba(255,255,255,.08); }
.card-hd .title{ font-weight:700; }
.card-hd .muted{ color:var(--muted); font-size:12px; }
.body{ padding:16px; }

.row{ display:flex; gap:10px; align-items:center; }
.flex{ display:flex; align-items:center; gap:10px; }
.right{ margin-left:auto; }
.sep{ height:1px; background:rgba(255,255,255,.08); margin:12px 0; }

.input,.select,.textarea{ width:100%; background:#0a0c10; border:1px solid rgba(255,255,255,.12); color:var(--text); border-radius:10px; padding:10px 12px; outline:0; }
.textarea{ min-height:88px; resize:vertical; }
.pill{ display:inline-block; padding:6px 10px; border-radius:999px; border:1px solid rgba(255,255,255,.2); background:rgba(255,255,255,.06); font-size:12px; }
.muted{ color:var(--muted); }
.helper{ color:var(--muted); font-size:12px; }
.list{ display:flex; flex-direction:column; gap:10px; }

.btn{ appearance:none; border:1px solid rgba(255,255,255,.14); padding:8px 12px; border-radius:10px; cursor:pointer; background:rgba(255,255,255,.06); color:var(--text); }
.btn:hover{ filter:brightness(1.06); }
.btn-accent{ border-color:rgba(110,231,183,.35); background:linear-gradient(135deg, rgba(110,231,183,.18), rgba(122,162,255,.12)); box-shadow: inset 0 0 10px rgba(110,231,183,.15); }
.btn-danger{ border-color: rgba(239,68,68,.45); background: linear-gradient(135deg, rgba(239,68,68,.22), rgba(239,68,68,.12)); }

.badge{ font-size:11px; padding:2px 8px; border-radius:999px; border:1px solid rgba(255,255,255,.16); background:rgba(255,255,255,.06); }
.badge-lock{ border-color:rgba(239,68,68,.5); }

.album-grid{ display:grid; grid-template-columns: repeat(auto-fill, 160px); gap:12px; }
.thumb{ position:relative; border:1px solid rgba(255,255,255,.12); background:#0a0c10; border-radius:12px; overflow:hidden; }
.thumb img{ width:100%; height:120px; object-fit:cover; display:block; background:#000; }
.thumb .meta{ padding:8px; display:flex; gap:8px; align-items:center; }
.thumb input[type="checkbox"]{ width:16px; height:16px; }

.toolbar{ display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; }
.toolbar .spacer{ flex:1; }
.small{ font-size:12px; }
`
      }
    )
  );

  // ========== IndexedDB ==========
  const DB_NAME = "fitknow-db";
  const DB_VERSION = 4; // 关键：版本号提升，避免 VersionError

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = () => {
        const db = req.result;

        if (!db.objectStoreNames.contains("logs")) {
          const s = db.createObjectStore("logs", {
            keyPath: "id",
            autoIncrement: true,
          });
          s.createIndex("ts", "ts", { unique: false });
        }
        if (!db.objectStoreNames.contains("albums")) {
          db.createObjectStore("albums", { keyPath: "name" });
        }
        if (!db.objectStoreNames.contains("photos")) {
          const p = db.createObjectStore("photos", {
            keyPath: "id",
            autoIncrement: true,
          });
          p.createIndex("album", "album", { unique: false });
          p.createIndex("deleted", "deleted", { unique: false });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  let DB;
  const tx = (stores, mode = "readonly") =>
    DB.transaction(stores, mode).objectStore(stores);

  // === Logs ===
  const addLog = (log) =>
    new Promise((res, rej) => {
      const s = tx("logs", "readwrite");
      const data = {
        ...log,
        ts: log.ts ?? Date.now(),
      };
      const req = s.add(data);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });

  const listLogs = () =>
    new Promise((res, rej) => {
      const s = tx("logs");
      const out = [];
      const idx = s.index("ts");
      const req = idx.openCursor(null, "prev");
      req.onsuccess = () => {
        const cur = req.result;
        if (cur) {
          out.push(cur.value);
          cur.continue();
        } else res(out);
      };
      req.onerror = () => rej(req.error);
    });

  const delLog = (id) =>
    new Promise((res, rej) => {
      const s = tx("logs", "readwrite");
      const req = s.delete(id);
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    });

  // === Albums ===
  const upsertAlbum = (album) =>
    new Promise((res, rej) => {
      const s = tx("albums", "readwrite");
      const now = Date.now();
      const req = s.put({
        createdAt: album.createdAt ?? now,
        updatedAt: now,
        ...album,
      });
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });

  const getAlbum = (name) =>
    new Promise((res, rej) => {
      const s = tx("albums");
      const req = s.get(name);
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => rej(req.error);
    });

  const listAlbums = () =>
    new Promise((res, rej) => {
      const s = tx("albums");
      const out = [];
      const req = s.openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (cur) {
          out.push(cur.value);
          cur.continue();
        } else {
          out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          res(out);
        }
      };
      req.onerror = () => rej(req.error);
    });

  // === Photos ===
  const addPhoto = (photo) =>
    new Promise((res, rej) => {
      const s = tx("photos", "readwrite");
      const data = {
        deleted: false,
        createdAt: Date.now(),
        ...photo,
      };
      const req = s.add(data);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });

  const getPhotosByAlbum = (album, includeDeleted = false) =>
    new Promise((res, rej) => {
      const s = tx("photos");
      const idx = s.index("album");
      const range = IDBKeyRange.only(album);
      const out = [];
      const req = idx.openCursor(range, "prev");
      req.onsuccess = () => {
        const cur = req.result;
        if (cur) {
          const v = cur.value;
          if (includeDeleted || !v.deleted) out.push(v);
          cur.continue();
        } else res(out);
      };
      req.onerror = () => rej(req.error);
    });

  const markDeleted = (ids, deleted) =>
    new Promise((res, rej) => {
      const s = tx("photos", "readwrite");
      let count = 0;
      ids.forEach((id) => {
        const g = s.get(id);
        g.onsuccess = () => {
          const v = g.result;
          if (!v) return;
          v.deleted = deleted;
          v.deletedAt = deleted ? Date.now() : undefined;
          const p = s.put(v);
          p.onsuccess = () => {
            count++;
            if (count === ids.length) res();
          };
          p.onerror = () => rej(p.error);
        };
        g.onerror = () => rej(g.error);
      });
    });

  const purgePhotos = (ids) =>
    new Promise((res, rej) => {
      const s = tx("photos", "readwrite");
      let count = 0;
      ids.forEach((id) => {
        const d = s.delete(id);
        d.onsuccess = () => {
          count++;
          if (count === ids.length) res();
        };
        d.onerror = () => rej(d.error);
      });
    });

  // ========== 加密/验证 ==========
  async function hashVerifier(saltB64, password) {
    // verifier = SHA-256 ( salt + password )
    const data = new Uint8Array([
      ...new Uint8Array(b642buf(saltB64)),
      ...textEnc.encode(password),
    ]);
    const dig = await crypto.subtle.digest("SHA-256", data);
    return buf2b64(dig);
  }

  async function deriveKeyPBKDF2(password, saltB64) {
    const keyMat = await crypto.subtle.importKey(
      "raw",
      textEnc.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: b642buf(saltB64),
        iterations: 120000,
        hash: "SHA-256",
      },
      keyMat,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async function encryptForAlbum(key, file) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const buf = await file.arrayBuffer();
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      buf
    );
    return { iv: buf2b64(iv), blob: new Blob([ct], { type: file.type }) };
  }

  async function decryptPhoto(key, ivB64, blob) {
    const buf = await blob.arrayBuffer();
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b642buf(ivB64) },
      key,
      buf
    );
    return new Blob([pt], { type: blob.type || "image/*" });
  }

  // 保存每个已验证相册的内存会话密钥
  const sessionKeys = new Map(); // albumName -> CryptoKey

  async function ensureAlbumAccess(album) {
    if (!album.locked) return true;
    if (sessionKeys.has(album.name)) return true;

    const pwd = prompt(`相册「${album.name}」已加密，请输入密码`);
    if (pwd == null) return false;

    const ver = await hashVerifier(album.salt, pwd);
    if (ver !== album.verifier) {
      alert("密码错误");
      return false;
    }
    const key = await deriveKeyPBKDF2(pwd, album.salt);
    sessionKeys.set(album.name, key);
    return true;
  }

  // ========== 视图 ==========
  const app = h("div", { class: "wrap" });

  // 顶部标签（纯展示）
  const tabs = h(
    "div",
    { class: "row", style: "margin-bottom:12px" },
    h("span", { class: "pill" }, "🏋️‍♀️ 训练笔记"),
    h("span", { class: "pill" }, "🖼️ 相册（可加密）"),
    h(
      "span",
      { class: "right helper" },
      "数据离线保存在本机浏览器，可导出 JSON 备份。"
    )
  );

  // === 左：训练笔记 ===
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
        h("input", {
          class: "input",
          id: "session",
          placeholder: "本次训练主题（如：胸 + 三头）",
        }),
        (() => {
          const sel = h(
            "select",
            { class: "select", id: "rating", title: "主观强度 RPE" },
            h("option", { value: "" }, "强度（RPE）"),
            ...Array.from({ length: 10 }, (_, i) =>
              h("option", { value: String(i + 1) }, String(i + 1))
            )
          );
          return sel;
        })()
      ),
      h(
        "div",
        { class: "row" },
        h("textarea", {
          class: "textarea",
          id: "exercises",
          placeholder:
            "动作清单（每行一个：动作 | 组数x次数 | 重量）\n例：卧推 | 4x6 | 60kg",
        })
      ),
      h(
        "div",
        { class: "row" },
        h("textarea", {
          class: "textarea",
          id: "notes",
          placeholder: "主观感受、疼痛与技术要点…",
        })
      ),
      h(
        "div",
        { class: "row" },
        h(
          "button",
          { class: "btn btn-accent", id: "saveLog" },
          "保存记录"
        ),
        h("button", { class: "btn", id: "exportLogs" }, "导出 JSON")
      ),
      h("div", { class: "sep" }),
      h("div", { class: "list", id: "logList" }, h("div", { class: "helper" }, "暂无记录"))
    )
  );

  // === 右：相册（可加密） ===
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
          placeholder: "相册密码（可留空为公开）",
          type: "password",
        }),
        h(
          "button",
          { class: "btn btn-accent", id: "createAlbum" },
          "创建/更新相册"
        )
      ),
      h("div", { id: "albumList", class: "list" }, h("div", { class: "helper" }, "暂无相册"))
    )
  );

  const grid = h("div", { class: "grid" }, noteCard, albumCard);
  app.append(tabs, grid);
  root.append(app);

  // ========== 渲染：训练笔记 ==========
  function renderLogs(items) {
    const box = root.getElementById("logList");
    box.innerHTML = "";
    if (!items.length) {
      box.append(h("div", { class: "helper" }, "暂无记录"));
      return;
    }
    items.forEach((it) => {
      const head = `${it.date || ""} · ${it.session || "未命名"} · RPE ${
        it.rating || "-"
      }`;
      const ex = (it.exercises || "")
        .split(/\n+/)
        .filter(Boolean)
        .map((line) => `• ${line}`)
        .join("\n");
      const el = h(
        "div",
        { class: "log-item" },
        h(
          "div",
          { class: "flex" },
          h("h4", {}, head),
          h("span", { class: "right helper" }, `#${it.id}`)
        ),
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
  const loadLogs = async () => renderLogs(await listLogs());
  root.getElementById("saveLog").onclick = async () => {
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
  };
  root.getElementById("exportLogs").onclick = async () => {
    const data = await listLogs();
    const blob = new Blob(
      [JSON.stringify({ type: "fitknow-logs", version: 1, data }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: `fit-logs-${Date.now()}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // ========== 渲染：相册列表 ==========
  async function renderAlbums() {
    const box = root.getElementById("albumList");
    box.innerHTML = "";
    const all = await listAlbums();
    if (!all.length) {
      box.append(h("div", { class: "helper" }, "暂无相册"));
      return;
    }
    all.forEach((a) => {
      const row = h(
        "div",
        { class: "card" },
        h(
          "div",
          { class: "body" },
          h(
            "div",
            { class: "flex" },
            h("strong", {}, a.name),
            a.locked
              ? h("span", { class: "badge badge-lock" }, "加密")
              : h("span", { class: "badge" }, "公开"),
            h("span", { class: "helper" }, fmtTime(a.updatedAt || a.createdAt)),
            h(
              "button",
              {
                class: "btn btn-accent right",
                onclick: () => openAlbumManager(a.name),
              },
              "打开"
            )
          )
        )
      );
      box.append(row);
    });
  }

  // ========== 相册创建/更新 ==========
  root.getElementById("createAlbum").onclick = async () => {
    const name = root.getElementById("albumName").value.trim();
    const pwd = root.getElementById("albumPassword").value;
    if (!name) {
      alert("请填写相册名称");
      return;
    }

    let album = await getAlbum(name);
    const now = Date.now();

    if (pwd) {
      // 加密相册：生成或沿用 salt/verifier
      const salt = album?.salt || buf2b64(crypto.getRandomValues(new Uint8Array(16)));
      const verifier = await hashVerifier(salt, pwd);
      album = {
        name,
        locked: true,
        salt,
        verifier,
        createdAt: album?.createdAt || now,
        updatedAt: now,
      };
      // 更新会话密钥
      const key = await deriveKeyPBKDF2(pwd, salt);
      sessionKeys.set(name, key);
    } else {
      // 公开相册
      album = {
        name,
        locked: false,
        salt: undefined,
        verifier: undefined,
        createdAt: album?.createdAt || now,
        updatedAt: now,
      };
      sessionKeys.delete(name);
    }

    await upsertAlbum(album);
    root.getElementById("albumName").value = "";
    root.getElementById("albumPassword").value = "";
    renderAlbums();
  };

  // ========== 相册管理界面 ==========
  async function openAlbumManager(albumName) {
    const album = await getAlbum(albumName);
    if (!album) {
      alert("相册不存在");
      return;
    }
    // 权限检查
    const ok = await ensureAlbumAccess(album);
    if (!ok) return;

    // 弹出层内容
    const box = h("div", { class: "card" });
    const body = h("div", { class: "body" });
    box.append(
      h(
        "div",
        { class: "card-hd" },
        h("div", { class: "title" }, `相册：${album.name}`),
        h(
          "div",
          { class: "muted" },
          album.locked ? "已加密" : "公开"
        )
      ),
      body
    );

    // 工具条
    const toolbar = h("div", { class: "toolbar" });
    const backBtn = h(
      "button",
      { class: "btn", onclick: () => renderAlbums() },
      "← 返回"
    );

    const uploadInput = h("input", { type: "file", accept: "image/*", multiple: true, style: "display:none" });
    const uploadBtn = h("button", { class: "btn btn-accent" }, "上传照片");
    uploadBtn.onclick = () => uploadInput.click();

    const chooseBtn = h("button", { class: "btn" }, "选择照片");
    const selectAllBtn = h("button", { class: "btn" }, "全选/取消全选");

    const toggleTrashBtn = h("button", { class: "btn" }, "查看回收站");
    const removeBtn = h("button", { class: "btn btn-danger" }, "批量删除");
    const restoreBtn = h("button", { class: "btn" }, "恢复所选");
    const purgeBtn = h("button", { class: "btn btn-danger" }, "彻底删除（回收站）");

    toolbar.append(backBtn, uploadBtn, chooseBtn, selectAllBtn, h("span", { class: "spacer" }), toggleTrashBtn, removeBtn, restoreBtn, purgeBtn, uploadInput);
    body.append(toolbar);

    const gridWrap = h("div", { class: "album-grid" });
    body.append(gridWrap);

    // 状态
    const state = {
      viewingTrash: false,
      selecting: false,
      selected: new Set(), // photo id
      photos: [],
    };

    // 行为：装载/渲染
    async function loadPhotos() {
      state.photos = await getPhotosByAlbum(album.name, state.viewingTrash);
      renderPhotos();
    }

    function renderPhotos() {
      gridWrap.innerHTML = "";
      if (!state.photos.length) {
        gridWrap.append(
          h(
            "div",
            { class: "helper", style: "grid-column: 1/-1; padding:12px;" },
            state.viewingTrash ? "回收站为空" : "暂无照片，点击上方“上传照片”添加"
          )
        );
        return;
      }

      state.photos.forEach((p) => {
        const checked = state.selected.has(p.id);
        const card = h("div", { class: "thumb" });
        const img = h("img", { alt: p.name || "" });
        const meta = h(
          "div",
          { class: "meta" },
          h("input", {
            type: "checkbox",
            checked,
            onchange: (e) => {
              if (e.target.checked) state.selected.add(p.id);
              else state.selected.delete(p.id);
            },
          }),
          h("div", { class: "small helper" }, fmtTime(p.createdAt || Date.now()))
        );
        card.append(img, meta);
        gridWrap.append(card);

        // 展示缩略图（加密需要解密）
        (async () => {
          try {
            let blob = p.blob;
            if (p.enc) {
              const key = sessionKeys.get(album.name);
              if (!key) throw new Error("缺少解密会话，请重新打开相册");
              blob = await decryptPhoto(key, p.iv, p.blob);
            }
            const url = URL.createObjectURL(blob);
            img.src = url;
            img.onload = () => URL.revokeObjectURL(url);
          } catch (err) {
            img.alt = "[无法解密]";
          }
        })();
      });
    }

    // 事件：上传
    uploadInput.onchange = async () => {
      const files = Array.from(uploadInput.files || []);
      if (!files.length) return;
      let key = null;
      if (album.locked) {
        key = sessionKeys.get(album.name);
        if (!key) {
          alert("缺少解密会话，请关闭并重新打开相册");
          return;
        }
      }
      for (const f of files) {
        try {
          if (album.locked) {
            const { iv, blob } = await encryptForAlbum(key, f);
            await addPhoto({
              album: album.name,
              name: f.name,
              type: f.type,
              size: f.size,
              enc: true,
              iv,
              blob,
            });
          } else {
            await addPhoto({
              album: album.name,
              name: f.name,
              type: f.type,
              size: f.size,
              enc: false,
              blob: f,
            });
          }
        } catch (e) {
          console.error("上传失败：", e);
        }
      }
      await upsertAlbum({ ...album, updatedAt: Date.now() });
      await loadPhotos();
      renderAlbums(); // 刷新外层列表时间
      uploadInput.value = "";
    };

    // 事件：选择模式
    let forceSelecting = false;
    chooseBtn.onclick = () => {
      forceSelecting = !forceSelecting;
      state.selecting = forceSelecting;
      if (!state.selecting) state.selected.clear();
      chooseBtn.textContent = state.selecting ? "退出选择" : "选择照片";
    };
    selectAllBtn.onclick = () => {
      if (!state.photos.length) return;
      const allSelected = state.photos.every((p) => state.selected.has(p.id));
      if (allSelected) state.selected.clear();
      else state.photos.forEach((p) => state.selected.add(p.id));
      renderPhotos();
    };

    // 事件：回收站切换与删除/恢复
    toggleTrashBtn.onclick = async () => {
      state.viewingTrash = !state.viewingTrash;
      state.selected.clear();
      toggleTrashBtn.textContent = state.viewingTrash ? "返回相册" : "查看回收站";
      removeBtn.textContent = state.viewingTrash ? "批量删除（回收站）" : "批量删除";
      await loadPhotos();
    };
    removeBtn.onclick = async () => {
      const ids = [...state.selected];
      if (!ids.length) {
        alert("请先选择照片");
        return;
      }
      if (!state.viewingTrash) {
        await markDeleted(ids, true);
      } else {
        // 回收站中点击“批量删除”也按软删除逻辑（保持一致），真正清空用“彻底删除”
        await markDeleted(ids, true);
      }
      state.selected.clear();
      await loadPhotos();
    };
    restoreBtn.onclick = async () => {
      const ids = [...state.selected];
      if (!ids.length) {
        alert("请先选择照片");
        return;
      }
      await markDeleted(ids, false);
      state.selected.clear();
      await loadPhotos();
    };
    purgeBtn.onclick = async () => {
      const ids = [...state.selected];
      if (!ids.length) {
        alert("请先选择照片");
        return;
      }
      if (!state.viewingTrash) {
        alert("请先切换到回收站再进行彻底删除");
        return;
      }
      if (!confirm("确定要彻底删除所选照片吗？此操作不可恢复！")) return;
      await purgePhotos(ids);
      state.selected.clear();
      await loadPhotos();
    };

    // 将管理界面替换相册列表
    const listBox = root.getElementById("albumList");
    listBox.innerHTML = "";
    listBox.append(box);
    await loadPhotos();
  }

  // ========== 启动 ==========
  openDB()
    .then((db) => {
      DB = db;
      loadLogs();
      renderAlbums();
    })
    .catch((err) => {
      const errBox = h(
        "div",
        { class: "helper" },
        "IndexedDB 初始化失败：",
        String(err)
      );
      app.append(errBox);
    });
})();
