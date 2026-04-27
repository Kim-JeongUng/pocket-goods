"use client";

import { useMemo, useState } from "react";
import { Loader2, ShoppingCart, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import AddressSearchFields from "@/components/editor/AddressSearchFields";
import { useOrderProfile } from "@/hooks/useOrderProfile";
import { API_BASE_URL, readApiError } from "@/lib/api";
import type { ProductType } from "@/lib/assets";
import { saveOrderHistory } from "@/lib/order-history";
import { getOrderAmount, PRINT_PRICE_KRW, SHIPPING_FEE_KRW } from "@/lib/order-pricing";

type OutputSize = "A4" | "A5" | "A6";

type OrderDialogProps = {
  open: boolean;
  onClose: () => void;
  productType: ProductType;
  outputSize: OutputSize;
  canvasJSON: () => object;
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

type CompletePaymentPayload = {
  paymentId: string;
  txId: string;
  orderName: string;
  amount: number;
  currency: "KRW";
  productType: ProductType;
  outputSize: OutputSize;
  shipping: Omit<OrderForm, "agree">;
  canvasJSON: object;
};

const PRODUCT_LABELS: Record<ProductType, string> = {
  keyring: "투명 스티커",
  sticker: "투명 스티커",
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

export default function OrderDialog({
  open,
  onClose,
  productType,
  outputSize,
  canvasJSON,
}: OrderDialogProps) {
  const [form, setForm] = useState<OrderForm>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { rememberProfile } = useOrderProfile(open, setForm);

  const productName = PRODUCT_LABELS[productType];
  const orderName = `${productName} 주문`;
  const productPrice = PRINT_PRICE_KRW[outputSize];
  const orderAmount = getOrderAmount(outputSize);

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

  if (!open) return null;

  const updateField =
    <K extends keyof OrderForm>(key: K) =>
    (value: OrderForm[K]) => {
      setForm((current) => ({ ...current, [key]: value }));
      setError(null);
      setMessage(null);
    };

  const handlePayment = async () => {
    if (!isFormReady) {
      setError("주문자 정보, 배송지, 개인정보 제공 동의를 모두 입력해주세요.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage("주문을 접수하는 중입니다…");

    const paymentId = `pocket_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
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

      const completePayload: CompletePaymentPayload = {
        paymentId,
        txId: "portone-disabled",
        orderName,
        amount: orderAmount,
        currency: "KRW",
        productType,
        outputSize,
        shipping,
        canvasJSON: canvasJSON(),
      };

      const verification = await fetch(
        `${API_BASE_URL}/api/payments/complete-noverify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(completePayload),
        },
      );

      if (!verification.ok) {
        throw new Error(await readApiError(verification, "주문 접수에 실패했습니다. 입력 정보를 확인해주세요."));
      }
      const verificationBody = await verification.json().catch(() => null);
      if (verificationBody?.emailSent === false) {
        throw new Error("주문은 접수됐지만 이메일 발송이 비활성화되어 있습니다. 이메일 설정을 확인해주세요.");
      }

      const historySaved = await saveOrderHistory({
        paymentId,
        orderName,
        amount: orderAmount,
        currency: "KRW",
        productType,
        outputSize,
        orderStatus: "received",
        shipping,
        summaryItems: [
          {
            label: productName,
            quantity: 1,
            outputSize,
            productType,
          },
        ],
      });
      if (!historySaved) {
        console.warn("Order history save skipped after single order submit.");
      }

      setMessage("주문 확인 완료. 인쇄 파일을 저장하는 중입니다…");

      await fetch(`${API_BASE_URL}/api/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canvas_json: canvasJSON(),
          product_type: productType,
          output_size: outputSize,
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
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0 md:items-center md:p-4">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl md:max-w-lg md:rounded-3xl md:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-500">
              <ShoppingCart className="size-4" />
              주문 정보
            </div>
            <h2 className="mt-1 text-xl font-bold">{orderName}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              상품가 <span className="font-bold text-foreground">{productPrice.toLocaleString("ko-KR")}원</span>에
              택배비가 별도 부과됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground transition hover:bg-zinc-100 hover:text-foreground"
            aria-label="닫기"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
          결제는 일시적으로 비활성화되어 있으며, 버튼을 누르면 주문 정보가 바로 접수됩니다.
        </div>

        <div className="grid gap-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="주문자 이름" required>
              <Input
                value={form.buyerName}
                onChange={(event) => updateField("buyerName")(event.target.value)}
                placeholder="홍길동"
                autoComplete="name"
              />
            </Field>
            <Field label="연락처" required>
              <Input
                value={form.buyerPhone}
                onChange={(event) => updateField("buyerPhone")(event.target.value)}
                placeholder="01012345678"
                autoComplete="tel"
              />
            </Field>
          </div>

          <Field label="이메일" required>
            <Input
              type="email"
              value={form.buyerEmail}
              onChange={(event) => updateField("buyerEmail")(event.target.value)}
              placeholder="order@example.com"
              autoComplete="email"
            />
          </Field>

          <AddressSearchFields
            value={{
              zipcode: form.zipcode,
              addressLine1: form.addressLine1,
              addressLine2: form.addressLine2,
            }}
            onChange={(key, value) => updateField(key)(value)}
          />

          <Field label="배송 메모">
            <Textarea
              value={form.memo}
              onChange={(event) => updateField("memo")(event.target.value)}
              placeholder="부재 시 문 앞에 놓아주세요"
              rows={3}
              className="resize-none"
            />
          </Field>
        </div>

        <div className="mt-4 rounded-2xl bg-zinc-50 p-3 text-sm">
          <div className="flex justify-between">
            <span>{productName}</span>
            <span>{productPrice.toLocaleString("ko-KR")}원</span>
          </div>
          <div className="mt-2 flex justify-between">
            <span>택배비</span>
            <span>{SHIPPING_FEE_KRW.toLocaleString("ko-KR")}원</span>
          </div>
          <div className="mt-2 flex justify-between border-t pt-2 font-bold">
            <span>결제 금액</span>
            <span>{orderAmount.toLocaleString("ko-KR")}원</span>
          </div>
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-2xl border p-3 text-xs leading-relaxed">
          <input
            type="checkbox"
            checked={form.agree}
            onChange={(event) => updateField("agree")(event.target.checked)}
            className="mt-0.5"
          />
          <span>
            주문 제작 및 배송을 위해 입력한 개인정보를 결제/배송 처리 목적으로 사용하는 데 동의합니다.
          </span>
        </label>

        {(message || error) && (
          <p
            className={`mt-3 rounded-2xl p-3 text-sm ${
              error ? "bg-red-50 text-red-600" : "bg-primary/5 text-primary"
            }`}
          >
            {error ?? message}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            닫기
          </Button>
          <Button
            type="button"
            className="flex-1"
            onClick={handlePayment}
            disabled={submitting || !isFormReady}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                처리 중
              </>
            ) : (
              <>
                <ShoppingCart className="mr-2 size-4" />
                {orderAmount.toLocaleString("ko-KR")}원 주문 접수
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </Label>
      {children}
    </div>
  );
}
