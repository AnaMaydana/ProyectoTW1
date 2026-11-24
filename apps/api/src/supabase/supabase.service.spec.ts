import { SupabaseService } from './supabase.service';

describe('SupabaseService', () => {
  it('expone cliente anon y admin', () => {
    const service = new SupabaseService();
    expect(service.anon).toBeDefined();
    expect(service.admin).toBeDefined();
    expect(service.anon).not.toBe(service.admin);
  });
});
