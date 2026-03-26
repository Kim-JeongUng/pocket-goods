"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Sparkles,
  Upload,
  Loader2,
  ImagePlus,
  LogIn,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useLocale, tpl } from "@/lib/i18n/client";
import { useImagePreprocessor } from "@/hooks/useImagePreprocessor";

interface AIPanelProps {
  onGetCanvasImage: () => string;
  onAddGeneratedImage: (src: string) => void;
  compact?: boolean;
}

type Mode = "prompt-only" | "from-canvas" | "from-upload";

type Style =
  | "ghibli"
  | "sd"
  | "steampunk"
  | "fairly-odd"
  | "powerpuff"
  | "akatsuki"
  | "custom";

type StyleFeedItem = {
  id: string;
  title: string;
  style: Style;
  preview: string;
  basePrompt: string;
};

const STYLE_FEED_ITEMS: StyleFeedItem[] = [
  {
    id: "ghibli",
    title: "지브리 만들기",
    style: "ghibli",
    preview: "/logo.png",
    basePrompt:
      "Studio Ghibli 감성의 따뜻한 애니메이션 스타일. 파스텔 톤과 부드러운 수채화 질감, 따뜻한 표정과 자연스러운 디테일을 유지해 캐릭터를 변환해주세요. 배경은 투명으로 유지해주세요.",
  },
  {
    id: "sd",
    title: "SD 만들기",
    style: "sd",
    preview: "/logo.png",
    basePrompt:
      "일본 SD/치비 스타일로 변환해주세요. 큰 머리와 짧은 팔다리의 귀여운 비율, 선명한 외곽선, 밝은 셀 애니메이션 색감으로 표현해주세요. 배경은 투명으로 유지해주세요.",
  },
  {
    id: "steampunk",
    title: "스팀펑크 만들기",
    style: "steampunk",
    preview: "/logo.png",
    basePrompt:
      "스팀펑크 무드로 변환해주세요. 황동 장치, 톱니바퀴, 빈티지 기계 디테일, 빅토리아풍 분위기를 살려 캐릭터를 구성해주세요. 배경은 투명으로 유지해주세요.",
  },
  {
    id: "fairly-odd",
    title: "수호천사 만들기",
    style: "fairly-odd",
    preview: "/logo.png",
    basePrompt:
      "The Fairly OddParents 느낌의 카툰 스타일로 변환해주세요. 굵고 깔끔한 외곽선, 단순한 플랫 컬러, 과장된 얼굴 비율로 표현해주세요. 배경은 투명으로 유지해주세요.",
  },
  {
    id: "powerpuff",
    title: "파워퍼프걸 만들기",
    style: "powerpuff",
    preview: "/logo.png",
    basePrompt:
      "파워퍼프걸 스타일로 변환해주세요. 매우 큰 눈, 단순한 얼굴 요소, 둥근 실루엣, 또렷한 라인과 플랫 컬러 느낌으로 표현해주세요. 배경은 투명으로 유지해주세요.",
  },
  {
    id: "custom",
    title: "커스텀 만들기",
    style: "custom",
    preview: "/logo.png",
    basePrompt:
      "사용자 요청을 최우선으로 반영해 자유 스타일로 생성해주세요. 캐릭터 중심 구도와 선명한 외곽선을 유지하고, 배경은 투명으로 유지해주세요.",
  },
];

