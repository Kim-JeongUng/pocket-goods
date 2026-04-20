# 스티커 칼선 SVG 자동 생성 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 투명 배경 PNG로부터 스티커용 칼선 SVG path를 자동 생성해 export 응답에 포함한다.

**Architecture:** OpenCV로 alpha mask → largest blob → dilate(41px) → RETR_EXTERNAL contour → approxPolyDP 단순화 → Chaikin 스무딩 → SVG path 순으로 처리한다. `render_canvas`에 투명 배경 렌더 옵션을 추가해 칼선용 마스크를 만들고, ExportResponse에 `cutting_line_svg` 필드로 반환한다.

**Tech Stack:** Python 3.13, Pillow, OpenCV (opencv-python-headless), NumPy

---

### Task 1: 의존성 추가

**Files:**
- Modify: `apps/api/requirements.txt`
- Modify: `apps/api/Dockerfile`

**Step 1: requirements.txt에 추가**

```
numpy>=1.26.0
opencv-python-headless>=4.9.0
```

`pillow==11.1.0` 다음 줄에 추가:

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
python-multipart==0.0.9
google-genai>=0.8.0
pillow==11.1.0
numpy>=1.26.0
opencv-python-headless>=4.9.0
python-dotenv==1.0.1
requests==2.32.3
```

**Step 2: Dockerfile에 OpenCV 시스템 의존성 추가**

`libjpeg-dev \` 다음 줄에 `libgl1 \` 추가:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libjpeg-dev \
    zlib1g-dev \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
```

**Step 3: 커밋**

```bash
cd /Users/kimbeomsu/Desktop/pocket-goods
git add apps/api/requirements.txt apps/api/Dockerfile
git commit -m "chore: add numpy and opencv-python-headless dependencies"
git push origin main
```

---

### Task 2: cutting_line.py 서비스 생성

**Files:**
- Create: `apps/api/services/cutting_line.py`

**Step 1: 파일 생성**

