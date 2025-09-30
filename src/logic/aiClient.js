// With Nginx reverse-proxy, call same-origin /api
const BASE = "";

function dataURLtoBlob(dataURL) {
  const [h, b] = dataURL.split(",");
  const mime = h.match(/data:(.*);base64/)[1] || "image/jpeg";
  const bin = atob(b);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: mime });
}

// Upload model removed; server loads bundled model at startup

/** Kiểm tra backend và tình trạng model */
export async function health(){
  const res = await fetch(`${BASE}/api/health`);
  if(!res.ok) throw new Error(await res.text());
  return res.json(); // { ok, model_loaded }
}

/** Gọi infer — images: {front?, side?, nose?} là dataURL; params là settings */
export async function runAI(images, params = {}) {
  const fd = new FormData();

  if (images.front) fd.append("front", dataURLtoBlob(images.front), "front.jpg");
  if (images.side)  fd.append("side",  dataURLtoBlob(images.side),  "side.jpg");
  if (images.nose)  fd.append("nose",  dataURLtoBlob(images.nose),  "nose.jpg");

  const {
    confidence = 0.25, iou = 0.45, imgsz = 640, max_det = 300,
    dot_radius = 3, box_thickness = 2,
    show_boxes = true, show_points = true, show_labels = true, show_conf = false,
    return_images = false
  } = params;

  fd.append("confidence", String(confidence));
  fd.append("iou", String(iou));
  fd.append("imgsz", String(imgsz));
  fd.append("max_det", String(max_det));
  fd.append("dot_radius", String(dot_radius));
  fd.append("box_thickness", String(box_thickness));
  fd.append("show_boxes", String(show_boxes));
  fd.append("show_points", String(show_points));
  fd.append("show_labels", String(show_labels));
  fd.append("show_conf", String(show_conf));
  fd.append("return_images", String(return_images));

  const res = await fetch(`${BASE}/api/infer`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  // Format trả về:
  // { landmarks: {front:[{id,x,y,conf,class_id,class_name}], side:[], nose:[]},
  //   images: {front: 'data:image/jpeg;base64,...' | null, ... } }
  return json;
}