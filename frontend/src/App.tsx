import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import PamojaShell from "./components/PamojaShell";
import { GroupProvider } from "./contexts/GroupContext";
import GroupsPage from "./pages/Groups";
import ContributionsPage from "./pages/Contributions";
import ReconciliationPage from "./pages/Reconciliation";
import RotationPage from "./pages/Rotation";
import PayoutsPage from "./pages/Payouts";
import LoansPage from "./pages/Loans";
import LedgerPage from "./pages/Ledger";
import SettingsPage from "./pages/Settings";
import SecurityPage from "./pages/Security";
import NotificationsPage from "./pages/Notifications";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"}>{() => <PamojaShell title="Overview" subtitle="A clear view of group activity and verified financial position"><Home /></PamojaShell>}</Route>
      <Route path={"/groups/new"}>{() => <PamojaShell title="Create a group" subtitle="Set up membership and contribution rules"><GroupsPage /></PamojaShell>}</Route>
      <Route path={"/contributions"}>{() => <PamojaShell title="Contributions" subtitle="Obligations, payments and reconciliation state"><ContributionsPage /></PamojaShell>}</Route>
      <Route path={"/reconciliation"}>{() => <PamojaShell title="Payment reconciliation" subtitle="Resolve provider-verified receipts that need review"><ReconciliationPage /></PamojaShell>}</Route>
      <Route path={"/rotation"}>{() => <PamojaShell title="Rotation schedule" subtitle="Collection progress and member payout order"><RotationPage /></PamojaShell>}</Route>
      <Route path={"/payouts"}>{() => <PamojaShell title="Payout approvals" subtitle="Governed requests; transfers remain disabled until a provider is approved"><PayoutsPage /></PamojaShell>}</Route>
      <Route path={"/loans"}>{() => <PamojaShell title="Loans" subtitle="Group lending foundation with eligibility and verified-funds gates"><LoansPage /></PamojaShell>}</Route>
      <Route path={"/ledger"}>{() => <PamojaShell title="Group ledger" subtitle="Append-only journal view of posted financial events"><LedgerPage /></PamojaShell>}</Route>
      <Route path={"/settings"}>{() => <PamojaShell title="Group settings" subtitle="Membership, contribution schedules and approval governance"><SettingsPage /></PamojaShell>}</Route>
      <Route path={"/profile/security"}>{() => <PamojaShell title="Security settings" subtitle="Authenticator enrolment and approval protection"><SecurityPage /></PamojaShell>}</Route>
      <Route path={"/notifications"}>{() => <PamojaShell title="Notifications" subtitle="In-app updates addressed to your account"><NotificationsPage /></PamojaShell>}</Route>
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <GroupProvider><Router /></GroupProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
