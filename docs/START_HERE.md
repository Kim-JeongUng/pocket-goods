# Pocket Goods 시작 가이드 (실행 + 구조 분석)

이 문서는 **처음 프로젝트를 받았을 때 바로 개발을 시작**할 수 있도록,
현재 코드베이스 기준으로 구조/흐름/실행 방법을 정리한 온보딩 문서입니다.

---

## 1) 한눈에 보기

- 모노레포 구조: `apps/web`(Next.js), `apps/api`(FastAPI)
- 핵심 사용자 흐름: 랜딩(`/`) → 에디터(`/design`) → AI 이미지 생성/편집 → 미리보기/칼선 확인 → 주문 접수 또는 내보내기(`/api/export`)
- 배포 구조: 프론트(Vercel), API(Vercel FastAPI), 로컬 통합 실행은 `docker-compose.yml`로 가능
- 모바일 최초 빈 캔버스 AI 시작 흐름과 버튼 배치 리뷰 기준은 `docs/ux-ai-start-flow.md`에 따로 정리되어 있습니다.

---

## 2) 현재 아키텍처 요약

### Frontend (`apps/web`)
- Next.js App Router 기반.
- 랜딩 페이지는 `src/app/page.tsx`.
- 에디터 페이지는 `src/app/design/page.tsx`에서 클라이언트 전용 레이아웃(`EditorLayout`)을 동적 로딩.
- 에디터 내부에서 Fabric.js 캔버스 조작, undo/redo, 텍스트/스티커/이미지 추가, 저장/복원, 미리보기/주문, 내보내기 수행.
- 2026년 4월 현재 스티커 주문은 PortOne 결제창을 열지 않는 임시 수동 접수 모드입니다.
  주문 완료 시 제작자 메일(`kju7859@gmail.com`)로 주문 정보와 칼선 없는 디자인 PNG를 보내는 계약을 유지해야 합니다.

### Backend (`apps/api`)
- FastAPI 엔트리포인트는 `main.py`.
- `/api/generate-image`: Gemini 기반 AI 이미지 생성 + 사용자/비로그인별 일일 생성 제한.
- `/api/export`: Fabric JSON → 300 DPI PNG 렌더링 + (옵션) Supabase 업로드 + 칼선 SVG 생성.
- 주문 완료 메일/결제 검증 관련 변경은 PortOne 임시 비활성화 상태와 충돌하지 않도록 `/api/payments`, `/api/export`,
  프론트 주문 다이얼로그의 계약을 함께 확인합니다.
- 서버 시작 시 폰트 보장(`ensure_fonts`) 로직 실행.
- 로그인 사용자의 배송 기본값과 디자인 드래프트는 Supabase DB에 저장합니다. 운영 DB에
  `docs/supabase-user-persistence.sql`을 적용해야 기기 간 복원이 활성화됩니다.

### 연동 포인트
- 프론트는 `NEXT_PUBLIC_API_URL`을 우선 사용합니다. 로컬에서는 기본값 `http://localhost:8000`을 사용합니다.
  배포 도메인에서는 운영용 API URL을 하드코딩하지 않으므로 Web Vercel project에 API Vercel URL을 반드시 설정합니다.
- Docker Compose에서는 웹 컨테이너가 `NEXT_PUBLIC_API_URL=http://api:8000`을 사용.

---

## 3) 시작 전에 꼭 알아야 할 점

1. **문서 간 버전 정보 차이 존재**
   - 루트 README와 실제 `apps/web/package.json` 기준 Next.js 버전 표기가 다를 수 있으니,
     실제 실행/의존성 판단은 `package.json`을 우선합니다.
2. **AI 생성 기능은 외부 인증이 없으면 동작하지 않음**
   - 운영은 Vertex AI 환경변수(`GCP_PROJECT_ID`, `GCP_LOCATION`, `GOOGLE_CREDENTIALS`)를 우선 사용합니다.
   - `GCP_PROJECT_ID`가 없으면 개발용 fallback으로 `GEMINI_API_KEY`를 사용합니다.
   - 둘 다 없으면 `/api/generate-image`는 500 에러를 반환합니다.
3. **스토리지 업로드는 로컬에서 선택 사항**
   - `/api/export`에서 `save_to_storage=false`면 Supabase 없이도 PNG/칼선 미리보기 다운로드가 가능합니다.

---

## 4) 로컬 실행 방법 (추천 순서)

## A안) Docker Compose로 한 번에 실행

```bash
docker compose up --build
```

- Web: http://localhost:3000
- API: http://localhost:8000

사전 준비:
- `apps/web/.env.local`
- `apps/api/.env`

파일이 없으면 빈 템플릿으로 먼저 생성하고, 필요한 키만 채워도 기본 화면/에디터 확인은 가능합니다.

## B안) 개별 실행 (디버깅 친화)