```python
"""
스티커용 칼선 SVG 자동 생성 서비스

파이프라인:
  alpha threshold → binary mask → 최대 blob 유지(노이즈/hole 제거)
  → dilate(offset_px) → RETR_EXTERNAL contour → approxPolyDP 단순화
  → Chaikin 스무딩 → SVG path 문자열 출력

mm 기반 offset으로 변경 시:
  offset_px = mm_to_px(offset_mm, dpi)
  예: mm_to_px(3.5, 300) → 41px
"""
import logging
from typing import Optional

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────
# 단위 변환
# ─────────────────────────────────────────

def mm_to_px(mm: float, dpi: int = 300) -> int:
    """
    mm → 픽셀 변환.
    offset을 mm 단위로 지정할 때 사용한다.
    예: mm_to_px(3.5, 300) = 41
    """
    return round(mm * dpi / 25.4)


# ─────────────────────────────────────────
# 내부 유틸
# ─────────────────────────────────────────

def _alpha_to_binary_mask(image: Image.Image, alpha_threshold: float = 0.1) -> np.ndarray:
    """
    PIL RGBA 이미지 알파 채널 → 이진 마스크 (uint8, 0 or 255).
    alpha_threshold: 0.0~1.0 — 이 값 이상이면 불투명으로 처리.
    0.1로 설정 시 AI 생성 이미지의 반투명 엣지 노이즈를 대부분 제거한다.
    """
    if image.mode != "RGBA":
        image = image.convert("RGBA")
    alpha = np.array(image.split()[3], dtype=np.uint8)
    thresh_val = int(alpha_threshold * 255)
    _, binary = cv2.threshold(alpha, thresh_val, 255, cv2.THRESH_BINARY)
    return binary


def _keep_largest_blob(binary: np.ndarray) -> np.ndarray:
    """
    연결 요소 분석(connected components)으로 가장 큰 blob만 유지.
    내부 hole, 작은 노이즈 점 모두 제거된다.
    connectivity=8: 대각선 방향도 연결로 처리.
    """
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(
        binary, connectivity=8
    )
    if num_labels <= 1:
        return binary  # 배경만 있음

    # label 0은 배경이므로 제외, 나머지 중 가장 큰 것 선택
    areas = stats[1:, cv2.CC_STAT_AREA]
    largest_label = int(np.argmax(areas)) + 1
    mask = np.zeros_like(binary)
    mask[labels == largest_label] = 255
    return mask


def _dilate(binary: np.ndarray, offset_px: int) -> np.ndarray:
    """
    원형(MORPH_ELLIPSE) 커널로 binary mask를 offset_px만큼 팽창.
    원형 커널 사용 이유: 직사각형 커널보다 모서리가 자연스럽게 둥글게 나온다.
    """
    kernel_size = offset_px * 2 + 1
    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (kernel_size, kernel_size)
    )
    return cv2.dilate(binary, kernel, iterations=1)


def _extract_outer_contour(binary: np.ndarray) -> Optional[np.ndarray]:
    """
    RETR_EXTERNAL: 가장 바깥 contour만 추출. 내부 hole 자동 무시.
    CHAIN_APPROX_NONE: 모든 점 유지 (이후 단계에서 줄임).
    여러 contour 중 면적이 가장 큰 것 하나만 반환.
    """
    contours, _ = cv2.findContours(
        binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE
    )
    if not contours:
        return None
    return max(contours, key=cv2.contourArea)


def _simplify_contour(contour: np.ndarray, epsilon_factor: float = 0.002) -> np.ndarray:
    """
    Ramer-Douglas-Peucker 알고리즘으로 점 수 감소.
    epsilon = 둘레 × epsilon_factor (기본 0.2%).
    값이 작을수록 정밀하지만 점이 많아짐. 0.002가 안정적 기준.
    """
    perimeter = cv2.arcLength(contour, closed=True)
    epsilon = epsilon_factor * perimeter
    return cv2.approxPolyDP(contour, epsilon, closed=True)


def _chaikin_smooth(points: np.ndarray, iterations: int = 2) -> np.ndarray:
    """
    Chaikin corner cutting 알고리즘으로 부드러운 곡선 생성.
    각 엣지를 1/4, 3/4 지점으로 분할해 뾰족한 모서리를 제거한다.
    iterations=2: 스티커 칼선에 충분한 부드러움, 과도한 변형 없음.
    """
    pts = points.reshape(-1, 2).astype(np.float64)
    for _ in range(iterations):
        new_pts = []
        n = len(pts)
        for i in range(n):
            p0 = pts[i]
            p1 = pts[(i + 1) % n]
            new_pts.append(0.75 * p0 + 0.25 * p1)
            new_pts.append(0.25 * p0 + 0.75 * p1)
        pts = np.array(new_pts)
    return pts


def _points_to_svg_path(points: np.ndarray) -> str:
    """
    좌표 배열 → SVG path d 속성 문자열.
    소수점 1자리로 반올림해 파일 크기 최소화.
    사용 예:
      <path d="{result}" fill="none" stroke="#ff00ff" stroke-width="2"/>
    """
    pts = points.reshape(-1, 2)
    parts = [f"M {pts[0][0]:.1f} {pts[0][1]:.1f}"]
    for x, y in pts[1:]:
        parts.append(f"L {x:.1f} {y:.1f}")
    parts.append("Z")
    return " ".join(parts)


# ─────────────────────────────────────────
# 공개 API
# ─────────────────────────────────────────

def generate_cutting_line_svg(
    image: Image.Image,
    offset_px: int = 41,
    alpha_threshold: float = 0.1,
    dpi: int = 300,
) -> Optional[str]:
    """
    투명 배경 PNG로부터 스티커 칼선 SVG path를 생성한다.

    파라미터:
        image           : PIL RGBA 이미지 (투명 배경)
        offset_px       : 칼선 여백(px). 기본 41px ≈ 3.5mm @300DPI
                          mm 기반으로 변경: offset_px = mm_to_px(3.5, dpi)
        alpha_threshold : 불투명 기준 (0.0~1.0). 기본 0.1
        dpi             : 출력 DPI. 현재는 로깅용, mm 변환 시 사용

    반환:
        SVG path d 속성 문자열, 실패 시 None

    SVG 완성 예시:
        w, h = image.size
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}">'
              f'<path d="{result}" fill="none" stroke="#ff00ff" stroke-width="2"/>'
              f'</svg>'

    41px → mm 기반으로 바꾸려면:
        offset_px=mm_to_px(offset_mm=3.5, dpi=dpi) 로 호출
    """
    logger.info(
        "[cutting_line] start offset_px=%d alpha_threshold=%.2f dpi=%d size=%s",
        offset_px, alpha_threshold, dpi, image.size,
    )
    try:
        binary = _alpha_to_binary_mask(image, alpha_threshold)
        binary = _keep_largest_blob(binary)
        dilated = _dilate(binary, offset_px)
        contour = _extract_outer_contour(dilated)
        if contour is None:
            logger.warning("[cutting_line] contour not found — returning None")
            return None
        simplified = _simplify_contour(contour)
        smoothed = _chaikin_smooth(simplified, iterations=2)
        path = _points_to_svg_path(smoothed)
        logger.info("[cutting_line] done path_len=%d", len(path))
        return path
    except Exception as e:
        logger.exception("[cutting_line] 칼선 생성 실패: %s", e)
        return None
```

**Step 2: 커밋**

