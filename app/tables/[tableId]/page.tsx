import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SchemaEditor from './components/SchemaEditor'
import UploadPanel from './components/UploadPanel'
import ExtractedRowsGrid from './components/ExtractedRowsGrid'
import type { Table } from '@/types/api'

interface PageProps {
  params: {
    tableId: string
  }
}

export default async function TableDetailPage({ params }: PageProps) {
  const supabase = await createClient()
  
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch table with columns
  const { data: table, error } = await supabase
    .from('user_tables')
    .select('*')
    .eq('id', params.tableId)
    .single()

  if (error || !table) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
          {error ? `Error: ${error.message}` : 'Table not found'}
        </div>
      </div>
    )
  }

  const tableData: Table = {
    id: table.id,
    table_name: table.table_name,
    columns: (table.columns as any[]) || [],
    created_at: table.created_at,
    updated_at: table.updated_at,
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{tableData.table_name}</h1>
        <p className="text-gray-600">
          Last updated {new Date(tableData.updated_at).toLocaleDateString()}
        </p>
      </div>

      <div className="space-y-8">
        {/* Schema Editor Section */}
        <section className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Schema</h2>
          <SchemaEditor tableId={params.tableId} initialColumns={tableData.columns} />
        </section>

        {/* Upload Panel */}
        <section className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Upload PDF</h2>
          <UploadPanel tableId={params.tableId} />
        </section>

        {/* Extracted Rows Grid */}
        <section className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Extracted Data</h2>
          <ExtractedRowsGrid tableId={params.tableId} columns={tableData.columns} />
        </section>
      </div>
    </div>
  )
}

