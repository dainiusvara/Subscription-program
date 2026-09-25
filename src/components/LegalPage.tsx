import Link from "next/link";
import type { ReactNode } from "react";
import { LEGAL } from "@/lib/legal";
import { BrandMark } from "./icons";
import { LegalLinks } from "./LegalLinks";

/** Layout for the privacy policy and terms: plain reading pages, no app state. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-[760px] gap-[22px] pt-[calc(28px+env(safe-area-inset-top,0px))] pb-[calc(64px+env(safe-area-inset-bottom,0px))]">
      <header className="flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2.5 text-ink no-underline">
          <BrandMark className="h-[30px] w-[30px]" />
          <b className="font-display text-[26px] font-extrabold tracking-[-0.02em]">Drip</b>
        </Link>
        <Link href="/" className="text-sm font-semibold text-accent">
          Back to Drip
        </Link>
      </header>
      <main className="rounded-2xl border border-line bg-surface p-[18px] md:p-7">
        <h1 className="m-0 font-display text-[clamp(28px,5vw,40px)] leading-tight font-extrabold tracking-[-0.03em]">
          {title}
        </h1>
        <p className="mt-2 mb-0 text-sm text-muted">Last updated {LEGAL.updated}</p>
        <div className="mt-6 grid gap-4 leading-relaxed [&_a]:text-accent [&_a]:underline [&_h2]:mt-4 [&_h2]:mb-0 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:tracking-[-0.01em] [&_li]:mt-1.5 [&_p]:m-0 [&_ul]:m-0 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
      </main>
      <LegalLinks />
    </div>
  );
}

/** Whoever runs Drip (and their postal address once set), or a neutral fallback. */
export function Owner() {
  return (
    <>
      {LEGAL.owner || "the person who runs Drip"}
      {LEGAL.address && ` (${LEGAL.address})`}
    </>
  );
}

export function ContactEmail() {
  return LEGAL.email ? <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> : <>the contact address on this page</>;
}
