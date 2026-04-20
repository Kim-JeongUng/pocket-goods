<div align="center">
  <img src="apps/web/public/logo.png" alt="Pocket Goods" width="220" />

  <p><strong>브라우저 기반 커스텀 스티커 디자인 및 주문 접수 플랫폼</strong></p>

  <p>
    <a href="https://pocket-goods.com/">Production</a>
    ·
    <a href="apps/web/README.md">Web App</a>
    ·
    <a href="apps/api/README.md">API Server</a>
  </p>
</div>

---

## Overview

Pocket Goods는 브라우저에서 커스텀 스티커 아트워크를 편집하고, AI 기반 이미지 생성을 보조하며, 인쇄 경계 검증과 수동 주문 접수까지 처리하는 frontend/backend 분리형 애플리케이션입니다.

이 저장소는 가벼운 monorepo 구조로 구성되어 있습니다.

- `apps/web` — 랜딩 페이지, 디자인 에디터, 미리보기, 주문함, 주문 UI를 담당하는 Next.js 애플리케이션
- `apps/api` — 이미지 생성, 인쇄 렌더링, 배경 제거, 주문 메일 발송, export endpoint를 담당하는 FastAPI 서비스
- `docs` — 운영 메모, SQL setup, 구현 계획 문서
- `openspec` — 제품 및 기술 스펙 참고 문서

## Architecture

```txt
Browser / Next.js
  ├─ Fabric.js editor state
  ├─ Supabase auth/session helpers
  ├─ Local + Supabase persistence for drafts and shipping defaults
  └─ Manual order and cart UI

FastAPI service
  ├─ Google GenAI image generation
  ├─ Pillow/OpenCV print renderer
  ├─ Background removal pipeline
  ├─ Resend order notification
  └─ Optional Supabase integration
```

### Frontend

| Area | Stack |
| --- | --- |
| Framework | Next.js 16 App Router |
| Runtime UI | React 19, TypeScript |
| Styling | Tailwind CSS 4, shadcn-style UI primitives, Base UI, Vaul |
| Canvas | Fabric.js 7 |
| Auth / DB client | Supabase SSR / Supabase JS |
| Image utilities | `@imgly/background-removal`, HEIC conversion, browser canvas APIs |

### Backend

| Area | Stack |
| --- | --- |
| API | FastAPI, Uvicorn |
| Image generation | Google GenAI SDK |
| Rendering | Pillow, NumPy, OpenCV headless |
| Background removal | rembg, ONNX Runtime |
| Persistence / Storage | Supabase Python SDK |
| Notifications | Resend Email API |
| Local runtime | Uvicorn, Docker / Docker Compose |
| Production runtime | Vercel Python / FastAPI |

## Key Capabilities

### Browser editor

- Fabric.js 기반 캔버스 에디터로 이미지와 텍스트를 배치하고 편집합니다.
- A4/A5/A6 출력 용지 전환 시 기존 오브젝트의 크기와 비율을 임의로 변경하지 않습니다.
- 일반 텍스트와 인쇄 가능한 pill-style name label을 지원합니다.
- 로그인 사용자의 디자인 draft와 주문자/배송 기본값을 Supabase에 저장하며, 비로그인 또는 DB 미적용 환경에서는 local fallback을 사용합니다.
- 주문함은 디자인별로 하나의 output size만 유지하는 단일 사이즈 수량 흐름을 사용합니다.

### Print preview and export

- FastAPI에서 server-side 300 DPI PNG 렌더링을 수행합니다.
- Fabric text와 grouped label을 인쇄 export에 반영합니다.
- 브라우저에서 분리된 아트워크 영역을 분석해 cutline preview를 제공합니다.
- 주문함 썸네일은 시인성을 위해 흰 배경을 합성하지만, 실제 print payload는 투명 배경을 유지합니다.

### AI-assisted asset generation

- 에디터의 추천 AI style preset은 `apps/web/src/lib/ai-style-feed.ts`에서 중앙 관리합니다.
- `/admin/ai-styles` helper page에서 preset JSON을 편집, 검증, 미리보기, 복사, 다운로드할 수 있습니다.
- 업로드 이미지 또는 현재 캔버스를 기준으로 FastAPI generation endpoint에 prompt를 전달합니다.
- Supabase session 여부를 기준으로 anonymous/user-aware generation limit을 적용합니다.

### Manual order intake

- 현재 production flow는 결제창을 열지 않고 manual order receipt 방식으로 동작합니다.
- 주문 UI는 유효한 payload 생성 직후 즉시 완료 상태를 보여주고, Resend/export 작업은 background에서 이어서 처리합니다.
- 주문 메일에는 주문 metadata와 print-ready artwork attachment가 포함되며, UI overlay나 cutline marking은 합성하지 않습니다.

## Project Layout

```txt
pocket-goods/
├─ apps/
│  ├─ web/
│  │  ├─ src/app/                 # Next.js app routes
│  │  ├─ src/components/editor/   # editor, preview, order, cart UI
│  │  ├─ src/components/canvas/   # Fabric.js canvas hooks and view
│  │  ├─ src/lib/                 # API, pricing, persistence, style presets
│  │  └─ public/                  # logo, icons, static preview assets
│  └─ api/
│     ├─ routers/                 # FastAPI route modules
│     ├─ services/                # renderer, storage, fonts, rate limit, rembg
│     └─ requirements.txt
├─ docs/
│  └─ supabase-user-persistence.sql
├─ openspec/
├─ docker-compose.yml
└─ README.md
```

