import { signInWithRedirect, signOut, fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';

export async function login() {
  await signInWithRedirect();
}

export async function logout() {
  await signOut({ global: true });
}

export async function getIdToken(): Promise<string | null> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString() ?? null;
  return token;
}

export async function whoAmI() {
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}
