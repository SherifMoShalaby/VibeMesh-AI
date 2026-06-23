import { createClient } from '@supabase/supabase-js'

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null

export { supabase }

export async function dbGetProjects(userId) {
  if (!supabase) throw new Error('DB not configured')
  const { data, error } = await supabase
    .from('projects')
    .select('raw')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data.map((r) => r.raw)
}

export async function dbUpsertProject(project, userId) {
  if (!supabase) throw new Error('DB not configured')
  const { error } = await supabase.from('projects').upsert({
    id: project.id, user_id: userId,
    name: project.name, code: project.code,
    param_values: project.paramValues ?? {},
    chat: project.chat ?? [],
    chat_future: project.chatFuture ?? null,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
    schema_version: 1,
    raw: project,
  }, { onConflict: 'id' })
  if (error) throw error
}

export async function dbDeleteProject(id, userId) {
  if (!supabase) throw new Error('DB not configured')
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw error
}
