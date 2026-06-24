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
      <rect x="4" y="5" width="16" height="14" rx="3" />
      <path d="M9 5v14M15 9l-3 3 3 3" />
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

export function ChevronDownIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="m7 10 5 5 5-5" />
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
