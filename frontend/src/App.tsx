import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { ToastProvider } from './components/ui/Toast'
import { EnrichmentPage } from './pages/EnrichmentPage'
import { FindLeadsPage } from './pages/FindLeadsPage'
import { OutreachPage } from './pages/OutreachPage'
import { SnapshotsPage } from './pages/SnapshotsPage'

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/leads" replace />} />
            <Route path="/leads" element={<FindLeadsPage />} />
            <Route path="/enrichment" element={<EnrichmentPage />} />
            <Route path="/enrichment/:snapshotId" element={<EnrichmentPage />} />
            <Route path="/outreach" element={<OutreachPage />} />
            <Route path="/snapshots" element={<SnapshotsPage />} />
            <Route path="*" element={<Navigate to="/leads" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}
