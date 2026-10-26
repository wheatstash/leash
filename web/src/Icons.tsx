import type { ReactNode } from "react";

// Line icons in one style (24px grid, 1.6 stroke) so the nav and quick access read as a set.
type P = { size?: number };

function Svg({ size = 20, children }: P & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

export const Icon = {
  Home: (p: P) => <Svg {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /><path d="M10 20v-5h4v5" /></Svg>,
  Activity: (p: P) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9h10M7 13h10M7 17h6" /></Svg>,
  Inbox: (p: P) => <Svg {...p}><path d="M3 13l2.5-8h13L21 13v6H3z" /><path d="M3 13h5l1.5 2.5h5L16 13h5" /></Svg>,
  Chat: (p: P) => <Svg {...p}><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9.5h8M8 12.5h5" /></Svg>,
  Shield: (p: P) => <Svg {...p}><path d="M12 3 4.5 6v6c0 4.5 3.2 7.7 7.5 9 4.3-1.3 7.5-4.5 7.5-9V6z" /><path d="m9 12 2 2 4-4" /></Svg>,
  Approve: (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>,
  Chart: (p: P) => <Svg {...p}><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-4M12 16V8M16 16v-6" /></Svg>,
  Bell: (p: P) => <Svg {...p}><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></Svg>,
  Plus: (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>,
  ChevronDown: (p: P) => <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>,
  ChevronRight: (p: P) => <Svg {...p}><path d="m9 6 6 6-6 6" /></Svg>,
  Reset: (p: P) => <Svg {...p}><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4h4" /></Svg>,
  Lock: (p: P) => <Svg {...p}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><circle cx="12" cy="15" r="1.2" /></Svg>,
  Sparkle: (p: P) => <Svg {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="m6 6 2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></Svg>,
  Bank: (p: P) => <Svg {...p}><path d="M3 9 12 4l9 5" /><path d="M5 9v9M9.5 9v9M14.5 9v9M19 9v9" /><path d="M3 20h18" /></Svg>,
  Empty: (p: P) => <Svg {...p}><rect x="4" y="4" width="16" height="13" rx="1.5" /><path d="M8 9h8M8 12h5" /><path d="m9 17-1 3h8l-1-3" /></Svg>,
};
