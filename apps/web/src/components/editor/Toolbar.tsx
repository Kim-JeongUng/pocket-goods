"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Undo2, Redo2, Trash2, BringToFront, SendToBack, Eye, ShoppingBag, ShoppingCart, Save, CheckCheck, Loader2, History,
} from "lucide-react";
import UserMenu from "@/components/auth/UserMenu";
import { useLocale, tpl } from "@/lib/i18n/client";

interface ToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  isDirty: boolean;
  savedAt: Date | null;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onSave: () => void;
  onOpenHistory: () => void;
  onExportPreview: () => void;
  onOrder: () => void;
  onOpenCart: () => void;
  isExporting?: boolean;
}

export default function Toolbar({
  canUndo, canRedo, hasSelection, isDirty, savedAt,
  onUndo, onRedo, onDelete, onBringForward, onSendBackward, onSave, onOpenHistory, onExportPreview, onOrder, onOpenCart, isExporting,
}: ToolbarProps) {
  const { locale, t } = useLocale();
  const tb = t.toolbar;

  return (
    <header className="flex items-center gap-2 px-4 h-14 border-b bg-white shrink-0">
      <Link href="/" className="mr-2 flex items-center select-none" aria-label={`${t.common.brandName} 홈으로 이동`}>
        <Image src="/logo.png" alt={t.common.brandName} width={116} height={48} priority className="h-8 w-auto" />
      </Link>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" disabled={!canUndo} onClick={onUndo} title={`${tb.undo} (${tb.undoShortcut})`}><Undo2 className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" disabled={!canRedo} onClick={onRedo} title={`${tb.redo} (${tb.redoShortcut})`}><Redo2 className="w-4 h-4" /></Button>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" disabled={!hasSelection} onClick={onBringForward} title={tb.bringForward}><BringToFront className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" disabled={!hasSelection} onClick={onSendBackward} title={tb.sendBackward}><SendToBack className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" disabled={!hasSelection} onClick={onDelete} title={tb.deleteSelected} className="text-red-500 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
          {isDirty ? (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
          ) : savedAt ? (
            <CheckCheck className="w-3.5 h-3.5 text-green-500" />
          ) : null}
          <span>
            {isDirty ? tb.unsavedChanges : savedAt ? tpl(tb.savedAt, { time: savedAt.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) }) : ""}
          </span>
        </div>

        <Button variant="outline" size="sm" onClick={onSave} title={`${tb.save} (${tb.saveShortcut})`}>
          <Save className="w-4 h-4 mr-1" />{tb.save}
        </Button>
        <Button variant="outline" size="sm" onClick={onOpenHistory} title={tb.history}>
          <History className="w-4 h-4 mr-1" />{tb.history}
        </Button>

        <Separator orientation="vertical" className="h-6" />

        <Button variant="outline" size="sm" onClick={onExportPreview} disabled={isExporting}>
          {isExporting ? (<><Loader2 className="w-4 h-4 mr-1 animate-spin" />준비 중</>) : (<><Eye className="w-4 h-4 mr-1" />미리보기</>)}
        </Button>
        <Button size="sm" onClick={onOrder} title={tb.order}>
          <ShoppingCart className="w-4 h-4 mr-1" />{tb.order}
        </Button>
        <Button variant="outline" size="sm" onClick={onOpenCart} title="묶음 주문함">
          <ShoppingBag className="w-4 h-4 mr-1" />주문함
        </Button>

        <Separator orientation="vertical" className="h-6" />
        <UserMenu />
      </div>
    </header>
  );
}
