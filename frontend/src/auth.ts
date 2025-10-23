import { Amplify } from 'aws-amplify';
import { fetchAuthSession } from 'aws-amplify/auth';

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: 'il-central-1_p5cel2nIE',
      userPoolClientId: '49lgkoqpnumppaomm5a1ie9pp',
      loginWith: {
        oauth: {
          domain: 'yonibl-scheduler-app.auth.il-central-1.amazoncognito.com',
          scopes: ['openid', 'email', 'phone'],
          redirectSignIn: ['http://localhost:5173', 'https://d2v90t7xll7gjd.cloudfront.net'],
          redirectSignOut: ['http://localhost:5173', 'https://d2v90t7xll7gjd.cloudfront.net'],
          responseType: 'code',
        },
      },
    },
  },
});

// Finalize OAuth redirect on first load
(async () => {
  try {
    if (typeof window !== 'undefined' && window.location.search.includes('code=')) {
      await fetchAuthSession();
      const url = new URL(window.location.href);
      url.searchParams.delete('code');
      url.searchParams.delete('state');
      window.history.replaceState({}, '', url.toString());
    }
  } catch (e) {
    console.error('OAuth finalize error:', e);
  }
})();