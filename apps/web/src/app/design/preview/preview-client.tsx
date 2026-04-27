"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import AddressSearchFields from "@/components/editor/AddressSearchFields";
import { useOrderProfile } from "@/hooks/useOrderProfile";
import { API_BASE_URL, readApiError } from "@/lib/api";
import { saveOrderHistory } from "@/lib/order-history";
import { getOrderAmount, PRINT_PRICE_KRW, SHIPPING_FEE_KRW, type OutputSize } from "@/lib/order-pricing";
import type { ProductType } from "@/lib/assets";
import { buildCutlinePreview, drawSmoothClosedPath } from "@/lib/cutline-preview";

type PreviewPayload = {
  imageDataUrl: string;
  canvasJSON: object;
  outputSize: OutputSize;
  productType: ProductType;
  initialTab?: "preview" | "order";
};

type CutlineInfo = {
  safe: boolean;
  reason?: string;
  warning?: string;
  cutRegionCount?: number;
  islandCount?: number;
  cutlineOffsetMm?: number;
};

type OrderForm = {
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string;
  zipcode: string;
  addressLine1: string;
  addressLine2: string;
  memo: string;
  agree: boolean;
};

const initialForm: OrderForm = {
  buyerName: "",
  buyerPhone: "",
  buyerEmail: "",
  zipcode: "",
  addressLine1: "",
  addressLine2: "",
  memo: "",
  agree: false,
};