## Local Development

### 1. API service

API service는 repository root에서 Docker Compose로 실행하는 방식을 기본으로 합니다.

```bash
docker compose up --build
```

API server:

```txt
http://localhost:8000
```

OpenAPI docs:

```txt
http://localhost:8000/docs
```

API container는 아래 파일에서 환경변수를 읽습니다.

```txt
apps/api/.env
```

### 2. Web app

```bash
cd apps/web
npm ci
npm run dev
```

Web app:

```txt
http://localhost:3000
```

`NEXT_PUBLIC_API_URL`이 설정되어 있지 않으면 local browser traffic은 `http://localhost:8000`으로 fallback합니다. Production에서는 운영용 API URL을 하드코딩하지 않으므로 Web Vercel project에 배포된 API Vercel URL을 `NEXT_PUBLIC_API_URL`로 설정해야 합니다.

## Environment Variables

### `apps/web/.env` 또는 Vercel project variables

```env
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

### `apps/api/.env` 또는 API Vercel project variables

```env
# Preferred production auth: Gemini on Vertex AI.
GCP_LOCATION=global
GCP_PROJECT_ID=abstract-aloe-490608-n6
GOOGLE_CREDENTIALS=

# Optional local/dev fallback for the Gemini Developer API.
GEMINI_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

RESEND_API_KEY=
ORDER_EMAIL_FROM=pocketgoods0000@gmail.com
ORDER_EMAIL_TO=kju7859@gmail.com
ORDER_EMAIL_ALLOW_SKIP=0
ORDER_EMAIL_REQUIRED=1
```

AI 생성은 `GCP_PROJECT_ID`가 있으면 Vertex AI를 우선 사용하고, 없을 때만 `GEMINI_API_KEY`로 fallback합니다.
Vercel에서는 서비스 계정 JSON 전체를 `GOOGLE_CREDENTIALS` 변수에 넣으면 API가
`GOOGLE_APPLICATION_CREDENTIALS` 임시 파일로 변환해 사용합니다.

Resend를 사용할 경우 API key는 `RESEND_API_KEY`에 넣고, 기본 발신자는 `pocketgoods0000@gmail.com`,
기본 수신자는 `kju7859@gmail.com`입니다. Resend가 발신 주소를 거절하면 Resend에서 인증된 발신 주소로
`ORDER_EMAIL_FROM`을 바꿔야 합니다.

## Supabase Setup

Web app은 Supabase를 authentication과 사용자별 주문자 정보 / 디자인 draft persistence에 사용합니다.

Supabase Dashboard → SQL Editor에서 아래 SQL을 적용합니다.

```txt
docs/supabase-user-persistence.sql
```

생성되는 테이블은 다음과 같습니다.

- `public.user_order_profiles`
- `public.user_design_drafts`

두 테이블은 authenticated user 기준 Row Level Security policy를 사용합니다.

## AI Style Preset Maintenance

에디터의 style card는 아래 파일에서 중앙 관리합니다.

```txt
apps/web/src/lib/ai-style-feed.ts
```

컬렉션을 변경하는 방법은 다음과 같습니다.

1. `STYLE_FEED_ITEMS` 배열 순서를 바꾸면 카드 표시 순서가 바뀝니다.
2. 배열 항목을 추가/삭제하면 노출되는 카드 구성이 바뀝니다.
3. `preview`는 `apps/web/public` 아래 파일 경로를 가리키도록 수정합니다.
4. `basePrompt`는 generation prompt를 변경할 때 수정합니다.

서버 파일을 직접 수정하지 않고 JSON을 편집/미리보기할 수 있는 helper route도 제공합니다.

```txt
/admin/ai-styles
```

이 helper page는 의도적으로 export-only로 동작합니다. 실제 반영은 repository 파일을 수정하고 redeploy하는 절차를 거쳐야 합니다.

## Verification

Frontend checks:

```bash
cd apps/web
npx tsc --noEmit
npm run lint
npm run test
npm run build
```

API syntax check example:

```bash
python -m py_compile apps/api/services/renderer.py
```

현재 web regression script는 editor order behavior, production API fallback rules, Supabase persistence hooks, print text rendering contracts, AI style preset maintainability checks를 검증합니다.

## Deployment Notes

- Web frontend: Vercel
- API service: Vercel FastAPI project (`apps/api`)
- Database/Auth: Supabase
- Order email: API service에 설정된 Resend API

Frontend/API Vercel 환경변수 변경은 각 project redeploy가 필요합니다.

## Operational Notes

- Print export rendering은 server-side에서 유지합니다. 주문 attachment는 browser screenshot에 의존하지 않아야 합니다.
- 주문함 thumbnail은 시인성을 위해 흰 배경을 사용할 수 있지만, print payload는 명시적인 변경이 없는 한 transparent 상태를 유지해야 합니다.
- `SUPABASE_SERVICE_ROLE_KEY`는 frontend나 Vercel public variable에 노출하지 않습니다.
- 추후 payment checkout을 다시 활성화하더라도, payment completion 이후 현재 order email/export contract는 유지해야 합니다.
