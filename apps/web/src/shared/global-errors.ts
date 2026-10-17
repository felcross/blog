let installed = false;

export function initGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;

  window.addEventListener("error", (event) => {
    console.error("[global] uncaught error", event.error ?? event.message);
  });

  window.addEventListener("unhandledrejection", (event) => {
    console.error("[global] unhandled rejection", event.reason);
  });
}
