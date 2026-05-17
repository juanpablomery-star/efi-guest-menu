'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { Product, CartItem, Order, PaymentSplit } from '@/lib/types';
import { useSessionValidation } from '@/lib/hooks/useSessionValidation';

const PAYMENT_METHODS = ['Efectivo', 'Tarjeta débito', 'Tarjeta crédito', 'Transferencia', 'MercadoPago', 'Motel Now'] as const;
type PaymentMethod = typeof PAYMENT_METHODS[number];

const METHOD_TO_KEY: Record<PaymentMethod, string> = {
  'Efectivo': 'cash',
  'Tarjeta débito': 'debit',
  'Tarjeta crédito': 'credit',
  'Transferencia': 'transfer',
  'MercadoPago': 'mercadopago',
  'Motel Now': 'motelnow',
};

const KEY_TO_LABEL: Record<string, string> = {
  cash: 'Efectivo',
  debit: 'Tarjeta débito',
  credit: 'Tarjeta crédito',
  transfer: 'Transferencia',
  mercadopago: 'MercadoPago',
  motelnow: 'Motel Now',
};

const STATUS_CFG = {
  pending:   { label: 'Pendiente',      color: '#F59E0B', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.3)'  },
  accepted:  { label: 'En preparación', color: '#3B82F6', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.3)'  },
  delivered: { label: 'Entregado',      color: '#10B981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.3)' },
  cancelled: { label: 'Anulado',        color: '#6B7280', bg: 'rgba(107,114,128,0.06)', border: 'rgba(107,114,128,0.2)' },
};

