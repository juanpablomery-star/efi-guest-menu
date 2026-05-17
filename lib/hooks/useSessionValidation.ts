'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

const SESSION_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours
const ROOM_STATUS_CHECK_INTERVAL = 30000; // 30 seconds

export function useSessionValidation(roomNumber: number) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [validating, setValidating] = useState(true);
  const [error, setError] = useState('');
  const [roomClosed, setRoomClosed] = useState(false);
  const statusCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isNaN(roomNumber) || roomNumber < 1 || roomNumber > 24 || roomNumber === 13) {
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

  // Periodic room status check (every 30 seconds)
  useEffect(() => {
    if (!authorized) return;

    const checkRoomStatus = async () => {
      try {
        const roomSnap = await getDoc(doc(db, 'hotels', 'efi-hotel', 'rooms', String(roomNumber)));

        if (!roomSnap.exists() || roomSnap.data()?.estado !== 'ocupada') {
          setRoomClosed(true);
          setAuthorized(false);
          setError('Tu habitación ha sido cerrada. Tu sesión ha finalizado.');
          sessionStorage.removeItem(`room-${roomNumber}-code`);
          sessionStorage.removeItem(`room-${roomNumber}-timestamp`);
          setTimeout(() => router.push('/'), 3000);
        }
      } catch (err) {
        // Silent error - don't disconnect on network errors
      }
    };

    statusCheckIntervalRef.current = setInterval(checkRoomStatus, ROOM_STATUS_CHECK_INTERVAL);

    return () => {
      if (statusCheckIntervalRef.current) {
        clearInterval(statusCheckIntervalRef.current);
      }
    };
  }, [authorized, roomNumber, router]);

  // Validate room status before operations (for order confirmation)
  const validateRoomStatus = useCallback(async (): Promise<{ valid: boolean; message: string }> => {
    try {
      const roomSnap = await getDoc(doc(db, 'hotels', 'efi-hotel', 'rooms', String(roomNumber)));

      if (!roomSnap.exists()) {
        return { valid: false, message: 'Habitación no encontrada' };
      }

      const roomData = roomSnap.data();
      if (roomData?.estado !== 'ocupada') {
        setRoomClosed(true);
        setAuthorized(false);
        sessionStorage.removeItem(`room-${roomNumber}-code`);
        sessionStorage.removeItem(`room-${roomNumber}-timestamp`);
        return { valid: false, message: 'Tu habitación ha sido cerrada. No puedes hacer más pedidos.' };
      }

      const roomGuestCode = String(roomData.guestCode || '').padStart(6, '0');
      const storedCode = sessionStorage.getItem(`room-${roomNumber}-code`);
      const storedGuestCode = (storedCode || '').padStart(6, '0');

      if (roomGuestCode !== storedGuestCode) {
        return { valid: false, message: 'Código de huésped inválido' };
      }

      return { valid: true, message: '' };
    } catch {
      return { valid: false, message: 'Error al validar. Intenta nuevamente.' };
    }
  }, [roomNumber]);

  const logout = useCallback(() => {
    sessionStorage.removeItem(`room-${roomNumber}-code`);
    sessionStorage.removeItem(`room-${roomNumber}-timestamp`);
    if (statusCheckIntervalRef.current) {
      clearInterval(statusCheckIntervalRef.current);
    }
    router.push('/');
  }, [roomNumber, router]);

  return { authorized, validating, error, roomClosed, validateRoomStatus, logout };
}
