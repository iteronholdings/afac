import ChatNotifier from "@/components/ChatNotifier";
import FloatingChat from "@/components/FloatingChat";
import PushPrompt from "@/components/PushPrompt";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import AdminBusinesses from "./pages/admin/AdminBusinesses";
import AdminBusinessChats from "./pages/admin/AdminBusinessChats";
import AdminCampaigns from "./pages/admin/AdminCampaigns";
import AdminConsulting from "./pages/admin/AdminConsulting";
import AdminMessages from "./pages/admin/AdminMessages";
import AdminMembers from "./pages/admin/AdminMembers";
import AdminParticipations from "./pages/admin/AdminParticipations";
import AdminSettlement from "./pages/admin/AdminSettlement";
import BusinessDashboard from "./pages/business/BusinessDashboard";
import ClientLogin from "./pages/client/ClientLogin";
import ClientSignup from "./pages/client/ClientSignup";
import ClientHome from "./pages/client/ClientHome";
import ClientConsulting from "./pages/client/ClientConsulting";
import ClientDeposit from "./pages/client/ClientDeposit";
import ClientMessages from "./pages/client/ClientMessages";
import CampaignWizard from "./pages/client/CampaignWizard";
import Campaigns from "./pages/Campaigns";
import Home from "./pages/Home";
import Landing from "./pages/Landing";
import Privacy from "./pages/Privacy";
import Refund from "./pages/Refund";
import MyActivity from "./pages/MyActivity";
import MyProfile from "./pages/MyProfile";
import ReviewerMessages from "./pages/ReviewerMessages";
import ReviewerOnboarding from "./pages/ReviewerOnboarding";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import { useAuth } from "./_core/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

/** 로그인한 사용자를 자신의 포털 홈으로 보내는 경로. */
function homeFor(role?: string) {
  return role === "business" ? "/client/dashboard" : role === "admin" ? "/admin" : "/home";
}

function ProtectedRoute({
  component: Component,
  loginPath = "/afreviewer/login",
  role,
}: {
  component: React.ComponentType;
  loginPath?: string;
  /** 요구 역할. 지정 시 해당 역할(또는 admin 슈퍼유저)만 접근. admin 라우트는 admin만. */
  role?: "business" | "admin";
}) {
  const { user, isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();

  // 역할 검증: 요구 역할과 같거나, (admin 전용이 아니면) admin이면 통과.
  const roleOk = !role || !user || user.role === role || (role !== "admin" && user.role === "admin");

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) { navigate(loginPath); return; }
    if (!roleOk && user) navigate(homeFor(user.role));
  }, [loading, isAuthenticated, roleOk, user, navigate, loginPath]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated || !roleOk) return null;

  return <Component />;
}

/**
 * 리뷰어 전용 가드: 로그인 + '절차 안내 동의' 완료까지 요구한다.
 * 미동의 리뷰어는 /onboarding 으로 보내 활동을 막는다. (업체/관리자는 그대로 통과)
 */
function ReviewerRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();

  const needsOnboarding = user?.role === "user" && !user.reviewerAgreedAt;
  // 업체 계정은 리뷰어 페이지 접근 불가(자기 포털로). 관리자는 슈퍼유저로 허용.
  const wrongRole = user?.role === "business";

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) { navigate("/afreviewer/login"); return; }
    if (wrongRole && user) { navigate(homeFor(user.role)); return; }
    if (needsOnboarding) navigate("/onboarding");
  }, [loading, isAuthenticated, wrongRole, user, needsOnboarding, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated || wrongRole || needsOnboarding) return null;

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/afreviewer" component={() => <Redirect to="/afreviewer/login" />} />
      <Route path="/afreviewer/login" component={Login} />
      <Route path="/afreviewer/signup" component={Signup} />
      <Route path="/" component={Landing} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/refund" component={Refund} />
      <Route path="/onboarding" component={() => <ProtectedRoute component={ReviewerOnboarding} />} />
      <Route path="/home" component={() => <ReviewerRoute component={Home} />} />
      <Route path="/campaigns" component={() => <ReviewerRoute component={Campaigns} />} />
      <Route path="/my" component={() => <ReviewerRoute component={MyActivity} />} />
      <Route path="/profile" component={() => <ProtectedRoute component={MyProfile} />} />
      <Route path="/messages" component={() => <ReviewerRoute component={ReviewerMessages} />} />
      <Route path="/business" component={() => <ProtectedRoute component={BusinessDashboard} loginPath="/client/login" role="business" />} />
      <Route path="/client" component={() => <Redirect to="/client/login" />} />
      <Route path="/client/login" component={ClientLogin} />
      <Route path="/client/signup" component={ClientSignup} />
      <Route path="/client/dashboard" component={() => <ProtectedRoute component={ClientHome} loginPath="/client/login" role="business" />} />
      <Route path="/client/messages" component={() => <ProtectedRoute component={ClientMessages} loginPath="/client/login" role="business" />} />
      <Route path="/client/campaigns" component={() => <ProtectedRoute component={BusinessDashboard} loginPath="/client/login" role="business" />} />
      <Route path="/client/campaign/new" component={() => <ProtectedRoute component={CampaignWizard} loginPath="/client/login" role="business" />} />
      <Route path="/client/consulting" component={() => <ProtectedRoute component={ClientConsulting} loginPath="/client/login" role="business" />} />
      <Route path="/client/deposit" component={() => <ProtectedRoute component={ClientDeposit} loginPath="/client/login" role="business" />} />
      <Route path="/admin" component={() => <ProtectedRoute component={AdminCampaigns} role="admin" />} />
      <Route path="/admin/participations" component={() => <ProtectedRoute component={AdminParticipations} role="admin" />} />
      <Route path="/admin/settlement" component={() => <ProtectedRoute component={AdminSettlement} role="admin" />} />
      <Route path="/admin/messages" component={() => <ProtectedRoute component={AdminMessages} role="admin" />} />
      <Route path="/admin/business-chats" component={() => <ProtectedRoute component={AdminBusinessChats} role="admin" />} />
      <Route path="/admin/consulting" component={() => <ProtectedRoute component={AdminConsulting} role="admin" />} />
      <Route path="/admin/businesses" component={() => <ProtectedRoute component={AdminBusinesses} role="admin" />} />
      <Route path="/admin/members" component={() => <ProtectedRoute component={AdminMembers} role="admin" />} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster position="top-center" richColors />
          <Router />
          <ChatNotifier />
          {/* 운영팀↔리뷰어 1:1 채팅 FAB (업체는 카카오 채널 사용) */}
          <FloatingChat />
          <PushPrompt />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
