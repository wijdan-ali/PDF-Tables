import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

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
        <h1 className="text-3xl font-semibold text-gray-900 mb-2">All Tables</h1>
        <p className="text-gray-600">Create and manage your data extraction tables</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4">
          Error loading tables: {error.message}
        </div>
      )}

      {!tables || tables.length === 0 ? (
        <div className="text-center py-16">
          <div className="max-w-md mx-auto">
            <div className="text-6xl mb-4">📊</div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">No tables yet</h2>
            <p className="text-gray-600 mb-6">Create your first table to start extracting data from PDFs</p>
          <Link
            href="/tables/new"
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors"
          >
                <span>+</span>
                <span>New Table</span>
          </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {tables.map((table) => (
            <Link
              key={table.id}
              href={`/tables/${table.id}`}
                className="block p-6 bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all group"
            >
                <h2 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-gray-700">
                  {table.table_name}
                </h2>
              <p className="text-sm text-gray-500">
                Updated {new Date(table.updated_at).toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

