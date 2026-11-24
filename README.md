# ✻ Clawd Coach

Bilan de tes parties **chess.com**, façon « Game Review » : Stockfish analyse chaque coup dans ton navigateur et **Clawd** (la mascotte de Claude Code) t'explique tes bons et mauvais coups.

## Lancer l'appli

Double-clique sur **`index.html`** (Chrome, Edge ou Firefox). Pas d'installation, pas de serveur, pas de compte.
Il faut seulement une connexion internet pour récupérer les parties sur chess.com.

Astuce : ajoute la page à tes favoris. Ton pseudo est mémorisé : à chaque ouverture, tes dernières parties s'affichent directement.
Tu peux aussi ouvrir `index.html#u=TonPseudo` pour charger un pseudo précis.

## Envoyer une partie

| Méthode | Comment |
|---|---|
| **Pseudo chess.com** | Tape ton pseudo → la liste de tes parties récentes apparaît → **Analyser** (ou « Analyser la dernière »). |
| **Lien d'une partie** | Colle l'adresse `https://www.chess.com/game/live/…` + le pseudo d'un des joueurs. |
| **PGN** | Sur chess.com : *Partager → PGN → Copier*, puis colle-le dans l'onglet PGN. Marche aussi avec des PGN lichess ou d'ailleurs. |

## Le bilan

- **Synthèse** : précision des deux joueurs, nombre de coups par catégorie, note par phase (ouverture, milieu, finale), graphe d'évaluation.
- **Coup par coup** : Clawd commente chaque coup (pièce en prise, fourchette, mat raté, sacrifice…), la flèche verte montre le meilleur coup.
- **Meilleur coup / Voir la suite** : rejoue la meilleure variante de Stockfish sur l'échiquier.
- **Réessayer** : sur tes erreurs, rejoue la position et cherche mieux (avec indice et solution).
- **Explorer** : déplace les pièces toi-même sur l'échiquier, Stockfish évalue la variante en direct.
- **Moments clés** : saute directement aux coups brillants, erreurs et gaffes.

Catégories (perte de chances de gain, modèle « points espérés ») :
Brillant (sacrifice correct) · Très bon coup (seul bon coup) · Meilleur · Excellent (≤ 2 %) · Bon (≤ 5 %) · Théorique · Imprécision (≤ 10 %) · Erreur (≤ 20 %) · Occasion manquée · Gaffe (> 20 %).

Clavier : `←` `→` coup précédent/suivant · `↑` `↓` début/fin · `Espace` lecture auto · `F` retourner l'échiquier · `Échap` quitter une variante.

## Mes faiblesses

L'onglet **Faiblesses** analyse toutes tes parties d'une période (ce mois-ci, le mois dernier, les 3 derniers mois ou **Tout**) et en tire un rapport :

- **Séparé par cadence** : une puce par contrôle de temps que tu joues vraiment (5 min, 10 min, 3 | 2…). La vue « Toutes » compare les cadences côte à côte, et un clic sur une cadence affiche son rapport complet.
- **Tes 3 priorités**, avec un chiffre, une explication et un conseil : zeitnot, pièces laissées en prise, tactiques adverses non vues, occasions manquées, finales, ouvertures, conversion d'un avantage, couleur.
- **Le détail** : précision partie par partie, précision par phase, origine des erreurs, gestion du temps, ouvertures, résultats par couleur.
- **Tes 10 pires erreurs** : « Rejouer » ouvre la position en mode Réessayer, « Tout rejouer en exercices » les enchaîne.
- **Propositions selon tes faiblesses** : pour chaque priorité, des exercices sur tes propres positions, des puzzles lichess du bon thème, et (pour les ouvertures) un bouton qui ajoute les bons coups à ton répertoire.
- **Ton programme de la semaine** : un plan jour par jour (exercices, révision du répertoire, puzzles, parties à jouer) avec des cases à cocher.

**✻ Bilan complet par Clawd** : un clic réanalyse toutes tes parties (toutes cadences, depuis la création de ton compte), puis envoie le rapport à Clawd dans le Chat. Il te répond avec tes 5 erreurs principales (exemples tirés de tes parties), les différences selon la cadence, des gambits vérifiés pour les Blancs et les Noirs, et un plan sur deux semaines. Le lien `index.html#coach=bilan` lance la même chose directement.

