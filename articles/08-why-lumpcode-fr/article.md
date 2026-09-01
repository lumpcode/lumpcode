# Les codemods ont gagné un cerveau. Nos outils, non.

## 1. Quelque chose a changé dans le travail ennuyeux

Pendant des années, les changements à grande échelle avaient deux formes.

Soit le changement était mécanique, et on écrivait un codemod : transform AST, regex, script. Déterministe, rapide, relisible. Aussi cassant, et limité à ce qu’on pouvait spécifier entièrement à l’avance.

Soit le changement demandait du jugement, et on le faisait à la main. Un ticket par fichier, une PR par module, des semaines d’édits.

Les agents de code ont refermé cet écart. Une étape de boucle peut maintenant être « réécris cet util comme le fait le codebase » au lieu de « matche ce motif et remplace ». Le travail flou est devenu automatisable : un rename qui a besoin de contexte, normaliser un util et ajouter des tests, une migration qui n’est pas une réécriture AST pure.

Une chose n’a pas changé : **git reste la façon dont un projet shippe et se souvient.**

**Git est la porte :** le code entre sur la branche principale par des PRs relisibles. L’unité de confiance, c’est un changement qu’un humain peut tenir dans sa tête.

**Git est la source de vérité :** ce qui a atterri, quand, et sur quelle branche, vit dans l’historique remote. Le remote git est le registre ; on n’a pas besoin d’un système à côté pour connaître l’état du projet.

Donc si les agents font le travail flou, les boucles autour d’eux devraient se brancher sur cette même porte et ce même registre.

**Porte git-first pour les boucles :** découper un gros chantier en contextes isolés, une branche et une PR chacun. Un agent qui réécrit 200 fichiers dans un commit a produit quelque chose que personne ne lira. Garder la campagne elle-même dans le repo, pour qu’un changement de boucle parte comme un diff normal et se relise comme n’importe quel autre changement.

**Source de vérité git-first pour les boucles :** quatre cents utils à nettoyer, ce n’est pas une session, c’est une campagne. Ça tourne des semaines, au rythme où l’équipe peut relire, et ça doit survivre à la fermeture du laptop. Merger trois PRs aujourd’hui, en laisser quatre pour demain : ce qui reste doit venir du remote git, pas d’une base ou d’un service à distance.

C’est la forme que j’ai commencée à appeler un **git-first loop manager**. J’en ai cherché un. Je n’en ai pas trouvé.

## 2. L’espace est encombré. La foule est ailleurs.

J’ai cherché. Quatre catégories, aucune sur cet axe.

**Les frameworks d’agents** (LangGraph, CrewAI, AutoGen) appellent des modèles ; ils ne pilotent pas les agents de code auxquels je fais déjà confiance, et ils ne savent pas ce qu’est une branche ou une PR.

**Les orchestrateurs de worktrees** (Conductor, ParallelCode, git-parsec, Stoneforge) gèrent bien l’isolation, mais ils parallélisent des tâches que tu lances maintenant depuis une GUI. La liste de tâches n’est pas un artefact commité, donc il n’y a rien à versionner ni à relancer le mois prochain.

**Les plateformes entreprise de changement à grande échelle** (Sourcegraph Agentic Batch Changes, Moderne, Codemod.com) sont les plus proches par l’intention, et vraiment bonnes. Elles sont aussi lourdes à mettre en place, pas open source là où ça compte, et la campagne vit dans leur système, pas dans ton repo.

**Les agents cloud des vendors** (Copilot, Codex cloud, Cursor cloud agents) donnent déjà une tâche, une branche, une PR. Ce qui manque, c’est la boucle au-dessus : savoir ce qu’il reste, prendre la prochaine tranche, passer tes gates, continuer un mois pendant que tu merges.

## 3. Donc je construis Lumpcode, un git-first loop manager

Lumpcode est un petit CLI pour un job : faire tourner de longues campagnes d’agents sur ton propre repo, en tranches relisibles.

