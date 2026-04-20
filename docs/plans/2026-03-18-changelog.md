# 2026-03-18 변경 로그

이 문서는 2026-03-18 main 브랜치에 반영된 최근 15개 커밋의 변경 내용을 정리한다.

---

## 1. rembg lazy-load 적용 (`e4fd24a`)

### 배경
서버 기동 시 rembg 모델이 즉시 로드되어 시작 시간이 길었다.

### 변경 사항
- rembg 세션을 첫 요청 시 lazy-load하도록 변경
- `_get_rembg_session()` 함수로 모델 인스턴스를 싱글턴 관리

### 영향 파일
| 파일 | 변경 |
|------|------|
| `apps/api/routers/generate.py` | rembg lazy-load 로직 추가 |

---

## 2. API 서버 로컬 Docker 실행 가이드 (`8be6a8d`)

### 변경 사항
- API 서버를 로컬에서 Docker로 실행하는 방법 README에 추가

### 영향 파일
| 파일 | 변경 |
|------|------|
| `apps/api/README.md` | Docker 실행 가이드 작성 |

---

## 3. Export 단일 PNG 반환 + 사이즈 토글 이동 (`62c5aec`)

### 배경
기존에는 PNG + 칼선 SVG를 별도로 반환했으나, 단일 PNG로 통합 필요. 출력 사이즈 토글(A4/A5/A6)을 줌 컨트롤 옆으로 이동하여 접근성 향상.

### 변경 사항
- Export API가 단일 PNG blob을 직접 반환하도록 변경
- 사이즈 토글(A4/A5/A6)을 캔버스 하단 줌 컨트롤 옆으로 배치
- EditorLayout에 `outputSize` 상태 추가

### 영향 파일
| 파일 | 변경 |
|------|------|
| `apps/api/routers/export.py` | 단일 PNG 반환으로 변경 |
| `apps/web/src/components/editor/EditorLayout.tsx` | 사이즈 토글 UI 이동, outputSize 상태 추가 |

---

## 4. 출력 사이즈 보정 — 외부 스티커 +4mm 팽창 역보상 (`80597c1`)

### 배경
스티커 업체가 칼선 외부에 +4mm를 추가하기 때문에 출력물이 의도보다 크게 나오는 문제.

### 변경 사항
- 렌더링 시 A4/A5/A6 각 사이즈에서 4mm만큼 역보상 적용
- 실제 출력물이 의도한 A 사이즈와 일치하도록 함

### 영향 파일
| 파일 | 변경 |
|------|------|
| `apps/api/services/renderer.py` | 사이즈 역보상 로직 |

---

## 5. A 사이즈 작업 영역 상수 적용 (`41fc267`)

### 변경 사항
- 렌더 타임 감산 방식에서 상수 기반 작업 영역 크기로 변경
- 코드 가독성 및 유지보수성 향상

### 영향 파일
| 파일 | 변경 |
|------|------|
| `apps/api/services/renderer.py` | 작업 영역 상수 정의 및 적용 |

---

## 6. A 사이즈 mm 라벨 복원 (`631670f`, `5e23bdc`)

### 배경
사이즈 보정 작업 중 UI에 표시되는 mm 라벨이 보정된 값으로 바뀌었으나, 사용자에게는 표준 A 사이즈(A4: 210x297mm 등)를 보여줘야 함.

### 변경 사항
- UI 표시용 mm 라벨은 표준 A 사이즈 유지
- 출력 전용 보정만 내부적으로 적용

### 영향 파일
| 파일 | 변경 |
|------|------|
| `apps/web/src/components/editor/EditorLayout.tsx` | 라벨 복원 |
| `apps/api/services/renderer.py` | 출력 전용 보정 분리 |

---

## 7. A4/A5/A6 출력 픽셀 4mm 감소 (`4c42f72`)

### 변경 사항
- 300DPI 기준 A4/A5/A6 출력 픽셀 크기에서 4mm에 해당하는 픽셀을 감산
- 스티커 업체의 외부 팽창분을 사전 보정

### 영향 파일
| 파일 | 변경 |
|------|------|
| `apps/api/services/renderer.py` | 픽셀 감산 적용 |

---

## 8. 출력 사이즈 감소량 4mm → 6mm 조정 (`1c67286`)

### 배경
4mm 보정으로 부족하여 6mm로 상향 조정.

### 변경 사항
- 역보상 값을 4mm에서 6mm로 변경

### 영향 파일
| 파일 | 변경 |
|------|------|
| `apps/api/services/renderer.py` | 감소량 조정 |

---

## 9. renderer.py 업데이트 (`7c97db4`)

### 변경 사항
- 렌더러 후속 수정 (사이즈 보정 관련 정리)

### 영향 파일
| 파일 | 변경 |
|------|------|
| `apps/api/services/renderer.py` | 코드 정리 |

---

## 10. 캔버스 인접 실측 치수 오버레이 UI (`ef8cd07`)

### 배경
사용자가 현재 작업 중인 캔버스의 실제 출력 크기(mm)를 직관적으로 확인할 수 있어야 함.

### 변경 사항
- DesignCanvas 컴포넌트에 캔버스 테두리 인접 실측 치수(가로 x 세로 mm) 오버레이 표시
- 출력 사이즈 변경 시 실시간 반영

### 영향 파일
| 파일 | 변경 |
|------|------|
| `apps/web/src/components/canvas/DesignCanvas.tsx` | 치수 오버레이 UI 추가 |

---

## 변경 파일 전체 요약

| 파일 | 주요 변경 |
|------|-----------|
| `apps/api/README.md` | Docker 실행 가이드 |
| `apps/api/vercel-api.json` | Vercel API 설정 업데이트 |
| `apps/api/routers/export.py` | 단일 PNG 반환 |
| `apps/api/routers/generate.py` | rembg lazy-load |
| `apps/api/services/renderer.py` | 출력 사이즈 보정 (A4/A5/A6 -6mm) |
| `apps/web/src/components/canvas/DesignCanvas.tsx` | 실측 치수 오버레이 UI |
| `apps/web/src/components/editor/EditorLayout.tsx` | 사이즈 토글 이동, outputSize 상태 |
| `docs/START_HERE.md` | 프로젝트 온보딩 가이드 |