export default function DesignPreviewClient() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [payload, setPayload] = useState<PreviewPayload | null>(null);
  const [tab, setTab] = useState<"preview" | "order">("preview");
  const [cutline, setCutline] = useState<CutlineInfo>({ safe: false });
  const [form, setForm] = useState<OrderForm>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { rememberProfile } = useOrderProfile(!!payload, setForm);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = params.get("key");
    const raw = key ? sessionStorage.getItem(key) : null;
    if (!raw) return;
    const nextPayload = JSON.parse(raw) as PreviewPayload;
    setPayload(nextPayload);
    setTab(nextPayload.initialTab ?? "preview");
  }, []);

  const amount = payload ? getOrderAmount(payload.outputSize) : 0;
  const isFormReady = useMemo(
    () =>
      form.buyerName.trim() &&
      form.buyerPhone.trim() &&
      form.buyerEmail.trim() &&
      form.zipcode.trim() &&
      form.addressLine1.trim() &&
      form.addressLine2.trim() &&
      form.agree,
    [form],
  );

  useEffect(() => {
    if (!payload?.imageDataUrl || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      const maxW = 820;
      const scale = Math.min(1, maxW / img.width);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ff1f2d";
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      const result = buildCutlinePreview(ctx.getImageData(0, 0, canvas.width, canvas.height), payload.outputSize);
      for (const contour of result.contours) {
        drawSmoothClosedPath(ctx, contour);
        ctx.stroke();
      }
      setCutline(result);
    };
    img.src = payload.imageDataUrl;
  }, [payload]);

  if (!payload) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 text-center">
        <p className="text-sm text-zinc-500">미리보기 데이터를 찾을 수 없습니다. 편집 화면에서 다시 열어주세요.</p>
      </main>
    );
  }

  const updateField =
    <K extends keyof OrderForm>(key: K) =>
    (value: OrderForm[K]) => {
      setForm((current) => ({ ...current, [key]: value }));
      setError(null);
      setMessage(null);
    };

  const handlePayment = async () => {
    if (!cutline.safe) {
      setError(cutline.reason ?? "칼선이 안전하지 않아 주문할 수 없습니다.");
      return;
    }
    if (!isFormReady) {
      setError("주문자 정보와 배송지, 동의를 모두 입력해주세요.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage("주문을 접수하는 중입니다…");
    const paymentId = `pocket_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const orderName = `투명 스티커 ${payload.outputSize} 주문`;
    const shipping = {
      buyerName: form.buyerName.trim(),
      buyerPhone: form.buyerPhone.trim(),
      buyerEmail: form.buyerEmail.trim(),
      zipcode: form.zipcode.trim(),
      addressLine1: form.addressLine1.trim(),
      addressLine2: form.addressLine2.trim(),
      memo: form.memo.trim(),
    };
    rememberProfile(shipping);

    try {
      setMessage("주문 정보를 서버로 보내는 중입니다…");
      const verification = await fetch(`${API_BASE_URL}/api/payments/complete-noverify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId,
          txId: "portone-disabled",
          orderName,
          amount,
          currency: "KRW",
          productType: "sticker",
          outputSize: payload.outputSize,
          canvasJSON: payload.canvasJSON,
          shipping,
        }),
      });
      if (!verification.ok) {
        throw new Error(await readApiError(verification, "주문 접수에 실패했습니다."));
      }
      const verificationBody = await verification.json().catch(() => null);
      if (verificationBody?.emailSent === false) {
        throw new Error("주문은 접수됐지만 이메일 발송이 비활성화되어 있습니다. 이메일 설정을 확인해주세요.");
      }

      const historySaved = await saveOrderHistory({
        paymentId,
        orderName,
        amount,
        currency: "KRW",
        productType: "sticker",
        outputSize: payload.outputSize,
        orderStatus: "received",
        shipping,
        summaryItems: [
          {
            label: "미리보기 주문",
            quantity: 1,
            outputSize: payload.outputSize,
            productType: "sticker",
          },
        ],
      });
      if (!historySaved) {
        console.warn("Order history save skipped after preview page submit.");
      }

      await fetch(`${API_BASE_URL}/api/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canvas_json: payload.canvasJSON,
          product_type: "sticker",
          output_size: payload.outputSize,
          order_id: paymentId,
          save_to_storage: true,
        }),
      }).catch(() => null);

      setMessage("주문 접수가 완료되었습니다. 결제는 일시적으로 비활성화되어 있습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "주문 처리 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f7f5] p-4 md:p-8">
      <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold">미리보기 · 칼선 확인</h1>
              <p className="text-xs text-zinc-500">빨간 실선이 실제 재단 기준선입니다.</p>
            </div>
            {cutline.safe ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                <CheckCircle2 className="size-3.5" /> 주문 가능
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-600">
                <AlertTriangle className="size-3.5" /> 주문 불가
              </span>
            )}
          </div>
          <div className="flex justify-center overflow-auto rounded-xl bg-[linear-gradient(45deg,#f3f4f6_25%,transparent_25%),linear-gradient(-45deg,#f3f4f6_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f3f4f6_75%),linear-gradient(-45deg,transparent_75%,#f3f4f6_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px] p-4">
            <canvas ref={canvasRef} className="max-h-[78vh] max-w-full rounded-sm shadow-xl ring-1 ring-black/10" />
          </div>
          {!cutline.safe && cutline.reason && (
            <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">{cutline.reason}</p>
          )}
          {cutline.warning && (
            <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">{cutline.warning}</p>
          )}
          {typeof cutline.cutRegionCount === "number" && (
            <dl className="mt-3 grid gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600 sm:grid-cols-3">
              <div>
                <dt className="font-bold text-zinc-500">칼선 영역</dt>
                <dd className="mt-0.5 text-sm font-extrabold text-zinc-950">{cutline.cutRegionCount}개</dd>
              </div>
              <div>
                <dt className="font-bold text-zinc-500">분리 감지</dt>
                <dd className="mt-0.5 text-sm font-extrabold text-zinc-950">{cutline.islandCount ?? cutline.cutRegionCount}개</dd>
              </div>
              <div>
                <dt className="font-bold text-zinc-500">칼선 간격</dt>
                <dd className="mt-0.5 text-sm font-extrabold text-zinc-950">약 {cutline.cutlineOffsetMm ?? 2}mm</dd>
              </div>
            </dl>
          )}
        </section>

        <aside className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-4 grid grid-cols-2 rounded-xl bg-zinc-100 p-1 text-sm font-bold">
            <button className={`rounded-lg py-2 ${tab === "preview" ? "bg-white shadow-sm" : "text-zinc-500"}`} onClick={() => setTab("preview")}>칼선</button>
            <button className={`rounded-lg py-2 ${tab === "order" ? "bg-white shadow-sm" : "text-zinc-500"}`} onClick={() => setTab("order")}>주문하기</button>
          </div>

          {tab === "preview" ? (
            <div className="space-y-3 text-sm">
              <h2 className="font-bold">체크 포인트</h2>
              <ul className="list-disc space-y-2 pl-5 text-zinc-600">
                <li>칼선은 이미지 바깥쪽에 약 2mm 떨어져 표시됩니다.</li>
                <li>작업 영역 가장자리에 너무 붙으면 주문이 막힙니다.</li>
                <li>빨간 선이 지나치게 잘리거나 영역 밖으로 나가면 원래 편집 화면에서 이미지를 안쪽으로 옮겨주세요.</li>
                <li>한 이미지라도 투명 여백으로 떨어진 그림 조각은 각각 별도 칼선으로 나뉠 수 있습니다.</li>
                <li>분리된 칼선 영역 수와 감지 개수를 미리보기 메타데이터로 표시합니다.</li>
              </ul>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl bg-zinc-50 p-3 text-sm">
                <div className="flex justify-between"><span>인쇄비 ({payload.outputSize})</span><b>{PRINT_PRICE_KRW[payload.outputSize].toLocaleString("ko-KR")}원</b></div>
                <div className="mt-2 flex justify-between"><span>택배비</span><b>{SHIPPING_FEE_KRW.toLocaleString("ko-KR")}원</b></div>
                <div className="mt-3 flex justify-between border-t pt-3 text-base"><span className="font-bold">총 결제금액</span><b>{amount.toLocaleString("ko-KR")}원</b></div>
              </div>

              <Field label="주문자 이름" required><Input value={form.buyerName} onChange={(e) => updateField("buyerName")(e.target.value)} /></Field>
              <Field label="연락처" required><Input value={form.buyerPhone} onChange={(e) => updateField("buyerPhone")(e.target.value)} /></Field>
              <Field label="이메일" required><Input type="email" value={form.buyerEmail} onChange={(e) => updateField("buyerEmail")(e.target.value)} /></Field>
              <AddressSearchFields
                value={{
                  zipcode: form.zipcode,
                  addressLine1: form.addressLine1,
                  addressLine2: form.addressLine2,
                }}
                onChange={(key, value) => updateField(key)(value)}
              />
              <Field label="배송 메모"><Textarea rows={3} className="resize-none" value={form.memo} onChange={(e) => updateField("memo")(e.target.value)} /></Field>
              <label className="flex gap-2 rounded-xl border p-3 text-xs"><input type="checkbox" checked={form.agree} onChange={(e) => updateField("agree")(e.target.checked)} /> 개인정보를 결제/배송 처리에 사용하는 데 동의합니다.</label>
              {(message || error) && <p className={`rounded-xl p-3 text-sm ${error ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}>{error ?? message}</p>}
              <Button className="w-full" onClick={handlePayment} disabled={submitting || !isFormReady || !cutline.safe}>
                {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ShoppingCart className="mr-2 size-4" />}
                {amount.toLocaleString("ko-KR")}원 주문 접수
              </Button>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}{required && <span className="ml-0.5 text-red-500">*</span>}</Label>
      {children}
    </div>
  );
}
