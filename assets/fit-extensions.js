
 (function(){
   // ===== 工具：简易 DOM =====
   const h = (tag, attrs={}, ...children)=>{
     const el = document.createElement(tag);
     for(const [k,v] of Object.entries(attrs||{})){
       if(k.startsWith('on') && typeof v === 'function') el[k] = v;
       else if(k === 'html') el.innerHTML = v;
       else el.setAttribute(k, v);
     }
     for(const child of children){
       if(child==null) continue;
       el.append(child.nodeType?child:document.createTextNode(child));
     }
     return el;
   };
 
   // ===== Shadow DOM 容器 =====
   const mount = document.getElementById('fit-extensions');
   if(!mount){ console.warn('[FitKnow] 未找到挂载点 #fit-extensions，脚本已跳过'); return; }
   const root = mount.attachShadow({mode:'open'});
 
   // ===== 主题变量（可按需改色） =====
   const style = h('style', {html: `
     :host{ all:initial }
     :root{ --bg:#0e0f13; --card:#151823; --muted:#9aa3b2; --accent:#6ee7b7; --text:#e6e9ef; --danger:#ef4444; --shadow:0 10px 30px rgba(0,0,0,.25); }
@@ -145,88 +134,85 @@ FitKnow 扩展集成包（PR 就绪）
       req.onsuccess = ()=> resolve(req.result);
       req.onerror = ()=> reject(req.error);
     });
   }
 
   // 视图
   const app = h('div', {class:'wrap'});
   const tabs = h('div', {class:'row', style:'margin-bottom:12px'},
     h('span', {class:'pill'}, '🏋️‍♀️ 训练笔记'),
     h('span', {class:'pill'}, '🖼️ 相册（可加密）'),
     h('span', {class:'right helper'}, '数据离线保存在本机浏览器，可导出 JSON 备份。')
   );
 
   // 左：训练笔记
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
-      h('div', {class:'row'}, h('textarea', {class:'textarea', id:'exercises', placeholder:'动作清单（每行一个：动作 | 组数x次数 | 重量）
-例：卧推 | 4x6 | 60kg'})),
+      h('div', {class:'row'}, h('textarea', {class:'textarea', id:'exercises', placeholder:'动作清单（每行一个：动作 | 组数x次数 | 重量）\n例：卧推 | 4x6 | 60kg'})),
       h('div', {class:'row'}, h('textarea', {class:'textarea', id:'notes', placeholder:'主观感受、疼痛与技术要点…'})),
       h('div', {class:'row'},
         h('button', {class:'btn btn-accent', id:'saveLog'}, '保存记录'),
         h('button', {class:'btn btn-ghost', id:'exportLogs'}, '导出 JSON')
       ),
       h('div', {class:'sep'}),
       h('div', {class:'list', id:'logList'}, h('div', {class:'helper'}, '暂无记录'))
     )
   );
 
   // 右：相册（可加密）
   const albumCard = h('div', {class:'card'},
     h('div', {class:'card-hd'}, h('div', {class:'title'}, '健身相册（可加密）'), h('div', {class:'muted'}, '创建相册并选择是否加密')),
     h('div', {class:'body'},
       h('div', {class:'row'},
         h('input', {class:'input', id:'albumName', placeholder:'相册名称（如：增肌期 2025-Q1）'}),
         h('input', {class:'input', id:'albumPassword', placeholder:'相册密码（可留空为公开）', type:'password'}),
         h('button', {class:'btn btn-accent', id:'createAlbum'}, '创建/更新相册')
       ),
       h('div', {id:'albumList', class:'list'}, h('div', {class:'helper'}, '暂无相册'))
     )
   );
 
   const grid = h('div', {class:'grid'}, noteCard, albumCard);
   app.append(tabs, grid);
   root.append(style, app);
 
   function renderLogs(items){
     const box = root.getElementById('logList');
     box.innerHTML='';
     if(!items.length){ box.append(h('div',{class:'helper'},'暂无记录')); return; }
     items.forEach(it=>{
       const head = `${it.date || ''} · ${it.session || '未命名'} · RPE ${it.rating || '-'}`;
-      const ex = (it.exercises||'').split(/
-+/).filter(Boolean).map(line=>`• ${line}`).join('
-');
+      const ex = (it.exercises||'').split(/\n+/).filter(Boolean).map(line=>`• ${line}`).join('\n');
       const el = h('div', {class:'log-item'},
         h('div', {class:'flex'}, h('h4',{}, head), h('span',{class:'right helper'}, `#${it.id}`)),
         h('pre', {class:'helper', style:'white-space:pre-wrap; margin:6px 0'}, ex),
         h('div', {class:'helper', style:'white-space:pre-wrap'}, it.notes||''),
         h('div', {class:'row', style:'margin-top:8px'},
           h('button', {class:'btn btn-danger', onclick: async()=>{ await delLog(it.id); loadLogs(); }}, '删除')
         )
       );
       box.append(el);
     });
   }
 
   async function loadLogs(){ renderLogs(await listLogs()); }
 
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
@@ -301,71 +287,25 @@ FitKnow 扩展集成包（PR 就绪）
       }catch(err){ grid.append(h('div',{class:'helper'},`无法解密 #${p.id}`)); continue; }
       const url = URL.createObjectURL(blob);
       const img = h('img', {src:url, alt:p.name});
       grid.append(img);
     }
   }
 
   async function onCreateAlbum(){
     const name = root.getElementById('albumName').value.trim();
     const pwd = root.getElementById('albumPassword').value;
     if(!name){ alert('请填写相册名称'); return; }
     const all = await listAlbums();
     const exist = all.find(a=> a.name === name);
     const album = exist ? {...exist} : { name };
     album.locked = !!pwd; // 不存密码，仅存标记
     await upsertAlbum(album);
     root.getElementById('albumName').value='';
     root.getElementById('albumPassword').value='';
     renderAlbums();
   }
 
   root.getElementById('createAlbum').onclick = onCreateAlbum;
 
   openDB().then(()=>{ loadLogs(); renderAlbums(); });
 })();
