let deferredPrompt = null;
const installBtn = document.getElementById('install-btn');
const launchBtn = document.getElementById('launch-app-btn');
const downloadWindowsBtn = document.getElementById('download-windows-btn');
const apiHealthEl = document.getElementById('api-health');
const windowsStatusEl = document.getElementById('windows-status');
const downloadNoteEl = document.getElementById('download-note');

const GITHUB_RELEASES_URL = '#';
const ITCH_URL = '#';

document.getElementById('dl-github').href = GITHUB_RELEASES_URL;
document.getElementById('dl-itch').href = ITCH_URL;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.hidden = false;
});

installBtn?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  if (choice && choice.outcome === 'accepted') {
    alert('App installed to your desktop/launcher.');
  }
  deferredPrompt = null;
  installBtn.hidden = true;
});

async function loadApiState() {
  try {
    const [healthRes, downloadsRes] = await Promise.all([
      fetch('/api/health'),
      fetch('/api/downloads')
    ]);

    if (healthRes.ok) {
      const health = await healthRes.json();
      apiHealthEl.textContent = `API: ${health.status}`;
    } else {
      apiHealthEl.textContent = 'API: unavailable';
    }

    if (!downloadsRes.ok) {
      windowsStatusEl.textContent = 'Windows package: unavailable';
      downloadNoteEl.textContent = 'The API is reachable but download metadata is unavailable right now.';
      downloadWindowsBtn.setAttribute('aria-disabled', 'true');
      downloadWindowsBtn.addEventListener('click', (event) => event.preventDefault(), { once: true });
      return;
    }

    const payload = await downloadsRes.json();
    if (payload.windows?.available && payload.windows?.downloadUrl) {
      windowsStatusEl.textContent = 'Windows package: ready';
      downloadNoteEl.textContent = 'Windows installer detected. Download it to install Rift Vault with a desktop shortcut.';
      downloadWindowsBtn.href = payload.windows.downloadUrl;
      downloadWindowsBtn.removeAttribute('aria-disabled');
    } else {
      windowsStatusEl.textContent = 'Windows package: not built yet';
      downloadNoteEl.textContent = 'No .exe found yet. Build a Windows installer and place it in website/downloads or dist.';
      downloadWindowsBtn.href = '#';
      downloadWindowsBtn.setAttribute('aria-disabled', 'true');
      downloadWindowsBtn.addEventListener('click', (event) => {
        event.preventDefault();
        alert('No Windows installer is available yet. Build one first, then this button will download it.');
      });
    }
  } catch {
    apiHealthEl.textContent = 'API: unavailable';
    windowsStatusEl.textContent = 'Windows package: unknown';
    downloadNoteEl.textContent = 'Cannot connect to API routes. Start the website server with npm run web.';
  }
}

async function launchDesktopApp() {
  let launchRoute = null;
  try {
    const response = await fetch('/api/launch');
    if (response.ok) {
      launchRoute = await response.json();
    }
  } catch {
    launchRoute = null;
  }

  const scheme = launchRoute?.launchUrl || 'riftvault://open';
  const fallbackDownload = launchRoute?.downloadUrl || '/api/download/windows';
  const hasWindowsInstaller = Boolean(launchRoute?.hasWindowsInstaller);

  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = scheme;
  document.body.appendChild(iframe);

  setTimeout(() => {
    if (!document.hidden) {
      if (hasWindowsInstaller) {
        window.location.href = fallbackDownload;
      } else {
        alert('Desktop app is not detected and no Windows installer is available yet. Build/upload the .exe first.');
      }
    }
    iframe.remove();
  }, 1200);
}

launchBtn?.addEventListener('click', () => {
  launchDesktopApp();
});

loadApiState();

// Register service worker for offline/PWA support
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
