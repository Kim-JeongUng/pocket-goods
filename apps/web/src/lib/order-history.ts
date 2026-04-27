"use client";

import type { ProductType } from "@/lib/assets";
import type { OrderProfile } from "@/lib/order-profile";
import type { OutputSize } from "@/lib/order-pricing";
import { createClient } from "@/lib/supabase/client";

const ORDER_HISTORY_TABLE = "user_order_history";

export type OrderHistorySummaryItem = {
  label: string;
  quantity: number;
  outputSize: OutputSize;
  productType: ProductType;
};

export type SavedOrderHistory = {
  paymentId: string;
  orderName: string;
  amount: number;
  currency: "KRW";
  productType: ProductType;
  outputSize: OutputSize | null;
  orderStatus: string;
  shipping: OrderProfile;
  summaryItems: OrderHistorySummaryItem[];
  createdAt: string;
};

type OrderHistoryRow = {
  payment_id: string;
  order_name: string;
  amount: number;
  currency: "KRW" | null;
  product_type: ProductType | null;
  output_size: OutputSize | null;
  order_status: string | null;
  shipping_snapshot: OrderProfile | null;
  summary_items: OrderHistorySummaryItem[] | null;
  created_at: string;
};

function fromRow(row: OrderHistoryRow): SavedOrderHistory {
  return {
    paymentId: row.payment_id,
    orderName: row.order_name,
    amount: row.amount,
    currency: row.currency ?? "KRW",
    productType: row.product_type ?? "sticker",
    outputSize: row.output_size,
    orderStatus: row.order_status ?? "received",
    shipping: row.shipping_snapshot ?? {
      buyerName: "",
      buyerPhone: "",
      buyerEmail: "",
      zipcode: "",
      addressLine1: "",
      addressLine2: "",
      memo: "",
    },
    summaryItems: Array.isArray(row.summary_items) ? row.summary_items : [],
    createdAt: row.created_at,
  };
}

export async function loadOrderHistory(limit = 20): Promise<SavedOrderHistory[]> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from(ORDER_HISTORY_TABLE)
      .select("payment_id,order_name,amount,currency,product_type,output_size,order_status,shipping_snapshot,summary_items,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.warn("Order history load skipped:", error.message);
      return [];
    }

    return (data as OrderHistoryRow[] | null)?.map(fromRow) ?? [];
  } catch (error) {
    console.warn("Order history load skipped:", error);
    return [];
  }
}

export async function saveOrderHistory(
  order: Omit<SavedOrderHistory, "createdAt"> & { createdAt?: string },
): Promise<boolean> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase.from(ORDER_HISTORY_TABLE).upsert(
      {
        user_id: user.id,
        payment_id: order.paymentId,
        order_name: order.orderName,
        amount: order.amount,
        currency: order.currency,
        product_type: order.productType,
        output_size: order.outputSize,
        order_status: order.orderStatus,
        shipping_snapshot: order.shipping,
        summary_items: order.summaryItems,
        created_at: order.createdAt ?? new Date().toISOString(),
      },
      { onConflict: "payment_id" },
    );

    if (error) {
      console.warn("Order history save skipped:", error.message);
      return false;
    }

    return true;
  } catch (error) {
    console.warn("Order history save skipped:", error);
    return false;
  }
}
