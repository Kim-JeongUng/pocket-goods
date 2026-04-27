"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useCanvas } from "@/components/canvas/useCanvas";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";
import { useSaveDesign } from "@/hooks/useSaveDesign";
import DesignCanvas from "@/components/canvas/DesignCanvas";
import Toolbar from "@/components/editor/Toolbar";
import AssetPanel from "@/components/editor/AssetPanel";
import PropertiesPanel from "@/components/editor/PropertiesPanel";
import MobileHeader from "@/components/editor/MobileHeader";
import MobileActionBar from "@/components/editor/MobileActionBar";
import MobileDrawer from "@/components/editor/MobileDrawer";
import PreviewDialog from "@/components/editor/PreviewDialog";
import OrderCartDialog from "@/components/editor/OrderCartDialog";
import DesignHistoryDialog from "@/components/editor/DesignHistoryDialog";
import { API_BASE_URL } from "@/lib/api";
import type { ProductType } from "@/lib/assets";
import { OUTPUT_CANVAS_SIZE, OUTPUT_SIZE_MM } from "@/lib/output-size";
import type { OutputSize } from "@/lib/order-pricing";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale, tpl } from "@/lib/i18n/client";
import type { OrderCartItem } from "@/lib/order-cart";
import type { SavedDesignHistoryEntry } from "@/hooks/useSaveDesign";

function getMobileFitZoom(size: OutputSize) {
  if (typeof window === "undefined") return 0.8;
  const canvasSize = OUTPUT_CANVAS_SIZE[size];
  const availableWidth = Math.max(280, window.innerWidth - 36);
  const availableHeight = Math.max(320, window.innerHeight - 188);
  const fit = Math.min(availableWidth / canvasSize.width, availableHeight / canvasSize.height, 1);
  return Math.max(0.35, Math.min(1, Math.floor(fit * 100) / 100));
}

