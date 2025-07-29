import { useEffect } from "react";

interface GoogleLoginButtonProps {
  clientId: string;
  onSuccess: (response: google.accounts.id.CredentialResponse) => void;
  onError?: () => void;
 buttonText?: "signin_with" | "signup_with" | "continue_with" | "signin";
}

const GoogleLoginButton = ({
  clientId,
  onSuccess,
  onError,
  buttonText = "signin_with",
}: GoogleLoginButtonProps) => {
  useEffect(() => {
    const loadGoogleScript = () => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (window.google) {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: onSuccess,
          });

          window.google.accounts.id.renderButton(
            document.getElementById("google-signin-btn")!,
            {
              theme: "outline",
              size: "large",
              text: buttonText,
              type: "standard",
            }
          );
        }
      };
      script.onerror = onError || (() => console.error("Google script load error"));
      document.body.appendChild(script);
    };

    // Only load script if not already present
    if (!document.querySelector('script[src="https://accounts.google.com/gsi/client"]')) {
      loadGoogleScript();
    } else {
      // Script already present, just render the button
      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: onSuccess,
        });

        window.google.accounts.id.renderButton(
          document.getElementById("google-signin-btn")!,
          {
            theme: "outline",
            size: "large",
            text: buttonText,
            type: "standard",
          }
        );
      }
    }
  }, [clientId, onSuccess, onError, buttonText]);

  return <div id="google-signin-btn" />;
};

export default GoogleLoginButton;
