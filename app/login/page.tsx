import { Suspense } from 'react'
import LoginForm from './login-form'

function LoginFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 animate-pulse text-muted-foreground text-center">
        Loading…
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  )
}
