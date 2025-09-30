import { getSettings, setSettings } from "../logic/settings.js";
// Model is now bundled and auto-loaded on server startup. Upload UI removed.

export function SettingsView(){
  const el = document.createElement("div");
  el.className = "settings-view right-pane";

  let settings = getSettings();
  const create=(t,c,h)=>{const x=document.createElement(t); if(c)x.className=c; if(h!==undefined)x.innerHTML=h; return x;};
  const save=()=>{ setSettings(settings); toast("Settings saved"); };
  const toast=(m)=>{ const t=create("div","toast",m); document.body.appendChild(t); requestAnimationFrame(()=>t.classList.add("show")); setTimeout(()=>{t.classList.remove("show"); t.remove();},2200); };

  function inputRow(id,label,min,max,step,val){ return `
    <div class="field"><label for="${id}">${label}</label>
      <input type="number" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"/>
    </div>`; }

  el.innerHTML = `
    <div class="card">
      <h3>Parameters</h3>
      <div class="grid-3">
        ${inputRow("confidence","Confidence (0-1)",0,1,0.01,settings.params.confidence)}
        ${inputRow("iou","IoU (0-1)",0,1,0.01,settings.params.iou)}
        ${inputRow("imgsz","imgsz",256,1536,1,settings.params.imgsz)}
        ${inputRow("max_det","max_det",1,2000,1,settings.params.max_det)}
        ${inputRow("dot_radius","Dot radius (px)",1,12,1,settings.params.dot_radius)}
        ${inputRow("box_thickness","Box thickness",1,6,1,settings.params.box_thickness)}
      </div>
      <div class="checkbox-group">
        <label><input type="checkbox" id="show_boxes" ${settings.params.show_boxes ? 'checked' : ''}> Show boxes</label>
        <label><input type="checkbox" id="show_points" ${settings.params.show_points ? 'checked' : ''}> Show points</label>
        <label><input type="checkbox" id="show_labels" ${settings.params.show_labels ? 'checked' : ''}> Show labels</label>
        <label><input type="checkbox" id="show_conf" ${settings.params.show_conf ? 'checked' : ''}> Show confidence</label>
        <label><input type="checkbox" id="return_images" ${settings.params.return_images ? 'checked' : ''}> Return annotated images</label>
      </div>
      <div style="margin-top:12px">
        <button class="btn primary" id="apply">Apply</button>
      </div>
    </div>
  `;

  // Xử lý input numbers
  const ids=["confidence","iou","imgsz","max_det","dot_radius","box_thickness"];
  ids.forEach(id=>{
    const input = el.querySelector("#"+id);
    input.addEventListener("input",()=>{ const v=Number(input.value); if(!Number.isNaN(v)) { settings.params[id]=v; setSettings(settings); }});
    input.addEventListener("change",()=>{ const v=Number(input.value); if(!Number.isNaN(v)) { settings.params[id]=v; setSettings(settings); }});
  });

  // Xử lý checkboxes
  const checkboxes = ["show_boxes","show_points","show_labels","show_conf","return_images"];
  checkboxes.forEach(id=>{
    const checkbox = el.querySelector("#"+id);
    checkbox.addEventListener("change",()=>{ 
      settings.params[id] = checkbox.checked; 
      setSettings(settings);
    });
  });

  el.querySelector("#apply").onclick = save;

  injectCSS();
  return el;
}

function injectCSS(){
  if(document.getElementById("settings-css")) return;
  const css = `
  .settings-view .card{background:#f9fafb;border-radius:20px;box-shadow:0 2px 6px rgba(0,0,0,0.1);padding:20px;margin-bottom:20px;border:2px solid #e5e7eb}
  .settings-view h3{margin:0 0 15px;color:#111827;font-size:18px;font-weight:700}
  .settings-view .grid-3{display:grid;grid-template-columns:repeat(3,minmax(220px,1fr));gap:16px}
  .settings-view .field label{display:block;font-weight:600;margin-bottom:8px;color:#374151}
  .settings-view .field input{width:100%;padding:10px;border:2px solid #e5e7eb;border-radius:12px;font-size:14px;transition:border-color 0.2s}
  .settings-view .field input:focus{outline:none;border-color:#6366f1}
  .settings-view .model-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
  .muted{color:#6b7280;font-style:italic}
  .upload-status{margin-top:8px;padding:8px 12px;border-radius:8px;font-size:14px;font-weight:500}
  .upload-status.uploading{background:#fef3c7;color:#92400e;border:1px solid #fbbf24}
  .upload-status.success{background:#d1fae5;color:#065f46;border:1px solid #10b981}
  .upload-status.error{background:#fee2e2;color:#991b1b;border:1px solid #ef4444}
  .checkbox-group{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:16px;padding:16px;background:#f3f4f6;border-radius:12px}
  .checkbox-group label{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:500;color:#374151;cursor:pointer}
  .checkbox-group input[type="checkbox"]{width:16px;height:16px;accent-color:#6366f1}
  .toast{position:fixed;right:16px;bottom:16px;background:#111827;color:#fff;padding:12px 16px;border-radius:12px;opacity:0;transform:translateY(8px);transition:.2s;z-index:1000}
  .toast.show{opacity:1;transform:translateY(0)}
  `;
  const tag=document.createElement("style"); tag.id="settings-css"; tag.textContent=css; document.head.appendChild(tag);
}
