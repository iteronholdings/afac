import { Link } from "wouter";
import BrandLogo from "@/components/BrandLogo";

type AuthLayoutProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
};

export default function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-soft-gradient flex flex-col">
      <header className="container py-6">
        <Link href="/">
          <BrandLogo size={38} textClassName="text-lg" />
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {title}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          </div>

          <div className="rounded-3xl border border-border/70 bg-card/80 p-7 shadow-[0_8px_40px_-12px_oklch(0.45_0.05_60_/_0.25)] backdrop-blur-sm sm:p-8">
            {children}
          </div>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {footer}
          </div>
        </div>
      </main>
    </div>
  );
}
