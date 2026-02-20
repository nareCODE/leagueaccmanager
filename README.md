# Rift Vault (Desktop)

League of Legends account manager desktop app (Electron) with:

- Living LoL-inspired animated background
- Account cards with one-click copy per field
- Required fields on add: `login`, `password`, `nickname`
- Optional fields: `email`, `status`, `commentary`, `opgg`
- Easy add, edit, remove, and persistent local save
- PDF import to generate cards from your exported sheet
- OP.GG link auto-generation from known OP.GG pattern

## Run

```bash
npm install
npm start
```

## Usage

1. Launch app with `npm start`.
2. Click **Import PDF** and choose your LoL PDF.
3. Imported cards appear instantly and are saved locally.
4. Add new account with required fields only (`login`, `password`, `nickname`) and fill other fields later.
5. Use **Copy** next to any field to copy it fast.
6. Use **Remove** to delete a card.

## Data Storage

Accounts are stored locally in Electron user data (`accounts.json`).

## Note about PDF parsing

Because some PDF exports flatten columns, imported credentials may need quick review/edit after import. Nickname, status, commentary, and OP.GG derivation are handled automatically as much as possible.


ERROR TO CHECK : 

[18824:0220/175422.302:ERROR:net\disk_cache\cache_util_win.cc:25] Unable to move the cache: Acc├¿s refus├®. (0x5)
[18824:0220/175422.303:ERROR:net\disk_cache\cache_util_win.cc:25] Unable to move the cache: Acc├¿s refus├®. (0x5)
[18824:0220/175422.303:ERROR:net\disk_cache\cache_util_win.cc:25] Unable to move the cache: Acc├¿s refus├®. (0x5)
 *  Terminal will be reused by tasks, press any key to close it. 

 --

 
NPM RUN WEB WONT START

 PS C:\Users\Utilisateur\Desktop\plumetonpote\website> npm run web

> plumetonpote@1.0.0 web
> node website/server.js

node:events:486
      throw er; // Unhandled 'error' event
      ^

Error: listen EADDRINUSE: address already in use :::5174
    at Server.setupListenHandle [as _listen2] (node:net:1940:16)
    at listenInCluster (node:net:1997:12)
    at Server.listen (node:net:2102:7)
    at app.listen (C:\Users\Utilisateur\Desktop\plumetonpote\node_modules\express\lib\application.js:635:24)
    at Object.<anonymous> (C:\Users\Utilisateur\Desktop\plumetonpote\website\server.js:119:5)
    at Module._compile (node:internal/modules/cjs/loader:1761:14)
    at Object..js (node:internal/modules/cjs/loader:1893:10)
    at Module.load (node:internal/modules/cjs/loader:1481:32)
    at Module._load (node:internal/modules/cjs/loader:1300:12)
    at TracingChannel.traceSync (node:diagnostics_channel:328:14)
Emitted 'error' event on Server instance at:
    at emitErrorNT (node:net:1976:8)
    at process.processTicksAndRejections (node:internal/process/task_queues:89:21) {
  code: 'EADDRINUSE',
  errno: -4091,
  syscall: 'listen',
  address: '::',
  port: 5174
}

----

IT WONT SYNC PROPERLY ANYMORE ? RETRY AND TEST - WORKED FINALLY BUT CHECK


---

ADD .csv export ( columns must be same names)

ADD PAGINATION, DISPLAY MODE "REDUCE" ( simply as fuck). "CARDS 2" 2 cards per line, 10 account per page. "LIST" in line list of each card nice and appealing.