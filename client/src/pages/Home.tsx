import SiteHeader from "@/components/SiteHeader";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowRight,
  BadgeCheck,
  ClipboardList,
  Coins,
  LayoutDashboard,
  PenLine,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import { Link } from "wouter";
import BrandLogo from "@/components/BrandLogo";

const STEPS = [
  {
    icon: ClipboardList,
    title: "체험단 신청 · 구매",
    desc: "원하는 캠페인을 골라 신청하고\n상품을 구매합니다.",
  },
  {
    icon: PenLine,
    title: "리뷰 작성",
    desc: "상품을 사용해 본 뒤\n솔직한 리뷰를 등록합니다.",
  },
  {
    icon: BadgeCheck,
    title: "리뷰 확인",
    desc: "등록된 리뷰를 검수하여\n승인 여부를 확정합니다.",
  },
  {
    icon: Coins,
    title: "수수료 지급",
    desc: "확인이 완료되면\n수수료가 지급됩니다.",
  },
];

const CAMPAIGNS = [
  {
    tag: "뷰티",
    title: "수분 진정 토너패드",
    reward: "12,000원",
    price: "19,900원",
    slots: "선착순 40명",
    accent: "from-[oklch(0.93_0.05_175)] to-[oklch(0.95_0.04_150)]",
  },
  {
    tag: "리빙",
    title: "프리미엄 디퓨저 세트",
    reward: "15,000원",
    price: "29,000원",
    slots: "선착순 25명",
    accent: "from-[oklch(0.94_0.04_200)] to-[oklch(0.95_0.04_185)]",
  },
  {
    tag: "푸드",
    title: "유기농 곡물 그래놀라",
    reward: "8,000원",
    price: "14,500원",
    slots: "선착순 60명",
    accent: "from-[oklch(0.95_0.045_160)] to-[oklch(0.96_0.03_175)]",
  },
];

const FAQS = [
  {
    q: "수수료는 언제 지급되나요?",
    a: "작성하신 리뷰가 검수를 통과해 '확인 완료' 상태가 되면, 등록하신 정보로 수수료가 지급됩니다.",
  },
  {
    q: "리뷰는 어디에 작성하나요?",
    a: "캠페인 상세 페이지의 안내에 따라 지정된 채널에 리뷰를 작성한 뒤, 링크 또는 캡처를 제출하시면 됩니다.",
  },
  {
    q: "회원가입에는 어떤 정보가 필요한가요?",
    a: "아이디, 비밀번호, 성명, 전화번호만 입력하면 간단하게 가입할 수 있습니다.",
  },
];

function comingSoon() {
  // Placeholder action for not-yet-built campaign detail flow.
  import("sonner").then(({ toast }) =>
    toast.info("캠페인 상세 기능은 곧 제공될 예정입니다.")
  );
}

