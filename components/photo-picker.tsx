"use client";

import { Camera, LoaderCircle, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { api, errorMessage } from "@/lib/api/client";
import type { PhotoRef } from "@/lib/api/types";
import { resizeImage } from "@/lib/image";
import { cx } from "./ui";

/**
 * Pick → resize to 1600px JPEG → presign → PUT → confirm.
 * Calls onChange with the confirmed PhotoRefs.
 */
export function PhotoPicker({
  value,
  onChange,
  max = 3,
  label = "Add a photo",
  required,
  onBusyChange,
}: {
  value: PhotoRef[];
  onChange: (photos: PhotoRef[]) => void;
  max?: number;
  label?: string;
  required?: boolean;
  /** Told when an upload starts and ends, so a form can hold its submit until the photo lands. */
  onBusyChange?: (busy: boolean) => void;
}) {
  const id = useId();
  const [busy, setBusyState] = useState(false);
  const setBusy = (b: boolean) => {
    setBusyState(b);
    onBusyChange?.(b);
  };
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    try {
      const next = [...value];
      for (const file of Array.from(files).slice(0, max - value.length)) {
        if (!file.type.startsWith("image/") && file.type !== "") throw new Error("Please choose an image file.");
        const blob = await resizeImage(file, 1600);
        if (blob.size > 5_000_000) throw new Error("That photo is too large even after compressing. Try another.");
        const ref = await api.uploadPhoto(blob);
        setPreviews((p) => ({ ...p, [ref.id]: URL.createObjectURL(blob) }));
        next.push(ref);
      }
      onChange(next);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    // The file input is visually hidden, so its keyboard focus ring is drawn on the visible "add" tile.
    <div className="flex flex-col gap-2 [&:has(>input:focus-visible)_label]:outline-3 [&:has(>input:focus-visible)_label]:outline-offset-2 [&:has(>input:focus-visible)_label]:outline-ring">
      <div className="flex flex-wrap gap-3">
        {value.map((p) => (
          <div
            key={p.id}
            className="relative size-28 overflow-hidden rounded-3xl border-2 border-border bg-surface-2 shadow-rest"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previews[p.id] ?? p.thumbUrl ?? p.url} alt="Your uploaded photo" className="size-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x.id !== p.id))}
              className="group absolute right-0 top-0 flex size-11 items-center justify-center focus-visible:-outline-offset-4"
              aria-label="Remove photo"
            >
              <span className="flex size-8 items-center justify-center rounded-full border border-border/70 bg-surface text-danger shadow-rest transition-colors group-hover:bg-danger-soft">
                <Trash2 className="size-4" aria-hidden />
              </span>
            </button>
          </div>
        ))}
        {value.length < max ? (
          <label
            htmlFor={id}
            className={cx(
              "flex size-28 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-3xl border-2 border-border bg-surface-2 px-2 text-center text-xs font-extrabold text-fg transition-colors hover:border-primary",
              busy && "pointer-events-none opacity-70",
            )}
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-fg shadow-gloss">
              {busy ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Camera className="size-5" aria-hidden />}
            </span>
            {busy ? "Uploading…" : label}
          </label>
        ) : null}
      </div>
      <input
        id={id}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label={label}
        aria-required={required}
        disabled={busy}
        onChange={(e) => {
          void onFiles(e.target.files);
          e.target.value = "";
        }}
        data-testid="photo-input"
      />
      {error ? (
        <p role="alert" className="text-sm font-bold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
