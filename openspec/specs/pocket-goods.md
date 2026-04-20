# 포켓굿즈 (Pocket Goods) — OpenSpec

**Version:** 0.2.0
**Status:** Draft
**Last Updated:** 2026-03-12

---

## 0. Target

## 1. Summary

웹 기반 POD(Print on Demand) 굿즈 디자인 & 주문 서비스.
사용자가 제공된 캐릭터 자산(나노바나나 등)을 캔버스에 배치하고, 텍스트/스티커를 더해 자신만의 키링·스티커를 디자인한 뒤 실물로 주문한다.

---

## 2. Background & Goals

### Background

- '다꾸/폰꾸' 문화 확산 — 팬덤 기반 개인화 굿즈 수요 증가
- 기존 디자인 툴(Photoshop, Figma)은 진입 장벽이 높음

### Goals

| Priority | Goal                                              |
| -------- | ------------------------------------------------- |
| G1       | 디자인 툴 없이 1분 안에 굿즈 디자인 완료          |
| G2       | 재고 없는 POD 방식으로 수익 모델 검증             |
| G3       | 완성 디자인을 SNS에 공유하고 싶은 인터페이스 제공 |

### Non-Goals

- 완전 자유 형태의 벡터 드로잉 (Illustrator 대체 아님)
- 다품목 쇼핑몰 (단일 SKU — 키링 / 스티커 2종에 집중)
- 다국어 지원 (초기 한국어만)

---

## 3. User Stories

```
US-01  사용자로서, 제공된 캐릭터를 캔버스에 배치하고 싶다.
US-02  사용자로서, 원하는 문구와 폰트/색상을 자유롭게 입력하고 싶다.
US-03  사용자로서, 디자인이 실제 키링/스티커 목업 위에 실시간으로 보이길 원한다.
US-04  사용자로서, 결제 후 제작 진행 상태를 확인하고 싶다.
US-05  관리자로서, 결제된 주문의 인쇄용 고해상도 파일을 다운로드하고 싶다.
US-06  사용자로서, 완성 디자인을 인스타그램 스토리 규격으로 저장/공유하고 싶다. (P1)
US-07  사용자로서, 내가 올린 사진의 배경을 자동으로 제거하고 싶다. (P1)
```

---

## 4. Functional Requirements

### P0 — Must Have

#### 4.1 Custom Canvas Editor

- Fabric.js 기반 드래그 앤 드롭 인터페이스
- **캐릭터 배치:** 제공된 자산 갤러리에서 선택 → 캔버스에 추가, 이동/크기조절/회전
- **텍스트 편집:** 자유 입력, 폰트 선택(최소 5종), 색상 피커, 크기 조절
- **스티커 추가:** 기본 아이콘 세트(하트, 별, 왕관 등 20종 이상) 제공
- 레이어 순서 변경(앞/뒤로 보내기)
- 실행 취소(Undo) / 다시 실행(Redo) — 최대 20스텝

#### 4.2 Live Mockup Preview

- 편집 캔버스와 동기화되는 실시간 목업 렌더링
- 목업 종류: 아크릴 키링, 투명 스티커 (각 2종 앵글)
- 렌더링 방식: CSS/Canvas 합성 (클라이언트 사이드, 서버 부하 없음)

#### 4.3 Export Engine (서버)

- FastAPI 엔드포인트가 Fabric.js JSON 수신 → Pillow/Cairo로 300 DPI PNG 합성
- 인쇄 재단선(Bleed) 3mm 자동 추가
- 산출물: 고해상도 PNG (인쇄용) + 저해상도 PNG (미리보기용)
- 결과물 Supabase Storage에 저장 후 signed URL 반환

#### 4.4 Simple Checkout

- 상품 선택(키링 / 스티커), 수량 선택, 배송지 입력
- Toss Payments 위젯 연동 (카드, 간편결제)
- 결제 완료 시 주문 DB 저장 + 인쇄 파일 자동 생성 트리거

### P1 — Nice to Have

#### 4.5 AI 배경 제거

- 사용자 업로드 이미지를 `rembg` (Python) 또는 Remove.bg API로 배경 제거
- 처리 결과를 캔버스에 바로 삽입

#### 4.6 SNS 공유

- 디자인 완료 후 1080×1920 인스타그램 스토리 규격 PNG 다운로드
- Web Share API 활용 모바일 공유

---

## 5. Data Models

### User

```
id          UUID  PK
email       TEXT  UNIQUE NOT NULL
created_at  TIMESTAMPTZ
```

### Design

```
id            UUID  PK
user_id       UUID  FK → User
canvas_json   JSONB          -- Fabric.js serialized state
thumbnail_url TEXT           -- 저해상도 미리보기 (Supabase Storage)
print_url     TEXT           -- 고해상도 인쇄용 (Supabase Storage, private)
product_type  ENUM('keyring','sticker')
created_at    TIMESTAMPTZ
```

### Order

