"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, PackagePlus, ShoppingCart, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import AddressSearchFields from "@/components/editor/AddressSearchFields";
import { useOrderProfile } from "@/hooks/useOrderProfile";
import type { ProductType } from "@/lib/assets";
import { API_BASE_URL, readApiError } from "@/lib/api";
import { saveOrderHistory } from "@/lib/order-history";
import { createClient } from "@/lib/supabase/client";
import { PRINT_PRICE_KRW, SHIPPING_FEE_KRW, type OutputSize } from "@/lib/order-pricing";
import { addOrderCartItem, compactCartPreviewImage, createDefaultQuantities, EMPTY_QUANTITIES } from "@/lib/order-cart";
import { buildCutlinePreview, drawSmoothClosedPath } from "@/lib/cutline-preview";

type PreviewPayload = {
  imageSrc: string;
  canvasJSON: object;
  productType: ProductType;
  outputSize: OutputSize;
  revokeOnClose?: boolean;
};

type PreviewDialogProps = {
  open: boolean;
  payload: PreviewPayload | null;
  initialTab: "preview" | "order";
  onClose: () => void;
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
  quantities: Record<OutputSize, number>;
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
  quantities: {
    A6: 0,
    A5: 0,
    A4: 0,
  },
  buyerName: "",
  buyerPhone: "",
  buyerEmail: "",
  zipcode: "",
  addressLine1: "",
  addressLine2: "",
  memo: "",
  agree: false,
};

