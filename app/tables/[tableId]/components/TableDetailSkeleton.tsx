'use client'

import { Skeleton } from '@/components/ui/skeleton'
import RecordsCard from './RecordsCard'
import UploadPanel from './UploadPanel'

function TableChromeSkeleton() {
  const COL_W = 260
  const cols = [0, 1, 2]
  return (
    <div className="border border-border border-x-0 border-t-0 border-b-0 rounded-b-lg rounded-t-none overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-max">
          <div className="bg-background">
            <div className="flex">
              <div className="flex-shrink-0 w-24 px-3 py-2" />
              <div className="flex border-t border-border border-b-2 border-border pl-3">
                {cols.map((i) => (
                  <div key={i} className="flex-shrink-0 px-3 py-2 border-r border-border" style={{ width: COL_W }}>
                    <Skeleton className="h-4 w-32 rounded-lg" />
                  </div>
                ))}
                <div className="flex-shrink-0 w-[120px] px-3 py-2 border-l border-border flex items-center">
                  <Skeleton className="h-4 w-10 rounded-lg" />
                </div>
              </div>
              <div className="flex-shrink-0 px-3 py-2">
                <Skeleton className="h-8 w-28 rounded-xl" />
              </div>
            </div>
          </div>

          <div className="bg-background">
            {[0, 1, 2].map((rowIdx) => (
              <div key={rowIdx} className="flex relative bg-background">
                <div className="flex-shrink-0 w-24 px-3 flex items-center" />
                <div className={`flex pl-3 ${rowIdx === 0 ? '' : 'border-t border-border'}`}>
                  {cols.map((i) => (
                    <div
                      key={i}
                      className="flex-shrink-0 px-3 py-2 border-r border-border flex items-center"
                      style={{ width: COL_W }}
                    >
                      <Skeleton className="h-4 w-[70%] rounded-lg" />
                    </div>
                  ))}
                  <div className="flex-shrink-0 w-[120px] px-3 py-2 border-l border-border flex items-center">
                    <Skeleton className="h-24 w-24 rounded-md" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function TableDetailSkeleton({ tableId }: { tableId: string }) {
  return (
    <div className="pb-8 max-w-full">
      <div className="pl-[100px] pr-8">
        <div className="mb-8">
          {/* Match EditableTableName geometry to avoid layout jump */}
          <div className="w-full max-w-full rounded px-1 py-0.5 -mx-1" style={{ minHeight: '1.5em' }}>
            {/* Reserve space for the title, but don't show a skeleton (matches Sidebar behavior). */}
            <div style={{ height: 44 }} />
          </div>
        </div>

        <div className="mb-[30px]">
          <div className="flex flex-wrap gap-5 items-stretch">
            <RecordsCard tableId={tableId} />
            <UploadPanel tableId={tableId} columnsCount={0} isBootstrapping />
          </div>
        </div>
      </div>

      <div className="mb-8">
        <TableChromeSkeleton />
      </div>
    </div>
  )
}

