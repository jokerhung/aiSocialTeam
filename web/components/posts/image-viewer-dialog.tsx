"use client";

/* eslint-disable @next/next/no-img-element -- the picture is a file of the app's own media folder */
import { useEffect, useState } from "react";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { PostMedia } from "@/lib/posts/shared";
import { T, useT } from "@/lib/i18n/client";

// A picture of the post at full size. With `canEdit` the person can also say what to change: the Codex CLI or Gemini CLI paints
// a new version, which is kept next to the original until they choose.
export function ImageViewerDialog({
  image,
  open,
  canEdit,
  onOpenChange,
  onUse,
}: {
  image: PostMedia | null;
  open: boolean;
  canEdit: boolean;
  onOpenChange: (open: boolean) => void;
  // Called with the edited picture when the person keeps it (it replaces the original on the post)
  onUse: (image: PostMedia) => void;
}) {
  const t = useT();
  const [prompt, setPrompt] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PostMedia | null>(null);

  useEffect(() => {
    if (open) {
      setPrompt("");
      setError(null);
      setResult(null);
    }
  }, [open, image?.url]);

  async function edit() {
    if (!image) return;
    setWorking(true);
    setError(null);
    try {
      const response = await fetch("/api/media/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: image.url, prompt }),
      });
      const body = (await response.json().catch(() => null)) as { media?: PostMedia; error?: string } | null;
      if (!response.ok || !body?.media) throw new Error(body?.error ?? t("The image couldn't be changed."));
      setResult(body.media);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  const shown = result ?? image;
  return (
    <Dialog open={open} onOpenChange={(next) => !working && onOpenChange(next)}>
      <DialogContent className="max-h-[92svh] gap-3 overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{result ? t("Changed image") : t("Image")}</DialogTitle>
          <DialogDescription>{result ? t("Keep it to use it on the post, or change it again.") : (image?.name ?? "")}</DialogDescription>
        </DialogHeader>
        {shown && (
          <div className="flex justify-center rounded-2xl bg-muted p-2">
            <img src={shown.url} alt={shown.name} className="max-h-[60svh] w-auto max-w-full rounded-xl object-contain" />
          </div>
        )}
        {canEdit && (
          <div className="space-y-2">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              maxLength={900}
              disabled={working}
              placeholder={t("What should change? e.g. make the background a sunrise, remove the people, warmer colours")}
              className="min-h-0 resize-none rounded-xl text-sm"
            />
            {working && <p className="text-xs text-muted-foreground"><T>The image tool is changing your picture. This can take a minute or two.</T></p>}
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" className="rounded-xl" disabled={working} onClick={() => onOpenChange(false)}>
                <T>Close</T>
              </Button>
              <Button className="rounded-xl" disabled={working || prompt.trim().length < 3} onClick={edit}>
                {working ? <Spinner /> : <Wand2 data-icon="inline-start" />}
                {working ? t("Changing…") : t("Change image")}
              </Button>
              {result && (
                <Button
                  className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-600/90"
                  disabled={working}
                  onClick={() => {
                    onUse(result);
                    onOpenChange(false);
                  }}
                >
                  <T>Use this image</T>
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
