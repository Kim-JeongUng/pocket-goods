"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { History, Loader2, LogIn, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { tpl, useLocale } from "@/lib/i18n/client";
import type { SavedDesignHistoryEntry } from "@/hooks/useSaveDesign";

type DesignHistoryDialogProps = {
  open: boolean;
  onClose: () => void;
  loadHistory: () => Promise<SavedDesignHistoryEntry[]>;
  onRestore: (entry: SavedDesignHistoryEntry) => Promise<void> | void;
};

export default function DesignHistoryDialog({
  open,
  onClose,
  loadHistory,
  onRestore,
}: DesignHistoryDialogProps) {
  const { locale, t } = useLocale();
  const [entries, setEntries] = useState<SavedDesignHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const copy = t.designHistory;

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setEntries([]);
    setError(null);
    setAuthRequired(false);
    setLoading(true);

    void (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (!cancelled) {
            setAuthRequired(true);
            setLoading(false);
          }
          return;
        }

        const nextEntries = await loadHistory();
        if (!cancelled) {
          setEntries(nextEntries);
          setLoading(false);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : copy.loadFailed);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [copy.loadFailed, loadHistory, open]);

  if (!open) return null;

  const handleRestore = async (entry: SavedDesignHistoryEntry) => {
    const timeStr = new Date(entry.savedAt).toLocaleString(locale);
    const confirmed = window.confirm(tpl(copy.replaceConfirm, { timeStr }));
    if (!confirmed) return;

    try {
      setRestoringId(entry.id);
      setError(null);
      await onRestore(entry);
      onClose();
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : copy.restoreFailed);
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 p-0 md:items-center md:p-4">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl md:rounded-3xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-full bg-zinc-100 text-zinc-700">
                <History className="size-4" />
              </span>
              <div>
                <h2 className="text-base font-extrabold">{copy.title}</h2>
                <p className="text-xs text-zinc-500">{copy.description}</p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100"
            aria-label={t.common.close}
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-50 p-4">
          {loading ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-3xl border border-dashed bg-white text-sm text-zinc-500">
              <Loader2 className="size-5 animate-spin" />
              <p>{copy.loading}</p>
            </div>
          ) : authRequired ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-3xl border border-dashed bg-white px-6 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-zinc-100 text-zinc-700">
                <LogIn className="size-5" />
              </span>
              <div>
                <h3 className="text-base font-bold text-zinc-950">{copy.signInTitle}</h3>
                <p className="mt-1 text-sm text-zinc-500">{copy.signInDescription}</p>
              </div>
              <Button asChild>
                <Link href="/login?next=/design">{copy.signInAction}</Link>
              </Button>
            </div>
          ) : error ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-3xl border border-red-200 bg-white px-6 text-center">
              <p className="text-sm font-semibold text-red-600">{copy.loadFailed}</p>
              <p className="text-xs text-zinc-500">{error}</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-3xl border border-dashed bg-white px-6 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-zinc-100 text-zinc-700">
                <History className="size-5" />
              </span>
              <div>
                <h3 className="text-base font-bold text-zinc-950">{copy.emptyTitle}</h3>
                <p className="mt-1 text-sm text-zinc-500">{copy.emptyDescription}</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {entries.map((entry) => {
                const savedAt = new Date(entry.savedAt).toLocaleString(locale);
                const productLabel =
                  entry.productType === "keyring" ? t.toolbar.keyringShort : t.toolbar.stickerShort;
                const isRestoring = restoringId === entry.id;

                return (
                  <article key={entry.id} className="overflow-hidden rounded-3xl border bg-white shadow-sm">
                    <div className="relative aspect-[4/3] bg-zinc-100">
                      {entry.thumbnail ? (
                        <Image
                          src={entry.thumbnail}
                          alt={savedAt}
                          fill
                          unoptimized
                          className="object-contain"
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-sm text-zinc-400">
                          {copy.thumbnailFallback}
                        </div>
                      )}
                    </div>
                    <div className="space-y-3 p-4">
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-zinc-950">{savedAt}</p>
                        <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
                          <span className="rounded-full bg-zinc-100 px-2 py-1">{productLabel}</span>
                          <span className="rounded-full bg-zinc-100 px-2 py-1">{entry.outputSize}</span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        className="w-full"
                        onClick={() => void handleRestore(entry)}
                        disabled={!!restoringId}
                      >
                        {isRestoring ? (
                          <>
                            <Loader2 className="mr-2 size-4 animate-spin" />
                            {copy.restoring}
                          </>
                        ) : (
                          <>
                            <RotateCcw className="mr-2 size-4" />
                            {copy.restore}
                          </>
                        )}
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
