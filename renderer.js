const fields = ['login', 'password', 'nickname', 'email', 'status', 'commentary', 'opgg'];
let accounts = [];
const highlightedCardIds = new Set();
const selectedCardIds = new Set();
const pendingEdits = new Map();
const rankNoteTimers = new Map();
const historyByAccount = new Map();
const historyLoading = new Set();

const cardsEl = document.getElementById('cards');
const countEl = document.getElementById('count');
const addForm = document.getElementById('add-form');
const removeAllBtn = document.getElementById('remove-all-btn');
const syncRankBtn = document.getElementById('sync-rank-btn');
const exportSelectedBtn = document.getElementById('export-selected-btn');

function normalizeNicknameForOpgg(nickname) {
  return encodeURIComponent(String(nickname || '').trim().replace(/\s*#\s*/g, '-'));
}

function generateOpggFromNickname(nickname, existingOpgg) {
  if (existingOpgg && /^https?:\/\//i.test(existingOpgg)) {
    return existingOpgg;
  }

  const source = accounts.find((account) => account.opgg && /^https?:\/\//i.test(account.opgg));
  if (!source) {
    return existingOpgg || '';
  }

  try {
    const url = new URL(source.opgg);
    const parts = url.pathname.split('/').filter(Boolean);
    const summonerIndex = parts.findIndex((part) => part.toLowerCase() === 'summoners');
    if (summonerIndex < 0 || parts.length < summonerIndex + 3) {
      return existingOpgg || '';
    }
    const prefix = `${url.origin}/${parts.slice(0, summonerIndex + 2).join('/')}/`;
    return `${prefix}${normalizeNicknameForOpgg(nickname)}`;
  } catch {
    return existingOpgg || '';
  }
}

function copyText(value) {
  navigator.clipboard.writeText(value || '');
}

function canExportAccount(account) {
  return Boolean(account?.syncMeta?.accountName || account?.rankInfo);
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('\n', '&#10;');
}

function formatCardNumber(index) {
  return `#${String(index + 1).padStart(4, '0')}`;
}

function iconSvg(name) {
  if (name === 'copy') {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="10" height="10" rx="2"></rect><rect x="5" y="5" width="10" height="10" rx="2"></rect></svg>';
  }

  if (name === 'trash') {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M9 4h6"></path><path d="M7 7l1 12h8l1-12"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>';
  }

  if (name === 'sync') {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 5v6h-6"></path><path d="M4 19v-6h6"></path><path d="M6.5 9A7 7 0 0 1 18 7l2 4"></path><path d="M17.5 15A7 7 0 0 1 6 17l-2-4"></path></svg>';
  }

  if (name === 'export') {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v10"></path><path d="M8 10l4 4 4-4"></path><path d="M4 18h16"></path></svg>';
  }

  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h11l3 3v13H5z"></path><path d="M8 4v6h7V4"></path><path d="M8 20v-6h8v6"></path></svg>';
}

function renderRankBlock(account) {
  const syncMeta = account.syncMeta;
  const rank = account.rankInfo;
  if (!syncMeta && !account.rankNote) {
    return '';
  }

  if (!rank) {
    const note = account.rankNote ? escapeHtml(account.rankNote) : 'Not synced yet';
    return `
      <div class="rank-box rank-empty">
        <div class="sync-profile">
          ${syncMeta?.profileIconUrl ? `<img class="pp-icon" src="${escapeAttr(syncMeta.profileIconUrl)}" alt="Profile icon" />` : '<div class="pp-icon pp-fallback">?</div>'}
          <div>
            <div class="rank-title">${escapeHtml(syncMeta?.accountName || account.nickname || 'Account')}</div>
          </div>
        </div>
        <div class="rank-title">Rank</div>
        <div class="rank-note">${note}</div>
      </div>
    `;
  }

  const tierText = `${rank.tier}${rank.rank ? ` ${rank.rank}` : ''}`;
  const tierSlug = String(rank.tier || 'unranked').toLowerCase();
  const localRankIcon = `assets/ranks/${tierSlug}.png`;
  const queueText = rank.queue === 'RANKED_SOLO_5x5' ? 'Solo/Duo' : rank.queue;
  return `
    <div class="rank-box">
      <div class="sync-profile">
        ${syncMeta?.profileIconUrl ? `<img class="pp-icon" src="${escapeAttr(syncMeta.profileIconUrl)}" alt="Profile icon" />` : '<div class="pp-icon pp-fallback">?</div>'}
        <div>
          <div class="synced-account-name">${escapeHtml(syncMeta?.accountName || account.nickname || 'Account')}</div>
        </div>
      </div>
      <div class="rank-header">
        <div class="rank-emblem" title="${escapeHtml(rank.tier)} emblem">
          <img class="rank-emblem-img" src="${escapeAttr(localRankIcon)}" data-fallback="${escapeAttr(rank.iconUrl || '')}" alt="${escapeAttr(rank.tier)} emblem" />
        </div>
        <div>
          <div class="rank-tier">${escapeHtml(tierText)}</div>
          <div class="rank-sub">${escapeHtml(queueText)}</div>
        </div>
      </div>
      <div class="rank-stats">${rank.lp} LP • ${rank.wins}W ${rank.losses}L • ${rank.winrate}% WR</div>
    </div>
  `;
}

function formatMatchDuration(seconds) {
  const total = Number(seconds || 0);
  const minutes = Math.floor(total / 60);
  const remain = total % 60;
  return `${minutes}:${String(remain).padStart(2, '0')}`;
}

function renderHistoryBlock(account) {
  if (!account.syncMeta?.puuid) {
    return '';
  }

  const loading = historyLoading.has(account.id);
  const history = historyByAccount.get(account.id) || [];
  const items = history
    .map((match) => {
      const result = match.win ? 'WIN' : 'LOSS';
      return `<div class="history-item ${match.win ? 'history-win' : 'history-loss'}">
        <div>${escapeHtml(match.championName)}</div>
        <div>${match.kills}/${match.deaths}/${match.assists}</div>
        <div>${escapeHtml(match.queueLabel)}</div>
        <div>${formatMatchDuration(match.gameDuration)}</div>
        <div>${result}</div>
      </div>`;
    })
    .join('');

  return `
    <div class="history-box">
      <div class="history-head">
        <button class="btn history-btn" data-history="${account.id}" ${loading ? 'disabled' : ''}>${loading ? 'Loading...' : 'History'}</button>
      </div>
      ${history.length ? `<div class="history-list">${items}</div>` : ''}
    </div>
  `;
}

function triggerNewCardEffect(ids) {
  ids.forEach((id) => highlightedCardIds.add(id));
  render();
  setTimeout(() => {
    ids.forEach((id) => highlightedCardIds.delete(id));
    render();
  }, 3800);
}

function setSyncButtonIdle() {
  syncRankBtn.innerHTML = `${iconSvg('sync')}<span>SYNC</span>`;
}

function setSyncButtonLoading() {
  syncRankBtn.innerHTML = `${iconSvg('sync')}<span>SYNCING...</span>`;
}

function scheduleRankErrorClear(accountId) {
  if (rankNoteTimers.has(accountId)) {
    clearTimeout(rankNoteTimers.get(accountId));
  }

  const timeoutId = setTimeout(async () => {
    const account = accounts.find((item) => item.id === accountId);
    if (!account || account.rankInfo || !account.rankNote) {
      rankNoteTimers.delete(accountId);
      return;
    }

    account.rankNote = '';
    render();
    await persist();
    rankNoteTimers.delete(accountId);
  }, 5000);

  rankNoteTimers.set(accountId, timeoutId);
}

function scheduleRankErrorClearForList(list) {
  for (const account of list) {
    if (!account.rankInfo && account.rankNote) {
      scheduleRankErrorClear(account.id);
    }
  }
}

function loadImageSafe(src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function buildCardExportPng(account, history) {
  const width = 1100;
  const height = 620;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#101b34');
  gradient.addColorStop(1, '#1a1131');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(120,190,255,0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(18, 18, width - 36, height - 36);

  const accountName = account.syncMeta?.accountName || account.nickname || 'Account';
  const rank = account.rankInfo || {};
  const rankLabel = rank.tier ? `${rank.tier}${rank.rank ? ` ${rank.rank}` : ''}` : 'UNRANKED';
  const statLine = rank.tier
    ? `${rank.lp || 0} LP • ${rank.wins || 0}W ${rank.losses || 0}L • ${rank.winrate || 0}% WR`
    : 'No ranked data';

  const ppImg = await loadImageSafe(account.syncMeta?.profileIconUrl || '');
  const rankImg = await loadImageSafe(rank.iconUrl || '');

  if (ppImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(85, 85, 44, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(ppImg, 41, 41, 88, 88);
    ctx.restore();
  } else {
    ctx.fillStyle = '#223c64';
    ctx.beginPath();
    ctx.arc(85, 85, 44, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#f0f5ff';
  ctx.font = 'bold 44px Segoe UI';
  ctx.fillText(accountName, 155, 90);

  if (rankImg) {
    ctx.drawImage(rankImg, 48, 155, 110, 110);
  }

  ctx.fillStyle = '#dfc68a';
  ctx.font = 'bold 48px Segoe UI';
  ctx.fillText(rankLabel, 185, 210);

  ctx.fillStyle = '#c9daf7';
  ctx.font = '28px Segoe UI';
  ctx.fillText(statLine, 185, 258);

  ctx.fillStyle = '#9bb3da';
  ctx.font = 'bold 26px Segoe UI';
  ctx.fillText('HISTORY (5)', 50, 330);

  const displayHistory = history.slice(0, 5);
  let y = 370;
  ctx.font = '24px Segoe UI';
  for (const match of displayHistory) {
    const line = `${match.win ? 'WIN' : 'LOSS'} • ${match.championName} • ${match.kills}/${match.deaths}/${match.assists} • ${match.queueLabel}`;
    ctx.fillStyle = match.win ? '#92efc6' : '#ff9daf';
    ctx.fillText(line, 50, y);
    y += 44;
  }

  if (!displayHistory.length) {
    ctx.fillStyle = '#c0cde5';
    ctx.fillText('No history loaded yet.', 50, y);
  }

  ctx.fillStyle = '#8fa8d1';
  ctx.font = '18px Segoe UI';
  ctx.fillText(`Exported: ${new Date().toLocaleString()}`, 50, height - 40);

  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

async function syncSingleAccount(accountId) {
  const accountIndex = accounts.findIndex((item) => item.id === accountId);
  if (accountIndex < 0) {
    return;
  }

  if (pendingEdits.has(accountId)) {
    alert('Save this card first, then sync it.');
    return;
  }

  const result = await window.accountsApi.syncRiotRanks([accounts[accountIndex]], '');
  if (!result?.ok || !Array.isArray(result.accounts) || result.accounts.length === 0) {
    alert(result?.error || 'Card sync failed.');
    return;
  }

  accounts[accountIndex] = result.accounts[0];
  render();
  await persist();
  scheduleRankErrorClearForList([accounts[accountIndex]]);
}

function renderField(label, key, value, id) {
  const safe = escapeAttr(value || '');
  const openButton = key === 'opgg' && value
    ? `<button class="open-btn" data-open="${id}" data-key="${key}">Open</button>`
    : '';

  const editor = key === 'commentary'
    ? `<textarea class="value value-editor" data-update="${id}" data-key="${key}" rows="2">${escapeHtml(value || '')}</textarea>`
    : `<input class="value value-editor" data-update="${id}" data-key="${key}" value="${safe}" />`;

  return `
    <div class="field">
      <div class="label-row">
        <span>${label}</span>
        <div>
          ${openButton}
          <button class="copy-btn icon-btn" data-copy="${id}" data-key="${key}" title="Copy to clipboard" aria-label="Copy to clipboard">${iconSvg('copy')}</button>
        </div>
      </div>
      ${editor}
    </div>
  `;
}

function render() {
  const currentIds = new Set(accounts.map((account) => account.id));
  for (const selectedId of [...selectedCardIds]) {
    if (!currentIds.has(selectedId)) {
      selectedCardIds.delete(selectedId);
    }
  }

  countEl.textContent = String(accounts.length);
  removeAllBtn.disabled = accounts.length === 0;
  const syncedSelectedCount = accounts.filter((account) => selectedCardIds.has(account.id) && canExportAccount(account)).length;
  exportSelectedBtn.disabled = syncedSelectedCount === 0;

  if (accounts.length === 0) {
    cardsEl.innerHTML = `<div class="empty">No account yet. Add one above or import from PDF.</div>`;
    return;
  }

  cardsEl.innerHTML = accounts
    .map((account, index) => {
      const isNew = highlightedCardIds.has(account.id);
      const hasPending = pendingEdits.has(account.id);
      const canExport = canExportAccount(account);
      const isSelected = selectedCardIds.has(account.id);
      const cardClass = isNew ? 'account-card new-card' : 'account-card';
      return `
      <article class="${cardClass}" data-id="${account.id}" style="--card-index:${index};">
        <div class="root-network" aria-hidden="true">
          <span class="root root-a"></span>
          <span class="root root-b"></span>
          <span class="root root-c"></span>
        </div>
        <div class="card-top">
          <div>
            <div class="card-number">${formatCardNumber(index)}</div>
            <div class="nickname">${escapeHtml(account.nickname || 'No nickname')}</div>
          </div>
          <div class="card-top-actions">
            <label class="select-card" title="Select card for bulk export">
              <input type="checkbox" data-select-card="${account.id}" ${isSelected ? 'checked' : ''} />
              <span>Select</span>
            </label>
            <button class="remove-btn icon-btn" data-remove="${account.id}" title="Remove account" aria-label="Remove account">${iconSvg('trash')}</button>
          </div>
        </div>
        ${renderField('Login', 'login', account.login, account.id)}
        ${renderField('Password', 'password', account.password, account.id)}
        ${renderField('Nickname', 'nickname', account.nickname, account.id)}
        ${renderField('Email', 'email', account.email, account.id)}
        ${renderField('Status', 'status', account.status, account.id)}
        ${renderField('Commentary', 'commentary', account.commentary, account.id)}
        ${renderField('OP.GG', 'opgg', account.opgg, account.id)}
        ${renderRankBlock(account)}
        ${renderHistoryBlock(account)}
        <div class="card-actions">
          <button class="btn export-card-btn icon-btn" data-export-card="${account.id}" title="Export synced card" aria-label="Export synced card" ${canExport ? '' : 'disabled'}>${iconSvg('export')}</button>
          <button class="btn sync-card-btn icon-btn" data-sync-card="${account.id}" title="Sync this card" aria-label="Sync this card">${iconSvg('sync')}</button>
          <button class="btn save-card-btn icon-btn${hasPending ? ' visible' : ''}" data-save-card="${account.id}" title="Save changes" aria-label="Save changes">${iconSvg('save')}</button>
        </div>
      </article>`;
    })
    .join('');
}

async function persist() {
  await window.accountsApi.saveAccounts(accounts);
}

cardsEl.addEventListener('click', async (event) => {
  const copyButton = event.target.closest('[data-copy]');
  const removeButton = event.target.closest('[data-remove]');
  const openButton = event.target.closest('[data-open]');
  const saveCardButton = event.target.closest('[data-save-card]');
  const syncCardButton = event.target.closest('[data-sync-card]');
  const historyButton = event.target.closest('[data-history]');
  const exportButton = event.target.closest('[data-export-card]');

  const copyId = copyButton?.getAttribute('data-copy');
  const removeId = removeButton?.getAttribute('data-remove');
  const openId = openButton?.getAttribute('data-open');
  const saveCardId = saveCardButton?.getAttribute('data-save-card');
  const syncCardId = syncCardButton?.getAttribute('data-sync-card');
  const historyId = historyButton?.getAttribute('data-history');
  const exportId = exportButton?.getAttribute('data-export-card');

  if (copyId) {
    const key = copyButton.getAttribute('data-key');
    const account = accounts.find((item) => item.id === copyId);
    if (account) {
      copyText(account[key] || '');
    }
    return;
  }

  if (openId) {
    const key = openButton.getAttribute('data-key');
    const account = accounts.find((item) => item.id === openId);
    if (account && account[key]) {
      await window.accountsApi.openExternal(account[key]);
    }
    return;
  }

  if (removeId) {
    accounts = accounts.filter((account) => account.id !== removeId);
    pendingEdits.delete(removeId);
    render();
    await persist();
    return;
  }

  if (saveCardId) {
    const account = accounts.find((item) => item.id === saveCardId);
    const draft = pendingEdits.get(saveCardId);
    if (!account || !draft) {
      return;
    }

    for (const key of fields) {
      if (Object.hasOwn(draft, key)) {
        account[key] = String(draft[key] || '').trim();
      }
    }

    if (!account.login || !account.password || !account.nickname) {
      alert('Login, password and nickname are mandatory.');
      return;
    }

    if (!account.opgg) {
      account.opgg = generateOpggFromNickname(account.nickname, account.opgg);
    }

    pendingEdits.delete(saveCardId);
    render();
    await persist();
    return;
  }

  if (syncCardId) {
    await syncSingleAccount(syncCardId);
    return;
  }

  if (historyId) {
    const account = accounts.find((item) => item.id === historyId);
    if (!account) {
      return;
    }

    historyLoading.add(historyId);
    render();

    const result = await window.accountsApi.fetchHistory(account);
    historyLoading.delete(historyId);

    if (!result?.ok) {
      account.rankNote = result?.error || 'Unable to fetch history.';
      scheduleRankErrorClearForList([account]);
      render();
      await persist();
      return;
    }

    historyByAccount.set(historyId, Array.isArray(result.history) ? result.history : []);
    render();
    return;
  }

  if (exportId) {
    const account = accounts.find((item) => item.id === exportId);
    if (!account || !canExportAccount(account)) {
      alert('Sync this card before exporting.');
      return;
    }

    const history = historyByAccount.get(exportId) || [];
    const pngDataUrl = await buildCardExportPng(account, history);
    if (!pngDataUrl) {
      alert('Unable to build PNG export for this card.');
      return;
    }

    const suggested = `${account.syncMeta?.accountName || account.nickname || 'account'}_sync_export`;
    const result = await window.accountsApi.exportCardPng(pngDataUrl, suggested);
    if (result?.ok) {
      alert('Card exported as PNG.');
    }
  }
});

cardsEl.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  const selectId = target.getAttribute('data-select-card');
  if (!selectId) {
    return;
  }

  if (target.checked) {
    selectedCardIds.add(selectId);
  } else {
    selectedCardIds.delete(selectId);
  }

  render();
});

cardsEl.addEventListener('input', (event) => {
  const updateId = event.target.getAttribute('data-update');
  if (!updateId) {
    return;
  }

  const key = event.target.getAttribute('data-key');
  const account = accounts.find((item) => item.id === updateId);
  if (!account || !fields.includes(key)) {
    return;
  }

  const nextValue = String(event.target.value || '').trim();
  const originalValue = String(account[key] || '').trim();
  const draft = pendingEdits.get(updateId) || {};

  if (nextValue === originalValue) {
    delete draft[key];
  } else {
    draft[key] = nextValue;
  }

  if (Object.keys(draft).length === 0) {
    pendingEdits.delete(updateId);
  } else {
    pendingEdits.set(updateId, draft);
  }

  const saveButton = cardsEl.querySelector(`[data-save-card="${updateId}"]`);
  if (saveButton) {
    saveButton.classList.toggle('visible', pendingEdits.has(updateId));
  }
});

cardsEl.addEventListener('error', (event) => {
  const img = event.target;
  if (!(img instanceof HTMLImageElement) || !img.classList.contains('rank-emblem-img')) {
    return;
  }

  const fallback = String(img.dataset.fallback || '');
  if (!fallback || img.dataset.fallbackApplied === '1') {
    return;
  }

  img.dataset.fallbackApplied = '1';
  img.src = fallback;
}, true);

addForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const draft = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    login: document.getElementById('login').value.trim(),
    password: document.getElementById('password').value.trim(),
    nickname: document.getElementById('nickname').value.trim(),
    email: document.getElementById('email').value.trim(),
    status: document.getElementById('status').value.trim(),
    commentary: document.getElementById('commentary').value.trim(),
    opgg: document.getElementById('opgg').value.trim(),
    createdAt: new Date().toISOString()
  };

  if (!draft.login || !draft.password || !draft.nickname) {
    alert('Login, password and nickname are required.');
    return;
  }

  if (!draft.opgg) {
    draft.opgg = generateOpggFromNickname(draft.nickname, '');
  }

  accounts.unshift(draft);
  pendingEdits.delete(draft.id);
  triggerNewCardEffect([draft.id]);
  addForm.reset();
  await persist();
});

document.getElementById('save-btn').addEventListener('click', async () => {
  await persist();
  alert('Saved.');
});

syncRankBtn.addEventListener('click', async () => {
  if (accounts.length === 0) {
    alert('No accounts to sync.');
    return;
  }

  syncRankBtn.disabled = true;
  setSyncButtonLoading();

  const result = await window.accountsApi.syncRiotRanks(accounts, '');
  syncRankBtn.disabled = false;
  setSyncButtonIdle();

  if (!result?.ok) {
    alert(result?.error || 'Riot rank sync failed.');
    return;
  }

  accounts = Array.isArray(result.accounts) ? result.accounts : accounts;
  render();
  await persist();
  scheduleRankErrorClearForList(accounts);
  alert('Riot rank sync complete.');
});

removeAllBtn.addEventListener('click', async () => {
  if (accounts.length === 0) {
    return;
  }

  const confirmed = confirm('Remove all accounts? This cannot be undone.');
  if (!confirmed) {
    return;
  }

  accounts = [];
  selectedCardIds.clear();
  render();
  await persist();
});

exportSelectedBtn.addEventListener('click', async () => {
  const selected = accounts.filter((account) => selectedCardIds.has(account.id));
  if (selected.length === 0) {
    alert('Select at least one card to export.');
    return;
  }

  const syncedSelected = selected.filter((account) => canExportAccount(account));
  if (syncedSelected.length === 0) {
    alert('Selected cards are not synced yet.');
    return;
  }

  const items = [];
  for (const account of syncedSelected) {
    const history = historyByAccount.get(account.id) || [];
    const pngDataUrl = await buildCardExportPng(account, history);
    if (!pngDataUrl) {
      continue;
    }

    items.push({
      pngDataUrl,
      suggestedName: `${account.syncMeta?.accountName || account.nickname || 'account'}_sync_export`
    });
  }

  if (!items.length) {
    alert('Unable to build PNG exports for selected cards.');
    return;
  }

  const result = await window.accountsApi.exportCardsPngBulk(items);
  if (result?.cancelled) {
    return;
  }

  if (!result?.ok) {
    alert(result?.error || 'Bulk export failed.');
    return;
  }

  const unsyncedSkipped = selected.length - syncedSelected.length;
  const renderSkipped = syncedSelected.length - items.length;
  const parts = [`Exported ${result.exportedCount} PNG file(s).`];
  if (unsyncedSkipped > 0) {
    parts.push(`${unsyncedSkipped} unsynced selected card(s) skipped.`);
  }
  if (renderSkipped > 0) {
    parts.push(`${renderSkipped} synced selected card(s) failed to render.`);
  }
  alert(parts.join(' '));
});

document.getElementById('import-pdf-btn').addEventListener('click', async () => {
  const filePath = await window.accountsApi.pickPdf();
  if (!filePath) {
    return;
  }

  const imported = await window.accountsApi.importFromPdf(filePath);
  if (!imported.length) {
    alert('No account found in the PDF.');
    return;
  }

  const prepared = imported.map((item) => ({
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    opgg: item.opgg || generateOpggFromNickname(item.nickname, '')
  }));

  accounts = [...prepared, ...accounts];
  prepared.forEach((item) => pendingEdits.delete(item.id));
  triggerNewCardEffect(prepared.map((item) => item.id));
  await persist();
  alert(`Imported ${prepared.length} account cards. You can edit any field.`);
});

async function init() {
  accounts = await window.accountsApi.loadAccounts();
  selectedCardIds.clear();
  setSyncButtonIdle();
  render();
}

init();