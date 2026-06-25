import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Building2,
  Home,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Megaphone,
  Receipt,
  Rocket,
  Users,
} from "lucide-react";
import { ReactNode, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { ARBEN_LOGO_URL } from "@/components/BrandLogo";

const NAV = [
  { label: "캠페인 관리", href: "/admin", icon: Megaphone, exact: true },
  { label: "참여 현황", href: "/admin/participations", icon: ListChecks },
  { label: "정산 관리", href: "/admin/settlement", icon: Receipt },
  { label: "상위노출 문의", href: "/admin/consulting", icon: Rocket },
  { label: "업체 관리", href: "/admin/businesses", icon: Building2 },
  { label: "리뷰어 관리", href: "/admin/members", icon: Users },
];

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Megaphone;
  active: boolean;
}) {
  return (
    <Link href={href}>
      <span
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
          active
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        }`}
      >
        <Icon className="h-4 w-4" />
        {label}
      </span>
    </Link>
  );
}

export default function AdminLayout({
  children,
  title,
  description,
  actions,
}: {
  children: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [location] = useLocation();

  // Redirect unauthenticated users to login (side effect, not during render).
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      window.location.href = "/afreviewer/login";
    }
  }, [loading, isAuthenticated]);

  // Auth / role guard.
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (user?.role !== "admin") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <LayoutDashboard className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-bold">접근 권한이 없습니다</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            관리자 전용 페이지입니다. 리뷰어 활동은 내 활동 페이지에서 확인하세요.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/my">
            <Button variant="outline" className="bg-card">내 활동</Button>
          </Link>
          <Link href="/">
            <Button>홈으로</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border/60 bg-background lg:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-border/60 px-6">
          <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-secondary ring-1 ring-border/60">
            <img src={ARBEN_LOGO_URL} alt="ARVEN FACTORY 로고" className="h-[82%] w-[82%] object-contain" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold uppercase tracking-[0.06em]">ARVEN FACTORY</p>
            <p className="text-[11px] text-muted-foreground">관리자 콘솔</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-4">
          {NAV.map(item => {
            const active = item.exact
              ? location === item.href
              : location.startsWith(item.href);
            return <NavItem key={item.href} {...item} active={active} />;
          })}
          <div className="my-2 border-t border-border/60" />
          <NavItem href="/" label="홈으로 이동" icon={Home} active={false} />
        </nav>
        <div className="border-t border-border/60 p-4">
          <div className="mb-3 flex items-center gap-2 px-1">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {(user?.fullName || user?.name || "관").charAt(0)}
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-medium">{user?.fullName || user?.name}</p>
              <p className="text-[11px] text-muted-foreground">관리자</p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground"
            onClick={() => logout("/afreviewer/login")}
          >
            <LogOut className="mr-2 h-4 w-4" /> 로그아웃
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top nav */}
        <div className="flex items-center gap-2 overflow-x-auto border-b border-border/60 bg-background px-4 py-2 lg:hidden">
          <Link href="/">
            <span className="flex items-center gap-1 whitespace-nowrap rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <Home className="h-3.5 w-3.5" /> 홈
            </span>
          </Link>
          {NAV.map(item => {
            const active = item.exact
              ? location === item.href
              : location.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <span
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${
                    active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>

        <header className="border-b border-border/60 bg-background/80 px-6 py-5 backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight">{title}</h1>
              {description && (
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
              )}
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
        </header>

        <main className="flex-1 p-4 pb-24 sm:p-6 sm:pb-24">{children}</main>
      </div>
    </div>
  );
}