L’unité, c’est un **lump** : un chantier trop gros pour un chat, décrit une fois, puis avancé sur des jours ou des semaines. Tu peux lancer un tick à la main, ou laisser un daemon prendre la prochaine tranche éligible sur un cron pendant que tu relis les PRs d’hier.

- **Git-first.** Un repo avec git, et un agent de code sur le PATH : c’est toute la liste de dépendances. Les boucles et la progression vivent dans le repo.
- **Pas d’état externe.** La progression se déduit des messages de commit sur les branches remote. Le repo est la base.
- **Isolation des contextes par construction.** Un contexte, une branche, une PR. Merger ce qui est bon ; le tick suivant continue avec le reste.
- **Reprise par défaut.** Tu t’arrêtes une semaine, tu reviens, tu relances. Ça redéduit ce qu’il reste depuis le remote.
- **Steps mixtes.** Prompts et commandes shell côte à côte, avec des boucles de retry et de la validation custom.
- **Agnostique vis-à-vis de l’agent.** Cursor, Copilot CLI, Claude Code, Codex, ce que l’équipe utilise déjà.
- **Simple à démarrer, configurable quand il le faut.** Un `npm install`, pas de serveur, pas d’indexation. JSON pour le cas simple, TypeScript quand tu veux de la vraie logique. Apache 2.0.

Git-first, c’est aussi pratique au quotidien. Tu changes un prompt ou une étape de validation, tu push : le tick suivant tourne la nouvelle version. Tu ajoutes un lump, tu push : le daemon le trouve. Le worker se reset sur la branche de base à chaque tick, donc ce qui est sur cette branche *est* la configuration. Un changement de boucle arrive comme un diff, et se relit comme n’importe quel diff.

## 4. Trois campagnes que j’ai fait tourner

Les deux premières sont dans ce repo sous `.lumpcode/lumps/` — dont la campagne CLI terminée et les deux lumps d’abstractions. Ouvre les configs si tu veux voir le câblage. Les lumps d’abstractions et le nettoyage de monorepo tournent en live chez Keolis.

**Construire Lumpcode avec Lumpcode.** Au début, chaque commande CLI était un item de backlog, avec priorité et dépendances. Le lump ouvrait une PR par commande. La plus grande partie de la surface CLI a été faite comme ça. J’ai relu chacune, j’ai poussé un peu sur certaines PRs, et la campagne est close.

**Chasser ma propre duplication.** Deux lumps en pipeline. Le premier trouve un motif dupliqué et écrit un petit dossier de requirements dans le backlog du second. Le second implémente l’util, refactor les call sites, et valide avec build et tests. Ça ne finit jamais, par design : douze utils sont passés par là pour l’instant, une PR à la fois.

**Nettoyer le monorepo chez Keolis.** Des centaines d’utils, mal structurés, peu testés. Un util = un contexte. L’agent normalise la structure et écrit des tests ; une étape déterministe lance typecheck, lint, et les tests de cet util, puis retry jusqu’à quatre fois en cas d’échec. Les PRs restent petites. La campagne tourne en live, plafonnée à trois branches ouvertes pour ne pas noyer la review, et personne n’a eu à changer sa façon de relire du code.

## 5. Où ça en est

Early development, Apache 2.0, sur npm en `@lumpcode/cli`. Les lumps d’abstractions et le nettoyage de monorepo tournent en live chez Keolis. Les agents ne remplacent pas la review : ils l’alimentent. Tu décris la campagne une fois ; tu passes un peu de temps chaque jour à merger.

Le nom : je cherchais quelque chose pour le CLI, et je me suis souvenu d’un voyage au bord d’un lac où de petits poissons venaient nettoyer les pieds des gens qui les mettaient dans l’eau. En cherchant les poissons nettoyeurs, j’ai trouvé le **lumpfish** — utilisé pour nettoyer les fermes de saumon et les aquariums. D’où Lumpcode. Et puis le lumpfish est mignon.

Repo : [https://github.com/lumpcode/lumpcode](https://github.com/lumpcode/lumpcode)
