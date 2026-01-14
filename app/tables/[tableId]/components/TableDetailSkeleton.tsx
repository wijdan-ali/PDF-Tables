'use client'

import { Skeleton } from '@/components/ui/skeleton'

export default function TableDetailSkeleton() {
  return (
    <div className="pb-8 max-w-full">
      <div className="pl-[100px] pr-8">
        <div className="mb-8">
          <Skeleton className="h-10 w-[320px] rounded-xl" />
        </div>

        <div className="mb-[30px]">
          <div className="flex flex-wrap gap-5 items-stretch">
            <div className="relative w-[380px] h-[145px] max-w-full rounded-[22px] overflow-hidden border border-border bg-card shadow-md">
              <div className="p-6 space-y-4">
                <Skeleton className="h-4 w-40 rounded-lg" />
                <Skeleton className="h-10 w-24 rounded-xl" />
              </div>
            </div>
            <div className="flex-1 min-w-[320px] h-[145px] rounded-[22px] overflow-hidden border border-border bg-card shadow-md p-6 space-y-4">
              <Skeleton className="h-4 w-44 rounded-lg" />
              <Skeleton className="h-10 w-60 rounded-xl" />
              <Skeleton className="h-9 w-40 rounded-xl" />
            </div>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <div className="space-y-3 px-8">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      </div>
    </div>
  )
}

