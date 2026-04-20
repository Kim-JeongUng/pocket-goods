import base64
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import requests
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from services.renderer import render_canvas, to_png_bytes
from services.rate_limit import get_rate_identity, reset_usage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/payments", tags=["payments"])

OutputSize = Literal["A4", "A5", "A6"]

SHIPPING_FEE_KRW = 4000
PRINT_PRICE_KRW = {
    "A6": 4000,
    "A5": 5000,
    "A4": 6000,
}
ORDER_OWNER_EMAIL = "kju7859@gmail.com"
ORDER_SENDER_EMAIL = "pocketgoods0000@gmail.com"
RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails"


def _env_flag(name: str) -> bool:
    return os.getenv(name, "").lower() in ("1", "true", "yes")


class ShippingInfo(BaseModel):
    buyerName: str = Field(min_length=1, max_length=80)
    buyerPhone: str = Field(min_length=6, max_length=30)
    buyerEmail: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=120)
    zipcode: str = Field(min_length=1, max_length=20)
    addressLine1: str = Field(min_length=1, max_length=200)
    addressLine2: str = Field(min_length=1, max_length=200)
    memo: str = Field(default="", max_length=500)


class CompletePaymentRequest(BaseModel):
    paymentId: str = Field(min_length=1, max_length=120)
    txId: str = Field(min_length=1, max_length=120)
    orderName: str = Field(min_length=1, max_length=120)
    amount: int
    currency: Literal["KRW"] = "KRW"
    productType: Literal["keyring", "sticker"]
    outputSize: OutputSize
    items: list[dict[str, int | str]] | None = None
    orderItems: list[dict[str, Any]] | None = None
    canvasJSON: dict[str, Any] | None = None
    shipping: ShippingInfo


class CompletePaymentResponse(BaseModel):
    ok: bool
    paymentId: str
    txId: str | None = None
    status: str
    amount: int
    orderStatus: Literal["received"]
    emailSent: bool


def _selected_sizes_from_quantities(quantities: dict[str, Any]) -> list[tuple[OutputSize, int]]:
    selected: list[tuple[OutputSize, int]] = []
    for size in ("A6", "A5", "A4"):
        quantity = quantities.get(size, 0)
        if isinstance(quantity, int) and quantity > 0:
            selected.append((size, quantity))
    return selected


def _format_shipping(shipping: ShippingInfo) -> str:
    return "\n".join(
        [
            f"주문자: {shipping.buyerName}",
            f"연락처: {shipping.buyerPhone}",
            f"이메일: {shipping.buyerEmail}",
            f"우편번호: {shipping.zipcode}",
            f"주소: {shipping.addressLine1} {shipping.addressLine2}",
            f"배송 메모: {shipping.memo or '-'}",
        ]
    )


def _format_order_items(req: CompletePaymentRequest) -> str:
    if req.orderItems:
        lines: list[str] = []
        for index, design in enumerate(req.orderItems, start=1):
            quantities = design.get("quantities")
            if not isinstance(quantities, dict):
                continue
            selected = _selected_sizes_from_quantities(quantities)
            if not selected:
                continue
            quantities_text = ", ".join(f"{size} × {quantity}" for size, quantity in selected)
            lines.append(f"디자인 {index}: {quantities_text}")
        return "\n".join(lines) or "-"

    if req.items:
        lines = []
        for item in req.items:
            size = item.get("size")
            quantity = item.get("quantity")
            lines.append(f"{size} × {quantity}")
        return "\n".join(lines)

    return f"{req.outputSize} × 1"


def _render_order_attachments(req: CompletePaymentRequest) -> list[tuple[str, bytes]]:
    attachments: list[tuple[str, bytes]] = []

    if req.orderItems:
        for index, design in enumerate(req.orderItems, start=1):
            canvas_json = design.get("canvasJSON")
            quantities = design.get("quantities")
            if not isinstance(canvas_json, dict) or not isinstance(quantities, dict):
                continue
            product_type = design.get("productType")
            if product_type not in ("keyring", "sticker"):
                product_type = req.productType
            for size, _quantity in _selected_sizes_from_quantities(quantities):
                image = render_canvas(
                    canvas_json,
                    str(product_type),
                    transparent_bg=True,
                    with_cutting_line=False,
                    output_size=size,
                )
                attachments.append((f"{req.paymentId}-design{index}-{size}.png", to_png_bytes(image)))
        return attachments

    if not req.canvasJSON:
        return attachments

    sizes: list[OutputSize]
    if req.items:
        sizes = [size for size, _quantity in _selected_sizes_from_quantities({str(item.get("size")): item.get("quantity") for item in req.items})]
    else:
        sizes = [req.outputSize]

    for size in sizes:
        image = render_canvas(
            req.canvasJSON,
            req.productType,
            transparent_bg=True,
            with_cutting_line=False,
            output_size=size,
        )
        attachments.append((f"{req.paymentId}-{size}.png", to_png_bytes(image)))
    return attachments


def _reset_generation_credits(request: Request) -> None:
    try:
        rate_key, _daily_limit, _has_token, _user_id = get_rate_identity(request)
        reset_usage(rate_key)
        logger.info("[payments] reset generation credits key=%s", rate_key)
    except Exception as exc:
        logger.warning("[payments] generation credit reset skipped: %s", exc)


