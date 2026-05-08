'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { Order } from '@/lib/types';

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  debit: 'Tarjeta débito',
  credit: 'Tarjeta crédito',
  transfer: 'Transferencia',
  mercadopago: 'MercadoPago',
};

const STATUS_CONFIG = {
  pending: {
    emoji: '⏳',
    title: 'Esperando confirmación',
    subtitle: 'Tu pedido fue recibido y está siendo revisado',
    color: '#F59E0B',
  },
  accepted: {
    emoji: '✅',
    title: 'Pedido confirmado',
    subtitle: 'El personal está preparando tu pedido',
    color: '#3B82F6',
  },
  delivered: {
    emoji: '🎉',
    title: '¡Pedido entregado!',
    subtitle: 'Disfruta tu pedido. Podés hacer otro cuando quieras.',
    color: '#10B981',
  },
};

export default function OrderStatusPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const roomId = Array.isArray(params.roomId) ? params.roomId[0] : params.roomId;
  const roomNumber = parseInt(roomId);
  const orderId = searchParams.get('orderId');

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [authorized, setAuthorized] = useState(false);

  // Validate session (same as menu page)
  useEffect(() => {
    const validateRoom = async () => {
      try {
        if (isNaN(roomNumber) || roomNumber < 1 || roomNumber > 24) {
          setError('Habitación inválida');
          setTimeout(() => router.push('/'), 2000);
          return;
        }

        const storedCode = sessionStorage.getItem(`room-${roomNumber}-code`);
        const storedTimestamp = sessionStorage.getItem(`room-${roomNumber}-timestamp`);

        if (!storedCode || !storedTimestamp) {
          setError('Acceso denegado. Por favor ingresa desde el inicio');
          setTimeout(() => router.push('/'), 2000);
          return;
        }

        const sessionAge = Date.now() - parseInt(storedTimestamp);
        if (sessionAge > 4 * 60 * 60 * 1000) {
          sessionStorage.removeItem(`room-${roomNumber}-code`);
          sessionStorage.removeItem(`room-${roomNumber}-timestamp`);
          setError('Sesión expirada. Por favor ingresa nuevamente');
          setTimeout(() => router.push('/'), 2000);
          return;
        }

        const roomRef = doc(db, 'hotels', 'efi-hotel', 'rooms', String(roomNumber));
        const roomSnap = await getDoc(roomRef);
        const roomData = roomSnap.data();

        if (!roomSnap.exists() || roomData?.estado !== 'ocupada') {
          setError('La habitación no está disponible');
          setTimeout(() => router.push('/'), 2000);
          return;
        }

        const roomGuestCode = String(roomData.guestCode || '').padStart(6, '0');
        const storedGuestCode = String(storedCode || '').padStart(6, '0');
        if (roomGuestCode !== storedGuestCode) {
          sessionStorage.removeItem(`room-${roomNumber}-code`);
          setError('Código de huésped inválido');
          setTimeout(() => router.push('/'), 2000);
          return;
        }

        setAuthorized(true);
      } catch {
        setError('Error al validar acceso');
        setTimeout(() => router.push('/'), 2000);
      }
    };

    validateRoom();
  }, [roomNumber, router]);

  // Real-time order status
  useEffect(() => {
    if (!authorized || !orderId) {
      if (authorized && !orderId) setError('No se encontró el pedido');
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, 'hotels', 'efi-hotel', 'orders', orderId),
      (snap) => {
        if (snap.exists()) {
          setOrder({ id: snap.id, ...snap.data() } as Order);
        } else {
          setError('Pedido no encontrado');
        }
        setLoading(false);
      },
      () => {
        setError('Error al cargar el pedido');
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [authorized, orderId]);

  const handleLogout = () => {
    sessionStorage.removeItem(`room-${roomNumber}-code`);
    sessionStorage.removeItem(`room-${roomNumber}-timestamp`);
    router.push('/');
  };

  if (!authorized) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        minHeight: '100vh', padding: '20px', flexDirection: 'column', gap: '16px',
        background: 'var(--bg)',
      }}>
        <div style={{
          padding: '20px', background: 'rgba(255, 0, 0, 0.1)',
          border: '1px solid rgba(255, 0, 0, 0.3)', borderRadius: '8px',
          color: 'rgba(255, 100, 100, 1)', textAlign: 'center',
        }}>
          {error || 'Validando acceso...'}
        </div>
        <p style={{ fontSize: '13px', color: 'var(--muted)' }}>Redirigiendo a inicio...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', color: 'var(--muted)' }}>
        Cargando estado del pedido...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--danger)' }}>{error}</div>
        <button
          onClick={() => router.push(`/menu/${roomId}`)}
          style={{ padding: '10px 16px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: '13px' }}
        >
          Volver al menú
        </button>
      </div>
    );
  }

  const status = (order?.status || 'pending') as keyof typeof STATUS_CONFIG;
  const statusInfo = STATUS_CONFIG[status] || STATUS_CONFIG.pending;

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      minHeight: '100vh', padding: '20px', background: 'var(--bg)',
    }}>
      <div style={{
        width: '100%', maxWidth: '420px', padding: '32px',
        background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 'var(--radius-lg)',
      }}>
        <div style={{ fontSize: '56px', textAlign: 'center', marginBottom: '16px' }}>
          {statusInfo.emoji}
        </div>

        <h1 style={{ fontSize: '20px', fontWeight: '700', textAlign: 'center', marginBottom: '8px', color: statusInfo.color }}>
          {statusInfo.title}
        </h1>

        <p style={{ fontSize: '13px', color: 'var(--muted)', textAlign: 'center', marginBottom: '24px' }}>
          {statusInfo.subtitle}
        </p>

        {/* Progress indicators */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '24px' }}>
          {(['pending', 'accepted', 'delivered'] as const).map((s, i) => {
            const stepIndex = ['pending', 'accepted', 'delivered'].indexOf(status);
            const isDone = i <= stepIndex;
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: isDone ? statusInfo.color : 'var(--line)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', fontWeight: '700', color: isDone ? 'white' : 'var(--muted)',
                  transition: 'background 0.3s',
                }}>
                  {i + 1}
                </div>
                {i < 2 && (
                  <div style={{
                    width: 24, height: 2,
                    background: i < stepIndex ? statusInfo.color : 'var(--line)',
                    transition: 'background 0.3s',
                  }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Order summary */}
        <div style={{ padding: '16px', background: 'var(--bg)', borderRadius: 'var(--radius)', marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '12px' }}>
            Resumen del pedido
          </div>

          {order?.items && order.items.map((item, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', fontSize: '13px',
              marginBottom: i < order.items.length - 1 ? '8px' : '0',
              paddingBottom: i < order.items.length - 1 ? '8px' : '0',
              borderBottom: i < order.items.length - 1 ? '1px solid var(--line)' : 'none',
            }}>
              <span>{item.nombre} ×{item.cantidad}</span>
              <span style={{ fontFamily: 'monospace' }}>${(item.precio * item.cantidad).toLocaleString('es-AR')}</span>
            </div>
          ))}

          <div style={{
            display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: '600',
            marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--line)',
          }}>
            <span>Total:</span>
            <span style={{ fontFamily: 'monospace' }}>${order?.total.toLocaleString('es-AR')}</span>
          </div>

          {order?.paymentMethod && (
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--line)' }}>
              Método: {PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            onClick={() => router.push(`/menu/${roomId}`)}
            style={{
              width: '100%', padding: '12px 16px', background: 'var(--accent)',
              color: 'white', border: 'none', borderRadius: 'var(--radius)',
              cursor: 'pointer', fontSize: '13px', fontWeight: '600',
            }}
          >
            Hacer otro pedido
          </button>

          <button
            onClick={handleLogout}
            style={{
              width: '100%', padding: '12px 16px', background: 'transparent',
              color: 'var(--muted)', border: '1px solid var(--line)',
              borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
