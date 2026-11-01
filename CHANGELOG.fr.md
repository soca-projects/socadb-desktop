# Journal des modifications

Version française des notes de `CHANGELOG.md`, sans les sections réservées
aux développeurs. L'app l'affiche aux utilisateurs dont l'interface est en
français.

## [0.1.6] - 2026-11-01

SocaDB se comporte maintenant comme une app de bureau : elle retient sa
fenêtre, ouvre les fichiers `.soca` d'un double-clic et propose de nouveaux
Paramètres pour l'apparence, la clé primaire des nouvelles tables et les
mises à jour. Les apps d'IA joignent SocaDB dès qu'elle s'ouvre, et peuvent
ouvrir ou créer des schémas depuis son accueil. Les agents de l'AppImage
marchent enfin, les mises à jour Windows ne s'arrêtent plus quand une app
d'IA est ouverte, et l'annulation ne peut plus faire entrer un autre schéma
dans le fichier ouvert.

### Ajouts

- **Double-cliquer sur un fichier `.soca`** l'ouvre, depuis le Finder,
  l'Explorateur ou un gestionnaire de fichiers. Plusieurs fichiers à la
  fois rejoignent l'accueil, et sur macOS les fichiers portent l'icône de
  SocaDB. Sous Linux, il faut le .deb. (#152)
- **Apparence**. Les Paramètres proposent Système, Clair ou Sombre, et
  Système suit l'OS quand il change. Le menu Présentation garde Changer le
  thème. (#150)
- **La fenêtre retient sa taille et sa position**. Sur macOS, elle ne se
  rouvre jamais en plein écran. (#150)
- **Clé primaire des nouvelles tables**. Paramètres › Général la règle par
  base : UUID, entier ou grand entier. Les agents la suivent aussi. (#153)
- **Réglages des mises à jour**. Paramètres › Mises à jour propose
  Rechercher automatiquement et Installer automatiquement, activés par
  défaut, la version installée et un bouton Rechercher maintenant. Sans
  installation automatique, SocaDB demande d'abord et ne télécharge rien
  avant un clic. (#154)
- **Nouveautés**. À partir de la prochaine mise à jour, un toast propose
  les notes de la nouvelle version dans la langue de l'app. Paramètres ›
  Mises à jour › Notes de version ouvre tout l'historique, et le lien du
  toast de mise à jour ouvre les notes de la version qui arrive. (#155,
  #156)
- **Licences tierces**. Aide › Licences tierces liste le code embarqué par
  SocaDB et ses licences. (#158, #159)
- **À propos et menu Fenêtre**. À propos de SocaDB ouvre le panneau
  standard sur macOS et une fenêtre sous Windows et Linux. Le menu Fenêtre
  de macOS propose Placer dans le Dock, Réduire/agrandir et Tout ramener au
  premier plan, et ⌘, (Ctrl+, sous Windows et Linux) ouvre les Paramètres.
  (#150)
- **Les apps d'IA peuvent ouvrir et créer des schémas**. Depuis l'accueil,
  Claude Code, Claude Desktop et Codex peuvent lister vos schémas, en
  ouvrir un par son nom ou en créer un nouveau. Elles ne lisent et ne
  modifient plus le schéma caché derrière l'accueil. (#144)

### Changements

- **Les Paramètres** sont refaits, avec une ligne par réglage dans une
  fenêtre qui garde sa taille d'une section à l'autre. (#151)
- **Les nouvelles tables** se posent sur la place libre la plus proche du
  centre de la vue, jamais sous le chat, au lieu de s'empiler en diagonale.
  (#141)
- **Les grands schémas** sont bien plus rapides à modifier : un changement
  ne redessine plus toutes les tables ni le panneau latéral. (#139)
- **Une app plus légère**. Elle prend environ 130 Mo de moins sur macOS,
  autour de 600 Mo une fois installée, et moins aussi sous Windows et
  Linux. (#129, #130)
- **Les mises à jour** se passent de la même façon sur macOS, Windows et
  Linux, et SocaDB vérifie au lancement puis toutes les quatre heures. Sous
  Windows, l'installateur est silencieux. Sous Linux, les installations
  .deb proposent seulement Redémarrer et installer, car elles demandent un
  mot de passe administrateur. (#154)
- **Une interface plus native**. Elle ne se sélectionne plus comme du
  texte, n'affiche plus de main sur les boutons et ne laisse plus glisser
  les images et les liens, et le menu de page avec Recharger a disparu. Les
  champs, les toasts et les messages du chat restent sélectionnables.
  (#150)
- **Les textes du système suivent la langue du système** sur macOS : menus
  de WebKit, sélecteurs de fichiers et entrées standard des menus. (#150)
- **Un cadre de sélection** (Maj + glisser) déplace la vue quand il
  approche du bord du canevas. (#135)

### Corrections

- **Annuler après avoir ouvert un autre schéma** pouvait afficher son
  contenu sous le fichier ouvert, et enregistrer l'y écrivait. Ouvrir,
  créer ou importer un schéma vide maintenant l'historique d'annulation.
  (#149)
- **⌘Z dans un champ de texte** annule la frappe, pas le schéma. (#150)
- **Suppr ou Retour arrière** n'effacent plus la relation sélectionnée
  derrière une fenêtre ouverte. (#150)
- **Déplacer des tables**. Glisser plusieurs tables les enregistre toutes,
  et les déplacements aux flèches sont enregistrés, chaque rafale comptant
  pour une étape d'annulation. (#136)
- **La première table d'un schéma vide** ne zoome plus la vue à 200 %.
  (#136)
- **Les apps d'IA joignent SocaDB dès qu'elle s'ouvre**. Une app lancée
  pendant que SocaDB était fermée affichait Connection closed et ne
  réessayait jamais. (#144)
- **Claude Desktop** garde SocaDB quand elle est ajoutée pendant que Claude
  est ouvert, et SocaDB trouve la config de sa version Microsoft Store.
  (#145)
- **Une app d'IA bloquée** ne gêne plus les autres ni le chat. (#134)
- **L'AppImage**. Ses agents marchent, et les apps d'IA gardent un chemin
  de serveur qui survit à la fermeture de SocaDB. (#146)
- **Les mises à jour Windows** ne s'arrêtent plus sur un fichier utilisé
  quand une app d'IA ou un agent resté ouvert tourne, et la désinstallation
  ne laisse plus de dossier. (#147)
- **Une connexion Claude expirée** affiche l'étape de connexion au lieu
  d'une erreur générique. (#128)
- **Un plantage sur macOS** en glissant une pièce jointe de Mail ou une
  image de Photos au-dessus de la fenêtre. (#131)

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
