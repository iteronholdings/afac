import BrandLogo from "@/components/BrandLogo";
import KakaoInquiryButton from "@/components/KakaoInquiryButton";
import { COMPANY } from "@/lib/company";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  CheckCircle2,
  Headphones,
  LayoutDashboard,
  MessageCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

const STATS = [
  { emoji: "⭐", value: "50,000+", label: "완료된 리뷰 수" },
  { emoji: "🤝", value: "800+", label: "파트너 광고주" },
  { emoji: "👥", value: "2,500+", label: "리뷰어 & 체험단" },
  { emoji: "🛡️", value: "0%", label: "블라인드 제재" },
];

const COMPARE: { label: string; agency: string; us: string }[] = [
  { label: "수수료", agency: "15~30%", us: "0%" },
  { label: "어뷰징 방지", agency: "보장 없음", us: "0% 보장" },
  { label: "진행 확인", agency: "메일/전화", us: "실시간 대시보드" },
  { label: "소통", agency: "담당자 부재 잦음", us: "전담 실무자 1:1" },
  { label: "A/S", agency: "유료 / 기간 제한", us: "평생 무료" },
];

const PROMISES = [
  "10년 이상 어뷰징 0%",
  "NO 블라인드",
  "페이드 리뷰어 모집 X",
  "평생 A/S 보장",
  "제품 비용 부담 없이 리뷰 OK",
  "연중무휴 운영",
  "세금계산서 발행 가능",
  "실행사이니까 가능한 저렴한 비용",
];

const FEATURES = [
  { icon: LayoutDashboard, title: "실시간 현황 대시보드", desc: "구매 진행률, 리뷰 현황, 캠페인별 상세 정보를 즉시 확인하세요." },
  { icon: MessageCircle, title: "셀러–실무자 다이렉트 소통", desc: "전담 실무자와 1:1 소통, 빠른 피드백, 핫라인 운영." },
  { icon: Headphones, title: "연중무휴, 언제든 맡겨주세요", desc: "365일 상담 가능, 긴급 시 1시간 내 처리, 주말 추가비용 없음." },
];

const STEPS = [
  { emoji: "🐻", title: "회원가입", desc: "필요하면 문의 후 진행 가능" },
  { emoji: "💰", title: "크레딧 충전", desc: "수수료 0% 투명한 충전" },
  { emoji: "🚀", title: "캠페인 실행", desc: "검증된 체험단으로 안전 진행" },
  { emoji: "📊", title: "실시간 확인", desc: "대시보드로 결과 모니터링" },
];

