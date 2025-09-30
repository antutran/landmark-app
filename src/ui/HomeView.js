import { runAI, health } from "../logic/aiClient.js";
import { saveRecord } from "../logic/history.js";
import { getSettings } from "../logic/settings.js";

export function HomeView(shell){
  const el = document.createElement("div");
  el.className = "home-view screen1";

  const state = {
    screen: 1,
    activeSlot: null,
    slots: { front:null, side:null, nose:null },
    stream: null, isLive: false, lastCapture: null,
    landmarks: { front:[], side:[], nose:[] },
    // State cho zoom/pan trong camera preview
    cameraPreview: {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      panning: false,
      lastX: 0,
      lastY: 0
    }
  };

  const qs = (selector, root = el) => root.querySelector(selector);
  const create = (tag, className, html)=>{
    const node = document.createElement(tag);
    if(className) node.className = className;
    if(html !== undefined) node.innerHTML = html;
    return node;
  };
  const slotsFilled = ()=> !!(state.slots.front && state.slots.side && state.slots.nose);

  const teardown = ()=>{
    stopCamera();
    window.removeEventListener("hashchange", teardown);
    window.removeEventListener("keydown", onKeyDown);
  };
  window.addEventListener("hashchange", teardown, { once:true });
  window.addEventListener("keydown", onKeyDown);

  function updateAIButton(){
    const btn = qs("#ai-btn");
    if(!btn) return;
    const enable = slotsFilled();
    btn.disabled = !enable;
    btn.classList.toggle("primary", enable);
    btn.classList.toggle("disabled", !enable);
  }

// --- đặt cạnh các hàm camera trong HomeView.js ---

async function getVideoInputs() {
  // iOS/Safari cần getUserMedia 1 lần trước khi enumerate để thấy label
  try { await navigator.mediaDevices.getUserMedia({ video: true }); } catch {}
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(d => d.kind === "videoinput");
}

function guessBackCameraId(videoInputs) {
  // ưu tiên tên gợi ý camera sau
  const re = /(back|rear|environment)/i;
  let back = videoInputs.find(d => re.test(d.label));
  if (back) return back.deviceId;
  // thứ hai: nếu có nhiều camera, lấy cái cuối (thường là sau trên mobile)
  if (videoInputs.length > 1) return videoInputs[videoInputs.length - 1].deviceId;
  // không có -> undefined
  return undefined;
}

function applyMirror(videoEl, isFront) {
  // Luôn hiển thị camera không mirror (như thật)
  videoEl.style.transform = "none";
  videoEl.style.scaleX = "1"; // Đảm bảo không bị lật ngang
  videoEl.style.scaleY = "1"; // Đảm bảo không bị lật dọc
}

async function startCamera(prefer = "auto") {
  // prefer: 'auto' | 'front' | 'back'
  const videoEl = el.querySelector("#cam-video");
  // tắt stream cũ nếu có
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }

  let constraints = { audio: false, video: {} };

  try {
    let deviceId;
    if (prefer !== "front") {
      // thử chọn cam sau theo deviceId
      const list = await getVideoInputs();
      deviceId = guessBackCameraId(list);
    }

    if (prefer === "front") {
      constraints.video = { facingMode: { ideal: "user" } };
    } else if (deviceId) {
      constraints.video = { deviceId: { exact: deviceId } };
    } else {
      // auto: thử environment trước, nếu ko có browser sẽ tự chọn
      constraints.video = { facingMode: { ideal: "environment" } };
    }

    state.stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (e1) {
    // fallback: cố thêm 1 lần với user
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "user" } },
      });
    } catch (e2) {
      alert("Unable to open camera: " + (e2.message || e1.message));
      return;
    }
  }

  // gán stream vào video
  videoEl.srcObject = state.stream;
  await videoEl.play();
  state.isLive = true;
  state.lastCapture = null;

  // Luôn bỏ mirror - hiển thị camera như thật
  applyMirror(videoEl, false);

  renderCameraPane();
}

