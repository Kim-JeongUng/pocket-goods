# 포켓굿즈 (Pocket Goods) — Claude Code Configuration

## Project Overview
웹 기반 POD(Print on Demand) 굿즈 디자인 & 주문 서비스.
스펙 전문: `openspec/specs/nano-goods.md`

## Tech Stack
- **Frontend:** Next.js 15 (App Router), TypeScript, Tailwind CSS
- **UI Components:** shadcn/ui (기본 컴포넌트 라이브러리)
- **Canvas:** Fabric.js (react-fabric-hooks 또는 수동 ref 관리)
- **Backend:** FastAPI (Python 3.12)
- **DB/Storage:** Supabase (PostgreSQL + Storage)
- **Payment:** Toss Payments
- **Deploy:** Vercel (Frontend), Vercel FastAPI (Backend)

## Directory Structure (planned)
```
nano-goods/
├── apps/
│   ├── web/          # Next.js 15 앱
│   │   ├── app/      # App Router pages
│   │   ├── components/
│   │   │   ├── canvas/    # Fabric.js 관련 컴포넌트
│   │   │   ├── preview/   # Mockup 프리뷰
│   │   │   └── ui/        # shadcn/ui 기반 공통 컴포넌트
│   │   └── lib/
│   └── api/          # FastAPI 서버
│       ├── routers/
│       ├── services/  # export, remove-bg 등
│       └── models/
├── packages/
│   └── types/        # 공유 TypeScript 타입
└── openspec/         # 스펙 문서
```

## Coding Conventions
- **TypeScript:** strict mode, `unknown` 대신 타입 명시
- **컴포넌트:** Server Component 기본, 클라이언트 상태 필요 시 `"use client"` 명시
- **Fabric.js:** 캔버스 인스턴스는 `useRef`로 관리, 이벤트 정리 필수
- **API 응답:** `{ data, error }` 패턴 통일
- **Python:** Pydantic v2 모델, async/await 일관 사용
- **커밋:** Conventional Commits (`feat:`, `fix:`, `chore:` 등)

## Key Architectural Decisions
- Fabric.js JSON이 Export Engine의 입력값 — 직렬화 구조를 절대 임의로 변경하지 말 것
- 인쇄 파일(print_url)은 Supabase Storage private 버킷 — 클라이언트에 직접 노출 금지
- 목업 프리뷰는 클라이언트 사이드 Canvas 합성 (서버 부하 없음)
- 결제 완료 웹훅에서 `/api/export` 자동 트리거 → 관리자가 즉시 파일 다운로드 가능

## Environment Variables
```
# apps/web/.env.local
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_TOSS_CLIENT_KEY=
API_BASE_URL=                    # FastAPI 서버 URL

# apps/api/.env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
TOSS_SECRET_KEY=
```

## Common Commands
```bash
# Frontend
cd apps/web && npm run dev       # 개발 서버 (port 3000)
cd apps/web && npm run build     # 프로덕션 빌드

# Backend
cd apps/api && uvicorn main:app --reload --port 8000

# DB 마이그레이션 (Supabase CLI)
supabase db push
```

## Do / Don't
- **DO:** 새 컴포넌트 추가 전 `openspec/specs/nano-goods.md` 요구사항 확인
- **DO:** Fabric.js 캔버스 변경 시 JSON 직렬화 호환성 테스트
- **DON'T:** `print_url` signed URL을 클라이언트 번들에 하드코딩
- **DON'T:** P1 기능(AI 배경 제거, SNS 공유)을 P0 완성 전에 구현 시작
