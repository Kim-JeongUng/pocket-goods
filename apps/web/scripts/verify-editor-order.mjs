import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const previewDialog = read("src/components/editor/PreviewDialog.tsx");
const cartDialog = read("src/components/editor/OrderCartDialog.tsx");
const orderDialog = read("src/components/editor/OrderDialog.tsx");
const userMenu = read("src/components/auth/UserMenu.tsx");
const orderCart = read("src/lib/order-cart.ts");
const orderHistory = read("src/lib/order-history.ts");
const previewPage = read("src/app/design/preview/preview-client.tsx");
const editorLayout = read("src/components/editor/EditorLayout.tsx");
const addressSearchFields = read("src/components/editor/AddressSearchFields.tsx");
const orderProfile = read("src/lib/order-profile.ts");
const useOrderProfile = read("src/hooks/useOrderProfile.ts");
const useSaveDesign = read("src/hooks/useSaveDesign.ts");
const useCanvas = read("src/components/canvas/useCanvas.ts");
const aiPanel = read("src/components/editor/AIPanel.tsx");
const aiStyleFeed = read("src/lib/ai-style-feed.ts");
const aiStyleAdmin = read("src/app/admin/ai-styles/style-admin-client.tsx");
const mobileActionBar = read("src/components/editor/MobileActionBar.tsx");
const designCanvas = read("src/components/canvas/DesignCanvas.tsx");
const assetPanel = read("src/components/editor/AssetPanel.tsx");
const cutlinePreview = read("src/lib/cutline-preview.ts");
const outputSize = read("src/lib/output-size.ts");
const orderPricing = read("src/lib/order-pricing.ts");
const api = read("src/lib/api.ts");
const paymentsApi = read("../api/routers/payments.py");
const apiMain = read("../api/main.py");
const apiVercelConfig = read("../api/vercel.json");
const rendererApi = read("../api/services/renderer.py");
const generateApi = read("../api/routers/generate.py");
const supabaseSql = read("../../docs/supabase-user-persistence.sql");

test("PortOne browser checkout is disabled on all editor order entry points", () => {
  for (const [name, source] of [
    ["PreviewDialog", previewDialog],
    ["OrderCartDialog", cartDialog],
    ["OrderDialog", orderDialog],
    ["preview-client", previewPage],
  ]) {
    assert.equal(source.includes("@portone/browser-sdk"), false, `${name} still imports PortOne`);
    assert.equal(source.includes("requestPayment"), false, `${name} still opens a PortOne checkout`);
  }
  assert.match(paymentsApi, /PortOne 결제를 임시 비활성화한 수동 주문 접수 엔드포인트/);
  assert.match(paymentsApi, /결제 검증은 의도적으로 타지 않고/);
  assert.doesNotMatch(paymentsApi, /PORTONE_API_SECRET/);
});

test("owner order email is addressed and includes order metadata plus cutline-free image rendering", () => {
  assert.match(paymentsApi, /ORDER_OWNER_EMAIL\s*=\s*"kju7859@gmail\.com"/);
  assert.match(paymentsApi, /ORDER_SENDER_EMAIL\s*=\s*"onboarding@resend\.dev"/);
  assert.match(paymentsApi, /ORDER_REPLY_TO_EMAIL\s*=\s*"pocketgoods0000@gmail\.com"/);
  assert.match(paymentsApi, /_send_owner_order_email/);
  assert.match(paymentsApi, /주문번호:/);
  assert.match(paymentsApi, /주문시간:/);
  assert.match(paymentsApi, /주문자\/배송 정보/);
  assert.match(paymentsApi, /with_cutting_line=False/);
  assert.match(paymentsApi, /RESEND_EMAIL_ENDPOINT\s*=\s*"https:\/\/api\.resend\.com\/emails"/);
  assert.match(paymentsApi, /RESEND_API_KEY/);
  assert.match(paymentsApi, /base64\.b64encode/);
  assert.doesNotMatch(paymentsApi, new RegExp("smt" + "plib|S" + "MTP"));
  assert.match(paymentsApi, /canvasJSON/);
  assert.match(previewDialog, /canvasJSON:\s*payload\.canvasJSON/);
  assert.match(cartDialog, /canvasJSON:\s*item\.canvasJSON/);
  assert.match(previewPage, /canvasJSON:\s*payload\.canvasJSON/);
});

test("cutline preview warns for separated cutline regions and draws a solid boundary", () => {
  assert.match(cutlinePreview, /findConnectedComponents/);
  assert.match(cutlinePreview, /cutRegionCount/);
  assert.match(cutlinePreview, /분리 영역/);
  assert.match(previewDialog, /warning\?: string/);
  assert.match(previewPage, /warning\?: string/);
  assert.equal(previewDialog.includes("setLineDash([10, 6])"), false);
  assert.equal(previewPage.includes("setLineDash([10, 6])"), false);
  assert.match(previewDialog, /빨간 실선/);
  assert.match(previewPage, /빨간 실선/);
});