export default function AIPanel({
  onGetCanvasImage,
  onAddGeneratedImage,
  compact = false,
}: AIPanelProps) {
  const { t } = useLocale();
  const e = t.editor;
  const ip = t.imageProcessing;

  const {
    processFile,
    processing: preprocessing,
    currentStep,
    errors: preprocessErrors,
    reset: resetPreprocess,
  } = useImagePreprocessor();

  const [mode, setMode] = useState<Mode>("from-upload");
  const [style, setStyle] = useState<Style>("ghibli");
  const [prompt, setPrompt] = useState("");
  const [activeFeedId, setActiveFeedId] = useState<string | null>(null);

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);

  const [result, setResult] = useState<string | null>(null);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<{ count: number; limit: number } | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showDailyLimitReached, setShowDailyLimitReached] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const feedScrollRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef({
    isDragging: false,
    pointerId: -1,
    startX: 0,
    startScrollLeft: 0,
    moved: false,
  });

  const activeFeed = useMemo(
    () => STYLE_FEED_ITEMS.find((item) => item.id === activeFeedId) ?? null,
    [activeFeedId],
  );

  const finalPrompt = useMemo(() => {
    if (activeFeed) {
      const extraPrompt = prompt.trim();
      return extraPrompt
        ? `${activeFeed.basePrompt}\n\n추가 요청: ${extraPrompt}`
        : activeFeed.basePrompt;
    }
    return prompt.trim();
  }, [activeFeed, prompt]);

  const handleUpload = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;

    resetPreprocess();
    const processed = await processFile(file);
    if (!processed) return;

    if (uploadedPreview) {
      URL.revokeObjectURL(uploadedPreview);
    }

    setUploadedFile(processed.file);
    setUploadedPreview(URL.createObjectURL(processed.file));
    setMode("from-upload");
  };

  const handleSelectFeedItem = (item: StyleFeedItem) => {
    setActiveFeedId(item.id);
    setStyle(item.style);
    setPrompt("");
    setError(null);
  };

  const handleGenerate = async () => {
    if (!finalPrompt.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setFallbackMessage(null);
    setShowLoginPrompt(false);
    setShowDailyLimitReached(false);

    try {
      const formData = new FormData();
      formData.append("prompt", finalPrompt);
      formData.append("style", style);

      if (mode === "from-canvas") {
        const dataURL = onGetCanvasImage();
        const res = await fetch(dataURL);
        const blob = await res.blob();
        formData.append("canvas_image", blob, "canvas.png");
      }

      if (mode === "from-upload" && uploadedFile) {
        formData.append("upload_image", uploadedFile);
      }

      const headers: HeadersInit = {};
      const supabase = createClient();

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/generate-image`,
        {
          method: "POST",
          body: formData,
          headers,
        },
      );

      if (!response.ok) {
        if (response.status === 429) {
          const err = await response.json();

          if (err.login_required) {
            setShowLoginPrompt(true);
            return;
          }

          const detail = err.detail ?? "";
          if (
            err.server_busy ||
            detail.includes("일시적") ||
            detail.toLowerCase().includes("temporarily")
          ) {
            setError(e.serverBusy ?? "서버가 일시적으로 혼잡합니다.");
            return;
          }

          setShowDailyLimitReached(true);
          return;
        }

        const err = await response.json();
        throw new Error(err.detail ?? e.generateFailed ?? "생성 실패");
      }

      const data = await response.json();

      setResult(data.image);

      if (data.remaining !== undefined && data.daily_limit !== undefined) {
        setRemaining({
          count: data.remaining,
          limit: data.daily_limit,
        });
      }

      if (data.fallback) {
        setFallbackMessage(data.fallback_message ?? e.fallbackDefault);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : e.errorFallback ?? "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleFeedPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const container = feedScrollRef.current;
    if (!container) return;

    dragStateRef.current = {
      isDragging: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startScrollLeft: container.scrollLeft,
      moved: false,
    };

    container.setPointerCapture(e.pointerId);
  };

  const handleFeedPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = feedScrollRef.current;
    const dragState = dragStateRef.current;
    if (!container || !dragState.isDragging || dragState.pointerId !== e.pointerId) return;

    const deltaX = e.clientX - dragState.startX;
    if (Math.abs(deltaX) > 3) {
      dragState.moved = true;
    }
    container.scrollLeft = dragState.startScrollLeft - deltaX;
  };

  const handleFeedPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = feedScrollRef.current;
    const dragState = dragStateRef.current;
    if (!container || dragState.pointerId !== e.pointerId) return;

    if (container.hasPointerCapture(e.pointerId)) {
      container.releasePointerCapture(e.pointerId);
    }
    dragState.isDragging = false;
  };

  const handleFeedClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.moved) return;
    e.preventDefault();
    e.stopPropagation();
    dragStateRef.current.moved = false;
  };

  return (
    <div
      className={`flex flex-col ${
        compact ? "gap-3 p-3" : "h-full gap-4 overflow-y-auto p-4"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-yellow-500" />
          <span className="text-sm font-semibold">{e.aiTitle ?? "AI 이미지 생성"}</span>
        </div>

        {remaining && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              remaining.count <= 2
                ? "bg-red-50 text-red-600"
                : "bg-zinc-100 text-zinc-500"
            }`}
          >
            {tpl(e.remaining, { count: remaining.count, limit: remaining.limit })}
          </span>
        )}
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">둘러보기</Label>
          <span className="text-[10px] text-muted-foreground">좌우로 넘겨 선택</span>
        </div>

        <div
          ref={feedScrollRef}
          className="ai-feed-scroll -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1"
          onPointerDown={handleFeedPointerDown}
          onPointerMove={handleFeedPointerMove}
          onPointerUp={handleFeedPointerUp}
          onPointerCancel={handleFeedPointerUp}
          onPointerLeave={handleFeedPointerUp}
          onClickCapture={handleFeedClickCapture}
        >
          {STYLE_FEED_ITEMS.map((item) => {
            const isActive = activeFeedId === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectFeedItem(item)}
                className={`group relative h-56 min-w-[220px] snap-start select-none overflow-hidden rounded-2xl border text-left transition-all ${
                  isActive
                    ? "border-primary shadow-[0_12px_30px_rgba(0,0,0,0.18)]"
                    : "border-zinc-200 hover:-translate-y-0.5 hover:border-zinc-300"
                }`}
              >
                <Image
                  src={item.preview}
                  alt={`${item.title} 미리보기`}
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <div className="absolute bottom-3 left-3 right-3 rounded-xl bg-white/95 px-3 py-2 text-center text-sm font-semibold shadow-sm">
                  {item.title}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-1.5">
        <ModeButton
          active={mode === "from-upload"}
          icon={<Upload className="h-3.5 w-3.5" />}
          label={e.modeUpload ?? "사진 업로드"}
          onClick={() => {
            setMode("from-upload");
            fileInputRef.current?.click();
          }}
        />
      </div>

      {mode === "from-upload" && preprocessing && (
        <div
          className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-zinc-200 ${
            compact ? "mx-auto h-32 w-32" : "aspect-square w-full"
          }`}
        >
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p className="text-[10px] text-muted-foreground">
            {currentStep === "converting"
              ? ip.converting
              : currentStep === "compressing"
                ? ip.compressing
                : ip.processing}
          </p>
        </div>
      )}

      {mode === "from-upload" && !preprocessing && uploadedPreview && (
        <div
          className={`relative cursor-pointer overflow-hidden rounded-lg border border-zinc-200 ${
            compact ? "mx-auto h-32 w-32" : "aspect-square w-full"
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          <Image src={uploadedPreview} alt={e.uploadPreviewAlt} fill className="object-contain" />
          <span className="absolute inset-x-0 bottom-1 text-center text-[10px] text-zinc-500">
            {e.uploadChangeHint ?? "클릭해서 변경"}
          </span>
        </div>
      )}

      {preprocessErrors.length > 0 && (
        <div className="space-y-1 rounded-lg bg-red-50 p-2">
          {preprocessErrors.map((err) => (
            <p key={err.type} className="text-[10px] text-red-500">
              {err.type === "file-too-large"
                ? tpl(ip.fileTooLarge, { maxMB: 20 })
                : err.type === "file-too-small"
                  ? tpl(ip.imageTooSmall, { minPx: 200 })
                  : err.type === "unsupported-type"
                    ? ip.unsupportedFormat
                    : ip.invalidImage}
            </p>
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="hidden"
        onChange={handleUpload}
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">
            {activeFeed
              ? e.promptLabelExtra ?? "추가 프롬프트 입력하기"
              : style === "custom"
                ? e.promptLabelCustom ?? "프롬프트를 자유롭게 입력하세요"
                : e.promptLabel ?? "어떤 캐릭터를 만들까요?"}
          </Label>
        </div>

        <Textarea
          value={prompt}
          onChange={(ev) => setPrompt(ev.target.value)}
          placeholder={
            activeFeed
              ? e.promptPlaceholderExtra ?? "원하는 디테일을 추가로 입력하세요 (선택)"
              : style === "custom"
                ? e.promptPlaceholderCustom ?? "스타일, 색감, 구도, 분위기 등을 자유롭게 묘사해주세요"
                : e.promptPlaceholder ?? "졸린 표정으로 하품하는 캐릭터"
          }
          className="resize-none text-sm"
          rows={activeFeed ? 2 : style === "custom" ? 4 : 3}
        />

        {style === "custom" && !activeFeed && (
          <p className="text-[10px] text-muted-foreground">
            {e.customHint ?? "스타일, 인물, 구도, 배경을 구체적으로 적을수록 결과가 좋아집니다."}
          </p>
        )}
      </div>

      <Button className="w-full" onClick={handleGenerate} disabled={loading || !finalPrompt.trim()}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {e.generating ?? "이미지 생성 중…"}
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-4 w-4" />
            {e.generateBtn ?? "생성하기"}
          </>
        )}
      </Button>

      {showDailyLimitReached && (
        <div className="relative space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <button
            type="button"
            onClick={() => setShowDailyLimitReached(false)}
            className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-amber-500" />
            <span className="text-sm font-semibold text-amber-800">
              {e.limitTitle ?? "오늘 생성 한도를 모두 사용했습니다"}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-amber-700">
            {e.limitDesc}
            <br />
            {e.limitSuffix}
          </p>
        </div>
      )}

      {showLoginPrompt && (
        <div className="relative space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <button
            type="button"
            onClick={() => setShowLoginPrompt(false)}
            className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <span className="text-sm font-semibold">
              {e.loginTitle ?? "더 많이 만들어보세요!"}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {e.loginDesc}
            <br />
            {e.loginPrefix}
            <span className="font-semibold text-primary">{e.loginBenefit}</span>
            {e.loginSuffix}
          </p>
          <Link
            href="/login?next=/design"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors"
          >
            <LogIn className="size-4" />
            {e.loginBtn ?? "로그인하기"}
          </Link>
        </div>
      )}

      {error && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-500">{error}</p>}

      {result && (
        <>
          <Separator />
          <div className="space-y-2">
            <Label className="text-xs">{e.generatedLabel ?? "생성된 이미지"}</Label>

            {fallbackMessage && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10px] text-amber-700">
                {fallbackMessage}
              </p>
            )}

            <div
              className={`relative overflow-hidden rounded-lg border border-zinc-200 bg-[url('/checkerboard.svg')] ${
                compact ? "mx-auto h-40 w-40" : "aspect-square w-full"
              }`}
            >
              <Image
                src={result}
                alt={e.generatedAlt ?? "AI 생성 결과"}
                fill
                className="object-contain"
              />
            </div>

            <Button variant="outline" className="w-full" onClick={() => onAddGeneratedImage(result)}>
              <ImagePlus className="mr-2 h-4 w-4" />
              {e.addToCanvas ?? "캔버스에 추가"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function ModeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-[10px] transition-all ${
        active
          ? "border-primary bg-primary/5 text-primary"
          : "border-zinc-200 text-zinc-500 hover:border-zinc-300"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
