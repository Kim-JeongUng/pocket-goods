"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { OutputSize } from "@/lib/order-pricing";

const STORAGE_KEY = "pocketgoods-design-draft";
const SESSION_STORAGE_KEY = "pocketgoods-design-draft-session";
const MAX_LOCAL_STORAGE_CHARS = 4_000_000;
const DRAFT_TABLE = "user_design_drafts";
const HISTORY_TABLE = "user_design_snapshots";
const DRAFT_SELECT_WITH_OUTPUT_SIZE = "canvas_json,thumbnail,product_type,output_size,updated_at";
const DRAFT_SELECT_LEGACY = "canvas_json,thumbnail,product_type,updated_at";
const HISTORY_SELECT = "id,canvas_json,thumbnail,product_type,output_size,created_at";

export interface SavedDraft {
  canvasJSON: object;
  thumbnail: string;
  productType: string;
  outputSize: OutputSize;
  savedAt: string; // ISO string
}

export interface SavedDesignHistoryEntry extends SavedDraft {
  id: string;
}

type DraftRow = {
  canvas_json: object;
  thumbnail: string | null;
  product_type: string;
  output_size?: string | null;
  updated_at: string;
};

type HistoryRow = {
  id: string;
  canvas_json: object;
  thumbnail: string | null;
  product_type: string;
  output_size?: string | null;
  created_at: string;
};

function normalizeOutputSize(value: string | null | undefined): OutputSize {
  if (value === "A4" || value === "A5" || value === "A6") {
    return value;
  }
  return "A5";
}

function rowToDraft(row: DraftRow): SavedDraft {
  return {
    canvasJSON: row.canvas_json,
    thumbnail: row.thumbnail ?? "",
    productType: row.product_type,
    outputSize: normalizeOutputSize(row.output_size),
    savedAt: row.updated_at,
  };
}

function historyRowToEntry(row: HistoryRow): SavedDesignHistoryEntry {
  return {
    id: row.id,
    canvasJSON: row.canvas_json,
    thumbnail: row.thumbnail ?? "",
    productType: row.product_type,
    outputSize: normalizeOutputSize(row.output_size),
    savedAt: row.created_at,
  };
}

