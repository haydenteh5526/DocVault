import { useEffect, useId, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Settings as SettingsIcon, ShieldCheck, Trash2, Smartphone, Download, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/auth'
import {
  ApiError,
  addHousemate,
  confirm2FA,
  deleteAccount,
  disable2FA,
  exportDocuments,
  getProfile,
  removeHousemate,
  saveHouseholdPreferences,
  setup2FA,
  updateProfile,
  type HouseholdPreferences,
} from '@/lib/api'
import { ASSISTANT_NAME } from '@/lib/assistant'
import { storeHousemates } from '@/lib/billSplit'
import { useHousemates } from '@/lib/housemates'
import { householdPreferencesKey, useHouseholdPreferences } from '@/lib/householdPreferences'
import { useToast } from '@/components/Toast'
import { useTheme } from '@/lib/theme'

type Tab = 'general' | 'household' | 'account'

export default function Settings({ initialTab }: { initialTab?: Tab }) {
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => {
    if (initialTab) return initialTab
    const t = searchParams.get('tab')
    if (t === 'account' || t === 'household') return t
    return 'general'
  })

  return (
    <div className="flex h-full w-full">
      {/* Settings sidebar */}
      <div className="w-56 shrink-0 border-r border-border/30 p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2">Settings</p>
        <nav className="space-y-0.5">
          <SettingsNavItem active={tab === 'general'} onClick={() => setTab('general')} icon={<SettingsIcon size={15} />} label="General" />
          <SettingsNavItem active={tab === 'household'} onClick={() => setTab('household')} icon={<Home size={15} />} label="Household" />
          <SettingsNavItem active={tab === 'account'} onClick={() => setTab('account')} icon={<ShieldCheck size={15} />} label="Account" />
        </nav>
      </div>

      {/* Settings content */}
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-2xl">
          {tab === 'general' && <GeneralSettings />}
          {tab === 'household' && <HouseholdSettings />}
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
  const { mode, setPreference } = useTheme()
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
    <div className="space-y-8">
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
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold shadow-sm">
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
            <select aria-label="Appearance" value={mode} onChange={e => setPreference(e.target.value as typeof mode)} className="h-10 rounded-md border border-input bg-background px-2">
              <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
            </select>
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

const MAX_LABEL_LENGTH = 40
const DAYS_MESSAGE = 'Enter a number of days from 0 to 60.'

function HouseholdSettings() {
  const preferences = useHouseholdPreferences()

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Household</h2>
        <p className="text-sm text-muted-foreground mt-1">Who you share bills with, and how {ASSISTANT_NAME} helps</p>
      </div>

      <HousemateList />

      <hr className="border-border/30" />

      <section aria-labelledby="household-preferences-heading">
        <h3 id="household-preferences-heading" className="text-sm font-semibold mb-4">Reminders and splits</h3>
        {preferences.isError ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Could not load your household settings.</p>
            <Button variant="outline" size="sm" onClick={() => void preferences.refetch()}>Try again</Button>
          </div>
        ) : preferences.data ? (
          <PreferencesForm initial={preferences.data} />
        ) : (
          <p className="text-sm text-muted-foreground">Loading your household settings…</p>
        )}
      </section>
    </div>
  )
}

