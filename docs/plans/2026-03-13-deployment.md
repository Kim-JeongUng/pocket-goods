# Deployment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** FastAPI를 Vercel API에, Next.js를 Vercel에 배포하여 라이브 URL을 확보한다.

**Architecture:** apps/api(Dockerfile 빌드) → Vercel API, apps/web → Vercel. Supabase/Toss는 이번 배포에 포함하지 않는다.

**Tech Stack:** Python 3.13, FastAPI, uvicorn, Next.js 15, Vercel CLI, Vercel Dashboard

---

### Task 1: Dockerfile Python 버전 업데이트

**Files:**
- Modify: `apps/api/Dockerfile:1`

**Step 1: Dockerfile 수정**

```dockerfile
FROM python:3.13-slim
```
(`FROM python:3.12-slim` → `FROM python:3.13-slim`)

**Step 2: 커밋**

```bash
git add apps/api/Dockerfile
git commit -m "chore: update python version to 3.13 in Dockerfile"
```

---

### Task 2: CORS 허용 범위 확장

**Files:**
- Modify: `apps/api/main.py:20-25`

**Step 1: CORS allow_origins 수정**

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

(Vercel 도메인 확정 후 `["*"]` → `["https://<your-app>.vercel.app"]` 로 교체)

**Step 2: 커밋**

```bash
git add apps/api/main.py
git commit -m "chore: allow all origins for initial deploy (to be restricted)"
```

---

### Task 3: .gitignore __pycache__ 추가

**Files:**
- Modify: `.gitignore`

**Step 1: 이미 추적된 __pycache__ git에서 제거**

```bash
git rm -r --cached apps/api/__pycache__
git rm -r --cached apps/api/routers/__pycache__
git rm -r --cached apps/api/services/__pycache__
```

**Step 2: .gitignore 확인 (`__pycache__/`가 이미 있으므로 추가 불필요)**

**Step 3: 커밋**

```bash
git add .gitignore
git commit -m "chore: remove __pycache__ from git tracking"
```

---

### Task 4: 변경사항 푸시

**Step 1: 푸시**

```bash
git push origin main
```

---

### Task 5: Vercel — FastAPI 배포

**Step 1: Vercel API project 생성**

1. https://vercel-api.app 접속 → New Project
2. "Deploy from GitHub repo" 선택
3. `pocket-goods` 저장소 선택
4. **Root Directory** → `apps/api` 로 설정

**Step 2: 환경변수 설정**

Vercel 대시보드 → Variables 탭:
```
GEMINI_API_KEY=<새로 발급한 키>
```

**Step 3: 배포 확인**

- Build 로그에서 `Successfully built` 확인
- `https://<project>.vercel-api.app/health` 접속 → `{"status":"ok"}` 응답 확인
- API Vercel URL을 메모해둘 것 (Task 6에서 사용)

---

### Task 6: Vercel — Next.js 배포

**Step 1: Vercel 프로젝트 생성**

1. https://vercel.com 접속 → New Project
2. `pocket-goods` 저장소 선택
3. **Root Directory** → `apps/web` 로 설정
4. Framework Preset: Next.js (자동 감지)

**Step 2: 환경변수 설정**

Vercel 대시보드 → Settings → Environment Variables:
```
NEXT_PUBLIC_API_URL=https://<task-5에서-얻은-vercel-api-url>
```

**Step 3: 배포**

Deploy 버튼 클릭 → Build 로그 확인

**Step 4: 배포 확인**

`https://<project>.vercel.app` 접속 → 디자인 에디터 페이지 동작 확인

---

### Task 7: CORS 도메인 제한 (보안 강화)

**Files:**
- Modify: `apps/api/main.py:20-25`

**Step 1: Vercel URL로 CORS 업데이트**

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://<your-project>.vercel.app"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Step 2: 커밋 & 푸시**

```bash
git add apps/api/main.py
git commit -m "chore: restrict CORS to vercel domain"
git push origin main
```

Vercel이 자동으로 재배포됨.

---

## 완료 체크리스트

- [ ] `https://<project>.vercel-api.app/health` → `{"status":"ok"}`
- [ ] `https://<project>.vercel.app` → 디자인 에디터 접속 가능
- [ ] 캔버스에서 AI 기능 호출 시 API 응답 정상
- [ ] CORS 도메인이 `*` 가 아닌 Vercel URL로 제한됨
