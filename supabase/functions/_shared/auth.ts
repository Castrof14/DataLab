// DataLab · who is calling? Every Edge Function validates the user's access token with Supabase Auth
// (signature, expiry, revoked session) before touching the database. The user id used by the
// database functions ALWAYS comes from here, never from the request body.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { HttpError } from './http.ts';
import { hasRole } from './db.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
// the public (anon / publishable) key is enough to ask Auth who owns a token
const PUBLIC_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '';

const auth = createClient(SUPABASE_URL, PUBLIC_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

export interface Caller {
  id: string;
  email: string | null;
}

export async function requireUser(req: Request): Promise<Caller> {
  const header = req.headers.get('Authorization') ?? '';
  const m = /^Bearer\s+([A-Za-z0-9._-]+)$/.exec(header);
  if (!m) throw new HttpError(401, 'unauthorized', 'Faça login para continuar.');
  const { data, error } = await auth.auth.getUser(m[1]);
  if (error || !data?.user) throw new HttpError(401, 'unauthorized', 'Sessão expirada: faça login de novo.');
  return { id: data.user.id, email: data.user.email ?? null };
}

export async function requireRole(user: Caller, roles: string[]) {
  if (!(await hasRole(user.id, roles))) throw new HttpError(403, 'forbidden', 'Você não tem permissão para isso.');
}
