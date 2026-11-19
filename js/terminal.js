// Terminal Bash simulé, branché sur le serveur Ubuntu simulé (js/serveur.js) :
// commandes du TP (apt, systemctl, adduser, su, chown, chmod, nano, a2enconf,
// htpasswd, tail -f, curl...), redirections (> et >>), tubes (|) et
// enchaînements (; && ||). Les messages d'erreur reprennent ceux d'Ubuntu (en
// anglais, comme dans Killercoda), suivis d'une aide en français.
//
// Utilisation : Terminal.creer(element, { exigeApache }) ; les missions de la
// page sont déclarées avec Serveur.definirMissions().

var Terminal = (function () {
  var esc = TP.echapper;
  var S = Serveur;
  var MOIS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var ATTENTE = {};

  var MESSAGES = {
    EACCES: 'Permission denied', ENOENT: 'No such file or directory', ENOTDIR: 'Not a directory',
    EISDIR: 'Is a directory', EEXIST: 'File exists', ELOOP: 'Too many levels of symbolic links'
  };
  function msg(code) {
    return MESSAGES[code] || code;
  }

  // Commandes fournies par un paquet qui n'est pas forcément installé.
  var PAQUET = {
    tree: 'tree', apachectl: 'apache2', apache2ctl: 'apache2', apache2: 'apache2', a2enconf: 'apache2', a2disconf: 'apache2',
    a2ensite: 'apache2', a2dissite: 'apache2', a2enmod: 'apache2', a2dismod: 'apache2', htpasswd: 'apache2-utils'
  };
  // Réflexes venus de Windows (invite CMD) : on oriente vers l'équivalent.
  var EQUIV = { dir: 'ls', cls: 'clear', md: 'mkdir', ren: 'mv', rename: 'mv', move: 'mv', del: 'rm', erase: 'rm', type: 'cat', copy: 'cp', 'cd..': 'cd ..', ipconfig: 'hostname -I', notepad: 'nano' };
  // Options qui attendent une valeur (tail -n 20, curl -u login:mdp...).
  var AVEC_VALEUR = { tail: 'n', head: 'n', curl: 'uHXo', grep: 'e', useradd: 'sdgG', journalctl: 'un' };

  function creer(el, options) {
    options = options || {};

    // ---------- Interface ----------

    el.classList.add('terminal');
    el.innerHTML =
      '<div class="terminal-barre"><span class="pastille"></span><span class="pastille"></span><span class="pastille"></span>' +
      '<span class="titre"></span><button type="button" data-t="ctrlc" hidden title="Interrompre la commande en cours">Ctrl+C</button>' +
      '<button type="button" data-t="reset" title="Repartir d\'un serveur neuf">Réinitialiser</button></div>' +
      '<div class="terminal-ecran" role="log" aria-live="polite"><div class="sortie"></div>' +
      '<label class="terminal-saisie"><span class="prompt"></span>' +
      '<input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Commande à exécuter" /></label></div>' +
      '<div class="nano" hidden>' +
      '<div class="nano-titre"><span>GNU nano 7.2</span><span class="nano-fichier"></span><span class="nano-modif"></span></div>' +
      '<textarea class="nano-texte" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Contenu du fichier"></textarea>' +
      '<div class="nano-statut" aria-live="polite"></div>' +
      '<label class="nano-question" hidden><span></span><input type="text" autocomplete="off" spellcheck="false" /></label>' +
      '<div class="nano-raccourcis">' +
      '<button type="button" data-nano="ecrire"><kbd>^O</kbd> Write Out</button>' +
      '<button type="button" data-nano="quitter"><kbd>^X</kbd> Exit</button>' +
      '<button type="button" data-nano="couper"><kbd>^K</kbd> Cut</button>' +
      '<button type="button" data-nano="coller"><kbd>^U</kbd> Paste</button></div></div>' +
      '<div class="terminal-aide">Tape une commande puis <kbd>Entrée</kbd> · <kbd>↑</kbd> <kbd>↓</kbd> historique · <kbd>Tab</kbd> complète un nom · <code>help</code> liste les commandes</div>';
    var ecran = el.querySelector('.terminal-ecran');
    var sortie = el.querySelector('.sortie');
    var input = el.querySelector('.terminal-saisie input');
    var promptEl = el.querySelector('.prompt');
    var titre = el.querySelector('.titre');
    var aideBas = el.querySelector('.terminal-aide');
    var btnCtrlC = el.querySelector('[data-t="ctrlc"]');
    var AIDE_BAS = aideBas.innerHTML;
    var posHist = null;

    var occupe = false; // une commande est en cours
    var interrompu = false; // Ctrl+C : on n'exécute pas la suite de la ligne
    var attente = null; // question posée par la commande en cours
    var courante = null; // commande en cours (pour Ctrl+C)
    var suiviCourant = null; // tail -f en cours

    ecran.addEventListener('click', function () {
      if (!window.getSelection().toString()) input.focus();
    });

    function lignes() {
      return S.etat.lignes;
    }

    function ajouter(html, sansSauver) {
      if (!sansSauver) lignes().push(html);
      var d = document.createElement('div');
      d.className = 'ligne';
      d.innerHTML = html;
      sortie.appendChild(d);
    }
    function out(txt, classe) {
      ajouter(classe ? '<span class="' + classe + '">' + esc(txt) + '</span>' : esc(txt));
    }
    function err(txt) {
      out(txt, 't-err');
    }
    function aide(txt) {
      out('💡 ' + txt, 't-aide');
    }
    function defiler() {
      ecran.scrollTop = ecran.scrollHeight;
    }

    // ---------- Session ----------

    function u() {
      return S.utilisateur();
    }
    function cwd() {
      return S.session().cwd;
    }
    function abs(ch) {
      return S.absolu(ch, cwd(), u());
    }
    function court(chemin) {
      var h = S.home();
      if (chemin === h) return '~';
      if (h !== '/' && chemin.indexOf(h + '/') === 0) return '~' + chemin.slice(h.length);
      return chemin;
    }
    function shell() {
      return S.etat.pile.length > 1 && S.session().login ? '-bash' : 'bash';
    }
    function promptHtml() {
      return '<span class="t-prompt-user">' + esc(u() + '@ubuntu') + '</span>:' +
        '<span class="t-prompt-path">' + esc(court(cwd())) + '</span>' + (u() === 'root' ? '# ' : '$ ');
    }
    function majPrompt() {
      promptEl.innerHTML = promptHtml();
      titre.textContent = 'Killercoda · Ubuntu — ' + u() + '@ubuntu: ' + court(cwd());
    }

    // Aide en français après un « Permission denied ».
    function expliquerRefus(chemin, io) {
      if (io) io.refus = chemin;
      var user = u();
      if (user === 'root') return;
      if (/^\/(etc|root|usr|var\/log|var\/lib|boot)(\/|$)/.test(chemin)) {
        aide('Ce fichier système est réservé à root. ' + user + ' n\'a pas ce droit : tape exit pour revenir au compte root.');
        return;
      }
      var n = S.noeud(chemin);
      var d = S.noeud(S.dossierDe(chemin));
      if (n && n.t === 'f' && n.o !== user) {
        aide('Le fichier ' + S.nomDe(chemin) + ' appartient à ' + n.o + ' (' + rwx(n.p, n.t) + ') : ' + user +
          ' ne peut pas le modifier. Regarde avec ls -l.');
      } else if (d && d.o !== user) {
        aide('Le dossier ' + S.dossierDe(chemin) + ' appartient à ' + d.o + ' (' + rwx(d.p, 'd') + ' ' + d.o + ' ' + d.g + ') : ' +
          user + ' n\'y a pas le droit d\'écriture (w). Vérifie avec ls -ld ' + S.dossierDe(chemin));
      } else {
        aide('Permission refusée : vérifie le propriétaire et les droits avec ls -l.');
      }
    }

    // ---------- Affichage ls ----------

    function rwx(p, type) {
      var s = type === 'd' ? 'd' : type === 'l' ? 'l' : '-';
      p.split('').forEach(function (ch) {
        var n = parseInt(ch, 8);
        s += (n & 4 ? 'r' : '-') + (n & 2 ? 'w' : '-') + (n & 1 ? 'x' : '-');
      });
      return s;
    }
    function dateLs(ts) {
      var d = new Date(ts);
      var j = String(d.getDate());
      return MOIS[d.getMonth()] + ' ' + (j.length < 2 ? ' ' + j : j) + ' ' +
        String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
    function nomHtml(nom, n, suffixe) {
      var s = suffixe ? (n.t === 'd' ? '/' : n.t === 'l' ? '@' : /[1357]/.test(n.p.charAt(0)) ? '*' : '') : '';
      if (n.t === 'd') return '<span class="t-dir">' + esc(nom) + '</span>' + s;
      if (n.t === 'l') return '<span class="t-lien">' + esc(nom) + '</span>' + s;
      if (/[1357]/.test(n.p.charAt(0))) return '<span class="t-ok">' + esc(nom) + '</span>' + s;
      return esc(nom) + s;
    }
    function taille(n) {
      return n.t === 'd' ? 4096 : n.t === 'l' ? n.cible.length : S.octets(n.txt);
    }

    // ---------- Analyse de la ligne de commande ----------

    function variable(ligne, i) {
      var m = /^\$(\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*)|\?)/.exec(ligne.slice(i));
      if (!m) return { val: '$', fin: i + 1 };
      var nom = m[2] || m[3] || '?';
      var env = { HOME: S.home(), USER: u(), LOGNAME: u(), PWD: cwd(), HOSTNAME: 'ubuntu', SHELL: '/bin/bash', LANG: 'C.UTF-8', '?': '0' };
      return { val: env[nom] !== undefined ? env[nom] : '', fin: i + m[0].length };
    }

    function analyserLigne(ligne) {
      var toks = [];
      var i = 0;
      var mot = null;
      var glob = false;
      function finMot() {
        if (mot !== null) toks.push({ t: 'mot', v: mot, glob: glob });
        mot = null;
        glob = false;
      }
      while (i < ligne.length) {
        var c = ligne.charAt(i);
        if (c === ' ' || c === '\t') {
          finMot();
          i++;
          continue;
        }
        if (c === '#' && mot === null) break;
        if (c === ';' || c === '|' || c === '&' || c === '>' || c === '<') {
          finMot();
          var deux = ligne.substr(i, 2);
          if (deux === '&&' || deux === '||' || deux === '>>') {
            toks.push({ t: 'op', v: deux });
            i += 2;
          } else {
            toks.push({ t: 'op', v: c === '&' ? ';' : c });
            i++;
          }
          continue;
        }
        if (mot === null) mot = '';
        if (c === "'") {
          var j = ligne.indexOf("'", i + 1);
          if (j === -1) return { erreur: 'unexpected EOF while looking for matching `\'\'' };
          mot += ligne.slice(i + 1, j);
          i = j + 1;
          continue;
        }
        if (c === '"') {
          i++;
          while (i < ligne.length && ligne.charAt(i) !== '"') {
            var d = ligne.charAt(i);
            if (d === '\\' && /["\\$`]/.test(ligne.charAt(i + 1))) {
              mot += ligne.charAt(i + 1);
              i += 2;
            } else if (d === '$') {
              var v = variable(ligne, i);
              mot += v.val;
              i = v.fin;
            } else {
              mot += d;
              i++;
            }
          }
          if (i >= ligne.length) return { erreur: 'unexpected EOF while looking for matching `"\'' };
          i++;
          continue;
        }
        if (c === '\\') {
          mot += ligne.charAt(i + 1);
          i += 2;
          continue;
        }
        if (c === '$') {
          var v2 = variable(ligne, i);
          mot += v2.val;
          i = v2.fin;
          continue;
        }
        if (c === '*' || c === '?') glob = true;
        mot += c;
        i++;
      }
      finMot();

      // Commandes séparées par ; && ||, étapes séparées par |, redirections.
      var liste = [];
      var etapes = [];
      var etape = { mots: [], redir: null, entree: null };
      for (var k = 0; k < toks.length; k++) {
        var tk = toks[k];
        if (tk.t === 'mot') {
          etape.mots.push(tk);
          continue;
        }
        if (tk.v === '>' || tk.v === '>>' || tk.v === '<') {
          var cible = toks[k + 1];
          if (!cible || cible.t !== 'mot') return { erreur: 'syntax error near unexpected token `' + (cible ? cible.v : 'newline') + '\'' };
          if (tk.v === '<') etape.entree = cible.v;
          else etape.redir = { mode: tk.v, cible: cible.v };
          k++;
          continue;
        }
        if (!etape.mots.length) return { erreur: 'syntax error near unexpected token `' + tk.v + '\'' };
        etapes.push(etape);
        etape = { mots: [], redir: null, entree: null };
        if (tk.v !== '|') {
          liste.push({ etapes: etapes, sep: tk.v });
          etapes = [];
        }
      }
      if (etape.mots.length) etapes.push(etape);
      else if (etapes.length) return { erreur: 'syntax error near unexpected token `newline\'' };
      if (etapes.length) liste.push({ etapes: etapes, sep: null });
      return { liste: liste };
    }

    // Développement des jokers (* et ?) dans le dernier élément du chemin.
    function etendre(tk) {
      if (!tk.glob) return [tk.v];
      var w = tk.v;
      var coupe = w.lastIndexOf('/');
      var dirPart = coupe >= 0 ? w.slice(0, coupe + 1) : '';
      var motif = w.slice(coupe + 1);
      if (/[*?]/.test(dirPart)) return [w];
      var d = S.acceder(abs(dirPart || '.'), u());
      if (!d.n || d.n.t !== 'd' || !(S.droits(d.n, u()) & 4)) return [w];
      var re = new RegExp('^' + motif.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      var res = Object.keys(d.n.c).filter(function (k) {
        return (motif.charAt(0) === '.' || k.charAt(0) !== '.') && re.test(k);
      }).sort().map(function (k) {
        return dirPart + k;
      });
      return res.length ? res : [w];
    }

    // ---------- Entrées / sorties d'une commande ----------

    function creerIO(capture, entree) {
      var io = {
        buffer: [],
        entree: entree,
        refus: null,
        requete: null,
        out: function (txt, classe) {
          if (capture) io.buffer.push(txt);
          else out(txt, classe);
        },
        html: function (html, brut) {
          if (capture) io.buffer.push(brut);
          else ajouter(html);
        }
      };
      return io;
    }

    // Question posée par une commande (mot de passe, [Y/n]...).
    function demander(question, masque, rappel) {
      attente = { question: question, masque: masque, rappel: rappel };
      promptEl.textContent = question;
      input.type = masque ? 'password' : 'text';
      input.value = '';
      input.focus();
    }

    // ---------- Commandes ----------

    function lireFichier(nomArg, cmd, io) {
      var chemin = abs(nomArg);
      var r = S.acceder(chemin, u());
      if (!r.n) {
        err(cmd + ': ' + nomArg + ': ' + msg(r.erreur === 'EACCES' ? 'EACCES' : 'ENOENT'));
        if (r.erreur === 'EACCES') expliquerRefus(chemin, io);
        return null;
      }
      if (r.n.t === 'd') {
        err(cmd + ': ' + nomArg + ': Is a directory');
        return null;
      }
      if (!(S.droits(r.n, u()) & 4)) {
        err(cmd + ': ' + nomArg + ': Permission denied');
        expliquerRefus(chemin, io);
        return null;
      }
      return r.n.txt;
    }

    function lignesDe(txt) {
      if (!txt) return [];
      return txt.replace(/\n$/, '').split('\n');
    }

    function exigeRoot(a, message) {
      if (u() === 'root') return true;
      err(message);
      a.io.refus = 'root';
      aide('Cette commande demande les droits d\'administration (root). Tu es ' + u() + ' : tape exit pour revenir au compte root.');
      return false;
    }

    // ----- apt -----

    var VERSIONS = { nano: '7.2-2ubuntu0.1', curl: '8.5.0-2ubuntu10.6', apache2: '2.4.58-1ubuntu8.5', 'apache2-utils': '2.4.58-1ubuntu8.5', tree: '2.1.1-2ubuntu3' };

    function aptInstaller(a, paquets) {
      var io = a.io;
      a.io.out('Reading package lists... Done');
      a.io.out('Building dependency tree... Done');
      a.io.out('Reading state information... Done');
      var inconnus = paquets.filter(function (p) {
        return !VERSIONS[p] || !S.etat.aptMaj && !S.etat.paquets[p];
      });
      if (inconnus.length) {
        err('E: Unable to locate package ' + inconnus[0]);
        if (!S.etat.aptMaj && VERSIONS[inconnus[0]]) aide('L\'index des paquets n\'a pas encore été téléchargé : lance d\'abord apt update.');
        else aide('Ce paquet n\'existe pas (ou n\'est pas simulé ici). Vérifie l\'orthographe : apache2, avec un 2.');
        return false;
      }
      var nouveaux = paquets.filter(function (p) {
        return !S.etat.paquets[p];
      });
      paquets.filter(function (p) {
        return S.etat.paquets[p];
      }).forEach(function (p) {
        a.io.out(p + ' is already the newest version (' + VERSIONS[p] + ').');
      });
      if (!nouveaux.length) {
        a.io.out('0 upgraded, 0 newly installed, 0 to remove and 12 not upgraded.');
        return true;
      }
      var apache = nouveaux.indexOf('apache2') !== -1 || nouveaux.indexOf('apache2-utils') !== -1;
      var liste = nouveaux.slice();
      if (apache) {
        liste = ['apache2', 'apache2-bin', 'apache2-data', 'apache2-utils', 'libapr1t64', 'libaprutil1-dbd-sqlite3',
          'libaprutil1-ldap', 'libaprutil1t64', 'liblua5.4-0', 'ssl-cert'].concat(nouveaux.filter(function (p) {
          return !/^apache2/.test(p);
        }));
        a.io.out('The following additional packages will be installed:');
        a.io.out('  apache2-bin apache2-data apache2-utils libapr1t64 libaprutil1-dbd-sqlite3 libaprutil1-ldap libaprutil1t64 liblua5.4-0 ssl-cert');
        a.io.out('Suggested packages:');
        a.io.out('  apache2-doc apache2-suexec-pristine | apache2-suexec-custom www-browser');
      }
      a.io.out('The following NEW packages will be installed:');
      a.io.out('  ' + liste.join(' '));
      a.io.out('0 upgraded, ' + liste.length + ' newly installed, 0 to remove and 12 not upgraded.');
      a.io.out('Need to get ' + (apache ? '1,880' : '47.2') + ' kB of archives.');
      a.io.out('After this operation, ' + (apache ? '7,724' : '111') + ' kB of additional disk space will be used.');

      function installer() {
        liste.forEach(function (p, i) {
          a.io.out('Get:' + (i + 1) + ' http://archive.ubuntu.com/ubuntu noble-updates/main amd64 ' + p + ' amd64 ' + (VERSIONS[p] || '1.7.2-3.1build2') + ' [' + (90 + i * 37) + ' kB]');
        });
        a.io.out('Fetched ' + (apache ? '1,880' : '47.2') + ' kB in 1s (2,104 kB/s)');
        liste.forEach(function (p) {
          a.io.out('Selecting previously unselected package ' + p + '.');
          a.io.out('Unpacking ' + p + ' (' + (VERSIONS[p] || '1.7.2-3.1build2') + ') ...');
        });
        liste.forEach(function (p) {
          a.io.out('Setting up ' + p + ' (' + (VERSIONS[p] || '1.7.2-3.1build2') + ') ...');
        });
        nouveaux.forEach(function (p) {
          if (p === 'tree') {
            S.etat.paquets.tree = true;
            S.noeud('/usr/bin').c.tree = S.F('', '755');
          }
        });
        if (apache) {
          ['mpm_event', 'authz_core', 'authz_host', 'authn_core', 'auth_basic', 'access_compat', 'authn_file', 'authz_user', 'alias',
            'dir', 'autoindex', 'env', 'mime', 'negotiation', 'setenvif', 'filter', 'deflate', 'status', 'reqtimeout'].forEach(function (m) {
            a.io.out('Enabling module ' + m + '.');
          });
          ['charset', 'localized-error-pages', 'other-vhosts-access-log', 'security', 'serve-cgi-bin'].forEach(function (c) {
            a.io.out('Enabling conf ' + c + '.');
          });
          a.io.out('Enabling site 000-default.');
          a.io.out('Created symlink /etc/systemd/system/multi-user.target.wants/apache2.service → /usr/lib/systemd/system/apache2.service.');
          S.installerApache();
        }
        a.io.out('Processing triggers for man-db (2.12.0-4build2) ...');
        a.io.out('Processing triggers for libc-bin (2.39-0ubuntu8.3) ...');
        if (apache) aide('Apache est installé et déjà démarré. Vérifie son état avec systemctl status apache2.');
      }

      if (a.opts.y || a.opts.yes) {
        installer();
        return true;
      }
      demander('Do you want to continue? [Y/n] ', false, function (rep) {
        if (rep.trim() === '' || /^[yYoO]/.test(rep.trim())) {
          installer();
          io.fin(true);
        } else {
          a.io.out('Abort.');
          io.fin(false);
        }
      });
      return ATTENTE;
    }

    function apt(a) {
      var verbe = a.args[0];
      if (!verbe) {
        a.io.out('apt 2.7.14 (amd64)');
        a.io.out('Usage: apt [options] command');
        a.io.out('Most used commands: update, install, remove, upgrade, list, search, show');
        return false;
      }
      if (verbe === 'update') {
        if (u() !== 'root') {
          a.io.out('Reading package lists... Done');
          err('E: Could not open lock file /var/lib/apt/lists/lock - open (13: Permission denied)');
          err('E: Unable to lock directory /var/lib/apt/lists/');
          a.io.refus = '/var/lib/apt/lists';
          aide('Seul root peut mettre à jour l\'index des paquets : tape exit pour revenir au compte root.');
          return false;
        }
        ['Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease',
          'Get:2 http://archive.ubuntu.com/ubuntu noble-updates InRelease [126 kB]',
          'Get:3 http://security.ubuntu.com/ubuntu noble-security InRelease [126 kB]',
          'Get:4 http://archive.ubuntu.com/ubuntu noble-backports InRelease [126 kB]',
          'Get:5 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 Packages [867 kB]',
          'Fetched 1,245 kB in 1s (1,032 kB/s)', 'Reading package lists... Done', 'Building dependency tree... Done',
          'Reading state information... Done', '12 packages can be upgraded. Run \'apt list --upgradable\' to see them.'].forEach(function (l) {
          a.io.out(l);
        });
        S.etat.aptMaj = true;
        return true;
      }
      if (verbe === 'install' || verbe === 'reinstall') {
        if (u() !== 'root') {
          err('E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)');
          err('E: Unable to acquire the dpkg frontend lock (/var/lib/dpkg/lock-frontend), are you root?');
          a.io.refus = '/var/lib/dpkg';
          aide('Seul root peut installer un logiciel : tape exit pour revenir au compte root.');
          return false;
        }
        var paquets = a.args.slice(1);
        if (!paquets.length) {
          a.io.out('0 upgraded, 0 newly installed, 0 to remove and 12 not upgraded.');
          return true;
        }
        return aptInstaller(a, paquets);
      }
      if (verbe === 'upgrade' || verbe === 'full-upgrade' || verbe === 'dist-upgrade') {
        aide('apt ' + verbe + ' met à jour les logiciels déjà installés : ce n\'est pas nécessaire pour ce TP (et c\'est long). Ici, rien n\'est fait.');
        return true;
      }
      if (verbe === 'remove' || verbe === 'purge' || verbe === 'autoremove') {
        aide('La désinstallation n\'est pas simulée. Pour repartir de zéro, utilise le bouton Réinitialiser du terminal.');
        return false;
      }
      if (verbe === 'list' || verbe === 'search' || verbe === 'show' || verbe === 'policy') {
        aide('apt ' + verbe + ' n\'est pas simulé ici. Les paquets utiles au TP : apache2 (le serveur) et apache2-utils (htpasswd).');
        return true;
      }
      err('E: Invalid operation ' + verbe);
      return false;
    }

    // ----- systemctl / service -----

    function dateStatus(ts) {
      var d = new Date(ts);
      var j = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
      return j + ' ' + d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0') +
        ' ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + ':' +
        String(d.getUTCSeconds()).padStart(2, '0') + ' UTC';
    }
    function duree(ts) {
      var s = Math.max(1, Math.round((Date.now() - ts) / 1000));
      if (s < 60) return s + 's';
      var m = Math.floor(s / 60);
      if (m < 60) return m + 'min ' + (s % 60) + 's';
      var h = Math.floor(m / 60);
      if (h < 24) return h + 'h ' + (m % 60) + 'min';
      return Math.floor(h / 24) + ' days';
    }

    function statut(io) {
      var a = S.etat.apache;
      var actif = a.etat === 'actif';
      var puce = actif ? '<span class="t-ok">●</span>' : a.etat === 'echec' ? '<span class="t-err">×</span>' : '○';
      io.html(puce + ' apache2.service - The Apache HTTP Server', (actif ? '●' : a.etat === 'echec' ? '×' : '○') + ' apache2.service - The Apache HTTP Server');
      io.out('     Loaded: loaded (/usr/lib/systemd/system/apache2.service; ' + (a.enabled === false ? 'disabled' : 'enabled') + '; preset: enabled)');
      var act = actif ? 'active (running)' : a.etat === 'echec' ? 'failed (Result: exit-code)' : 'inactive (dead)';
      io.html('     Active: <span class="' + (actif ? 't-ok' : a.etat === 'echec' ? 't-err' : 't-dim') + '">' + esc(act) + '</span> since ' +
        dateStatus(a.depuis) + '; ' + duree(a.depuis) + ' ago', '     Active: ' + act + ' since ' + dateStatus(a.depuis) + '; ' + duree(a.depuis) + ' ago');
      io.out('       Docs: https://httpd.apache.org/docs/2.4/');
      if (actif) {
        io.out('    Process: ' + (a.pid - 3) + ' ExecStart=/usr/sbin/apachectl start (code=exited, status=0/SUCCESS)');
        io.out('   Main PID: ' + a.pid + ' (apache2)');
        io.out('      Tasks: 55 (limit: 4614)');
        io.out('     Memory: 5.6M (peak: 5.9M)');
        io.out('        CPU: 41ms');
        io.out('     CGroup: /system.slice/apache2.service');
        io.out('             ├─' + a.pid + ' /usr/sbin/apache2 -k start');
        io.out('             ├─' + (a.pid + 2) + ' /usr/sbin/apache2 -k start');
        io.out('             └─' + (a.pid + 3) + ' /usr/sbin/apache2 -k start');
      } else if (a.etat === 'echec') {
        io.out('    Process: ' + (a.pid + 9) + ' ExecStart=/usr/sbin/apachectl start (code=exited, status=1/FAILURE)');
        io.out('        CPU: 19ms');
      }
      io.out('');
      (a.journal || []).forEach(function (l) {
        io.out(l);
      });
    }

    function unite(nom) {
      return String(nom || '').replace(/\.service$/, '');
    }

    function service(a, verbe, nomUnite) {
      var io = a.io;
      var ap = S.etat.apache;
      if (!nomUnite) {
        err('Too few arguments.');
        return false;
      }
      if (nomUnite === 'daemon-reload') return true;
      var un = unite(nomUnite);
      if (un !== 'apache2' || !ap.installe) {
        if (verbe === 'status') err('Unit ' + un + '.service could not be found.');
        else err('Failed to ' + verbe + ' ' + un + '.service: Unit ' + un + '.service not found.');
        if (un === 'apache' || un === 'httpd') aide('Sous Ubuntu, le service s\'appelle apache2 (avec un 2).');
        else if (un === 'apache2') aide('Apache n\'est pas encore installé : apt update puis apt install apache2.');
        return false;
      }
      if (verbe === 'status') {
        statut(io);
        return ap.etat === 'actif';
      }
      if (verbe === 'is-active') {
        io.out(ap.etat === 'actif' ? 'active' : ap.etat === 'echec' ? 'failed' : 'inactive');
        return ap.etat === 'actif';
      }
      if (verbe === 'is-enabled') {
        io.out(ap.enabled === false ? 'disabled' : 'enabled');
        return true;
      }
      if (u() !== 'root') {
        err('Failed to ' + verbe + ' apache2.service: Access denied');
        err('See system logs and \'systemctl status apache2.service\' for details.');
        io.refus = 'systemctl';
        aide('Piloter un service est réservé à root : tape exit pour revenir au compte root.');
        return false;
      }
      var echec = function (e) {
        err('Job for apache2.service failed because the control process exited with error code.');
        err('See "systemctl status apache2.service" and "journalctl -xeu apache2.service" for details.');
        aide('Une erreur dans un fichier de configuration empêche Apache de ' + (verbe === 'reload' ? 'recharger' : 'démarrer') +
          ' : apache2ctl configtest indique le fichier et la ligne fautifs (' + e.fichier + (e.ligne ? ', ligne ' + e.ligne : '') + ').');
        if (verbe === 'reload') aide('Apache continue de tourner avec l\'ancienne configuration.');
        return false;
      };
      switch (verbe) {
        case 'start':
          if (ap.etat === 'actif') return true;
          var e1 = S.demarrer();
          return e1 ? echec(e1) : true;
        case 'stop':
          S.arreter();
          return true;
        case 'restart':
          S.arreter();
          var e2 = S.demarrer();
          return e2 ? echec(e2) : true;
        case 'reload':
        case 'force-reload':
          if (ap.etat !== 'actif') {
            err('apache2.service is not active, cannot reload.');
            aide('Apache est arrêté : démarre-le avec systemctl start apache2 (ou restart).');
            return false;
          }
          var e3 = S.recharger();
          return e3 ? echec(e3) : true;
        case 'enable':
          ap.enabled = true;
          out('Synchronizing state of apache2.service with SysV service script with /usr/lib/systemd/systemd-sysv-install.');
          out('Executing: /usr/lib/systemd/systemd-sysv-install enable apache2');
          return true;
        case 'disable':
          ap.enabled = false;
          out('Synchronizing state of apache2.service with SysV service script with /usr/lib/systemd/systemd-sysv-install.');
          out('Executing: /usr/lib/systemd/systemd-sysv-install disable apache2');
          out('Removed "/etc/systemd/system/multi-user.target.wants/apache2.service".');
          return true;
      }
      err('Unknown command verb \'' + verbe + '\'.');
      return false;
    }

    // ----- a2enconf, a2ensite, a2enmod (et leurs contraires) -----

    var A2 = {
      conf: { dispo: '/etc/apache2/conf-available', actif: '/etc/apache2/conf-enabled', ext: '.conf', nom: 'Conf', recharge: 'reload' },
      site: { dispo: '/etc/apache2/sites-available', actif: '/etc/apache2/sites-enabled', ext: '.conf', nom: 'Site', recharge: 'reload' },
      mod: { dispo: '/etc/apache2/mods-available', actif: '/etc/apache2/mods-enabled', ext: '.load', nom: 'Module', recharge: 'restart' }
    };

    function a2(a, type, activer) {
      var t = A2[type];
      var cmd = a.cmd;
      function appliquer(noms) {
        var ok = true;
        var change = false;
        noms.forEach(function (brut) {
          var nom = brut.replace(new RegExp(t.ext.replace('.', '\\.') + '$'), '');
          var dispo = S.noeud(t.dispo);
          var actif = S.noeud(t.actif);
          if (!dispo || !dispo.c[nom + t.ext]) {
            err('ERROR: ' + t.nom + ' ' + nom + ' does not exist!');
            if (type === 'conf') aide('a2enconf cherche ' + t.dispo + '/' + nom + '.conf : vérifie que le fichier existe (ls ' + t.dispo + ').');
            ok = false;
            return;
          }
          var deja = !!actif.c[nom + t.ext];
          if (activer && deja) {
            out(t.nom + ' ' + nom + ' already enabled');
            return;
          }
          if (!activer && !deja) {
            out(t.nom + ' ' + nom + ' already disabled');
            return;
          }
          if (activer) {
            actif.c[nom + t.ext] = S.L('../' + S.nomDe(t.dispo) + '/' + nom + t.ext);
            out(type === 'mod' ? 'Enabling module ' + nom + '.' : 'Enabling ' + type + ' ' + nom + '.');
          } else {
            delete actif.c[nom + t.ext];
            out(t.nom + ' ' + nom + ' disabled.');
          }
          change = true;
        });
        if (change) {
          out('To activate the new configuration, you need to run:');
          out('  systemctl ' + t.recharge + ' apache2');
        }
        return ok;
      }
      if (u() !== 'root') {
        err('ERROR: ' + cmd + ' must be run as root');
        a.io.refus = t.actif;
        aide('Activer une configuration est réservé à root : tape exit pour revenir au compte root.');
        return false;
      }
      if (a.args.length) return appliquer(a.args);
      var noms = Object.keys((S.noeud(activer ? t.dispo : t.actif) || { c: {} }).c).filter(function (k) {
        return k.slice(-t.ext.length) === t.ext;
      }).map(function (k) {
        return k.slice(0, -t.ext.length);
      });
      out('Your choices are: ' + noms.join(' '));
      demander('Which ' + (type === 'mod' ? 'module' : type) + '(s) do you want to ' + (activer ? 'enable' : 'disable') + ' (wildcards ok)?\n', false, function (rep) {
        var choix = rep.trim().split(/\s+/).filter(Boolean);
        a.io.fin(choix.length ? appliquer(choix) : false);
      });
      return ATTENTE;
    }

    // ----- apachectl / apache2ctl -----

    function avertissementNom() {
      err('AH00558: apache2: Could not reliably determine the server\'s fully qualified domain name, using 127.0.1.1. Set the \'ServerName\' directive globally to suppress this message');
    }

    function apachectl(a) {
      var verbe = a.args[0] || (a.opts.t ? 'configtest' : a.opts.v ? '-v' : '');
      if (verbe === '-v' || a.opts.v) {
        out('Server version: ' + S.SIGNATURE);
        out('Server built:   2024-10-02T12:37:23');
        return true;
      }
      if (verbe === 'configtest' || a.opts.t) {
        var conf = S.lireConfig();
        avertissementNom();
        if (conf.erreur) {
          S.messageErreurConf(conf.erreur).forEach(err);
          err('Action \'configtest\' failed.');
          err('The Apache error log may have more information.');
          aide('Corrige la ligne indiquée (faute de frappe, balise <Directory> non refermée...), puis relance apache2ctl configtest.');
          return false;
        }
        out('Syntax OK');
        aide('Le message AH00558 n\'est qu\'un avertissement (pas de ServerName) : la syntaxe est correcte.');
        return true;
      }
      var correspondance = { start: 'start', stop: 'stop', restart: 'restart', graceful: 'reload', 'graceful-stop': 'stop', status: 'status' };
      if (correspondance[verbe]) return service(a, correspondance[verbe], 'apache2');
      out('Usage: /usr/sbin/apachectl start|stop|restart|graceful|graceful-stop|configtest|status');
      return false;
    }

    // ----- Comptes -----

    function nouvelUtilisateur(nom, avecHome) {
      var uid = 1000;
      Object.keys(S.etat.users).forEach(function (x) {
        if (S.etat.users[x].uid >= uid) uid = S.etat.users[x].uid + 1;
      });
      var h = '/home/' + nom;
      S.etat.users[nom] = { uid: uid, home: h, groupes: [nom, 'users'], mdp: null };
      if (avecHome) {
        var skel = S.noeud('/etc/skel');
        var c = {};
        Object.keys(skel.c).forEach(function (k) {
          c[k] = S.F(skel.c[k].txt, '644', nom, nom);
        });
        S.noeud('/home').c[nom] = S.D(c, '750', nom, nom);
      }
      S.majComptes();
      return uid;
    }

    function saisirMotDePasse(rappel, invite1, invite2) {
      demander(invite1 || 'New password: ', true, function (p1) {
        demander(invite2 || 'Retype new password: ', true, function (p2) {
          if (p1 !== p2) {
            err('Sorry, passwords do not match.');
            saisirMotDePasse(rappel, invite1, invite2);
            return;
          }
          rappel(p1);
        });
      });
    }

    function adduser(a) {
      if (u() !== 'root') {
        err('fatal: Only root may add a user or group to the system.');
        a.io.refus = '/etc/passwd';
        aide('Créer un compte est réservé à root : tape exit pour revenir au compte root.');
        return false;
      }
      var nom = a.args[0];
      if (!nom || a.args.length > 2) {
        err('fatal: Only one or two names allowed.');
        aide('Syntaxe : adduser etudiant');
        return false;
      }
      if (!/^[a-z_][a-z0-9_-]*$/.test(nom)) {
        err('fatal: Please enter a username matching the regular expression');
        err('        configured via the NAME_REGEX configuration variable.  Use the `--allow-bad-names\' option to');
        err('        relax this check or reconfigure NAME_REGEX in configuration.');
        aide('Le nom d\'utilisateur s\'écrit en minuscules, sans espace ni accent : etudiant');
        return false;
      }
      if (S.existeCompte(nom)) {
        err('fatal: The user `' + nom + '\' already exists.');
        return false;
      }
      var uid = nouvelUtilisateur(nom, true);
      out('info: Adding user `' + nom + '\' ...');
      out('info: Selecting UID/GID from range 1000 to 59999 ...');
      out('info: Adding new group `' + nom + '\' (' + uid + ') ...');
      out('info: Adding new user `' + nom + '\' (' + uid + ') with group `' + nom + ' (' + uid + ')\' ...');
      out('info: Creating home directory `/home/' + nom + '\' ...');
      out('info: Copying files from `/etc/skel\' ...');
      saisirMotDePasse(function (mdp) {
        S.etat.users[nom].mdp = S.hacher(mdp);
        out('passwd: password updated successfully');
        out('Changing the user information for ' + nom);
        out('Enter the new value, or press ENTER for the default');
        var champs = ['\tFull Name []: ', '\tRoom Number []: ', '\tWork Phone []: ', '\tHome Phone []: ', '\tOther []: '];
        (function champ(i) {
          if (i < champs.length) {
            demander(champs[i], false, function () {
              champ(i + 1);
            });
            return;
          }
          demander('Is the information correct? [Y/n] ', false, function () {
            out('info: Adding new user `' + nom + '\' to supplemental / extra groups `users\' ...');
            out('info: Adding user `' + nom + '\' to group `users\' ...');
            a.io.fin(true);
          });
        })(0);
      });
      return ATTENTE;
    }

    function empiler(cible, login) {
      var h = S.home(cible);
      var dest = login ? h : cwd();
      if (login && !S.noeud(h)) {
        err('su: warning: cannot change directory to ' + h + ': No such file or directory');
        dest = '/';
      }
      S.etat.pile.push({ user: cible, cwd: dest, ancien: dest, login: login });
    }

    function su(a) {
      var login = a.mots.indexOf('-') !== -1 || a.opts.l || a.opts.login;
      var cible = a.args.filter(function (x) {
        return x !== '-';
      })[0] || 'root';
      if (!S.existeCompte(cible)) {
        err('su: user ' + cible + ' does not exist or the user entry does not contain all the required fields');
        aide('Ce compte n\'existe pas encore : crée-le d\'abord (en root) avec adduser ' + cible);
        return false;
      }
      if (cible === 'www-data') {
        out('This account is currently not available.');
        aide('www-data est le compte utilisé par Apache : on ne peut pas s\'y connecter (pas de shell).');
        return false;
      }
      if (u() === 'root') {
        empiler(cible, login);
        return true;
      }
      demander('Password: ', true, function (mdp) {
        var c = S.etat.users[cible];
        if (c.mdp && S.verifierMdp(c.mdp, mdp)) {
          empiler(cible, login);
          a.io.fin(true);
          return;
        }
        err('su: Authentication failure');
        if (cible === 'root') aide('Dans Killercoda, le compte root n\'a pas de mot de passe : pour redevenir root, tape simplement exit.');
        a.io.fin(false);
      });
      return ATTENTE;
    }

    // ----- Fichiers -----

    function lsListe(a) {
      var io = a.io;
      var opts = a.opts;
      var cibles = a.args.length ? a.args : ['.'];
      var ok = true;
      function ligneLong(nom, n) {
        var cible = n.t === 'l' ? ' -> ' + n.cible : '';
        var debut = rwx(n.p, n.t) + ' ' + (n.t === 'd' ? 2 : 1) + ' ' + n.o.padEnd(8) + ' ' + n.g.padEnd(8) + ' ' +
          String(taille(n)).padStart(5) + ' ' + dateLs(n.m) + ' ';
        io.html(esc(debut) + nomHtml(nom, n, opts.F) + esc(cible), debut + nom + cible);
      }
      cibles.forEach(function (c, i) {
        var chemin = abs(c);
        var r = S.acceder(chemin, u(), false);
        if (!r.n) {
          err('ls: cannot access \'' + c + '\': ' + msg(r.erreur === 'EACCES' ? 'EACCES' : 'ENOENT'));
          if (r.erreur === 'EACCES') expliquerRefus(chemin, io);
          ok = false;
          return;
        }
        var n = r.n;
        if (n.t === 'l' && !opts.l && !opts.d) {
          var cibleLien = S.acceder(chemin, u());
          if (cibleLien.n && cibleLien.n.t === 'd') n = cibleLien.n;
        }
        if (n.t !== 'd' || opts.d) {
          if (opts.l) ligneLong(c, n);
          else io.html(nomHtml(c, n, opts.F), c);
          return;
        }
        if (!(S.droits(n, u()) & 4)) {
          err('ls: cannot open directory \'' + c + '\': Permission denied');
          expliquerRefus(chemin, io);
          ok = false;
          return;
        }
        if (cibles.length > 1) io.out((i ? '\n' : '') + c + ':');
        var noms = Object.keys(n.c).sort(function (x, y) {
          return x.replace(/^\./, '').toLowerCase().localeCompare(y.replace(/^\./, '').toLowerCase());
        });
        if (!opts.a && !opts.A) noms = noms.filter(function (x) {
          return x.charAt(0) !== '.';
        });
        var entrees = noms.map(function (x) {
          return [x, n.c[x]];
        });
        if (opts.a) {
          entrees.unshift(['..', S.noeud(S.dossierDe(chemin)) || n]);
          entrees.unshift(['.', n]);
        }
        if (opts.l) {
          io.out('total ' + entrees.length * 4);
          entrees.forEach(function (e) {
            ligneLong(e[0], e[1]);
          });
        } else if (entrees.length) {
          io.html(entrees.map(function (e) {
            return nomHtml(e[0], e[1], opts.F);
          }).join('  '), entrees.map(function (e) {
            return e[0];
          }).join('\n'));
        }
      });
      return ok;
    }

    function tailHead(a, tete) {
      var io = a.io;
      var n = 10;
      var args = [];
      a.args.forEach(function (x) {
        if (/^-\d+$/.test(x)) n = parseInt(x.slice(1), 10);
        else args.push(x);
      });
      if (a.opts.n !== undefined && a.opts.n !== true) n = parseInt(String(a.opts.n).replace(/^\+/, ''), 10) || 0;
      var suivre = !tete && (a.opts.f || a.opts.F);
      function extrait(txt) {
        var l = lignesDe(txt);
        return tete ? l.slice(0, n) : l.slice(Math.max(0, l.length - n));
      }
      if (!args.length) {
        if (io.entree === null) {
          aide((tete ? 'head' : 'tail') + ' attend un nom de fichier, par exemple : tail -f /var/log/apache2/access.log');
          return false;
        }
        extrait(io.entree).forEach(function (l) {
          io.out(l);
        });
        return true;
      }
      var ok = true;
      args.forEach(function (f, i) {
        var chemin = abs(f);
        var r = S.acceder(chemin, u());
        if (!r.n || r.n.t === 'd' || !(S.droits(r.n, u()) & 4)) {
          var code = !r.n ? (r.erreur === 'EACCES' ? 'EACCES' : 'ENOENT') : r.n.t === 'd' ? 'EISDIR' : 'EACCES';
          err((tete ? 'head' : 'tail') + ': cannot open \'' + f + '\' for reading: ' + msg(code));
          if (code === 'EACCES') {
            io.refus = chemin;
            if (/^\/var\/log/.test(chemin)) aide('Les journaux d\'Apache sont réservés à root (et au groupe adm) : tape exit pour revenir au compte root.');
            else expliquerRefus(chemin, io);
          }
          ok = false;
          return;
        }
        if (args.length > 1) io.out((i ? '\n' : '') + '==> ' + f + ' <==');
        extrait(r.n.txt).forEach(function (l) {
          io.out(l);
        });
      });
      if (!ok || !suivre) return ok;
      // tail -f : on affiche les nouvelles lignes jusqu'à Ctrl+C.
      var chemin = S.acceder(abs(args[args.length - 1])).chemin;
      suiviCourant = { chemin: chemin, fin: io.fin };
      S.suivi = chemin;
      btnCtrlC.hidden = false;
      promptEl.textContent = '';
      aideBas.innerHTML = '⏳ <strong>Suivi en temps réel</strong> de ' + esc(chemin) + ' : les nouvelles lignes s\'affichent ici. <kbd>Ctrl</kbd>+<kbd>C</kbd> pour arrêter.';
      S.evenement({ source: 'terminal', cmd: 'tail', args: a.args, opts: a.opts, ok: true });
      return ATTENTE;
    }

    function arreterSuivi() {
      var s = suiviCourant;
      if (!s) return;
      suiviCourant = null;
      S.suivi = null;
      btnCtrlC.hidden = true;
      aideBas.innerHTML = AIDE_BAS;
      ajouter('^C');
      interrompu = true;
      s.fin(false);
    }

    S.on('ecriture', function (d) {
      if (suiviCourant && d.chemin === suiviCourant.chemin) {
        lignesDe(d.texte).forEach(function (l) {
          out(l);
        });
        defiler();
        S.sauver();
      }
    });

    function grep(a) {
      var io = a.io;
      var motif = a.opts.e && a.opts.e !== true ? a.opts.e : a.args[0];
      var fichiers = a.opts.e && a.opts.e !== true ? a.args : a.args.slice(1);
      if (motif === undefined) {
        err('Usage: grep [OPTION]... PATTERNS [FILE]...');
        aide('Exemple : grep 404 /var/log/apache2/access.log');
        return false;
      }
      var re;
      try {
        re = new RegExp(motif, a.opts.i ? 'gi' : 'g');
      } catch (e) {
        re = new RegExp(motif.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), a.opts.i ? 'gi' : 'g');
      }
      var trouve = false;
      var sources = [];
      if (!fichiers.length) {
        if (io.entree === null) {
          aide('grep attend un fichier où chercher : grep 404 /var/log/apache2/access.log');
          return false;
        }
        sources.push({ nom: null, txt: io.entree });
      }
      var ok = true;
      fichiers.forEach(function (f) {
        var txt = lireFichier(f, 'grep', io);
        if (txt === null) ok = false;
        else sources.push({ nom: f, txt: txt });
      });
      sources.forEach(function (s) {
        var compte = 0;
        lignesDe(s.txt).forEach(function (l, i) {
          re.lastIndex = 0;
          var correspond = re.test(l);
          if (a.opts.v) correspond = !correspond;
          if (!correspond) return;
          trouve = true;
          compte++;
          if (a.opts.c) return;
          var prefixe = (fichiers.length > 1 ? s.nom + ':' : '') + (a.opts.n ? (i + 1) + ':' : '');
          re.lastIndex = 0;
          var html = a.opts.v ? esc(l) : esc(l).replace(new RegExp(esc(motif).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), a.opts.i ? 'gi' : 'g'), function (m) {
            return '<span class="t-err">' + m + '</span>';
          });
          io.html('<span class="t-lien">' + esc(prefixe) + '</span>' + html, prefixe + l);
        });
        if (a.opts.c) io.out((fichiers.length > 1 ? s.nom + ':' : '') + compte);
      });
      return ok && trouve;
    }

    function copier(src, dest, recursif, io) {
      var n = S.acceder(src, u());
      if (!n.n) return n.erreur === 'EACCES' ? 'EACCES' : 'ENOENT';
      if (n.n.t === 'd') {
        if (!recursif) return 'OMIT';
        var e = S.creerDossier(dest, u());
        if (e && e !== 'EEXIST') return e;
        var ok = null;
        Object.keys(n.n.c).forEach(function (k) {
          var r = copier(src + '/' + k, dest + '/' + k, true, io);
          if (r) ok = r;
        });
        return ok;
      }
      if (!(S.droits(n.n, u()) & 4)) return 'EACCES';
      return S.ecrire(dest, n.n.txt, u(), false);
    }

    function changerDroits(n, mode) {
      if (/^[0-7]{3,4}$/.test(mode)) {
        n.p = mode.slice(-3);
        return;
      }
      var v = n.p.split('').map(function (c) {
        return parseInt(c, 8);
      });
      mode.split(',').forEach(function (clause) {
        var m = clause.match(/^([ugoa]*)([+\-=])([rwxX]*)$/);
        var qui = m[1] || 'a';
        var bits = (m[3].indexOf('r') !== -1 ? 4 : 0) + (m[3].indexOf('w') !== -1 ? 2 : 0) + (/[xX]/.test(m[3]) ? 1 : 0);
        ['u', 'g', 'o'].forEach(function (q, i) {
          if (qui.indexOf(q) === -1 && qui.indexOf('a') === -1) return;
          if (m[2] === '+') v[i] |= bits;
          else if (m[2] === '-') v[i] &= ~bits;
          else v[i] = bits;
        });
      });
      n.p = v.join('');
    }

    function parcourir(n, fn) {
      fn(n);
      if (n.t === 'd') Object.keys(n.c).forEach(function (k) {
        parcourir(n.c[k], fn);
      });
    }

    function curl(a) {
      var io = a.io;
      var url = a.args[0];
      if (!url) {
        err('curl: try \'curl --help\' or \'curl --manual\' for more information');
        aide('Exemple : curl localhost (ou curl -I localhost pour n\'afficher que les en-têtes).');
        return false;
      }
      var m = /^(?:(https?):\/\/)?([^/:]+)(?::(\d+))?(\/.*)?$/.exec(url);
      if (!m) {
        err('curl: (3) URL rejected: Malformed input to a URL function');
        return false;
      }
      var hote = m[2];
      var port = m[3] ? parseInt(m[3], 10) : m[1] === 'https' ? 443 : 80;
      var chemin = m[4] || '/';
      var locaux = ['localhost', '127.0.0.1', 'ubuntu', '[::1]', S.IP_MACHINE];
      if (locaux.indexOf(hote) === -1) {
        err('curl: (6) Could not resolve host: ' + hote);
        aide('Ce terminal d\'entraînement n\'a pas accès à Internet : interroge ton propre serveur avec curl localhost.');
        return false;
      }
      var auth = null;
      if (a.opts.u && a.opts.u !== true) {
        var p = String(a.opts.u).split(':');
        auth = { user: p[0], mdp: p.slice(1).join(':') };
      }
      var methode = a.opts.I ? 'HEAD' : 'GET';
      if (a.opts.v) {
        io.out('*   Trying ' + (hote === 'localhost' ? '[::1]' : hote) + ':' + port + '...');
      }
      var rep = S.requete({ chemin: chemin, methode: methode, client: 'curl', auth: auth, hote: hote, port: port, ua: 'curl/8.5.0', base: 'http://' + hote });
      var sauts = 0;
      while (rep.connexion !== false && a.opts.L && rep.statut === 301 && rep.location && sauts < 5) {
        sauts++;
        rep = S.requete({ chemin: rep.location.replace(/^https?:\/\/[^/]+/, ''), methode: methode, client: 'curl', auth: auth, hote: hote, port: port, ua: 'curl/8.5.0', base: 'http://' + hote });
      }
      if (rep.connexion === false) {
        err('curl: (7) Failed to connect to ' + hote + ' port ' + port + ' after 0 ms: Couldn\'t connect to server');
        if (port !== 80) aide('Apache écoute sur le port 80 (http). Rien n\'écoute sur le port ' + port + '.');
        else if (!S.etat.apache.installe) aide('Aucun serveur web ne répond : Apache n\'est pas encore installé.');
        else aide('Apache ne répond pas : est-il démarré ? (systemctl status apache2)');
        return false;
      }
      io.requete = rep;
      if (a.opts.v) {
        io.out('* Connected to ' + hote + ' (' + (hote === 'localhost' ? '::1' : hote) + ') port ' + port);
        io.out('> ' + methode + ' ' + chemin + ' HTTP/1.1');
        io.out('> Host: ' + hote);
        io.out('> User-Agent: curl/8.5.0');
        io.out('> Accept: */*');
        if (auth) io.out('> Authorization: Basic ' + btoa(auth.user + ':' + auth.mdp));
        io.out('>');
        io.out('< HTTP/1.1 ' + rep.statut + ' ' + rep.raison);
        rep.entetes.forEach(function (h) {
          io.out('< ' + h[0] + ': ' + h[1]);
        });
        io.out('<');
      } else if (a.opts.I || a.opts.i) {
        io.out('HTTP/1.1 ' + rep.statut + ' ' + rep.raison);
        rep.entetes.forEach(function (h) {
          io.out(h[0] + ': ' + h[1]);
        });
        io.out('');
      }
      if (methode === 'GET' && !a.opts.I) {
        lignesDe(rep.corps).forEach(function (l) {
          io.out(l);
        });
      }
      return true;
    }

    function htpasswd(a) {
      var io = a.io;
      var o = a.opts;
      if (!a.args.length) {
        err('Usage:');
        err('\thtpasswd [-cimB25dpsDv] [-C cost] [-r rounds] passwordfile username');
        err('\thtpasswd -b[cmB25dpsDv] [-C cost] [-r rounds] passwordfile username password');
        aide('Exemple : htpasswd -c /etc/apache2/.htpasswd admin');
        return false;
      }
      if (o.n) {
        var nomN = a.args[0];
        saisirMotDePasse(function (mdp) {
          io.out(nomN + ':' + S.hacher(mdp));
          io.fin(true);
        }, 'New password: ', 'Re-type new password: ');
        return ATTENTE;
      }
      var fichierArg = a.args[0];
      var login = a.args[1];
      if (!login) {
        err('htpasswd: no username specified');
        aide('Il manque le nom d\'utilisateur : htpasswd -c ' + fichierArg + ' admin');
        return false;
      }
      var chemin = abs(fichierArg);
      var existant = S.acceder(chemin, u());
      if (!o.c && !existant.n) {
        err('htpasswd: cannot modify file ' + fichierArg + '; use \'-c\' to create it');
        aide('Le fichier n\'existe pas encore : la première fois, ajoute l\'option -c (create).');
        return false;
      }
      // Droit d'écriture vérifié avant de demander le mot de passe.
      var peut = existant.n ? !!(S.droits(existant.n, u()) & 2) : (function () {
        var p = S.acceder(S.dossierDe(chemin), u());
        return !!p.n && p.n.t === 'd' && (S.droits(p.n, u()) & 3) === 3;
      })();
      if (!peut) {
        err(o.c ? 'htpasswd: cannot create file ' + fichierArg : 'htpasswd: cannot open file ' + fichierArg + ' for read/write access');
        expliquerRefus(chemin, io);
        return false;
      }
      function enregistrer(mdp) {
        var lignesF = o.c || !existant.n ? [] : lignesDe(existant.n.txt);
        var autres = lignesF.filter(function (l) {
          return l && l.split(':')[0] !== login;
        });
        var maj = lignesF.length !== autres.length;
        autres.push(login + ':' + S.hacher(mdp));
        var e = S.ecrire(chemin, autres.join('\n') + '\n', u(), false);
        if (e) {
          err('htpasswd: cannot create file ' + fichierArg);
          return false;
        }
        io.out((maj ? 'Updating' : 'Adding') + ' password for user ' + login);
        if (o.c && existant.n && lignesDe(existant.n.txt).length > 1) {
          aide('Attention : -c recrée le fichier, les autres comptes qu\'il contenait ont été effacés. Pour ajouter un compte, n\'utilise pas -c.');
        }
        return true;
      }
      if (o.b) {
        if (a.args[2] === undefined) {
          err('htpasswd: no password specified');
          return false;
        }
        return enregistrer(a.args[2]);
      }
      demander('New password: ', true, function (p1) {
        demander('Re-type new password: ', true, function (p2) {
          if (p1 !== p2) {
            err('htpasswd: password verification error');
            io.fin(false);
            return;
          }
          io.fin(enregistrer(p1));
        });
      });
      return ATTENTE;
    }

    var COMMANDES = {
      help: function () {
        out('Commandes disponibles dans ce terminal d\'entraînement :', 't-dim');
        [
          'whoami · id · hostname [-I] · cat /etc/os-release · uname -a',
          'apt update · apt install paquet       gestion des logiciels (root)',
          'systemctl status|start|stop|restart|reload apache2',
          'apache2ctl configtest                  vérifie la syntaxe des .conf',
          'a2enconf · a2disconf · a2ensite · a2dissite · a2enmod',
          'adduser nom · su - nom · exit · passwd · sudo',
          'pwd · ls [-l] [-a] [-d] · cd · mkdir [-p] · touch · cp [-r] · mv · rm [-r] · ln -s',
          'chmod 755 nom · chmod o+x nom · chown user:groupe nom',
          'nano fichier                           éditeur de texte (Ctrl+O, Ctrl+X)',
          'cat · head · tail [-n N] [-f] · grep motif fichier · wc -l',
          'echo texte > fichier · echo texte >> fichier · commande | grep motif',
          'curl [-I] [-u login:mdp] localhost     requête HTTP depuis le serveur',
          'htpasswd [-c] fichier login            fichier de mots de passe',
          'ss -tlnp · ps aux · journalctl -u apache2 · history · clear'
        ].forEach(function (l) {
          out('  ' + l);
        });
        return true;
      },
      pwd: function (a) {
        a.io.out(cwd());
        return true;
      },
      whoami: function (a) {
        a.io.out(u());
        return true;
      },
      id: function (a) {
        var nom = a.args[0] || u();
        var c = S.etat.users[nom];
        if (!c) {
          err('id: \'' + nom + '\': no such user');
          return false;
        }
        var gids = { root: 0, 'www-data': 33, users: 100 };
        var groupes = c.groupes.map(function (g) {
          var gid = gids[g] !== undefined ? gids[g] : (S.etat.users[g] ? S.etat.users[g].uid : 1000);
          return gid + '(' + g + ')';
        });
        a.io.out('uid=' + c.uid + '(' + nom + ') gid=' + groupes[0] + ' groups=' + groupes.join(','));
        return true;
      },
      hostname: function (a) {
        a.io.out(a.opts.I ? S.IP_MACHINE + ' ' : 'ubuntu');
        return true;
      },
      uname: function (a) {
        a.io.out(a.opts.a ? 'Linux ubuntu 6.8.0-49-generic #49-Ubuntu SMP PREEMPT_DYNAMIC Mon Nov  4 02:06:24 UTC 2024 x86_64 x86_64 x86_64 GNU/Linux' : 'Linux');
        return true;
      },
      date: function (a) {
        a.io.out(new Date().toUTCString().replace('GMT', 'UTC'));
        return true;
      },
      clear: function () {
        S.etat.lignes = [];
        sortie.innerHTML = '';
        return true;
      },
      history: function (a) {
        S.etat.hist.forEach(function (h, i) {
          a.io.out(String(i + 1).padStart(5) + '  ' + h);
        });
        return true;
      },
      echo: function (a) {
        var args = a.mots.slice();
        var sautFinal = true;
        while (args.length && /^-[neE]+$/.test(args[0])) {
          if (args[0].indexOf('n') !== -1) sautFinal = false;
          args.shift();
        }
        var txt = args.join(' ');
        if (a.mots[0] && a.mots[0].indexOf('e') !== -1 && /^-/.test(a.mots[0])) txt = txt.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
        lignesDe(txt + (sautFinal ? '\n' : '')).forEach(function (l) {
          a.io.out(l);
        });
        if (!sautFinal) a.io.sansSaut = true;
        return true;
      },
      exit: function () {
        var pile = S.etat.pile;
        if (pile.length > 1) {
          var s = pile.pop();
          out(s.login ? 'logout' : 'exit');
          return true;
        }
        aide('Tu es déjà dans la session principale (root). Dans Killercoda, exit fermerait le terminal ; ici, il reste ouvert.');
        return true;
      },
      cd: function (a) {
        var arg = a.args[0];
        var cible;
        if (!arg || arg === '~') cible = S.home();
        else if (arg === '-') {
          cible = S.session().ancien;
          out(cible);
        } else cible = abs(arg);
        var r = S.acceder(cible, u());
        if (!r.n) {
          err(shell() + ': cd: ' + arg + ': ' + msg(r.erreur === 'EACCES' ? 'EACCES' : r.erreur));
          if (r.erreur === 'EACCES') expliquerRefus(cible, a.io);
          else aide('Ce dossier n\'existe pas ici. Vérifie l\'orthographe (majuscules comprises) et ta position avec pwd ou ls.');
          return false;
        }
        if (r.n.t !== 'd') {
          err(shell() + ': cd: ' + arg + ': Not a directory');
          return false;
        }
        if (!(S.droits(r.n, u()) & 1)) {
          err(shell() + ': cd: ' + arg + ': Permission denied');
          a.io.refus = cible;
          aide('Le dossier ' + cible + ' (' + rwx(r.n.p, 'd') + ' ' + r.n.o + ' ' + r.n.g + ') ne laisse pas ' + u() + ' y entrer (pas de droit x).');
          return false;
        }
        S.session().ancien = cwd();
        S.session().cwd = cible;
        return true;
      },
      ls: lsListe,
      mkdir: function (a) {
        if (!a.args.length) {
          err('mkdir: missing operand');
          aide('Indique le nom du dossier à créer, par exemple : mkdir dossier_test');
          return false;
        }
        var ok = true;
        a.args.forEach(function (x) {
          var chemin = abs(x);
          if (a.opts.p) {
            var parties = S.decouper(chemin);
            var ch = '';
            for (var i = 0; i < parties.length; i++) {
              ch += '/' + parties[i];
              var n = S.noeud(ch);
              if (n) {
                if (n.t !== 'd') {
                  err('mkdir: cannot create directory ‘' + x + '’: Not a directory');
                  ok = false;
                  return;
                }
                continue;
              }
              var e = S.creerDossier(ch, u());
              if (e) {
                err('mkdir: cannot create directory ‘' + ch + '’: ' + msg(e));
                if (e === 'EACCES') expliquerRefus(ch, a.io);
                ok = false;
                return;
              }
            }
            return;
          }
          var e2 = S.creerDossier(chemin, u());
          if (e2) {
            err('mkdir: cannot create directory ‘' + x + '’: ' + msg(e2));
            if (e2 === 'EACCES') expliquerRefus(chemin, a.io);
            else if (e2 === 'ENOENT') aide('Le dossier parent n\'existe pas. Crée-le d\'abord, ou utilise mkdir -p.');
            else if (e2 === 'EEXIST') aide('Un élément porte déjà ce nom ici (vérifie avec ls).');
            ok = false;
          }
        });
        return ok;
      },
      touch: function (a) {
        if (!a.args.length) {
          err('touch: missing file operand');
          aide('Indique le ou les fichiers à créer : touch index.html');
          return false;
        }
        var ok = true;
        a.args.forEach(function (x) {
          var chemin = abs(x);
          var r = S.acceder(chemin, u());
          if (r.n) {
            if (r.n.o !== u() && u() !== 'root' && !(S.droits(r.n, u()) & 2)) {
              err('touch: cannot touch \'' + x + '\': Permission denied');
              expliquerRefus(chemin, a.io);
              ok = false;
              return;
            }
            r.n.m = Date.now();
            return;
          }
          var e = S.ecrire(chemin, '', u(), false);
          if (e) {
            err('touch: cannot touch \'' + x + '\': ' + msg(e));
            if (e === 'EACCES') expliquerRefus(chemin, a.io);
            ok = false;
          }
        });
        return ok;
      },
      cp: function (a) {
        if (a.args.length < 2) {
          err(a.args.length ? 'cp: missing destination file operand after \'' + a.args[0] + '\'' : 'cp: missing file operand');
          aide('cp attend deux arguments : la source puis la destination.');
          return false;
        }
        var dest = abs(a.args[a.args.length - 1]);
        var destN = S.noeud(dest);
        var ok = true;
        a.args.slice(0, -1).forEach(function (src) {
          var s = abs(src);
          var cible = destN && destN.t === 'd' ? dest + '/' + S.nomDe(s) : dest;
          var e = copier(s, cible, a.opts.r || a.opts.R || a.opts.a, a.io);
          if (e === 'OMIT') {
            err('cp: -r not specified; omitting directory \'' + src + '\'');
            ok = false;
          } else if (e) {
            err(e === 'ENOENT' ? 'cp: cannot stat \'' + src + '\': No such file or directory' : 'cp: cannot create regular file \'' + a.args[a.args.length - 1] + '\': ' + msg(e));
            if (e === 'EACCES') expliquerRefus(cible, a.io);
            ok = false;
          }
        });
        return ok;
      },
      mv: function (a) {
        if (a.args.length < 2) {
          err(a.args.length ? 'mv: missing destination file operand after \'' + a.args[0] + '\'' : 'mv: missing file operand');
          aide('mv attend deux arguments : la source puis la destination. Ex. : mv ancien.txt nouveau.txt');
          return false;
        }
        var destArg = a.args[a.args.length - 1];
        var dest = abs(destArg);
        var destN = S.noeud(dest);
        if (a.args.length > 2 && !(destN && destN.t === 'd')) {
          err('mv: target \'' + destArg + '\' is not a directory');
          return false;
        }
        var ok = true;
        a.args.slice(0, -1).forEach(function (src) {
          var s = abs(src);
          var n = S.noeud(s, false);
          if (!n) {
            err('mv: cannot stat \'' + src + '\': No such file or directory');
            ok = false;
            return;
          }
          var cible = destN && destN.t === 'd' ? dest + '/' + S.nomDe(s) : dest;
          if (cible === s) {
            err('mv: \'' + src + '\' and \'' + destArg + '\' are the same file');
            ok = false;
            return;
          }
          if ((cible + '/').indexOf(s + '/') === 0) {
            err('mv: cannot move \'' + src + '\' to a subdirectory of itself');
            ok = false;
            return;
          }
          var ps = S.acceder(S.dossierDe(s), u());
          var pd = S.acceder(S.dossierDe(cible), u());
          if (!pd.n || pd.n.t !== 'd') {
            err('mv: cannot move \'' + src + '\' to \'' + destArg + '\': No such file or directory');
            ok = false;
            return;
          }
          if (!ps.n || (S.droits(ps.n, u()) & 3) !== 3 || (S.droits(pd.n, u()) & 3) !== 3) {
            err('mv: cannot move \'' + src + '\' to \'' + destArg + '\': Permission denied');
            expliquerRefus(cible, a.io);
            ok = false;
            return;
          }
          delete ps.n.c[S.nomDe(s)];
          pd.n.c[S.nomDe(cible)] = n;
        });
        return ok;
      },
      rm: function (a) {
        if (!a.args.length) {
          err('rm: missing operand');
          return false;
        }
        var ok = true;
        var aConfirmer = [];
        a.args.forEach(function (x) {
          var chemin = abs(x);
          var n = S.noeud(chemin, false);
          if (chemin === '/' || chemin === S.home() || /^\/(etc|usr|var|bin|root|home)$/.test(chemin)) {
            err('rm: refusing to remove \'' + x + '\'');
            aide('Ce terminal t\'empêche de supprimer un dossier système ou ton dossier personnel. Un vrai terminal, lui, ne te protège pas toujours !');
            ok = false;
            return;
          }
          if (!n) {
            if (!a.opts.f) {
              err('rm: cannot remove \'' + x + '\': No such file or directory');
              ok = false;
            }
            return;
          }
          if (n.t === 'd' && !a.opts.r && !a.opts.R) {
            err('rm: cannot remove \'' + x + '\': Is a directory');
            aide('Pour supprimer un dossier et tout son contenu : rm -r ' + x + ' (à utiliser avec grande prudence).');
            ok = false;
            return;
          }
          if (u() !== 'root' && n.t === 'f' && !(S.droits(n, u()) & 2) && !a.opts.f) aConfirmer.push({ x: x, chemin: chemin });
          else supprimerUn(x, chemin);
        });
        function supprimerUn(x, chemin) {
          var e = S.supprimer(chemin, u());
          if (e) {
            err('rm: cannot remove \'' + x + '\': ' + msg(e));
            if (e === 'EACCES') expliquerRefus(chemin, a.io);
            ok = false;
          }
        }
        function verifierCwd() {
          if (!S.noeud(cwd())) {
            S.session().cwd = S.home();
            out('(ton dossier courant a été supprimé : retour dans ~)', 't-dim');
          }
        }
        if (!aConfirmer.length) {
          verifierCwd();
          return ok;
        }
        (function suivant(i) {
          if (i >= aConfirmer.length) {
            verifierCwd();
            a.io.fin(ok);
            return;
          }
          demander('rm: remove write-protected regular file \'' + aConfirmer[i].x + '\'? ', false, function (rep) {
            if (/^[yYoO]/.test(rep.trim())) supprimerUn(aConfirmer[i].x, aConfirmer[i].chemin);
            suivant(i + 1);
          });
        })(0);
        return ATTENTE;
      },
      ln: function (a) {
        if (!a.opts.s || a.args.length < 2) {
          err('ln: missing file operand');
          aide('Pour créer un lien symbolique : ln -s cible nom_du_lien');
          return false;
        }
        var lien = abs(a.args[1]);
        var d = S.noeud(lien);
        if (d && d.t === 'd') lien = lien + '/' + S.nomDe(a.args[0]);
        var p = S.acceder(S.dossierDe(lien), u());
        if (!p.n || p.n.t !== 'd') {
          err('ln: failed to create symbolic link \'' + a.args[1] + '\': No such file or directory');
          return false;
        }
        if ((S.droits(p.n, u()) & 3) !== 3) {
          err('ln: failed to create symbolic link \'' + a.args[1] + '\': Permission denied');
          expliquerRefus(lien, a.io);
          return false;
        }
        if (p.n.c[S.nomDe(lien)]) {
          err('ln: failed to create symbolic link \'' + a.args[1] + '\': File exists');
          return false;
        }
        var l = S.L(a.args[0]);
        l.o = u();
        l.g = S.groupePrincipal(u());
        p.n.c[S.nomDe(lien)] = l;
        return true;
      },
      chmod: function (a) {
        if (a.args.length < 2) {
          err('chmod: missing operand');
          aide('Syntaxe : chmod 755 dossier (ou chmod o+x dossier)');
          return false;
        }
        var mode = a.args[0];
        var octal = /^[0-7]{3,4}$/.test(mode);
        var symb = /^([ugoa]*[+\-=][rwxX]*)(,[ugoa]*[+\-=][rwxX]*)*$/.test(mode);
        if (!octal && !symb) {
          err('chmod: invalid mode: ‘' + mode + '’');
          aide('Le mode s\'écrit avec trois chiffres de 0 à 7 (ex. 755) ou sous forme u+x, o+x, go-w...');
          return false;
        }
        var ok = true;
        a.args.slice(1).forEach(function (x) {
          var chemin = abs(x);
          var r = S.acceder(chemin, u());
          if (!r.n) {
            err('chmod: cannot access \'' + x + '\': ' + msg(r.erreur === 'EACCES' ? 'EACCES' : 'ENOENT'));
            ok = false;
            return;
          }
          var cibles = [];
          if (a.opts.R) parcourir(r.n, function (n) {
            cibles.push(n);
          });
          else cibles.push(r.n);
          if (u() !== 'root' && r.n.o !== u()) {
            err('chmod: changing permissions of \'' + x + '\': Operation not permitted');
            a.io.refus = chemin;
            aide('Seul le propriétaire (' + r.n.o + ') ou root peut changer les droits de ' + x + '.');
            ok = false;
            return;
          }
          cibles.forEach(function (n) {
            if (n.t !== 'l') changerDroits(n, mode);
          });
        });
        return ok;
      },
      chown: function (a) {
        if (a.args.length < 2) {
          err(a.args.length ? 'chown: missing operand after \'' + a.args[0] + '\'' : 'chown: missing operand');
          aide('Syntaxe : chown utilisateur:groupe chemin');
          return false;
        }
        var spec = a.args[0];
        var m = /^([^:.]*)(?:[:.]([^:]*))?$/.exec(spec);
        var user = m ? m[1] : '';
        var groupe = m && m[2] !== undefined ? m[2] : null;
        if (user && !S.existeCompte(user)) {
          err('chown: invalid user: ‘' + spec + '’');
          aide('Le compte « ' + user + ' » n\'existe pas sur ce serveur (crée-le avec adduser, ou vérifie l\'orthographe).');
          return false;
        }
        if (groupe === '' && user) groupe = S.groupePrincipal(user);
        if (groupe && !S.existeGroupe(groupe)) {
          err('chown: invalid group: ‘' + spec + '’');
          return false;
        }
        var ok = true;
        a.args.slice(1).forEach(function (x) {
          var chemin = abs(x);
          var r = S.acceder(chemin, u());
          if (!r.n) {
            err('chown: cannot access \'' + x + '\': ' + msg(r.erreur === 'EACCES' ? 'EACCES' : 'ENOENT'));
            ok = false;
            return;
          }
          if (u() !== 'root') {
            err('chown: changing ownership of \'' + x + '\': Operation not permitted');
            a.io.refus = chemin;
            aide('Seul root peut changer le propriétaire d\'un fichier : tape exit pour revenir au compte root.');
            ok = false;
            return;
          }
          var cibles = [];
          if (a.opts.R) parcourir(r.n, function (n) {
            cibles.push(n);
          });
          else cibles.push(r.n);
          cibles.forEach(function (n) {
            if (user) n.o = user;
            if (groupe) n.g = groupe;
          });
        });
        return ok;
      },
      cat: function (a) {
        if (!a.args.length) {
          if (a.io.entree !== null) {
            lignesDe(a.io.entree).forEach(function (l) {
              a.io.out(l);
            });
            return true;
          }
          aide('cat sans fichier attend du texte au clavier : ce n\'est pas simulé ici. Pour écrire dans un fichier, utilise nano.');
          return true;
        }
        var ok = true;
        a.args.forEach(function (x) {
          var txt = lireFichier(x, 'cat', a.io);
          if (txt === null) ok = false;
          else lignesDe(txt).forEach(function (l) {
            a.io.out(l);
          });
        });
        return ok;
      },
      head: function (a) {
        return tailHead(a, true);
      },
      tail: function (a) {
        return tailHead(a, false);
      },
      grep: grep,
      wc: function (a) {
        var sources = a.args.length ? a.args : [null];
        var ok = true;
        sources.forEach(function (x) {
          var txt = x === null ? a.io.entree || '' : lireFichier(x, 'wc', a.io);
          if (txt === null) {
            ok = false;
            return;
          }
          var nl = (txt.match(/\n/g) || []).length;
          var res = a.opts.l ? String(nl) : nl + ' ' + (txt.trim() ? txt.trim().split(/\s+/).length : 0) + ' ' + S.octets(txt);
          a.io.out(res + (x ? ' ' + x : ''));
        });
        return ok;
      },
      nano: function (a) {
        ouvrirNano(a.args[0] || null, a);
        return ATTENTE;
      },
      tree: function (a) {
        var arg = a.args[0];
        var r = S.acceder(abs(arg), u());
        if (!r.n || r.n.t !== 'd') {
          err((arg || '.') + '  [error opening dir]');
          return false;
        }
        var nd = 0;
        var nf = 0;
        a.io.html('<span class="t-dir">' + esc(arg || '.') + '</span>', arg || '.');
        (function rec(d, pref) {
          var noms = Object.keys(d.c).filter(function (x) {
            return x.charAt(0) !== '.';
          }).sort();
          noms.forEach(function (x, i) {
            var der = i === noms.length - 1;
            var n = d.c[x];
            if (n.t === 'd') nd++;
            else nf++;
            a.io.html(esc(pref + (der ? '└── ' : '├── ')) + nomHtml(x, n) + (n.t === 'l' ? ' -> ' + esc(n.cible) : ''), pref + (der ? '└── ' : '├── ') + x);
            if (n.t === 'd' && (S.droits(n, u()) & 5) === 5) rec(n, pref + (der ? '    ' : '│   '));
          });
        })(r.n, '');
        a.io.out('');
        a.io.out(nd + ' director' + (nd > 1 ? 'ies' : 'y') + ', ' + nf + ' file' + (nf > 1 ? 's' : ''));
        return true;
      },
      apt: apt,
      'apt-get': apt,
      systemctl: function (a) {
        return service(a, a.args[0], a.args[1]);
      },
      service: function (a) {
        if (!a.args[0]) {
          err('Usage: service < option > | --status-all | [ service_name [ command | --full-restart ] ]');
          return false;
        }
        if (!a.args[1]) {
          err('Usage: service < option > | --status-all | [ service_name [ command | --full-restart ] ]');
          aide('Exemple : service apache2 reload');
          return false;
        }
        return service(a, a.args[1], a.args[0]);
      },
      journalctl: function (a) {
        var unit = unite(a.opts.u && a.opts.u !== true ? a.opts.u : a.args[0]);
        if (unit !== 'apache2' || !S.etat.apache.installe) {
          a.io.out('-- No entries --');
          return true;
        }
        (S.etat.apache.journal || []).forEach(function (l) {
          a.io.out(l);
        });
        return true;
      },
      apachectl: apachectl,
      apache2ctl: apachectl,
      apache2: function () {
        err('[core:warn] [pid ' + S.etat.apache.pid + '] AH00111: Config variable ${APACHE_RUN_DIR} is not defined');
        aide('On ne lance pas apache2 directement : passe par systemctl start|restart|reload apache2.');
        return false;
      },
      a2enconf: function (a) {
        return a2(a, 'conf', true);
      },
      a2disconf: function (a) {
        return a2(a, 'conf', false);
      },
      a2ensite: function (a) {
        return a2(a, 'site', true);
      },
      a2dissite: function (a) {
        return a2(a, 'site', false);
      },
      a2enmod: function (a) {
        return a2(a, 'mod', true);
      },
      a2dismod: function (a) {
        return a2(a, 'mod', false);
      },
      htpasswd: htpasswd,
      curl: curl,
      adduser: adduser,
      useradd: function (a) {
        if (!exigeRoot(a, 'useradd: Permission denied.')) return false;
        var nom = a.args[0];
        if (!nom) {
          err('Usage: useradd [options] LOGIN');
          return false;
        }
        if (S.existeCompte(nom)) {
          err('useradd: user \'' + nom + '\' already exists');
          return false;
        }
        nouvelUtilisateur(nom, !!a.opts.m);
        aide('Sous Ubuntu, préfère adduser : il crée aussi le dossier personnel et demande un mot de passe.');
        return true;
      },
      passwd: function (a) {
        var nom = a.args[0] || u();
        if (!S.existeCompte(nom)) {
          err('passwd: user \'' + nom + '\' does not exist');
          return false;
        }
        if (nom !== u() && u() !== 'root') {
          err('passwd: You may not view or modify password information for ' + nom + '.');
          return false;
        }
        saisirMotDePasse(function (mdp) {
          S.etat.users[nom].mdp = S.hacher(mdp);
          out('passwd: password updated successfully');
          a.io.fin(true);
        });
        return ATTENTE;
      },
      su: su,
      ss: function (a) {
        var actif = S.etat.apache.etat === 'actif';
        var p = a.opts.p && u() === 'root';
        a.io.out('State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process');
        a.io.out('LISTEN 0      4096   127.0.0.53%lo:53        0.0.0.0:*    ' + (p ? 'users:(("systemd-resolve",pid=512,fd=15))' : ''));
        a.io.out('LISTEN 0      4096         0.0.0.0:22        0.0.0.0:*    ' + (p ? 'users:(("sshd",pid=801,fd=3))' : ''));
        if (actif) a.io.out('LISTEN 0      511                *:80              *:*    ' + (p ? 'users:(("apache2",pid=' + (S.etat.apache.pid + 2) + ',fd=4),("apache2",pid=' + S.etat.apache.pid + ',fd=4))' : ''));
        return true;
      },
      ps: function (a) {
        var ap = S.etat.apache;
        a.io.out('USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND');
        a.io.out('root           1  0.0  0.3  22072 13180 ?        Ss   10:02   0:01 /sbin/init');
        a.io.out('root         801  0.0  0.2  12020  7916 ?        Ss   10:02   0:00 sshd: /usr/sbin/sshd -D');
        if (ap.etat === 'actif') {
          a.io.out('root        ' + ap.pid + '  0.0  0.1   6604  4560 ?        Ss   10:12   0:00 /usr/sbin/apache2 -k start');
          a.io.out('www-data    ' + (ap.pid + 2) + '  0.0  0.1 1997988 4516 ?        Sl   10:12   0:00 /usr/sbin/apache2 -k start');
          a.io.out('www-data    ' + (ap.pid + 3) + '  0.0  0.1 1997988 4516 ?        Sl   10:12   0:00 /usr/sbin/apache2 -k start');
        }
        a.io.out(u().padEnd(8) + '    ' + (9000 + S.etat.hist.length) + '  0.0  0.0   9476  3964 pts/0    R+   10:42   0:00 ps aux');
        return true;
      },
      which: function (a) {
        var ok = true;
        a.args.forEach(function (x) {
          var n = S.noeud('/usr/bin/' + x) ? '/usr/bin/' + x : S.noeud('/usr/sbin/' + x) ? '/usr/sbin/' + x : null;
          if (n) a.io.out(n);
          else ok = false;
        });
        return ok;
      },
      man: function (a) {
        aide('Le manuel (man ' + (a.args[0] || '') + ') n\'est pas simulé ici : consulte la page Mémo du TP.');
        return true;
      },
      less: function (a) {
        aide('Dans un vrai terminal, less affiche page par page (q pour quitter). Ici, le contenu s\'affiche d\'un coup.');
        return COMMANDES.cat(a);
      },
      more: function (a) {
        return COMMANDES.cat(a);
      },
      vi: function () {
        aide('vi / vim ne sont pas simulés : utilise nano, plus simple pour débuter.');
        return false;
      },
      wget: function () {
        err('wget: command not found');
        aide('Utilise curl pour interroger ton serveur : curl localhost');
        return false;
      },
      ip: function (a) {
        a.io.out('2: ens3: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000');
        a.io.out('    inet ' + S.IP_MACHINE + '/24 metric 100 brd 172.30.1.255 scope global dynamic ens3');
        return true;
      }
    };
    COMMANDES.logout = COMMANDES.exit;
    COMMANDES.vim = COMMANDES.vi;
    COMMANDES.netstat = COMMANDES.ss;

    // ---------- Exécution ----------

    function executerUne(etape, io, fin) {
      var mots = [];
      etape.mots.forEach(function (tk) {
        mots = mots.concat(etendre(tk));
      });
      if (etape.entree !== null && etape.entree !== undefined) {
        var txt = lireFichier(etape.entree, shell(), io);
        if (txt === null) return fin(false);
        io.entree = txt;
      }
      if (!mots.length) return fin(true);
      // Alias définis dans le .bashrc d'Ubuntu.
      var ALIAS = { ll: ['ls', '-alF'], la: ['ls', '-A'], l: ['ls', '-CF'] };
      if (ALIAS[mots[0]]) mots = ALIAS[mots[0]].concat(mots.slice(1));
      var cmd = mots[0];

      if (cmd === 'sudo') {
        var reste = mots.slice(1);
        while (reste.length && /^-/.test(reste[0])) reste.shift();
        if (!reste.length) {
          err('usage: sudo -h | -K | -k | -V');
          return fin(false);
        }
        if (u() === 'root') return executerUne({ mots: reste.map(function (m) {
          return { v: m };
        }), entree: null }, io, fin);
        courante = { io: io };
        io.fin = function (ok) {
          S.evenement({ source: 'terminal', cmd: 'sudo', args: reste, opts: {}, ok: ok, refus: 'sudo' });
          fin(ok);
        };
        demander('[sudo] password for ' + u() + ': ', true, function () {
          err(u() + ' is not in the sudoers file.');
          aide(u() + ' n\'a pas le droit d\'utiliser sudo sur ce serveur : tape exit pour revenir au compte root.');
          io.fin(false);
        });
        return;
      }

      var paquet = PAQUET[cmd];
      var f = COMMANDES[cmd];
      if (f && paquet && !S.etat.paquets[paquet]) f = null;
      if (!f) {
        if (paquet) {
          err('Command \'' + cmd + '\' not found, but can be installed with:');
          err('apt install ' + paquet);
          if (paquet !== 'tree') aide('Cette commande arrive avec Apache : installe d\'abord apache2 (page Installation).');
        } else {
          err(shell() + ': ' + cmd + ': command not found');
          if (EQUIV[cmd.toLowerCase()]) aide('« ' + cmd + ' » est une commande Windows. Sous Linux, on écrit : ' + EQUIV[cmd.toLowerCase()]);
          else if (COMMANDES[cmd.toLowerCase()]) aide('Les commandes s\'écrivent en minuscules : ' + cmd.toLowerCase());
          else if (cmd === 'll') aide('Essaie ls -l');
          else aide('Commande inconnue (ou non simulée ici). Tape help pour la liste.');
        }
        S.evenement({ source: 'terminal', cmd: cmd, args: mots.slice(1), opts: {}, ok: false });
        return fin(false);
      }

      var opts = {};
      var args = [];
      var finOptions = false;
      var avecValeur = AVEC_VALEUR[cmd] || '';
      for (var k = 1; k < mots.length; k++) {
        var m = mots[k];
        if (!finOptions && m === '--') {
          finOptions = true;
          continue;
        }
        if (!finOptions && /^--[a-z][a-z-]*(=.*)?$/.test(m) && cmd !== 'echo') {
          var p = m.slice(2).split('=');
          opts[p[0]] = p.length > 1 ? p.slice(1).join('=') : true;
          continue;
        }
        if (finOptions || cmd === 'echo' || !/^-[a-zA-Z]+$/.test(m) || cmd === 'chmod' && !args.length && /^-[rwxX]+$/.test(m)) {
          args.push(m);
          continue;
        }
        for (var q = 1; q < m.length; q++) {
          var l = m.charAt(q);
          if (avecValeur.indexOf(l) !== -1) {
            opts[l] = m.slice(q + 1) || mots[++k];
            break;
          }
          opts[l] = true;
        }
      }
      if (cmd === 'cd' && mots[1] === '-') args = ['-'];
      var a = { cmd: cmd, args: args, opts: opts, mots: mots.slice(1), io: io };
      courante = a;
      var fini = false;
      io.fin = function (ok) {
        if (fini) return;
        fini = true;
        // « mv a mv a b » : le nom de la commande recopié dans ses arguments.
        if (['echo', 'help', 'grep'].indexOf(cmd) === -1 && args.indexOf(cmd) !== -1) {
          aide('Le mot « ' + cmd + ' » apparaît aussi dans les arguments : tu l\'as peut-être tapé deux fois. Le nom de la commande ne s\'écrit qu\'une fois, au début.');
        }
        S.evenement({ source: 'terminal', cmd: cmd, args: args, opts: opts, ok: ok, refus: io.refus, requete: io.requete });
        fin(ok);
      };
      var r;
      try {
        r = f(a);
      } catch (e) {
        err(cmd + ': erreur de simulation (' + e.message + ')');
        r = false;
      }
      if (r !== ATTENTE) io.fin(r !== false);
    }

    function redirection(redir, io) {
      var chemin = abs(redir.cible);
      if (chemin === '/dev/null') return true;
      var contenu = io.buffer.length ? io.buffer.join('\n') + (io.sansSaut ? '' : '\n') : '';
      var e = S.ecrire(chemin, contenu, u(), redir.mode === '>>');
      if (e) {
        err(shell() + ': ' + redir.cible + ': ' + msg(e));
        if (e === 'EACCES') expliquerRefus(chemin, io);
        S.evenement({ source: 'terminal', cmd: '>', args: [redir.cible], opts: {}, ok: false, refus: io.refus });
        return false;
      }
      S.evenement({ source: 'terminal', cmd: '>', args: [redir.cible], opts: {}, ok: true });
      return true;
    }

    function lancerEtapes(etapes, suite) {
      var entree = null;
      (function etape(j) {
        var e = etapes[j];
        var dernier = j === etapes.length - 1;
        var io = creerIO(!dernier || !!e.redir, entree);
        executerUne(e, io, function (ok) {
          if (e.redir) ok = redirection(e.redir, io) && ok;
          if (dernier || interrompu) return suite(ok);
          entree = io.buffer.length ? io.buffer.join('\n') + '\n' : '';
          etape(j + 1);
        });
      })(0);
    }

    function lancerListe(liste, i, ok) {
      if (i >= liste.length || interrompu) return finLigne();
      if (i > 0) {
        var sep = liste[i - 1].sep;
        if (sep === '&&' && !ok || sep === '||' && ok) return lancerListe(liste, i + 1, ok);
      }
      lancerEtapes(liste[i].etapes, function (ok2) {
        lancerListe(liste, i + 1, ok2);
      });
    }

    function finLigne() {
      occupe = false;
      courante = null;
      attente = null;
      input.type = 'text';
      majPrompt();
      S.sauver();
      defiler();
    }

    function executer(ligne) {
      ajouter(promptHtml() + esc(ligne));
      if (ligne.trim()) {
        S.etat.hist.push(ligne);
        S.etat.hist = S.etat.hist.slice(-100);
      }
      var analyse = analyserLigne(ligne);
      if (analyse.erreur) {
        err(shell() + ': ' + analyse.erreur);
        if (/matching/.test(analyse.erreur)) aide('Il manque un guillemet fermant dans ta commande.');
        finLigne();
        return;
      }
      if (!analyse.liste.length) {
        finLigne();
        return;
      }
      occupe = true;
      interrompu = false;
      promptEl.textContent = '';
      lancerListe(analyse.liste, 0, true);
      defiler();
    }

    // ---------- Missions ----------

    S.on('mission', function (d) {
      out('✔ ' + (d.mission.bravo || 'Étape validée'), 't-ok');
      defiler();
    });
    S.on('missions-finies', function () {
      out('🎉 Toutes les actions de cette partie sont réussies. Refais-les maintenant dans Killercoda pour le livrable !', 't-ok');
      defiler();
    });

    // ---------- Éditeur nano ----------

    var nanoEl = el.querySelector('.nano');
    var nanoTexte = nanoEl.querySelector('.nano-texte');
    var nanoFichier = nanoEl.querySelector('.nano-fichier');
    var nanoModif = nanoEl.querySelector('.nano-modif');
    var nanoStatut = nanoEl.querySelector('.nano-statut');
    var nanoQuestion = nanoEl.querySelector('.nano-question');
    var nanoQLabel = nanoQuestion.querySelector('span');
    var nanoQInput = nanoQuestion.querySelector('input');
    var ed = null;

    function nbLignes(t) {
      if (!t) return 0;
      return t.split('\n').length - (/\n$/.test(t) ? 1 : 0);
    }

    function ouvrirNano(nomArg, a) {
      var chemin = nomArg ? abs(nomArg) : null;
      var contenu = '';
      var message = '';
      if (chemin) {
        var r = S.acceder(chemin, u());
        if (r.n) {
          if (r.n.t === 'd') message = '[ "' + nomArg + '" is a directory ]';
          else if (!(S.droits(r.n, u()) & 4)) message = '[ Error reading ' + nomArg + ': Permission denied ]';
          else {
            contenu = r.n.txt;
            message = '[ Read ' + nbLignes(contenu) + ' line' + (nbLignes(contenu) > 1 ? 's' : '') + ' ]';
          }
        } else if (r.erreur === 'EACCES') {
          message = '[ Error reading ' + nomArg + ': Permission denied ]';
        } else {
          var p = S.noeud(S.dossierDe(chemin));
          message = p && p.t === 'd' ? '[ New File ]' : '[ Directory \'' + S.dossierDe(chemin) + '\' does not exist ]';
        }
      } else message = '[ New Buffer ]';
      ed = { nom: nomArg, a: a, modifie: false, coupe: '', mode: null };
      nanoFichier.textContent = nomArg || 'New Buffer';
      nanoTexte.value = contenu.replace(/\n$/, '');
      nanoStatut.textContent = message;
      nanoQuestion.hidden = true;
      majModif();
      ecran.hidden = true;
      nanoEl.hidden = false;
      aideBas.innerHTML = '<kbd>Ctrl</kbd>+<kbd>O</kbd> enregistrer · <kbd>Ctrl</kbd>+<kbd>X</kbd> quitter · <kbd>Ctrl</kbd>+<kbd>K</kbd> couper la ligne · <kbd>Ctrl</kbd>+<kbd>U</kbd> coller (ou les boutons ci-dessus)';
      nanoTexte.focus();
      nanoTexte.setSelectionRange(0, 0);
      nanoTexte.scrollTop = 0;
    }

    function majModif() {
      nanoModif.textContent = ed && ed.modifie ? 'Modified' : '';
    }

    function nanoEcrire(nom) {
      if (!nom) {
        nanoStatut.textContent = '[ Cancelled ]';
        return false;
      }
      var chemin = abs(nom);
      var contenu = nanoTexte.value;
      if (contenu && !/\n$/.test(contenu)) contenu += '\n';
      var e = S.ecrire(chemin, contenu, u(), false);
      if (e) {
        nanoStatut.textContent = '[ Error writing ' + nom + ': ' + msg(e) + ' ]';
        if (e === 'EACCES') ed.a.io.refus = chemin;
        S.evenement({ source: 'terminal', cmd: 'nano', args: [nom], opts: {}, ok: false, refus: e === 'EACCES' ? chemin : null });
        return false;
      }
      ed.nom = nom;
      nanoFichier.textContent = nom;
      ed.modifie = false;
      majModif();
      nanoStatut.textContent = '[ Wrote ' + nbLignes(contenu) + ' line' + (nbLignes(contenu) > 1 ? 's' : '') + ' ]';
      S.evenement({ source: 'terminal', cmd: 'nano', args: [nom], opts: {}, ok: true });
      S.sauver();
      return true;
    }

    function poser(question, valeur, mode) {
      ed.mode = mode;
      nanoQLabel.textContent = question;
      nanoQInput.value = valeur || '';
      nanoQuestion.hidden = false;
      nanoQInput.focus();
    }
    function fermerQuestion() {
      ed.mode = null;
      nanoQuestion.hidden = true;
      nanoTexte.focus();
    }

    function fermerNano() {
      var a = ed.a;
      var refus = a.io.refus;
      ed = null;
      nanoEl.hidden = true;
      ecran.hidden = false;
      aideBas.innerHTML = AIDE_BAS;
      a.io.refus = refus;
      input.focus();
      a.io.fin(true);
    }

    function nanoAction(action) {
      if (!ed) return;
      if (action === 'ecrire') poser('File Name to Write: ', ed.nom || '', 'ecrire');
      else if (action === 'quitter') {
        if (ed.modifie) poser('Save modified buffer?  Y Yes  N No  ^C Cancel ', '', 'quitter');
        else fermerNano();
      } else if (action === 'couper') {
        var v = nanoTexte.value;
        var pos = nanoTexte.selectionStart;
        var debut = v.lastIndexOf('\n', pos - 1) + 1;
        var fin = v.indexOf('\n', pos);
        fin = fin === -1 ? v.length : fin + 1;
        ed.coupe = v.slice(debut, fin);
        if (ed.coupe && !/\n$/.test(ed.coupe)) ed.coupe += '\n';
        nanoTexte.value = v.slice(0, debut) + v.slice(fin);
        nanoTexte.setSelectionRange(debut, debut);
        ed.modifie = true;
        majModif();
      } else if (action === 'coller') {
        var w = nanoTexte.value;
        var pc = nanoTexte.selectionStart;
        var deb = w.lastIndexOf('\n', pc - 1) + 1;
        nanoTexte.value = w.slice(0, deb) + ed.coupe + w.slice(deb);
        nanoTexte.setSelectionRange(deb + ed.coupe.length, deb + ed.coupe.length);
        ed.modifie = true;
        majModif();
      }
      if (action === 'couper' || action === 'coller') nanoTexte.focus();
    }

    nanoEl.querySelectorAll('[data-nano]').forEach(function (b) {
      b.addEventListener('click', function () {
        nanoAction(b.getAttribute('data-nano'));
      });
    });

    nanoTexte.addEventListener('input', function () {
      if (ed && !ed.modifie) {
        ed.modifie = true;
        majModif();
      }
    });
    nanoTexte.addEventListener('keydown', function (evt) {
      if (!ed) return;
      var k = evt.key.toLowerCase();
      if (evt.ctrlKey && !evt.metaKey && !evt.altKey) {
        var actions = { o: 'ecrire', x: 'quitter', k: 'couper', u: 'coller' };
        if (actions[k]) {
          evt.preventDefault();
          nanoAction(actions[k]);
          return;
        }
        if (k === 's') {
          evt.preventDefault();
          if (ed.nom) nanoEcrire(ed.nom);
          else poser('File Name to Write: ', '', 'ecrire');
          return;
        }
      }
      if (evt.key === 'Tab') {
        evt.preventDefault();
        var s = nanoTexte.selectionStart;
        nanoTexte.setRangeText('\t', s, nanoTexte.selectionEnd, 'end');
        ed.modifie = true;
        majModif();
      }
    });
    nanoQInput.addEventListener('keydown', function (evt) {
      if (!ed || !ed.mode) return;
      var annuler = evt.key === 'Escape' || evt.ctrlKey && evt.key.toLowerCase() === 'c';
      if (annuler) {
        evt.preventDefault();
        nanoStatut.textContent = '[ Cancelled ]';
        fermerQuestion();
        return;
      }
      if (ed.mode === 'quitter') {
        evt.preventDefault();
        if (/^[yo]$/i.test(evt.key)) poser('File Name to Write: ', ed.nom || '', 'ecrire-quitter');
        else if (/^n$/i.test(evt.key)) fermerNano();
        return;
      }
      if (evt.key === 'Enter') {
        evt.preventDefault();
        var mode = ed.mode;
        var ok = nanoEcrire(nanoQInput.value.trim());
        fermerQuestion();
        if (ok && mode === 'ecrire-quitter') fermerNano();
      }
    });

    // ---------- Clavier ----------

    function completer() {
      var val = input.value;
      var mots = val.split(/\s+/);
      var dernier = mots[mots.length - 1];
      if (mots.length === 1) {
        var cmds = Object.keys(COMMANDES).filter(function (c) {
          return c.indexOf(dernier) === 0 && (!PAQUET[c] || S.etat.paquets[PAQUET[c]]);
        });
        if (cmds.length === 1) input.value = cmds[0] + ' ';
        return;
      }
      var coupe = dernier.lastIndexOf('/');
      var dirPart = coupe >= 0 ? dernier.slice(0, coupe + 1) : '';
      var debut = dernier.slice(coupe + 1);
      var d = S.acceder(abs(dirPart || '.'), u());
      if (!d.n || d.n.t !== 'd' || !(S.droits(d.n, u()) & 4)) return;
      var cands = Object.keys(d.n.c).filter(function (x) {
        return x.indexOf(debut) === 0 && (debut.charAt(0) === '.' || x.charAt(0) !== '.');
      });
      if (cands.length === 1) {
        var n = d.n.c[cands[0]];
        var estDossier = n.t === 'd' || n.t === 'l' && (S.noeud(abs(dirPart + cands[0])) || {}).t === 'd';
        mots[mots.length - 1] = dirPart + cands[0] + (estDossier ? '/' : ' ');
        input.value = mots.join(' ');
      } else if (cands.length > 1) {
        var commun = cands.reduce(function (acc, x) {
          var i = 0;
          while (i < acc.length && acc.charAt(i) === x.charAt(i)) i++;
          return acc.slice(0, i);
        });
        if (commun.length > debut.length) {
          mots[mots.length - 1] = dirPart + commun;
          input.value = mots.join(' ');
          return;
        }
        ajouter(promptHtml() + esc(val));
        ajouter(cands.map(function (x) {
          return nomHtml(x, d.n.c[x]);
        }).join('  '));
        defiler();
      }
    }

    function ctrlC() {
      if (suiviCourant) {
        arreterSuivi();
        return;
      }
      if (attente) {
        var q = attente;
        attente = null;
        input.type = 'text';
        ajouter(esc(q.question) + '^C');
        interrompu = true;
        if (courante && courante.io && courante.io.fin) courante.io.fin(false);
        else finLigne();
        return;
      }
      ajouter(promptHtml() + esc(input.value) + '^C');
      input.value = '';
      defiler();
    }

    input.addEventListener('keydown', function (evt) {
      if (evt.key === 'c' && evt.ctrlKey && !window.getSelection().toString()) {
        evt.preventDefault();
        ctrlC();
        return;
      }
      if (evt.key === 'Enter') {
        var v = input.value;
        input.value = '';
        posHist = null;
        if (attente) {
          var q = attente;
          attente = null;
          input.type = 'text';
          ajouter(esc(q.question) + (q.masque ? '' : esc(v)));
          promptEl.textContent = '';
          q.rappel(v);
          defiler();
          return;
        }
        if (suiviCourant) {
          ajouter(esc(v));
          defiler();
          return;
        }
        if (occupe) return;
        executer(v);
        return;
      }
      if (attente || occupe) return;
      if (evt.key === 'ArrowUp' || evt.key === 'ArrowDown') {
        var hist = S.etat.hist;
        if (!hist.length) return;
        evt.preventDefault();
        if (posHist === null) posHist = hist.length;
        posHist += evt.key === 'ArrowUp' ? -1 : 1;
        posHist = Math.max(0, Math.min(hist.length, posHist));
        input.value = hist[posHist] || '';
      } else if (evt.key === 'Tab') {
        evt.preventDefault();
        completer();
      } else if (evt.key === 'l' && evt.ctrlKey) {
        evt.preventDefault();
        COMMANDES.clear();
        S.sauver();
      }
    });

    btnCtrlC.addEventListener('click', function () {
      ctrlC();
      input.focus();
    });

    // ---------- Démarrage ----------

    function demarrer() {
      if (suiviCourant) {
        suiviCourant = null;
        S.suivi = null;
        btnCtrlC.hidden = true;
      }
      if (ed) {
        ed = null;
        nanoEl.hidden = true;
        ecran.hidden = false;
      }
      aideBas.innerHTML = AIDE_BAS;
      occupe = false;
      attente = null;
      courante = null;
      input.type = 'text';
      sortie.innerHTML = '';
      var anciennes = S.etat.lignes;
      S.etat.lignes = [];
      if (!anciennes.length) {
        out('Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-49-generic x86_64)', 't-dim');
        out('• Bac à sable Ubuntu (terminal d\'entraînement simulé) : rien n\'est installé sur ton ordinateur.', 't-dim');
        out('• La même machine est partagée par toutes les pages du TP. Tape help pour la liste des commandes.', 't-dim');
      } else {
        anciennes.forEach(function (l) {
          ajouter(l);
        });
      }
      if (options.exigeApache && !S.etat.apache.installe) {
        ajouter('<span class="t-aide">' + esc('⚠ Apache n\'est pas encore installé sur ce serveur : commence par la page Installation (apt update puis apt install apache2), ou tape ces commandes ici.') + '</span>', true);
      }
      majPrompt();
      defiler();
    }

    el.querySelector('[data-t="reset"]').addEventListener('click', function () {
      if (!window.confirm('Repartir d\'un serveur neuf ?\n\nTout ce qui a été installé et configuré sur ce serveur simulé (sur toutes les pages du TP) sera effacé, comme à la fin d\'une session Killercoda. Les actions réussies seront décochées.')) return;
      S.reinitialiser();
      input.focus();
    });

    S.on('reset', demarrer);

    demarrer();
    return { executer: executer, focus: function () {
      (ed ? nanoTexte : input).focus();
    } };
  }

  return { creer: creer };
})();