def _send_owner_order_email(
    req: CompletePaymentRequest,
    amount: int,
    order_time: datetime,
    attachments: list[tuple[str, bytes]],
) -> bool:
    owner_email = os.getenv("ORDER_EMAIL_TO") or os.getenv("ORDER_OWNER_EMAIL", ORDER_OWNER_EMAIL)
    resend_api_key = os.getenv("RESEND_API_KEY")
    from_email = os.getenv("ORDER_EMAIL_FROM") or os.getenv("RESEND_FROM_EMAIL") or ORDER_SENDER_EMAIL

    if not resend_api_key:
        logger.error(
            "[payments] owner email failed: missing Resend configuration: RESEND_API_KEY"
        )
        if _env_flag("ORDER_EMAIL_ALLOW_SKIP"):
            return False
        raise HTTPException(
            status_code=503,
            detail=(
                "주문 이메일 Resend 설정이 없어 메일을 보낼 수 없습니다. "
                "API 서버 환경변수 RESEND_API_KEY를 설정해주세요."
            ),
        )

    text_body = "\n\n".join(
        [
            "새 주문이 접수되었습니다.",
            f"주문번호: {req.paymentId}",
            f"주문시간: {order_time.strftime('%Y-%m-%d %H:%M:%S %Z')}",
            f"주문명: {req.orderName}",
            f"금액: {amount:,}원",
            "주문 수량:\n" + _format_order_items(req),
            "주문자/배송 정보:\n" + _format_shipping(req.shipping),
            "첨부 이미지는 칼선, 주문자 정보, 주문시간, 주문번호를 합성하지 않은 출력 이미지입니다.",
        ]
    )
    payload: dict[str, Any] = {
        "from": from_email,
        "to": [owner_email],
        "subject": f"[포켓굿즈] 새 주문 접수 {req.paymentId}",
        "text": text_body,
    }
    if attachments:
        payload["attachments"] = [
            {
                "filename": filename,
                "content": base64.b64encode(content).decode("ascii"),
            }
            for filename, content in attachments
        ]

    try:
        response = requests.post(
            RESEND_EMAIL_ENDPOINT,
            headers={
                "Authorization": f"Bearer {resend_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=30,
        )
        response.raise_for_status()
    except Exception as exc:
        logger.exception("[payments] owner email failed: %s", exc)
        if _env_flag("ORDER_EMAIL_REQUIRED"):
            detail = "주문 이메일 발송에 실패했습니다."
            if isinstance(exc, requests.HTTPError) and exc.response is not None:
                detail = f"{detail} Resend 응답: {exc.response.text[:500]}"
            raise HTTPException(status_code=502, detail=detail) from exc
        return False

    logger.info("[payments] owner email sent via Resend to=%s", owner_email)
    return True


@router.post("/complete", response_model=CompletePaymentResponse)
@router.post("/complete-noverify", response_model=CompletePaymentResponse)
async def complete_payment(request: Request, req: CompletePaymentRequest):
    """
    PortOne 결제를 임시 비활성화한 수동 주문 접수 엔드포인트입니다.
    결제 검증은 의도적으로 타지 않고, 버튼 클릭을 주문 완료 분기로 간주합니다.
    주문 금액을 서버에서 계산하고, 소유자에게 주문 정보와 출력 이미지를 이메일로 보냅니다.
    """
    if req.orderItems:
        print_total = 0
        for design in req.orderItems:
            quantities = design.get("quantities")
            if not isinstance(quantities, dict):
                raise HTTPException(status_code=400, detail="묶음 주문 수량 정보가 올바르지 않습니다.")
            has_quantity = False
            for size, unit_price in PRINT_PRICE_KRW.items():
                quantity = quantities.get(size, 0)
                if not isinstance(quantity, int) or quantity < 0:
                    raise HTTPException(status_code=400, detail="묶음 주문 수량 정보가 올바르지 않습니다.")
                if quantity > 0:
                    has_quantity = True
                    print_total += unit_price * quantity
            if not has_quantity:
                raise HTTPException(status_code=400, detail="수량이 없는 디자인이 포함되어 있습니다.")
        expected_amount = print_total + SHIPPING_FEE_KRW
    elif req.items:
        print_total = 0
        for item in req.items:
            size = item.get("size")
            quantity = item.get("quantity")
            if size not in PRINT_PRICE_KRW or not isinstance(quantity, int) or quantity < 1:
                raise HTTPException(status_code=400, detail="주문 수량 정보가 올바르지 않습니다.")
            print_total += PRINT_PRICE_KRW[size] * quantity
        expected_amount = print_total + SHIPPING_FEE_KRW
    else:
        expected_amount = PRINT_PRICE_KRW[req.outputSize] + SHIPPING_FEE_KRW
    if req.amount != expected_amount:
        raise HTTPException(status_code=400, detail="주문 금액이 올바르지 않습니다.")

    try:
        attachments = _render_order_attachments(req)
    except Exception as exc:
        logger.exception("[payments] order image render failed: %s", exc)
        raise HTTPException(status_code=500, detail="주문 이미지 생성에 실패했습니다.") from exc

    order_time = datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=9), "KST"))
    email_sent = _send_owner_order_email(req, expected_amount, order_time, attachments)
    _reset_generation_credits(request)

    logger.info(
        "[payments] received paymentId=%s txId=%s product=%s output=%s receiver=%s emailSent=%s",
        req.paymentId,
        req.txId,
        req.productType,
        req.outputSize,
        req.shipping.buyerName,
        email_sent,
    )

    return CompletePaymentResponse(
        ok=True,
        paymentId=req.paymentId,
        txId=req.txId,
        status="ORDER_RECEIVED",
        amount=expected_amount,
        orderStatus="received",
        emailSent=email_sent,
    )
