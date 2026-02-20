const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

let mainWindow = null;
const CUSTOM_PROTOCOL = 'riftvault';

const DATA_FILE = 'accounts.json';
const DEFAULT_COLUMN_STARTS = {
  login: 56.8,
  password: 146.2,
  nickname: 190,
  email: 237.6,
  status: 308.4,
  commentary: 347.9,
  opgg: 433.6
};
const COLUMN_FIELDS = ['login', 'password', 'nickname', 'email', 'status', 'commentary', 'opgg'];
const DEFAULT_RIOT_API_KEY = process.env.API_KEY || '';
const REGION_BY_PLATFORM = {
  br1: 'americas',
  eun1: 'europe',
  euw1: 'europe',
  jp1: 'asia',
  kr: 'asia',
  la1: 'americas',
  la2: 'americas',
  na1: 'americas',
  oc1: 'sea',
  tr1: 'europe',
  ru: 'europe',
  ph2: 'sea',
  sg2: 'sea',
  th2: 'sea',
  tw2: 'sea',
  vn2: 'sea'
};

const OPGG_TO_PLATFORM = {
  br: 'br1',
  eune: 'eun1',
  euw: 'euw1',
  jp: 'jp1',
  kr: 'kr',
  lan: 'la1',
  las: 'la2',
  na: 'na1',
  oce: 'oc1',
  tr: 'tr1',
  ru: 'ru',
  ph: 'ph2',
  sg: 'sg2',
  th: 'th2',
  tw: 'tw2',
  vn: 'vn2'
};

const TAGLINE_TO_PLATFORM = {
  BR: 'br1',
  EUNE: 'eun1',
  EUW: 'euw1',
  JP: 'jp1',
  KR: 'kr',
  LAN: 'la1',
  LAS: 'la2',
  NA: 'na1',
  OCE: 'oc1',
  TR: 'tr1',
  RU: 'ru',
  PH: 'ph2',
  SG: 'sg2',
  TH: 'th2',
  TW: 'tw2',
  VN: 'vn2'
};

const ACCOUNT_REGIONS = ['europe', 'americas', 'asia', 'sea'];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1080,
    minHeight: 700,
    autoHideMenuBar: true,
    backgroundColor: '#050810',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

function registerCustomProtocol() {
  if (app.isPackaged) {
    app.setAsDefaultProtocolClient(CUSTOM_PROTOCOL);
    return;
  }

  const entryPoint = process.argv[1];
  if (entryPoint) {
    app.setAsDefaultProtocolClient(CUSTOM_PROTOCOL, process.execPath, [path.resolve(entryPoint)]);
  }
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.focus();
}

function handleDeepLink(url) {
  if (typeof url !== 'string' || !url.startsWith(`${CUSTOM_PROTOCOL}://`)) {
    return;
  }

  focusMainWindow();
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const link = argv.find((value) => typeof value === 'string' && value.startsWith(`${CUSTOM_PROTOCOL}://`));
    if (link) {
      handleDeepLink(link);
      return;
    }
    focusMainWindow();
  });
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

function getDataPath() {
  return path.join(app.getPath('userData'), DATA_FILE);
}

