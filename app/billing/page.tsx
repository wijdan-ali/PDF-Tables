import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import BillingClient from './billing-client'

export default async function BillingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-5xl px-6 sm:px-8 py-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Button asChild className="gap-2">
            <Link href="/settings?focus=billing">
              <ChevronLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
          {/* <h1 className="text-3xl font-semibold text-foreground">Plans</h1> */}
          <div className="w-[120px]" />
        </div>

        <BillingClient />
      </div>
    </div>
  )
}

