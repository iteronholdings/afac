import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClipboardList, LayoutDashboard, LogOut, Menu, UserRound } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import BrandLogo from "@/components/BrandLogo";

type NavLink = { label: string; href: string };

const AUTH_NAV_LINKS: NavLink[] = [
  { label: "진행 중인 캠페인", href: "/campaigns" },
  { label: "내 활동", href: "/my" },
];

export default function SiteHeader() {
  const { user, isAuthenticated, loading, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const initial = (user?.fullName || user?.name || "리").charAt(0);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link href="/">
          <BrandLogo size={38} textClassName="text-lg" />
        </Link>

        {isAuthenticated && (
          <nav className="hidden items-center gap-8 md:flex">
            {AUTH_NAV_LINKS.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-2">
          {loading ? (
            <div className="h-9 w-20 animate-pulse rounded-full bg-muted" />
          ) : isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full border border-border/70 bg-card py-1 pl-1 pr-3 transition-colors hover:bg-accent">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {initial}
                  </span>
                  <span className="hidden text-sm font-medium text-foreground sm:inline">
                    {user?.fullName || user?.name}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="flex items-center gap-2">
                  <UserRound className="h-4 w-4" />
                  {user?.fullName || user?.name}님
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/campaigns">
                    <ClipboardList className="mr-2 h-4 w-4" />
                    캠페인 둘러보기
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/my">
                    <UserRound className="mr-2 h-4 w-4" />
                    내 활동
                  </Link>
                </DropdownMenuItem>
                {user?.role === "admin" && (
                  <DropdownMenuItem asChild>
                    <Link href="/admin">
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      관리자 대시보드
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => logout()}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  로그아웃
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link href="/login">
                <Button variant="ghost" className="font-medium">
                  로그인
                </Button>
              </Link>
              <Link href="/signup">
                <Button className="rounded-full font-semibold">회원가입</Button>
              </Link>
            </div>
          )}

          {/* Mobile menu */}
          {isAuthenticated && (
            <DropdownMenu open={open} onOpenChange={setOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {AUTH_NAV_LINKS.map(link => (
                  <DropdownMenuItem key={link.href} asChild>
                    <Link href={link.href}>{link.label}</Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
}
