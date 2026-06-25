import { useAuth } from "@/_core/hooks/useAuth";
import { ARBEN_LOGO_URL } from "@/components/BrandLogo";
import ChargeRequestDialog from "@/components/ChargeRequestDialog";
import {
  BarChart3,
  ChevronDown,
  ClipboardList,
  Home,
  LogOut,
  type LucideIcon,
  Rocket,
  Search,
  Sparkles,
  Store,
  TrendingUp,
  User,
  Wallet,
} from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";

type NavChild = { label: string; href: string };

type NavItem = {
  label: string;
  sub: string;
  icon: LucideIcon;
  href?: string;
  soon?: boolean;
  exact?: boolean;
  children?: NavChild[];
};

type NavSection = { title: string; items: NavItem[] };

const NAV: NavSection[] = [
  {
    title: "메인",
    items: [
      { label: "홈", sub: "현황 · 성과 · 소개", icon: Home, href: "/client/dashboard", exact: true },
      {
        label: "캠페인 신청 관리",
        sub: "등록 · 진행상황",
        icon: ClipboardList,
        children: [
          { label: "캠페인 신청", href: "/client/campaign/new" },
          { label: "캠페인 관리", href: "/client/campaigns" },
        ],
      },
      { label: "상위노출 컨설팅 의뢰", sub: "맞춤 전략 1:1 상담", icon: Rocket, href: "/client/consulting" },
      { label: "SEO 자가진단", sub: "예시 리포트", icon: Search, soon: true },
      { label: "순위조회", sub: "네이버 · 쿠팡", icon: TrendingUp, soon: true },
      { label: "리뷰 분석", sub: "쿠팡 리뷰 분석", icon: BarChart3, soon: true },
    ],
  },
  {
    title: "마이페이지",
    items: [
      { label: "내 정보", sub: "셀러 정보", icon: User, soon: true },
    ],
  },
];

function NavRowShell({ item, active, children }: { item: NavItem; active: boolean; children?: ReactNode }) {
  const Icon = item.icon;
  return (
    <div
      className={`group flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-all ${
        active
          ? "bg-primary text-primary-foreground shadow-[0_6px_16px_-6px_var(--primary)]"
          : "text-foreground/70 hover:bg-primary/10 hover:text-foreground"
      } ${item.soon ? "cursor-default" : "cursor-pointer"}`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors ${
          active ? "bg-white/20 text-white" : "bg-primary/10 text-primary group-hover:bg-primary/15"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{item.label}</span>
          {item.soon && (
            <span className={`rounded-full px-1.5 py-px text-[9px] font-bold ${active ? "bg-white/25 text-white" : "bg-accent text-accent-foreground"}`}>
              곧
            </span>
          )}
        </div>
        <p className={`truncate text-[11px] ${active ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{item.sub}</p>
      </div>
      {children}
    </div>
  );
}

function NavGroup({ item, location }: { item: NavItem; location: string }) {
  const children = item.children ?? [];
  const childActive = children.some(c => location.startsWith(c.href));
  const [open, setOpen] = useState(childActive);

  return (
    <div>
      <button type="button" className="w-full text-left" onClick={() => setOpen(o => !o)}>
        <NavRowShell item={item} active={false}>
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </NavRowShell>
      </button>
      {open && (
        <div className="mt-1 ml-5 space-y-0.5 border-l-2 border-primary/15 pl-3">
          {children.map(c => {
            const active = location.startsWith(c.href);
            return (
              <Link key={c.href} href={c.href}>
                <div
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-foreground/70 hover:bg-primary/10 hover:text-foreground"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-primary" : "bg-muted-foreground/40"}`} />
                  {c.label}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NavRow({ item, location }: { item: NavItem; location: string }) {
  if (item.children) return <NavGroup item={item} location={location} />;

  const active = !!item.href && (item.exact ? location === item.href : location.startsWith(item.href));

  if (item.soon || !item.href) {
    return (
      <button type="button" className="w-full text-left" onClick={() => toast.info(`${item.label}은(는) 곧 만나요! 🐣`)}>
        <NavRowShell item={item} active={active} />
      </button>
    );
  }
  return (
    <Link href={item.href}>
      <NavRowShell item={item} active={active} />
    </Link>
  );
}

export default function ClientLayout({
  children,
  title,
  description,
  actions,
}: {
  children: ReactNode;
  title?: string;
  description?: string;
  actions?: ReactNode;
}) {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      window.location.href = "/client/login";
    }
  }, [loading, isAuthenticated]);

  if (loading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const sellerId = user?.loginId ?? user?.name ?? "셀러";

  const Sidebar = (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-border/60 bg-sidebar">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5">
        <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-primary/10 ring-1 ring-primary/15">
          <img src={ARBEN_LOGO_URL} alt="로고" className="h-[78%] w-[78%] object-contain" />
        </span>
        <div className="leading-tight">
          <p className="text-base font-extrabold text-foreground">아르벤팩토리</p>
          <p className="text-[11px] text-muted-foreground">셀러를 위한 따뜻한 솔루션 🐻</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV.map(section => (
          <div key={section.title}>
            <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground/80">
              {section.title}
            </p>
            <div className="space-y-1">
              {section.items.map(item => (
                <NavRow key={item.label} item={item} location={location} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Points + user */}
      <div className="space-y-2 border-t border-border/60 p-4">
        <Link href="/client/deposit">
          <div className="flex cursor-pointer items-center justify-between rounded-2xl bg-primary/10 px-3 py-2.5 transition-colors hover:bg-primary/15">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Wallet className="h-4 w-4 text-primary" /> 예치금
            </span>
            <span className="text-sm font-extrabold text-primary">{(user?.depositBalance ?? 0).toLocaleString()}원</span>
          </div>
        </Link>
        <button
          onClick={() => setChargeOpen(true)}
          className="w-full rounded-2xl bg-secondary px-3 py-2.5 text-sm font-bold text-secondary-foreground transition-colors hover:bg-accent"
        >
          예치금 충전요청
        </button>
        <div className="flex items-center justify-between px-1 pt-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {(user?.fullName || sellerId).charAt(0)}
            </span>
            <p className="truncate text-[11px] text-muted-foreground">
              셀러 <span className="font-semibold text-foreground">({sellerId})</span> 로그인 중
            </p>
          </div>
          <button
            onClick={() => logout("/client/login")}
            className="shrink-0 rounded-xl p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="로그아웃"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">{Sidebar}</div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full">{Sidebar}</div>
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex items-center gap-3 border-b border-border/60 bg-card/80 px-4 py-3 backdrop-blur sm:px-6 lg:py-4">
          <button
            className="rounded-xl border border-border/70 bg-card p-2 lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Sparkles className="h-4 w-4 text-primary" />
          </button>
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {title && <h1 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">{title}</h1>}
              {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
          <Store className="hidden h-5 w-5 text-muted-foreground/40 sm:block" />
        </header>

        <main className="flex-1 p-4 pb-24 sm:p-6 sm:pb-24">{children}</main>
      </div>

      <ChargeRequestDialog open={chargeOpen} onOpenChange={setChargeOpen} />
    </div>
  );
}