```
id              UUID  PK
user_id         UUID  FK → User
design_id       UUID  FK → Design
status          ENUM('pending','paid','in_production','shipped','done')
quantity        INT
amount          INT            -- 원(KRW) 단위
toss_payment_key TEXT
shipping_name   TEXT
shipping_phone  TEXT
shipping_address TEXT
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

---

## 6. API Endpoints

| Method | Path                          | Description                        |
| ------ | ----------------------------- | ---------------------------------- |
| `POST` | `/api/export`                 | Fabric.js JSON → 고해상도 PNG 생성 |
| `POST` | `/api/remove-bg`              | 이미지 배경 제거 (P1)              |
| `POST` | `/api/orders`                 | 주문 생성                          |
| `GET`  | `/api/orders/{id}`            | 주문 상태 조회                     |
| `GET`  | `/admin/orders`               | 전체 주문 목록 (관리자)            |
| `GET`  | `/admin/orders/{id}/download` | 인쇄 파일 다운로드 (관리자)        |

---

## 7. Technical Stack

| Layer     | Technology                                   | Reason                        |
| --------- | -------------------------------------------- | ----------------------------- |
| Frontend  | Next.js 15 (App Router), Tailwind CSS        | RSC + 빠른 로딩               |
| Canvas    | Fabric.js                                    | 성숙한 API, 직렬화 지원       |
| Backend   | FastAPI (Python 3.12)                        | 이미지 처리 라이브러리 생태계 |
| Database  | PostgreSQL via Supabase                      | 관리형, RLS 지원              |
| Storage   | Supabase Storage                             | DB와 동일 플랫폼, 간단한 연동 |
| Payment   | Toss Payments                                | 국내 간편결제 최적화          |
| Hosting   | Vercel (Frontend) + Vercel Functions (FastAPI) | 각 레이어 최적화              |
| Image Lib | Pillow, CairoSVG, rembg                      | 서버 사이드 이미지 합성       |

### Fabric.js vs Konva.js 결정

| 기준        | Fabric.js        | Konva.js         |
| ----------- | ---------------- | ---------------- |
| JSON 직렬화 | ✅ 네이티브 지원 | 수동 구현 필요   |
| 텍스트 편집 | ✅ 내장          | 제한적           |
| 번들 크기   | ~300KB           | ~150KB           |
| React 통합  | 수동 ref 관리    | react-konva 있음 |

**결론: Fabric.js 채택** — JSON 직렬화가 Export Engine과 직결되므로 네이티브 지원이 결정적.

---

## 8. Architecture

```
┌─────────────────────────────────┐
│  Browser (Next.js / Vercel)     │
│  ┌─────────────┐  ┌──────────┐  │
│  │ Canvas UI   │  │ Mockup   │  │
│  │ (Fabric.js) │←→│ Preview  │  │
│  └──────┬──────┘  └──────────┘  │
│         │ canvas JSON            │
└─────────┼───────────────────────┘
          │ POST /api/export
          ▼
┌─────────────────────────────────┐
│  FastAPI Server (Vercel)       │
│  Pillow / CairoSVG 합성         │
│  → 300 DPI PNG 생성             │
└──────────────┬──────────────────┘
               │ upload
               ▼
┌─────────────────────────────────┐
│  Supabase                       │
│  PostgreSQL (orders, designs)   │
│  Storage (print files)          │
└─────────────────────────────────┘
               │ signed URL
               ▼
┌─────────────────────────────────┐
│  Admin Dashboard (Next.js)      │
│  주문 목록 + 인쇄 파일 다운로드  │
└─────────────────────────────────┘
```

---

## 9. Milestones

| Phase                   | Days      | Deliverables                                                      |
| ----------------------- | --------- | ----------------------------------------------------------------- |
| **M1** Setup & Canvas   | Day 1–3   | Next.js 세팅, Fabric.js 캔버스 기초(캐릭터 배치, 텍스트)          |
| **M2** Preview & Export | Day 4–6   | 목업 실시간 프리뷰, FastAPI Export 엔드포인트, S3/Supabase 업로드 |
| **M3** Order & Payment  | Day 7–10  | Toss Payments 연동, 주문 DB, 결제 후 파일 생성 트리거             |
| **M4** QA & Deploy      | Day 11–14 | 인쇄 파일 품질 검증, Vercel + Vercel API 배포, 초기 유저 테스트      |

---

## 10. Open Questions

- [ ] 캐릭터 자산 라이선스 범위 — 사용자가 다운로드 가능한가?
- [ ] 키링 / 스티커 단가 및 MOQ (최소 주문 수량) — 제조사 협의 필요
- [ ] 로그인 필수 여부 — 비회원 주문 허용 시 Design.user_id nullable 처리
- [ ] rembg 서버 비용 — GPU 인스턴스 필요 여부 검토

## 11. 인쇄 방법

- 인쇄 (킨코스, 마플, 주변 인쇄)
- 마플 api: 사업자 등록 고려
