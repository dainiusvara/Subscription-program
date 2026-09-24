"use client";

import { useId, useRef, useState } from "react";
import { GUIDES_CHECKED, searchGuides, type CancelGuide } from "@/lib/cancel-guides";
import type { Subscription } from "@/lib/types";
import { Modal } from "./Modal";
import { Button, buttonClass, cx } from "./ui";

export interface GuideView {
  /** The subscription the user wants to cancel, if they came from its row. */
  sub: Subscription | null;
  /** The guide to show; null shows the searchable list. */
  guide: CancelGuide | null;
}

export function CancelGuidesDialog({
  view,
  hasPro,
  onClose,
  onOpenPro,
  onRemove,
}: {
  view: GuideView | null;
  hasPro: boolean;
  onClose: () => void;
  onOpenPro: () => void;
  onRemove: (sub: Subscription) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<CancelGuide | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const guide = view?.guide ?? picked;
  const sub = view?.sub ?? null;

  function close() {
    setPicked(null);
    setQuery("");
    onClose();
  }

  return (
    <Modal open={view !== null} onClose={close} labelledBy={`${id}-title`} initialFocus={closeRef}>
      {!guide ? (
        <>
          <h3 id={`${id}-title`} className="m-0 font-display text-2xl font-bold tracking-[-0.02em]">
            Cancel guides
          </h3>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search, e.g. Netflix"
            aria-label="Search cancel guides"
            className="w-full rounded-[9px] border border-line bg-bg px-2.5 py-[9px] max-md:text-base"
          />
          <ul className="m-0 grid max-h-[50vh] gap-1 overflow-y-auto">
            {searchGuides(query).map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => setPicked(g)}
                  className="w-full rounded-lg px-2 py-2 text-left hover:bg-surface-2"
                >
                  {g.name}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex">
            <Button ref={closeRef} variant="ghost" onClick={close}>
              Close
            </Button>
          </div>
        </>
      ) : (
        <>
          <h3 id={`${id}-title`} className="m-0 font-display text-2xl font-bold tracking-[-0.02em]">
            {sub ? `Cancel ${sub.name}` : `Cancel ${guide.name}`}
          </h3>
          {sub && sub.name !== guide.name && <p className="m-0 -mt-1 text-sm text-muted">Guide: {guide.name}</p>}

          {hasPro ? (
            <>
              <ol className="m-0 grid list-decimal gap-1.5 pl-[18px]">
                {guide.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              {guide.notes.length > 0 && (
                <ul className="m-0 grid list-disc gap-1 pl-[18px] text-sm text-muted">
                  {guide.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div className="grid gap-2 rounded-xl bg-accent-soft p-3 text-sm">
              <p className="m-0">Step-by-step cancel guides are part of Drip Pro.</p>
              <Button size="sm" className="justify-self-start" onClick={onOpenPro}>
                See Pro
              </Button>
            </div>
          )}

          {guide.url && (
            <a
              href={guide.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cx(buttonClass("ghost", "sm"), "justify-self-start")}
            >
              Open the official help page ↗
            </a>
          )}
          <p className="m-0 text-xs text-muted">
            Checked {GUIDES_CHECKED}. Menus change: if a step doesn&apos;t match, the official page has the latest.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button ref={closeRef} onClick={close}>
              Done
            </Button>
            {sub && (
              <Button
                variant="ghost"
                onClick={() => {
                  onRemove(sub);
                  close();
                }}
              >
                Cancelled it? Remove from Drip
              </Button>
            )}
            {!view?.guide && (
              <Button variant="ghost" onClick={() => setPicked(null)}>
                All guides
              </Button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