test("A4/A5/A6 sheet resizing changes canvas bounds without scaling placed objects", () => {
  assert.match(outputSize, /OUTPUT_CANVAS_SIZE/);
  assert.match(outputSize, /A4:\s*\{\s*width:\s*595,\s*height:\s*842\s*\}/);
  assert.match(outputSize, /A5:\s*\{\s*width:\s*420,\s*height:\s*595\s*\}/);
  assert.match(outputSize, /A6:\s*\{\s*width:\s*298,\s*height:\s*420\s*\}/);
  assert.match(editorLayout, /setCanvasSize\(OUTPUT_CANVAS_SIZE\[outputSize\]\)/);
  assert.match(useCanvas, /setCanvasSize/);
  assert.match(useCanvas, /originalSizeRef\.current = size/);
  assert.doesNotMatch(useCanvas, /setCanvasSize[\s\S]*scaleX\s*=/, "resize path must not mutate object scaleX");
  assert.doesNotMatch(useCanvas, /setCanvasSize[\s\S]*scaleY\s*=/, "resize path must not mutate object scaleY");
});

test("manual order intake keeps web and API sticker prices aligned", () => {
  assert.match(paymentsApi, /"A6": 4000/);
  assert.match(paymentsApi, /"A5": 5000/);
  assert.match(paymentsApi, /"A4": 6000/);
  assert.match(orderPricing, /A6:\s*4000/);
  assert.match(orderPricing, /A5:\s*5000/);
  assert.match(orderPricing, /A4:\s*6000/);
  assert.match(paymentsApi, /orderStatus:\s*Literal\["received"\]/);
  assert.match(paymentsApi, /status="ORDER_RECEIVED"/);
});