export function useSaveDesign(
  getJSON: () => object,
  getDataURL: () => string,
  productType: string,
  outputSize: OutputSize,
) {
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);

  // 저장된 드래프트 로드
  const loadLocalDraft = useCallback((): SavedDraft | null => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as SavedDraft;
    } catch {
      return null;
    }
  }, []);

  // 저장된 드래프트 로드. 로그인 사용자는 Supabase DB를 우선 사용해 기기 간 복원합니다.
  const loadDraft = useCallback(async (): Promise<SavedDraft | null> => {
    const localDraft = loadLocalDraft();
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return localDraft;

      const draftQuery = () =>
        supabase
          .from(DRAFT_TABLE)
          .select(DRAFT_SELECT_WITH_OUTPUT_SIZE)
          .eq("user_id", user.id)
          .maybeSingle();
      let { data, error } = await draftQuery();

      if (error) {
        const legacyResult = await supabase
          .from(DRAFT_TABLE)
          .select(DRAFT_SELECT_LEGACY)
          .eq("user_id", user.id)
          .maybeSingle();
        data = legacyResult.data;
        error = legacyResult.error;
      }

      if (error) {
        console.warn("Remote draft load skipped:", error.message);
        return localDraft;
      }

      return data ? rowToDraft(data as DraftRow) : localDraft;
    } catch (error) {
      console.warn("Remote draft load skipped:", error);
      return localDraft;
    }
  }, [loadLocalDraft]);

  const saveRemoteDraft = useCallback(async (draft: SavedDraft): Promise<boolean> => {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;

      let { error } = await supabase.from(DRAFT_TABLE).upsert(
        {
          user_id: user.id,
          canvas_json: draft.canvasJSON,
          thumbnail: draft.thumbnail,
          product_type: draft.productType,
          output_size: draft.outputSize,
          updated_at: draft.savedAt,
        },
        { onConflict: "user_id" },
      );

      if (error) {
        const legacyResult = await supabase.from(DRAFT_TABLE).upsert(
          {
            user_id: user.id,
            canvas_json: draft.canvasJSON,
            thumbnail: draft.thumbnail,
            product_type: draft.productType,
            updated_at: draft.savedAt,
          },
          { onConflict: "user_id" },
        );
        error = legacyResult.error;
      }

      if (error) {
        console.warn("Remote draft save skipped:", error.message);
        return false;
      }

      return true;
    } catch (error) {
      console.warn("Remote draft save skipped:", error);
      return false;
    }
  }, []);

  const saveRemoteHistory = useCallback(async (draft: SavedDraft): Promise<boolean> => {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;

      const { error } = await supabase.from(HISTORY_TABLE).insert({
        user_id: user.id,
        canvas_json: draft.canvasJSON,
        thumbnail: draft.thumbnail,
        product_type: draft.productType,
        output_size: draft.outputSize,
        created_at: draft.savedAt,
      });

      if (error) {
        console.warn("Remote design history save skipped:", error.message);
        return false;
      }

      return true;
    } catch (error) {
      console.warn("Remote design history save skipped:", error);
      return false;
    }
  }, []);

  const loadHistory = useCallback(async (): Promise<SavedDesignHistoryEntry[]> => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from(HISTORY_TABLE)
      .select(HISTORY_SELECT)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(24);

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((row) => historyRowToEntry(row as HistoryRow));
  }, []);

  const persistDraft = useCallback(async (options?: { recordHistory?: boolean }) => {
    const recordHistory = options?.recordHistory ?? false;
    try {
      const draft: SavedDraft = {
        canvasJSON: getJSON(),
        thumbnail: getDataURL(),
        productType,
        outputSize,
        savedAt: new Date().toISOString(),
      };
      const remoteSaved = await saveRemoteDraft(draft);
      if (remoteSaved) {
        if (recordHistory) {
          await saveRemoteHistory(draft);
        }
        localStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        setSaveWarning(null);
        const now = new Date();
        setSavedAt(now);
        setIsDirty(false);
        return;
      }

      const serialized = JSON.stringify(draft);
      try {
        if (serialized.length > MAX_LOCAL_STORAGE_CHARS) {
          throw new DOMException("Draft exceeds localStorage safety limit", "QuotaExceededError");
        }
        localStorage.setItem(STORAGE_KEY, serialized);
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        setSaveWarning(null);
      } catch (storageError) {
        localStorage.removeItem(STORAGE_KEY);
        try {
          sessionStorage.setItem(SESSION_STORAGE_KEY, serialized);
          setSaveWarning(
            "사진 용량이 커서 이 브라우저 탭에만 임시 저장했어요. 로그인 후 DB 저장 테이블을 적용하면 다른 기기에서도 복원할 수 있습니다.",
          );
        } catch {
          setSaveWarning(
            "사진 용량이 커서 자동 저장을 건너뛰었어요. 로그인 후 DB 저장 테이블을 적용하면 용량 제한을 줄일 수 있습니다.",
          );
          console.warn("Draft storage skipped:", storageError);
        }
      }
      const now = new Date();
      setSavedAt(now);
      setIsDirty(false);
    } catch (e) {
      console.error("저장 실패:", e);
    }
  }, [getDataURL, getJSON, outputSize, productType, saveRemoteDraft, saveRemoteHistory]);

  // 수동 저장
  const save = useCallback(async () => {
    await persistDraft({ recordHistory: true });
  }, [persistDraft]);

  // 드래프트 삭제
  const clearDraft = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    void (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        await supabase.from(DRAFT_TABLE).delete().eq("user_id", user.id);
      } catch {
        // Remote delete is best-effort only.
      }
    })();
    setSavedAt(null);
    setIsDirty(false);
    setSaveWarning(null);
  }, []);

  // 변경 감지 — dirty 표시
  const markDirty = useCallback(() => setIsDirty(true), []);

  // 자동 저장 — 30초마다 (dirty 상태일 때만)
  useEffect(() => {
    if (!isDirty) return;
    const timer = setInterval(() => {
      void persistDraft();
    }, 30_000);
    return () => clearInterval(timer);
  }, [isDirty, persistDraft]);

  // Ctrl+S 단축키
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [save]);

  return { save, loadDraft, loadHistory, clearDraft, markDirty, savedAt, isDirty, saveWarning };
}
