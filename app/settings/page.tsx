import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SettingsClient from './settings-client'
import { Button } from '@/components/ui/button'
import { ChevronLeft } from 'lucide-react'

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: profile }] = await Promise.all([
    supabase
      .from('profiles')
      .select('email, full_name, company_name')
      .eq('id', user.id)
      .maybeSingle(),
  ])

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-4xl px-6 sm:px-8 py-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Button asChild className="gap-2">
            <Link href="/tables">
              <ChevronLeft className="h-4 w-4" />
              Back to app
            </Link>
          </Button>

          <h1 className="text-3xl font-semibold text-foreground">Settings</h1>

          {/* spacer to keep title centered-ish */}
          <div className="w-[120px]" />
        </div>

        <SettingsClient
          initialProfile={{
            email: profile?.email ?? user.email ?? '',
            full_name: profile?.full_name ?? (user.user_metadata?.full_name as string | undefined) ?? '',
            company_name: profile?.company_name ?? (user.user_metadata?.company_name as string | undefined) ?? '',
          }}
        />
      </div>
    </div>
  )
}

