/* assets/fit-extensions.js */
(function () {
  // ========= 轻量 DOM =========
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

  // ========= 挂载点 / Shadow =========
  const mount = document.getElementById("fit-extensions");
  if (!mount) {
    console.warn("[FitKnow] 未找到挂载点 #fit-extensions，已跳过");
    return;
  }
  const root = mount.attachShadow({ mode: "open" });

  // ========= 样式 =========
  const style = h("style", {
    html: `
    :host{all:initial}
    :root{ --bg:#0e0f13; --panel:#11131a; --card:#151823; --muted:#9aa3b2; --text:#e6e9ef; --accent:#6ee7b7; --danger:#ef4444; --ring:rgba(110,231,183,.35); --shadow:0 10px 30px rgba(0,0,0,.25); --radius:14px;}
    .wrap{ font:14px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; color:var(--text)}
    .grid{ display:grid; grid-template-columns:1fr 1fr; gap:16px }
    @media (max-width:900px){ .grid{ grid-template-columns:1fr } }
    .card{ background:linear-gradient(180deg,rgba(21,24,35,.85),rgba(21,24,35,.65)); border:1px solid rgba(255,255,255,.08); border-radius:var(--radius); box-shadow:var(--shadow); overflow:hidden }
    .card-hd{ display:flex; align-items:center; gap:12px; padding:14px 16px; border-bottom:1px solid rgba(255,255,255,.06)}
    .title{ font-weight:700 }
    .muted{ color:var(--muted) }
    .body{ padding:14px 16px }
    .row{ display:flex; gap:10px; align-items:center; flex-wrap:wrap }
    .input,.select,.textarea{ background:#0b0c10; border:1px solid rgba(255,255,255,.12); color:var(--text); padding:8px 10px; border-radius:10px; outline:none }
    .input,.select{ height:36px }
    .textarea{ width:100%; min-height:100px; resize:vertical }
    .btn{ background:linear-gradient(135deg, rgba(110,231,183,.16), rgba(255,255,255,.06)); border:1px solid rgba(255,255,255,.14); color:var(--text); padding:8px 12px; border-radius:10px; cursor:pointer; user-select:none }
    .btn:hover{ filter:brightness(1.05) }
    .btn-accent{ border-color:rgba(110,231,183,.45) }
    .btn-danger{ background:linear-gradient(135deg, rgba(239,68,68,.18), rgba(255,255,255,.06)); border-color:rgba(239,68,68,.5) }
    .btn-ghost{ background:transparent; border-color:rgba(255,255,255,.12) }
    .right{ margin-left:auto }
    .sep{ height:1px; background:rgba(255,255,255,.08); margin:12px 0 }
    .list{ display:flex; flex-direction:column; gap:10px }
    .helper{ color:var(--muted); font-size:12px }
    .pill{ border:1px solid rgba(255,255,255,.2); padding:4px 10px; border-radius:999px }
    .flex{ display:flex; gap:10px; align-items:center }
    .badge{ border:1px solid rgba(255,255,255,.15); padding:2px 8px; border-radius:999px; font-size:12px; color:var(--muted) }
    .badge-lock{ border-color:rgba(110,231,183,.45); color:#b7ffe6 }
    .thumbs{ display:grid; grid-template-columns:repeat(6, 1fr); gap:10px; margin-top:10px }
    @media (max-width:1100px){ .thumbs{ grid-template-columns:repeat(4,1fr) } }
    @media (max-width:700px){ .thumbs{ grid-template-columns:repeat(3,1fr) } }
    .ph{ position:relative; background:#0b0c10; border:1px solid rgba(255,255,255,.08); border-radius:12px; overflow:hidden; aspect-ratio:1/1; display:flex; align-items:center; justify-content:center }
    .ph img{ width:100%; height:100%; object-fit:cover }
    .ph input[type="checkbox"]{ position:absolute; top:6px; left:6px; transform:scale(1.1) }
    .ph .del{ position:absolute; right:6px; top:6px; font-size:12px; padding:4px 6px; border-radius:8px; background:rgba(239,68,68,.8); color:#fff; cursor:pointer }
    .toolbar{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:10px }
    .spacer{ flex:1 }
  `,
  });

  // ========= 容器 =========
  const app = h("div", { class: "wrap" });

  // 顶部标签
  const tabs = h(
    "div",
    { class: "row", style: "margin-bottom:12px" },
    h("span", { class: "pill" }, "🏋️‍♀️ 训练笔记"),
    h("span", { class: "pill" }, "🖼️ 相册（可加密）"),
    h(
      "span",
      { class: "right helper" },
      "数据保存在本机浏览器，可导出 JSON 备份。"
    )
  );

  // ========= IndexedDB =========
  let db;
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("fitknow", 3); // **版本 3：避免你之前的 VersionError**
      req.onupgradeneeded = (ev) => {
        const d = ev.target.result;
        // notes
        if (!d.objectStoreNames.contains("logs")) {
          const s = d.createObjectStore("logs", { keyPath: "id", autoIncrement: true });
          s.createIndex("ts", "ts");
        }
        // albums
        if (!d.objectStoreNames.contains("albums")) {
          const s = d.createObjectStore("albums", { keyPath: "name" });
          s.createIndex("updatedAt", "updatedAt");
        }
        // photos
        if (!d.objectStoreNames.contains("photos")) {
          const s = d.createObjectStore("photos", { keyPath: "id", autoIncrement: true });
          s.createIndex("album", "album");
          s.createIndex("album_trash", ["album", "trash"]);
        }
      };
      req.onsuccess = () => {
        db = req.result;
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }
  const tx = (store, mode = "readonly") => db.transaction(store, mode).objectStore(store);

  // ========= Notes API =========
  function addLog(log) {
    return new Promise((res, rej) => {
      const s = tx("logs", "readwrite");
      const put = s.add(log);
      put.onsuccess = res;
      put.onerror = () => rej(put.error);
    });
  }
  function listLogs() {
    return new Promise((res, rej) => {
      const s = tx("logs");
      const idx = s.index("ts");
      const out = [];
      idx.openCursor(null, "prev").onsuccess = (e) => {
        const c = e.target.result;
        if (c) {
          out.push(c.value);
          c.continue();
        } else res(out);
      };
      idx.openCursor().onerror = () => rej(idx.error);
    });
  }
  function delLog(id) {
    return new Promise((res, rej) => {
      const s = tx("logs", "readwrite");
      const d = s.delete(id);
      d.onsuccess = res;
      d.onerror = () => rej(d.error);
    });
  }

  // ========= Crypto 工具 =========
  const textEnc = new TextEncoder();
  const textDec = new TextDecoder();
  const sessionKeys = new Map(); // name -> CryptoKey（仅本会话）

  async function pbkdf2KeyFromPassword(password, saltB64) {
    const salt = base64ToBytes(saltB64);
    const baseKey = await crypto.subtle.importKey(
      "raw",
      textEnc.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: 120000 },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
    return key;
  }
  function bytesToBase64(u8) {
    let s = "";
    u8.forEach((b) => (s += String.fromCharCode(b)));
    return btoa(s);
  }
  function base64ToBytes(b64) {
    const s = atob(b64);
    const u8 = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
    return u8;
  }
  async function encryptBytes(bytes, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes);
    return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(ct)) };
  }
  async function decryptBytes(enc, key) {
    const iv = base64ToBytes(enc.iv);
    const ct = base64ToBytes(enc.data);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new Uint8Array(pt);
  }

  // ========= Albums API =========
  function listAlbums() {
    return new Promise((res, rej) => {
      const s = tx("albums");
      const idx = s.index("updatedAt");
      const out = [];
      idx.openCursor(null, "prev").onsuccess = (e) => {
        const c = e.target.result;
        if (c) {
          out.push(c.value);
          c.continue();
        } else res(out);
      };
      idx.openCursor().onerror = () => rej(idx.error);
    });
  }
  function getAlbum(name) {
    return new Promise((res, rej) => {
      const s = tx("albums");
      const g = s.get(name);
      g.onsuccess = () => res(g.result || null);
      g.onerror = () => rej(g.error);
    });
  }
  function upsertAlbum(album) {
    album.updatedAt = Date.now();
    if (!album.createdAt) album.createdAt = album.updatedAt;
    return new Promise((res, rej) => {
      const s = tx("albums", "readwrite");
      const put = s.put(album);
      put.onsuccess = res;
      put.onerror = () => rej(put.error);
    });
  }

  // 新建/更新相册（可设置密码）
  async function createOrUpdateAlbumFromInputs() {
    const name = root.getElementById("albumName").value.trim();
    const pwd = root.getElementById("albumPassword").value;
    if (!name) {
      alert("请填写相册名称");
      return;
    }
    const exist = await getAlbum(name);
    const album = exist ? { ...exist } : { name };
    if (pwd) {
      // 生成/或复用 salt，创建 verify
      const salt = album.salt || bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
      const key = await pbkdf2KeyFromPassword(pwd, salt);
      const verify = await encryptBytes(textEnc.encode("FITOK"), key);
      album.locked = true;
      album.salt = salt;
      album.verify = verify;
      sessionKeys.set(name, key); // 便于随即打开
    } else {
      album.locked = false;
      delete album.salt;
      delete album.verify;
      sessionKeys.delete(name);
    }
    await upsertAlbum(album);
    root.getElementById("albumName").value = "";
    root.getElementById("albumPassword").value = "";
    await renderAlbums();
  }

  // 照片 CRUD
  function addPhotoRec(rec) {
    return new Promise((res, rej) => {
      const s = tx("photos", "readwrite");
      const put = s.add(rec);
      put.onsuccess = res;
      put.onerror = () => rej(put.error);
    });
  }
  function listPhotosByAlbum(name, wantTrash = false) {
    return new Promise((res, rej) => {
      const s = tx("photos");
      const idx = s.index("album_trash");
      const range = IDBKeyRange.only([name, wantTrash]);
      const out = [];
      idx.openCursor(range, "prev").onsuccess = (e) => {
        const c = e.target.result;
        if (c) {
          out.push(c.value);
          c.continue();
        } else res(out);
      };
      idx.openCursor().onerror = () => rej(idx.error);
    });
  }
  function markTrash(ids, onOff) {
    return new Promise((res, rej) => {
      const s = tx("photos", "readwrite");
      let left = ids.length;
      if (!left) return res();
      ids.forEach((id) => {
        const g = s.get(id);
        g.onsuccess = () => {
          const v = g.result;
          if (!v) {
            if (--left === 0) res();
            return;
          }
          v.trash = !!onOff;
          const p = s.put(v);
          p.onsuccess = () => {
            if (--left === 0) res();
          };
          p.onerror = () => rej(p.error);
        };
        g.onerror = () => rej(g.error);
      });
    });
  }
  function deletePhotos(ids) {
    return new Promise((res, rej) => {
      const s = tx("photos", "readwrite");
      let left = ids.length;
      if (!left) return res();
      ids.forEach((id) => {
        const d = s.delete(id);
        d.onsuccess = () => {
          if (--left === 0) res();
        };
        d.onerror = () => rej(d.error);
      });
    });
  }

  // **删除整本相册（含所有照片 + 清理会话密钥）**
  async function deleteAlbumDeep(name) {
    // 删相册内所有照片
    await new Promise((res, rej) => {
      const s = tx("photos", "readwrite");
      const idx = s.index("album");
      const range = IDBKeyRange.only(name);
      const req = idx.openCursor(range);
      req.onsuccess = () => {
        const cur = req.result;
        if (cur) {
          s.delete(cur.primaryKey);
          cur.continue();
        } else res();
      };
      req.onerror = () => rej(req.error);
    });
    // 删相册
    await new Promise((res, rej) => {
      const s = tx("albums", "readwrite");
      const d = s.delete(name);
      d.onsuccess = res;
      d.onerror = () => rej(d.error);
    });
    sessionKeys.delete(name);
  }

  // ========= UI：训练笔记 =========
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
        h(
          "select",
          { class: "select", id: "rating", title: "主观强度 RPE" },
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
          class: "textarea",
          id: "exercises",
          placeholder: "动作清单（每行一个：动作 | 组数x次数 | 重量）\n例：卧推 | 4x6 | 60kg",
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
        h("button", { class: "btn btn-accent", id: "saveLog" }, "保存记录"),
        h("button", { class: "btn btn-ghost", id: "exportLogs" }, "导出 JSON")
      ),
      h("div", { class: "sep" }),
      h("div", { class: "list", id: "logList" }, h("div", { class: "helper" }, "暂无记录"))
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
      ts: Date.now(),
    };
    await addLog(log);
    loadLogs();
    ["session", "rating", "exercises", "notes"].forEach((id) => (root.getElementById(id).value = ""));
  }
  async function onExportLogs() {
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
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ========= UI：相册 =========
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

  function fmtTime(t) {
    if (!t) return "";
    const d = new Date(t);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

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
              { class: "btn btn-accent right", onclick: () => openAlbumManager(a.name) },
              "打开"
            ),
            h(
              "button",
              {
                class: "btn btn-danger",
                onclick: async () => {
                  const ok = confirm(`确定删除相册「${a.name}」以及其中所有照片？此操作不可恢复！`);
                  if (!ok) return;
                  await deleteAlbumDeep(a.name);
                  await renderAlbums();
                },
              },
              "删除相册"
            )
          )
        )
      );
      box.append(row);
    });
  }

  // 打开/管理相册
  async function openAlbumManager(name) {
    const album = await getAlbum(name);
    if (!album) {
      alert("相册不存在");
      return;
    }

    let key = sessionKeys.get(name);
    if (album.locked) {
      // 验证密码（解 verify）
      while (!key) {
        const pwd = prompt(`相册「${name}」已加密，请输入密码解锁：`);
        if (pwd == null) return; // 取消
        try {
          const k = await pbkdf2KeyFromPassword(pwd, album.salt);
          const dec = await decryptBytes(album.verify, k);
          if (textDec.decode(dec) === "FITOK") {
            key = k;
            sessionKeys.set(name, key); // 会话缓存
          } else {
            alert("密码不正确");
          }
        } catch (e) {
          alert("密码不正确");
        }
      }
    }

    const listBox = root.getElementById("albumList");
    listBox.innerHTML = "";

    // 工具栏
    const toolbar = h("div", { class: "toolbar" });
    const backBtn = h("button", { class: "btn", onclick: renderAlbums }, "← 返回");

    const fileInput = h("input", {
      type: "file",
      accept: "image/*",
      multiple: true,
      style: "display:none",
    });

    const uploadBtn = h(
      "button",
      {
        class: "btn btn-accent",
        onclick: () => fileInput.click(),
      },
      "上传照片"
    );

    const chooseBtn = h(
      "button",
      {
        class: "btn",
        onclick: () => fileInput.click(),
      },
      "选择照片"
    );

    const selectAllBtn = h(
      "button",
      {
        class: "btn",
        onclick: () => {
          const boxes = listBox.querySelectorAll('input[type="checkbox"].pick');
          const allChecked = Array.from(boxes).every((b) => b.checked);
          boxes.forEach((b) => (b.checked = !allChecked));
        },
      },
      "全选/取消全选"
    );

    let viewingTrash = false;
    const toggleTrashBtn = h(
      "button",
      {
        class: "btn",
        onclick: async () => {
          viewingTrash = !viewingTrash;
          toggleTrashBtn.textContent = viewingTrash ? "查看回收站（已在）" : "查看回收站";
          await renderPhotos();
        },
      },
      "查看回收站"
    );

    const removeBtn = h(
      "button",
      {
        class: "btn btn-danger",
        onclick: async () => {
          const ids = getPickedIds();
          if (!ids.length) {
            alert("先选择要删除的照片");
            return;
          }
          await markTrash(ids, true);
          await renderPhotos();
        },
      },
      "批量删除"
    );

    const restoreBtn = h(
      "button",
      {
        class: "btn",
        onclick: async () => {
          const ids = getPickedIds();
          if (!ids.length) {
            alert("先选择要恢复的照片");
            return;
          }
          await markTrash(ids, false);
          await renderPhotos();
        },
      },
      "恢复所选"
    );

    const purgeBtn = h(
      "button",
      {
        class: "btn btn-danger",
        onclick: async () => {
          const ids = getPickedIds();
          if (!ids.length) {
            alert("先选择要彻底删除的照片");
            return;
          }
          const ok = confirm("确定彻底删除所选照片？此操作不可恢复！");
          if (!ok) return;
          await deletePhotos(ids);
          await renderPhotos();
        },
      },
      "彻底删除（回收站）"
    );

    const deleteAlbumBtn = h(
      "button",
      {
        class: "btn btn-danger",
        onclick: async () => {
          const ok = confirm(`确定删除相册「${name}」以及其中所有照片？此操作不可恢复！`);
          if (!ok) return;
          await deleteAlbumDeep(name);
          await renderAlbums();
        },
      },
      "删除相册"
    );

    toolbar.append(
      backBtn,
      uploadBtn,
      chooseBtn,
      selectAllBtn,
      h("span", { class: "spacer" }),
      toggleTrashBtn,
      removeBtn,
      restoreBtn,
      purgeBtn,
      deleteAlbumBtn,
      fileInput
    );

    listBox.append(
      h(
        "div",
        { class: "card" },
        h(
          "div",
          { class: "body" },
          h("div", { class: "flex" }, h("strong", {}, `相册：${name}`), h("span", { class: "right helper" }, album.locked ? "加密" : "公开")),
          toolbar,
          h("div", { id: "thumbs", class: "thumbs" })
        )
      )
    );

    // 选择集
    function getPickedIds() {
      return Array.from(listBox.querySelectorAll('input[type="checkbox"].pick:checked')).map((b) =>
        Number(b.dataset.id)
      );
    }

    // 渲染照片网格
    async function renderPhotos() {
      const grid = root.getElementById("thumbs");
      grid.innerHTML = "";
      const photos = await listPhotosByAlbum(name, viewingTrash);
      if (!photos.length) {
        grid.append(h("div", { class: "helper", style: "grid-column:1/-1" }, viewingTrash ? "回收站为空" : "尚无照片，点击“上传照片”添加"));
        return;
      }
      for (const p of photos) {
        let blobUrl = "";
        try {
          let bytes;
          if (p.enc) {
            if (!key) throw new Error("no key");
            bytes = await decryptBytes({ iv: p.iv, data: p.data }, key);
          } else {
            bytes = base64ToBytes(p.data);
          }
          const blob = new Blob([bytes], { type: p.mime || "image/jpeg" });
          blobUrl = URL.createObjectURL(blob);
        } catch (e) {
          // 解密失败或其他
          const ph = h(
            "div",
            { class: "ph" },
            h("input", { type: "checkbox", class: "pick", "data-id": String(p.id) }),
            h("div", { class: "helper", style: "text-align:center;padding:8px" }, "无法预览")
          );
          if (!p.trash) {
            ph.append(
              h(
                "span",
                {
                  class: "del",
                  onclick: async () => {
                    await markTrash([p.id], true);
                    await renderPhotos();
                  },
                },
                "删除"
              )
            );
          }
          grid.append(ph);
          continue;
        }

        const ph = h(
          "div",
          { class: "ph" },
          h("input", { type: "checkbox", class: "pick", "data-id": String(p.id) }),
          h("img", { src: blobUrl, alt: p.name || "" })
        );
        if (!p.trash) {
          ph.append(
            h(
              "span",
              {
                class: "del",
                onclick: async () => {
                  await markTrash([p.id], true);
                  await renderPhotos();
                },
              },
              "删除"
            )
          );
        }
        grid.append(ph);
      }
    }

    // 处理上传
    fileInput.onchange = async () => {
      const files = Array.from(fileInput.files || []);
      if (!files.length) return;
      for (const f of files) {
        const buf = new Uint8Array(await f.arrayBuffer());
        let rec;
        if (album.locked) {
          // 加密存
          const enc = await encryptBytes(buf, key);
          rec = {
            album: name,
            name: f.name,
            ts: Date.now(),
            size: f.size,
            mime: f.type || "image/jpeg",
            enc: true,
            iv: enc.iv,
            data: enc.data,
            trash: false,
          };
        } else {
          // 明文存（base64）
          rec = {
            album: name,
            name: f.name,
            ts: Date.now(),
            size: f.size,
            mime: f.type || "image/jpeg",
            enc: false,
            data: bytesToBase64(buf),
            trash: false,
          };
        }
        await addPhotoRec(rec);
      }
      await renderPhotos();
      fileInput.value = "";
    };

    await renderPhotos();
  }

  // ========= App 结构 =========
  const grid = h("div", { class: "grid" }, noteCard, albumCard);
  app.append(tabs, grid);
  root.append(style, app);

  // ========= 事件绑定 =========
  root.getElementById("createAlbum").onclick = createOrUpdateAlbumFromInputs;
  root.getElementById("saveLog").onclick = onSaveLog;
  root.getElementById("exportLogs").onclick = onExportLogs;

  // ========= 启动 =========
  openDB().then(() => {
    loadLogs();
    renderAlbums();
  });
})();
