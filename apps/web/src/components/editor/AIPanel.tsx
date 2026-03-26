"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
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
  | "animal-crossing"
  | "ios-emoji"
  | "maplestory"
  | "tanning-kitty"
  | "snoopy";

type StyleFeedItem = {
  id: string;
  title: string;
  style: Style;
  preview: string;
  basePrompt: string;
};

const STYLE_FEED_ITEMS: StyleFeedItem[] = [
  {
    id: "animal-crossing",
    title: "동물의 숲",
    style: "animal-crossing",
    preview: "/logo.png",
    basePrompt:
      "닌텐도 스위치 게임 동물의 숲 스타일의 3D 캐릭터 일러스트 화풍을 공부하고, 그 스타일의 이목구비, 의상, 헤어스타일을 따라 하는 얼굴 표현방식을 따라해. 첨부한 이미지 속 인물의 헤어스타일과 옷, 액세서리로 인물 일러스트를 그려줘. 배경은 투명하게 해줘. 자연광 아래의 밝은 햇빛과 부드러운 그림자 효과를 사용해 따뜻하고 발랄한 분위기로 만들어 줘. 실제 동물의숲 플레이 화면에 등장하는 캐릭터처럼 보여야 해, 3D인 점을 명확하게 보여줘.",
  },
  {
    id: "ios-emoji",
    title: "ios 이모지",
    style: "ios-emoji",
    preview: "/logo.png",
    basePrompt:
      "사진 속 인물을 애플 ios 이모지 스타일의 3D 배경화면 캐릭터로 만들어줘. 이목구비, 피부색, 표정, 표면 질감 등을 모방하고, 헤어 스타일, 머리 장식, 의상, 포즈까지 그대로 반영해줘. 배경은 투명색이며, 최종 이미지가 ios 공식 이모지처럼 보이게 해줘.",
  },
  {
    id: "maplestory",
    title: "메이플스토리",
    style: "maplestory",
    preview: "/logo.png",
    basePrompt:
      "메이플스토리 인게임 캐릭터의 픽셀 캐릭터 느낌으로 만들어줘. 이목구비, 의상, 헤어스타일을 반영한 얼굴표현을 해줘. 스타일, 옷 액세서리는 첨부한 사진을 그대로 반영해줘. 배경은 흰색으로 이미지를 만들어줘.",
  },
  {
    id: "tanning-kitty",
    title: "태닝키티",
    style: "tanning-kitty",
    preview: "/logo.png",
    basePrompt:
      "첨부 사진을 아래 요청 스타일에 맞춰서 2D 캐릭터화해줘. 헬로키티 스타일로 원작의 얼굴과 몸 비율, 윤곽선은 그대로 유지해줘. 피부색은 밝은 라떼색, 햇볕에 건강하게 그을린 느낌으로 변경해줘 (지나치게 어두운 색은 피함). 원래의 리본, 액세서리, 옷은 사진 스타일에 맞게 조정해줘. 사용자 사진을 참고해서 헤어스타일과 옷 스타일은 그대로 반영해줘. 전체적으로 귀엽고 단순한 산리오 스타일 유지해주고 배경은 투명하게 만들어줘.",
  },
  {
    id: "snoopy",
    title: "스누피",
    style: "snoopy",
    preview: "/logo.png",
    basePrompt:
      "업로드한 이미지를 Peanuts-style 3D art로 변경해줘. 배경과 옷은 원본 이미지와 비슷하게 표현해주고 스타일만 바꿔줘. PNG 파일로 저장해주고 그 옆에 스누피 캐릭터 형태도 그대로 그려줘.",
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
  const [style, setStyle] = useState<Style>("animal-crossing");
  const [activeFeedId, setActiveFeedId] = useState<string>(STYLE_FEED_ITEMS[0].id);

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

  const activeFeed = useMemo(
    () => STYLE_FEED_ITEMS.find((item) => item.id === activeFeedId) ?? null,
    [activeFeedId],
  );

  const finalPrompt = useMemo(() => {
    if (activeFeed) {
      return activeFeed.basePrompt;
    }
    return "";
  }, [activeFeed]);

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

        <div className="ai-feed-scroll -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1">
          {STYLE_FEED_ITEMS.map((item) => {
            const isActive = activeFeedId === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectFeedItem(item)}
                className={`group relative h-56 min-w-[220px] snap-start overflow-hidden rounded-2xl border text-left transition-all ${
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
