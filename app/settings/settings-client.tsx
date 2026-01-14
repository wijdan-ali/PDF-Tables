'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { LifeBuoy, LogOut, Save, Shield, User } from 'lucide-react'

type InitialProfile = {
  email: string
  full_name: string
  company_name: string
}

const FIRST_NAME_CACHE_KEY = 'pdf-tables:first-name-cache'
const USER_INITIAL_CACHE_KEY = 'pdf-tables:user-initial-cache'
const PROFILE_UPDATED_EVENT = 'pdf-tables:profile-updated'

function extractFirstName(fullName: string): string {
  const cleaned = fullName.trim().replace(/\s+/g, ' ')
  if (!cleaned) return ''
  return cleaned.split(' ')[0] ?? ''
}

function firstNameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? ''
  const cleaned = local.replace(/[._-]+/g, ' ').trim()
  const first = cleaned.split(' ')[0] ?? ''
  return first ? first[0]!.toUpperCase() + first.slice(1) : ''
}

export default function SettingsClient({
  initialProfile,
}: {
  initialProfile: InitialProfile
}) {
  const router = useRouter()
  const [fullName, setFullName] = useState(initialProfile.full_name ?? '')
  const [companyName, setCompanyName] = useState(initialProfile.company_name ?? '')

  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSavedAt, setProfileSavedAt] = useState<string | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSavedAt, setPasswordSavedAt] = useState<string | null>(null)

  const [isSigningOut, setIsSigningOut] = useState(false)

  const profileRef = useRef<HTMLDivElement>(null)
  const securityRef = useRef<HTMLDivElement>(null)
  const supportRef = useRef<HTMLDivElement>(null)

  const scrollTo = (ref: React.RefObject<HTMLDivElement>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const saveProfile = async () => {
    setProfileError(null)
    setProfileSavedAt(null)
    setIsSavingProfile(true)
    try {
      const nextFullName = fullName.trim()
      const nextCompanyName = companyName.trim()
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: {
            full_name: nextFullName,
            company_name: nextCompanyName,
          },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to save settings')

      // Immediately update cached greeting + topbar initial so the user never sees stale values
      // when navigating back to the app.
      const email = (initialProfile.email || '').trim()
      const first = extractFirstName(nextFullName) || (email ? firstNameFromEmail(email) : '')
      const initial = (first || email)[0]?.toUpperCase?.() ? (first || email)[0]!.toUpperCase() : ''
      try {
        sessionStorage.setItem(FIRST_NAME_CACHE_KEY, first)
        sessionStorage.setItem(USER_INITIAL_CACHE_KEY, initial)
      } catch {
        // ignore
      }
      window.dispatchEvent(
        new CustomEvent(PROFILE_UPDATED_EVENT, {
          detail: { full_name: nextFullName, first_name: first, initial },
        })
      )

      setProfileSavedAt(new Date().toLocaleTimeString())
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : 'Failed to save profile')
    } finally {
      setIsSavingProfile(false)
    }
  }

  const changePassword = async () => {
    setPasswordError(null)
    setPasswordSavedAt(null)

    const email = (initialProfile.email || '').trim()
    if (!email) {
      setPasswordError('Missing account email for password change.')
      return
    }
    if (!currentPassword) {
      setPasswordError('Current password is required.')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('New passwords do not match.')
      return
    }
    if (newPassword === currentPassword) {
      setPasswordError('New password must be different from the current password.')
      return
    }

    setIsChangingPassword(true)
    try {
      const supabase = createClient()

      // Step 1: confirm the current password (standard re-auth flow).
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      })
      if (signInError) throw new Error('Current password is incorrect.')

      // Step 2: update password.
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      })
      if (updateError) throw updateError

      setCurrentPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
      setPasswordSavedAt(new Date().toLocaleTimeString())
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : 'Failed to change password')
    } finally {
      setIsChangingPassword(false)
    }
  }

  const signOut = async () => {
    if (isSigningOut) return
    setIsSigningOut(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      router.push('/login')
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to sign out')
      setIsSigningOut(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
      {/* Section list */}
      <aside className="lg:sticky lg:top-10 h-fit">
        <div className="rounded-xl border border-border bg-card p-2 shadow-sm">
          <button
            type="button"
            onClick={() => scrollTo(profileRef)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-left hover:bg-accent hover:text-accent-foreground"
          >
            <User className="h-4 w-4 opacity-80" />
            Profile
          </button>
          <button
            type="button"
            onClick={() => scrollTo(securityRef)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-left hover:bg-accent hover:text-accent-foreground"
          >
            <Shield className="h-4 w-4 opacity-80" />
            Security
          </button>
          <button
            type="button"
            onClick={() => scrollTo(supportRef)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-left hover:bg-accent hover:text-accent-foreground"
          >
            <LifeBuoy className="h-4 w-4 opacity-80" />
            Support
          </button>

          <div className="my-2 h-px w-full bg-border" />

          <button
            type="button"
            onClick={() => void signOut()}
            disabled={isSigningOut}
            className={[
              'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-left',
              'text-destructive hover:bg-destructive/10',
              isSigningOut ? 'opacity-60 cursor-not-allowed' : '',
            ].join(' ')}
          >
            <LogOut className="h-4 w-4" />
            {isSigningOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </aside>

      {/* Cards */}
      <div className="space-y-6">
        <div ref={profileRef} className="scroll-mt-24">
          {profileError && (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {profileError}
            </div>
          )}
          {profileSavedAt && (
            <div className="mb-4 rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              Saved at {profileSavedAt}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Your personal and workspace information.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={initialProfile.email} disabled />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Full name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="companyName">Company</Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Company name"
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="justify-end">
              <Button onClick={() => void saveProfile()} disabled={isSavingProfile} className="gap-2">
                <Save className="h-4 w-4" />
                {isSavingProfile ? 'Saving…' : 'Save'}
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div ref={securityRef} className="scroll-mt-24">
          {passwordError && (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {passwordError}
            </div>
          )}
          {passwordSavedAt && (
            <div className="mb-4 rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              Password updated at {passwordSavedAt}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Security</CardTitle>
              <CardDescription>Manage your account security.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="currentPassword">Current password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Current password"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="newPassword">New password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirmNewPassword">Confirm new password</Label>
                  <Input
                    id="confirmNewPassword"
                    type="password"
                    autoComplete="new-password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Confirm new password"
                  />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">Use at least 8 characters.</p>
            </CardContent>
            <CardFooter className="justify-end">
              <Button onClick={() => void changePassword()} disabled={isChangingPassword} className="gap-2">
                <Shield className="h-4 w-4" />
                {isChangingPassword ? 'Updating…' : 'Change password'}
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div ref={supportRef} className="scroll-mt-24">
          <Card>
            <CardHeader>
              <CardTitle>Support</CardTitle>
              <CardDescription>Need help? We’re here.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="gap-2">
                <a href="mailto:support@clariparse.com?subject=Clariparse%20support">
                  <LifeBuoy className="h-4 w-4" />
                  Contact support
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

