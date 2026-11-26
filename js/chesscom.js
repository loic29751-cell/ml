/* Claude Coach — API publique de chess.com (lecture seule, sans compte).
 * Doc : https://www.chess.com/news/view/published-data-api */
(function (root) {
  'use strict';
  const CC = root.CC;
  const BASE = 'https://api.chess.com/pub/player/';

  class ApiError extends Error {
    constructor(code, msg) {
      super(msg);
      this.code = code;
    }
  }

  async function getJSON(url) {
    let res = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await fetch(url);
      } catch (e) {
        throw new ApiError('network', 'Impossible de joindre chess.com (connexion internet ?)');
      }
      if (res.status === 429) {
        await CC.sleep(1200 * (attempt + 1));
        continue;
      }
      break;
    }
    if (res.status === 404) throw new ApiError('notfound', 'Introuvable sur chess.com');
    if (res.status === 410) throw new ApiError('gone', 'Ce compte chess.com est fermé');
    if (!res.ok) throw new ApiError('http', 'chess.com a répondu ' + res.status);
    return res.json();
  }
  const slug = (name) => encodeURIComponent(String(name).trim().toLowerCase());

  const RESULT_FR = {
    win: 'Victoire',
    checkmated: 'Échec et mat',
    resigned: 'Abandon',
    timeout: 'Au temps',
    abandoned: 'Partie abandonnée',
    lose: 'Défaite',
    agreed: 'Nulle par accord',
    repetition: 'Nulle par répétition',
    stalemate: 'Pat',
    insufficient: 'Matériel insuffisant',
    '50move': 'Règle des 50 coups',
    timevsinsufficient: 'Temps vs matériel insuffisant',
  };

  CC.ChessCom = {
    ApiError,
    profile: (name) => getJSON(BASE + slug(name)),
    stats: (name) => getJSON(BASE + slug(name) + '/stats'),
    async archives(name) {
      const data = await getJSON(BASE + slug(name) + '/games/archives');
      return data.archives || [];
    },
    /** Parties d'un mois, les plus récentes d'abord */
    async month(url) {
      const data = await getJSON(url);
      return (data.games || []).slice().reverse();
    },
    gameId(url) {
      const m = /(\d{5,})\/?(?:[?#].*)?$/.exec(String(url || '').trim());
      return m ? m[1] : null;
    },
    resultCode(r) {
      if (r === 'win') return 'win';
      if (['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'].includes(r)) return 'draw';
      return 'loss';
    },
    resultLabel: (r) => RESULT_FR[r] || r,
    /** Retrouve une partie par son identifiant dans les archives récentes d'un joueur */
    async findGame(name, id, maxMonths, onMonth) {
      const archives = await this.archives(name);
      for (let k = archives.length - 1, n = 0; k >= 0 && n < (maxMonths || 6); k--, n++) {
        if (onMonth) onMonth(archives[k]);
        const games = await this.month(archives[k]);
        const g = games.find((x) => this.gameId(x.url) === id);
        if (g) return g;
      }
      return null;
    },
  };
})(window);
