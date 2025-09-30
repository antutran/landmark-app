# Hướng dẫn thiết lập Backend AI

## Yêu cầu Backend

Ứng dụng này cần một backend AI chạy trên `http://localhost:5001` với các endpoint sau:

### 1. Upload Model
- **Endpoint:** `POST /api/model`
- **Body:** FormData với field `model` (file .pt)
- **Response:** 
```json
{
  "loaded": true,
  "classes": ["class1", "class2", ...],
  "message": "Model loaded successfully",
  "modelId": "unique_model_id"
}
```

### 2. AI Inference
- **Endpoint:** `POST /api/infer`
- **Body:** FormData với các fields:
  - `front`, `side`, `nose`: File ảnh (nếu có)
  - `confidence`: Float (0-1)
  - `iou`: Float (0-1) 
  - `imgsz`: Integer (256-1536)
  - `max_det`: Integer (1-2000)
  - `dot_radius`: Integer (1-12)
  - `box_thickness`: Integer (1-6)
  - `show_boxes`: Boolean
  - `show_points`: Boolean
  - `show_labels`: Boolean
  - `show_conf`: Boolean
  - `return_images`: Boolean

- **Response:**
```json
{
  "landmarks": {
    "front": [
      {
        "id": "L1",
        "x": 100.5,
        "y": 200.3,
        "conf": 0.95,
        "class_id": 0,
        "class_name": "landmark"
      }
    ],
    "side": [...],
    "nose": [...]
  },
  "images": {
    "front": "data:image/jpeg;base64,...",
    "side": null,
    "nose": null
  }
}
```

## Cách sử dụng

1. **Khởi động backend AI** trên port 5001
2. **Mở ứng dụng** trong trình duyệt
3. **Vào Settings** để:
   - Upload model .pt file
   - Cấu hình các tham số AI
4. **Chụp ảnh** front, side, nose
5. **Nhấn nút AI** để chạy inference

## Lưu ý

- Backend phải hỗ trợ CORS cho `localhost`
- Model phải được upload trước khi chạy inference
- Nếu backend không chạy, ứng dụng sẽ báo lỗi kết nối

