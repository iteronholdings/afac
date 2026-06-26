import ChatNotifier from "@/components/ChatNotifier";
import FloatingChat from "@/components/FloatingChat";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import AdminBusinesses from "./pages/admin/AdminBusinesses";
import AdminCampaigns from "./pages/admin/AdminCampaigns";
import AdminConsulting from "./pages/admin/AdminConsulting";
import AdminMembers from "./pages/admin/AdminMembers";
import AdminParticipations from "./pages/admin/AdminParticipations";
import AdminSettlement from "./pages/admin/AdminSettlement";
import BusinessDashboard from "./pages/business/BusinessDashboard";
import ClientLogin from "./pages/client/ClientLogin";
import ClientSignup from "./pages/client/ClientSignup";
import ClientHome from "./pages/client/ClientHome";
import ClientConsulting from "./pages/client/ClientConsulting";
import ClientDeposit from "./pages/client/ClientDeposit";
import CampaignWizard from "./pages/client/CampaignWizard";
import Campaigns from "./pages/Campaigns";
import Home from "./pages/Home";
import Landing from "./pages/Landing";
import MyActivity from "./pages/MyActivity";
import ReviewerOnboarding from "./pages/ReviewerOnboarding";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import { useAuth } from "./_core/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

function ProtectedRoute({ component: Component, loginPath = "/afreviewer/login" }: { component: React.ComponentType; loginPath?: string }) {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate(loginPath);
    }
  }, [loading, isAuthenticated, navigate, loginPath]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

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

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) { navigate("/afreviewer/login"); return; }
    if (needsOnboarding) navigate("/onboarding");
  }, [loading, isAuthenticated, needsOnboarding, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated || needsOnboarding) return null;

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/afreviewer" component={() => <Redirect to="/afreviewer/login" />} />
      <Route path="/afreviewer/login" component={Login} />
      <Route path="/afreviewer/signup" component={Signup} />
      <Route path="/" component={Landing} />
      <Route path="/onboarding" component={() => <ProtectedRoute component={ReviewerOnboarding} />} />
      <Route path="/home" component={() => <ReviewerRoute component={Home} />} />
      <Route path="/campaigns" component={() => <ReviewerRoute component={Campaigns} />} />
      <Route path="/my" component={() => <ReviewerRoute component={MyActivity} />} />
      <Route path="/business" component={() => <ProtectedRoute component={BusinessDashboard} />} />
      <Route path="/client" component={() => <Redirect to="/client/login" />} />
      <Route path="/client/login" component={ClientLogin} />
      <Route path="/client/signup" component={ClientSignup} />
      <Route path="/client/dashboard" component={() => <ProtectedRoute component={ClientHome} loginPath="/client/login" />} />
      <Route path="/client/campaigns" component={() => <ProtectedRoute component={BusinessDashboard} loginPath="/client/login" />} />
      <Route path="/client/campaign/new" component={() => <ProtectedRoute component={CampaignWizard} loginPath="/client/login" />} />
      <Route path="/client/consulting" component={() => <ProtectedRoute component={ClientConsulting} loginPath="/client/login" />} />
      <Route path="/client/deposit" component={() => <ProtectedRoute component={ClientDeposit} loginPath="/client/login" />} />
      <Route path="/admin" component={() => <ProtectedRoute component={AdminCampaigns} />} />
      <Route path="/admin/participations" component={() => <ProtectedRoute component={AdminParticipations} />} />
      <Route path="/admin/settlement" component={() => <ProtectedRoute component={AdminSettlement} />} />
      <Route path="/admin/consulting" component={() => <ProtectedRoute component={AdminConsulting} />} />
      <Route path="/admin/businesses" component={() => <ProtectedRoute component={AdminBusinesses} />} />
      <Route path="/admin/members" component={() => <ProtectedRoute component={AdminMembers} />} />
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
          <FloatingChat />
          <ChatNotifier />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
