import Sidebar from './Sidebar'

export default function TableLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // Prevent page-level horizontal scrolling; tables manage their own horizontal scroll
    <div className="flex min-h-screen bg-white overflow-x-hidden">
      <Sidebar />
      {/* Allow normal page scrolling (no fixed-height inner scroller) */}
      <main className="flex-1 ml-80 min-w-0 overflow-x-hidden">
        {children}
      </main>
    </div>
  )
}