function formatDate(ts: Order['createdAt']) {
  if (!ts) return '';
  return ts.toDate().toLocaleString('es-AR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function paymentLabel(order: Order) {
  if (order.paymentSplits?.length) {
    return order.paymentSplits.map(s => s.metodoPago).join(' + ');
  }
  return KEY_TO_LABEL[order.paymentMethod] || order.paymentMethod;
}

// ── Order card ─────────────────────────────────────────────────────────────────
function OrderCard({ order }: { order: Order }) {
  const s = STATUS_CFG[order.status as keyof typeof STATUS_CFG] || STATUS_CFG.delivered;
  const isActive = order.status === 'pending' || order.status === 'accepted';
  const isCancelled = order.status === 'cancelled';
  const stepIdx = ['pending', 'accepted', 'delivered'].indexOf(order.status);

  return (
    <div style={{
      padding: 14, background: s.bg, border: `1px solid ${s.border}`,
      borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column', gap: 8,
      opacity: isCancelled ? 0.7 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{formatDate(order.createdAt)}</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {order.editado && !isCancelled && (
            <span style={{ fontSize: 10, fontWeight: 600, color: '#F59E0B', background: 'rgba(245,158,11,0.12)', padding: '1px 6px', borderRadius: 4 }}>
              Modificado
            </span>
          )}
          <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{s.label}</span>
        </div>
      </div>

      <div style={{ fontSize: 13, color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: 2, textDecoration: isCancelled ? 'line-through' : 'none' }}>
        {order.items.map((item, i) => (
          <span key={i}>{item.cantidad}× {item.nombre}</span>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{paymentLabel(order)}</span>
          {order.source === 'reception' && (
            <span style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--line)', padding: '1px 6px', borderRadius: 4, alignSelf: 'flex-start' }}>
              Registrado por recepción
            </span>
          )}
          {isCancelled && order.cancellationReason && (
            <span style={{ fontSize: 10, color: '#EF4444', background: 'rgba(239,68,68,0.1)', padding: '2px 6px', borderRadius: 4, alignSelf: 'flex-start', marginTop: 4 }}>
              {order.cancellationReason}
            </span>
          )}
        </div>
        <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, textDecoration: isCancelled ? 'line-through' : 'none', color: isCancelled ? 'var(--muted)' : 'var(--text)' }}>
          ${order.total.toLocaleString('es-AR')}
        </span>
      </div>

      {isActive && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
          {(['pending', 'accepted', 'delivered'] as const).map((step, i) => (
            <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%',
                background: i <= stepIdx ? s.color : 'var(--line)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 700, color: i <= stepIdx ? 'white' : 'var(--muted)',
                transition: 'background 0.3s',
              }}>{i + 1}</div>
              {i < 2 && <div style={{ width: 16, height: 2, background: i < stepIdx ? s.color : 'var(--line)', transition: 'background 0.3s' }} />}
            </div>
          ))}
          <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>
            {order.status === 'pending' ? 'Esperando confirmación' : 'Preparando tu pedido...'}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function MenuPage() {
  const params = useParams();
  const roomId = Array.isArray(params.roomId) ? params.roomId[0] : params.roomId;
  const roomNumber = parseInt(roomId);

  const { authorized, validating, error: authError, roomClosed, validateRoomStatus, logout } = useSessionValidation(roomNumber);

  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);

  const [view, setView] = useState<'home' | 'ordering'>('home');
  const [isMobile, setIsMobile] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMode, setPaymentMode] = useState<'single' | 'split'>('single');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Efectivo');
  const [splits, setSplits] = useState<PaymentSplit[]>([{ metodoPago: '', monto: 0 }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const update = () => {
      const mobile = window.innerWidth < 640;
      setIsMobile(mobile);
      setSidebarOpen(!mobile);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Restore cart
  useEffect(() => {
    if (!authorized || isNaN(roomNumber)) return;
    try {
      const saved = localStorage.getItem(`cart-${roomNumber}`);
      if (saved) setCart(JSON.parse(saved) as CartItem[]);
    } catch { /* storage unavailable */ }
  }, [authorized, roomNumber]);

  // Persist cart
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

  // Products (real-time)
  useEffect(() => {
    if (!authorized) return;
    return onSnapshot(
      collection(db, 'hotels', 'efi-hotel', 'products'),
      (snap) => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
        setProducts(all.filter(p =>
          !p.deleted
          && p.subcategoria !== 'cortesia'
          && p.precio > 0
          && p.stock > 0
        ));
        setProductsLoading(false);
      },
      () => setProductsLoading(false)
    );
  }, [authorized]);

  // Orders (real-time)
  useEffect(() => {
    if (!authorized || isNaN(roomNumber)) return;
    return onSnapshot(
      query(collection(db, 'hotels', 'efi-hotel', 'orders'), where('roomId', '==', roomNumber)),
      (snap) => {
        const data = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as Order))
          .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
        setOrders(data);
        setOrdersLoading(false);
      },
      () => setOrdersLoading(false)
    );
  }, [authorized, roomNumber]);

  const groupedProducts = useMemo(() => {
    const g: Record<string, Product[]> = {};
    products.forEach(p => {
      if (!g[p.categoria]) g[p.categoria] = [];
      g[p.categoria].push(p);
    });
    return g;
  }, [products]);

  const filteredProducts = useMemo(() => {
    let result = selectedCategory ? { [selectedCategory]: groupedProducts[selectedCategory] || [] } : groupedProducts;

    if (!searchQuery.trim()) return result;

    const query = searchQuery.toLowerCase();
    const filtered: Record<string, Product[]> = {};

    Object.entries(result).forEach(([cat, items]) => {
      const matches = items.filter(p => p.nombre.toLowerCase().includes(query));
      if (matches.length > 0) filtered[cat] = matches;
    });

    return filtered;
  }, [groupedProducts, selectedCategory, searchQuery]);

  const cartTotal = useMemo(() => cart.reduce((s, i) => s + i.precio * i.cantidad, 0), [cart]);
  const cartCount = cart.reduce((s, i) => s + i.cantidad, 0);
  const splitTotal = splits.reduce((s, sp) => s + sp.monto, 0);
  const splitsValid = paymentMode === 'single'
    ? true
    : splits.every(sp => sp.metodoPago && sp.monto > 0) && splitTotal === cartTotal;

  const activeOrders = orders.filter(o => o.status === 'pending' || o.status === 'accepted');
  const pastOrders = orders.filter(o => o.status === 'delivered' || o.status === 'cancelled');

  const addToCart = useCallback((product: Product) => {
    setCart(prev => {
      const ex = prev.find(i => i.productId === product.id);
      if (ex) return prev.map(i => i.productId === product.id ? { ...i, cantidad: i.cantidad + 1 } : i);
      return [...prev, { productId: product.id, nombre: product.nombre, precio: product.precio, cantidad: 1 }];
    });
  }, []);

  const decrementCart = useCallback((productId: string) => {
    setCart(prev => prev.map(i =>
      i.productId === productId && i.cantidad > 1 ? { ...i, cantidad: i.cantidad - 1 } : i
    ));
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart(prev => prev.filter(i => i.productId !== productId));
  }, []);

  const updateSplit = (idx: number, s: PaymentSplit) =>
    setSplits(prev => prev.map((sp, i) => i === idx ? s : sp));

  const removeSplit = (idx: number) =>
    setSplits(prev => prev.filter((_, i) => i !== idx));

  const handleConfirmOrder = async () => {
    if (cart.length === 0) return setError('El carrito está vacío');

    for (const item of cart) {
      const p = products.find(p => p.id === item.productId);
      if (!p) {
        setError(`"${item.nombre}" ya no está disponible`);
        setCart(prev => prev.filter(i => i.productId !== item.productId));
        return;
      }
      if (p.stock < item.cantidad) {
        setError(`Stock insuficiente para "${item.nombre}". Disponible: ${p.stock}`);
        return;
      }
    }

    if (!splitsValid) return setError('Los montos del pago dividido no coinciden con el total');

    setSubmitting(true);
    setError('');

    try {
      // Validate room status before confirming order
      const statusValidation = await validateRoomStatus();
      if (!statusValidation.valid) {
        setError(statusValidation.message);
        setSubmitting(false);
        return;
      }
      const orderData: Record<string, unknown> = {
        hotelId: 'efi-hotel',
        roomId: roomNumber,
        items: cart.map(i => ({ productId: i.productId, nombre: i.nombre, cantidad: i.cantidad, precio: i.precio })),
        status: 'pending',
        source: 'qr',
        createdAt: serverTimestamp(),
        total: cartTotal,
      };

      if (paymentMode === 'split') {
        orderData.paymentMethod = METHOD_TO_KEY[splits[0]?.metodoPago as PaymentMethod] || 'cash';
        orderData.paymentSplits = splits.filter(s => s.metodoPago && s.monto > 0);
      } else {
        orderData.paymentMethod = METHOD_TO_KEY[paymentMethod];
      }

      await addDoc(collection(db, 'hotels', 'efi-hotel', 'orders'), orderData);

      setCart([]);
      localStorage.removeItem(`cart-${roomNumber}`);
      setPaymentMode('single');
      setPaymentMethod('Efectivo');
      setSplits([{ metodoPago: '', monto: 0 }]);
      setView('home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al confirmar pedido');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Auth guard ─────────────────────────────────────────────────────────────
  if (validating || !authorized) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', flexDirection: 'column', gap: 16, background: 'var(--bg)', padding: 20 }}>
        {authError ? (
          <>
            <div style={{ padding: 20, background: 'rgba(255,0,0,0.1)', border: '1px solid rgba(255,0,0,0.3)', borderRadius: 8, color: 'rgba(255,100,100,1)', textAlign: 'center' }}>{authError}</div>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>Redirigiendo a inicio...</p>
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Validando acceso...</div>
        )}
      </div>
    );
  }

  // ── Ordering overlay ────────────────────────────────────────────────────────
  if (view === 'ordering') {
    const cartPanel = (
      <div style={{
        width: isMobile ? '100%' : 290,
        flexShrink: 0,
        background: 'var(--surface)',
        borderLeft: isMobile ? 'none' : '1px solid var(--line)',
        borderTop: isMobile ? '1px solid var(--line)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        padding: 16,
        gap: 10,
        ...(isMobile ? {} : { overflowY: 'auto' }),
      }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          Carrito {cartCount > 0 && <span style={{ color: 'var(--accent)' }}>({cartCount})</span>}
        </div>

        {/* Items */}
        {cart.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--muted)', paddingTop: 8 }}>Carrito vacío</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, ...(isMobile ? {} : { maxHeight: 180, overflowY: 'auto' }) }}>
            {cart.map(item => (
              <div key={item.productId} style={{
                padding: '7px 10px', background: 'var(--bg)', borderRadius: 'var(--radius)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{item.nombre}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>×{item.cantidad} · ${item.precio.toLocaleString('es-AR')}</div>
                </div>
                <div style={{ display: 'flex', gap: 3 }}>
                  <button onClick={() => decrementCart(item.productId)} style={{ padding: '2px 7px', background: 'var(--line)', color: 'var(--text)', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 12 }}>−</button>
                  <button onClick={() => removeFromCart(item.productId)} style={{ padding: '2px 7px', background: 'var(--danger)', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 12 }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {cart.length > 0 && (
          <>
            {/* Total */}
            <div style={{ padding: '9px 12px', background: 'var(--bg)', borderRadius: 'var(--radius)', display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
              <span>Total</span>
              <span style={{ fontFamily: 'monospace' }}>${cartTotal.toLocaleString('es-AR')}</span>
            </div>

            {/* Payment mode */}
            <div style={{ display: 'flex', gap: 6 }}>
              {(['single', 'split'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setPaymentMode(mode)}
                  style={{
                    flex: 1, padding: '7px 8px', fontSize: 11, fontWeight: 600,
                    background: paymentMode === mode ? 'var(--text)' : 'var(--surface)',
                    color: paymentMode === mode ? 'var(--bg)' : 'var(--text)',
                    border: '1px solid var(--line)', borderRadius: 'var(--radius)', cursor: 'pointer',
                  }}
                >{mode === 'single' ? 'Pago único' : 'Dividido'}</button>
              ))}
            </div>

            {/* Single method */}
            {paymentMode === 'single' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                {PAYMENT_METHODS.map(m => (
                  <button
                    key={m}
                    onClick={() => setPaymentMethod(m)}
                    style={{
                      padding: '7px 5px', fontSize: 10, fontWeight: 600, textAlign: 'center',
                      background: paymentMethod === m ? 'var(--accent)' : 'var(--line)',
                      color: paymentMethod === m ? 'white' : 'var(--text)',
                      border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer',
                    }}
                  >{m}</button>
                ))}
              </div>
            )}

            {/* Split payment */}
            {paymentMode === 'split' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {splits.map((split, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    <select
                      value={split.metodoPago}
                      onChange={e => updateSplit(idx, { ...split, metodoPago: e.target.value })}
                      style={{ flex: 1, padding: '7px 8px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', fontSize: 11 }}
                    >
                      <option value="">Método...</option>
                      {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <input
                      type="number"
                      value={split.monto || ''}
                      onChange={e => updateSplit(idx, { ...split, monto: parseInt(e.target.value) || 0 })}
                      placeholder="Monto"
                      style={{ width: 80, padding: '7px 8px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', fontSize: 11 }}
                    />
                    {splits.length > 1 && (
                      <button onClick={() => removeSplit(idx)} style={{ padding: '7px 8px', background: 'var(--danger)', color: 'white', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 11 }}>✕</button>
                    )}
                  </div>
                ))}
                {splitTotal < cartTotal && (
                  <button
                    onClick={() => setSplits(prev => [...prev, { metodoPago: '', monto: cartTotal - splitTotal }])}
                    style={{ padding: '6px', background: 'transparent', color: 'var(--muted)', border: '1px dashed var(--line)', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 11 }}
                  >+ Agregar método</button>
                )}
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: splitTotal === cartTotal ? '#10B981' : '#F59E0B' }}>
                  {splitTotal === cartTotal ? '✔ Total cubierto' : `Falta: $${(cartTotal - splitTotal).toLocaleString('es-AR')}`}
                </div>
              </div>
            )}

            {error && (
              <div style={{ padding: '8px 10px', background: 'rgba(255,0,0,0.08)', border: '1px solid rgba(255,0,0,0.2)', borderRadius: 'var(--radius)', color: 'rgba(255,100,100,1)', fontSize: 11 }}>
                {error}
              </div>
            )}

            <button
              onClick={handleConfirmOrder}
              disabled={submitting}
              style={{
                padding: '12px', background: submitting ? 'var(--muted)' : 'var(--success)',
                color: 'white', border: 'none', borderRadius: 'var(--radius)',
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 700, opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? 'Confirmando...' : 'Confirmar Pedido'}
            </button>
          </>
        )}
      </div>
    );

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--line)', background: 'var(--surface)', flexShrink: 0, gap: 12 }}>
          <button
            onClick={() => { setView('home'); setError(''); }}
            style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: 22, padding: '0 4px', lineHeight: 1 }}
          >←</button>
          <span style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>Nuevo Pedido</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Hab. {String(roomNumber).padStart(2, '0')}</span>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', overflow: isMobile ? 'auto' : 'hidden', position: 'relative' }}>
          {/* Hamburger button - only on mobile */}
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{
                position: 'absolute', top: 4, left: 4, zIndex: 100,
                background: 'none', border: 'none', color: 'var(--text)',
                cursor: 'pointer', fontSize: 22, padding: '8px', lineHeight: 1,
              }}
            >☰</button>
          )}

          {/* Sidebar with categories */}
          {(sidebarOpen || !isMobile) && (
            <div style={{
              position: isMobile ? 'absolute' : 'relative',
              top: 0, left: 0, zIndex: 99,
              width: isMobile ? 220 : 200,
              flexShrink: 0,
              background: 'var(--surface)',
              borderRight: isMobile ? 'none' : '1px solid var(--line)',
              borderBottom: isMobile ? '1px solid var(--line)' : 'none',
              display: 'flex', flexDirection: 'column',
              overflowY: 'auto',
              maxHeight: isMobile ? 'calc(100vh - 150px)' : '100%',
            }}>
              <div style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--line)' }}>
                Categorías
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <button
                  onClick={() => {
                    setSelectedCategory(null);
                    if (isMobile) setSidebarOpen(false);
                  }}
                  style={{
                    padding: '10px 14px', background: selectedCategory === null ? 'var(--accent)' : 'transparent',
                    color: selectedCategory === null ? 'white' : 'var(--text)',
                    border: 'none', textAlign: 'left', cursor: 'pointer',
                    fontSize: 13, fontWeight: selectedCategory === null ? 600 : 500,
                    borderBottom: '1px solid var(--line)',
                  }}
                >
                  Todo {products.length > 0 && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>({products.length})</span>}
                </button>
                {Object.keys(groupedProducts).map(cat => (
                  <button
                    key={cat}
                    onClick={() => {
                      setSelectedCategory(cat);
                      if (isMobile) setSidebarOpen(false);
                    }}
                    style={{
                      padding: '10px 14px', background: selectedCategory === cat ? 'var(--accent)' : 'transparent',
                      color: selectedCategory === cat ? 'white' : 'var(--text)',
                      border: 'none', textAlign: 'left', cursor: 'pointer',
                      fontSize: 13, fontWeight: selectedCategory === cat ? 600 : 500,
                      borderBottom: '1px solid var(--line)',
                    }}
                  >
                    {cat} <span style={{ fontSize: 11, color: selectedCategory === cat ? 'rgba(255,255,255,0.7)' : 'var(--muted)', marginLeft: 6 }}>({groupedProducts[cat]?.length || 0})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Overlay backdrop on mobile when sidebar is open */}
          {isMobile && sidebarOpen && (
            <div
              onClick={() => setSidebarOpen(false)}
              style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.3)', zIndex: 98,
              }}
            />
          )}

          {/* Product catalog */}
          <div style={{ flex: 1, overflowY: isMobile ? 'visible' : 'auto', padding: 16, paddingTop: isMobile ? 50 : 16, display: 'flex', flexDirection: 'column' }}>
            {/* Search bar */}
            <div style={{ marginBottom: 16, position: 'relative' }}>
              <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 16 }}>🔍</div>
              <input
                type="text"
                placeholder="Buscar productos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px 10px 40px',
                  border: '1px solid var(--line)', borderRadius: 'var(--radius)',
                  background: 'var(--surface)', color: 'var(--text)',
                  fontSize: 13, outline: 'none',
                }}
              />
            </div>

            {productsLoading ? (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>Cargando productos...</div>
            ) : Object.keys(filteredProducts).length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', paddingTop: 20 }}>
                {searchQuery ? 'No hay productos que coincidan con tu búsqueda' : 'No hay productos disponibles'}
              </div>
            ) : (
              Object.entries(filteredProducts).map(([cat, items]) =>
                items.length > 0 && (
                  <div key={cat} style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10, letterSpacing: '0.06em' }}>{cat}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {items.map(product => {
                        const qty = cart.find(i => i.productId === product.id)?.cantidad || 0;
                        return (
                          <div key={product.id} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '11px 13px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
                          }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 500 }}>{product.nombre}</div>
                              <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace', marginTop: 2 }}>
                                ${product.precio.toLocaleString('es-AR')}
                                {product.stock <= 3 && <span style={{ marginLeft: 8, color: '#F59E0B', fontSize: 10 }}>Últimas {product.stock}</span>}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {qty > 0 && (
                                <>
                                  <button onClick={() => decrementCart(product.id)} style={{ width: 28, height: 28, background: 'var(--line)', color: 'var(--text)', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 14 }}>−</button>
                                  <span style={{ fontFamily: 'monospace', fontSize: 13, minWidth: 16, textAlign: 'center' }}>{qty}</span>
                                </>
                              )}
                              <button
                                onClick={() => addToCart(product)}
                                disabled={qty >= product.stock}
                                style={{
                                  width: 28, height: 28,
                                  background: qty >= product.stock ? 'var(--muted)' : 'var(--accent)',
                                  color: 'white', border: 'none', borderRadius: 'var(--radius)',
                                  cursor: qty >= product.stock ? 'not-allowed' : 'pointer', fontSize: 14,
                                }}
                              >+</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )
              )
            )}
          </div>

          {/* Cart panel */}
          {cartPanel}
        </div>
      </div>
    );
  }

  // ── Home view ───────────────────────────────────────────────────────────────
  const totalGastado = orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--line)', background: 'var(--surface)', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>EFI Hotel</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Habitación {String(roomNumber).padStart(2, '0')}</div>
        </div>
        <button
          onClick={logout}
          style={{ background: 'none', border: '1px solid var(--line)', color: 'var(--muted)', padding: '6px 12px', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 12 }}
        >Salir</button>
      </div>

      <div style={{ flex: 1, padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 540, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>

        {/* Active orders */}
        {!ordersLoading && activeOrders.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10, letterSpacing: '0.06em' }}>
              Pedido en curso
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activeOrders.map(o => <OrderCard key={o.id} order={o} />)}
            </div>
          </div>
        )}

        {/* CTA */}
        <button
          onClick={() => { setError(''); setView('ordering'); }}
          style={{
            width: '100%', padding: '16px', background: 'var(--success)',
            color: 'white', border: 'none', borderRadius: 'var(--radius)',
            cursor: 'pointer', fontSize: 15, fontWeight: 700,
          }}
        >
          + Hacer un nuevo pedido
        </button>

        {/* History */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.06em' }}>Historial</span>
            {totalGastado > 0 && (
              <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace' }}>
                Total: <strong style={{ color: 'var(--text)' }}>${totalGastado.toLocaleString('es-AR')}</strong>
              </span>
            )}
          </div>

          {ordersLoading ? (
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Cargando...</div>
          ) : orders.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--muted)', padding: '20px 0', textAlign: 'center' }}>
              Aún no hay pedidos. ¡Hacé el primero!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pastOrders.map(o => <OrderCard key={o.id} order={o} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
