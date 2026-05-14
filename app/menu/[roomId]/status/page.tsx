'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';

export default function OrderStatusPage() {
  const params = useParams();
  const roomId = Array.isArray(params.roomId) ? params.roomId[0] : params.roomId;

  useEffect(() => {
    window.location.replace(`/menu/${roomId}`);
  }, [roomId]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--bg)', color: 'var(--muted)', fontSize: 13 }}>
      Redirigiendo...
    </div>
  );
}
