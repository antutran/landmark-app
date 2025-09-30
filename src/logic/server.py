from __future__ import annotations
import io, os, time, base64, traceback
from typing import Optional, Dict, Any
import numpy as np
from PIL import Image, ImageOps
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse, RedirectResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ultralytics import YOLO
import cv2

# ===================== BẢNG TÊN LỚP THEO YAML (CỐ ĐỊNH) =====================
LANDMARK_NAMES: Dict[int, str] = {
    0: "sa",
    1: "sba",
    2: "pra",
    3: "ex_L",
    4: "ex_R",
    5: "tr",
    6: "g",
    7: "en_L",
    8: "en_R",
    9: "n",
    10: "mf_L",
    11: "mf_R",
    12: "al_L",
    13: "al_R",
    14: "prn",
    15: "sn",
    16: "ch_L",
    17: "ch_R",
    18: "ls",
    19: "gn",
    20: "r",
    21: "mp_L",
    22: "mp_R",
    23: "al'_R_T",
    24: "al'_R_B",
    25: "al'_L_T",
    26: "al'_L_B",
    27: "ac_L",
    28: "ac_R",
    29: "st_L",
    30: "st_R",
    31: "ll_L",
    32: "ll_R",
    33: "li",
    34: "cm_L",
    35: "cm_R",
    36: "pg",
    37: "zy_L",
    38: "zy_R",
    39: "c",
    40: "ft_L",
    41: "ft_R",
}
NC = 42  # chỉ để tham chiếu

# ============================== FastAPI init ==============================
app = FastAPI(title="Landmarks API", version="1.2 (fixed YAML names)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # đổi domain khi deploy
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================== Helpers ==============================
def pil_to_cv(img: Image.Image) -> np.ndarray:
    if img.mode != "RGB":
        img = img.convert("RGB")
    return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)

def cv_to_pil(arr: np.ndarray) -> Image.Image:
    return Image.fromarray(cv2.cvtColor(arr, cv2.COLOR_BGR2RGB))

def b64_of_pil(img: Image.Image, fmt="JPEG", quality=92) -> str:
    buf = io.BytesIO()
    img.save(buf, format=fmt, quality=quality)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")

