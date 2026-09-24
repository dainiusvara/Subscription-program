"use client";

import { BrandMark } from "@/components/icons";
import { Button } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto grid max-w-[480px] justify-items-start gap-4 py-24">
      <BrandMark className="h-10 w-10" />
      <h1 className="font-display text-4xl font-extrabold tracking-[-0.03em]">Something went wrong</h1>
      <p className="text-muted">Your subscriptions are still saved on this device. Try again, or reload the page.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