function stopCamera() {
  if (state.stream) state.stream.getTracks().forEach(t => t.stop());
  state.stream = null;
  state.isLive = false;
  const videoEl = el.querySelector("#cam-video");
  if (videoEl) applyMirror(videoEl, false); // đảm bảo không mirror
  renderCameraPane();
}

  function grabFrame(video){
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    
    // Lấy kích thước hiển thị thực tế của video element
    const rect = video.getBoundingClientRect();
    const displayWidth = rect.width;
    const displayHeight = rect.height;
    
    // Lấy kích thước video gốc
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    
    // Tính tỷ lệ scale để fit video vào display area
    const scaleX = displayWidth / videoWidth;
    const scaleY = displayHeight / videoHeight;
    const scale = Math.min(scaleX, scaleY); // giữ tỷ lệ khung hình
    
    // Tính kích thước video sau khi scale
    const scaledWidth = videoWidth * scale;
    const scaledHeight = videoHeight * scale;
    
    // Tính offset để center video
    const offsetX = (displayWidth - scaledWidth) / 2;
    const offsetY = (displayHeight - scaledHeight) / 2;
    
    // Set canvas size theo kích thước hiển thị
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    
    // Vẽ video với đúng tỷ lệ và vị trí như hiển thị
    ctx.drawImage(
      video,
      offsetX, offsetY, scaledWidth, scaledHeight
    );
    
    return canvas.toDataURL("image/jpeg", 0.92);
  }
  function onCapture(){
    const video = qs("#cam-video");
    if(!video) return;
    state.lastCapture = grabFrame(video);
    state.isLive = false;
    renderCameraPane();
  }
  function onRotate(){
    if(!state.lastCapture) return;
    const img = new Image();
    img.onload = ()=>{
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalHeight;
      canvas.height = img.naturalWidth;
      const ctx = canvas.getContext("2d");
      ctx.translate(0, canvas.height);
      ctx.rotate(-Math.PI/2);
      ctx.drawImage(img, 0, 0);
      state.lastCapture = canvas.toDataURL("image/jpeg",0.92);
      renderCameraPane();
    };
    img.src = state.lastCapture;
  }

  // Phím tắt: Enter = xác nhận (lưu vào slot); Space = chụp/ chụp lại
  function onKeyDown(e){
    const tag = (e.target && e.target.tagName) || "";
    if(tag === "INPUT" || tag === "TEXTAREA" || e.isComposing) return;
    if(e.code === "Enter" || e.key === "Enter"){
      if(state.lastCapture){ e.preventDefault(); onTick(); }
    } else if(e.code === "Space" || e.key === " "){
      e.preventDefault();
      if(!state.activeSlot) return;
      if(state.isLive){ onCapture(); }
      else { onCross(); }
    }
  }
  function onTick(){
    if(!state.activeSlot || !state.lastCapture) return;
    
    // Capture ảnh đã được chỉnh sửa (zoom/pan) từ preview
    const adjustedImage = captureAdjustedImage();
    if (adjustedImage) {
      state.slots[state.activeSlot] = adjustedImage;
    } else {
      // Fallback về ảnh gốc nếu không capture được
    state.slots[state.activeSlot] = state.lastCapture;
    }
    
    state.lastCapture = null;
    stopCamera();
    renderThumbs();
    renderCameraPane();
    updateAIButton();
  }
  function onCross(){
    state.lastCapture = null;
    // Reset camera preview state
    state.cameraPreview = {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      panning: false,
      lastX: 0,
      lastY: 0
    };
    startCamera();
  }

  // Hàm capture ảnh đã được chỉnh sửa (zoom/pan) từ camera preview
  function captureAdjustedImage() {
    const preview = qs("#cam-preview");
    const img = preview?.querySelector('img');
    if (!preview || !img) return null;

    const vp = state.cameraPreview;
    const containerRect = preview.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    // Tạo canvas để vẽ ảnh đã chỉnh sửa
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas size theo kích thước container
    canvas.width = containerWidth;
    canvas.height = containerHeight;

    // Tính toán giống như trong redrawPreview
    const imgWidth = img.naturalWidth;
    const imgHeight = img.naturalHeight;
    
    const fitScale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight);
    const scaledWidth = imgWidth * fitScale;
    const scaledHeight = imgHeight * fitScale;
    
    const centerX = (containerWidth - scaledWidth) / 2;
    const centerY = (containerHeight - scaledHeight) / 2;
    
    const finalScale = fitScale * vp.scale;
    const finalWidth = imgWidth * finalScale;
    const finalHeight = imgHeight * finalScale;
    
    const finalX = centerX + vp.offsetX - (finalWidth - scaledWidth) / 2;
    const finalY = centerY + vp.offsetY - (finalHeight - scaledHeight) / 2;

    // Vẽ ảnh với transform đã áp dụng
    ctx.save();
    ctx.translate(finalX, finalY);
    ctx.scale(finalScale, finalScale);
    ctx.drawImage(img, 0, 0);
    ctx.restore();

    return canvas.toDataURL("image/jpeg", 0.92);
  }

  // Hàm resize ảnh để fill toàn bộ container (cover mode)
  function resizeImageToFill(imageDataUrl, targetWidth, targetHeight) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Set canvas size
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        
        // Tính tỷ lệ để fill toàn bộ container (cover mode)
        const scaleX = targetWidth / img.naturalWidth;
        const scaleY = targetHeight / img.naturalHeight;
        const scale = Math.max(scaleX, scaleY); // Dùng max để fill toàn bộ
        
        console.log('Image natural size:', img.naturalWidth, 'x', img.naturalHeight);
        console.log('Target size:', targetWidth, 'x', targetHeight);
        console.log('Scale factors:', scaleX, scaleY, 'using:', scale);
        
        // Tính kích thước ảnh sau khi scale
        const scaledWidth = img.naturalWidth * scale;
        const scaledHeight = img.naturalHeight * scale;
        
        // Tính vị trí để center ảnh (có thể crop một phần)
        const offsetX = (targetWidth - scaledWidth) / 2;
        const offsetY = (targetHeight - scaledHeight) / 2;
        
        console.log('Scaled size:', scaledWidth, 'x', scaledHeight);
        console.log('Offset:', offsetX, offsetY);
        
        // Vẽ ảnh đã resize và center (fill toàn bộ màn hình)
        ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);
        
        resolve(canvas.toDataURL("image/jpeg", 0.92));
      };
      img.src = imageDataUrl;
    });
  }

  // Hàm xử lý zoom/pan cho camera preview
  function setupCameraPreviewControls(previewElement) {
    if (!previewElement) return;
    
    const vp = state.cameraPreview;
    
    // Reset state khi có ảnh mới
    vp.scale = 1;
    vp.offsetX = 0;
    vp.offsetY = 0;
    vp.panning = false;
    
    // Thêm smooth panning
    let panAnimationId = null;
    
    function redrawPreview() {
      const img = previewElement.querySelector('img');
      if (!img) return;
      
      const container = previewElement;
      const containerRect = container.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const containerHeight = containerRect.height;
      
      // Kiểm tra nếu là ảnh upload (đã được resize)
      const isUploadedImage = img.classList.contains('uploaded');
      
      if (isUploadedImage) {
        // Với ảnh upload: tự tính scale ban đầu để vừa khung (contain)
        const imgWidth = img.naturalWidth;
        const imgHeight = img.naturalHeight;
        const fitScale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight);
        const scaledWidth = imgWidth * fitScale;
        const scaledHeight = imgHeight * fitScale;
        const centerX = (containerWidth - scaledWidth) / 2;
        const centerY = (containerHeight - scaledHeight) / 2;
        const finalScale = fitScale * vp.scale;
        const finalWidth = imgWidth * finalScale;
        const finalHeight = imgHeight * finalScale;
        const finalX = centerX + vp.offsetX - (finalWidth - scaledWidth) / 2;
        const finalY = centerY + vp.offsetY - (finalHeight - scaledHeight) / 2;

        if (panAnimationId) cancelAnimationFrame(panAnimationId);
        panAnimationId = requestAnimationFrame(() => {
          img.style.transform = `translate(${finalX}px, ${finalY}px) scale(${finalScale})`;
          img.style.transformOrigin = '0 0';
        });
      } else {
        // Ảnh chụp từ camera - tính toán như cũ
        const imgWidth = img.naturalWidth;
        const imgHeight = img.naturalHeight;
        
        const fitScale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight);
        const scaledWidth = imgWidth * fitScale;
        const scaledHeight = imgHeight * fitScale;
        
        const centerX = (containerWidth - scaledWidth) / 2;
        const centerY = (containerHeight - scaledHeight) / 2;
        
        const finalScale = fitScale * vp.scale;
        const finalWidth = imgWidth * finalScale;
        const finalHeight = imgHeight * finalScale;
        
        const finalX = centerX + vp.offsetX - (finalWidth - scaledWidth) / 2;
        const finalY = centerY + vp.offsetY - (finalHeight - scaledHeight) / 2;
        
        // Smooth transform
        if (panAnimationId) {
          cancelAnimationFrame(panAnimationId);
        }
        
        panAnimationId = requestAnimationFrame(() => {
          img.style.transform = `translate(${finalX}px, ${finalY}px) scale(${finalScale})`;
          img.style.transformOrigin = '0 0';
        });
      }
    }
    
    // Wheel event cho zoom
    previewElement.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = -Math.sign(e.deltaY) * 0.1;
      const prevScale = vp.scale;
      vp.scale = Math.min(3, Math.max(0.5, vp.scale + delta));
      
      // Zoom về phía con trỏ chuột
      const rect = previewElement.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const scaleRatio = vp.scale / prevScale;
      vp.offsetX = mouseX - (mouseX - vp.offsetX) * scaleRatio;
      vp.offsetY = mouseY - (mouseY - vp.offsetY) * scaleRatio;
      
      redrawPreview();
    }, { passive: false });
    
    // Mouse events cho pan (chuột giữa như AutoCAD)
    previewElement.addEventListener('mousedown', (e) => {
      if (e.button === 1) { // Middle mouse button (chuột giữa)
        e.preventDefault();
        e.stopPropagation();
        vp.panning = true;
        vp.lastX = e.clientX;
        vp.lastY = e.clientY;
        previewElement.classList.add('panning');
      }
    });
    
    previewElement.addEventListener('mousemove', (e) => {
      if (vp.panning) {
        e.preventDefault();
        e.stopPropagation();
        const deltaX = e.clientX - vp.lastX;
        const deltaY = e.clientY - vp.lastY;
        vp.offsetX += deltaX;
        vp.offsetY += deltaY;
        vp.lastX = e.clientX;
        vp.lastY = e.clientY;
        redrawPreview();
      }
    });
    
    previewElement.addEventListener('mouseup', (e) => {
      if (e.button === 1) { // Middle mouse button
        e.preventDefault();
        e.stopPropagation();
        vp.panning = false;
        previewElement.classList.remove('panning');
      }
    });
    
    previewElement.addEventListener('mouseleave', () => {
      vp.panning = false;
      previewElement.classList.remove('panning');
    });
    
    // Ngăn context menu khi nhấn chuột giữa
    previewElement.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
    
    // Double click để reset zoom
    previewElement.addEventListener('dblclick', (e) => {
      e.preventDefault();
      vp.scale = 1;
      vp.offsetX = 0;
      vp.offsetY = 0;
      redrawPreview();
    });
    
    // Set cursor style và overflow; reset vị trí/scale ban đầu để ảnh vừa khung
    previewElement.style.overflow = 'hidden';
    previewElement.title = 'Mouse wheel: Zoom • Middle mouse: Pan • Double click: Reset • Enter: Save';
    
    // Redraw khi ảnh load
    const img = previewElement.querySelector('img');
    if (img) {
      img.onload = () => {
        // Căn ảnh vào giữa ở tỉ lệ fit để vừa khung
        const containerRect = previewElement.getBoundingClientRect();
        const imgWidth = img.naturalWidth;
        const imgHeight = img.naturalHeight;
        const fitScale = Math.min(containerRect.width / imgWidth, containerRect.height / imgHeight);
        vp.scale = 1; // scale người dùng
        vp.offsetX = 0;
        vp.offsetY = 0;
        redrawPreview();
      };
      if (img.complete) img.onload();
    }
  }

  async function onUploadChange(files) {
    if (!state.activeSlot) return alert("Please select a view (Front/Side/Nose) first!");
    const file = files?.[0];
    if (!file) return;
    // Chỉ hỗ trợ JPG/PNG để đảm bảo trình duyệt đọc được (HEIC thường lỗi)
    const okTypes = ["image/jpeg","image/png","image/jpg"];
    if (!okTypes.includes(file.type)) {
      alert("Unsupported format: " + (file.type || file.name) + "\nPlease use JPG or PNG.");
      return;
    }
    
    const reader = new FileReader();
    reader.onload = async () => {
      // Reset camera preview state cho ảnh upload mới
      state.cameraPreview = {
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        panning: false,
        lastX: 0,
        lastY: 0
      };
      
      state.isLive = false;
      stopCamera();
      renderThumbs();
      renderCameraPane();
      
      // Đợi DOM render xong rồi gắn ảnh theo chế độ contain (giống video)
      setTimeout(async () => {
        try {
          const preview = qs("#cam-preview");
          if (preview) {
            // Với chế độ contain, không cần resize ở JS, giữ nguyên ảnh gốc
            state.lastCapture = reader.result;
            renderCameraPane();
            // Đợi ảnh mount rồi bật điều khiển
            setTimeout(() => {
              const img = preview.querySelector('img');
              if (img) {
                img.classList.remove('uploaded'); // dùng pipeline của ảnh camera
                setupCameraPreviewControls(preview);
              }
            }, 50);
          } else {
            // Fallback nếu không có preview
            state.lastCapture = reader.result;
            renderCameraPane();
          }
        } catch (err) {
          console.warn('Resize upload error, fallback original:', err);
          state.lastCapture = reader.result;
          renderCameraPane();
        }
        updateAIButton();
      }, 100);
    };
    reader.readAsDataURL(file);
  }

  async function onRunAI(){
    if(!slotsFilled()) return;
    const btn = qs("#ai-btn");
    btn.disabled = true;
    btn.textContent = "Running…";
    try{
      // Kiểm tra model đã load chưa
      const h = await health();
      if(!h.model_loaded){
        alert("No model loaded on server. Ensure bundled model exists at src/logic/models/best.pt and restart server.");
        return;
      }

      console.log("Running AI with slots:", Object.keys(state.slots));
      const settings = getSettings();
      console.log("Settings:", settings);
      
      // Gọi AI với parameters từ settings
      const results = await runAI(state.slots, settings.params);
      console.log("AI Results:", results);
      // Save landmarks and annotated images (if returned)
      state.landmarks = results.landmarks || results;
      if (results.images) {
        state.annotatedImages = results.images;
      }
      state.screen = 2;
      stopCamera();
      render();
    }catch(err){
      console.error("AI Error:", err);
      alert("AI error: " + err.message + "\n\nCheck:\n1) Is the AI server running?\n2) Upload model (.pt) in Settings first\n3) See Console for details");
    }finally{
      btn.disabled = false;
      btn.innerHTML = '<span class="material-icons">bolt</span><span>AI</span>';
    }
  }

  async function onSave(){
    const id = qs("#id-input").value.trim();
    if(!id) return alert("Enter ID before saving!");
    const rec = { id, createdAt:Date.now(), slots:{...state.slots}, landmarks:{...state.landmarks} };
    if (state.annotatedImages) rec.annotated = { ...state.annotatedImages };
    await saveRecord(rec);
    alert("Saved to history.");
    state.screen = 1;
    render();
  }

  function buildControlColumn(){
    const column = create("div","control-column");

    const group = create("div","control-stack");

    const ai = document.createElement("button");
    ai.type = "button";
    ai.id = "ai-btn";
    ai.className = "btn control-ai disabled";
    ai.disabled = true;
    ai.innerHTML = '<span class="material-icons">bolt</span><span>AI</span>';
    ai.addEventListener("click", onRunAI);

    const upload = document.createElement("label");
    upload.className = "control-circle upload-btn";
    upload.innerHTML = '<span class="material-icons">arrow_upward</span><span>upload</span>';
    upload.setAttribute("for","home-file-input");

    const file = document.createElement("input");
    file.type = "file";
    file.accept = "image/*";
    file.id = "home-file-input";
    file.style.display = "none";
    // Cho phép chọn lại cùng một file nhiều lần
    file.addEventListener("click", (e)=>{ e.target.value = ""; });
    file.addEventListener("change", (e)=>{ onUploadChange(e.target.files); e.target.value = ""; });

    const snap = document.createElement("button");
    snap.type = "button";
    snap.className = "control-circle snap-btn";
    snap.innerHTML = '<span class="material-icons">photo_camera</span><span>snap</span>';
    snap.addEventListener("click", async ()=>{
      if(!state.activeSlot) return alert("Hãy chọn góc chụp (Front/Side/Nose) trước!");
      if(!state.isLive){
        await startCamera();
        if(!state.isLive) return;
      }
      onCapture();
    });

    group.append(ai, upload, snap);
    column.append(group, file);
    return column;
  }

  function renderThumbs(){
    const cont = qs(".thumbs.strip");
    if(!cont) return;
    cont.innerHTML = "";

    ["front","side","nose"].forEach((slot)=>{
      const box = create("div","thumb-box");
      box.classList.toggle("active", state.activeSlot === slot);

      if (state.slots[slot]) {
        const img = new Image();
        img.src = state.slots[slot];
        img.alt = slot;
        box.appendChild(img);
      } else {
        const empty = create("div","thumb-empty","<span>+</span>");
        box.appendChild(empty);
      }

      const cap = create("div","thumb-cap",slot);
      box.appendChild(cap);

      box.addEventListener("click",()=>{
        state.activeSlot = slot;
        startCamera();
        renderCameraPane();
        renderThumbs();
        updateAIButton();
      });

      cont.appendChild(box);
    });
    updateAIButton();
  }

  function buildCameraPane(){
    const cam = create("div","camera-frame",`
      <div class="cam-header"></div>
      <div class="cam-body">
        <video id="cam-video" autoplay playsinline></video>
        <div class="cam-preview" id="cam-preview"></div>
        <div class="cam-overlay" id="cam-overlay">Please select a view! (Enter = save, Space = recapture)</div>
      </div>
      <div class="cam-footer">
        <button class="btn primary" id="confirm-btn">Confirm</button>
      </div>
    `);
    return cam;
  }

  function renderCameraPane(){
    const video = qs("#cam-video");
    const preview = qs("#cam-preview");
    const overlay = qs("#cam-overlay");
    const rotateBtn = qs("#rotate-btn");
    const confirmBtn = qs("#confirm-btn");

    if(!video || !preview || !overlay) return;
    if (confirmBtn && !confirmBtn._bound) { confirmBtn.addEventListener("click", onTick); confirmBtn._bound = true; }

    preview.innerHTML = "";
    video.classList.add("hidden");
    overlay.classList.remove("hidden");
    rotateBtn?.classList.add("hidden");
    if(confirmBtn){ confirmBtn.classList.add("hidden"); confirmBtn.disabled = true; }

    if(!state.activeSlot){
      overlay.textContent = "Please select a view! (Enter = save, Space = recapture)";
      return;
    }

    if(state.isLive){
      video.classList.remove("hidden");
      overlay.classList.add("hidden");
      return;
    }

    if(state.lastCapture){
      const img = new Image();
      img.src = state.lastCapture;
      
      preview.appendChild(img);
      overlay.classList.add("hidden");
      rotateBtn?.classList.remove("hidden");
      if(confirmBtn){ confirmBtn.classList.remove("hidden"); confirmBtn.disabled = false; }
      
      // Setup zoom/pan controls cho preview (chỉ cho ảnh chụp, ảnh upload sẽ setup sau)
      if (state.isLive || !img.classList.contains('uploaded')) {
        setupCameraPreviewControls(preview);
      }
    }else{
      overlay.textContent = "Please select a view!";
    }
  }

  function buildViewerThumb(slot){
    const card = create("div","thumb2");
    const box = create("div","thumb2-box");
    const cap = create("div","thumb2-cap",slot);

    const url = state.slots[slot];
    if(url){
      const img = new Image();
      img.src = url;
      box.appendChild(img);
    } else {
      box.innerHTML = '<div class="thumb2-empty">—</div>';
    }

    card.append(box, cap);
    card.addEventListener("click",()=>{ if(url) openViewerModal(slot); });
    return card;
  }

  function buildViewerScreen(){
    const right = create("div","viewer-pane right-pane");

    const strip = create("div","viewer-strip");
    ["front","side","nose"].forEach(slot=> strip.appendChild(buildViewerThumb(slot)));

    const form = create("div","id-row",`
      <label class="id-label">ID</label>
      <input id="id-input" class="id-input" placeholder="Enter ID..." />
      <button class="btn save-wide" id="save-btn">save</button>
    `);

    right.append(strip, form);
    form.querySelector("#save-btn").addEventListener("click", onSave);
    return right;
  }

  function openViewerModal(slot){
    const overlay = create("div","zoom-modal",`
      <div class="zoom-wrap">
        <div class="zoom-head"><div class="hint">Scroll to zoom • Hold <b>middle mouse</b> to pan</div>
          <button class="btn outline close-zoom">✕</button></div>
        <canvas id="zoom-canvas"></canvas>
      </div>
    `);
    document.body.appendChild(overlay);
    overlay.querySelector(".close-zoom").onclick = ()=> overlay.remove();
    overlay.addEventListener("click",(e)=>{ if(e.target === overlay) overlay.remove(); });

    const canvas = overlay.querySelector("#zoom-canvas");
    const DPR = window.devicePixelRatio || 1;
    const fit = ()=>{
      const w = Math.min(1100, window.innerWidth - 160);
      const h = Math.min(700, window.innerHeight - 140);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width = Math.floor(w * DPR);
      canvas.height = Math.floor(h * DPR);
    };
    fit();
    window.addEventListener("resize", fit, { once:true });
    drawZoomScene(canvas, slot);
  }

  function drawZoomScene(canvas, slot){
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.src = state.slots[slot];

    const DPR = window.devicePixelRatio || 1;
    const vp = { scale:1, offsetX:0, offsetY:0, panning:false, lastX:0, lastY:0 };
    let hoverIndex = -1;
    let lastMouseX = null, lastMouseY = null; // canvas pixel coords (DPR-scaled)

    img.onload = ()=>{
      const w = canvas.width, h = canvas.height;
      const fit = Math.min(w / img.naturalWidth, h / img.naturalHeight);
      vp.scale = fit;
      vp.offsetX = (w - img.naturalWidth * vp.scale) / 2;
      vp.offsetY = (h - img.naturalHeight * vp.scale) / 2;
      redraw();
    };

    function redraw(){
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0,0,w,h);
      ctx.save();
      ctx.translate(vp.offsetX, vp.offsetY);
      ctx.scale(vp.scale, vp.scale);
      ctx.drawImage(img, 0, 0);
      const lms = state.landmarks[slot] || [];
      ctx.fillStyle = "rgba(235, 14, 14, 0.95)";
      ctx.strokeStyle = "rgba(17,24,39,.9)";
      ctx.lineWidth = 2; // phóng to theo zoom vì đã scale canvas
      lms.forEach((p, idx)=>{
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1, 0, Math.PI * 2); // nhỏ hơn nữa
        ctx.fill();
        if (idx === hoverIndex) {
          ctx.font = `${18}px Inter, sans-serif`;
          ctx.lineWidth = 3;
          ctx.strokeText(p.id, p.x + 6, p.y - 6);
          ctx.fillStyle = "#fff";
          ctx.fillText(p.id, p.x + 6, p.y - 6);
          ctx.fillStyle = "rgba(239, 24, 24, 0.95)";
        }
      });
      ctx.restore();
    }

    function updateHoverFromMouse(clientX, clientY){
      const rect = canvas.getBoundingClientRect();
      lastMouseX = (clientX - rect.left) * DPR;
      lastMouseY = (clientY - rect.top) * DPR;
      const lms = state.landmarks[slot] || [];
      let best = -1;
      let bestDist = Infinity;
      const threshold = 12 * DPR; // pixels on screen
      for(let i=0;i<lms.length;i++){
        const p = lms[i];
        const sx = p.x * vp.scale + vp.offsetX;
        const sy = p.y * vp.scale + vp.offsetY;
        const dx = sx - lastMouseX;
        const dy = sy - lastMouseY;
        const d = Math.hypot(dx, dy);
        if(d < bestDist && d <= threshold){ bestDist = d; best = i; }
      }
      hoverIndex = best;
      redraw();
    }

    canvas.addEventListener("wheel",(e)=>{
      e.preventDefault();
      const delta = -Math.sign(e.deltaY) * 0.12;
      const prev = vp.scale;
      vp.scale = Math.min(10, Math.max(0.2, vp.scale + delta));
      const rect = canvas.getBoundingClientRect();
      const cx = (e.clientX - rect.left) * DPR;
      const cy = (e.clientY - rect.top) * DPR;
      vp.offsetX = cx - ((cx - vp.offsetX) * vp.scale) / prev;
      vp.offsetY = cy - ((cy - vp.offsetY) * vp.scale) / prev;
      redraw();
      if(lastMouseX!=null && lastMouseY!=null){ updateHoverFromMouse(e.clientX, e.clientY); }
    }, { passive:false });

    canvas.addEventListener("mousedown",(e)=>{
      if(e.button !== 1) return;
      e.preventDefault();
      vp.panning = true;
      vp.lastX = e.clientX * DPR;
      vp.lastY = e.clientY * DPR;
    });
    window.addEventListener("mousemove",(e)=>{
      if(!vp.panning) return;
      const x = e.clientX * DPR;
      const y = e.clientY * DPR;
      vp.offsetX += x - vp.lastX;
      vp.offsetY += y - vp.lastY;
      vp.lastX = x;
      vp.lastY = y;
      redraw();
    });
    window.addEventListener("mouseup",()=>{ vp.panning = false; });

    // Hover events (chỉ hiển thị label khi trỏ chuột gần điểm)
    canvas.addEventListener("mousemove", (e)=>{
      if(vp.panning) return; // đang kéo thì không đổi hover
      updateHoverFromMouse(e.clientX, e.clientY);
    });
    canvas.addEventListener("mouseleave", ()=>{ hoverIndex = -1; redraw(); });
  }

  function render(){
    el.innerHTML = "";
    if(state.screen === 1){
      el.className = "home-view screen1";
      const layout = create("div","home-layout");
      const left = create("div","home-left");
      const right = create("div","home-right");

      left.appendChild(buildControlColumn());
      right.appendChild(create("div","thumbs strip"));
      right.appendChild(buildCameraPane());

      layout.append(left, right);
      el.appendChild(layout);

      renderThumbs();
      renderCameraPane();
      updateAIButton();
    }else{
      el.className = "home-view screen2";
      const head = create("div","mini-head",`
        <div><strong>AI Detection</strong></div>
        <div><button class="btn outline" id="back-btn">← Back</button></div>
      `);
      el.appendChild(head);
      el.appendChild(buildViewerScreen());
      el.querySelector("#back-btn").onclick = ()=>{
        state.screen = 1;
        render();
      };
    }
  }

  render();
  return el;
}