```bash
cd /Users/kimbeomsu/Desktop/pocket-goods
git add apps/api/services/cutting_line.py
git commit -m "feat: add cutting_line service (alpha→SVG path pipeline)"
git push origin main
```

---

### Task 3: renderer.py — 투명 배경 렌더 옵션 추가

칼선은 모든 오브젝트를 투명 배경 위에 합성한 결과의 알파 채널을 사용해야 한다.
현재 `render_canvas`는 항상 흰 배경을 깔기 때문에 `transparent_bg` 파라미터를 추가한다.

**Files:**
- Modify: `apps/api/services/renderer.py`

**Step 1: `render_canvas` 시그니처와 배경 처리 수정**

`render_canvas` 함수의 시그니처를 다음과 같이 변경한다:

```python
def render_canvas(
    canvas_json: dict,
    product_type: str,
    transparent_bg: bool = False,
) -> Image.Image:
```

함수 내부에서 배경 색을 적용하는 줄을 다음과 같이 수정한다:

```python
    # 기존:
    bg = canvas_json.get("background", "#ffffff") or "#ffffff"
    result = Image.new("RGBA", (final_w, final_h), bg)

    # 변경 후:
    if transparent_bg:
        result = Image.new("RGBA", (final_w, final_h), (0, 0, 0, 0))
    else:
        bg = canvas_json.get("background", "#ffffff") or "#ffffff"
        result = Image.new("RGBA", (final_w, final_h), bg)
```

**Step 2: 커밋**

```bash
cd /Users/kimbeomsu/Desktop/pocket-goods
git add apps/api/services/renderer.py
git commit -m "feat: add transparent_bg option to render_canvas"
git push origin main
```

---

### Task 4: export.py — ExportResponse에 cutting_line_svg 추가

**Files:**
- Modify: `apps/api/routers/export.py`

**Step 1: import 추가**

파일 상단 import 블록에 추가:

```python
from services.cutting_line import generate_cutting_line_svg
```

**Step 2: ExportResponse 수정**

```python
class ExportResponse(BaseModel):
    print_url: str | None = None
    thumbnail_url: str | None = None
    cutting_line_svg: str | None = None  # 스티커 칼선 SVG path
```

**Step 3: export_design 함수에서 칼선 생성 추가**

렌더링 블록 직후에 투명 배경으로 칼선용 이미지를 렌더링하고 SVG를 생성한다:

```python
    try:
        img = render_canvas(req.canvas_json, req.product_type)
        png_bytes = to_png_bytes(img)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"렌더링 실패: {e}")

    # 칼선 생성 — 투명 배경으로 재렌더링
    cutting_line_svg: str | None = None
    if req.product_type == "sticker":
        try:
            img_transparent = render_canvas(
                req.canvas_json, req.product_type, transparent_bg=True
            )
            cutting_line_svg = generate_cutting_line_svg(img_transparent)
        except Exception as e:
            logger.warning("[export] 칼선 생성 실패 (무시): %s", e)
```

`logger` 사용을 위해 파일 상단에 추가:

```python
import logging
logger = logging.getLogger(__name__)
```

**Step 4: save_to_storage=False 응답에도 SVG 포함**

현재 save_to_storage=False는 PNG bytes를 직접 반환하므로 SVG를 포함할 수 없다.
SVG는 ExportResponse JSON으로만 반환 (save_to_storage=True 시)하도록 유지한다.

**Step 5: ExportResponse 반환 시 SVG 포함**

```python
    return ExportResponse(
        print_url=print_url,
        thumbnail_url=thumbnail_url,
        cutting_line_svg=cutting_line_svg,
    )
```

**Step 6: 커밋**

```bash
cd /Users/kimbeomsu/Desktop/pocket-goods
git add apps/api/routers/export.py
git commit -m "feat: include cutting_line_svg in ExportResponse for sticker product"
git push origin main
```

---

## 완료 확인

Vercel API 재배포 후:

```bash
curl -X POST https://<api-vercel-url>/api/export \
  -H "Content-Type: application/json" \
  -d '{"canvas_json": {"objects": [], "background": ""}, "product_type": "sticker", "save_to_storage": true}' \
  | python3 -m json.tool
```

응답 예시:
```json
{
  "print_url": null,
  "thumbnail_url": null,
  "cutting_line_svg": "M 45.2 38.1 L 46.8 37.5 ... Z"
}
```

---

## mm 기반 offset 변경 방법

`cutting_line.py`의 `generate_cutting_line_svg` 호출 시:
```python
from services.cutting_line import generate_cutting_line_svg, mm_to_px

svg = generate_cutting_line_svg(
    image,
    offset_px=mm_to_px(offset_mm=3.5, dpi=300),  # 41px
)
```

`export.py`에서 offset_mm을 ExportRequest 파라미터로 노출할 수도 있다.
