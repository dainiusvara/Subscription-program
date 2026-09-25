import Link from "next/link";

/** "Privacy · Terms" links, shown under the app and on the legal pages. */
export function LegalLinks() {
  return (
    <footer className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[13px] text-muted">
      <Link href="/privacy" className="text-muted hover:text-ink">
        Privacy
      </Link>
      <Link href="/terms" className="text-muted hover:text-ink">
        Terms
      </Link>
    </footer>
  );
}
