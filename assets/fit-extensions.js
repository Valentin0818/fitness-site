(function () {
  // ---------- 小工具 ----------
  const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k.startsWith("on") && typeof v === "function") el[k] = v;
      else if (k === "html") el.innerHTML = v;
      else el.setAttribute(k, v);
    }
    for (const child of children) {
      if (child == null) continue;
      el.append(child.nodeType ? child : document.createTextNode(child));
    }
    return el;
  };

  const mount = document.getElementById("fit-extensions");
  if (!mount) {
    console.warn("[FitKnow] 未找到挂载点 #fit-extensions，脚本跳过。");
    return;
  }
  const root = mount.attachShadow({ mode: "open" });

  // ---------- 样式 ----------
  const style = h("style", {
    html: `
:host{all:initial}
:root{--bg:#0e0f13;--card:#151823;--muted:#9aa3b2;--accent:#6ee7b7;--text:#e6e9ef;--danger:#ef4444;--ring:#7aa2ff66;--shadow:0 10px 30px rgba(0,0,0,.25)}
*,*::before,*::after{box-sizing:border-box}
.wrap{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;color:var(--text)}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media (max-width:900px){.grid{grid-template-columns:1fr}}
.card{background:linear-gradient(180deg,rgba(21,24,35,.9),rgba(21,24,35,.6));border:1px solid rgba(255,255,255,.08);border-radius:16px;box-shadow:var(--shadow);overflow:hidden}
.card-hd{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08)}
.title{font-weight:700}
.muted{color:var(--muted);font-size:12px}
.body{padding:14px 16px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.input,.select,.textarea{background:#0a0b10;border:1px solid rgba(255,255,255,.12);color:var(--text);border-radius:10px;padding:8px 10px;font-size:14px}
.input, .select{height:36px}
.textarea{width:100%;min-height:90px;resize:vertical}
.pill{padding:6px 10px;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(255,255,255,.06)}
.helper{color:var(--muted);font-size:12px}
.sep{height:1px;background:rgba(255,255,255,.08);margin:10px 0}
.list{display:flex;flex-direction:column;gap:10px}
.btn{cursor:pointer;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:var(--text);border-radius:10px;padding:8px 12px;font-size:13px}
.btn:hover{filter:brightness(1.06)}
.btn-accent{background:linear-gradient(135deg,rgba(110,231,183,.22),rgba(122,162,255,.22));border-color:rgba(255,255,255,.22)}
.btn-danger{background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.35)}
.btn-ghost{background:transparent}
.flex{display:flex;align-items:center;gap:10px}
.right{margin-left:auto}
.log-item{border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px 12px;background:rgba(255,255,255,.03)}

.album-card{position:relative;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px 12px;background:rgba(255,255,255,.03)}
.album-actions{position:absolute;top:10px;right:10px;display:flex;gap:8px}
.badge{padding:2px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);font-size:11px}

.toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
.thumb-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}
@media (max-width:1100px){.thumb-grid{grid-template-columns:repeat(4,1fr)}}
@media (max-width:700px){.thumb-grid{grid-template-columns:repeat(3,1fr)}}
.thumb{position:relative;border:1px solid rgba(255,255,255,.10);border-radius:10px;overflow:hidden;background:#0a0b10}
.thumb img{display:block;width:100%;height:120px;object-fit:cover}
.chk{position:absolute;top:6px;left:6px;transform:scale(1.1)}
.kebab{position:absolute;top:6px;right:6px;background:rgba(0,0,0,.35);backdrop-filter:blur(6px);padding:4px 6px;border:1px solid rgba(255,255,255,.2);border-radius:8px;font-size:12px}
.empty{border:1px dashed rgba(255,255,255,.2);border-radius:12px;padding:26px;text-align:center}
    `,
  });

  // ---------- IndexedDB ----------
  const DB_NAME = "fitknow-db";
  const DB_VER = 3;
  let db;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = (e) => {
        const d = req.result;
        // 日志
        if (!d.objectStoreNames.contains("logs")) {
          const s = d.createObjectStore("logs", { keyPath: "id", autoIncrement: true });
          s.createIndex("ts", "ts");
        }
        // 相册
        if (!d.objectStoreNames.contains("albums")) {
          const s = d.createObjectStore("albums", { keyPath: "id", autoIncrement: true });
          s.createIndex("name", "name", { unique: true });
        }
        // 照片
        if (!d.objectStoreNames.contains("photos")) {
          const s = d.createObjectStore("photos", { keyPath: "id", autoIncrement: true });
          s.createIndex("albumId", "albumId");
          s.createIndex("albumId_isDeleted", ["albumId", "isDeleted"]);
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

  // ---------- 日志 CRUD ----------
  const addLog = (log) =>
    new Promise((res, rej) => {
      const req = tx(["logs"], "readwrite").objectStore("logs").add(log);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  const delLog = (id) =>
    new Promise((res, rej) => {
      const req = tx(["logs"], "readwrite").objectStore("logs").delete(id);
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    });
  function listLogs() {
    return new Promise((res, rej) => {
      const s = tx(["logs"]).objectStore("logs").index("ts");
      const out = [];
      s.openCursor(null, "prev").onsuccess = (e) => {
        const c = e.target.result;
        if (c) {
          out.push(c.value);
          c.continue();
        } else res(out);
      };
      s.openCursor().onerror = () => rej();
    });
  }

  // ---------- 相册 CRUD ----------
  const upsertAlbum = (album) =>
    new Promise((res, rej) => {
      const s = tx(["albums"], "readwrite").objectStore("albums");
      const req = album.id ? s.put(album) : s.add({ ...album, createdAt: Date.now() });
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  const listAlbums = () =>
    new Promise((res, rej) => {
      const s = tx(["albums"]).objectStore("albums");
      const out = [];
      s.openCursor().onsuccess = (e) => {
        const c = e.target.result;
        if (c) {
          out.push(c.value);
          c.continue();
        } else res(out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
      };
      s.openCursor().onerror = () => rej();
    });
  const getAlbum = (id) =>
    new Promise((res, rej) => {
      const req = tx(["albums"]).objectStore("albums").get(id);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  const deleteAlbum = (id) =>
    new Promise((res, rej) => {
      const req = tx(["albums"], "readwrite").objectStore("albums").delete(id);
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    });

  // ---------- 照片 CRUD ----------
  const addPhoto = (p) =>
    new Promise((res, rej) => {
      const req = tx(["photos"], "readwrite").objectStore("photos").add(p);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  const putPhoto = (p) =>
    new Promise((res, rej) => {
      const req = tx(["photos"], "readwrite").objectStore("photos").put(p);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  const deletePhotoHard = (id) =>
    new Promise((res, rej) => {
      const req = tx(["photos"], "readwrite").objectStore("photos").delete(id);
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    });
  function listPhotos(albumId, isDeleted = 0) {
    return new Promise((res, rej) => {
      const idx = tx(["photos"]).objectStore("photos").index("albumId_isDeleted");
      const out = [];
      idx.openCursor(IDBKeyRange.only([albumId, isDeleted])).onsuccess = (e) => {
        const c = e.target.result;
        if (c) {
          out.push(c.value);
          c.continue();
        } else res(out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
      };
      idx.openCursor().onerror = () => rej();
    });
  }

  // 删除相册（深度）：删除相册记录 + 其下所有照片
  async function deleteAlbumDeep(albumId) {
    const photos = await listPhotos(albumId, 0);
    const trash = await listPhotos(albumId, 1);
    for (const p of photos.concat(trash)) {
      await deletePhotoHard(p.id);
    }
    await deleteAlbum(albumId);
  }

  // ---------- 加密（可选） ----------
  async function deriveKey(password) {
    const enc = new TextEncoder();
    const salt = enc.encode("fitknow-album-salt");
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }
  async function encryptBytes(key, bytes) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes);
    const blob = new Blob([iv, new Uint8Array(ct)]);
    return blob;
  }
  async function decryptBytes(key, blob) {
    const buf = await blob.arrayBuffer();
    const all = new Uint8Array(buf);
    const iv = all.slice(0, 12);
    const data = all.slice(12);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return new Blob([pt]);
  }

  // ---------- 视图骨架 ----------
  const app = h("div", { class: "wrap" });
  const tabs = h(
    "div",
    { class: "row", style: "margin-bottom:12px" },
    h("span", { class: "pill" }, "🏋️‍♀️ 训练笔记"),
    h("span", { class: "pill" }, "🖼️ 相册（可加密）"),
    h("span", { class: "right helper" }, "数据保存在本机浏览器，可导出 JSON 备份。")
  );

  // 训练笔记卡片
  const noteCard = h(
    "div",
    { class: "card" },
    h("div", { class: "card-hd" }, h("div", { class: "title" }, "训练笔记"), h("div", { class: "muted" }, "记录每次训练、动作与感受")),
    h(
      "div",
      { class: "body" },
      h(
        "div",
        { class: "row" },
        h("input", { class: "input", id: "date", type: "date" }),
        h("input", { class: "input", id: "session", placeholder: "本次训练主题（如：胸 + 三头）" }),
        h(
          "select",
          { class: "select", id: "rating", title: "主观强度 RPE" },
          h("option", { value: "" }, "强度（RPE）"),
          ...Array.from({ length: 10 }, (_, i) => h("option", { value: String(i + 1) }, String(i + 1)))
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
      h("div", { class: "row" }, h("textarea", { class: "textarea", id: "notes", placeholder: "主观感受、疼痛与技术要点…" })),
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
              ["session", "rating", "exercises", "notes"].forEach((id) => (root.getElementById(id).value = ""));
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
              const blob = new Blob([JSON.stringify({ type: "fitknow-logs", version: 1, data }, null, 2)], {
                type: "application/json",
              });
              const url = URL.createObjectURL(blob);
              const a = h("a", { href: url, download: `fitknow-logs-${new Date().toISOString().slice(0, 10)}.json` });
              root.append(a);
              a.click();
              URL.revokeObjectURL(url);
              a.remove();
            },
          },
          "导出 JSON"
        )
      ),
      h("div", { class: "sep" }),
      h("div", { class: "list", id: "logList" }, h("div", { class: "empty helper" }, "暂无记录"))
    )
  );

  function renderLogs(items) {
    const box = root.getElementById("logList");
    box.innerHTML = "";
    if (!items.length) {
      box.append(h("div", { class: "empty helper" }, "暂无记录"));
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
        h("div", { class: "flex" }, h("h4", {}, head), h("span", { class: "right helper" }, `#${it.id}`)),
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

  // 相册卡片
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
      { class: "body", id: "albumPanel" },
      // 顶部创建/更新
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
          {
            class: "btn btn-accent",
            id: "createAlbum",
            onclick: async () => {
              const name = root.getElementById("albumName").value.trim();
              const pwd = root.getElementById("albumPassword").value;
              if (!name) {
                alert("请填写相册名称");
                return;
              }
              const all = await listAlbums();
              const exist = all.find((a) => a.name === name);
              const album = exist ? { ...exist } : { name };
              album.locked = !!pwd; // 仅记录是否加密，不保存密码
              const id = await upsertAlbum(album);
              root.getElementById("albumName").value = "";
              root.getElementById("albumPassword").value = "";
              renderAlbumList();
              // 如果是新相册，直接打开
              openAlbum(exist ? album.id : id);
            },
          },
          "创建/更新相册"
        )
      ),
      h("div", { id: "albumList", class: "list" }, h("div", { class: "empty helper" }, "暂无相册"))
    )
  );

  // 渲染相册列表
  async function renderAlbumList() {
    const box = root.getElementById("albumList");
    box.innerHTML = "";
    const albums = await listAlbums();
    if (!albums.length) {
      box.append(h("div", { class: "empty helper" }, "暂无相册"));
      return;
    }
    for (const a of albums) {
      const live = await listPhotos(a.id, 0);
      const trash = await listPhotos(a.id, 1);
      const card = h(
        "div",
        { class: "album-card" },
        h("div", { class: "album-actions" },
          h("button", {
            class: "btn btn-danger",
            title: "删除相册（连同其所有照片）",
            onclick: async () => {
              if (!confirm(`确定要删除相册「${a.name}」及其所有照片吗？此操作不可恢复。`)) return;
              await deleteAlbumDeep(a.id);
              renderAlbumList();
            }
          }, "🗑 删除相册")
        ),
        h(
          "div",
          { class: "flex" },
          h("div", {}, h("strong", {}, a.name)),
          h("span", { class: "badge" }, a.locked ? "加密" : "公开"),
          h("span", { class: "right helper" }, new Date(a.createdAt || Date.now()).toLocaleString())
        ),
        h(
          "div",
          { class: "row", style: "margin-top:8px" },
          h(
            "button",
            {
              class: "btn btn-accent",
              onclick: () => openAlbum(a.id),
            },
            "打开"
          )
        ),
        h(
          "div",
          { class: "helper", style: "margin-top:6px" },
          `照片：${live.length}（回收站 ${trash.length}）`
        )
      );
      box.append(card);
    }
  }

  // 打开相册视图
  async function openAlbum(albumId) {
    const album = await getAlbum(albumId);
    if (!album) return;

    const panel = root.getElementById("albumPanel");
    panel.innerHTML = ""; // 清空右侧，进入相册

    // 相册会话状态
    const state = {
      selection: new Set(),
      viewingTrash: false,
      key: null, // AES 密钥
    };

    async function ensureKeyIfLocked() {
      if (!album.locked) return true;
      if (state.key) return true;
      const pwd = prompt(`相册「${album.name}」已加密，请输入密码以解锁：`);
      if (!pwd) return false;
      try {
        state.key = await deriveKey(pwd);
        return true;
      } catch {
        alert("解锁失败");
        return false;
      }
    }

    // 工具条
    const fileInput = h("input", { type: "file", accept: "image/*", multiple: true, style: "display:none" });
    const toolbar = h(
      "div",
      { class: "toolbar" },
      h(
        "button",
        {
          class: "btn",
          onclick: () => {
            // 返回相册列表
            panel.innerHTML = "";
            panel.append(
              h(
                "div",
                { class: "row" },
                h("input", { class: "input", id: "albumName", placeholder: "相册名称（如：增肌期 2025-Q1）" }),
                h("input", {
                  class: "input",
                  id: "albumPassword",
                  placeholder: "相册密码（可留空为公开）",
                  type: "password",
                }),
                h(
                  "button",
                  {
                    class: "btn btn-accent",
                    id: "createAlbum",
                    onclick: async () => {
                      const name = root.getElementById("albumName").value.trim();
                      const pwd = root.getElementById("albumPassword").value;
                      if (!name) {
                        alert("请填写相册名称");
                        return;
                      }
                      const all = await listAlbums();
                      const exist = all.find((x) => x.name === name);
                      const na = exist ? { ...exist } : { name };
                      na.locked = !!pwd;
                      const id = await upsertAlbum(na);
                      root.getElementById("albumName").value = "";
                      root.getElementById("albumPassword").value = "";
                      renderAlbumList();
                      openAlbum(exist ? na.id : id);
                    },
                  },
                  "创建/更新相册"
                )
              ),
              h("div", { id: "albumList", class: "list" })
            );
            renderAlbumList();
          },
        },
        "← 返回"
      ),
      h("strong", {}, album.name),
      h("span", { class: "badge" }, album.locked ? "加密" : "公开"),
      h(
        "button",
        {
          class: "btn btn-accent",
          onclick: async () => {
            if (album.locked && !(await ensureKeyIfLocked())) return;
            fileInput.click();
          },
        },
        "上传照片"
      ),
      h(
        "button",
        {
          class: "btn",
          onclick: () => {
            // 切换回收站/普通
            state.selection.clear();
            state.viewingTrash = !state.viewingTrash;
            renderThumbs();
          },
        },
        () => (state.viewingTrash ? "返回相册" : "查看回收站")
      ),
      h(
        "button",
        {
          class: "btn",
          onclick: () => {
            // 切换选择模式：实际上就是显示复选框
            selecting = !selecting;
            if (!selecting) state.selection.clear();
            renderThumbs();
          },
        },
        "选择照片"
      ),
      h(
        "button",
        {
          class: "btn",
          onclick: () => {
            // 全选/取消
            toggleSelectAll();
          },
        },
        "全选/取消全选"
      ),
      h(
        "button",
        {
          class: "btn btn-danger",
          onclick: async () => {
            if (!state.selection.size) return;
            if (!state.viewingTrash) {
              // 软删除到回收站
              const photos = await listPhotos(albumId, 0);
              const set = new Set(state.selection);
              for (const p of photos) {
                if (set.has(p.id)) {
                  p.isDeleted = 1;
                  await putPhoto(p);
                }
              }
              state.selection.clear();
              renderThumbs();
            } else {
              // 回收站中彻底删除
              if (!confirm("确定要永久删除所选照片吗？此操作不可恢复。")) return;
              const photos = await listPhotos(albumId, 1);
              const set = new Set(state.selection);
              for (const p of photos) {
                if (set.has(p.id)) await deletePhotoHard(p.id);
              }
              state.selection.clear();
              renderThumbs();
            }
          },
        },
        () => (state.viewingTrash ? "彻底删除" : "批量删除（回收站）")
      ),
      h(
        "button",
        {
          class: "btn",
          onclick: async () => {
            if (!state.selection.size) return;
            if (!state.viewingTrash) return;
            // 回收站恢复
            const photos = await listPhotos(albumId, 1);
            const set = new Set(state.selection);
            for (const p of photos) {
              if (set.has(p.id)) {
                p.isDeleted = 0;
                await putPhoto(p);
              }
            }
            state.selection.clear();
            renderThumbs();
          },
        },
        "恢复所选"
      ),
      fileInput
    );

    // 选择模式与缩略图区域
    let selecting = false;
    const grid = h("div", { class: "thumb-grid", id: "thumbGrid" });

    // 文件选择处理
    fileInput.onchange = async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      if (album.locked && !(await ensureKeyIfLocked())) return;

      for (const f of files) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        let dataBlob;
        if (album.locked && state.key) {
          dataBlob = await encryptBytes(state.key, bytes);
        } else {
          dataBlob = new Blob([bytes]);
        }
        await addPhoto({
          albumId,
          isDeleted: 0,
          locked: album.locked ? 1 : 0,
          createdAt: Date.now(),
          name: f.name,
          blob: dataBlob,
        });
      }
      e.target.value = "";
      renderThumbs();
    };

    // 渲染缩略图
    async function renderThumbs() {
      grid.innerHTML = "";
      const list = await listPhotos(albumId, state.viewingTrash ? 1 : 0);
      if (!list.length) {
        grid.append(
          h(
            "div",
            { class: "empty helper", style: "grid-column:1/-1" },
            state.viewingTrash ? "回收站为空" : "还没有照片，点击「上传照片」添加"
          )
        );
        return;
      }
      for (const p of list) {
        const wrap = h("div", { class: "thumb" });
        let blob = p.blob;

        // 展示时尝试解密（加密相册且处于普通视图时）
        if (!state.viewingTrash && p.locked) {
          if (!(await ensureKeyIfLocked())) {
            // 没有密码展示占位
            wrap.append(h("div", { class: "kebab" }, "已加密"));
            wrap.append(h("div", { class: "empty helper" }, "🔒 受保护的照片"));
            grid.append(wrap);
            continue;
          }
          try {
            blob = await decryptBytes(state.key, p.blob);
          } catch {
            wrap.append(h("div", { class: "kebab" }, "无法解密"));
            wrap.append(h("div", { class: "empty helper" }, "❌ 解密失败"));
            grid.append(wrap);
            continue;
          }
        }

        const url = URL.createObjectURL(blob);
        const img = h("img", { src: url, alt: p.name });
        wrap.append(img);

        // 复选框
        if (selecting) {
          const chk = h("input", {
            class: "chk",
            type: "checkbox",
            checked: state.selection.has(p.id),
            onchange: (ev) => {
              if (ev.target.checked) state.selection.add(p.id);
              else state.selection.delete(p.id);
            },
          });
          wrap.append(chk);
        }

        // 单个快速操作
        const kebab = h(
          "div",
          { class: "kebab" },
          !state.viewingTrash
            ? h(
                "button",
                {
                  class: "btn btn-danger",
                  onclick: async () => {
                    p.isDeleted = 1;
                    await putPhoto(p);
                    renderThumbs();
                  },
                },
                "删除"
              )
            : h(
                "div",
                {},
                h(
                  "button",
                  {
                    class: "btn",
                    onclick: async () => {
                      p.isDeleted = 0;
                      await putPhoto(p);
                      renderThumbs();
                    },
                  },
                  "恢复"
                ),
                h(
                  "button",
                  {
                    class: "btn btn-danger",
                    onclick: async () => {
                      if (!confirm("确定永久删除该照片？")) return;
                      await deletePhotoHard(p.id);
                      renderThumbs();
                    },
                  },
                  "彻底删除"
                )
              )
        );
        wrap.append(kebab);

        grid.append(wrap);
      }
    }

    function toggleSelectAll() {
      const set = state.selection;
      const inTrash = state.viewingTrash;
      const fill = async () => {
        const list = await listPhotos(albumId, inTrash ? 1 : 0);
        if (set.size === list.length) set.clear();
        else {
          set.clear();
          list.forEach((p) => set.add(p.id));
        }
        renderThumbs();
      };
      fill();
    }

    // 装载
    panel.append(toolbar, grid);
    renderThumbs();
  }

  // 页面装载
  app.append(tabs, h("div", { class: "grid" }, noteCard, albumCard));
  root.append(style, app);

  // 启动
  openDB().then(() => {
    loadLogs();
    renderAlbumList();
  });
})();
