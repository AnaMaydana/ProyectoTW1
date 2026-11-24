import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export interface CartItem {
  productId: string;
  name: string;
  quantity: number;
  unitPriceBs: string;
  subtotalBs: string;
}

export interface Cart {
  items: CartItem[];
  totalBs: string;
}

@Injectable()
export class CartService {
  constructor(private sb: SupabaseService) {}

  private get admin() {
    return this.sb.admin;
  }

  async getOrCreate(cartId?: string, userId?: string | null): Promise<string> {
    if (cartId) {
      const { data } = await this.admin.from('carts').select('id').eq('id', cartId).single();
      if (data) return data.id;
    }
    const { data, error } = await this.admin
      .from('carts')
      .insert({ user_id: userId ?? null })
      .select('id')
      .single();
    if (error || !data) throw new Error(error?.message ?? 'CART_CREATE_FAILED');
    return data.id;
  }

  async getCart(cartId: string): Promise<Cart> {
    const { data, error } = await this.admin
      .from('cart_items')
      .select('cart_id,product_id,quantity,products(name,price_bs,active,available_today)')
      .eq('cart_id', cartId);
    if (error) throw new Error(error.message);

    const items: CartItem[] = (data ?? [])
      .filter((r: any) => r.products?.active)
      .map((r: any) => {
        const unit = Number(r.products.price_bs).toFixed(2);
        return {
          productId: r.product_id,
          name: r.products.name,
          quantity: r.quantity,
          unitPriceBs: unit,
          subtotalBs: (Number(unit) * r.quantity).toFixed(2)
        };
      });
    const total = items.reduce((sum, item) => sum + Number(item.subtotalBs), 0);
    return { items, totalBs: total.toFixed(2) };
  }

  async addItem(cartId: string, productId: string, quantity: number): Promise<Cart> {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException('Cantidad inválida');
    }
    const { data: product } = await this.admin
      .from('products')
      .select('id,active,available_today')
      .eq('id', productId)
      .single();
    if (!product || !product.active || !product.available_today) {
      throw new ConflictException('Producto agotado hoy');
    }
    const { error } = await this.admin.from('cart_items').upsert(
      { cart_id: cartId, product_id: productId, quantity },
      { onConflict: 'cart_id,product_id' }
    );
    if (error) throw new Error(error.message);
    return this.getCart(cartId);
  }

  async removeItem(cartId: string, productId: string): Promise<Cart> {
    const { error } = await this.admin
      .from('cart_items')
      .delete()
      .eq('cart_id', cartId)
      .eq('product_id', productId);
    if (error) throw new Error(error.message);
    return this.getCart(cartId);
  }

  async clear(cartId: string) {
    await this.admin.from('cart_items').delete().eq('cart_id', cartId);
  }

  async attachUser(cartId: string, userId: string) {
    await this.admin
      .from('carts')
      .update({ user_id: userId, updated_at: new Date().toISOString() })
      .eq('id', cartId);
  }
}