function readAccounts() {
  const dataPath = getDataPath();
  if (!fs.existsSync(dataPath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(dataPath, 'utf8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAccounts(accounts) {
  const dataPath = getDataPath();
  fs.writeFileSync(dataPath, JSON.stringify(accounts, null, 2), 'utf8');
}

function sanitizeFileName(value) {
  return String(value || 'account')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

function normalizeNicknameForOpgg(nickname) {
  return encodeURIComponent(String(nickname || '').trim().replace(/\s*#\s*/g, '-'));
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRiotId(text) {
  const value = normalizeText(text);
  if (!value.includes('#')) {
    return null;
  }

  const separatorIndex = value.lastIndexOf('#');
  const gameName = value.slice(0, separatorIndex);
  const tagLine = value.slice(separatorIndex + 1);
  if (!gameName || !tagLine) {
    return null;
  }

  return {
    gameName: gameName.trim(),
    tagLine: tagLine.trim()
  };
}

function inferPlatformFromOpgg(opgg) {
  if (!/^https?:\/\//i.test(opgg || '')) {
    return 'euw1';
  }

  try {
    const url = new URL(opgg);
    const parts = url.pathname.split('/').filter(Boolean);
    const summonerIndex = parts.findIndex((part) => part.toLowerCase() === 'summoners');
    const opggRegion = summonerIndex >= 0 ? parts[summonerIndex + 1] : '';
    return OPGG_TO_PLATFORM[String(opggRegion || '').toLowerCase()] || 'euw1';
  } catch {
    return 'euw1';
  }
}

function getRoutingFromAccount(account) {
  const riotId = parseRiotId(account.nickname || '');
  const byTagline = riotId ? TAGLINE_TO_PLATFORM[String(riotId.tagLine || '').toUpperCase()] : '';
  const platform = byTagline || inferPlatformFromOpgg(account.opgg || '');
  const region = REGION_BY_PLATFORM[platform] || 'europe';
  return { platform, region };
}

async function riotFetch(url, apiKey) {
  try {
    const response = await fetch(url, {
      headers: {
        'X-Riot-Token': apiKey
      }
    });

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('Retry-After') || '1');
      await sleep(Math.max(1, retryAfter) * 1000);
      const retryResponse = await fetch(url, {
        headers: {
          'X-Riot-Token': apiKey
        }
      });

      let retryData = null;
      try {
        retryData = await retryResponse.json();
      } catch {
        retryData = null;
      }

      return {
        ok: retryResponse.ok,
        status: retryResponse.status,
        data: retryData,
        networkError: false
      };
    }

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
      networkError: false
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      networkError: true,
      message: String(error?.message || 'Network error')
    };
  }
}

function rankIconUrl(tier) {
  const normalized = String(tier || '').toLowerCase();
  if (!normalized || normalized === 'unranked') {
    return '';
  }
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${normalized}.png`;
}

function profileIconUrl(profileIconId) {
  if (!Number.isFinite(Number(profileIconId))) {
    return '';
  }
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${Number(profileIconId)}.jpg`;
}

function queueLabel(queueId) {
  const map = {
    420: 'Ranked Solo/Duo',
    440: 'Ranked Flex',
    450: 'ARAM',
    400: 'Normal Draft',
    430: 'Normal Blind',
    490: 'Normal Quickplay',
    700: 'Clash'
  };
  return map[Number(queueId)] || `Queue ${queueId}`;
}

function buildRankInfo(entry) {
  if (!entry) {
    return null;
  }

  const wins = Number(entry.wins || 0);
  const losses = Number(entry.losses || 0);
  const total = wins + losses;
  const winrate = total > 0 ? Math.round((wins / total) * 100) : 0;

  return {
    tier: String(entry.tier || 'UNRANKED').toUpperCase(),
    rank: String(entry.rank || ''),
    lp: Number(entry.leaguePoints || 0),
    queue: String(entry.queueType || 'RANKED_SOLO_5x5'),
    wins,
    losses,
    winrate,
    iconUrl: rankIconUrl(entry.tier || 'UNRANKED'),
    updatedAt: new Date().toISOString()
  };
}

async function fetchRiotAccountByRiotId(riotId, preferredRegion, apiKey) {
  const regionOrder = [preferredRegion, ...ACCOUNT_REGIONS.filter((region) => region !== preferredRegion)];
  let sawAuthError = false;
  let sawRateLimit = false;

  for (const region of regionOrder) {
    const response = await riotFetch(
      `https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(riotId.gameName)}/${encodeURIComponent(riotId.tagLine)}`,
      apiKey
    );

    if (response.ok && response.data?.puuid) {
      return {
        ok: true,
        region,
        data: response.data
      };
    }

    if (response.networkError) {
      continue;
    }

    if (response.status === 401 || response.status === 403) {
      sawAuthError = true;
      break;
    }

    if (response.status === 429) {
      sawRateLimit = true;
      break;
    }
  }

  if (sawAuthError) {
    return {
      ok: false,
      reason: 'auth'
    };
  }

  if (sawRateLimit) {
    return {
      ok: false,
      reason: 'rate_limit'
    };
  }

  return {
    ok: false,
    reason: 'not_found'
  };
}

async function fetchSummonerByPuuid(puuid, preferredPlatform, apiKey) {
  const platforms = [preferredPlatform, ...Object.keys(REGION_BY_PLATFORM).filter((platform) => platform !== preferredPlatform)];

  for (const platform of platforms) {
    const response = await riotFetch(
      `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`,
      apiKey
    );

    if (response.ok && response.data?.id) {
      return {
        ok: true,
        platform,
        data: response.data
      };
    }

    if (response.networkError) {
      continue;
    }

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        reason: 'auth'
      };
    }

    if (response.status === 429) {
      return {
        ok: false,
        reason: 'rate_limit'
      };
    }
  }

  return {
    ok: false,
    reason: 'not_found'
  };
}

async function fetchLeagueEntriesByPuuid(puuid, preferredPlatform, apiKey) {
  const platforms = [preferredPlatform, ...Object.keys(REGION_BY_PLATFORM).filter((platform) => platform !== preferredPlatform)];
  let sawAuthError = false;
  let sawRateLimit = false;

  for (const platform of platforms) {
    const response = await riotFetch(
      `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`,
      apiKey
    );

    if (response.ok) {
      return {
        ok: true,
        platform,
        data: Array.isArray(response.data) ? response.data : []
      };
    }

    if (response.networkError) {
      continue;
    }

    if (response.status === 401 || response.status === 403) {
      sawAuthError = true;
      break;
    }

    if (response.status === 429) {
      sawRateLimit = true;
      break;
    }
  }

  if (sawAuthError) {
    return {
      ok: false,
      reason: 'auth'
    };
  }

  if (sawRateLimit) {
    return {
      ok: false,
      reason: 'rate_limit'
    };
  }

  return {
    ok: false,
    reason: 'not_found'
  };
}

async function enrichAccountWithRiotRank(account, apiKey) {
  const riotId = parseRiotId(account.nickname || '');
  if (!riotId) {
    return {
      ...account,
      rankNote: 'Missing Riot ID format (gameName#tagLine).'
    };
  }

  const { platform, region } = getRoutingFromAccount(account);
  const accountResult = await fetchRiotAccountByRiotId(riotId, region, apiKey);
  if (!accountResult.ok) {
    const reasonMessage = accountResult.reason === 'auth'
      ? 'Riot API key invalid or expired.'
      : accountResult.reason === 'rate_limit'
        ? 'Riot API rate limit reached. Retry in a minute.'
        : 'Riot account not found from nickname Riot ID.';
    return {
      ...account,
      rankNote: reasonMessage
    };
  }

  const leagueResult = await fetchLeagueEntriesByPuuid(accountResult.data.puuid, platform, apiKey);
  const preferredPlatform = leagueResult.ok ? leagueResult.platform : platform;
  const summonerResult = await fetchSummonerByPuuid(accountResult.data.puuid, preferredPlatform, apiKey);

  if (!leagueResult.ok && !summonerResult.ok) {
    const authReason = leagueResult.reason === 'auth' || summonerResult.reason === 'auth';
    const rateReason = leagueResult.reason === 'rate_limit' || summonerResult.reason === 'rate_limit';
    const reasonMessage = authReason
      ? 'Riot API key invalid or expired.'
      : rateReason
        ? 'Riot API rate limit reached. Retry in a minute.'
        : 'Account exists but no LoL profile found on reachable platforms.';
    return {
      ...account,
      rankInfo: null,
      syncMeta: {
        puuid: accountResult.data.puuid,
        accountName: `${accountResult.data.gameName || riotId.gameName}#${accountResult.data.tagLine || riotId.tagLine}`,
        syncedAt: new Date().toISOString()
      },
      rankNote: reasonMessage
    };
  }

  const list = leagueResult.ok ? leagueResult.data : [];
  const solo = list.find((entry) => entry.queueType === 'RANKED_SOLO_5x5');
  const fallback = list[0];
  const rankInfo = buildRankInfo(solo || fallback);
  const syncedAccountName = `${accountResult.data.gameName || riotId.gameName}#${accountResult.data.tagLine || riotId.tagLine}`;
  const platformUsed = summonerResult.ok ? summonerResult.platform : preferredPlatform;

  return {
    ...account,
    rankInfo,
    rankNote: rankInfo ? '' : 'No ranked data yet.',
    syncMeta: {
      puuid: accountResult.data.puuid,
      summonerId: summonerResult.ok ? summonerResult.data.id : '',
      platform: platformUsed,
      region: REGION_BY_PLATFORM[platformUsed] || region,
      accountName: syncedAccountName,
      profileIconId: Number(summonerResult.ok ? (summonerResult.data.profileIconId || 0) : 0),
      profileIconUrl: summonerResult.ok ? profileIconUrl(summonerResult.data.profileIconId) : '',
      summonerLevel: Number(summonerResult.ok ? (summonerResult.data.summonerLevel || 0) : 0),
      syncedAt: new Date().toISOString()
    }
  };
}

async function fetchMatchHistoryForAccount(account, apiKey) {
  const puuid = account?.syncMeta?.puuid;
  const region = account?.syncMeta?.region || getRoutingFromAccount(account).region;
  if (!puuid) {
    return {
      ok: false,
      error: 'Account must be synced first.'
    };
  }

  const listResponse = await riotFetch(
    `https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?start=0&count=5`,
    apiKey
  );

  if (!listResponse.ok) {
    const message = listResponse.status === 429
      ? 'Rate limit reached, retry soon.'
      : listResponse.status === 401 || listResponse.status === 403
        ? 'Riot API key invalid or expired.'
        : 'Unable to retrieve match list.';
    return {
      ok: false,
      error: message
    };
  }

  const ids = Array.isArray(listResponse.data) ? listResponse.data.slice(0, 5) : [];
  const history = [];

  for (const matchId of ids) {
    const matchResponse = await riotFetch(
      `https://${region}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`,
      apiKey
    );

    if (!matchResponse.ok || !matchResponse.data?.info?.participants) {
      continue;
    }

    const participants = matchResponse.data.info.participants;
    const player = participants.find((participant) => participant.puuid === puuid);
    if (!player) {
      continue;
    }

    history.push({
      matchId,
      championName: String(player.championName || 'Unknown'),
      kills: Number(player.kills || 0),
      deaths: Number(player.deaths || 0),
      assists: Number(player.assists || 0),
      win: Boolean(player.win),
      queueId: Number(matchResponse.data.info.queueId || 0),
      queueLabel: queueLabel(matchResponse.data.info.queueId || 0),
      gameDuration: Number(matchResponse.data.info.gameDuration || 0),
      gameCreation: Number(matchResponse.data.info.gameCreation || 0)
    });

    await sleep(80);
  }

  return {
    ok: true,
    history
  };
}

async function enrichAllAccountsWithRiotRanks(accounts, apiKey) {
  const source = Array.isArray(accounts) ? accounts : [];
  const enriched = [];

  for (const account of source) {
    const next = await enrichAccountWithRiotRank(account, apiKey);
    enriched.push(next);
    await sleep(120);
  }

  return enriched;
}

function buildColumnStarts(tokens) {
  const headerTokens = tokens.filter((token) => {
    const label = token.text.toUpperCase();
    return (
      label.includes('LOGIN') ||
      label.includes('PASSWORD') ||
      label.includes('ACCOUNT NAME') ||
      label.includes('EMAIL') ||
      label.includes('STATUS') ||
      label.includes('COMMENTARY') ||
      label.includes('OP GG LINK')
    );
  });

  const byLabel = {
    login: headerTokens.find((token) => token.text.toUpperCase() === 'LOGIN')?.x,
    password: headerTokens.find((token) => token.text.toUpperCase() === 'PASSWORD')?.x,
    nickname: headerTokens.find((token) => token.text.toUpperCase().includes('ACCOUNT NAME'))?.x,
    email: headerTokens.find((token) => token.text.toUpperCase() === 'EMAIL')?.x,
    status: headerTokens.find((token) => token.text.toUpperCase() === 'STATUS')?.x,
    commentary: headerTokens.find((token) => token.text.toUpperCase() === 'COMMENTARY')?.x,
    opgg: headerTokens.find((token) => token.text.toUpperCase().includes('OP GG LINK'))?.x
  };

  return {
    login: byLabel.login ?? DEFAULT_COLUMN_STARTS.login,
    password: byLabel.password ?? DEFAULT_COLUMN_STARTS.password,
    nickname: byLabel.nickname ?? DEFAULT_COLUMN_STARTS.nickname,
    email: byLabel.email ?? DEFAULT_COLUMN_STARTS.email,
    status: byLabel.status ?? DEFAULT_COLUMN_STARTS.status,
    commentary: byLabel.commentary ?? DEFAULT_COLUMN_STARTS.commentary,
    opgg: byLabel.opgg ?? DEFAULT_COLUMN_STARTS.opgg
  };
}

function findColumnIndex(x, startsArray) {
  for (let index = startsArray.length - 1; index >= 0; index -= 1) {
    if (x >= startsArray[index] - 1) {
      return index;
    }
  }
  return 0;
}

function buildRowAnchors(tokens) {
  const ys = [...new Set(tokens.map((token) => Number(token.y.toFixed(1))))].sort((a, b) => b - a);
  const clusters = [];

  for (const y of ys) {
    const lastCluster = clusters[clusters.length - 1];
    if (!lastCluster || Math.abs(lastCluster[lastCluster.length - 1] - y) > 1.2) {
      clusters.push([y]);
    } else {
      lastCluster.push(y);
    }
  }

  return clusters
    .map((cluster) => cluster.reduce((sum, value) => sum + value, 0) / cluster.length)
    .sort((a, b) => b - a);
}

function nearestRowIndex(y, rowAnchors) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < rowAnchors.length; index += 1) {
    const distance = Math.abs(rowAnchors[index] - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestDistance <= 1.6 ? bestIndex : -1;
}

function parseRowsFromPage(tokens) {
  const headerY = Math.max(
    ...tokens
      .filter((token) => {
        const label = token.text.toUpperCase();
        return (
          label.includes('LOGIN') ||
          label.includes('PASSWORD') ||
          label.includes('ACCOUNT NAME') ||
          label.includes('EMAIL') ||
          label.includes('STATUS') ||
          label.includes('COMMENTARY') ||
          label.includes('OP GG LINK')
        );
      })
      .map((token) => token.y)
  );

  if (!Number.isFinite(headerY)) {
    return [];
  }

  const dataTokens = tokens.filter((token) => token.y < headerY - 1 && token.y > 70);
  const rowAnchors = buildRowAnchors(dataTokens);
  const starts = buildColumnStarts(tokens);
  const startsArray = COLUMN_FIELDS.map((field) => starts[field]);

  const rows = rowAnchors.map(() => ({
    login: '',
    password: '',
    nickname: '',
    email: '',
    status: '',
    commentary: '',
    opgg: ''
  }));

  for (const token of dataTokens) {
    const rowIndex = nearestRowIndex(token.y, rowAnchors);
    if (rowIndex < 0) {
      continue;
    }

    const columnIndex = findColumnIndex(token.x, startsArray);
    const key = COLUMN_FIELDS[columnIndex];
    rows[rowIndex][key] = normalizeText(`${rows[rowIndex][key]} ${token.text}`);
  }

  return rows.filter((row) => Object.values(row).some((value) => value));
}

async function parsePdfAccounts(pdfPath) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const document = await pdfjs.getDocument({ data }).promise;
  const rows = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const tokens = textContent.items
      .map((item) => ({
        text: normalizeText(item.str),
        x: item.transform[4],
        y: item.transform[5]
      }))
      .filter((token) => token.text);

    rows.push(...parseRowsFromPage(tokens));
  }

  const explicitLink = rows.find((row) => /^https?:\/\//i.test(row.opgg || ''))?.opgg || '';
  let opggPrefix = '';

  if (explicitLink) {
    try {
      const parsed = new URL(explicitLink);
      const parts = parsed.pathname.split('/').filter(Boolean);
      const summonerIndex = parts.findIndex((part) => part.toLowerCase() === 'summoners');
      if (summonerIndex >= 0 && parts.length > summonerIndex + 2) {
        opggPrefix = `${parsed.origin}/${parts.slice(0, summonerIndex + 2).join('/')}/`;
      }
    } catch {
      opggPrefix = '';
    }
  }

  return rows.map((row, index) => {
    const normalizedNickname = normalizeText(row.nickname);
    const generatedOpgg = opggPrefix && normalizedNickname
      ? `${opggPrefix}${normalizeNicknameForOpgg(normalizedNickname)}`
      : '';

    return {
      id: `pdf-${Date.now()}-${index}`,
      login: normalizeText(row.login),
      password: normalizeText(row.password),
      nickname: normalizedNickname,
      email: normalizeText(row.email),
      status: normalizeText(row.status),
      commentary: normalizeText(row.commentary),
      opgg: normalizeText(row.opgg) || generatedOpgg,
      createdAt: new Date().toISOString()
    };
  });
}

ipcMain.handle('accounts:load', async () => {
  return readAccounts();
});

ipcMain.handle('accounts:save', async (_event, accounts) => {
  writeAccounts(accounts);
  return { ok: true };
});

ipcMain.handle('accounts:pick-pdf', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('accounts:import-pdf', async (_event, pdfPath) => {
  if (!pdfPath) {
    return [];
  }

  return parsePdfAccounts(pdfPath);
});

ipcMain.handle('accounts:open-external', async (_event, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return { ok: false };
  }
  await shell.openExternal(url);
  return { ok: true };
});

ipcMain.handle('accounts:export-card-png', async (_event, pngDataUrl, suggestedName) => {
  if (typeof pngDataUrl !== 'string' || !pngDataUrl.startsWith('data:image/png;base64,')) {
    return { ok: false, error: 'Invalid PNG payload.' };
  }

  const fileName = sanitizeFileName(suggestedName || 'account_export');
  const result = await dialog.showSaveDialog({
    title: 'Export account card',
    defaultPath: `${fileName}.png`,
    filters: [{ name: 'PNG', extensions: ['png'] }]
  });

  if (result.canceled || !result.filePath) {
    return { ok: false, cancelled: true };
  }

  const base64 = pngDataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(result.filePath, Buffer.from(base64, 'base64'));
  return { ok: true, filePath: result.filePath };
});

ipcMain.handle('accounts:export-cards-png-bulk', async (_event, items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'No export items provided.' };
  }

  const directoryResult = await dialog.showOpenDialog({
    title: 'Choose export folder',
    properties: ['openDirectory', 'createDirectory']
  });

  if (directoryResult.canceled || directoryResult.filePaths.length === 0) {
    return { ok: false, cancelled: true };
  }

  const targetDir = directoryResult.filePaths[0];
  const usedNames = new Set();
  const exportedFiles = [];

  for (const item of items) {
    const pngDataUrl = typeof item?.pngDataUrl === 'string' ? item.pngDataUrl : '';
    if (!pngDataUrl.startsWith('data:image/png;base64,')) {
      continue;
    }

    const baseName = sanitizeFileName(item?.suggestedName || 'account_export');
    let fileName = `${baseName}.png`;
    let suffix = 1;

    while (usedNames.has(fileName) || fs.existsSync(path.join(targetDir, fileName))) {
      fileName = `${baseName}_${suffix}.png`;
      suffix += 1;
    }

    usedNames.add(fileName);

    try {
      const base64 = pngDataUrl.replace(/^data:image\/png;base64,/, '');
      const filePath = path.join(targetDir, fileName);
      fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
      exportedFiles.push(filePath);
    } catch {
      continue;
    }
  }

  if (exportedFiles.length === 0) {
    return { ok: false, error: 'No valid PNG could be exported.' };
  }

  return {
    ok: true,
    exportedCount: exportedFiles.length,
    directory: targetDir,
    files: exportedFiles
  };
});

ipcMain.handle('accounts:sync-riot-ranks', async (_event, accounts, apiKey) => {
  const token = normalizeText(DEFAULT_RIOT_API_KEY);
  if (!token) {
    return {
      ok: false,
      error: 'Missing Riot API key.'
    };
  }

  try {
    const enriched = await enrichAllAccountsWithRiotRanks(accounts, token);
    return {
      ok: true,
      accounts: enriched
    };
  } catch {
    return {
      ok: false,
      error: 'Riot sync failed due to network or routing issue. Please retry.'
    };
  }
});

ipcMain.handle('accounts:fetch-history', async (_event, account) => {
  const token = normalizeText(DEFAULT_RIOT_API_KEY);
  if (!token) {
    return {
      ok: false,
      error: 'Missing Riot API key.'
    };
  }

  try {
    return await fetchMatchHistoryForAccount(account, token);
  } catch {
    return {
      ok: false,
      error: 'Unable to retrieve history right now.'
    };
  }
});

app.whenReady().then(() => {
  registerCustomProtocol();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});