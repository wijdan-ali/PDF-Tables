import TableLayout from '../components/TableLayout'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TableDetailRouteShell from './components/TableDetailRouteShell'
import PlanGateModal from '../components/PlanGateModal'

export default async function TablesLayout({ children }: { children: React.ReactNode }) {
  // Enforce auth for all /tables/* routes so table detail can be client-rendered without flashing.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <TableLayout>
      <PlanGateModal />
      <TableDetailRouteShell />
      {children}
    </TableLayout>
  )
}


