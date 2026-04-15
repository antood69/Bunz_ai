import { Switch, Route, Router, Redirect } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import AgentsPage from "@/pages/AgentsPage";
import AgentChatPage from "@/pages/AgentChatPage";
import AuditPage from "@/pages/AuditPage";
import PricingPage from "@/pages/PricingPage";
import SettingsPage from "@/pages/SettingsPage";
import TokenUsagePage from "@/pages/TokenUsagePage";
import LoginPage from "@/pages/LoginPage";
import AdminPage from "@/pages/AdminPage";
import ToolsPage from "@/pages/ToolsPage";
import ConnectorsPage from "@/pages/ConnectorsPage";
import BossPage from "@/pages/BossPage";
import AnalyticsStubPage from "@/pages/AnalyticsStubPage";
import NotificationsPage from "@/pages/NotificationsPage";
import TasksPage from "@/pages/TasksPage";
import WorkflowsPage from "@/pages/WorkflowsPage";
import EditorPage from "@/pages/EditorPage";
import BotsPage from "@/pages/BotsPage";
import WorkshopPage from "@/pages/WorkshopPage";
import ServicesPage from "@/pages/ServicesPage";
import AppLayout from "@/components/AppLayout";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

function AppRouter() {
  return (
    <Switch>
      {/* Public routes — no AppLayout */}
      <Route path="/login" component={LoginPage} />

      {/* Protected routes */}
      <Route>
        <AppLayout>
          <ErrorBoundary>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/boss" component={BossPage} />
            {/* workflows removed */}

            <Route path="/agents" component={AgentsPage} />
            <Route path="/agents/:id/chat" component={AgentChatPage} />
            <Route path="/audit" component={AuditPage} />
            <Route path="/settings">{() => <SettingsPage />}</Route>
            <Route path="/admin" component={AdminPage} />
            <Route path="/connectors" component={ConnectorsPage} />
            <Route path="/tools" component={ToolsPage} />
            <Route path="/tasks" component={TasksPage} />
            <Route path="/workflows" component={WorkflowsPage} />
            <Route path="/editor" component={EditorPage} />
            <Route path="/bots" component={BotsPage} />
            <Route path="/workshop" component={WorkshopPage} />
            <Route path="/services" component={ServicesPage} />


            {/* Redirects */}
            <Route path="/customize">{() => <Redirect to="/settings?tab=appearance" />}</Route>
            <Route path="/pricing">{() => <Redirect to="/settings?tab=pricing" />}</Route>
            <Route path="/usage">{() => <Redirect to="/settings?tab=usage" />}</Route>

            <Route path="/analytics" component={AnalyticsStubPage} />
            <Route path="/notifications" component={NotificationsPage} />
            <Route component={NotFound} />
          </Switch>
          </ErrorBoundary>
        </AppLayout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router hook={useHashLocation}>
            <AppRouter />
          </Router>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
