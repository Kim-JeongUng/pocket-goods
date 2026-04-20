# Pocket Goods Web

Next.js App Router 기반 프론트엔드입니다. 랜딩, AI 생성 진입, 에디터, 미리보기/주문 UI를 담당합니다.

## Local development

```bash
cd apps/web
npm ci
npm run dev
```

기본 API 주소는 `NEXT_PUBLIC_API_URL`입니다. 로컬 개발에서는 값이 없으면 `http://localhost:8000`을 사용합니다.
운영 Web Vercel project에는 별도 API Vercel deployment URL을 `NEXT_PUBLIC_API_URL`로 설정해야 합니다.
운영용 API URL을 코드에 하드코딩하지 않습니다.

## Editor and order flow

- `/design`은 `src/components/editor/EditorLayout.tsx`에서 에디터 상태를 조율합니다.
- Fabric.js 캔버스 조작은 `src/components/canvas/useCanvas.ts`가 담당합니다.
- 캔버스 표시/실측 mm 오버레이는 `src/components/canvas/DesignCanvas.tsx`에 있습니다.
- 랜딩 CTA, 모바일 최초 빈 캔버스 AI drawer, 버튼 배치 기준은 `../../docs/ux-ai-start-flow.md`의
  UX 동작 계약과 QA 체크리스트를 기준으로 리뷰합니다.
- 미리보기, 칼선 안정성 안내, 주문자/배송 폼은 `src/components/editor/PreviewDialog.tsx`에 있습니다.
- 주문함 묶음 저장 로직은 `src/lib/order-cart.ts`, 가격/배송비는 `src/lib/order-pricing.ts`를 기준으로 합니다.
- 로그인 사용자의 주문자/배송 정보와 디자인 드래프트는 Supabase DB 테이블(`user_order_profiles`,
  `user_design_drafts`)에 저장합니다. 운영 DB에는 `docs/supabase-user-persistence.sql`을 먼저 적용해야 하며,
  테이블이 없으면 기존 브라우저 저장소 fallback으로 동작합니다.

### April 2026 manual-order requirements

현재 스티커 주문은 PortOne 결제창을 열지 않는 임시 수동 접수 모드로 운영합니다.

1. 사용자가 미리보기에서 주문 완료를 누르면 즉시 제작자 메일(`kju7859@gmail.com`)로 접수합니다.
2. 메일 본문에는 주문번호, 주문 시각, 주문자/연락처/이메일/배송지, 선택한 A4/A5/A6 수량, 메모를 포함합니다.
3. 첨부/인라인 이미지에는 디자인 PNG만 포함합니다. 칼선, 주문번호/주문시각 텍스트, 사용자 정보, UI 캡처는 합성하지 않습니다.
4. A4/A5/A6 선택은 바깥 캔버스 비율과 출력 크기만 바꾸며, 배치된 이미지/텍스트의 원본 크기와 위치 비율을 임의로 확대하지 않습니다.
5. 분리된 아트워크가 여러 칼선 섬처럼 보일 수 있으면 한국어 경고 copy를 미리보기에서 보여줍니다.
6. mm 경계선은 점선이 아니라 사용자가 재단 영역을 명확히 볼 수 있는 실선으로 표시합니다.

PortOne을 다시 활성화할 때는 위 수동 주문 접수 경로를 제거하지 말고, 결제 완료 후 같은 메일/인쇄 이미지 생성 계약을 재사용하세요.

메일 발송은 FastAPI의 `/api/payments/complete`에서 Resend Email API로 처리합니다. 운영 API Vercel project에는
`RESEND_API_KEY`를 설정해야 합니다. 발신자는 기본 `pocketgoods0000@gmail.com`, 수신자는 기본
`kju7859@gmail.com`이며 `ORDER_EMAIL_FROM`, `ORDER_EMAIL_TO` 또는 `ORDER_OWNER_EMAIL`로 바꿀 수 있습니다.
개발 중 메일 미설정을 허용하려면 `ORDER_EMAIL_ALLOW_SKIP=1`을 명시하세요. 단, 운영에서는 이 값을 켜면
주문 메일이 실제로 발송되지 않습니다.

## Verification

```bash
cd apps/web
npm run lint
npx tsc --noEmit
npm run build
```

현재 별도 테스트 러너는 설정되어 있지 않습니다. 회귀 검증은 미리보기 열기, A4/A5/A6 전환, 칼선 안내, 주문 완료 버튼,
제작자 메일 payload/이미지 계약을 수동 또는 향후 E2E 테스트로 확인합니다.