function HousemateList() {
  const { accountId } = useAuth()
  const queryClient = useQueryClient()
  const housemates = useHousemates(true)
  const nameId = useId()
  const [newName, setNewName] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<string[]>([])

  async function add(event: FormEvent) {
    event.preventDefault()
    const label = newName.trim()
    if (!label) return setMessage('Enter a name.')
    if ([...label].length > MAX_LABEL_LENGTH) return setMessage('Use 40 characters or fewer.')
    setAdding(true)
    setMessage(null)
    try {
      const created = await addHousemate(label)
      storeHousemates(queryClient, accountId, list => [...list, created])
      setNewName('')
    } catch (error) {
      const code = error instanceof ApiError ? error.code : undefined
      setMessage(
        code === 'duplicate_label' ? 'That name is already in your list.'
          : code === 'too_many_housemates' ? 'You can save up to 12 housemates.'
            : 'Could not add that name. Try again.',
      )
    } finally {
      setAdding(false)
    }
  }

  async function remove(id: string) {
    if (removing.includes(id)) return
    setRemoving(ids => [...ids, id])
    setMessage(null)
    try {
      try {
        await removeHousemate(id)
      } catch (error) {
        // Already removed (in another tab, say): the list only needs to catch up.
        if (!(error instanceof ApiError && error.status === 404)) throw error
      }
      storeHousemates(queryClient, accountId, list => list.filter(h => h.id !== id))
    } catch {
      setMessage('Could not remove that name. Try again.')
    } finally {
      setRemoving(ids => ids.filter(other => other !== id))
    }
  }

  return (
    <section aria-labelledby="housemates-heading">
      <h3 id="housemates-heading" className="text-sm font-semibold mb-4">People you live with</h3>
      <div className="space-y-2">
        {housemates.isError && <p className="text-sm text-muted-foreground">Your housemates could not be loaded.</p>}
        {housemates.isPending && !housemates.isError && <p className="text-sm text-muted-foreground">Loading your housemates…</p>}
        {housemates.data?.length === 0 && <p className="text-sm text-muted-foreground">Add the people who share your bills.</p>}
        {housemates.data && housemates.data.length > 0 && (
          <ul className="divide-y">
            {housemates.data.map(h => (
              <li key={h.id} className="flex items-center justify-between py-2 text-sm">
                <span>{h.label}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${h.label}`}
                  disabled={removing.includes(h.id)}
                  onClick={() => void remove(h.id)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-4 space-y-2">
        <label htmlFor={nameId} className="text-sm text-muted-foreground">Add a housemate</label>
        <form className="flex gap-2" onSubmit={add}>
          <Input id={nameId} value={newName} onChange={event => setNewName(event.target.value)} />
          <Button type="submit" size="sm" variant="outline" disabled={adding}>Add</Button>
        </form>
        {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
      </div>
    </section>
  )
}

function PreferencesForm({ initial }: { initial: HouseholdPreferences }) {
  const { accountId } = useAuth()
  const queryClient = useQueryClient()
  const ids = { days: useId(), rule: useId(), routinesHelp: useId() }
  const [days, setDays] = useState(String(initial.reminder_days_before_due))
  const [rule, setRule] = useState(initial.default_split_rule)
  const [routines, setRoutines] = useState(initial.routines_enabled)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(event: FormEvent) {
    event.preventDefault()
    setSaved(false)
    // Only a whole number can be sent; whether it is in range is the server's call.
    if (!/^\d+$/.test(days.trim())) return setError(DAYS_MESSAGE)
    setError(null)
    setSaving(true)
    try {
      await saveHouseholdPreferences({
        reminder_days_before_due: Number(days.trim()),
        default_split_rule: rule,
        routines_enabled: routines,
      })
      setSaved(true)
      await queryClient.invalidateQueries({ queryKey: householdPreferencesKey(accountId) })
    } catch (failure) {
      setError(failure instanceof ApiError && failure.status === 422 ? DAYS_MESSAGE : 'Could not save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="space-y-5" noValidate onSubmit={save}>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={ids.days} className="text-sm">Remind me before a bill is due</label>
        <Input
          id={ids.days}
          type="number"
          min={0}
          max={60}
          step={1}
          inputMode="numeric"
          className="h-8 w-20 text-sm"
          value={days}
          onChange={event => { setDays(event.target.value); setSaved(false) }}
        />
        <span className="text-sm text-muted-foreground">days</span>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm">Usually split bills</legend>
        {([['equal', 'Equally'], ['days_home', 'By days at home']] as const).map(([value, label]) => (
          <label key={value} className="mr-4 inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={ids.rule}
              checked={rule === value}
              onChange={() => { setRule(value); setSaved(false) }}
            />
            {label}
          </label>
        ))}
      </fieldset>

      <div className="space-y-1">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={routines}
            aria-describedby={ids.routinesHelp}
            onChange={event => { setRoutines(event.target.checked); setSaved(false) }}
          />
          Let {ASSISTANT_NAME} check my bills each morning
        </label>
        <p id={ids.routinesHelp} className="pl-6 text-sm text-muted-foreground">
          {ASSISTANT_NAME} proposes a reminder for bills due in the next two weeks. Nothing is saved until you approve it.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={saving}>Save</Button>
        <p role="status" className="text-sm text-muted-foreground">{saved && 'Saved.'}</p>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
  )
}

function AccountSettings() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [qr, setQr] = useState<string | null>(null)
  const [secret, setSecret] = useState('')
  const [twoFAEnabled, setTwoFAEnabled] = useState(false)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleSetup2FA() {
    const data = await setup2FA()
    setQr(data.qr_code)
    setSecret(data.secret)
    setCode('')
    setCodeError('')
  }

  async function handleConfirm2FA() {
    setConfirming(true)
    setCodeError('')
    try {
      await confirm2FA(code)
      setTwoFAEnabled(true)
      setQr(null)
      setSecret('')
      setCode('')
      toast('Two-factor sign-in is on.')
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : 'Could not turn on two-factor sign-in. Try again.')
    } finally {
      setConfirming(false)
    }
  }

  async function handleDisable2FA() {
    await disable2FA()
    setQr(null)
    setSecret('')
    setCode('')
    setCodeError('')
    setTwoFAEnabled(false)
    toast('2FA disabled')
  }

  async function handleDeleteAccount() {
    await deleteAccount()
    logout()
    navigate('/')
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Account</h2>
        <p className="text-sm text-muted-foreground mt-1">Security and account management</p>
      </div>

      {/* 2FA section */}
      <section>
        <h3 className="text-sm font-semibold mb-4">Two-Factor Authentication</h3>
        {twoFAEnabled ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 rounded-lg p-3">
              <ShieldCheck size={16} /> 2FA is enabled
            </div>
            <Button variant="outline" size="sm" onClick={handleDisable2FA}>Disable 2FA</Button>
          </div>
        ) : qr ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 py-4">
              <img src={qr} alt="2FA QR Code" className="w-40 h-40 rounded-lg border" />
              <p className="text-xs text-muted-foreground">Scan with your authenticator app, then enter the code it shows.</p>
              <code className="text-xs bg-muted px-3 py-1.5 rounded-md select-all">{secret}</code>
            </div>
            <div className="space-y-2">
              <label htmlFor="totp-code" className="text-sm font-medium">Code from your authenticator app</label>
              <Input
                id="totp-code"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                aria-describedby={codeError ? 'totp-code-error' : undefined}
              />
              {codeError && <p id="totp-code-error" role="alert" className="text-sm text-destructive">{codeError}</p>}
            </div>
            <Button onClick={handleConfirm2FA} disabled={code.length !== 6 || confirming} className="bg-primary border-0 text-primary-foreground">
              Turn on 2FA
            </Button>
          </div>
        ) : (
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              Add an extra layer of security with an authenticator app like Google Authenticator or Authy.
            </p>
            <Button onClick={handleSetup2FA} className="bg-primary border-0 text-primary-foreground">
              <Smartphone size={15} className="mr-1.5" /> Enable 2FA
            </Button>
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
