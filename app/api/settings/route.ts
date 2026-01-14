import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type ThemePref = 'system' | 'light' | 'dark'
type AiProvider = 'chatpdf' | 'gemini'

function isTheme(x: unknown): x is ThemePref {
  return x === 'system' || x === 'light' || x === 'dark'
}

function isAiProvider(x: unknown): x is AiProvider {
  return x === 'chatpdf' || x === 'gemini'
}

export async function PATCH(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const profile = (body as any).profile as { full_name?: unknown; company_name?: unknown } | undefined
  const settings = (body as any).settings as { theme?: unknown; ai_provider?: unknown } | undefined

  const full_name = typeof profile?.full_name === 'string' ? profile.full_name.trim() : undefined
  const company_name = typeof profile?.company_name === 'string' ? profile.company_name.trim() : undefined

  const theme = settings?.theme
  const ai_provider = settings?.ai_provider

  if (theme !== undefined && !isTheme(theme)) {
    return NextResponse.json({ error: 'Invalid theme' }, { status: 400 })
  }
  if (ai_provider !== undefined && !isAiProvider(ai_provider)) {
    return NextResponse.json({ error: 'Invalid ai_provider' }, { status: 400 })
  }

  // Update profile fields (optional).
  if (full_name !== undefined || company_name !== undefined) {
    const { error } = await supabase.from('profiles').upsert(
      {
        id: user.id,
        email: user.email ?? null,
        ...(full_name !== undefined ? { full_name: full_name || null } : {}),
        ...(company_name !== undefined ? { company_name: company_name || null } : {}),
      },
      { onConflict: 'id' }
    )
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
  }

  // Update settings fields (optional).
  if (theme !== undefined || ai_provider !== undefined) {
    const { error } = await supabase.from('user_settings').upsert(
      {
        user_id: user.id,
        ...(theme !== undefined ? { theme } : {}),
        ...(ai_provider !== undefined ? { ai_provider } : {}),
      },
      { onConflict: 'user_id' }
    )
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
  }

  return NextResponse.json({ ok: true })
}

