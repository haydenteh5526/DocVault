import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Settings as SettingsIcon, ShieldCheck, Trash2, Smartphone, Sun, Moon, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/auth'
import { setup2FA, disable2FA, deleteAccount, getProfile, updateProfile, exportDocuments } from '@/lib/api'
import { useToast } from '@/components/Toast'
import { useTheme } from '@/lib/theme'

type Tab = 'general' | 'account'

export default function Settings({ initialTab }: { initialTab?: Tab }) {
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => {
    if (initialTab) return initialTab
    const t = searchParams.get('tab')
    if (t === 'account') return t
    return 'general'
  })

  return (
    <div className="flex h-full w-full">
      {/* Settings sidebar */}
      <div className="w-56 shrink-0 border-r border-border/30 p-4">
        <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider px-3 mb-2">Settings</p>
        <nav className="space-y-0.5">
          <SettingsNavItem active={tab === 'general'} onClick={() => setTab('general')} icon={<SettingsIcon size={15} />} label="General" />
          <SettingsNavItem active={tab === 'account'} onClick={() => setTab('account')} icon={<ShieldCheck size={15} />} label="Account" />
        </nav>
      </div>

      {/* Settings content */}
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-2xl">
          {tab === 'general' && <GeneralSettings />}
          {tab === 'account' && <AccountSettings />}
        </div>
      </div>
    </div>
  )
}

function SettingsNavItem({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
        active ? 'bg-accent/80 text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function GeneralSettings() {
  const { toast } = useToast()
  const { theme, toggle } = useTheme()
  const [profile, setProfile] = useState<{ email: string; display_name: string | null; created_at: string } | null>(null)
  const [nameValue, setNameValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState<'json' | 'csv' | null>(null)

  async function handleExport(format: 'json' | 'csv') {
    setExporting(format)
    try {
      await exportDocuments(format)
      toast(`Exported your documents as ${format.toUpperCase()}`, 'success')
    } catch {
      toast('Export failed. Please try again.', 'error')
    } finally {
      setExporting(null)
    }
  }

  useEffect(() => {
    getProfile()
      .then(data => { setProfile(data); if (data?.display_name) setNameValue(data.display_name) })
      .catch(() => {})
  }, [])

  async function handleSaveName() {
    if (!nameValue.trim()) return
    setSaving(true)
    await updateProfile(nameValue.trim())
    setProfile(prev => prev ? { ...prev, display_name: nameValue.trim() } : null)
    setSaving(false)
    toast('Profile updated')
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">General</h2>
        <p className="text-sm text-muted-foreground mt-1">Manage your profile and preferences</p>
      </div>

      {/* Profile section */}
      <section>
        <h3 className="text-sm font-semibold mb-4">Profile</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Avatar</span>
            <div className="w-10 h-10 rounded-full gradient-bg flex items-center justify-center text-white text-sm font-bold shadow-sm">
              {(profile?.display_name || profile?.email || 'U')[0].toUpperCase()}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Full name</span>
            <div className="flex items-center gap-2">
              <Input
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveName() }}
                placeholder="Your name"
                className="h-8 w-48 text-sm text-right"
              />
              {nameValue !== (profile?.display_name || '') && (
                <Button size="sm" className="h-8 text-xs" onClick={handleSaveName} disabled={saving}>
                  {saving ? '...' : 'Save'}
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Email</span>
            <span className="text-sm">{profile?.email || '—'}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Joined</span>
            <span className="text-sm">{profile ? new Date(profile.created_at).toLocaleDateString('en-IE', { month: 'long', year: 'numeric' }) : '—'}</span>
          </div>
        </div>
      </section>

      <hr className="border-border/30" />

      {/* Preferences section */}
      <section>
        <h3 className="text-sm font-semibold mb-4">Preferences</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Appearance</span>
            <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1">
              <button onClick={() => { if (theme !== 'light') toggle() }} className={`p-2 rounded-md transition-colors ${theme === 'light' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                <Sun size={14} />
              </button>
              <button onClick={() => { if (theme !== 'dark') toggle() }} className={`p-2 rounded-md transition-colors ${theme === 'dark' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                <Moon size={14} />
              </button>
            </div>
          </div>
        </div>
      </section>

      <hr className="border-border/30" />

      {/* Data export section */}
      <section>
        <h3 className="text-sm font-semibold mb-1">Your data</h3>
        <p className="text-sm text-muted-foreground mb-4">Download a copy of all your documents — metadata and extracted text. Your data is never locked in.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport('json')} disabled={exporting !== null} aria-label="Export all documents as JSON">
            <Download size={14} className="mr-1.5" /> {exporting === 'json' ? 'Exporting…' : 'Export JSON'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('csv')} disabled={exporting !== null} aria-label="Export document list as CSV">
            <Download size={14} className="mr-1.5" /> {exporting === 'csv' ? 'Exporting…' : 'Export CSV'}
          </Button>
        </div>
      </section>
    </div>
  )
}

function AccountSettings() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [qr, setQr] = useState<string | null>(null)
  const [secret, setSecret] = useState('')
  const [twoFAEnabled, setTwoFAEnabled] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleSetup2FA() {
    const data = await setup2FA()
    setQr(data.qr_code)
    setSecret(data.secret)
    setTwoFAEnabled(true)
  }

  async function handleDisable2FA() {
    await disable2FA()
    setQr(null)
    setSecret('')
    setTwoFAEnabled(false)
    toast('2FA disabled')
  }

  async function handleDeleteAccount() {
    await deleteAccount()
    logout()
    navigate('/')
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Account</h2>
        <p className="text-sm text-muted-foreground mt-1">Security and account management</p>
      </div>

      {/* 2FA section */}
      <section>
        <h3 className="text-sm font-semibold mb-4">Two-Factor Authentication</h3>
        {!twoFAEnabled ? (
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              Add an extra layer of security with an authenticator app like Google Authenticator or Authy.
            </p>
            <Button onClick={handleSetup2FA} className="gradient-bg border-0 text-white">
              <Smartphone size={15} className="mr-1.5" /> Enable 2FA
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 rounded-lg p-3">
              <ShieldCheck size={16} /> 2FA is enabled
            </div>
            {qr && (
              <div className="flex flex-col items-center gap-3 py-4">
                <img src={qr} alt="2FA QR Code" className="w-40 h-40 rounded-lg border" />
                <p className="text-xs text-muted-foreground">Scan with your authenticator app</p>
                <code className="text-xs bg-muted px-3 py-1.5 rounded-md select-all">{secret}</code>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={handleDisable2FA}>Disable 2FA</Button>
          </div>
        )}
      </section>

      <hr className="border-border/30" />

      {/* Danger zone */}
      <section>
        <h3 className="text-sm font-semibold mb-4 text-destructive">Danger Zone</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Permanently delete your account and all documents. This cannot be undone.
        </p>
        {!confirmDelete ? (
          <Button variant="outline" size="sm" className="border-destructive/40 text-destructive hover:bg-destructive/5" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={14} className="mr-1.5" /> Delete account
          </Button>
        ) : (
          <div className="flex items-center gap-3">
            <Button variant="destructive" size="sm" onClick={handleDeleteAccount}>Yes, delete everything</Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          </div>
        )}
      </section>
    </div>
  )
}
