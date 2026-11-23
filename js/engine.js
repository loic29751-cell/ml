/* Clawd Coach — Stockfish (asm.js) dans un Web Worker.
 * Le moteur est chargé depuis js/vendor/stockfish-src.js (fonctionne même en file://),
 * avec repli sur le CDN cdnjs si besoin. */
(function (root) {
  'use strict';
  const CC = root.CC;
  const CDN = ['https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js'];

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Chargement impossible : ' + src));
      document.head.appendChild(s);
    });
  }

  function parseInfo(line) {
    const t = line.split(' ');
    const o = { multipv: 1, depth: 0, score: null, pv: [], bound: false };
    for (let i = 1; i < t.length; i++) {
      const k = t[i];
      if (k === 'depth') o.depth = +t[++i];
      else if (k === 'multipv') o.multipv = +t[++i];
      else if (k === 'score') {
        const type = t[++i];
        const v = +t[++i];
        o.score = type === 'mate' ? { mate: v } : { cp: v };
        if (t[i + 1] === 'lowerbound' || t[i + 1] === 'upperbound') {
          o.bound = true;
          i++;
        }
      } else if (k === 'pv') {
        o.pv = t.slice(i + 1).filter(Boolean);
        break;
      }
    }
    return o.score ? o : null;
  }

  // URL du worker qui a fonctionné : partagée par tous les moteurs (un seul Blob de 1,6 Mo en mémoire)
  let WORKER_URL = null;

  class Engine {
    constructor(opts) {
      this.worker = null;
      this.listeners = new Set();
      this.chain = Promise.resolve();
      this.initPromise = null;
      this.searching = null;
      this.latestToken = 0;
      this.onStatus = null;
      this.hash = (opts && opts.hash) || 32;
    }
    _status(s) {
      if (this.onStatus) this.onStatus(s);
    }

    init() {
      if (this.initPromise) return this.initPromise;
      this._status('loading');
      this.initPromise = (async () => {
        const candidates = WORKER_URL
          ? [async () => WORKER_URL]
          : [
              async () => {
                if (!root.__STOCKFISH_SRC) await loadScript('js/vendor/stockfish-src.js');
                return URL.createObjectURL(new Blob([root.__STOCKFISH_SRC], { type: 'text/javascript' }));
              },
              ...CDN.map((u) => async () =>
                URL.createObjectURL(new Blob([`importScripts(${JSON.stringify(u)});`], { type: 'text/javascript' }))
              ),
            ];
        let lastErr = null;
        for (const make of candidates) {
          try {
            const url = await make();
            const w = await this._boot(url);
            WORKER_URL = url;
            this.worker = w;
            w.onmessage = (e) => this._dispatch(e.data);
            w.onerror = (e) => console.error('[stockfish]', e.message || e);
            this.send('setoption name Hash value ' + this.hash);
            this.send('isready');
            this._status('ready');
            return;
          } catch (err) {
            lastErr = err;
            console.warn('[engine] tentative échouée', err);
          }
        }
        this.initPromise = null;
        this._status('error');
        throw lastErr || new Error('Stockfish indisponible');
      })();
      return this.initPromise;
    }

    _boot(url) {
      return new Promise((resolve, reject) => {
        let w;
        try {
          w = new Worker(url);
        } catch (e) {
          reject(e);
          return;
        }
        const timer = setTimeout(() => {
          w.terminate();
          reject(new Error('Stockfish ne répond pas'));
        }, 25000);
        w.onmessage = (e) => {
          if (String(e.data).indexOf('uciok') >= 0) {
            clearTimeout(timer);
            resolve(w);
          }
        };
        w.onerror = (e) => {
          clearTimeout(timer);
          w.terminate();
          reject(new Error(e.message || 'Erreur du worker Stockfish'));
        };
        w.postMessage('uci');
      });
    }

    _dispatch(data) {
      const text = String(data);
      const lines = text.indexOf('\n') >= 0 ? text.split('\n') : [text];
      for (const line of lines) if (line) for (const fn of this.listeners) fn(line);
    }

    send(cmd) {
      if (this.worker) this.worker.postMessage(cmd);
    }

    /** Analyse une position. opts: { depth, movetime, multipv }.
     *  Résout { best, lines: [{ score (Blancs), pv: [uci], depth }] } */
    analyze(fen, opts) {
      opts = opts || {};
      const job = () => this._run(fen, opts);
      const p = this.chain.then(job, job);
      this.chain = p.catch(() => {});
      return p;
    }

    async _run(fen, opts) {
      if (opts.isStale && opts.isStale()) throw new Error('stale');
      await this.init();
      if (opts.isStale && opts.isStale()) throw new Error('stale');
      const turn = fen.split(' ')[1] || 'w';
      return new Promise((resolve) => {
        const lines = [];
        const fn = (line) => {
          if (line.startsWith('info ') && line.indexOf(' pv ') > 0) {
            const inf = parseInfo(line);
            if (!inf || inf.bound || !inf.pv.length) return;
            lines[inf.multipv - 1] = { score: CC.fromEngine(inf.score, turn), pv: inf.pv, depth: inf.depth };
          } else if (line.startsWith('bestmove')) {
            this.listeners.delete(fn);
            this.searching = null;
            this._status('ready');
            const best = line.split(' ')[1];
            const out = lines.filter(Boolean);
            if (!out.length && best && best !== '(none)') out.push({ score: { cp: 0, mate: null }, pv: [best], depth: 0 });
            resolve({ fen, turn, best: best && best !== '(none)' ? best : null, lines: out });
          }
        };
        this.listeners.add(fn);
        this.searching = { latest: !!opts.latest, owner: opts.owner || null };
        this._status('busy');
        this.send('setoption name MultiPV value ' + (opts.multipv || 1));
        this.send('position fen ' + fen);
        this.send('go depth ' + (opts.depth || 12) + (opts.movetime ? ' movetime ' + opts.movetime : ''));
      });
    }

    /** Analyse interactive : chaque nouvelle demande interrompt la précédente. */
    analyzeLatest(fen, opts) {
      const token = ++this.latestToken;
      if (this.searching && this.searching.latest) this.send('stop');
      return this.analyze(fen, Object.assign({}, opts, { latest: true, isStale: () => token !== this.latestToken })).then(
        (res) => {
          if (token !== this.latestToken) throw new Error('stale');
          return res;
        }
      );
    }

    /** Coupe la recherche en cours (le résultat partiel est quand même renvoyé).
     *  owner : ne coupe que si la recherche appartient à ce propriétaire. */
    stop(owner) {
      if (this.searching && (!owner || this.searching.owner === owner)) this.send('stop');
    }
  }

  /** Plusieurs Stockfish en parallèle (un par cœur) pour analyser une partie beaucoup plus vite. */
  class EnginePool {
    constructor() {
      this.engines = [];
      this.warmed = new Set();
    }
    /** Démarre (si besoin) n moteurs ; renvoie ceux qui sont prêts */
    async ensure(n) {
      while (this.engines.length < n) this.engines.push(new Engine({ hash: 16 }));
      await this.engines[0].init(); // le premier établit l'URL du worker
      await Promise.all(this.engines.slice(1, n).map((e) => e.init().catch(() => null)));
      const ready = this.engines.slice(0, n).filter((e) => e.worker);
      if (!ready.length) throw new Error('Stockfish indisponible');
      return ready;
    }
    /** Chauffe le JIT de chaque moteur (les premières recherches sont lentes) */
    async warm(n) {
      const ready = await this.ensure(n);
      const fen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 1 5';
      await Promise.all(
        ready.map((e) => {
          if (this.warmed.has(e)) return null;
          this.warmed.add(e);
          return e.analyze(fen, { depth: 14, movetime: 1500, multipv: 2 }).catch(() => null);
        })
      );
    }
    /**
     * Traite `items` en parallèle : job(item, engine, index) -> résultat.
     * Les positions sont distribuées par petits paquets consécutifs (la table de hachage
     * de chaque moteur profite des positions voisines), avec équilibrage dynamique.
     */
    async run(items, n, job, opts) {
      opts = opts || {};
      const engines = await this.ensure(n);
      const out = new Array(items.length).fill(null);
      const isCancelled = opts.isCancelled || (() => false);
      const chunk = opts.chunk || CC.clamp(Math.ceil(items.length / (engines.length * 2)), 1, 8);
      let next = 0;
      const loop = async (eng) => {
        while (!isCancelled() && next < items.length) {
          const start = next;
          const end = Math.min(items.length, start + chunk);
          next = end;
          for (let k = start; k < end; k++) {
            if (isCancelled()) return;
            out[k] = await job(items[k], eng, k);
            if (opts.onDone) opts.onDone(k, out[k]);
          }
        }
      };
      await Promise.all(engines.map(loop));
      return out;
    }
    stop(owner) {
      for (const e of this.engines) e.stop(owner);
    }
  }

  CC.Engine = Engine;
  CC.EnginePool = EnginePool;
})(window);
