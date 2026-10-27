if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    const isLocalDevelopment = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    if (isLocalDevelopment) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
