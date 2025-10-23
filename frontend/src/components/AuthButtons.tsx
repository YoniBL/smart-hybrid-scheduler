import { useEffect, useState } from 'react';
import { login, logout, whoAmI } from '../authClient';
import { fetchAuthSession, fetchUserAttributes } from 'aws-amplify/auth';

export default function AuthButtons() {
  const [user, setUser] = useState<any>(null);
  const [displayName, setDisplayName] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const u = await whoAmI();
        setUser(u);
        
        if (u) {
          try {
            // Try getting email from ID token payload first
            const session = await fetchAuthSession();
            const idToken = session.tokens?.idToken;
            
            const email = idToken?.payload?.email as string;
            
            if (email) {
              const prefix = email.split('@')[0];
              setDisplayName(prefix);
            } else {
              // Fallback to fetchUserAttributes
              const attributes = await fetchUserAttributes();
              const attrEmail = attributes.email || '';
              const prefix = attrEmail.split('@')[0];
              setDisplayName(prefix || u.username || 'user');
            }
          } catch (attrError) {
            console.error('Failed to fetch user info:', attrError);
            setDisplayName(u.username || 'user');
          }
        }
      } catch (e) {
        console.warn('whoAmI failed:', e);
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return null;
  if (!user) return <button className="btn ghost" onClick={login}>Sign in</button>;

  return (
    <div style={{ display:'flex', alignItems:'center', gap: 12 }}>
      <span>Hi, {displayName}</span>
      <button className="btn ghost" onClick={logout}>Sign out</button>
    </div>
  );
}