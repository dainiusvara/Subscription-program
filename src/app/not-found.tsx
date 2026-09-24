import Link from "next/link";
import { BrandMark } from "@/components/icons";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto grid max-w-[480px] justify-items-start gap-4 py-24">
      <BrandMark className="h-10 w-10" />
      <h1 className="font-display text-4xl font-extrabold tracking-[-0.03em]">Page not found</h1>
      <p className="text-muted">There&apos;s nothing at this address.</p>
      <Link href="/" className={buttonClass()}>
        Back to Drip
      </Link>
    </main>
  );
}
