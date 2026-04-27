"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { loadOrderHistory, type SavedOrderHistory } from "@/lib/order-history";
import { Loader2, LogOut, ShoppingBag, User } from "lucide-react";
import Link from "next/link";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { useLocale } from "@/lib/i18n/client";

interface UserMenuProps {
  compact?: boolean;
}

export default function UserMenu({ compact = false }: UserMenuProps) {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const [orders, setOrders] = useState<SavedOrderHistory[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const { t } = useLocale();

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (!session?.user) {
        setProfileOpen(false);
        setOrders([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!profileOpen || !user) return;
    let cancelled = false;
    void loadOrderHistory().then((nextOrders) => {
      if (cancelled) return;
      setOrders(nextOrders);
      setOrdersLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [profileOpen, user]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  if (loading) return null;

  if (!user) {
    return (
      <Link
        href="/login"
        className="shrink-0 break-keep text-xs font-medium text-muted-foreground transition-colors hover:text-foreground md:text-sm"
      >
        {t.common.login}
      </Link>
    );
  }

  const nickname =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    t.common.user;
  const avatarUrl = user.user_metadata?.avatar_url;
  const handleOpenProfile = () => {
    setOrders([]);
    setOrdersLoading(true);
    setProfileOpen(true);
  };
  const joinedAt = user.created_at
    ? new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(new Date(user.created_at))
    : null;

  const renderAvatar = (sizeClass: string, iconClass: string) =>
    avatarUrl ? (
      <img
        src={avatarUrl}
        alt={nickname}
        className={`${sizeClass} rounded-full object-cover`}
      />
    ) : (
      <div className={`flex ${sizeClass} items-center justify-center rounded-full bg-zinc-200`}>
        <User className={`${iconClass} text-zinc-600`} />
      </div>
    );

  if (compact) {
    return (
      <>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleOpenProfile}
            className="rounded-full transition hover:opacity-90"
            title="프로필 보기"
          >
            {renderAvatar("size-6", "size-4")}
          </button>
          <button
            onClick={handleSignOut}
            className="text-xs text-muted-foreground hover:text-foreground"
            title={t.common.logout}
          >
            <LogOut className="size-3.5" />
          </button>
        </div>
        <ProfileDrawer
          open={profileOpen}
          onOpenChange={setProfileOpen}
          user={user}
          nickname={nickname}
          joinedAt={joinedAt}
          orders={orders}
          ordersLoading={ordersLoading}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleOpenProfile}
          className="rounded-full transition hover:opacity-90"
          title="프로필 보기"
        >
          {renderAvatar("size-7", "size-3.5")}
        </button>
        <button
          onClick={handleSignOut}
          className="text-muted-foreground hover:text-foreground"
          title={t.common.logout}
        >
          <LogOut className="size-3.5" />
        </button>
      </div>
      <ProfileDrawer
        open={profileOpen}
        onOpenChange={setProfileOpen}
        user={user}
        nickname={nickname}
        joinedAt={joinedAt}
        orders={orders}
        ordersLoading={ordersLoading}
      />
    </>
  );
}

function ProfileDrawer({
  open,
  onOpenChange,
  user,
  nickname,
  joinedAt,
  orders,
  ordersLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: SupabaseUser | null;
  nickname: string;
  joinedAt: string | null;
  orders: SavedOrderHistory[];
  ordersLoading: boolean;
}) {
  return (
    <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-full w-full max-w-md">
        <DrawerHeader className="border-b">
          <DrawerTitle>프로필</DrawerTitle>
          <DrawerDescription>회원 정보와 이전 주문 내역을 확인할 수 있어요.</DrawerDescription>
        </DrawerHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <section className="border-b bg-zinc-50 px-4 py-5">
            <div className="flex items-center gap-3">
              {user?.user_metadata?.avatar_url ? (
                <img
                  src={user.user_metadata.avatar_url}
                  alt={nickname}
                  className="size-14 rounded-full object-cover"
                />
              ) : (
                <div className="flex size-14 items-center justify-center rounded-full bg-zinc-200">
                  <User className="size-6 text-zinc-600" />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-base font-bold">{nickname}</p>
                <p className="truncate text-sm text-zinc-600">{user?.email ?? "이메일 정보 없음"}</p>
                {joinedAt && <p className="mt-1 text-xs text-zinc-500">가입일 · {joinedAt}</p>}
              </div>
            </div>
          </section>

          <section className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold">주문 내역</h3>
              <span className="text-xs text-zinc-500">{orders.length}건</span>
            </div>

            {ordersLoading ? (
              <div className="flex items-center gap-2 rounded-2xl border border-dashed px-4 py-6 text-sm text-zinc-500">
                <Loader2 className="size-4 animate-spin" />
                주문 내역을 불러오는 중입니다.
              </div>
            ) : orders.length === 0 ? (
              <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-zinc-500">
                <ShoppingBag className="mx-auto mb-2 size-5 text-zinc-400" />
                아직 저장된 주문 내역이 없습니다.
              </div>
            ) : (
              <div className="space-y-3">
                {orders.map((order) => (
                  <article key={order.paymentId} className="rounded-2xl border bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{order.orderName}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {formatOrderDate(order.createdAt)} · 주문번호 {order.paymentId}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                        {formatOrderStatus(order.orderStatus)}
                      </span>
                    </div>

                    <div className="mt-3 rounded-xl bg-zinc-50 p-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-zinc-600">결제 금액</span>
                        <b>{order.amount.toLocaleString("ko-KR")}원</b>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {order.summaryItems.map((item, index) => (
                          <span
                            key={`${order.paymentId}-${index}`}
                            className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 ring-1 ring-zinc-200"
                          >
                            {item.label} · {formatProductType(item.productType)} {item.outputSize} × {item.quantity}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="mt-3 space-y-1 text-xs text-zinc-600">
                      <p>주문자 · {order.shipping.buyerName || "-"}</p>
                      <p>연락처 · {order.shipping.buyerPhone || "-"}</p>
                      <p>배송지 · {formatAddress(order.shipping)}</p>
                      {order.shipping.memo && <p>메모 · {order.shipping.memo}</p>}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function formatOrderDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatOrderStatus(status: string) {
  if (status === "received") return "접수됨";
  return status;
}

function formatProductType(productType: string) {
  if (productType === "keyring") return "키링";
  return "스티커";
}

function formatAddress(shipping: SavedOrderHistory["shipping"]) {
  const parts = [shipping.zipcode, shipping.addressLine1, shipping.addressLine2].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "-";
}
