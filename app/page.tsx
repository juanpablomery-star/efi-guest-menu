'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

const RATE_LIMIT_KEY = 'guest_login_attempts';
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 1000;    // 1 minute window
const LOCKOUT_MS = 2 * 60 * 1000; // 2 minute lockout

function getRateLimitState(): { locked: boolean; remaining: number; attempts: number[] } {
  if (typeof window === 'undefined') return { locked: false, remaining: 0, attempts: [] };
  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY);
    const data = raw ? JSON.parse(raw) : { attempts: [], lockUntil: 0 };
    if (data.lockUntil > Date.now()) {
      return { locked: true, remaining: Math.ceil((data.lockUntil - Date.now()) / 1000), attempts: data.attempts };
    }
    const recent = (data.attempts as number[]).filter(t => Date.now() - t < WINDOW_MS);
    return { locked: false, remaining: 0, attempts: recent };
  } catch {
    return { locked: false, remaining: 0, attempts: [] };
  }
}

function recordFailedAttempt() {
  try {
    const { attempts } = getRateLimitState();
    const updated = [...attempts, Date.now()];
    const lockUntil = updated.length >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0;
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify({ attempts: updated, lockUntil }));
  } catch { /* ignore storage errors */ }
}

function clearAttempts() {
  try { localStorage.removeItem(RATE_LIMIT_KEY); } catch { /* ignore */ }
}

export default function LoginPage() {
  const router = useRouter();
  const [roomNumber, setRoomNumber] = useState('');
  const [guestCode, setGuestCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lockSeconds, setLockSeconds] = useState(0);

  // Countdown timer for lockout display
  useEffect(() => {
    const { locked, remaining } = getRateLimitState();
    if (locked) setLockSeconds(remaining);

    const interval = setInterval(() => {
      const state = getRateLimitState();
      setLockSeconds(state.locked ? state.remaining : 0);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Check rate limit
    const rateState = getRateLimitState();
    if (rateState.locked) {
      setError(`Demasiados intentos. Espera ${rateState.remaining} segundos.`);
      return;
    }

    setLoading(true);

    try {
      const roomNum = parseInt(roomNumber);
      if (isNaN(roomNum) || roomNum < 1 || roomNum > 24) {
        setError('Número de habitación inválido (1–24)');
        setLoading(false);
        return;
      }

      if (!/^\d{6}$/.test(guestCode)) {
        setError('El código de huésped debe ser de 6 dígitos');
        setLoading(false);
        return;
      }

      const roomRef = doc(db, 'hotels', 'efi-hotel', 'rooms', String(roomNum));
      const roomSnap = await getDoc(roomRef);

      if (!roomSnap.exists()) {
        recordFailedAttempt();
        setError('Habitación no encontrada');
        setLoading(false);
        return;
      }

      const roomData = roomSnap.data();
      if (!roomData) {
        setError('Error al cargar datos de la habitación');
        setLoading(false);
        return;
      }

      if (roomData.estado !== 'ocupada') {
        setError('La habitación no está ocupada');
        setLoading(false);
        return;
      }

      const roomCode = String(roomData.guestCode || '').padStart(6, '0');
      const inputCode = guestCode.padStart(6, '0');

      if (roomCode !== inputCode) {
        recordFailedAttempt();
        const { attempts } = getRateLimitState();
        const remaining = MAX_ATTEMPTS - attempts.length;
        setError(remaining > 0
          ? `Código incorrecto. Intentos restantes: ${remaining}`
          : 'Demasiados intentos. Esperá 2 minutos.');
        setLoading(false);
        return;
      }

      // Success — clear rate limit and store session
      clearAttempts();
      sessionStorage.setItem(`room-${roomNum}-code`, guestCode);
      sessionStorage.setItem(`room-${roomNum}-timestamp`, Date.now().toString());
      router.push(`/menu/${roomNum}`);
    } catch (err: any) {
      setError(err.message || 'Error al validar');
      setLoading(false);
    }
  };

  const isLocked = lockSeconds > 0;

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      minHeight: '100vh', padding: '20px', background: 'var(--bg)',
    }}>
      <div style={{
        width: '100%', maxWidth: '360px', padding: '32px',
        background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 'var(--radius-lg)',
      }}>
        <div style={{ marginBottom: '32px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '8px' }}>EFI Hotel</h1>
          <p style={{ fontSize: '13px', color: 'var(--muted)' }}>Acceso al menú de la habitación</p>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
              Número de Habitación
            </label>
            <input
              type="number"
              min="1"
              max="24"
              value={roomNumber}
              onChange={e => setRoomNumber(e.target.value)}
              placeholder="1 – 24"
              disabled={isLocked || loading}
              style={{
                width: '100%', padding: '10px 12px',
                border: '1px solid var(--line)', borderRadius: 'var(--radius)',
                background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', outline: 'none',
                opacity: isLocked ? 0.5 : 1,
              }}
              required
            />
          </div>

          <div>
            <label style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
              Código de Huésped
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              value={guestCode}
              onChange={e => setGuestCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              disabled={isLocked || loading}
              style={{
                width: '100%', padding: '10px 12px',
                border: '1px solid var(--line)', borderRadius: 'var(--radius)',
                background: 'var(--bg)', color: 'var(--text)', fontSize: '18px', outline: 'none',
                fontFamily: 'monospace', letterSpacing: '4px',
                opacity: isLocked ? 0.5 : 1,
              }}
              required
            />
          </div>

          {isLocked && (
            <div style={{
              padding: '10px 12px', background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: 'var(--radius)',
              color: '#F59E0B', fontSize: '13px', textAlign: 'center',
            }}>
              Bloqueado por intentos fallidos. Espera {lockSeconds}s
            </div>
          )}

          {error && !isLocked && (
            <div style={{
              padding: '10px 12px', background: 'rgba(255, 0, 0, 0.1)',
              border: '1px solid rgba(255, 0, 0, 0.3)', borderRadius: 'var(--radius)',
              color: 'rgba(255, 100, 100, 1)', fontSize: '13px',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || isLocked}
            style={{
              padding: '12px 16px',
              background: loading || isLocked ? 'var(--muted)' : 'var(--accent)',
              color: 'var(--bg)', border: 'none', borderRadius: 'var(--radius)',
              fontSize: '14px', fontWeight: '600',
              cursor: loading || isLocked ? 'not-allowed' : 'pointer',
              opacity: loading || isLocked ? 0.6 : 1, transition: 'opacity 0.2s',
            }}
          >
            {loading ? 'Ingresando...' : isLocked ? `Espera ${lockSeconds}s` : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
