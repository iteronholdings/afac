import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import AdminCampaigns from "./pages/admin/AdminCampaigns";
import AdminMembers from "./pages/admin/AdminMembers";
import AdminParticipations from "./pages/admin/AdminParticipations";
import Campaigns from "./pages/Campaigns";
import Home from "./pages/Home";
import MyActivity from "./pages/MyActivity";
import Login from "./pages/Login";
import Signup from "./pages/Signup";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/login"} component={Login} />
      <Route path={"/signup"} component={Signup} />
      <Route path={"/campaigns"} component={Campaigns} />
      <Route path={"/my"} component={MyActivity} />
      <Route path={"/admin"} component={AdminCampaigns} />
      <Route path={"/admin/participations"} component={AdminParticipations} />
      <Route path={"/admin/members"} component={AdminMembers} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
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
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
