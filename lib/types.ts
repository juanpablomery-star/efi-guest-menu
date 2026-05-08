export interface Room {
  numero: number;
  estado: 'libre' | 'ocupada';
  guestCode?: number;
}

export interface Product {
  id: string;
  nombre: string;
  categoria: string;
  subcategoria: string;
  precio: number;
  stock: number;
  deleted?: boolean;
}

export interface CartItem {
  productId: string;
  nombre: string;
  precio: number;
  cantidad: number;
}

export interface Order {
  id: string;
  hotelId: string;
  roomId: number;
  items: Array<{
    productId: string;
    nombre: string;
    cantidad: number;
    precio: number;
  }>;
  paymentMethod: 'cash' | 'debit' | 'credit' | 'transfer' | 'mercadopago';
  status: 'pending' | 'accepted' | 'delivered';
  createdAt: any;
  total: number;
}
