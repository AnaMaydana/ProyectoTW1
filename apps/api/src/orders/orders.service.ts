import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CartService } from '../cart/cart.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { buildExpiry } from './expiry';

@Injectable()
export class OrdersService {
  constructor(private sb: SupabaseService, private cart: CartService) {}

  async create(
    userId: string | null,
    cartId: string,
    dto: CreateOrderDto,
    customer: { name: string; phone: string }
  ) {
    if (!userId && (!customer.name?.trim() || !customer.phone?.trim())) {
      throw new BadRequestException('Nombre y celular son obligatorios');
    }
    const current = await this.cart.getCart(cartId);
    if (current.items.length === 0) throw new BadRequestException('Carrito vacío');

    const { expiresAt } = buildExpiry();
    const { data, error } = await this.sb.admin.rpc('create_order_from_cart', {
      p_user_id: userId,
      p_cart_id: cartId,
      p_customer_name: customer.name,
      p_customer_phone: customer.phone,
      p_pickup_time: dto.pickupTime,
      p_notes: dto.notes ?? null,
      p_payment_method: dto.paymentMethod,
      p_expires_at: expiresAt
    });
    if (error) {
      throw error.message.includes('PRODUCT_UNAVAILABLE')
        ? new ConflictException('Algún producto se agotó')
        : new BadRequestException('No se pudo crear el pedido');
    }
    return this.findOne(data as string);
  }

  async findOne(id: string) {
    const { data, error } = await this.sb.admin
      .from('orders')
      .select(
        'id,code,total_bs,status,pickup_time,notes,payment_method,expires_at,created_at,order_items(product_id,quantity,unit_price_bs,products(name))'
      )
      .eq('id', id)
      .single();
    if (error || !data) throw new NotFoundException('Pedido no encontrado');

    return {
      id: data.id,
      code: data.code,
      totalBs: Number(data.total_bs).toFixed(2),
      status: data.status,
      pickupTime: data.pickup_time,
      notes: data.notes,
      paymentMethod: data.payment_method,
      expiresAt: data.expires_at,
      createdAt: data.created_at,
      items: (data.order_items ?? []).map((item: any) => ({
        productId: item.product_id,
        name: item.products?.name ?? '',
        quantity: item.quantity,
        unitPriceBs: Number(item.unit_price_bs).toFixed(2)
      }))
    };
  }

  async list(userId: string) {
    const { data } = await this.sb.admin
      .from('orders')
      .select('id,code,total_bs,status,pickup_time,payment_method,expires_at,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    return (data ?? []).map((order: any) => ({
      id: order.id,
      code: order.code,
      totalBs: Number(order.total_bs).toFixed(2),
      status: order.status,
      pickupTime: order.pickup_time,
      paymentMethod: order.payment_method,
      expiresAt: order.expires_at,
      createdAt: order.created_at
    }));
  }

  async repeat(userId: string, cartId: string, orderId: string) {
    const { data: order } = await this.sb.admin
      .from('orders')
      .select('id')
      .eq('id', orderId)
      .eq('user_id', userId)
      .single();
    if (!order) throw new NotFoundException('Pedido no encontrado');

    const { data: items } = await this.sb.admin
      .from('order_items')
      .select('product_id,quantity')
      .eq('order_id', orderId);
    const ids = (items ?? []).map((item: any) => item.product_id);
    const { data: products } = await this.sb.admin
      .from('products')
      .select('id,name,active,available_today')
      .in('id', ids);

    const skipped: string[] = [];
    for (const item of items ?? []) {
      const product = (products ?? []).find((p: any) => p.id === item.product_id);
      if (!product || !product.active || !product.available_today) {
        skipped.push(product?.name ?? item.product_id);
        continue;
      }
      const { error } = await this.sb.admin.from('cart_items').upsert(
        { cart_id: cartId, product_id: item.product_id, quantity: item.quantity },
        { onConflict: 'cart_id,product_id' }
      );
      if (error) throw new Error(error.message);
    }
    return { cart: await this.cart.getCart(cartId), skipped };
  }

  async cancel(userId: string, orderId: string) {
    const { data, error } = await this.sb.admin
      .from('orders')
      .update({ status: 'CANCELADO' })
      .eq('id', orderId)
      .eq('user_id', userId)
      .eq('status', 'PENDIENTE')
      .gt('expires_at', new Date().toISOString())
      .select()
      .single();
    if (!data || error) {
      throw new ConflictException('No se puede cancelar; llamá al local');
    }
    return this.findOne(orderId);
  }
}