Seules les nouvelles parties sont analysées : relance le bouton de temps en temps, les mois précédents restent en mémoire pour suivre ta progression (flèches ▲▼ comparées au mois d'avant).

## Puzzles

L'onglet **Puzzles** propose des puzzles de la base publique lichess (sans compte) :

- **Pour toi** enchaîne les thèmes qui collent à tes faiblesses (pièces en prise en priorité, fourchettes, mats en 1 et 2, clouages, coups de défense…). Tu peux aussi choisir un thème précis.
- **Facile / Moyen / Difficile** règle le niveau des puzzles.
- Joue le coup sur l'échiquier : l'adversaire répond tout seul jusqu'à la fin de la combinaison. **Indice** montre la pièce à jouer, **Solution** joue la suite.
- Ton **niveau puzzles**, tes réussites et ta meilleure série sont gardés dans ce navigateur.
- **Mes erreurs** te fait rejouer les positions de tes propres parties où tu t'es trompé (il faut d'abord les analyser dans « Faiblesses »).

## Répertoire d'ouvertures (façon Chessbook)

L'onglet **Répertoire** gère tes ouvertures, avec les Blancs et avec les Noirs :

- **Mon répertoire** (vue par défaut, façon Chessbook) : tout ce qui est enregistré, en arbre repliable. Chaque réponse adverse a son bloc « Contre 2…Nc6 → 3.Bc4 » avec ta réponse et le nombre de coups prévus. Clique sur un coup et l'échiquier y va (flèche verte pour ton coup, bleues pour les réponses préparées). En dessous, tes lignes regroupées par ouverture, et en bas « Réviser » et « Modifier ici ».
- **Construire** : joue tes coups sur l'échiquier. Pour chaque position tu vois les coups des maîtres (base lichess, % et résultats), l'évaluation Stockfish (★ = meilleur coup) et ce que tu joues dans tes parties. Les transpositions sont reconnues.
- **Répertoire conseillé (Blancs)** : 1.e4 avec l'Italienne offensive (gambit Evans 4.b4 contre 3…Bc5, 4.Ng5 contre 3…Nf6), 3.Nxe5 contre la Petrov, la punition de 2…f6, 2.exd5 contre la Scandinave, l'Alapin (2.c3) contre la Sicilienne, et des réponses simples au reste.
- **Répertoire conseillé (Noirs)** : un répertoire Noirs tout prêt et vérifié par Stockfish, 1…e5 contre 1.e4 (Italienne, Espagnole, Écossaise, 2.d4 exd4, dame sortie tôt avec Qh5 ou Qf3) et 1…d5 contre le reste. Chacun est ajouté automatiquement si ton répertoire de cette couleur est vide (bouton « Annuler » pour le retirer), et reste disponible en un clic.
- **Packs de gambits (au choix)** : dans « 📘 Répertoires conseillés », « Ajouter » complète ton répertoire sans toucher à tes coups, « Remplacer mes coups » met les coups du pack à la place des tiens (bouton Annuler). Blancs : gambit Smith-Morra contre la Sicilienne et gambit Blackmar-Diemer contre 1…d5. Noirs : défense des deux cavaliers avec le gambit Polerio contre l'Italienne, et contre-gambit Albin contre 1.d4 d5 2.c4 (avec le piège de Lasker). Toutes les lignes sont vérifiées par Stockfish.
- **Créer depuis mes parties** : Clawd reprend tes coups habituels des 3 derniers mois, les fait vérifier par Stockfish et remplace ceux qui sont douteux (bouton « Annuler » si ça ne te plaît pas).
- **Réviser** : je joue les coups adverses, tu retrouves les tiens. Répétition espacée : un coup bien su revient dans 1, 3, 7, 16 jours…, un coup oublié revient tout de suite.
- **Exercices** : tes propres erreurs en séries (pires erreurs, par faiblesse, par phase). Une fois le bon coup trouvé, **« Continuer la partie »** te laisse jouer la suite contre Stockfish.
- **Mes parties** : où tu as quitté ta préparation (« tu as joué Nc3 au lieu de Bc4 »), les réponses adverses pas encore préparées, et les positions que tu rencontres souvent sans coup prévu.

## Chat privé avec Clawd

L'onglet **Chat** te permet de discuter avec Clawd de ton jeu. Il connaît ton rapport, cadence par cadence, et tu peux lui joindre une partie (« En parler avec Clawd » dans le bilan d'une partie). La conversation reste dans ce navigateur.

Clawd peut aussi **remplir ton répertoire d'ouvertures** : demande-lui par exemple « ajoute une défense solide contre 1.e4 » ou « construis-moi un répertoire Blancs simple pour le blitz ». Il regarde ton répertoire actuel et ton rapport, choisit des lignes adaptées, vérifie chaque coup et fait évaluer la position finale par Stockfish. Chaque modification apparaît dans le chat sous forme de carte avec **Voir** (ouvre la ligne dans le Répertoire) et **Annuler** / **Rétablir**. Il ne remplace jamais un coup déjà dans ton répertoire sans ton accord.

