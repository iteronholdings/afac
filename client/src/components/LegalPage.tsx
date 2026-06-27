import BrandLogo from "@/components/BrandLogo";
import { COMPANY } from "@/lib/company";
import { ArrowLeft } from "lucide-react";
import { ReactNode } from "react";
import { Link } from "wouter";

/** 정적 법적 문서(개인정보처리방침·환불규정) 공용 레이아웃. */
export default function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/30 to-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/"><BrandLogo size={34} textClassName="text-base" /></Link>
          <Link href="/" className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> 홈으로
          </Link>
        </div>
      </header>

      <main className="container max-w-3xl py-10 pb-20">
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">시행일 · {COMPANY.effectiveDate}</p>
        <div className="mt-8 space-y-7 text-[15px] leading-relaxed text-foreground/90">
          {children}
        </div>
        <div className="mt-14 border-t border-border/60 pt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} {COMPANY.nameEn}. All rights reserved.
        </div>
      </main>
    </div>
  );
}

/** 문서 섹션 (제목 + 내용). */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-bold text-foreground">{title}</h2>
      <div className="space-y-1.5 text-muted-foreground">{children}</div>
    </section>
  );
}
