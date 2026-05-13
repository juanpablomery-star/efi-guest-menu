'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { Product, CartItem } from '@/lib/types';
import OrderHistory from '@/components/OrderHistory';
import { useSessionValidation } from '@/lib/hooks/useSessionValidation';

const PAYMENT_METHOD_MAP: Record<string, string> = {
  'Efectivo': 'cash',
  'Tarjeta débito': 'debit',
  'Tarjeta crédito': 'credit',
  'Transferencia': 'transfer',
  'MercadoPago': 'mercadopago',
};

type PaymentLabel = keyof typeof PAYMENT_METHOD_MAP;

export default function MenuPage() {
  const params = useParams();
  const roomId = Array.isArray(params.roomId) ? params.roomId[0] : params.roomId;
  const roomNumber = parseInt(roomId);

  const { authorized, validating, error: authError, logout } = useSessionValidation(roomNumber);

  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentLabel>('Efectivo');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'menu' | 'history'>('menu');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 768);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Restore cart from localStorage on mount
  useEffect(() => {
    if (!authorized || isNaN(roomNumber)) return;
    try {
      const saved = localStorage.getItem(`cart-${roomNumber}`);
      if (saved) setCart(JSON.parse(saved) as CartItem[]);
    } catch { /* storage unavailable */ }
  }, [authorized, roomNumber]);

  // Persist cart to localStorage on change
  useEffect(() => {
    if (isNaN(roomNumber)) return;
    try {
      if (cart.length > 0) {
        localStorage.setItem(`cart-${roomNumber}`, JSON.stringify(cart));
      } else {
        localStorage.removeItem(`cart-${roomNumber}`);
      }
    } catch { /* storage unavailable */ }
  }, [cart, roomNumber]);

  // Real-time products via onSnapshot — updates when stock changes
  useEffect(() => {
    if (!authorized) return;

    const unsubscribe = onSnapshot(
      collection(db, 'hotels', 'efi-hotel', 'products'),
      (snapshot) => {
        const allProducts = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Product));
        const filtered = allProducts.filter(
          p => p.subcategoria !== 'cortesia' && p.stock > 0 && !p.deleted
        );
        setProducts(filtered);
        setLoading(false);
      },
      () => {
        setError('Error al cargar productos');
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [authorized]);

  const groupedProducts = useMemo(() => {
    const grouped: Record<string, Product[]> = { 'Bebida': [], 'Comida': [], 'Otro': [] };
    products.forEach(p => {
      if (grouped[p.categoria]) grouped[p.categoria].push(p);
    });
    return grouped;
  }, [products]);

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.precio * item.cantidad, 0),
    [cart]
  );

  const addToCart = useCallback((product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        return prev.map(item =>
          item.productId === product.id ? { ...item, cantidad: item.cantidad + 1 } : item
        );
      }
      return [...prev, { productId: product.id, nombre: product.nombre, precio: product.precio, cantidad: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
  }, []);

  const decrementCart = useCallback((productId: string) => {
    setCart(prev =>
      prev.map(item =>
        item.productId === productId && item.cantidad > 1
          ? { ...item, cantidad: item.cantidad - 1 }
          : item
      )
    );
  }, []);

  const handleConfirmOrder = async () => {
    if (cart.length === 0) {
      setError('El carrito está vacío');
      return;
    }

    // Validate stock against current real-time products
    for (const item of cart) {
      const current = products.find(p => p.id === item.productId);
      if (!current) {
        setError(`"${item.nombre}" ya no está disponible`);
        setCart(prev => prev.filter(i => i.productId !== item.productId));
        return;
      }
      if (current.stock < item.cantidad) {
        setError(`Stock insuficiente para "${item.nombre}". Disponible: ${current.stock}`);
        return;
      }
    }

    setSubmitting(true);
    setError('');

    try {
      const docRef = await addDoc(collection(db, 'hotels', 'efi-hotel', 'orders'), {
        hotelId: 'efi-hotel',
        roomId: roomNumber,
        items: cart.map(item => ({
          productId: item.productId,
          nombre: item.nombre,
          cantidad: item.cantidad,
          precio: item.precio,
        })),
        paymentMethod: PAYMENT_METHOD_MAP[paymentMethod],
        status: 'pending',
        createdAt: serverTimestamp(),
        total,
      });

      // Clear cart after successful order
      setCart([]);
      localStorage.removeItem(`cart-${roomNumber}`);

      window.location.href = `/menu/${roomId}/status?orderId=${docRef.id}`;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al confirmar pedido');
      setSubmitting(false);
    }
  };

  if (validating || !authorized) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        minHeight: '100vh', padding: '20px', flexDirection: 'column', gap: '16px',
        background: 'var(--bg)',
      }}>
        {authError ? (
          <>
            <div style={{
              padding: '20px', background: 'rgba(255, 0, 0, 0.1)',
              border: '1px solid rgba(255, 0, 0, 0.3)', borderRadius: '8px',
              color: 'rgba(255, 100, 100, 1)', textAlign: 'center',
            }}>
              {authError}
            </div>
            <p style={{ fontSize: '13px', color: 'var(--muted)' }}>Redirigiendo a inicio...</p>
          </>
        ) : (
          <div style={{ fontSize: '13px', color: 'var(--muted)' }}>Validando acceso...</div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', color: 'var(--muted)' }}>
        Cargando productos...
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      background: 'var(--bg)',
      flexDirection: isMobile ? 'column' : 'row',
    }}>
      {/* Menu / History */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        borderRight: isMobile ? 'none' : '1px solid var(--line)',
        borderBottom: isMobile ? '1px solid var(--line)' : 'none',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', background: 'var(--surface)', flexShrink: 0 }}>
          {(['menu', 'history'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1, padding: '12px 16px',
                background: activeTab === tab ? 'var(--bg)' : 'transparent',
                color: 'var(--text)', border: 'none',
                borderBottom: activeTab === tab ? '2px solid var(--accent)' : 'none',
                cursor: 'pointer', fontSize: '13px', fontWeight: '600',
              }}
            >
              {tab === 'menu' ? 'Menú' : 'Historial'}
            </button>
          ))}
        </div>

        {activeTab === 'menu' ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            <div style={{ marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--line)' }}>
              <h1 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '4px' }}>Menú de Productos</h1>
              <p style={{ fontSize: '12px', color: 'var(--muted)' }}>Hab. {String(roomNumber).padStart(2, '0')}</p>
            </div>

            {Object.entries(groupedProducts).map(([categoria, items]) =>
              items.length > 0 && (
                <div key={categoria} style={{ marginBottom: '24px' }}>
                  <h2 style={{ fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '12px', letterSpacing: '0.05em' }}>
                    {categoria}
                  </h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {items.map(product => {
                      const cartItem = cart.find(i => i.productId === product.id);
                      const cartQty = cartItem?.cantidad || 0;
                      return (
                        <div
                          key={product.id}
                          style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '12px', background: 'var(--surface)',
                            border: '1px solid var(--line)', borderRadius: 'var(--radius)',
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: '500' }}>{product.nombre}</div>
                            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px', fontFamily: 'monospace' }}>
                              ${product.precio.toLocaleString('es-AR')}
                              {product.stock <= 3 && (
                                <span style={{ marginLeft: 8, color: '#F59E0B', fontSize: '10px' }}>
                                  Últimas {product.stock}
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {cartQty > 0 && (
                              <>
                                <button
                                  onClick={() => decrementCart(product.id)}
                                  style={{
                                    width: 28, height: 28, background: 'var(--line)', color: 'var(--text)',
                                    border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: '14px',
                                  }}
                                >−</button>
                                <span style={{ fontFamily: 'monospace', fontSize: '13px', minWidth: 16, textAlign: 'center' }}>
                                  {cartQty}
                                </span>
                              </>
                            )}
                            <button
                              onClick={() => addToCart(product)}
                              disabled={cartQty >= product.stock}
                              style={{
                                width: 28, height: 28,
                                background: cartQty >= product.stock ? 'var(--muted)' : 'var(--accent)',
                                color: 'white', border: 'none', borderRadius: 'var(--radius)',
                                cursor: cartQty >= product.stock ? 'not-allowed' : 'pointer', fontSize: '14px',
                              }}
                            >+</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
            )}
          </div>
        ) : (
          <OrderHistory roomId={roomNumber} />
        )}
      </div>

      {/* Cart */}
      <div style={{
        width: isMobile ? '100%' : '320px',
        background: 'var(--surface)',
        display: 'flex', flexDirection: 'column',
        padding: '16px', overflow: 'hidden',
      }}>
        <h2 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>
          Carrito {cart.length > 0 && <span style={{ color: 'var(--accent)' }}>({cart.reduce((s, i) => s + i.cantidad, 0)})</span>}
        </h2>

        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {cart.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--muted)', textAlign: 'center', paddingTop: '24px' }}>
              Carrito vacío
            </div>
          ) : (
            cart.map(item => (
              <div key={item.productId} style={{
                padding: '10px', background: 'var(--bg)', borderRadius: 'var(--radius)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: '500' }}>{item.nombre}</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                    ×{item.cantidad} @ ${item.precio.toLocaleString('es-AR')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    onClick={() => decrementCart(item.productId)}
                    style={{ padding: '2px 6px', background: 'var(--line)', color: 'var(--text)', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' }}
                  >−</button>
                  <button
                    onClick={() => removeFromCart(item.productId)}
                    style={{ padding: '2px 6px', background: 'var(--danger)', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' }}
                  >✕</button>
                </div>
              </div>
            ))
          )}
        </div>

        {cart.length > 0 && (
          <>
            <div style={{ padding: '12px', background: 'var(--bg)', borderRadius: 'var(--radius)', marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '600' }}>
                <span>Total:</span>
                <span style={{ fontFamily: 'monospace' }}>${total.toLocaleString('es-AR')}</span>
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', fontWeight: '600', color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                Método de pago
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {(Object.keys(PAYMENT_METHOD_MAP) as PaymentLabel[]).map(method => (
                  <button
                    key={method}
                    onClick={() => setPaymentMethod(method)}
                    style={{
                      padding: '8px', background: paymentMethod === method ? 'var(--accent)' : 'var(--line)',
                      color: paymentMethod === method ? 'white' : 'var(--text)',
                      border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer',
                      fontSize: '11px', fontWeight: '500', textAlign: 'center',
                    }}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div style={{
                padding: '8px', background: 'rgba(255, 0, 0, 0.1)',
                border: '1px solid rgba(255, 0, 0, 0.3)', borderRadius: 'var(--radius)',
                color: 'rgba(255, 100, 100, 1)', fontSize: '11px', marginBottom: '12px',
              }}>
                {error}
              </div>
            )}

            <button
              onClick={handleConfirmOrder}
              disabled={submitting}
              style={{
                width: '100%', padding: '12px 16px',
                background: submitting ? 'var(--muted)' : 'var(--success)',
                color: 'white', border: 'none', borderRadius: 'var(--radius)',
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontSize: '13px', fontWeight: '600', opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? 'Confirmando...' : 'Confirmar Pedido'}
            </button>
          </>
        )}

        <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--line)' }}>
          <button
            onClick={logout}
            style={{
              width: '100%', padding: '10px 16px', background: 'transparent',
              color: 'var(--muted)', border: '1px solid var(--line)',
              borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: '12px', fontWeight: '500',
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