Il faut une clé API Claude ou Gemini (voir plus bas). Sans clé, le bouton **Copier pour claude.ai** copie ton rapport et ouvre claude.ai : il suffit de coller.

## Vitesse

L'analyse utilise plusieurs Stockfish en parallèle (un par cœur, réglable dans Réglages) et survole les coups théoriques : une partie de 40 coups prend environ 10 à 15 s en mode « Normale », 5 s en « Rapide ».

## Son des pièces

Le son joué à chaque coup est `assets/sounds/move.wav` (ton fichier `the-sound-of-a-move-in-a-game-with-one-piece-chess.mp3`, raccourci à 0,26 s pour qu'il claque sans délai). Pour en changer, remplace ce fichier par un autre `.wav` court.

## Coach IA (optionnel) : Claude ou Gemini

Dans **Réglages › Coach IA**, choisis **Claude** ou **Gemini** et colle ta clé API. Le bouton **Pourquoi ?** demande alors une vraie explication du coup (appuyée sur les données Stockfish), **Bilan détaillé** rédige un résumé de la partie, et le **Chat** fonctionne.

- **Gemini** (clé Google AI Studio, qui commence par `AIza…` ou `AQ.…`) : modèle par défaut Gemini 3.5 Flash. Si le modèle choisi est saturé (comme Gemini 3.8 Flash certains jours), l'appli bascule toute seule sur 3.5 Flash.
- **Claude** (clé Anthropic `sk-ant-…`) : Claude Opus 5.5 par défaut, Sonnet 5.5 et Haiku 5.5 au choix, moins chers.
- La clé est stockée dans ce navigateur (localStorage) et n'est envoyée qu'au fournisseur choisi. « Tester la clé » la vérifie sans rien consommer.

Sans clé, tout le reste fonctionne : les commentaires de Clawd sont générés localement.

## Réglages

- Profondeur d'analyse : Rapide (≈ 0,5 s/coup), Normale (≈ 1 s/coup), Profonde (≈ 3 s/coup).
- Thème d'échiquier (Claude, Kraft, Vert, Ardoise), flèche du meilleur coup, sons.
- Les analyses sont gardées en cache : rouvrir une partie est instantané.

## Confidentialité

Tout tourne dans ton navigateur. L'appli contacte uniquement :
`api.chess.com` (tes parties, API publique), `explorer.lichess.ovh` (statistiques des maîtres pour le répertoire, seule la position est envoyée), `lichess.org` (puzzles), Google Fonts (polices), et seulement si tu actives le coach IA : `generativelanguage.googleapis.com` (Gemini) ou `cdn.jsdelivr.net` + `api.anthropic.com` (Claude).

## Fichiers

```
index.html          la page
css/style.css       le style (look chess.com, palette Claude Code)
js/clawd.js         la mascotte en pixel art (SVG)
js/board.js         l'échiquier (animations, flèches, glisser-déposer)
js/engine.js        Stockfish dans un Web Worker
js/analysis.js      PGN, ouvertures, classification, précision
js/coach.js         les commentaires de Clawd
js/claude.js        le coach Claude (SDK officiel, optionnel) et le chat
js/gemini.js        le coach Gemini (API Google AI Studio, optionnel)
js/ai.js            choix du fournisseur d'IA (Claude ou Gemini)
js/repertoire.js    répertoire : arbre par positions, révision espacée, écarts
js/repertoire-ui.js répertoire : construire, réviser, exercices, partie libre
js/insights.js      « Mes faiblesses » : statistiques et détection des faiblesses
js/insights-ui.js   « Mes faiblesses » : analyse en lot, rapport, graphiques
js/chat.js          le chat privé avec Clawd
js/chat-tools.js    les outils du chat pour modifier le répertoire
js/puzzles.js       les puzzles (lichess) et ta progression
js/rep-presets.js   les répertoires tout prêts
js/chesscom.js      l'API publique chess.com
js/app.js           l'application
js/vendor/          chess.js, Stockfish, base d'ouvertures
assets/             pièces, son des coups, favicon
```

## Crédits

Stockfish 10 (GPLv3, stockfish.js de Niklas Fiekas) · chess.js (BSD-2) · pièces « cburnett » de Colin M.L. Burnett (CC BY-SA 3.0) · noms d'ouvertures lichess-org/chess-openings (CC0) · données : API publique chess.com.

Projet personnel, non affilié à chess.com ni à Anthropic. Clawd est la mascotte de Claude Code (Anthropic).
