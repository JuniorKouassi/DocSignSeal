/* Hand-rolled stroke icons, paths copied from design/mobile-ui.html rather
   than adding an icon-library dependency -- the app has none today and only
   a handful of icons are needed. */

type IconProps = { size?: number; className?: string };

function Icon({ size = 19, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

export function DocsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M8.5 12h7M8.5 14.5h7M8.5 17h7M8.5 19h4" />
    </Icon>
  );
}

// User-provided vector redesign (own 0-736 viewBox, not the shared Icon()
// wrapper's 24x24 -- kept as its own self-contained SVG rather than
// rescaling every coordinate down, which would risk introducing rounding
// errors into curves that don't need to change at all). currentColor for
// both fill and stroke so it themes correctly across all three places this
// icon is shared: the Signatures tab (gray/blue active state),
// SignActionIcon's white icon on the navy signFab, and DrawIcon's 17px
// rows in the signature-creation menus -- verified by rendering at each of
// those actual sizes/colors before shipping.
export function SignaturesIcon({ size = 19, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 736 736" fill="currentColor" className={className}>
      <g stroke="currentColor" strokeWidth={12} strokeLinejoin="round" strokeLinecap="round" fillRule="evenodd">
        <path d="M572 42 L690 68 L618 282 L494 239 Z M596 50 L662 65 L645 110 L579 95 Z" />
        <path d="M476 266 L612 304 L500 578 L390 672 L383 552 Z M402 558 L486 582 L410 632 Z" />
      </g>
      <g fill="none" stroke="currentColor" strokeWidth={30} strokeLinecap="round" strokeLinejoin="round">
        <path d="M556 80 C540 60 510 62 503 92 L419 291" />
      </g>
      <g fill="none" stroke="currentColor" strokeWidth={40} strokeLinecap="round" strokeLinejoin="round">
        <path d="M247 368 C250 300 235 262 195 262 C140 262 80 330 55 430 C35 510 45 570 75 600 C100 625 135 620 160 585 C178 560 195 535 205 545 C213 553 210 585 228 598 C245 610 258 590 262 565 C266 545 278 555 283 600 C288 640 310 665 338 670" />
      </g>
    </svg>
  );
}

export function StampsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8.5 6.5c0-2.2 1.6-4 3.5-4s3.5 1.8 3.5 4c0 1.6-.8 2.6-1.5 3.6-.5.7-.8 1.3-.8 2.1v1.3h-2.4v-1.3c0-.8-.3-1.4-.8-2.1-.7-1-1.5-2-1.5-3.6z" />
      <path d="M10.3 3.2c-.6.6-.9 1.5-.9 2.6v2.7" />
      <rect x="3.5" y="13.7" width="17" height="4.3" rx="1.3" />
      <rect x="5" y="15.2" width="14" height="1.4" rx="0.4" />
      <path d="M4 18h16" />
    </Icon>
  );
}

// Solid gear+wrench, not the stroke style the other tab icons above use --
// fill="currentColor" still tracks the tab bar's active/inactive color the
// same way stroke="currentColor" does, so it still themes correctly there.
export function SettingsIcon({ size = 19, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M20.30,12.00 L22.45,13.00 L22.00,15.21 L19.63,15.27 L17.87,17.87 L18.69,20.10 L16.80,21.34 L15.08,19.71 L12.00,20.30 L11.00,22.45 L8.79,22.00 L8.73,19.63 L6.13,17.87 L3.90,18.69 L2.66,16.80 L4.29,15.08 L3.70,12.00 L1.55,11.00 L2.00,8.79 L4.37,8.73 L6.13,6.13 L5.31,3.90 L7.20,2.66 L8.92,4.29 L12.00,3.70 L13.00,1.55 L15.21,2.00 L15.27,4.37 L17.87,6.13 L20.10,5.31 L21.34,7.20 L19.71,8.92 Z M12 6.3a5.7 5.7 0 1 0 0 11.4 5.7 5.7 0 0 0 0-11.4z"
      />
      <path d="M9.3 9.1a2.6 2.6 0 0 1 3.5 2.9l4.7 4.7-1.6 1.6-4.7-4.7a2.6 2.6 0 0 1-3.4-3.4l1.6 1.6 1.2-1.2z" />
    </svg>
  );
}

export function SignActionIcon(props: IconProps) {
  return SignaturesIcon(props);
}

export function TextActionIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icon>
  );
}

export function DrawIcon(props: IconProps) {
  return SignaturesIcon(props);
}

export function TypeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 6h16M8 6v14M6 20h4M16 10h4M18 10v10M16 20h4" />
    </Icon>
  );
}

export function GalleryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 15l5-5 4 4 3-3 6 6" />
      <circle cx="8.5" cy="8.5" r="1.5" />
    </Icon>
  );
}

/* Diagonal double arrow along the nw-se axis -- used on the annotate view's
   resize handles. ne/sw corners reuse this same icon rotated 90deg in CSS
   rather than a second icon, since that diagonal is just this one turned a
   quarter turn. */
export function ExpandIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 14v4h4M18 10V6h-4M6 18l5-5M18 6l-5 5" />
    </Icon>
  );
}

export function RotateIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 12a8 8 0 1 1 2.6 5.9" />
      <path d="M4 17v-4h4" />
    </Icon>
  );
}

export function PenIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20l1-4L16 5l3 3L8 19l-4 1z" />
      <path d="M13 8l3 3" />
    </Icon>
  );
}

export function ScanIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 8V5a1 1 0 0 1 1-1h3M20 8V5a1 1 0 0 0-1-1h-3M4 16v3a1 1 0 0 0 1 1h3M20 16v3a1 1 0 0 1-1 1h-3" />
    </Icon>
  );
}

/* Solid (filled, not stroked) icons matching the reference art given for the
   annotate toolbar's Sign/Stamp/Date buttons -- more detailed/illustrative
   than the plain nav icons above, and hardcoded to the site's navy rather
   than currentColor since they're only ever used on a light toolbar
   background, unlike SignActionIcon's other use on the navy signFab button
   (white icon there; navy-on-navy would disappear). */
function SolidIcon({ size = 19, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="var(--dss-navy)" className={className}>
      {children}
    </svg>
  );
}

export function StampSolidIcon(props: IconProps) {
  return (
    <SolidIcon {...props}>
      <path d="M12 2.2c-2.1 0-3.7 1.9-3.7 4 0 1.5.8 2.5 1.5 3.3.5.6.9 1 .9 1.5v.2c-.5.2-.8.6-.8 1 0 .3.1.5.3.7H6.8c-.8 0-1.4.6-1.4 1.4v1.7l-.7.3c-.4.2-.6.5-.6.9v.7c0 .3.2.5.5.5h14.8c.3 0 .5-.2.5-.5v-.7c0-.4-.2-.7-.6-.9l-.7-.3v-1.7c0-.8-.6-1.4-1.4-1.4h-3.4c.2-.2.3-.4.3-.7 0-.4-.3-.8-.8-1v-.2c0-.5.4-.9.9-1.5.7-.8 1.5-1.8 1.5-3.3 0-2.1-1.6-4-3.7-4z" />
      <ellipse cx="12" cy="20.7" rx="5.6" ry="1" />
    </SolidIcon>
  );
}

export function DateCalendarIcon(props: IconProps) {
  return (
    <SolidIcon {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1zM4 10v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9H4zm2 2.3h2.4v2.2H6zm4.8 0h2.4v2.2h-2.4zm4.8 0H18v2.2h-2.4zM6 16.2h2.4v2.2H6zm4.8 0h2.4v2.2h-2.4z"
      />
    </SolidIcon>
  );
}
