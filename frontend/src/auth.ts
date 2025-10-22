import { Amplify } from 'aws-amplify';
import { fetchAuthSession } from 'aws-amplify/auth';

// --- Your concrete values ---
const USER_POOL_ID = 'il-central-1_p5cel2nIE';
const USER_POOL_CLIENT_ID = '6gmllk064eubho2qmqqoq0aaur';
const HOSTED_UI_DOMAIN = 'yonibl-scheduler-app.auth.il-central-1.amazoncognito.com';
const REDIRECTS = ['http://localhost:5173/', 'https://d2v90t7xll7gjd.cloudfront.net/']; // note trailing '/'

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: USER_POOL_ID,
      userPoolClientId: USER_POOL_CLIENT_ID,
      loginWith: {
        oauth: {
          domain: HOSTED_UI_DOMAIN,
          scopes: ['openid', 'email', 'profile'],
          redirectSignIn: REDIRECTS,
          redirectSignOut: REDIRECTS,
          responseType: 'code', // Authorization Code + PKCE
        },
      },
    },
  },
});

// Finalize OAuth redirect on first load (exchange ?code for tokens) and clean the URL
(async () => {
  try {
    // Only run when Cognito sent us back with ?code=...&state=...
    if (typeof window !== 'undefined' && window.location.search.includes('code=')) {
      await fetchAuthSession(); // triggers the OAuth code exchange in Amplify v6
      // Strip code/state from the URL to avoid re-running or confusing the app
      const url = new URL(window.location.href);
      url.searchParams.delete('code');
      url.searchParams.delete('state');
      window.history.replaceState({}, '', url.toString());
    }
  } catch (e) {
    // Don’t break the app on startup; log for debugging
    console.error('OAuth finalize error:', e);
  }
})();
