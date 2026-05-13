'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

const SESSION_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours

export function useSessionValidation(roomNumber: number) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [validating, setValidating] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isNaN(roomNumber) || roomNumber < 1 || roomNumber > 24) {
      setError('Habitación inválida');
      setValidating(false);
      setTimeout(() => router.push('/'), 2000);
      return;
    }

    const validate = async () => {
      const storedCode = sessionStorage.getItem(`room-${roomNumber}-code`);
      const storedTimestamp = sessionStorage.getItem(`room-${roomNumber}-timestamp`);

      if (!storedCode || !storedTimestamp) {
        setError('Acceso denegado. Por favor ingresa desde el inicio');
        setValidating(false);
        setTimeout(() => router.push('/'), 2000);
        return;
      }

      const sessionAge = Date.now() - parseInt(storedTimestamp);
      if (sessionAge > SESSION_TIMEOUT_MS) {
        sessionStorage.removeItem(`room-${roomNumber}-code`);
        sessionStorage.removeItem(`room-${roomNumber}-timestamp`);
        setError('Sesión expirada. Por favor ingresa nuevamente');
        setValidating(false);
        setTimeout(() => router.push('/'), 2000);
        return;
      }

      try {
        const roomSnap = await getDoc(doc(db, 'hotels', 'efi-hotel', 'rooms', String(roomNumber)));

        if (!roomSnap.exists()) {
          setError('Habitación no encontrada');
          setValidating(false);
          setTimeout(() => router.push('/'), 2000);
          return;
        }

        const roomData = roomSnap.data();
        if (roomData?.estado !== 'ocupada') {
          setError('La habitación no está disponible');
          setValidating(false);
          setTimeout(() => router.push('/'), 2000);
          return;
        }

        const roomGuestCode = String(roomData.guestCode || '').padStart(6, '0');
        const storedGuestCode = storedCode.padStart(6, '0');

        if (roomGuestCode !== storedGuestCode) {
          sessionStorage.removeItem(`room-${roomNumber}-code`);
          sessionStorage.removeItem(`room-${roomNumber}-timestamp`);
          setError('Código de huésped inválido');
          setValidating(false);
          setTimeout(() => router.push('/'), 2000);
          return;
        }

        setAuthorized(true);
        setValidating(false);
      } catch {
        setError('Error al validar acceso');
        setValidating(false);
        setTimeout(() => router.push('/'), 2000);
      }
    };

    validate();
  }, [roomNumber, router]);

  const logout = useCallback(() => {
    sessionStorage.removeItem(`room-${roomNumber}-code`);
    sessionStorage.removeItem(`room-${roomNumber}-timestamp`);
    router.push('/');
  }, [roomNumber, router]);

  return { authorized, validating, error, logout };
}
