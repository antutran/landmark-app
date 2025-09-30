const KEY = "landmark_settings";
const defaults = {
  model: { fileName:null, modelId:null, uploadedAt:null },
  params:{ 
    confidence:0.06, 
    iou:0.06, 
    imgsz:1280, 
    max_det:42, 
    dot_radius:3, 
    box_thickness:2,
    show_boxes: true,
    show_points: true,
    show_labels: true,
    show_conf: false,
    return_images: true
  }
};

export function getSettings(){
  try{
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!s) return structuredClone(defaults);
    return { model:{...defaults.model, ...(s.model||{})}, params:{...defaults.params, ...(s.params||{})} };
  } catch { return structuredClone(defaults); }
}

export function setSettings(next){
  const merged = { model:{...defaults.model, ...(next.model||{})}, params:{...defaults.params, ...(next.params||{})} };
  localStorage.setItem(KEY, JSON.stringify(merged));
  return merged;
}

export function applySettings(){
  const s = getSettings();
  localStorage.setItem(KEY, JSON.stringify(s));
  return s;
}