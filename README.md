# R113-serveur-web-apache-local

TP interactif (BUT MMI1 — R1.13 Hébergement) : **TP4 Serveur Web Apache**.
Installer, configurer et sécuriser un serveur HTTP dans un environnement
Linux distant (bac à sable Ubuntu de Killercoda) : installation du service
(`apt`, `systemctl`), accès au site par le port 80, droits sur le dossier web
(`adduser`, `su`, `chown`), alias vers un dossier personnel (`a2enconf`,
`chmod o+x`), journaux (`tail -f`), authentification Basic (`.htaccess`,
`htpasswd`), page d'erreur 404 personnalisée (`ErrorDocument`) et observation
des échanges dans l'onglet Réseau du navigateur.

Compétence ciblée : **AC14.01** - Exploiter de manière autonome un
environnement de développement efficace et productif.

Même structure, mêmes styles et mêmes fonctionnalités que le TP1
[R113-ligne_de_commande](https://github.com/nico3807/R113-ligne_de_commande).

## Utiliser ce TP en tant qu'étudiant·e

1. Ouvrir `index.html` dans un navigateur (double-clic suffit : aucune page
   ne charge de données via `fetch()`, pas besoin de serveur local).
2. Suivre l'ordre du menu : Prise en main → Installation → Configuration →
   Sécurisation → Livrable. Le Mémo reprend les commandes, les fichiers et
   les codes de statut du TP.
3. S'entraîner sur le serveur simulé, puis refaire les manipulations dans
   Killercoda pour les captures d'écran du livrable.

Les réponses, la progression et l'état du serveur simulé sont enregistrés
dans le navigateur (`localStorage`) : rien n'est envoyé.

## Utiliser ce dépôt en tant qu'enseignant·e

Activer GitHub Pages sur la branche `main` (dossier racine) pour obtenir un
lien cliquable à distribuer.

## Éléments interactifs

- **Serveur Ubuntu simulé**, partagé par toutes les pages (comme un onglet
  Killercoda resté ouvert) : système de fichiers avec propriétaires et
  droits, comptes (`root`, `etudiant`, `www-data`), paquets APT et un petit
  Apache qui relit ses fichiers `.conf` à chaque `reload` ou `restart`
  (`Alias`, `<Directory>`, `Require`, `AllowOverride`, `ErrorDocument`,
  `.htaccess` et authentification Basic, droits de `www-data` → 403,
  journaux `access.log` et `error.log`). Bouton « Réinitialiser » pour
  repartir d'une machine neuve.
- **Terminal Bash simulé** : commandes du TP (`apt`, `systemctl`,
  `apache2ctl configtest`, `a2enconf`, `adduser`, `su`, `sudo`, `chown`,
  `chmod`, `htpasswd`, `curl`, `tail -f`...), éditeur `nano` (Ctrl+O,
  Ctrl+X), invites interactives (mots de passe, `[Y/n]`), redirections
  (`>`, `>>`), tubes (`|`), historique (↑ ↓), complétion (Tab). Messages
  d'erreur d'Ubuntu suivis d'une aide en français. Chaque action du sujet se
  coche automatiquement quand elle est réussie.
- **Navigateur simulé** : menu Traffic / Ports (adresse publique de type
  Killercoda), redirections, fenêtre de connexion pour l'authentification
  Basic, et **outils de développement** (onglet Réseau : codes de statut,
  en-têtes de requête et de réponse).
- **Sortie de `systemctl status`**, **ligne `ls -ld`**, **ligne du journal
  d'accès** et **`.htaccess`** décodés (un clic = une explication),
  **calculateur de permissions**, outil **« adresse → fichier sur le
  disque »** (DocumentRoot ou Alias), mini-jeux **ports / services** et
  **codes de statut HTTP**, cartes de vocabulaire.
- **Livrable** : prénom et nom (verrouillés après le premier PDF), dépôt des
  deux captures d'écran (JPG uniquement, vérifié à la lecture du fichier),
  rédaction de Q1 à Q10 (ni sélection, ni copie, ni collage, sauf pour la
  ligne de journal de Q7), barème, puis **compte rendu PDF** à déposer sur
  Moodle, avec la même mise en page que le certificat des exercices de
  `bases_de_js` (logos, identité, statistiques, avancement, réponses,
  captures). Le PDF est verrouillé (impression seule) et porte la mention
  « INCOMPLET » s'il manque une réponse ou une capture.
- **Mémo** : fiche récapitulative filtrable, boutons « copier », quiz
  « quelle commande ? ».

## Structure

```
R113-serveur-web-apache-local/
├── index.html          Accueil : objectif, compétence, déroulé
├── prerequis.html      1. Prise en main : Killercoda, whoami, os-release
├── installation.html   2-3. Installation d'Apache et accès au site (Q1 à Q3)
├── configuration.html  4-6. Droits, alias et journaux (Q4 à Q7)
├── securisation.html   7-8. Authentification, page 404, onglet Réseau (Q8 à Q10)
├── livrable.html       9. Livrable : identité, captures JPG, réponses, PDF
├── memo.html           Fiche récapitulative des commandes
├── css/style.css       Feuille de style partagée (thème clair / sombre)
├── img/                Logos IUT et MMI, logos Windows / macOS
└── js/
    ├── main.js            Navigation, choix du système, étapes, stockage, mini-jeux
    ├── serveur.js         Machine Ubuntu simulée : fichiers, comptes, Apache, missions
    ├── terminal.js        Terminal Bash simulé et éditeur nano
    ├── navigateur.js      Navigateur simulé, onglet Réseau, onglets du poste
    ├── prerequis.js       Missions de la prise en main
    ├── installation.js    Missions des parties 2 et 3
    ├── configuration.js   Missions des parties 4 à 6, calculateur, adresse → fichier
    ├── securisation.js    Missions des parties 7 et 8
    ├── livrable.js        Identité, captures, réponses Q1 à Q10
    ├── compte-rendu.js    Génération du compte rendu PDF (jsPDF)
    ├── certificat-logos.js  Logos du PDF en base64 (comme bases_de_js)
    ├── memo.js            Filtre, copie, quiz
    └── vendor/            jsPDF (licence MIT, jspdf.LICENSE.txt)
```

## Licence

Support pédagogique libre de réutilisation et d'adaptation dans un cadre
d'enseignement.
