import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './screens/Login'
import WrongDomain from './screens/WrongDomain'
import NotEnrolled from './screens/NotEnrolled'
import Consent from './screens/Consent'
import StudentShell from './screens/StudentShell'
import InstructorHome from './screens/InstructorHome'

function LoadingScreen() {
  return (
    <div
      className="bg-blueprint"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-dim)',
        fontFamily: 'var(--font-mono)',
      }}
    >
      loading…
    </div>
  )
}

function Gate() {
  const { session, loading, linkStatus, profile } = useAuth()

  if (loading || session === undefined) return <LoadingScreen />
  if (!session) return <Login />
  if (linkStatus === 'wrong_domain') return <WrongDomain />
  if (linkStatus === 'consent_required') return <Consent />
  if (linkStatus === 'no_match' || linkStatus === 'unlinked_recorded') return <NotEnrolled />
  if (!profile) return <LoadingScreen />

  if (profile.role === 'instructor' || profile.role === 'admin') return <InstructorHome />
  return <StudentShell />
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<Gate />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
