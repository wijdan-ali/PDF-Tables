import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function TablesPage() {
  const supabase = await createClient()
  
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch tables for the user
  const { data: tables, error } = await supabase
    .from('user_tables')
    .select('id, table_name, created_at, updated_at')
    .order('updated_at', { ascending: false })

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-foreground mb-2">All Tables</h1>
        <p className="text-muted-foreground">Create and manage your data extraction tables</p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive mb-4">
          Error loading tables: {error.message}
        </div>
      )}

      {!tables || tables.length === 0 ? (
        <div className="text-center py-16">
          <div className="max-w-md mx-auto">
            <div className="text-6xl mb-4">📊</div>
            <h2 className="text-2xl font-semibold text-foreground mb-2">No tables yet</h2>
            <p className="text-muted-foreground mb-6">Create your first table to start extracting data from PDFs</p>
            <Button asChild>
              <Link href="/tables/new">
                <span className="mr-2">+</span>
                <span>New Table</span>
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {tables.map((table) => (
            <Link
              key={table.id}
              href={`/tables/${table.id}`}
              className="block"
            >
              <Card className="hover:shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{table.table_name}</CardTitle>
                  <CardDescription>
                    Updated {new Date(table.updated_at).toLocaleDateString()}
                  </CardDescription>
                </CardHeader>
                <CardContent />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