export default function PreviewDialog({
  open,
  payload,
  initialTab,
  onClose,
}: PreviewDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tab, setTab] = useState<"preview" | "order">(initialTab);
  const [cutline, setCutline] = useState<CutlineInfo>({ safe: false });
  const [form, setForm] = useState<OrderForm>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { rememberProfile } = useOrderProfile(open, setForm);

  useEffect(() => {
    if (!open || !payload) return;
    setTab(initialTab);
    setMessage(null);
    setError(null);
    setSubmitting(false);
    setForm((current) => ({
      ...current,
      quantities: createDefaultQuantities(payload.outputSize),
    }));
  }, [initialTab, open, payload]);

  const printAmount = useMemo(
    () => (payload ? PRINT_PRICE_KRW[payload.outputSize] * form.quantities[payload.outputSize] : 0),
    [form.quantities, payload],
  );
  const totalQuantity = useMemo(
    () => (payload ? form.quantities[payload.outputSize] : 0),
    [form.quantities, payload],
  );
  const amount = totalQuantity > 0 ? printAmount + SHIPPING_FEE_KRW : 0;
  const isFormReady = useMemo(
    () =>
      totalQuantity > 0 &&
      form.buyerName.trim() &&
      form.buyerPhone.trim() &&
      form.buyerEmail.trim() &&
      form.zipcode.trim() &&
      form.addressLine1.trim() &&
      form.addressLine2.trim() &&
      form.agree,
    [form, totalQuantity],
  );

  useEffect(() => {
    if (!open || !payload?.imageSrc || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      const maxW = 720;
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
    img.src = payload.imageSrc;
  }, [open, payload]);

  if (!open || !payload) return null;

  const close = () => {
    if (payload.revokeOnClose) URL.revokeObjectURL(payload.imageSrc);
    onClose();
  };

  const updateField =
    <K extends keyof OrderForm>(key: K) =>
    (value: OrderForm[K]) => {
      setForm((current) => ({ ...current, [key]: value }));
      setError(null);
      setMessage(null);
    };

  const updateQuantity = (size: OutputSize, nextQuantity: number) => {
    setForm((current) => ({
      ...current,
      quantities: {
        ...current.quantities,
        [size]: Math.max(0, Math.min(99, nextQuantity)),
      },
    }));
    setError(null);
    setMessage(null);
  };

  const handlePayment = async () => {
    if (!cutline.safe) {
      setError(cutline.reason ?? "칼선이 안전하지 않아 주문할 수 없습니다.");
      return;
    }
    if (!isFormReady) {
      setError("제작 수량, 주문자 정보와 배송지, 동의를 모두 입력해주세요.");
      return;
    }

    setError(null);
    setSubmitting(true);

    const paymentId = `pocket_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const selectedItems = [{ size: payload.outputSize, quantity: form.quantities[payload.outputSize] }];
    const orderName = `투명 스티커 ${payload.outputSize} ${totalQuantity}장 주문`;
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
    setMessage("주문 접수가 완료되었습니다. 제작자가 주문 정보를 확인할 예정입니다.");
    setSubmitting(false);

    void (async () => {
      try {
        const headers: HeadersInit = { "Content-Type": "application/json" };
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.access_token) {
          headers.Authorization = `Bearer ${session.access_token}`;
        }
        const verification = await fetch(
          `${API_BASE_URL}/api/payments/complete-noverify`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              paymentId,
              txId: "portone-disabled",
              orderName,
              amount,
              currency: "KRW",
              productType: "sticker",
              outputSize: payload.outputSize,
              items: selectedItems,
              canvasJSON: payload.canvasJSON,
              shipping,
            }),
          },
        );
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
              label: "현재 디자인",
              quantity: totalQuantity,
              outputSize: payload.outputSize,
              productType: "sticker",
            },
          ],
        });
        if (!historySaved) {
          console.warn("Order history save skipped after preview order submit.");
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
      } catch (err) {
        setMessage(null);
        setError(err instanceof Error ? err.message : "주문 처리 중 오류가 발생했습니다.");
      }
    })();
  };

  const handleAddToCart = async () => {
    if (!cutline.safe) {
      setError(cutline.reason ?? "칼선이 안전하지 않아 주문함에 담을 수 없습니다.");
      return;
    }
    try {
      const thumbnailSrc = await compactCartPreviewImage(payload.imageSrc);
      addOrderCartItem({
        thumbnailSrc,
        canvasJSON: payload.canvasJSON,
        productType: "sticker",
        outputSize: payload.outputSize,
        quantities: {
          ...EMPTY_QUANTITIES,
          [payload.outputSize]: form.quantities[payload.outputSize],
        },
      });
      close();
    } catch {
      setError("주문함 미리보기 저장에 실패했습니다. 이미지를 다시 확인해주세요.");
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-0 md:items-center md:p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl md:rounded-3xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-base font-extrabold">미리보기 · 칼선 확인</h2>
            <p className="text-xs text-zinc-500">작업 이미지와 빨간 칼선을 확인한 뒤 주문하세요.</p>
          </div>
          <button type="button" onClick={close} className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100" aria-label="닫기">
            <X className="size-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_360px]">
          <section className="min-h-0 overflow-auto bg-zinc-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-bold text-zinc-500">빨간 실선 = 재단 기준선</p>
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
            <div className="flex min-h-[360px] justify-center overflow-auto rounded-2xl border bg-[linear-gradient(45deg,#f3f4f6_25%,transparent_25%),linear-gradient(-45deg,#f3f4f6_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f3f4f6_75%),linear-gradient(-45deg,transparent_75%,#f3f4f6_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px] p-4">
              <canvas ref={canvasRef} className="max-h-[68vh] max-w-full bg-white shadow-xl ring-1 ring-black/10" />
            </div>
            {!cutline.safe && cutline.reason && (
              <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">{cutline.reason}</p>
            )}
            {cutline.warning && (
              <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">{cutline.warning}</p>
            )}
            {typeof cutline.cutRegionCount === "number" && (
              <dl className="mt-3 grid gap-2 rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-600 sm:grid-cols-3">
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

          <aside className="min-h-0 overflow-y-auto border-t p-4 md:border-l md:border-t-0">
            <div className="mb-4 grid grid-cols-2 rounded-xl bg-zinc-100 p-1 text-sm font-bold">
              <button className={`rounded-lg py-2 ${tab === "preview" ? "bg-white shadow-sm" : "text-zinc-500"}`} onClick={() => setTab("preview")}>칼선</button>
              <button className={`rounded-lg py-2 ${tab === "order" ? "bg-white shadow-sm" : "text-zinc-500"}`} onClick={() => setTab("order")}>주문하기</button>
            </div>

            {tab === "preview" ? (
              <div className="space-y-3 text-sm">
                <h3 className="font-bold">체크 포인트</h3>
                <ul className="list-disc space-y-2 pl-5 text-zinc-600">
                  <li>칼선은 이미지 바깥쪽 약 2mm 지점에 표시됩니다.</li>
                  <li>한 이미지라도 투명 여백으로 떨어진 그림 조각은 각각 별도 칼선으로 나뉠 수 있습니다.</li>
                  <li>분리된 칼선 영역 수와 감지 개수를 미리보기 메타데이터로 표시합니다.</li>
                  <li>이미지가 너무 바깥쪽이면 주문이 막힙니다.</li>
                  <li>빨간 선이 잘리면 편집 화면에서 이미지를 안쪽으로 옮겨주세요.</li>
                </ul>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl bg-zinc-50 p-3 text-sm">
                  <p className="mb-3 text-xs font-bold text-zinc-500">제작 수량</p>
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-white p-2 ring-1 ring-zinc-200">
                    <div>
                      <p className="font-bold">{payload.outputSize}</p>
                      <p className="text-[11px] text-zinc-500">장당 {PRINT_PRICE_KRW[payload.outputSize].toLocaleString("ko-KR")}원</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="grid size-7 place-items-center rounded-full border text-sm font-bold"
                        onClick={() => updateQuantity(payload.outputSize, form.quantities[payload.outputSize] - 1)}
                      >
                        -
                      </button>
                      <Input
                        className="h-8 w-12 text-center"
                        inputMode="numeric"
                        value={form.quantities[payload.outputSize]}
                        onChange={(event) => updateQuantity(payload.outputSize, Number(event.target.value) || 0)}
                      />
                      <button
                        type="button"
                        className="grid size-7 place-items-center rounded-full border text-sm font-bold"
                        onClick={() => updateQuantity(payload.outputSize, form.quantities[payload.outputSize] + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2 border-t pt-3">
                    <div className="flex justify-between">
                      <span>인쇄비 {payload.outputSize} × {form.quantities[payload.outputSize]}</span>
                      <b>{printAmount.toLocaleString("ko-KR")}원</b>
                    </div>
                  </div>
                  <div className="mt-2 flex justify-between"><span>택배비 <span className="text-[11px] text-zinc-400">(묶음 1회)</span></span><b>{totalQuantity > 0 ? SHIPPING_FEE_KRW.toLocaleString("ko-KR") : 0}원</b></div>
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
                <Button variant="outline" className="w-full" onClick={handleAddToCart} disabled={!cutline.safe || totalQuantity < 1}>
                  <PackagePlus className="mr-2 size-4" />
                  주문함에 담기
                </Button>
                <Button className="w-full" onClick={handlePayment} disabled={submitting || !isFormReady || !cutline.safe}>
                  {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ShoppingCart className="mr-2 size-4" />}
                  현재 디자인만 {amount.toLocaleString("ko-KR")}원 주문 접수
                </Button>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
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