def draw(out_bgr: np.ndarray,
         xyxy: np.ndarray,
         clses: np.ndarray,
         confs: np.ndarray,
         names: Dict[int, str],
         show_boxes=True, show_points=True, show_labels=True, show_conf=False,
         radius=3, box_thick=2) -> np.ndarray:
    out = out_bgr.copy()
    for i in range(len(xyxy)):
        x1, y1, x2, y2 = xyxy[i].astype(float)
        cid = int(clses[i]) if clses is not None else -1
        conf = float(confs[i]) if confs is not None else None
        name = names.get(cid, str(cid))
        color = (60, 120, 255)
        cx = int((x1 + x2) / 2.0); cy = int((y1 + y2) / 2.0)
        if show_boxes:
            cv2.rectangle(out, (int(x1), int(y1)), (int(x2), int(y2)), color, box_thick, lineType=cv2.LINE_AA)
            if show_labels:
                label = f"{name}{(' %.2f' % conf) if (show_conf and conf is not None) else ''}"
                (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
                cv2.rectangle(out, (int(x1), int(y1) - th - 6), (int(x1) + tw + 4, int(y1)), color, -1)
                cv2.putText(out, label, (int(x1) + 2, int(y1) - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)
        if show_points:
            cv2.circle(out, (cx, cy), radius, color, -1, lineType=cv2.LINE_AA)
    return out

# ============================== Model state ==============================
class ModelState:
    model: Optional[YOLO] = None
    names: Dict[int, str] = LANDMARK_NAMES.copy()  # mặc định theo YAML, sẽ thay bằng model.names sau khi load

STATE = ModelState()

class ModelInfo(BaseModel):
    loaded: bool
    classes: Dict[int, str] = {}
    message: str = ""

# ============================== UX routes ==============================
@app.get("/")
def root():
    return RedirectResponse(url="/docs")

@app.get("/favicon.ico")
def no_favicon():
    return Response(status_code=204)

@app.get("/api/health")
def health():
    return {"ok": True, "model_loaded": STATE.model is not None, "nc": NC}

# ============================== Load model at startup ==============================
import os, time, io, base64, traceback, tempfile, shutil
import requests
from huggingface_hub import hf_hub_download, HfApi


@app.on_event("startup")
def load_bundled_model():
    try:
        here = os.path.dirname(__file__)

        # lấy env
        env_path = os.environ.get("LM_MODEL_PATH", "").strip()
        repo_id  = os.environ.get("LM_MODEL_REPO", "").strip()
        filename = os.environ.get("LM_MODEL_FILE", "best.pt").strip()

        # nơi lưu tạm file model
        os.makedirs(os.path.join(here, "models"), exist_ok=True)
        local_model = os.path.join(here, "models", "best.pt")

        def download_from_url(url: str, dst: str):
            with requests.get(url, stream=True, timeout=60) as r:
                r.raise_for_status()
                with open(dst, "wb") as f:
                    for chunk in r.iter_content(chunk_size=1024 * 1024):
                        if chunk:
                            f.write(chunk)

        chosen = None

        if repo_id:  # cách 2: LM_MODEL_REPO + LM_MODEL_FILE
            # nếu repo public KHÔNG cần token
            tmp = hf_hub_download(repo_id=repo_id, filename=filename)  # tải về cache HF
            shutil.copyfile(tmp, local_model)  # copy sang thư mục dự án
            chosen = local_model

        elif env_path:  # cách 1: LM_MODEL_PATH
            if env_path.startswith("http://") or env_path.startswith("https://"):
                download_from_url(env_path, local_model)
                chosen = local_model
            else:
                # đường dẫn local tuyệt đối
                if os.path.exists(env_path):
                    chosen = env_path

        # fallback: bundled ./models/best.pt
        if not chosen:
            bundled = os.path.join(here, "models", "best.pt")
            if os.path.exists(bundled):
                chosen = bundled

        if not chosen or not os.path.exists(chosen):
            raise FileNotFoundError(f"Model file not found. Tried: {env_path or '[empty]'}, {repo_id}/{filename}, {local_model}")

        t0 = time.time()
        m = YOLO(chosen)
        STATE.model = m
        STATE.names = LANDMARK_NAMES.copy()
        print(f"[server] Loaded model '{chosen}' in {time.time()-t0:.2f}s")

    except Exception as e:
        STATE.model = None
        print("[server] Failed to load model:", e)

# ============================== Inference ==============================
@app.post("/api/infer")
async def infer(
    front: UploadFile | None = File(default=None),
    side:  UploadFile | None = File(default=None),
    nose:  UploadFile | None = File(default=None),

    confidence: float = Form(0.25),
    iou:        float = Form(0.45),
    imgsz:      int   = Form(640),
    max_det:    int   = Form(300),
    show_boxes: bool  = Form(True),
    show_points:bool  = Form(True),
    show_labels:bool  = Form(True),
    show_conf:  bool  = Form(False),
    dot_radius: int   = Form(3),
    box_thickness:int = Form(2),

    return_images: bool = Form(True),

    # Luôn đặt id là class_name của model để hiển thị đúng tên điểm
    id_as_class_name: bool = Form(True),
):
    if STATE.model is None:
        return JSONResponse(status_code=400, content={"error": "Model not loaded. POST /api/model trước."})

    try:
        out: Dict[str, Any] = {"landmarks": {}, "images": {}, "classes": STATE.names}

        for key, file in (("front", front), ("side", side), ("nose", nose)):
            if not file:
                out["landmarks"][key] = []
                out["images"][key] = None
                continue

            raw = await file.read()

            # Chuẩn hoá EXIF để không bị xoay trên iPhone
            pil = Image.open(io.BytesIO(raw))
            pil = ImageOps.exif_transpose(pil).convert("RGB")
            cv  = pil_to_cv(pil)

            pred = STATE.model.predict(
                source=cv, conf=confidence, iou=iou, imgsz=imgsz, max_det=max_det, verbose=False
            )[0]

            if pred.boxes is None or pred.boxes.xyxy is None or len(pred.boxes.xyxy) == 0:
                out["landmarks"][key] = []
                out["images"][key] = b64_of_pil(pil) if return_images else None
                continue

            xyxy  = pred.boxes.xyxy.cpu().numpy()
            clses = (pred.boxes.cls.cpu().numpy().astype(int)
                     if pred.boxes.cls is not None else np.full((xyxy.shape[0],), -1))
            confs = (pred.boxes.conf.cpu().numpy()
                     if pred.boxes.conf is not None else np.full((xyxy.shape[0],), np.nan))

            pts = []
            for i in range(xyxy.shape[0]):
                x1, y1, x2, y2 = xyxy[i]
                cx = float((x1 + x2) / 2.0)
                cy = float((y1 + y2) / 2.0)
                cid = int(clses[i])
                name = STATE.names.get(cid, f"L{i+1}")
                pts.append({
                    "id": name,
                    "x": cx, "y": cy,
                    "conf": float(confs[i]) if confs is not None else None,
                    "class_id": cid,
                    "class_name": name,
                })
            out["landmarks"][key] = pts

            if return_images:
                drawn = draw(
                    cv, xyxy, clses, confs, STATE.names,
                    show_boxes, show_points, show_labels, show_conf,
                    radius=dot_radius, box_thick=box_thickness
                )
                out["images"][key] = b64_of_pil(cv_to_pil(drawn))

        return out

    except Exception:
        return JSONResponse(status_code=500, content={"error": traceback.format_exc()})