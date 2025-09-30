import { listRecords, deleteRecordsByIds, toCSV } from "../logic/history.js";

export function HistoryView(){
  const el=document.createElement("div"); el.className="history-view right-pane";
  let rows=[]; let selected=new Set();

  const create=(t,c,h)=>{const x=document.createElement(t); if(c)x.className=c; if(h!==undefined)x.innerHTML=h; return x;};
  const fmt=(t)=> new Date(t).toLocaleString();

  async function ensureJSZip(){
    if(window.JSZip) return window.JSZip;
    await new Promise((res,rej)=>{const s=document.createElement("script"); s.src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"; s.onload=res; s.onerror=()=>rej(new Error("JSZip load error")); document.head.appendChild(s);});
    return window.JSZip;
  }
  function downloadBlob(name,mime,content){ const blob=content instanceof Blob?content:new Blob([content],{type:mime}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1500); }

  async function refresh(){
    rows = await listRecords();
    const set = new Set(rows.map(r=>r.id));
    selected.forEach(id=>{ if(!set.has(id)) selected.delete(id); });
    renderTable();
  }

  async function onCSV(){ const chosen=rows.filter(r=>selected.has(r.id)); if(!chosen.length) return alert("Select ID(s) first!"); downloadBlob("landmarks.csv","text/csv;charset=utf-8", toCSV(chosen)); }
  async function onZIP(){
    const chosen=rows.filter(r=>selected.has(r.id)); if(!chosen.length) return alert("Select ID(s) first!");
    const JSZip = await ensureJSZip(); const zip=new JSZip();
    for(const r of chosen){
      const dir=zip.folder(`${r.id}_${r.createdAt}`);
      for(const slot of ["front","side","nose"]){ const url=r.slots?.[slot]; if(url){ dir.file(`${slot}.jpg`, url.split(",")[1], {base64:true}); } }
      // Kèm annotated images nếu có
      if (r.annotated) {
        for (const slot of ["front","side","nose"]) {
          const url = r.annotated?.[slot]; if (url) { dir.file(`${slot}_annotated.jpg`, url.split(",")[1], {base64:true}); }
        }
      }
      // Ghi landmarks chỉ gồm toạ độ (không gồm tên/id)
      const stripped = { front:[], side:[], nose:[] };
      for (const slot of ["front","side","nose"]) {
        const lms = (r.landmarks?.[slot]) || [];
        stripped[slot] = lms.map(p=>({ x:p.x, y:p.y, conf: p.conf }));
      }
      dir.file("landmarks.json", JSON.stringify(stripped, null, 2));
    }
    const blob=await zip.generateAsync({type:"blob"}); downloadBlob("export_landmarks.zip","application/zip",blob);
  }
  async function onDelete(){ if(!selected.size) return alert("Select ID(s) to delete!"); const n=await deleteRecordsByIds(Array.from(selected)); selected.clear(); await refresh(); alert(`Deleted ${n} record(s).`); }

  function renderHead(){
    const head=create("div","history-head",`
      <div class="actions">
        <button class="btn outline" id="csv">Download CSV</button>
        <button class="btn outline" id="zip">Download ZIP</button>
        <button class="btn danger" id="del">Delete selected</button>
      </div>`);
    head.querySelector("#csv").onclick=onCSV;
    head.querySelector("#zip").onclick=onZIP;
    head.querySelector("#del").onclick=onDelete;
    return head;
  }

  function renderTable(){
    const cont = el.querySelector(".table-wrap"); cont.innerHTML="";
    if(!rows.length){ cont.innerHTML='<p class="muted">No records yet (older than 5 days are auto-deleted).</p>'; return; }

    const table=create("table","history-table",`
      <thead><tr><th><input type="checkbox" id="all"></th><th>ID</th><th>Count</th><th>Latest</th><th>Image</th></tr></thead>
      <tbody></tbody>`);
    const tbody=table.querySelector("tbody");

    const groups=new Map();
    for(const r of rows){ if(!groups.has(r.id)) groups.set(r.id,[]); groups.get(r.id).push(r); }
    const data=[...groups.entries()].map(([id,list])=>({id,list:list.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)), latest:null}))
    .map(g=>{g.latest=g.list[0]; return g;})
    .sort((a,b)=>(b.latest.createdAt||0)-(a.latest.createdAt||0));

    data.forEach(g=>{
      const tr=document.createElement("tr");
      const thumb=g.latest.slots.front || g.latest.slots.side || g.latest.slots.nose;
      tr.innerHTML=`<td><input type="checkbox" class="ck" data-id="${g.id}" ${selected.has(g.id)?"checked":""}></td>
        <td class="mono">${g.id}</td><td>${g.list.length}</td><td>${fmt(g.latest.createdAt)}</td>
        <td>${thumb?`<img src="${thumb}" alt="p"/>`:`<span class="muted">—</span>`}</td>`;
      tbody.appendChild(tr);
    });

    cont.appendChild(table);
    cont.querySelector("#all").onchange=(e)=>{ if(e.target.checked) data.forEach(g=>selected.add(g.id)); else selected.clear(); renderTable(); };
    cont.querySelectorAll(".ck").forEach(ck=> ck.onchange=(e)=>{ const id=e.target.dataset.id; if(e.target.checked) selected.add(id); else selected.delete(id); });
  }

  function build(){
    el.innerHTML=""; el.appendChild(renderHead());
    el.appendChild(create("div","table-wrap"));
    injectCSS(); refresh(); return el;
  }
  return build();
}

function injectCSS(){
  if(document.getElementById("history-css")) return;
  const css = `
  .history-head{display:flex;justify-content:flex-end;align-items:center;margin-bottom:20px}
  .actions{display:flex;gap:12px}
  .history-table{width:100%;border-collapse:separate;border-spacing:0 12px}
  .history-table thead th{text-align:left;color:#374151;font-weight:700;padding:12px;background:#f9fafb;border-radius:8px}
  .history-table tbody tr{background:#fff;box-shadow:0 2px 6px rgba(0,0,0,0.1);border-radius:12px;border:1px solid #e5e7eb}
  .history-table tbody td{padding:12px;border:none}
  .history-table tbody img{width:80px;height:60px;object-fit:cover;border-radius:8px}
  .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px}
  .muted{color:#6b7280;font-style:italic}
  .table-wrap{overflow-y:auto;max-height:calc(100vh - 200px)}
  `;
  const tag=document.createElement("style"); tag.id="history-css"; tag.textContent=css; document.head.appendChild(tag);
}