### 1) API 실행
```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2) Web 실행
```bash
cd apps/web
npm ci
npm run dev
```

---

## 5) 환경 변수 빠른 체크리스트

### `apps/api/.env`
- `GCP_PROJECT_ID`, `GCP_LOCATION=global`, `GOOGLE_CREDENTIALS` (운영 AI 생성 / Vertex AI 권장)
- `GEMINI_API_KEY` (개발용 Gemini Developer API fallback)
- `SUPABASE_URL` (인증/스토리지 연동 시)
- `SUPABASE_SERVICE_ROLE_KEY` (인증 검증/업로드 시)
- `RESEND_API_KEY`, `ORDER_EMAIL_FROM` 또는 `RESEND_FROM_EMAIL` (주문 완료 메일 필수)
- `ORDER_EMAIL_REQUIRED=1` (운영에서 메일 실패를 즉시 드러내기 위해 권장)
- `ORDER_EMAIL_TO` 또는 `ORDER_OWNER_EMAIL` (기본 수신자 `kju7859@gmail.com`을 바꿀 때)

### `apps/web/.env.local`
- `NEXT_PUBLIC_API_URL` (운영 필수: API Vercel deployment URL, 로컬 기본: `http://localhost:8000`)
- `NEXT_PUBLIC_SUPABASE_URL` (로그인 기능 사용할 때)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (로그인 기능 사용할 때)
- PortOne 공개 키는 현재 수동 주문 접수 모드에서는 필수값이 아닙니다. 다시 활성화할 때는 결제 완료 후에도
  제작자 메일과 칼선 없는 인쇄 이미지 생성 계약을 재사용해야 합니다.

---

## 6) 기능 흐름 기준으로 코드 읽는 순서 (추천)

1. **사용자 진입/페이지 구성**
   - `apps/web/src/app/page.tsx`
   - `apps/web/src/app/design/page.tsx`
2. **에디터 오케스트레이션**
   - `apps/web/src/components/editor/EditorLayout.tsx`
   - 모바일 최초 빈 캔버스 진입 시 AI drawer가 먼저 열리는 UX 계약은 `docs/ux-ai-start-flow.md`
3. **캔버스 핵심 로직**
   - `apps/web/src/components/canvas/useCanvas.ts`
4. **미리보기/주문 흐름**
   - `apps/web/src/components/editor/PreviewDialog.tsx`
   - `apps/web/src/lib/order-profile.ts`
   - `apps/web/src/lib/order-cart.ts`
   - `apps/web/src/lib/order-pricing.ts`
5. **AI 생성 API**
   - `apps/api/routers/generate.py`
6. **내보내기/칼선 API**
   - `apps/api/routers/export.py`
   - `apps/api/services/renderer.py`
   - `apps/api/services/cutting_line.py`

이 순서로 보면 “UI 이벤트 → 캔버스 상태 → 서버 렌더링” 연결을 가장 빠르게 파악할 수 있습니다.

### 스티커 주문 변경 검토 포인트

- 분리된 아트워크는 여러 칼선 섬으로 제작될 수 있으므로 미리보기에서 한국어 경고를 노출합니다.
- A4/A5/A6 전환은 외부 캔버스 비율/출력 크기만 바꾸고 배치된 이미지/텍스트 자체를 확대하지 않습니다.
- mm 작업 영역 경계는 점선이 아니라 실선으로 유지해 preview cutline과 혼동되지 않게 합니다.
- 주문용 PNG는 칼선/주문자 정보/주문번호/주문시각이 합성되지 않은 디자인 이미지만 포함해야 합니다.
- 자세한 리뷰/QA 체크리스트는 `docs/plans/2026-04-13-editor-order-review.md`를 참고합니다.

---

## 7) 첫 주 작업 제안 (실무형 스타트 플랜)

### Day 1: 실행/관측 가능 상태 만들기
- 로컬에서 web/api를 모두 띄우고 `/design` 접근 확인
- `/health` 체크
- 내보내기 버튼으로 PNG 다운로드 동작 확인

### Day 2: API 계약 안정화
- `/api/export` 요청/응답 스키마를 문서화
- 실패 케이스(렌더 실패, 스토리지 미설정, 빈 오브젝트) 테스트 케이스 정리

### Day 3: 에디터 안정성
- Undo/Redo, 레이어 순서, 텍스트 속성 변경 시 회귀 테스트
- 모바일 하단 액션바/드로어 플로우 점검

### Day 4: 인증/제한 정책 점검
- 로그인/비로그인 일일 생성 횟수 정책 확인
- 로그인 리다이렉트(`next`) 파라미터 흐름 검증

### Day 5: 배포 파이프라인 드라이런
- web build/lint
- api 컨테이너 빌드
- 환경 변수 누락 시 장애 포인트 문서화

---

## 8) 빠른 검증 명령어 모음

```bash
# repo 루트
npm --prefix apps/web run lint
npx --prefix apps/web tsc --noEmit
npm --prefix apps/web run build
python -m compileall apps/api
curl -s http://localhost:8000/health
```

---

## 9) 초보 기여자가 바로 잡기 좋은 이슈 후보

1. 루트 README와 실제 버전/실행 가이드 동기화
2. `apps/web/README.md`를 현재 프로젝트 맞춤형으로 업데이트
3. `.env.example` 파일(web/api) 추가
4. `/api/export` 응답 예시(JSON) 문서 추가
5. 에디터 핵심 유즈케이스에 대한 간단한 회귀 체크리스트 문서화

---

## 10) 결론

현재 코드베이스는 **에디터 경험 + 서버 렌더링 파이프라인**이 이미 연결된 상태라,
초기 목표를 “기능 추가”보다 **실행 안정화 + 문서/테스트 보강**으로 잡으면
가장 빠르게 생산성을 높일 수 있습니다.