const FAQS = [
  { q: "정말 어뷰징이 0%인가요?", a: "검증된 실유저 체험단만 운영하며, 매크로·페이드 리뷰어를 일절 모집하지 않습니다. 그래서 블라인드 제재 이력이 0%입니다." },
  { q: "대행사와 실행사의 차이가 뭔가요?", a: "대행사는 외주를 다시 외주로 넘기지만, 아르벤은 직접 실행합니다. 그래서 수수료가 낮고 진행이 투명합니다." },
  { q: "진행 상황을 어떻게 확인하나요?", a: "업체 전용 대시보드에서 캠페인별 진행률·리뷰 현황·인증샷을 실시간으로 확인할 수 있습니다." },
  { q: "수수료가 정말 없나요?", a: "입금 대행 수수료는 0%이며, 1건당 리뷰 진행 수수료와 택배 발송 수수료만 투명하게 청구됩니다." },
  { q: "A/S는 어떻게 진행되나요?", a: "진행한 캠페인은 평생 무료로 A/S를 지원합니다. 기간 제한이 없습니다." },
];

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link href="/">
          <BrandLogo size={36} textClassName="text-base" />
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/client/login">
            <Button variant="ghost" className="font-medium">업체 로그인</Button>
          </Link>
          <Link href="/client/signup">
            <Button className="rounded-full font-semibold">업체 시작하기</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen(o => !o)}
      className="w-full rounded-2xl border border-border/70 bg-card px-5 py-4 text-left transition-colors hover:bg-secondary/40"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-bold text-foreground">{q}</span>
        <span className={`text-primary transition-transform ${open ? "rotate-45" : ""}`}>＋</span>
      </div>
      {open && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a}</p>}
    </button>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-16 -top-16 h-72 w-72 rounded-full bg-primary/10 blur-2xl" />
        <div className="pointer-events-none absolute -right-10 top-32 h-56 w-56 rounded-full bg-accent/40 blur-2xl" />
        <div className="container relative py-20 text-center sm:py-28">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm font-bold text-primary">
            <Sparkles className="h-4 w-4" /> 체험단 리뷰 마케팅의 새로운 기준 🐻
          </span>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-extrabold leading-tight text-foreground sm:text-5xl">
            쿠팡·네이버 체험단,<br />
            <span className="text-primary">안전하게 직접</span> 실행합니다
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
            누적리뷰 5만건 · 대행수수료 0% · 연중무휴 운영.<br className="hidden sm:block" />
            실시간 대시보드로 진행 상황을 직접 확인하세요.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/client/signup">
              <Button size="lg" className="gap-1.5 rounded-full px-7 text-base font-bold">
                업체로 시작하기 <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/client/login">
              <Button size="lg" variant="outline" className="gap-1.5 rounded-full bg-card px-7 text-base font-bold">
                <MessageCircle className="h-4 w-4" /> 업체 로그인
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-sm text-primary">💡 상담 없이도 바로 캠페인 신청이 가능해요!</p>
        </div>
      </section>

      {/* Stats */}
      <section className="container -mt-4 pb-16">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {STATS.map(s => (
            <div key={s.label} className="rounded-3xl border border-border/70 bg-card p-6 text-center shadow-sm">
              <div className="text-2xl">{s.emoji}</div>
              <p className="mt-2 text-3xl font-extrabold text-primary">{s.value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison */}
      <section className="bg-secondary/40 py-20">
        <div className="container">
          <h2 className="text-center text-2xl font-extrabold text-foreground sm:text-3xl">
            대행사 vs 실행사(아르벤), 뭐가 다를까요?
          </h2>
          <div className="mx-auto mt-8 max-w-3xl overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm">
            <div className="grid grid-cols-3 border-b border-border/60 bg-muted/40 px-5 py-3 text-sm font-bold">
              <span className="text-muted-foreground">항목</span>
              <span className="text-center text-muted-foreground">일반 대행사</span>
              <span className="text-center text-primary">아르벤팩토리</span>
            </div>
            {COMPARE.map((row, i) => (
              <div key={row.label} className={`grid grid-cols-3 items-center px-5 py-4 text-sm ${i % 2 ? "bg-secondary/20" : ""}`}>
                <span className="font-semibold text-foreground">{row.label}</span>
                <span className="text-center text-muted-foreground line-through decoration-destructive/40">{row.agency}</span>
                <span className="text-center font-bold text-primary">{row.us}</span>
              </div>
            ))}
          </div>

          {/* Promises checklist */}
          <div className="mx-auto mt-10 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
            {PROMISES.map(p => (
              <div key={p} className="flex items-center gap-2.5 rounded-2xl border border-border/70 bg-card px-4 py-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                <span className="text-sm font-semibold text-foreground">{p}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container py-20">
        <h2 className="text-center text-2xl font-extrabold text-foreground sm:text-3xl">
          아르벤은 언제나 일하고 있어요 🐻
        </h2>
        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
          {FEATURES.map(f => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="rounded-3xl border border-border/70 bg-card p-6 text-center shadow-sm">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mt-4 font-bold text-foreground">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Process */}
      <section className="bg-secondary/40 py-20">
        <div className="container">
          <h2 className="text-center text-2xl font-extrabold text-foreground sm:text-3xl">진행 방법</h2>
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <div key={s.title} className="relative rounded-3xl border border-border/70 bg-card p-6 text-center shadow-sm">
                <span className="absolute right-4 top-4 text-xs font-bold text-muted-foreground/50">0{i + 1}</span>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-2xl">{s.emoji}</div>
                <h3 className="mt-4 font-bold text-foreground">{s.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="container py-20">
        <h2 className="text-center text-2xl font-extrabold text-foreground sm:text-3xl">투명한 가격, 숨겨진 비용 없음</h2>
        <p className="mt-2 text-center text-sm font-bold text-primary">VAT 포함 | 세금계산서 발행 | 평생 A/S</p>
        <div className="mx-auto mt-8 max-w-md overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm">
          {[
            ["입금대행 수수료", "0%", true],
            ["1건당 리뷰 진행 수수료", "2,400원", false],
            ["택배 발송료", "2,300원", false],
          ].map(([label, value, free]) => (
            <div key={label as string} className="flex items-center justify-between border-b border-border/60 px-5 py-4 last:border-0">
              <span className="font-bold text-foreground">{label}</span>
              <span className={`text-lg font-extrabold ${free ? "text-primary" : "text-foreground"}`}>{value}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">* 모든 수수료는 VAT 포함 금액입니다.</p>
        <div className="mt-6 text-center">
          <Link href="/client/signup">
            <Button size="lg" className="gap-1.5 rounded-full px-8 font-bold">
              지금 시작하기 <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-secondary/40 py-20">
        <div className="container max-w-3xl">
          <h2 className="text-center text-2xl font-extrabold text-foreground sm:text-3xl">자주 묻는 질문</h2>
          <div className="mt-8 space-y-3">
            {FAQS.map(f => <FaqItem key={f.q} {...f} />)}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container py-20">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary/80 p-10 text-center text-primary-foreground shadow-[0_16px_40px_-16px_var(--primary)]">
          <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -left-6 bottom-0 h-28 w-28 rounded-full bg-white/10" />
          <div className="relative">
            <h2 className="text-2xl font-extrabold sm:text-3xl">우리 상품, 상단에 올릴 준비 되셨나요?</h2>
            <p className="mt-2 text-primary-foreground/85">아르벤팩토리와 함께 안전하게 시작하세요.</p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/client/signup">
                <Button size="lg" className="gap-1.5 rounded-full bg-white px-7 font-bold text-primary hover:bg-white/90">
                  업체로 시작하기 <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/client/login">
                <Button size="lg" variant="outline" className="rounded-full border-white/40 bg-transparent px-7 font-bold text-white hover:bg-white/10">
                  업체 로그인
                </Button>
              </Link>
              <KakaoInquiryButton label="카카오톡 문의하기" className="h-11 px-7 text-base" />
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60 bg-card">
        <div className="container flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <BrandLogo size={30} textClassName="text-sm" />
            <p className="mt-2 text-sm text-muted-foreground">이커머스 셀러의 성장 동력, 아르벤팩토리</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" /> 어뷰징 0% · 평생 A/S · 세금계산서 발행
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <KakaoInquiryButton size="sm" label="카카오톡 문의하기" />
            <nav className="flex items-center gap-4 text-sm font-medium">
              <Link href="/privacy" className="text-muted-foreground transition-colors hover:text-foreground">개인정보처리방침</Link>
              <span className="text-border">|</span>
              <Link href="/refund" className="text-muted-foreground transition-colors hover:text-foreground">환불규정</Link>
            </nav>
          </div>
        </div>
        <div className="space-y-1.5 border-t border-border/50 py-4 text-center text-xs text-muted-foreground">
          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 px-4">
            <span>상호: {COMPANY.name}</span>
            <span className="text-border">|</span>
            <span>대표: {COMPANY.ceo}</span>
            <span className="text-border">|</span>
            <span>사업자등록번호: {COMPANY.bizNo}</span>
            {!COMPANY.mailOrderNo.startsWith("[") && (
              <>
                <span className="text-border">|</span>
                <span>통신판매업: {COMPANY.mailOrderNo}</span>
              </>
            )}
          </p>
          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 px-4">
            <span>{COMPANY.address}</span>
            <span className="text-border">|</span>
            <span>고객센터: {COMPANY.email}</span>
            {!COMPANY.tel.startsWith("[") && (
              <>
                <span className="text-border">|</span>
                <span>{COMPANY.tel}</span>
              </>
            )}
          </p>
          <p>© {new Date().getFullYear()} {COMPANY.nameEn}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