-
-
-========================
-对 index.html 的修改（统一 diff）
-========================
---- a/index.html
-+++ b/index.html
-@@ -1,6 +1,17 @@
- <!DOCTYPE html>
- <html lang="zh-CN">
- <head>
-   <!-- 这里保留你原有的 <meta>、标题和样式 -->
- </head>
- <body>
-   <!-- 这里保留你原有的页面结构（FitKnow 原有内容） -->
-+
-+  <!-- 新增：训练笔记 + 加密相册挂载点（放在你想显示的位置） -->
-+  <section id="extensions" style="margin-top:40px">
-+    <h2 style="display:none">扩展</h2>
-+    <div id="fit-extensions"></div>
-+  </section>
-+
-+  <!-- 新增：扩展脚本（放在临近 </body> 之前即可） -->
-+  <script src="assets/fit-extensions.js"></script>
- </body>
- </html>
-
-
-========================
-提交信息（Commit message）
-========================
-feat: 训练笔记与可选加密相册（本地 IndexedDB + AES-GCM），Shadow DOM 无侵入集成
-
-- 新增 assets/fit-extensions.js
-- 在 index.html 中加入挂载点与脚本引入
-- 数据存储于浏览器 IndexedDB；相册可设置密码后端零依赖
-- 支持导出训练笔记 JSON 备份
-
-
-========================
-使用与注意事项
-========================
-1) 如果你的站点是多页结构，想在任一页面启用，只需在该页面添加挂载点 <div id="fit-extensions"></div> 并引入脚本。
-2) 若你有 CSP（Content Security Policy），需允许 'self' 的 script 与使用 Web Crypto/IndexedDB（大多默认可用）。
-3) 密码仅用于本地派生密钥，不会被存储；请妥善保管，否则无法恢复已加密图片。
-4) 建议定期导出笔记 JSON 做备份；更换设备数据不会自动同步。
 
EOF
)
