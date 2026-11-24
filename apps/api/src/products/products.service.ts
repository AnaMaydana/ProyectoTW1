import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export interface Product {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description: string;
  priceBs: string;
  imageUrl: string | null;
  availableToday: boolean;
}

const CATEGORY_IDS: Record<string, string> = {
  'salteñas': '11111111-1111-4111-8111-111111111111',
  'bebidas': '22222222-2222-4222-8222-222222222222'
};

@Injectable()
export class ProductsService {
  constructor(private sb: SupabaseService) {}

  async list(search?: string, category?: string): Promise<Product[]> {
    let query = this.sb.admin
      .from('products')
      .select('id,category_id,name,description,price_bs,image_url,available_today,categories(name)')
      .eq('active', true);

    if (category) query = query.eq('category_id', CATEGORY_IDS[category] ?? category);
    if (search) query = query.ilike('name', `%${search}%`);

    const { data, error } = await query.order('name');
    if (error) throw new Error(error.message);

    return (data ?? []).map((r: any) => ({
      id: r.id,
      categoryId: r.category_id,
      categoryName: r.categories?.name ?? '',
      name: r.name,
      description: r.description,
      priceBs: Number(r.price_bs).toFixed(2),
      imageUrl: r.image_url,
      availableToday: r.available_today
    }));
  }
}
