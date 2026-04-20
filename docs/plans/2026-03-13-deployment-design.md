# Deployment Design — Pocket Goods

**Date:** 2026-03-13
**Scope:** FastAPI (Vercel API) + Next.js (Vercel)
**Excluded:** Supabase, Toss Payments (later)

## Architecture

- **Frontend:** Next.js 15 → Vercel (`apps/web` root)
- **Backend:** FastAPI → Vercel API (`apps/api` root, Dockerfile build)

## Code Changes

1. `apps/api/Dockerfile`: Python 3.12 → 3.13
2. `apps/api/main.py`: CORS `allow_origins` → `["*"]` (update after Vercel URL confirmed)
3. `.gitignore`: add `__pycache__/`, `*.pyc`

## Environment Variables

| Service | Key | Value |
|---------|-----|-------|
| Vercel API | `GEMINI_API_KEY` | new key (rotated) |
| Vercel | `NEXT_PUBLIC_API_URL` | API Vercel 배포 URL |

## Deploy Steps

1. 코드 수정 후 커밋 & 푸시
2. Vercel API: GitHub 연결 → `apps/api` 루트 → `GEMINI_API_KEY` 환경변수 설정
3. Vercel: GitHub 연결 → `apps/web` 루트 → `NEXT_PUBLIC_API_URL` 설정
4. API Vercel URL 확정 후 Vercel env 업데이트
5. CORS origin을 `*` → Vercel 도메인으로 업데이트
