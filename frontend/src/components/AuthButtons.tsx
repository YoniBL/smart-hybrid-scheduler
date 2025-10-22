// frontend/src/components/AuthButtons.tsx
import { useEffect, useState } from 'react';
import { login, logout, whoAmI } from '../authClient';

export default function AuthButtons() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        setUser(await whoAmI());
      } catch (e) {
        console.warn('whoAmI failed (likely before OAuth finish):', e);
        setUser(null);
      }
    })();
  }, []);

  if (!user) return <button className="btn ghost" onClick={login}>Sign in</button>;

  const name = user?.username || user?.userId || 'user';
  return (
    <div style={{ marginLeft: 'auto', display:'flex', alignItems:'center', gap: 12 }}>
      <span>Hi, {name}</span>
      <button className="btn ghost" onClick={logout}>Sign out</button>
    </div>
  );
}
