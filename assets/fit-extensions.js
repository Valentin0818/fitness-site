/* FitKnow 扩展（训练笔记 + 加密相册）
 * - Shadow DOM 无侵入渲染
 * - IndexedDB 本地存储
 * - 相册可选密码（PBKDF2 + AES-GCM），打开时严格校验密码
 * - 照片上传/多选删除/整相册删除
 * - 训练笔记记录/导出 JSON
 */
(function () {
  /* ---------- DOM Helper ---------- */
  const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k.startsWith("on") && typeof v === "function") el[k] = v;
      else if (k === "html") el.innerHTML = v;
      else el.setAttribute(k, v);
    }
    for (const c of children) {
      if (c == null) continue;
      el.append(c.nodeType ? c : document.createTextNode(c));
    }
    return el;
  };

  /* ---------- Mount ---------- */
  const mount = document.getElementById("fit-extensions");
  if (!mount) {
    console.warn("[FitKnow] 未找到 #fit-extensions，脚本跳过");
    return;
  }
  const root = mount.attachShadow({ mode: "open" });

  /* ---------- Styles (Shadow DOM) ---------- */
  const style = h("style", {
    html: `
:host{all:initial}
:root{--bg:#0e0f13;--panel:#121420;--card:#151826;--muted:#9aa3b2;--text:#e6e9ef;--accent:#6ee7b7;--accent2:#7aa2ff;--danger:#ef4444;--ring:rgba(122,162,255,.4);--shadow:0 10px 30px rgba(0,0,0,.25);--r:16px}
*{box-sizing:border-box;font:14px/1.4 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,"PingFang SC","Microsoft YaHei",sans-serif}
.wrap{color:var(--text)}
.grid{display:grid;gap:16px;grid-template-columns:1fr 1fr}
.card{background:linear-gradient(180deg,rgba(21,24,38,.85),rgba(21,24,38,.6));border:1px solid rgba(255,255,255,.08);border-radius:16px;box-shadow:var(--shadow)}
.card-hd{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.06)}
.title{font-weight:700}
.muted{color:var(--muted)}
.body{padding:16px}
.row{display:flex;gap:10px;align-items:center;margin:8px 0}
.input,.select,.textarea{width:100%;background:#0b0c10;border:1px solid rgba(255,255,255,.1);border-radius:12px;color:var(--text);padding:10px 12px;outline:none}
.textarea{min-height:96px;resize:vertical}
.select{padding:8px 10px}
.btn{background:linear-gradient(135deg,rgba(122,162,255,.18),rgba(88,245,165,.18));border:1px solid rgba(255,255,255,.12);border-radius:10px;color:var(--text);padding:8px 12px;cursor:pointer}
.btn:hover{filter:brightness(1.05)}
.btn-ghost{background:transparent;border-color:rgba(255,255,255,.15)}
.btn-accent{background:linear-gradient(135deg,rgba(122,162,255,.28),rgba(88,245,165,.28))}
.btn-danger{background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.35)}
.sep{height:1px;background:rgba(255,255,255,.08);margin:10px -16px}
.list{display:block}
.helper{color:var(--muted)}
.flex{display:flex;align-items:center;gap:10px}
.right{margin-left:auto}
.pill{padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);font-size:12px}
.log-item{border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:10px;margin:10px 0;background:rgba(255,255,255,.02)}
.album-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}
.thumb{position:relative;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,.08);background:#0b0c10}
.thumb img{width:100%;height:120px;object-fit:cover;display:block}
.thumb .bar{display:flex;gap:6px;align-items:center;justify-content:space-between;padding:6px}
.thumb .ck{appearance:auto;transform:scale(1.1)}
.badge{font-size:12px;padding:4px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08)}
@media(max-width:920px){.grid{grid-template-columns:1fr}}
`,
  });

  /* ---------- Crypto helpers ---------- */
  const te = new TextEncoder();
  const td = new TextDecoder();

  function randBytes(n = 16) {
    return crypto.getRandomValues(new Uint8Array(n));
  }

  async function deriveKey(password, salt) {
    const keyMat = await crypto.subtle.importKey(
      "raw",
      te.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt,
        iterations: 150000,
      },
      keyMat,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async function aesEncrypt(arrayBuffer, key) {
    const iv = randBytes(12);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, arrayBuffer);
    return { iv, data: new Uint8Array(ct) };
  }

  async function aesDecrypt(iv, data, key) {
    return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  }

  /* ---------- IndexedDB ---------- */
  async function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("fitknow", 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("albums")) {
          db.createObjectStore("albums", { keyPath: "name" });
        }
        if (!db.objectStoreNames.contains("photos")) {
          const os = db.createObjectStore("photos", { keyPath: "id", autoIncrement: true });
          os.createIndex("by_album", "album", { unique: false });
        }
        if (!db.objectStoreNames.contains("logs")) {
          db.createObjectStore("logs", { keyPath: "id", autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  let _db;
  async function db() {
    if (!_db) _db = await openDB();
    return _db;
  }

  // albums
  async function upsertAlbum(album) {
    const d = await db();
    await new Promise((res, rej) => {
      const tx = d.transaction("albums", "readwrite");
      tx.objectStore("albums").put({ ...album, updatedAt: Date.now() });
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  }
  async function listAlbums() {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction("albums", "readonly");
      const req = tx.objectStore("albums").getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    });
  }
  async function deleteAlbumRecord(name) {
    const d = await db();
    await new Promise((res, rej) => {
      const tx = d.transaction("albums", "readwrite");
      tx.objectStore("albums").delete(name);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  }

  // photos
  async function addPhoto(rec) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction("photos", "readwrite");
      tx.objectStore("photos").put(rec);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  }
  async function listPhotosByAlbum(name) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction("photos", "readonly");
      const idx = tx.objectStore("photos").index("by_album");
      const req = idx.getAll(name);
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    });
  }
  async function deletePhoto(id) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction("photos", "readwrite");
      tx.objectStore("photos").delete(id);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  }
  async function deletePhotosByAlbum(name) {
    const d = await db();
    const all = await listPhotosByAlbum(name);
    await Promise.all(all.map((p) => deletePhoto(p.id)));
  }

  // logs
  async function addLog(rec) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction("logs", "readwrite");
      tx.objectStore("logs").put(rec);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  }
  async function listLogs() {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction("logs", "readonly");
      const req = tx.objectStore("logs").getAll();
      req.onsuccess = () => {
        const arr = (req.result || []).sort((a, b) => (b.ts || 0) - (a.ts || 0));
        res(arr);
      };
      req.onerror = () => rej(req.error);
    });
  }
  async function delLog(id) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction("logs", "readwrite");
      tx.objectStore("logs").delete(id);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  }

  /* ---------- App State ---------- */
  const state = {
    currentAlbum: null, // {name, locked, salt?}
    albumKey: null, // CryptoKey for current album
    selected: new Set(), // photo ids
  };

  /* ---------- UI: Notes Card ---------- */
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
        (() => {
          const sel = h(
            "select",
            { id: "rating", class: "select", title: "主观强度 RPE" },
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
        h(
          "button",
          {
            class: "btn btn-accent",
            id: "saveLog",
            onclick: onSaveLog,
          },
          "保存记录"
        ),
        h(
          "button",
          { class: "btn btn-ghost", id: "exportLogs", onclick: onExportLogs },
          "导出 JSON"
        )
      ),
      h("div", { class: "sep" }),
      h("div", { id: "logList", class: "list" }, h("div", { class: "helper" }, "暂无记录"))
    )
  );

  async function onSaveLog() {
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
    ["session", "rating", "exercises", "notes"].forEach((id) => (root.getElementById(id).value = ""));
    loadLogs();
  }

  async function onExportLogs() {
    const data = await listLogs();
    const blob = new Blob(
      [JSON.stringify({ type: "fitknow-logs", version: 1, data }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fitknow-logs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

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
        h("div", { class: "flex" }, h("h4", {}, head), h("span", { class: "right helper" }, `#${it.id || ""}`)),
        h("pre", { class: "helper", style: "white-space:pre-wrap;margin:6px 0" }, ex),
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

  /* ---------- UI: Albums Card ---------- */
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
          id: "albumName",
          class: "input",
          placeholder: "相册名称（如：增肌期 2025-Q1）",
        }),
        h("input", {
          id: "albumPassword",
          class: "input",
          placeholder: "相册密码（可留空为公开）",
          type: "password",
        }),
        h(
          "button",
          { class: "btn btn-accent", id: "createAlbum", onclick: onCreateOrUpdateAlbum },
          "创建/更新相册"
        )
      ),
      h("div", { id: "albumsList", class: "list" }, h("div", { class: "helper" }, "暂无相册")),
      h("div", { class: "sep" }),
      h(
        "div",
        { id: "albumView", class: "list" },
        h("div", { class: "helper" }, "打开一个相册以管理照片")
      )
    )
  );

  // Album handlers
  async function onCreateOrUpdateAlbum() {
    const name = root.getElementById("albumName").value.trim();
    const pwd = root.getElementById("albumPassword").value;
    if (!name) {
      alert("请填写相册名称");
      return;
    }
    const rec = { name, locked: !!pwd };
    if (pwd) rec.salt = randBytes(16);
    await upsertAlbum(rec);
    root.getElementById("albumName").value = "";
    root.getElementById("albumPassword").value = "";
    state.currentAlbum = null;
    state.albumKey = null;
    renderAlbums();
    renderAlbumView();
  }

  async function renderAlbums() {
    const wrap = root.getElementById("albumsList");
    wrap.innerHTML = "";
    const items = await listAlbums();
    if (!items.length) {
      wrap.append(h("div", { class: "helper" }, "暂无相册"));
      return;
    }
    items
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .forEach((a) => {
        const row = h(
          "div",
          { class: "log-item" },
          h(
            "div",
            { class: "flex" },
            h("strong", {}, a.name),
            h("span", { class: "badge" }, a.locked ? "加密" : "公开"),
            h(
              "button",
              {
                class: "btn right",
                onclick: () => openAlbum(a),
                title: "打开相册",
              },
              "打开"
            ),
            h(
              "button",
              {
                class: "btn btn-danger",
                style: "margin-left:8px",
                onclick: async () => {
                  if (!confirm(`确定删除相册「${a.name}」及其所有照片？`)) return;
                  await deletePhotosByAlbum(a.name);
                  await deleteAlbumRecord(a.name);
                  if (state.currentAlbum?.name === a.name) {
                    state.currentAlbum = null;
                    state.albumKey = null;
                  }
                  renderAlbums();
                  renderAlbumView();
                },
              },
              "删除相册"
            )
          ),
          h("div", { class: "helper", style: "margin-top:6px" }, new Date(a.updatedAt || Date.now()).toLocaleString())
        );
        wrap.append(row);
      });
  }

  async function openAlbum(album) {
    state.currentAlbum = album;
    state.albumKey = null;
    if (album.locked) {
      const pwd = prompt("请输入相册密码");
      if (!pwd) return;
      try {
        const key = await deriveKey(pwd, album.salt);
        const photos = await listPhotosByAlbum(album.name);
        // 验证：若有加密照片，尝试解一张
        const one = photos.find((p) => p.enc);
        if (one) {
          await aesDecrypt(one.iv, one.data, key); // 失败即抛
        }
        state.albumKey = key;
      } catch (err) {
        alert("密码错误或数据损坏，无法打开相册。");
        return;
      }
    }
    state.selected.clear();
    renderAlbumView();
  }

  function renderAlbumView() {
    const box = root.getElementById("albumView");
    box.innerHTML = "";
    if (!state.currentAlbum) {
      box.append(h("div", { class: "helper" }, "打开一个相册以管理照片"));
      return;
    }
    const a = state.currentAlbum;

    // Toolbar
    const fileInput = h("input", {
      id: "uploadInput",
      type: "file",
      accept: "image/*",
      multiple: true,
      style: "display:none",
      onchange: (e) => onUploadPhotos(e.target.files),
    });

    const bar = h(
      "div",
      { class: "row" },
      h(
        "button",
        {
          class: "btn",
          onclick: () => {
            state.currentAlbum = null;
            state.albumKey = null;
            state.selected.clear();
            renderAlbumView();
          },
        },
        "← 返回"
      ),
      h("span", { class: "pill" }, a.name),
      h("span", { class: "badge" }, a.locked ? "加密" : "公开"),
      h(
        "button",
        {
          class: "btn btn-accent right",
          onclick: () => fileInput.click(),
        },
        "上传照片"
      )
    );

    const selBar = h(
      "div",
      { class: "row" },
      h(
        "button",
        {
          class: "btn",
          onclick: async () => {
            const all = await listPhotosByAlbum(a.name);
            const ids = all.map((p) => p.id);
            if (state.selected.size === ids.length) state.selected.clear();
            else ids.forEach((id) => state.selected.add(id));
            renderAlbumView();
          },
        },
        "全选/取消全选"
      ),
      h(
        "button",
        {
          class: "btn btn-danger",
          onclick: async () => {
            if (!state.selected.size) return;
            if (!confirm(`确定删除选中的 ${state.selected.size} 张照片？`)) return;
            await Promise.all([...state.selected].map((id) => deletePhoto(id)));
            state.selected.clear();
            renderAlbumView();
          },
        },
        "批量删除"
      )
    );

    box.append(fileInput, bar, selBar, h("div", { id: "albumGrid" }));
    renderAlbumPhotos();
  }

  async function onUploadPhotos(files) {
    if (!state.currentAlbum) {
      alert("请先打开一个相册");
      return;
    }
    const isLocked = !!state.currentAlbum.locked;
    if (isLocked && !state.albumKey) {
      alert("该相册已加密，需要先输入正确密码才能上传。");
      return;
    }
    for (const f of files) {
      const buf = await f.arrayBuffer();
      if (isLocked) {
        const { iv, data } = await aesEncrypt(buf, state.albumKey);
        await addPhoto({
          album: state.currentAlbum.name,
          name: f.name,
          ts: Date.now(),
          enc: true,
          iv,
          data,
        });
      } else {
        await addPhoto({
          album: state.currentAlbum.name,
          name: f.name,
          ts: Date.now(),
          enc: false,
          data: new Blob([buf], { type: f.type || "application/octet-stream" }),
        });
      }
    }
    renderAlbums(); // 更新时间
    renderAlbumPhotos();
  }

  async function renderAlbumPhotos() {
    const grid = root.getElementById("albumGrid");
    if (!grid) return;
    grid.innerHTML = "";
    const a = state.currentAlbum;
    if (!a) return;

    const photos = await listPhotosByAlbum(a.name);
    if (!photos.length) {
      grid.append(h("div", { class: "helper" }, "暂无照片"));
      return;
    }

    grid.className = "album-grid";
    for (const p of photos.sort((x, y) => (y.ts || 0) - (x.ts || 0))) {
      let blob, url;
      if (p.enc) {
        if (!state.albumKey) {
          // 无密钥，显示占位
          const ph = h(
            "div",
            { class: "thumb" },
            h("div", { class: "bar" }, h("span", { class: "helper" }, "受保护图片"))
          );
          grid.append(ph);
          continue;
        }
        try {
          const ab = await aesDecrypt(p.iv, p.data, state.albumKey);
          blob = new Blob([ab], { type: "image/*" });
        } catch (err) {
          const ph = h(
            "div",
            { class: "thumb" },
            h("div", { class: "bar" }, h("span", { class: "helper" }, "解密失败"))
          );
          grid.append(ph);
          continue;
        }
      } else {
        blob = p.data;
      }
      url = URL.createObjectURL(blob);
      const checked = state.selected.has(p.id);

      const card = h(
        "div",
        { class: "thumb" },
        h("img", { src: url, alt: p.name }),
        h(
          "div",
          { class: "bar" },
          h("input", {
            type: "checkbox",
            class: "ck",
            checked,
            onchange: (e) => {
              if (e.target.checked) state.selected.add(p.id);
              else state.selected.delete(p.id);
            },
            title: "选择",
          }),
          h(
            "div",
            { class: "flex right" },
            h("span", { class: "helper" }, p.name.split("/").pop()),
            h(
              "button",
              {
                class: "btn btn-danger",
                style: "margin-left:8px",
                onclick: async () => {
                  if (!confirm(`删除「${p.name}」？`)) return;
                  await deletePhoto(p.id);
                  state.selected.delete(p.id);
                  renderAlbumPhotos();
                },
              },
              "删除"
            )
          )
        )
      );

      grid.append(card);
    }
  }

  /* ---------- Compose App ---------- */
  const tabs = h(
    "div",
    { class: "row", style: "margin-bottom:12px" },
    h("span", { class: "pill" }, "🏋️‍♀️ 训练笔记"),
    h("span", { class: "pill" }, "🖼️ 相册（可加密）"),
    h("span", { class: "right helper" }, "数据保存在本机浏览器，可导出 JSON 备份。")
  );
  const app = h("div", { class: "wrap" }, tabs, h("div", { class: "grid" }, noteCard, albumCard));
  root.append(style, app);

  // init
  openDB().then(() => {
    loadLogs();
    renderAlbums();
    renderAlbumView();
  });
})();
