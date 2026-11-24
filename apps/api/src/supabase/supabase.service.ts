import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';

@Injectable()
export class SupabaseService {
  readonly anon: SupabaseClient = createClient(env.supabaseUrl, env.anonKey);
  readonly admin: SupabaseClient = createClient(env.supabaseUrl, env.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
