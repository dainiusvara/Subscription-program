import type { SVGProps } from "react";

/** The Drip drop. Uses the theme colours, so it follows light and dark mode. */
export function BrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" {...props}>
      <path d="M16 3c5 7 9 11.5 9 17a9 9 0 0 1-18 0c0-5.5 4-10 9-17z" fill="var(--accent)" />
      <path
        d="M12 21a4 4 0 0 0 4 4"
        stroke="var(--accent-ink)"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function SunIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </Icon>
  );
}

export function MoonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
    </Icon>
  );
}

/** Half-filled circle: follow the device setting. */
export function AutoThemeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function InstallIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14" />
    </Icon>
  );
}

/** iOS share button: a box with an arrow pointing up. */
export function ShareIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 3v12M8 7l4-4 4 4M7 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </Icon>
  );
}
