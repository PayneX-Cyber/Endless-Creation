import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function SvgIcon({ children, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      {...props}
    >
      {children}
    </svg>
  );
}

export function AddSquareIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </SvgIcon>
  );
}

export function CollapseIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M9 5v14M15 9l-3 3 3 3" />
    </SvgIcon>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M4.5 11.5 12 4l7.5 7.5" />
      <path d="M6.5 10.5V20h11v-9.5" />
      <path d="M10 20v-5h4v5" />
    </SvgIcon>
  );
}

export function ProjectIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
    </SvgIcon>
  );
}

export function PromptIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M7 4h8l4 4v12H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
      <path d="M15 4v5h5M9 13h6M9 17h5" />
    </SvgIcon>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H10l2 2h5.5A2.5 2.5 0 0 1 20 10.5v6A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z" />
    </SvgIcon>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="8" r="3" />
      <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
    </SvgIcon>
  );
}

export function SceneIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <rect x="4" y="5" width="16" height="14" rx="3" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m6.5 17 4.2-4.2 3.1 3.1 1.8-1.8L19 17" />
    </SvgIcon>
  );
}

export function ScriptIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M7 4h8l4 4v12H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
      <path d="M15 4v5h5M9 12h6M9 16h6" />
    </SvgIcon>
  );
}

export function BookIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H20v16H7.5A2.5 2.5 0 0 0 5 21V5.5Z" />
      <path d="M5 18.5A2.5 2.5 0 0 1 7.5 16H20M9 7h6" />
    </SvgIcon>
  );
}


export function PenBookIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15H7.5A2.5 2.5 0 0 0 5 20.5V5.5Z" />
      <path d="M8.5 8h5M8.5 11h4" />
      <path d="m14.5 16.5 4.2-4.2a1.4 1.4 0 0 1 2 2l-4.2 4.2-2.4.6.4-2.6Z" />
    </SvgIcon>
  );
}

export function ImageWorkbenchIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <rect x="4" y="5" width="16" height="14" rx="3" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m6.5 17 4-4 3 3 2-2 3 3" />
      <path d="M17.5 7.5h2M18.5 6.5v2" />
    </SvgIcon>
  );
}

export function VideoIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <rect x="4" y="6" width="11" height="12" rx="3" />
      <path d="m15 10 5-3v10l-5-3" />
      <path d="M8 10h3" />
    </SvgIcon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 3.5v2M12 18.5v2M5.99 5.99l1.42 1.42M16.59 16.59l1.42 1.42M3.5 12h2M18.5 12h2M5.99 18.01l1.42-1.42M16.59 7.41l1.42-1.42" />
      <circle cx="12" cy="12" r="3.2" />
    </SvgIcon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="m7 10 5 5 5-5" />
    </SvgIcon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="m10 7 5 5-5 5" />
    </SvgIcon>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="m14.5 6-6 6 6 6M9 12h10" />
    </SvgIcon>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.3 3.7 5.1 3.7 8.5S14.4 18.2 12 20.5C9.6 18.2 8.3 15.4 8.3 12S9.6 5.8 12 3.5Z" />
    </SvgIcon>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.8M17 14a5 5 0 0 1 3.5 5" />
    </SvgIcon>
  );
}

export function ListIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M8 6h11M8 12h11M8 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
    </SvgIcon>
  );
}

export function BoltIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="m13.5 2.8-8 11.2h6l-1 7.2 8-11.2h-6l1-7.2Z" />
    </SvgIcon>
  );
}


export function BillingIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <rect x="4" y="7" width="16" height="11" rx="2" />
      <path d="M4 10h16M8 14h4" />
    </SvgIcon>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="m7 15 3.2-3.2 2.6 2.4 4.2-5M16 9h1v1" />
    </SvgIcon>
  );
}

export function HelpIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M9.8 9.5a2.4 2.4 0 0 1 4.5 1.2c0 1.8-2.3 2-2.3 3.6" />
      <path d="M12 17.2h.01" />
    </SvgIcon>
  );
}

export function LogoutIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M9 5H6.5A2.5 2.5 0 0 0 4 7.5v9A2.5 2.5 0 0 0 6.5 19H9" />
      <path d="M14 8l4 4-4 4M18 12H9" />
    </SvgIcon>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
    </SvgIcon>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M20 14.4A7.5 7.5 0 0 1 9.6 4 8.5 8.5 0 1 0 20 14.4Z" />
    </SvgIcon>
  );
}
