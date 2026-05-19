import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGIN = 'https://barett07.github.io'
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Write-Token',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const token = req.headers.get('X-Write-Token')
  if (!token || token !== Deno.env.get('WRITE_SECRET')) {
    return new Response('Unauthorized', { status: 401, headers: CORS })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: CORS })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { action } = body
  let error = null

  switch (action) {
    case 'upsert-workers': {
      const { rows } = body as { rows: Record<string, unknown>[] }
      const { error: e } = await supabase.from('workers').upsert(rows, { onConflict: 'employee_id' })
      error = e
      break
    }
    case 'delete-schedules': {
      const { year, month } = body as { year: number; month: number }
      const { error: e } = await supabase.from('monthly_schedules')
        .delete().eq('year', year).eq('month', month)
      error = e
      break
    }
    case 'insert-schedules': {
      const { rows } = body as { rows: Record<string, unknown>[] }
      const { error: e } = await supabase.from('monthly_schedules').insert(rows)
      error = e
      break
    }
    case 'update-shift': {
      const { id, data } = body as { id: string; data: Record<string, unknown> }
      const { error: e } = await supabase.from('shifts').update(data).eq('id', id)
      error = e
      break
    }
    case 'delete-shift': {
      const { id } = body as { id: string }
      const { error: e } = await supabase.from('shifts').delete().eq('id', id)
      error = e
      break
    }
    case 'delete-all-shifts': {
      const { error: e } = await supabase.from('shifts').delete().neq('id', '')
      error = e
      break
    }
    case 'upsert-shifts': {
      const { rows } = body as { rows: Record<string, unknown>[] }
      const { error: e } = await supabase.from('shifts').upsert(rows, { onConflict: 'id' })
      error = e
      break
    }
    default:
      return new Response('Unknown action', { status: 400, headers: CORS })
  }

  if (error) return new Response((error as { message: string }).message, { status: 500, headers: CORS })
  return new Response(null, { status: 204, headers: CORS })
})
