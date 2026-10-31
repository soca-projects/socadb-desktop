# Journal des modifications

Version française des notes de `CHANGELOG.md`, sans les sections réservées
aux développeurs. L'app l'affiche aux utilisateurs dont l'interface est en
français.

## [0.1.5] - 2026-10-20

Les schémas portent maintenant ce dont une vraie base de données a besoin :
notes sur les tables et les colonnes, enums, index et paramètres de type
comme la longueur et la précision. Ils s'affichent sur le canevas, passent
dans le SQL exporté, reviennent des dumps SQL, et les agents savent les lire
et les écrire. L'import accepte les fichiers DBML et plusieurs fichiers à la
fois, choisis depuis l'accueil ou déposés dessus. L'app prend le look papier
du site, et sur macOS elle est désormais signée avec un Developer ID et
notarisée : elle s'ouvre sans avertissement de sécurité.

### Ajouts

- **Notes, enums, index et paramètres de type**. Les tables et les colonnes
  acceptent des notes, les colonnes des enums, une longueur, une précision
  et une échelle, les colonnes numériques MySQL l'option UNSIGNED, et les
  tables des index. Les anciens fichiers s'ouvrent sans changement. (#94)
- **Éditeur de colonne**. Les colonnes s'affichent une par ligne, et un
  éditeur règle le type, les valeurs d'enum, la longueur, la valeur par
  défaut et la note. Une valeur par défaut est soit une valeur, soit une
  expression. (#96)
- **Note de table et onglet Index** dans le panneau latéral, avec le nommage
  des index, un conseil pour les clés étrangères sans index, et les colonnes
  qu'un index ne peut pas utiliser grisées. (#97)
- **Sur le canevas**, les tables montrent leurs notes, les valeurs de leurs
  enums et leurs index. (#100)
- **L'export SQL** écrit les enums, les index, les notes et les paramètres
  de type. (#101)
- **L'import SQL** garde les enums, les index, les notes et les clés que
  pg_dump déclare à part, et liste ce qu'il n'a pas pu garder. (#102)
- **Les agents** lisent et écrivent les notes, les enums, les index et les
  paramètres de type. (#103)
- **Import DBML**. (#104)
- **Plusieurs fichiers à la fois**. L'accueil importe plusieurs fichiers
  SQL, DBML ou JSON d'un coup, un fichier de schéma pour chacun, sans écraser
  les fichiers existants, et montre le résultat de chaque fichier. Les
  fichiers peuvent aussi être déposés sur l'accueil. (#106, #107)

### Changements

- **Le look papier**. Papier et objets chaleureux, un sticker sur les
  actions par lesquelles on commence, et un trait de surligneur sur la table
  ouverte, en clair et en sombre. Le bouton Nouveau schéma de l'accueil porte
  un sticker plus léger. (#109, #115)
- **Des états vides dessinés** sur l'accueil, le canevas et le panneau
  latéral. (#111)
- **Les menus de l'app** remplacent les listes déroulantes du système pour
  l'ordre de tri, le modèle du chat et le mode de connexion des agents.
  (#112)
- **La base de données d'un fichier importé** est reconnue à partir de plus
  de types SQL, et celle d'un fichier DBML à partir de ses types. (#105)
- **Signée avec un Developer ID et notarisée** (macOS). L'app et son image
  disque passent Gatekeeper, et macOS n'avertit plus au premier lancement.
  Les utilisateurs d'une clé API se voient demander une dernière fois
  l'accès au trousseau après cette mise à jour. (#114)

### Corrections

- **Les schémas ouverts depuis l'accueil ou restaurés au démarrage**
  s'enregistrent de nouveau. (#95)
- **Appuyer sur Suppr avec une table sélectionnée** ne supprime plus ses
  relations. (#113)
- **Une clé primaire composée déclarée colonne par colonne** est lue
  correctement. (#108)

## [0.1.4] - 2026-10-12

SocaDB s'ouvre maintenant sur un accueil qui liste tous les schémas sur
lesquels vous avez travaillé, garde chaque conversation du chat pour que vous
puissiez y revenir, et écrit un journal local pour que les problèmes soient
diagnostiqués plutôt que devinés. Les clés API passent dans le trousseau du
système, les agents perdent l'accès à vos fichiers et au terminal, et sur
macOS SocaDB propose de s'installer dans Applications quand il tourne depuis
l'image disque.

### Ajouts

- **Accueil**. La liste des schémas que vous avez ouverts, créés ou
  enregistrés, chacun avec une miniature, avec une recherche, un tri, et des
  actions pour renommer, dupliquer, afficher dans le Finder ou supprimer un
  brouillon. Paramètres › Général choisit si SocaDB s'ouvre sur l'accueil ou
  sur le dernier schéma. (#87)
- **Historique des conversations**. Chaque conversation est gardée dans son
  propre fichier. Parcourez-les, cherchez-les, renommez-les ou supprimez-les
  depuis le chat, ou supprimez-les toutes depuis Paramètres › Conversations.
  Une conversation garde le fournisseur et le modèle avec lesquels elle a
  commencé. (#81)
- **Réglages des intégrations**. Choisissez les apps d'IA auprès desquelles
  SocaDB s'enregistre comme serveur MCP : Claude Code, Claude Desktop et,
  nouveau, Codex. (#85)
- **Installation dans Applications** (macOS). Quand SocaDB tourne depuis
  l'image disque ou depuis un endroit où il ne peut pas se mettre à jour, il
  propose de s'installer dans Applications en un clic. (#84)
- **Journal local**. Les échecs sont écrits dans un fichier journal du
  dossier des journaux du système, ouvert depuis Aide › Afficher les
  journaux. Il ne contient jamais le contenu des schémas, le texte du chat ni
  les clés API, et rien ne quitte votre ordinateur. (#88)
- **Claude 5 et GPT-6** dans le choix du modèle. (#77)

### Changements

- **Les clés API sont gardées dans le trousseau du système** au lieu du
  fichier de réglages. Le chat demande une clé avant d'envoyer quand aucune
  n'est enregistrée. (#76)
- **Les problèmes de connexion sont expliqués dès le premier message**, avec
  l'étape qui les corrige. (#76)
- **Les choix du modèle et de l'effort se trouvent sous la zone de
  message.** (#81)
- **Les agents ne passent plus que par SocaDB.** Aucun ne peut lire vos
  fichiers ni lancer de commandes dans le terminal, et l'agent Claude ne
  reprend plus votre propre configuration de Claude Code. (#77, #83)
- **Fenêtres étroites et réglages plus larges.** L'app s'adapte aux petites
  fenêtres, et les conversations ont leur propre onglet de réglages. (#86)

### Corrections

- **Les réglages et les schémas récents ne sont plus perdus** quand
  `config.json` ou `recent.json` ne peut pas être lu ou ne se lit pas
  correctement. Le fichier est mis de côté pour que son contenu reste
  récupérable, et SocaDB ne se réinscrit jamais dans une app d'IA où vous
  l'aviez désactivé. (#88)
- **La liste des schémas récents s'enregistre de nouveau.** Un droit de
  fichier l'empêchait d'être écrite. (#87)
- **Codex** se remet des reconnexions, des fils perdus et des erreurs d'API.
  (#82)
- **Arrêter une réponse** n'affiche plus d'erreur. (#82)
- **Claude Code et Claude Desktop** gardent l'entrée de SocaDB à jour. (#78)
- **Les pages web ne peuvent plus se connecter à SocaDB.** Le pont local
  qu'utilisent les apps d'IA les refuse. (#79)
- **Le mode sombre** et les notifications suivent le thème choisi dans l'app
  plutôt que celui du système. (#86)
- **La fenêtre** peut être déplacée depuis la barre d'outils et fermée
  depuis le menu. (#87)

## [0.1.3] - 2026-09-25

Les mises à jour n'interrompent plus votre travail. SocaDB télécharge les
nouvelles versions en arrière-plan et vous demande quand elles sont prêtes :
redémarrer et installer tout de suite, ou installer à la prochaine fermeture.
Sur macOS, les mises à jour s'installent désormais depuis un programme à
part : quitter en pleine installation ne peut plus laisser une app cassée.
Cette version rétablit aussi Codex sur macOS, ajoute un choix de l'effort de
raisonnement au chat et corrige les raccourcis clavier sous Windows.

### Ajouts

- **Mises à jour en arrière-plan avec une proposition d'installation**. Les
  mises à jour se téléchargent pendant que vous travaillez. Quand la nouvelle
  version est prête, SocaDB propose de redémarrer et d'installer tout de
  suite, ou d'installer à la prochaine fermeture. (#58, #70)
- **Entrée de menu Rechercher les mises à jour**. Dans le menu SocaDB sur
  macOS, et dans un nouveau menu Aide sous Windows et Linux. Elle suit le
  téléchargement de la mise à jour, devient « Redémarrer et installer » quand
  la mise à jour est prête, et vous dit quand SocaDB est déjà à jour. (#70)
- **Choix de l'effort de raisonnement**. De Faible à Max, à côté du choix
  du modèle. Le choix est retenu pour chaque fournisseur, et seuls les niveaux
  que le modèle choisi accepte sont proposés. (#60)

### Changements

- **Des mises à jour plus sûres sur macOS**. La mise à jour s'installe
  depuis un programme à part : l'app peut se fermer à tout moment, et
  l'installation va quand même jusqu'au bout. (#66, #70)

### Corrections

- **Codex sur macOS, de nouveau**. Apple a révoqué le certificat qui signait
  le CLI Codex inclus dans la 0.1.2, et macOS le bloquait au lancement. Codex
  fonctionne de nouveau, et un certificat révoqué par un éditeur ne peut plus
  empêcher SocaDB de s'ouvrir. Les commandes de connexion et de déconnexion
  de Codex affichées dans les réglages sont corrigées. (#69, #66)
- **Raccourcis clavier sous Windows**. Les raccourcis des menus comme
  `Ctrl+S`, `Ctrl+O` et `Ctrl+Z` fonctionnent de nouveau. (#64)
- **Commande d'installation de Claude Code sous Windows**. Les réglages
  montrent la commande PowerShell au lieu d'une commande bash que Windows ne
  peut pas lancer. (#65)

## [0.1.2] - 2026-05-15

Windows fonctionne enfin. La 0.1.1 publiait des versions Windows, mais
plusieurs bugs rendaient l'app inutilisable en pratique : une fenêtre de
console clignotait sans arrêt, les raccourcis des menus ne répondaient pas,
et la barre de titre affichait un chemin de fichier cassé. Cette version
corrige tout ça, apporte une nouvelle icône et un nouvel installeur, met la
liste des modèles d'IA à jour, et rétablit Codex sur macOS.

### Corrections

- **Windows fonctionne**. Plus de fenêtre de console qui clignote, les
  raccourcis des menus (`Ctrl+S`, `Ctrl+O`, annuler / rétablir…) répondent,
  et la barre d'outils affiche le nom du fichier au lieu de son chemin
  complet.
- **Les réglages survivent à un redémarrage sur tous les systèmes**. Le
  thème, la langue, les clés API et les conversations du chat étaient perdus
  après un redémarrage sur certaines configurations.
- **Codex fonctionne de nouveau sur macOS**. macOS s'était mis à bloquer le
  CLI Codex après qu'OpenAI a changé les certificats qui le signent.

### Changements

- **Modèles d'IA mis à jour**. Le choix du modèle propose maintenant trois
  modèles de la génération actuelle par fournisseur : Claude Opus 4.7, Sonnet
  4.6 et Haiku 4.5 chez Anthropic ; GPT 5.5, GPT 5.4 et GPT 5.4 Mini chez
  OpenAI. Les anciens noms Claude 3 et GPT 4 disparaissent.
- **Nouvelle icône**. Le nouveau logo de SocaDB remplace les icônes
  provisoires, y compris sur l'installeur Windows et le raccourci du menu
  Démarrer.

## [0.1.1] - 2026-05-04

La première version qui fonctionne vraiment sur toutes les plateformes
annoncées. La 0.1.0 ne tournait que sur les Mac Apple Silicon : les
téléchargements Linux, Windows et Mac Intel étaient inutilisables. Cette
version fait fonctionner tous les téléchargements et rétablit les mises à
jour automatiques, cassées sans bruit dans la 0.1.0.

### Corrections

- **Des installeurs pour toutes les plateformes**. Les téléchargements
  Linux, Windows et Mac Intel fonctionnent maintenant.
- **Mises à jour automatiques**. La 0.1.0 ne trouvait aucune mise à jour.
  Depuis la 0.1.1, chaque installation reçoit les nouvelles versions
  automatiquement.

### Changements

- **Sous Linux**, les téléchargements sont un `.deb` (Ubuntu, Debian, Mint,
  Pop!_OS) et un `.AppImage` pour toutes les autres distributions, Fedora et
  openSUSE comprises. Le `.rpm` disparaît.
- **Sous Windows**, le téléchargement est un seul installeur `.exe`. Le
  `.msi` disparaît.

## [0.1.0] - 2026-04-29

La première version publique. SocaDB est une app native de conception de
schémas de bases de données, qui associe un canevas visuel à l'outil d'IA en
ligne de commande que vous avez déjà installé : discutez avec Claude Code,
regardez-le modifier le canevas en direct, et exportez en SQL quand vous avez
fini.

En pratique, cette version ne tournait que sur les Mac Apple Silicon. Les
versions Linux, Windows et Mac Intel étaient publiées mais ne fonctionnaient
pas, et la 0.1.1 les a remplacées.

### Ajouts

- **Canevas visuel des schémas**. Des tables aux colonnes modifiables sur
  place, des relations créées en glissant, avec les actions `ON DELETE` /
  `ON UPDATE`, et une mise en page automatique en un clic.
- **Chat d'IA dans l'app**. Un panneau de chat redimensionnable (en bas à
  droite) parle au Claude Code que vous avez installé, et ses modifications
  s'affichent sur le canevas pendant que l'agent modifie le schéma.
- **Serveur MCP inclus**. Enregistré auprès de Claude Code et de Claude
  Desktop au premier lancement, pour que votre CLI connaisse le schéma ouvert
  sans aucune configuration. Des outils de lecture (`get_schema`,
  `get_table`, `get_editor_state`) et d'écriture (`create_table`,
  `update_column`, `create_relation`, `auto_layout`, et d'autres).
- **Modes de connexion**. Connectez-vous avec votre abonnement Claude Code
  (le CLI gère la connexion, votre jeton n'entre jamais dans l'app) ou avec
  une clé API Anthropic gardée dans le trousseau du système. Un seul mode
  actif à la fois.
- **Import et export**. Lisez du SQL DDL MySQL ou PostgreSQL pour en faire
  un schéma utilisable (clés étrangères comprises), et exportez de nouveau en
  SQL DDL, JSON, PNG ou SVG.
- **Format de fichier `.soca`**. Enregistrez et ouvrez des schémas au format
  JSON avec les fenêtres natives (`Cmd+S` / `Cmd+O` / `Cmd+N` /
  `Cmd+Shift+S`). Le schéma en cours est gardé d'un lancement à l'autre.
- **Une app native soignée**. Un menu natif (Fichier / Édition /
  Présentation / Fenêtre) avec ses raccourcis, annuler / rétablir sur 50
  étapes, thème clair ou sombre, et interface en anglais ou en français.
