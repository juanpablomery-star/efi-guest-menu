'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Order } from '@/lib/types';
import type { Timestamp } from 'firebase/firestore';

interface OrderHistoryProps {
  roomId: number;
}

const STATUS_CONFIG = {
  pending:   { label: '⏳ Pendiente',  color: '#FFA500', bgColor: 'rgba(255, 165, 0, 0.1)' },
  accepted:  { label: '✅ Aceptado',   color: '#3B82F6', bgColor: 'rgba(59, 130, 246, 0.1)' },
  delivered: { label: '✔️ Entregado', color: '#10B981', bgColor: 'rgba(16, 185, 129, 0.1)' },
  cancelled: { label: '❌ Cancelado',  color: '#EF4444', bgColor: 'rgba(239, 68, 68, 0.1)' },
};

export default function OrderHistory({ roomId }: OrderHistoryProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalSpent, setTotalSpent] = useState(0);

  useEffect(() => {
    const q = query(
      collection(db, 'hotels', 'efi-hotel', 'orders'),
      where('roomId', '==', roomId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as Order))
          .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
        setOrders(data);
        setTotalSpent(data.reduce((sum, o) => sum + o.total, 0));
        setLoading(false);
      },
      () => setLoading(false)
    );

    return unsubscribe;
  }, [roomId]);

  const formatDate = (timestamp: Timestamp | null) => {
    if (!timestamp) return 'N/A';
    return timestamp.toDate().toLocaleString('es-AR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return <div style={{ padding: '16px', color: 'var(--muted)' }}>Cargando historial...</div>;
  }

  if (orders.length === 0) {
    return <div style={{ padding: '16px', color: 'var(--muted)' }}>No hay órdenes</div>;
  }

  return (
    <div style={{ padding: '16px', overflow: 'auto' }}>
      <div style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--line)' }}>
        <h2 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Historial de Pedidos</h2>
        <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
          Total gastado: <span style={{ fontWeight: '600', color: 'var(--text)', fontFamily: 'monospace' }}>
            ${totalSpent.toLocaleString('es-AR')}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {orders.map(order => {
          const status = order.status as keyof typeof STATUS_CONFIG;
          const statusInfo = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

          return (
            <div
              key={order.id}
              style={{
                padding: '12px',
                background: statusInfo.bgColor,
                border: `1px solid ${statusInfo.color}`,
                borderRadius: 'var(--radius)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px' }}>
                <span style={{ color: 'var(--muted)' }}>{formatDate(order.createdAt)}</span>
                <span style={{ color: statusInfo.color, fontWeight: '600' }}>{statusInfo.label}</span>
              </div>

              <div style={{ marginBottom: '8px', fontSize: '12px' }}>
                {order.items.map((item, idx) => (
                  <div key={idx} style={{ color: 'var(--text)' }}>
                    {item.cantidad}× {item.nombre}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '600' }}>
                <span style={{ color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase' }}>Total</span>
                <span style={{ fontFamily: 'monospace' }}>${order.total.toLocaleString('es-AR')}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