test("cart and order preview use one selected size per design", () => {
  assert.match(previewDialog, /quantities:\s*createDefaultQuantities\(payload\.outputSize\)/);
  assert.match(previewDialog, /outputSize:\s*payload\.outputSize/);
  assert.match(previewDialog, /PRINT_PRICE_KRW\[payload\.outputSize\] \* form\.quantities\[payload\.outputSize\]/);
  assert.match(previewDialog, /const selectedItems = \[\{ size: payload\.outputSize/);
  assert.match(previewDialog, /close\(\);/);
  assert.doesNotMatch(cartDialog, /outputSize:\s*"A5"/);
  assert.match(cartDialog, /outputSize:\s*primaryOutputSize/);
  assert.match(cartDialog, /output_size:\s*firstSelectedSize\(item\) \?\? "A5"/);
  assert.match(cartDialog, /getPreferredSize\(item\)/);
  assert.match(cartDialog, /getPreferredQuantity\(item\)/);
  assert.match(cartDialog, /선택한 사이즈/);
  assert.match(cartDialog, /onEditItem/);
  assert.match(cartDialog, /setZoomItem\(item\)/);
  assert.match(orderCart, /ctx\.fillStyle = "#ffffff"/);
});

test("order submit shows immediate completion and clears stale dialog messages", () => {
  assert.equal(previewDialog.includes("주문 정보를 서버로 보내는 중입니다"), false);
  assert.equal(cartDialog.includes("주문 정보를 서버로 보내는 중입니다"), false);
  assert.equal(previewDialog.includes("주문을 접수하는 중입니다"), false);
  assert.equal(cartDialog.includes("묶음 주문을 접수하는 중입니다"), false);
  assert.match(previewDialog, /setMessage\("주문 접수가 완료되었습니다\. 제작자가 주문 정보를 확인할 예정입니다\."\)/);
  assert.match(cartDialog, /setMessage\("묶음 주문 접수가 완료되었습니다\. 제작자가 주문 정보를 확인할 예정입니다\."\)/);
  assert.match(previewDialog, /void \(async \(\) =>/);
  assert.match(cartDialog, /void \(async \(\) =>/);
  assert.match(previewDialog, /setMessage\(null\);\s*setError\(null\);\s*setSubmitting\(false\);/);
  assert.match(cartDialog, /setMessage\(null\);\s*setError\(null\);\s*setSubmitting\(false\);/);
});

test("production order calls do not fall back to browser localhost", () => {
  assert.doesNotMatch(api, new RegExp("up\\.rail" + "way\\.app|PRODUCTION_API_URL", "i"));
  assert.match(api, /NEXT_PUBLIC_API_URL/);
  assert.match(api, /return "";/);
  assert.match(api, /readApiError/);
  assert.equal(previewDialog.includes("localhost:8000"), false);
  assert.equal(cartDialog.includes("localhost:8000"), false);
  assert.equal(orderDialog.includes("localhost:8000"), false);
  assert.equal(previewPage.includes("localhost:8000"), false);
  assert.match(apiMain, /allow_origin_regex=r"https:\/\/\.\*\\\.vercel\\\.app"/);
  assert.match(apiVercelConfig, /"destination":\s*"\/index\.py"/);
});

test("order shipping address uses searchable postcode flow with detail-only manual entry", () => {
  assert.match(addressSearchFields, /POSTCODE_SCRIPT_SRC/);
  assert.match(addressSearchFields, /window\.kakao\?\.Postcode/);
  assert.match(addressSearchFields, /zonecode/);
  assert.match(addressSearchFields, /roadAddress/);
  assert.match(addressSearchFields, /detailRef\.current\?\.focus/);
  assert.match(addressSearchFields, /readOnly placeholder="주소 검색으로 입력"/);
  assert.match(addressSearchFields, /readOnly placeholder="도로명\/지번 주소"/);
  for (const [name, source] of [
    ["PreviewDialog", previewDialog],
    ["OrderCartDialog", cartDialog],
    ["OrderDialog", orderDialog],
    ["preview-client", previewPage],
  ]) {
    assert.match(source, /AddressSearchFields/, `${name} must use the shared address search component`);
  }
});

test("logged-in users persist shipping defaults and large drafts in Supabase", () => {
  assert.match(orderProfile, /user_order_profiles/);
  assert.match(orderProfile, /saveOrderProfile/);
  assert.match(orderProfile, /loadOrderProfile/);
  assert.match(orderProfile, /localStorage/);
  assert.match(useOrderProfile, /loadOrderProfile/);
  assert.match(useOrderProfile, /saveOrderProfile/);
  for (const [name, source] of [
    ["PreviewDialog", previewDialog],
    ["OrderCartDialog", cartDialog],
    ["OrderDialog", orderDialog],
    ["preview-client", previewPage],
  ]) {
    assert.match(source, /useOrderProfile/, `${name} must load remembered shipping fields`);
    assert.match(source, /rememberProfile\(shipping\)/, `${name} must save shipping fields before order submit`);
  }

  assert.match(useSaveDesign, /user_design_drafts/);
  assert.match(useSaveDesign, /saveRemoteDraft/);
  assert.match(useSaveDesign, /from\(DRAFT_TABLE\)\.upsert/);
  assert.match(useSaveDesign, /loadDraft = useCallback\(async/);
  assert.match(editorLayout, /void loadDraft\(\)\.then/);
});

test("logged-in users persist order history and can open it from the profile drawer", () => {
  assert.match(orderHistory, /user_order_history/);
  assert.match(orderHistory, /saveOrderHistory/);
  assert.match(orderHistory, /loadOrderHistory/);
  assert.match(orderHistory, /summary_items/);
  assert.match(supabaseSql, /create table if not exists public\.user_order_history/);
  assert.match(supabaseSql, /shipping_snapshot jsonb/);
  assert.match(userMenu, /loadOrderHistory/);
  assert.match(userMenu, /DrawerContent/);
  assert.match(userMenu, /주문 내역/);
  assert.match(userMenu, /회원 정보와 이전 주문 내역을 확인할 수 있어요/);
  for (const [name, source] of [
    ["PreviewDialog", previewDialog],
    ["OrderCartDialog", cartDialog],
    ["OrderDialog", orderDialog],
    ["preview-client", previewPage],
  ]) {
    assert.match(source, /saveOrderHistory/, `${name} must persist order history`);
    assert.match(source, /orderStatus:\s*"received"/, `${name} must record received status`);
  }
});

test("print renderer keeps Fabric text and pill name tags in exports", () => {
  assert.match(rendererApi, /TEXT_OBJECT_TYPES\s*=\s*\{[^}]*"itext"[^}]*"textbox"/s);
  assert.match(rendererApi, /def _is_text_obj/);
  assert.match(rendererApi, /elif _is_text_obj\(obj\):/);
  assert.match(rendererApi, /def _is_name_tag_obj/);
  assert.match(rendererApi, /_obj_type\(obj\) == "group"/);
  assert.match(rendererApi, /def _render_name_tag_obj/);
  assert.match(rendererApi, /_find_group_rect_child/);
  assert.match(rendererApi, /_find_group_text_child/);
  assert.match(useCanvas, /FABRIC_EXPORT_PROPS/);
  assert.match(useCanvas, /pocketGoodsKind/);
  assert.match(useCanvas, /addNameTag/);
});

test("AI style feed copy is collection-oriented and presets are centrally maintainable", () => {
  assert.equal(aiPanel.includes("최대 4개"), false);
  assert.equal(aiPanel.includes("원하는 분위기를 골라보세요"), false);
  assert.match(aiPanel, /인기 스타일을 모아뒀어요/);
  assert.match(aiPanel, /STYLE_FEED_ITEMS/);
  assert.match(aiStyleFeed, /export const STYLE_FEED_ITEMS/);
  assert.match(aiStyleFeed, /preview:\s*"\/prompt-[^"]+\.webp"/);
  assert.doesNotMatch(aiStyleFeed, /kicker|shortDescription|description:\s*"/);
  assert.match(aiStyleFeed, /serializeStyleFeedItems/);
  assert.match(aiStyleAdmin, /AI 스타일 카드 관리/);
  assert.match(aiStyleAdmin, /기본값 복원/);
  assert.match(aiStyleAdmin, /다운로드/);
});

test("mobile editor uses swipeable style feed and fit-to-screen canvas", () => {
  assert.match(aiPanel, /feedScrollerRef/);
  assert.match(aiPanel, /scrollCompactFeed/);
  assert.match(aiPanel, /snap-x snap-mandatory/);
  assert.match(aiPanel, /overflow-x-auto/);
  assert.match(aiPanel, /STYLE_FEED_ITEMS\.map/);
  assert.match(mobileActionBar, /label=\{isStarterMode \? "AI 시작" : "\+추가"\}/);
  assert.match(mobileActionBar, /PlusCircle/);
  assert.match(mobileActionBar, /primary/);
  assert.match(editorLayout, /title="이미지·텍스트 추가"/);
  assert.match(editorLayout, /getMobileFitZoom/);
  assert.match(editorLayout, /window\.innerWidth - 36/);
  assert.match(editorLayout, /window\.innerHeight - 188/);
  assert.match(useCanvas, /const ZOOM_MIN = 0\.35/);
  assert.match(designCanvas, /px-3 py-5 md:px-16 md:py-16/);
});

test("mobile first empty canvas opens the AI creation surface after draft restore check", () => {
  assert.match(editorLayout, /mobileStartPanelOpenedRef/);
  assert.match(editorLayout, /draftRestoreChecked/);
  assert.match(editorLayout, /setDraftRestoreChecked\(false\)/);
  assert.match(editorLayout, /finally\(\(\) => \{\s*if \(!cancelled\) setDraftRestoreChecked\(true\);/);
  assert.match(editorLayout, /window\.matchMedia\("\(max-width: 767px\)"\)/);
  assert.match(editorLayout, /!draftRestoreChecked[\s\S]*hasObjects[\s\S]*mobileStartPanelOpenedRef\.current/);
  assert.match(editorLayout, /mobileStartPanelOpenedRef\.current = true;\s*setMobilePanel\("assets"\);/);
  assert.match(assetPanel, /<Tabs defaultValue="ai"/);
  assert.match(editorLayout, /<AssetPanel[\s\S]*className="w-full border-0"/);
});

test("AI generation state persists across mobile drawer/tab transitions", () => {
  assert.match(aiPanel, /AI_PANEL_DRAFT_STORAGE_KEY/);
  assert.match(aiPanel, /sessionStorage\.setItem\(AI_PANEL_DRAFT_STORAGE_KEY/);
  assert.match(aiPanel, /aiGenerationPromise/);
  assert.match(aiPanel, /subscribeAIPanelDraft/);
  assert.match(aiPanel, /readAsDataURL\(processed\.file\)/);
  assert.match(aiPanel, /탭을 닫거나 내려도 생성은 계속 진행됩니다/);
  assert.match(generateApi, /get_genai_client\("generate"\)/);
  assert.match(generateApi, /client\.aio\.models\.generate_content/);
  assert.match(generateApi, /_image_has_transparency/);
  assert.match(generateApi, /rembg 생략/);
});

test("generation credits support five daily uses, ad rewards, and order reset", () => {
  assert.match(generateApi, /generation\/reward-ad/);
  assert.match(aiPanel, /광고 보고 1회 더 만들기/);
  assert.match(aiPanel, /handleRewardedAd/);
  assert.match(aiPanel, /adRewarding/);
  assert.match(paymentsApi, /reset_usage/);
  assert.match(paymentsApi, /_reset_generation_credits\(request\)/);
  assert.match(previewDialog, /headers\.Authorization = `Bearer \$\{session\.access_token\}`/);
  assert.match(cartDialog, /headers\.Authorization = `Bearer \$\{session\.access_token\}`/);
});

test("selected style card and text tool use simplified defaults", () => {
  assert.doesNotMatch(aiStyleFeed, /shortDescription/);
  assert.doesNotMatch(aiPanel, /activeFeed\.shortDescription|item\.kicker|item\.description/);
  assert.match(aiPanel, /object-contain object-center/);
  assert.equal(aiPanel.includes("다시 누르거나 이 영역을 누르면 선택 해제"), false);
  assert.equal(assetPanel.includes("useState(ap.defaultText)"), false);
  assert.match(assetPanel, /useState\(""\)/);
});
