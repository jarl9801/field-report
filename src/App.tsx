import { useEffect } from 'react'
import { useAppStore } from './store/appStore'
import { useSync } from './hooks/useSync'
import { StatusBar } from './components/layout/StatusBar'
import { PinEntry } from './components/ui/PinEntry'
import { MemberSelect } from './components/ui/MemberSelect'
import { TechView } from './components/views/TechView'
import { CitasScreen } from './components/citas/CitasScreen'
import { AdminView } from './components/views/AdminView'
import { HistoryView } from './components/views/HistoryView'
import { Toast } from './components/ui/Toast'
import { Modal } from './components/ui/Modal'
import { migrateOldDBs } from './lib/db'

export function App() {
  const view = useAppStore((s) => s.view)
  const loadConfig = useAppStore((s) => s.loadConfig)
  const loadSubmissions = useAppStore((s) => s.loadSubmissions)
  const addToast = useAppStore((s) => s.addToast)

  useSync()

  useEffect(() => {
    void loadConfig()
    void loadSubmissions()
    // One-time migration from old DBs
    void migrateOldDBs().then((n) => {
      if (n > 0) addToast(`Migrated ${n} submissions from old database`, 'info')
    })
  }, [loadConfig, loadSubmissions, addToast])

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <StatusBar />
      <main className="flex-1 overflow-y-auto">
        <div className="animate-fade-in">
          {view === 'pin' && <PinEntry />}
          {view === 'member' && <MemberSelect />}
          {view === 'citas' && <CitasScreen />}
          {view === 'form' && <TechView />}
          {view === 'history' && <HistoryView />}
          {view === 'admin' && <AdminView />}
        </div>
      </main>
      <Toast />
      <Modal />
    </div>
  )
}
