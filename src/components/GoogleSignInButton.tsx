import React, { useEffect, useRef } from 'react';
import { auth, syncUserProfile, UserProfile, BOOTSTRAP_ADMIN_EMAIL } from '../firebase';
import { signInWithCredential, GoogleAuthProvider } from 'firebase/auth';

declare global {
  interface Window {
    google?: any;
  }
}

interface GoogleSignInButtonProps {
  onSuccess: (userProfile: UserProfile) => void;
  onError?: (errorMsg: string) => void;
}

const CLIENT_ID = "136549949283-c0a0e2cm14itkqrccrrqci3jnlcud65v.apps.googleusercontent.com";

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({ onSuccess, onError }) => {
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleCredentialResponse = async (response: any) => {
      try {
        const idToken = response.credential;
        if (!idToken) return;

        // Try Firebase signInWithCredential
        try {
          const credential = GoogleAuthProvider.credential(idToken);
          const userCredential = await signInWithCredential(auth, credential);
          const profile = await syncUserProfile(userCredential.user);
          onSuccess(profile);
          return;
        } catch (firebaseErr) {
          console.warn("Firebase credential sign-in notice, parsing ID token payload:", firebaseErr);
        }

        // Fallback: Parse Google JWT token directly
        const base64Url = idToken.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
          atob(base64)
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        const payload = JSON.parse(jsonPayload);

        const email = payload.email || '';
        const name = payload.name || payload.given_name || email.split('@')[0];
        const photo = payload.picture || '';

        const isBootstrapAdmin = email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();

        let initialRole: 'admin' | 'premium' | 'normal' = isBootstrapAdmin ? 'admin' : 'normal';

        try {
          const checkRes = await fetch(`/api/users/me?email=${encodeURIComponent(email)}&uid=${payload.sub || ''}`);
          if (checkRes.ok) {
            const data = await checkRes.json();
            if (data && data.role) {
              initialRole = isBootstrapAdmin ? 'admin' : data.role;
            }
          }
        } catch (e) {
          // ignore
        }

        const realUserProfile: UserProfile = {
          uid: payload.sub || ('g_' + Date.now()),
          email: email,
          displayName: name,
          photoURL: photo,
          role: initialRole,
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
          generationCount: 0,
          dailyGenerations: 0,
          lastGenerationDate: new Date().toISOString().split('T')[0],
        };

        try {
          localStorage.setItem("lin_zaw_tts_user_profile", JSON.stringify(realUserProfile));
          await fetch('/api/users/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(realUserProfile)
          });
        } catch (e) {}

        onSuccess(realUserProfile);
      } catch (err: any) {
        console.error("Google Credential Error:", err);
        if (onError) onError(err?.message || "Google Authentication failed");
      }
    };

    const initializeGsi = () => {
      if (window.google?.accounts?.id) {
        try {
          window.google.accounts.id.initialize({
            client_id: CLIENT_ID,
            callback: handleCredentialResponse,
            auto_select: false,
            context: 'signin'
          });

          if (buttonRef.current) {
            buttonRef.current.innerHTML = '';
            window.google.accounts.id.renderButton(buttonRef.current, {
              theme: 'filled_blue',
              size: 'large',
              type: 'standard',
              shape: 'pill',
              text: 'signin_with',
              logo_alignment: 'left',
              width: 280
            });
          }
        } catch (e) {
          console.warn("GSI init notice:", e);
        }
      }
    };

    if (window.google?.accounts?.id) {
      initializeGsi();
    } else {
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval);
          initializeGsi();
        }
      }, 300);
      return () => clearInterval(interval);
    }
  }, [onSuccess, onError]);

  return (
    <div className="flex flex-col items-center justify-center my-2">
      <div ref={buttonRef} className="min-h-[44px] flex items-center justify-center" />
    </div>
  );
};