export default function EditorLayout() {
  const { locale, t } = useLocale();
  const [productType] = useState<ProductType>("sticker");
  const [mobilePanel, setMobilePanel] = useState<"assets" | null>(null);
  const mobileStartPanelOpenedRef = useRef(false);
  const [isExporting, setIsExporting] = useState(false);
  const [outputSize, setOutputSize] = useState<OutputSize>("A5");
  const [draftRestoreChecked, setDraftRestoreChecked] = useState(false);
  const [previewTab, setPreviewTab] = useState<"preview" | "order">("preview");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [previewPayload, setPreviewPayload] = useState<{
    imageSrc: string;
    canvasJSON: object;
    productType: ProductType;
    outputSize: OutputSize;
    revokeOnClose?: boolean;
  } | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [pendingCanvasLoad, setPendingCanvasLoad] = useState<{
    canvasJSON: object;
    outputSize: OutputSize;
  } | null>(null);

  const {
    canvasRef,
    isCanvasReady,
    hasObjects,
    canUndo,
    canRedo,
    selectedInfo,
    addCharacter,
    addText,
    addNameTag,
    updateSelectedText,
    getSelectedImageDataURL,
    replaceSelectedImage,
    deleteSelected,
    bringForward,
    sendBackward,
    undo,
    redo,
    toJSON,
    toDataURL,
    loadDesign,
    onChangeCb,
    zoom,
    zoomIn,
    zoomOut,
    setZoom,
    setCanvasSize,
  } = useCanvas(productType);

  const { save, loadDraft, loadHistory, markDirty, savedAt, isDirty, saveWarning } = useSaveDesign(
    toJSON,
    toDataURL,
    productType,
    outputSize,
  );

  // 변경 시 dirty 표시
  useEffect(() => {
    onChangeCb.current = markDirty;
  }, [onChangeCb, markDirty]);

  useEffect(() => {
    if (!isCanvasReady) return;
    setCanvasSize(OUTPUT_CANVAS_SIZE[outputSize]);
  }, [isCanvasReady, outputSize, setCanvasSize]);

  useEffect(() => {
    if (!isCanvasReady || !pendingCanvasLoad) return;
    if (outputSize !== pendingCanvasLoad.outputSize) {
      setOutputSize(pendingCanvasLoad.outputSize);
      return;
    }
    void loadDesign(pendingCanvasLoad.canvasJSON);
    markDirty();
    setPendingCanvasLoad(null);
  }, [isCanvasReady, loadDesign, markDirty, outputSize, pendingCanvasLoad]);

  // 키보드 단축키
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // Ctrl+Z / Cmd+Z → 실행 취소 (텍스트 입력 중엔 브라우저 기본 동작 유지)
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        if (isTyping) return;
        e.preventDefault();
        undo();
        return;
      }

      // Ctrl+Y / Cmd+Shift+Z → 다시 실행
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "y" || (e.key === "z" && e.shiftKey))
      ) {
        if (isTyping) return;
        e.preventDefault();
        redo();
        return;
      }

      // Backspace / Delete → 선택 요소 삭제
      if ((e.key === "Backspace" || e.key === "Delete") && !isTyping) {
        e.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, deleteSelected]);

  // 저장되지 않은 변경사항 있을 때 브라우저 이탈 경고
  useBeforeUnload(isDirty);

  // 모바일: 현재 출력 용지가 화면에 들어오도록 자동 맞춤
  useEffect(() => {
    if (!isCanvasReady) return;
    const mq = window.matchMedia("(max-width: 767px)");
    const fit = () => {
      if (mq.matches) setZoom(getMobileFitZoom(outputSize));
    };
    fit();
    window.addEventListener("resize", fit);
    mq.addEventListener("change", fit);
    return () => {
      window.removeEventListener("resize", fit);
      mq.removeEventListener("change", fit);
    };
  }, [isCanvasReady, outputSize, setZoom]);

  // 모바일에서 채널톡 숨기기
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const toggle = (e: MediaQueryListEvent | MediaQueryList) => {
      if (typeof window.ChannelIO === "function") {
        window.ChannelIO(e.matches ? "hideChannelButton" : "showChannelButton");
      }
    };
    toggle(mq);
    mq.addEventListener("change", toggle);
    return () => {
      mq.removeEventListener("change", toggle);
      if (typeof window.ChannelIO === "function") {
        window.ChannelIO("showChannelButton");
      }
    };
  }, []);

  // 캔버스 준비 완료 후 저장된 드래프트 복원 여부 확인
  useEffect(() => {
    if (!isCanvasReady) return;
    let cancelled = false;
    setDraftRestoreChecked(false);
    void loadDraft().then(async (draft) => {
      if (cancelled || !draft) return;
      const savedDate = new Date(draft.savedAt);
      const timeStr = savedDate.toLocaleString(locale);
      const restore = window.confirm(tpl(t.toolbar.restorePrompt, { timeStr }));
      if (restore) {
        setPendingCanvasLoad({
          canvasJSON: draft.canvasJSON,
          outputSize: draft.outputSize,
        });
      }
    }).finally(() => {
      if (!cancelled) setDraftRestoreChecked(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCanvasReady]);

  // 모바일 최초 빈 캔버스 진입 시 바로 AI 만들기 탭이 보이도록 추가 패널을 연다.
  useEffect(() => {
    if (
      !isCanvasReady ||
      !draftRestoreChecked ||
      hasObjects ||
      mobilePanel !== null ||
      mobileStartPanelOpenedRef.current
    ) {
      return;
    }

    const mq = window.matchMedia("(max-width: 767px)");
    if (!mq.matches) return;

    mobileStartPanelOpenedRef.current = true;
    setMobilePanel("assets");
  }, [draftRestoreChecked, hasObjects, isCanvasReady, mobilePanel]);

  const handleOpenPreview = useCallback(async (initialTab: "preview" | "order" = "preview") => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/export`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            canvas_json: toJSON(),
            product_type: productType,
            output_size: outputSize,
            save_to_storage: false,
          }),
        }
      );
      if (!res.ok) throw new Error(t.toolbar.exportFailed);
      const pngBlob = await res.blob();
      setPreviewTab(initialTab);
      setPreviewPayload((current) => {
        if (current?.revokeOnClose) URL.revokeObjectURL(current.imageSrc);
        return {
          imageSrc: URL.createObjectURL(pngBlob),
          canvasJSON: toJSON(),
          productType,
          outputSize,
          revokeOnClose: true,
        };
      });
    } catch {
      setPreviewTab(initialTab);
      setPreviewPayload((current) => {
        if (current?.revokeOnClose) URL.revokeObjectURL(current.imageSrc);
        return {
          imageSrc: toDataURL(),
          canvasJSON: toJSON(),
          productType,
          outputSize,
        };
      });
    } finally {
      setIsExporting(false);
    }
  }, [toJSON, toDataURL, productType, outputSize, isExporting, t.toolbar.exportFailed]);

  const handleEditCartItem = useCallback((item: OrderCartItem) => {
    setPreviewPayload((current) => {
      if (current?.revokeOnClose) URL.revokeObjectURL(current.imageSrc);
      return null;
    });
    setCartOpen(false);
    setPendingCanvasLoad({
      canvasJSON: item.canvasJSON,
      outputSize: item.outputSize,
    });
  }, []);

  const handleRestoreHistoryEntry = useCallback(async (entry: SavedDesignHistoryEntry) => {
    setPendingCanvasLoad({
      canvasJSON: entry.canvasJSON,
      outputSize: entry.outputSize,
    });
  }, []);

  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-zinc-50">
      {/* 상단: 데스크탑=Toolbar, 모바일=MobileHeader */}
      <div className="hidden md:block">
        <Toolbar
          canUndo={canUndo}
          canRedo={canRedo}
          hasSelection={!!selectedInfo}
          isDirty={isDirty}
          savedAt={savedAt}
          onUndo={undo}
          onRedo={redo}
          onDelete={deleteSelected}
          onBringForward={bringForward}
          onSendBackward={sendBackward}
          onSave={save}
          onOpenHistory={() => setHistoryOpen(true)}
          onExportPreview={() => handleOpenPreview("preview")}
          onOrder={() => handleOpenPreview("order")}
          onOpenCart={() => setCartOpen(true)}
          isExporting={isExporting}
        />
      </div>
      <div className="block md:hidden">
        <MobileHeader
          onSave={save}
          onOpenHistory={() => setHistoryOpen(true)}
          onOpenCart={() => setCartOpen(true)}
          isDirty={isDirty}
          savedAt={savedAt}
        />
      </div>

      {/* 메인 영역 */}
      <div className="flex flex-1 min-h-0">
        <div className="hidden md:flex">
          <AssetPanel
            onAddCharacter={addCharacter}
            onAddText={addText}
            onAddNameTag={addNameTag}

            onGetCanvasImage={toDataURL}
          />
        </div>

        <main className="flex-1 flex flex-col min-h-0">
          {saveWarning && (
            <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-700">
              {saveWarning}
            </div>
          )}
          {!hasObjects && (
            <div className="shrink-0 border-b border-zinc-200/80 bg-white/90 px-3 py-2.5 shadow-sm backdrop-blur md:px-6">
              <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-zinc-900 md:text-sm">처음이라면 AI로 이미지를 만들고 바로 배치해보세요</p>
                  <p className="mt-0.5 truncate text-[11px] text-zinc-500 md:text-xs">
                    사진 업로드 → 스타일 선택 → 생성 → 캔버스 추가 순서로 시작할 수 있어요.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setMobilePanel("assets")}
                  className="shrink-0 rounded-full px-3 md:hidden"
                >
                  AI 시작
                </Button>
              </div>
            </div>
          )}
          <div className="flex-1 overflow-hidden">
            <DesignCanvas
              canvasRef={canvasRef}
              outputSizeMm={OUTPUT_SIZE_MM[outputSize]}
              showGuide={isCanvasReady && !hasObjects}
            />
          </div>

          {/* 모바일 용지 크기 선택 */}
          <div className="flex md:hidden items-center justify-center border-t border-zinc-200/70 bg-white/85 py-2 shadow-[0_-12px_30px_rgba(15,23,42,0.04)] backdrop-blur shrink-0">
            <SizeSelector value={outputSize} onChange={setOutputSize} />
          </div>

          {/* 줌 컨트롤 — 캔버스 바로 아래 (데스크탑 전용) */}
          <div className="hidden md:flex items-center justify-center border-t border-zinc-200/70 bg-white/80 py-2 shadow-[0_-12px_30px_rgba(15,23,42,0.04)] backdrop-blur shrink-0">
            <div className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-2 py-1 shadow-sm">
              <Button
                variant="ghost"
                size="icon"
                onClick={zoomOut}
                disabled={zoom <= 0.5}
                title={t.toolbar.zoomOut}
                className="size-8 rounded-full"
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              <span className="w-14 select-none text-center text-xs font-bold tabular-nums text-zinc-600">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={zoomIn}
                disabled={zoom >= 2.0}
                title={t.toolbar.zoomIn}
                className="size-8 rounded-full"
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
            </div>

            <div className="ml-3">
              <SizeSelector value={outputSize} onChange={setOutputSize} />
            </div>
          </div>
        </main>

        <div className="hidden md:flex">
          <PropertiesPanel
            selectedInfo={selectedInfo}
            onUpdateText={updateSelectedText}
            onGetSelectedImageDataURL={getSelectedImageDataURL}
            onReplaceSelectedImage={replaceSelectedImage}
          />
        </div>
      </div>

      {/* 모바일 하단 액션바 */}
      <div className="block md:hidden">
        <MobileActionBar
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
          hasSelection={!!selectedInfo}
          onDelete={deleteSelected}
          onOpenAssets={() => setMobilePanel("assets")}
          onExportPreview={() => handleOpenPreview("preview")}
          onOrder={() => handleOpenPreview("order")}
          isStarterMode={!hasObjects}
          isExporting={isExporting}
        />
      </div>

      {/* 모바일 하단 시트 */}
      <MobileDrawer
        open={mobilePanel === "assets"}
        onClose={() => setMobilePanel(null)}
        title="이미지·텍스트 추가"
        noPadding
      >
        <AssetPanel
          onAddCharacter={addCharacter}
          onAddText={addText}
          onAddNameTag={addNameTag}
          onGetCanvasImage={toDataURL}
          className="w-full border-0"
        />
      </MobileDrawer>

      <PreviewDialog
        open={!!previewPayload}
        payload={previewPayload}
        initialTab={previewTab}
        onClose={() =>
          setPreviewPayload((current) => {
            if (current?.revokeOnClose) URL.revokeObjectURL(current.imageSrc);
            return null;
          })
        }
      />
      <DesignHistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        loadHistory={loadHistory}
        onRestore={handleRestoreHistoryEntry}
      />
      <OrderCartDialog open={cartOpen} onClose={() => setCartOpen(false)} onEditItem={handleEditCartItem} />
    </div>
  );
}

const SIZE_OPTIONS: OutputSize[] = ["A6", "A5", "A4"];

function SizeSelector({
  value,
  onChange,
}: {
  value: OutputSize;
  onChange: (value: OutputSize) => void;
}) {
  const index = SIZE_OPTIONS.indexOf(value);
  return (
    <div className="relative flex w-[174px] items-center rounded-full border border-zinc-200 bg-white p-1 shadow-sm">
      <div
        className="absolute bottom-1 top-1 rounded-full bg-zinc-950 shadow-md transition-transform duration-300 ease-out"
        style={{
          left: "0.25rem",
          width: "calc((100% - 0.5rem) / 3)",
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {SIZE_OPTIONS.map((size) => (
        <button
          key={size}
          type="button"
          onClick={() => onChange(size)}
          className={`relative z-10 flex h-8 flex-1 items-center justify-center rounded-full text-center text-xs font-extrabold leading-none transition-colors ${
            value === size ? "text-white" : "text-zinc-500 hover:text-zinc-950"
          }`}
        >
          {size}
        </button>
      ))}
    </div>
  );
}
