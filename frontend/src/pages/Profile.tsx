import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Calendar, FileText, Star, FolderOpen } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getDocuments, getCategories, getProfile, updateProfile } from '@/lib/api'
import { useToast } from '@/components/Toast'

export default function ProfilePage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [profile, setProfile] = useState<{ email: string; display_name: string | null; created_at: string } | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [stats, setStats] = useState({ docs: 0, folders: 0, favourites: 0 })

  useEffect(() => {
    getProfile().then(setProfile).catch(() => {})

    // Fetch stats
    Promise.all([getDocuments(), getCategories()]).then(([docsData, cats]) => {
      const docs = Array.isArray(docsData?.documents) ? docsData.documents : []
      setStats({
        docs: docs.length,
        folders: Array.isArray(cats) ? cats.length : 0,
        favourites: docs.filter(d => d.is_favourite).length,
      })
    }).catch(() => {})
  }, [])

  async function handleUpdateName() {
    const name = nameValue.trim()
    if (!name) { setEditingName(false); return }
    await updateProfile(name)
    setProfile(prev => prev ? { ...prev, display_name: name } : null)
    setEditingName(false)
    toast('Profile updated')
  }

  if (!profile) {
    return (
      <div className="p-4 sm:p-8 max-w-2xl mx-auto h-full overflow-y-auto animate-fade-in">
        <div className="h-32 bg-muted rounded-xl animate-pulse" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 max-w-2xl mx-auto h-full overflow-y-auto animate-fade-in space-y-6">
      {/* Profile header */}
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-full gradient-bg flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-primary/25">
              {(profile.display_name || profile.email)[0].toUpperCase()}
            </div>
            <div className="flex-1">
              {editingName ? (
                <Input
                  autoFocus
                  value={nameValue}
                  onChange={e => setNameValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleUpdateName(); if (e.key === 'Escape') setEditingName(false) }}
                  onBlur={handleUpdateName}
                  placeholder="Your name"
                  className="h-9 text-lg font-semibold w-64"
                />
              ) : (
                <h2
                  className="text-xl font-bold cursor-pointer hover:text-primary transition-colors"
                  onClick={() => { setEditingName(true); setNameValue(profile.display_name || '') }}
                >
                  {profile.display_name || 'Add your name'}
                </h2>
              )}
              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5"><Mail size={13} /> {profile.email}</span>
                <span className="flex items-center gap-1.5"><Calendar size={13} /> Joined {new Date(profile.created_at).toLocaleDateString('en-IE', { month: 'long', year: 'numeric' })}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/[0.07] flex items-center justify-center">
              <FileText size={18} className="text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.docs}</p>
              <p className="text-xs text-muted-foreground">Documents</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <FolderOpen size={18} className="text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.folders}</p>
              <p className="text-xs text-muted-foreground">Folders</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Star size={18} className="text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.favourites}</p>
              <p className="text-xs text-muted-foreground">Favourites</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <Card>
        <CardContent className="p-6 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Manage security, 2FA, and account deletion</p>
          <Button variant="outline" size="sm" onClick={() => navigate('/app/settings')}>
            Account Settings
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
