import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// ✅ Registrer service worker for PWA
if ("serviceWorker" in navigator && !window.location.hostname.includes('stackblitz.io') && !window.WebContainer) {
  let isParentWebContainer = false;
  try {
    isParentWebContainer = window.parent && window.parent.WebContainer;
  } catch (e) {
    // SecurityError when accessing cross-origin parent - assume WebContainer environment
    isParentWebContainer = true;
  }
  
  if (!isParentWebContainer) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then(registration => {
        console.log("Service Worker registreret:", registration);
      })
      .catch(error => {
        console.error("Service Worker fejl:", error);
      });
  });
  }
}
