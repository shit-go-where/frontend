import { Map as MapIcon, Siren } from "lucide-react";
import Link from "next/link";
import { Mascot } from "@/components/mascot";
import { buttonClass } from "@/components/styles";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 px-4 pb-10 pt-14 text-center">
      {/* The mascot looking around: the place you wanted isn't on the map. */}
      <Mascot mood="lost" className="size-28" />
      <h1 className="mt-3 text-3xl leading-tight sm:text-4xl">Eh, this one cannot find leh</h1>
      <p className="max-w-sm text-muted">The page or toilet you&apos;re looking for doesn&apos;t exist, or was removed.</p>
      <div className="mt-5 flex w-full flex-col gap-3">
        <Link href="/go?urgent=1" className={buttonClass("urgent", "lg")}>
          <Siren className="size-5" aria-hidden /> I need to go now
        </Link>
        <Link href="/" className={buttonClass("secondary", "lg")}>
          <MapIcon className="size-5" aria-hidden /> Back to the map
        </Link>
      </div>
    </div>
  );
}