export default function Home() {
  const { isAuthenticated, user } = useAuth();

  return (
    <div className="min-h-screen bg-soft-gradient">
      <SiteHeader />

      {/* Hero */}
      <section className="container pb-16 pt-14 sm:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-balance text-4xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl">
            진심 어린 리뷰가
            <br />
            <span className="text-gradient">정당한 보상</span>이 됩니다
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            체험단을 신청하고 상품을 사용해 본 뒤 리뷰를 남겨 보세요.{" "}
            <br className="hidden sm:block" />
            리뷰가 확인되면 수수료를 지급해 드립니다.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {isAuthenticated ? (
              <>
                <a href="#campaigns">
                  <Button
                    size="lg"
                    className="h-12 rounded-full px-7 text-base font-semibold"
                  >
                    캠페인 둘러보기
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                </a>
                <span className="text-sm text-muted-foreground">
                  {user?.fullName || user?.name}님, 환영합니다.
                </span>
              </>
            ) : (
              <>
                <Link href="/signup">
                  <Button
                    size="lg"
                    className="h-12 rounded-full px-7 text-base font-semibold"
                  >
                    지금 시작하기
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/login">
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-12 rounded-full border-border bg-card px-7 text-base font-semibold"
                  >
                    로그인
                  </Button>
                </Link>
              </>
            )}
          </div>

          <div className="mt-7 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            안전한 정산 · 투명한 검수 절차
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="container scroll-mt-20 py-16">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            이렇게 진행됩니다
          </h2>
          <p className="mt-3 text-muted-foreground">
            신청부터 수수료 지급까지, 단 네 단계입니다.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, idx) => (
            <div
              key={step.title}
              className="group relative rounded-3xl border border-border/70 bg-card/80 p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md"
            >
              <span className="absolute right-5 top-5 text-sm font-bold text-muted-foreground/40">
                0{idx + 1}
              </span>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <step.icon className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-lg font-bold text-foreground">
                {step.title}
              </h3>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Campaigns - 로그인한 사용자에게만 노출 */}
      {isAuthenticated && (
      <section id="campaigns" className="container scroll-mt-20 py-16">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              진행 중인 캠페인
            </h2>
            <p className="mt-3 text-muted-foreground">
              마음에 드는 상품을 골라 리뷰어로 참여해 보세요.
            </p>
          </div>
          <Button
            variant="ghost"
            className="font-medium text-primary"
            onClick={comingSoon}
          >
            전체 보기
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {CAMPAIGNS.map(c => (
            <div
              key={c.title}
              className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm transition-all hover:-translate-y-1 hover:shadow-md"
            >
              <div
                className={`relative flex h-40 items-center justify-center bg-gradient-to-br ${c.accent}`}
              >
                <ShoppingBag className="h-12 w-12 text-foreground/30" />
                <Badge className="absolute left-4 top-4 rounded-full bg-card/90 text-foreground hover:bg-card/90">
                  {c.tag}
                </Badge>
              </div>
              <div className="p-5">
                <h3 className="text-lg font-bold text-foreground">{c.title}</h3>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">상품가</span>
                  <span className="font-medium text-foreground">{c.price}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">리뷰 수수료</span>
                  <span className="font-bold text-primary">{c.reward}</span>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    {c.slots}
                  </span>
                  <Button
                    size="sm"
                    className="rounded-full font-semibold"
                    onClick={comingSoon}
                  >
                    신청하기
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
      )}

      {/* CTA banner */}
      <section className="container py-12">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-[oklch(0.55_0.12_165)] px-8 py-12 text-center text-primary-foreground shadow-lg sm:px-12">
          <h2 className="text-2xl font-bold sm:text-3xl">
            지금 바로 리뷰어로 시작하세요
          </h2>
          <p className="mx-auto mt-3 max-w-md text-primary-foreground/85">
            가입은 1분이면 충분합니다.
            <br className="hidden sm:block" />
            아이디와 간단한 정보만 입력하면 됩니다.
          </p>
          {!isAuthenticated && (
            <Link href="/signup">
              <Button
                size="lg"
                variant="secondary"
                className="mt-7 h-12 rounded-full bg-card px-8 text-base font-semibold text-foreground hover:bg-card/90"
              >
                무료로 회원가입
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="container scroll-mt-20 py-16">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-8 text-center text-3xl font-bold tracking-tight text-foreground">
            자주 묻는 질문
          </h2>
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((faq, idx) => (
              <AccordionItem
                key={idx}
                value={`item-${idx}`}
                className="rounded-2xl border border-border/70 bg-card/70 mb-3 px-5"
              >
                <AccordionTrigger className="text-left text-base font-semibold hover:no-underline">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60 bg-card/40">
        <div className="container flex flex-col items-center justify-between gap-4 py-8 sm:flex-row">
          <BrandLogo size={28} textClassName="text-base" />
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-6">
            {user?.role === "admin" && (
              <Link href="/admin">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary/80">
                  <LayoutDashboard className="h-4 w-4" />
                  관리자 대시보드
                </span>
              </Link>
            )}
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} ARVEN FACTORY. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
