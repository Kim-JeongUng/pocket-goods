# 포켓굿즈 API 서버

FastAPI 기반 백엔드 (이미지 생성, 내보내기, 누끼 처리, Resend 주문 메일)

## Vercel 배포

`apps/api`를 별도 Vercel project root로 연결합니다. Vercel은 `index.py`에서 export되는 FastAPI `app`을 실행합니다.

필수 운영 변수:

```env
RESEND_API_KEY=
ORDER_EMAIL_FROM=onboarding@resend.dev
ORDER_EMAIL_REPLY_TO=pocketgoods0000@gmail.com
ORDER_EMAIL_TO=kju7859@gmail.com
ORDER_EMAIL_REQUIRED=1

GCP_LOCATION=global
GCP_PROJECT_ID=
GOOGLE_CREDENTIALS=

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Web project에는 이 API project의 배포 URL을 `NEXT_PUBLIC_API_URL`로 설정합니다.

## 사전 준비: Docker Desktop 설치

### Windows

1. https://www.docker.com/products/docker-desktop/ 에서 **Docker Desktop for Windows** 다운로드
2. 설치 실행 → 기본 옵션 그대로 진행
3. 설치 완료 후 **재부팅**
4. Docker Desktop 실행 → 트레이 아이콘에서 **"Engine running"** 확인
5. 터미널에서 확인: `docker --version`

> WSL2 설치 안내가 뜨면 따라서 설치

### Mac

```bash
# Homebrew
brew install --cask docker
```

또는 https://www.docker.com/products/docker-desktop/ 에서 다운로드 (Apple Silicon / Intel 선택)

설치 후 Docker Desktop 실행 → 상단 메뉴바에서 고래 아이콘 확인 → `docker --version`

---

## 실행 방법

### Docker (권장)

프로젝트 루트에서:

```bash
docker compose up --build
```

- `http://localhost:8000` 에서 실행
- `http://localhost:8000/docs` 에서 API 문서 확인
- 코드 수정 시 자동 리로드 (volume mount + `--reload`)
- 종료: `Ctrl+C` 또는 `docker compose down`

- 첫 실행 시 `apps/api/.env` 파일 필요 (없으면 빈 파일이라도 생성)

### 로컬 (venv) - 이 방법은 왠만해서 쓰지말자 힘들다

```bash
cd apps/api

# 가상환경 생성 & 활성화
py -3.12 -m venv venv

# Git Bash
source venv/Scripts/activate

# PowerShell
.\venv\Scripts\Activate.ps1

# 패키지 설치
pip install -r requirements.txt

# 서버 실행
uvicorn main:app --reload --port 8000
```
