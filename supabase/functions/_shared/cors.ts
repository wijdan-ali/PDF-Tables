export const corsHeaders: Record<string, string> = {
  // In production, prefer restricting this to your Vercel domain(s).
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

