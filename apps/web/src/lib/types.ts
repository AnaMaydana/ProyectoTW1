export type Role = 'CLIENTE' | 'CAJERO' | 'ADMIN';
export type PaymentMethod = 'EFECTIVO' | 'QR' | 'TRANSFERENCIA';
export type OrderStatus =
  | 'PENDIENTE' | 'CONFIRMADO' | 'PREPARANDO' | 'LISTO' | 'ENTREGADO' | 'CANCELADO';

export interface Comprobante {
  numero: string;
  fechaEmision: string;
}

export interface PublicOrder {
  code: string;
  status: OrderStatus;
  totalBs: string;
  pickupTime: string;
  items: Array<{ name: string; quantity: number; unitPriceBs: string }>;
  comprobante: Comprobante | null;
}

export interface CashierOrder {
  id: string;
  code: string;
  customerName: string | null;
  customerPhone: string | null;
  pickupTime: string;
  status: OrderStatus;
  totalBs: string;
  paymentMethod: PaymentMethod;
  expiresAt: string;
  createdAt: string;
  itemCount: number;
}

export interface CashierOrderDetail extends CashierOrder {
  notes: string | null;
  items: Array<{ productId: string; name: string; quantity: number; unitPriceBs: string }>;
  comprobante: Comprobante | null;
}

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

export interface User {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: Role;
}

export interface Order {
  id: string;
  code: string;
  totalBs: string;
  status: OrderStatus;
  pickupTime: string;
  notes: string | null;
  paymentMethod: PaymentMethod;
  expiresAt: string;
  createdAt: string;
  comprobante?: Comprobante | null;
  items: Array<{
    productId: string;
    name: string;
    quantity: number;
    unitPriceBs: string;
  }>;
}

export interface AdminCategory {
  id: string; nombre: string; activa: boolean; productCount: number;
}
export interface AdminProduct {
  id: string; idCategoria: string; categoria: string; nombre: string;
  precio: string; fotoUrl: string | null; activo: boolean;
  stock: number; disponibleHoy: boolean;
}
export interface AdminInventoryItem {
  id: string; productId: string; nombre: string;
  stock: number; disponibleHoy: boolean; lowStock: boolean;
}
export interface ReportRow { [key: string]: string | number; }
