const express = require('express');
const fs = require('node:fs');
const path = require('node:path');

const app = express();
const PORT = Number(process.env.WEB_PORT || 5174);
const rootDir = __dirname;
const projectDir = path.resolve(__dirname, '..');
const webDownloadsDir = path.join(rootDir, 'downloads');
const distDir = path.join(projectDir, 'dist');

function toWebPath(filePath) {
  return filePath.replace(/\\/g, '/');
}

function collectInstallerCandidates() {
  const folders = [webDownloadsDir, distDir];
  const candidates = [];

  for (const folder of folders) {
    if (!fs.existsSync(folder)) {
      continue;
    }

    const entries = fs.readdirSync(folder, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const lower = entry.name.toLowerCase();
      if (!lower.endsWith('.exe') && !lower.endsWith('.msi') && !lower.endsWith('.zip')) {
        continue;
      }

      const fullPath = path.join(folder, entry.name);
      candidates.push({
        name: entry.name,
        fullPath,
        relativeFromWeb: folder === webDownloadsDir
          ? `/downloads/${encodeURIComponent(entry.name)}`
          : `/dist/${encodeURIComponent(entry.name)}`
      });
    }
  }

  return candidates;
}

function pickWindowsInstaller(candidates) {
  const scored = [...candidates].sort((a, b) => {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    const aScore = (aName.endsWith('.exe') ? 100 : 0) + (aName.includes('setup') ? 20 : 0) + (aName.includes('windows') ? 10 : 0);
    const bScore = (bName.endsWith('.exe') ? 100 : 0) + (bName.includes('setup') ? 20 : 0) + (bName.includes('windows') ? 10 : 0);
    return bScore - aScore;
  });

  return scored.find((entry) => entry.name.toLowerCase().endsWith('.exe')) || scored[0] || null;
}

app.use('/downloads', express.static(webDownloadsDir));
app.use('/dist', express.static(distDir));
app.use(express.static(rootDir));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, status: 'online', service: 'rift-vault-web-api' });
});

app.get('/api/downloads', (_req, res) => {
  const candidates = collectInstallerCandidates();
  const windows = pickWindowsInstaller(candidates);

  res.json({
    ok: true,
    windows: {
      available: Boolean(windows),
      fileName: windows ? windows.name : null,
      downloadUrl: windows ? windows.relativeFromWeb : null
    },
    files: candidates.map((file) => ({
      name: file.name,
      path: toWebPath(file.relativeFromWeb)
    }))
  });
});

app.get('/api/download/windows', (_req, res) => {
  const candidates = collectInstallerCandidates();
  const windows = pickWindowsInstaller(candidates);

  if (!windows) {
    res.status(404).json({
      ok: false,
      error: 'No Windows installer available yet. Build and place an .exe in website/downloads or dist.'
    });
    return;
  }

  res.redirect(windows.relativeFromWeb);
});

app.get('/api/launch', (_req, res) => {
  const candidates = collectInstallerCandidates();
  const windows = pickWindowsInstaller(candidates);

  res.json({
    ok: true,
    launchUrl: 'riftvault://open',
    hasWindowsInstaller: Boolean(windows),
    downloadUrl: windows ? windows.relativeFromWeb : '/api/download/windows'
  });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Rift Vault website running on http://localhost:${PORT}`);
});
