// Serveur Ubuntu simulé (bac à sable Killercoda), partagé par toutes les
// pages du TP : système de fichiers avec propriétaires et permissions,
// comptes utilisateurs, paquets APT, service Apache et traitement des
// requêtes HTTP (navigateur simulé, curl). L'état est enregistré dans le
// navigateur (localStorage) : rien n'est envoyé nulle part.
//
// Comme sur un vrai serveur, Apache relit ses fichiers de configuration à
// chaque start, restart ou reload : modifier un .conf sans recharger le
// service ne change rien aux réponses.
//
// Missions : chaque page déclare une liste ordonnée de { id, bravo, test(ctx) }
// avec Serveur.definirMissions(liste). Le terminal et le navigateur signalent
// chaque action avec Serveur.evenement(ev) ; une mission n'est validée que si
// la précédente l'est déjà, et les éléments [data-mission="id"] de la page
// reçoivent alors la classe « faite ».

var Serveur = (function () {
  var CLE = 'serveur';
  var VERSION = 1;
  var SIGNATURE = 'Apache/2.4.58 (Ubuntu)';
  var IP_PROXY = '10.244.0.1'; // adresse vue par Apache pour le proxy Killercoda
  var IP_MACHINE = '172.30.1.2';
  var MOIS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var JOURS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // ---------- Événements ----------

  var ecouteurs = {};
  function on(type, fn) {
    (ecouteurs[type] = ecouteurs[type] || []).push(fn);
  }
  function emettre(type, d) {
    (ecouteurs[type] || []).forEach(function (fn) {
      try {
        fn(d);
      } catch (e) {
        if (window.console) console.error(e);
      }
    });
  }

  // ---------- Outils ----------

  function deux(n) {
    return String(n).padStart(2, '0');
  }
  function octets(txt) {
    try {
      return new TextEncoder().encode(txt).length;
    } catch (e) {
      return unescape(encodeURIComponent(txt)).length;
    }
  }
  function hasard(n, alphabet) {
    var s = '';
    var o = new Uint8Array(n);
    (window.crypto || window.msCrypto).getRandomValues(o);
    for (var i = 0; i < n; i++) s += alphabet.charAt(o[i] % alphabet.length);
    return s;
  }
  // Date au format des journaux Apache : 19/Nov/2026:10:42:07 +0000
  function dateLog(ts) {
    var d = new Date(ts || Date.now());
    return deux(d.getUTCDate()) + '/' + MOIS[d.getUTCMonth()] + '/' + d.getUTCFullYear() + ':' +
      deux(d.getUTCHours()) + ':' + deux(d.getUTCMinutes()) + ':' + deux(d.getUTCSeconds()) + ' +0000';
  }
  // Date du journal d'erreurs : Thu Nov 19 10:42:07.123456 2026
  function dateErreur(ts) {
    var d = new Date(ts || Date.now());
    return JOURS[d.getUTCDay()] + ' ' + MOIS[d.getUTCMonth()] + ' ' + deux(d.getUTCDate()) + ' ' +
      deux(d.getUTCHours()) + ':' + deux(d.getUTCMinutes()) + ':' + deux(d.getUTCSeconds()) + '.' +
      String(d.getUTCMilliseconds() * 1000 + 417).padStart(6, '0') + ' ' + d.getUTCFullYear();
  }
  // Date HTTP : Thu, 19 Nov 2026 10:42:07 GMT
  function dateHttp(ts) {
    return new Date(ts || Date.now()).toUTCString();
  }
  // Date de journald / systemctl status : Nov 19 10:42:07
  function dateJournal(ts) {
    var d = new Date(ts || Date.now());
    return MOIS[d.getUTCMonth()] + ' ' + deux(d.getUTCDate()) + ' ' + deux(d.getUTCHours()) + ':' +
      deux(d.getUTCMinutes()) + ':' + deux(d.getUTCSeconds());
  }

  // Empreinte « à la htpasswd » ($apr1$sel$empreinte). Ce n'est pas le vrai
  // MD5 d'Apache : il suffit ici que la même saisie redonne la même empreinte.
  var B64 = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  function empreinte(sel, mdp) {
    var s = '';
    var h = 0x811c9dc5;
    for (var tour = 0; s.length < 22; tour++) {
      var texte = sel + '$' + mdp + '$' + tour;
      for (var i = 0; i < texte.length; i++) {
        h ^= texte.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
      }
      for (var k = 0; k < 5 && s.length < 22; k++) {
        s += B64.charAt((h >>> (k * 6)) & 63);
      }
    }
    return '$apr1$' + sel + '$' + s;
  }
  function hacher(mdp) {
    return empreinte(hasard(8, B64), mdp);
  }
  function verifierMdp(hash, mdp) {
    var m = /^\$apr1\$([^$]+)\$/.exec(hash || '');
    return !!m && empreinte(m[1], mdp) === hash;
  }

  // ---------- Contenus par défaut ----------

  var OS_RELEASE =
    'PRETTY_NAME="Ubuntu 24.04.1 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nVERSION="24.04.1 LTS (Noble Numbat)"\n' +
    'VERSION_CODENAME=noble\nID=ubuntu\nID_LIKE=debian\nHOME_URL="https://www.ubuntu.com/"\n' +
    'SUPPORT_URL="https://help.ubuntu.com/"\nBUG_REPORT_URL="https://bugs.launchpad.net/ubuntu/"\n' +
    'PRIVACY_POLICY_URL="https://www.ubuntu.com/legal/terms-and-policies/privacy-policy"\nUBUNTU_CODENAME=noble\nLOGO=ubuntu-logo\n';

  var BASHRC = '# ~/.bashrc: executed by bash(1) for non-login shells.\n\n# If not running interactively, don\'t do anything\n' +
    '[ -z "$PS1" ] && return\n\nHISTSIZE=1000\nHISTFILESIZE=2000\n\nalias ll=\'ls -alF\'\nalias la=\'ls -A\'\nalias l=\'ls -CF\'\n';
  var PROFILE = '# ~/.profile: executed by the command interpreter for login shells.\n\nif [ -n "$BASH_VERSION" ]; then\n' +
    '    if [ -f "$HOME/.bashrc" ]; then\n\t. "$HOME/.bashrc"\n    fi\nfi\n';

  var PAGE_DEFAUT =
    '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8">\n' +
    '    <title>Apache2 Ubuntu Default Page: It works</title>\n    <style>\n' +
    '      body { margin: 0; padding: 12px; font-family: Verdana, Arial, sans-serif; background: #f4f4f4; color: #000; font-size: 13px; }\n' +
    '      .page { max-width: 720px; margin: 0 auto; background: #fff; border: 1px solid #c6c6c6; }\n' +
    '      .bandeau { display: flex; align-items: center; gap: 12px; padding: 14px 18px; background: #e95420; color: #fff; }\n' +
    '      .logo { font: bold 26px Arial, sans-serif; }\n' +
    '      .titre { font-size: 20px; }\n' +
    '      .ok { margin: 12px 18px; padding: 8px; text-align: center; font-weight: bold; font-size: 18px; background: #e9f5e0; border: 1px solid #8fbf6f; color: #2e6b12; }\n' +
    '      .section { margin: 0 18px 14px; }\n' +
    '      .section h2 { font-size: 14px; background: #f2f2f2; border: 1px solid #ccc; padding: 4px 8px; }\n' +
    '      pre { background: #f6f6f6; border: 1px solid #ddd; padding: 6px; font-size: 12px; }\n' +
    '    </style>\n  </head>\n  <body>\n    <div class="page">\n' +
    '      <div class="bandeau"><span class="logo">ubuntu</span><span class="titre">Apache2 Default Page</span></div>\n' +
    '      <div class="ok">It works!</div>\n      <div class="section">\n' +
    '        <p>This is the default welcome page used to test the correct operation of the Apache2 server after\n' +
    '        installation on Ubuntu systems. If you can read this page, it means that the Apache HTTP server\n' +
    '        installed at this site is working properly. You should <b>replace this file</b> (located at\n' +
    '        <tt>/var/www/html/index.html</tt>) before continuing to operate your HTTP server.</p>\n' +
    '        <h2>Configuration Overview</h2>\n' +
    '        <p>Ubuntu\'s Apache2 default configuration is different from the upstream default configuration, and\n' +
    '        split into several files optimized for interaction with Ubuntu tools.</p>\n' +
    '<pre>\n/etc/apache2/\n|-- apache2.conf\n|       `--  ports.conf\n|-- mods-enabled\n|       |-- *.load\n|       `-- *.conf\n' +
    '|-- conf-enabled\n|       `-- *.conf\n|-- sites-enabled\n|       `-- *.conf\n</pre>\n' +
    '        <h2>Document Roots</h2>\n' +
    '        <p>By default, Ubuntu does not allow access through the web browser to <em>any</em> file outside of\n' +
    '        those located in <tt>/var/www</tt>, <tt>public_html</tt> directories (when enabled) and\n' +
    '        <tt>/usr/share</tt> (for web applications).</p>\n      </div>\n    </div>\n  </body>\n</html>\n';

  var APACHE2_CONF =
    '# This is the main Apache server configuration file.  It contains the\n' +
    '# configuration directives that give the server its instructions.\n' +
    '# See http://httpd.apache.org/docs/2.4/ for detailed information about\n' +
    '# the directives and /usr/share/doc/apache2/README.Debian about Debian specific\n# hints.\n#\n' +
    '# (Terminal d\'entraînement : les longs commentaires d\'origine sont abrégés.)\n\n' +
    'DefaultRuntimeDir ${APACHE_RUN_DIR}\nPidFile ${APACHE_PID_FILE}\nTimeout 300\nKeepAlive On\n' +
    'MaxKeepAliveRequests 100\nKeepAliveTimeout 5\n\n# These need to be set in /etc/apache2/envvars\n' +
    'User ${APACHE_RUN_USER}\nGroup ${APACHE_RUN_GROUP}\n\nHostnameLookups Off\n\n' +
    'ErrorLog ${APACHE_LOG_DIR}/error.log\nLogLevel warn\n\n# Include module configuration:\n' +
    'IncludeOptional mods-enabled/*.load\nIncludeOptional mods-enabled/*.conf\n\n' +
    '# Include list of ports to listen on\nInclude ports.conf\n\n' +
    '# Sets the default security model of the Apache2 HTTPD server. It does\n' +
    '# not allow access to the root filesystem outside of /usr/share and /var/www.\n' +
    '# The former is used by web applications packaged in Debian,\n' +
    '# the latter may be used for local directories served by the web server. If\n' +
    '# your system is serving content from a sub-directory in /srv you must allow\n' +
    '# access here, or in any related virtual host.\n' +
    '<Directory />\n\tOptions FollowSymLinks\n\tAllowOverride None\n\tRequire all denied\n</Directory>\n\n' +
    '<Directory /usr/share>\n\tAllowOverride None\n\tRequire all granted\n</Directory>\n\n' +
    '<Directory /var/www/>\n\tOptions Indexes FollowSymLinks\n\tAllowOverride None\n\tRequire all granted\n</Directory>\n\n' +
    '#<Directory /srv/>\n#\tOptions Indexes FollowSymLinks\n#\tAllowOverride None\n#\tRequire all granted\n#</Directory>\n\n' +
    '# AccessFileName: The name of the file to look for in each directory\n' +
    '# for additional configuration directives.  See also the AllowOverride\n# directive.\n#\nAccessFileName .htaccess\n\n' +
    '#\n# The following lines prevent .htaccess and .htpasswd files from being\n# viewed by Web clients.\n#\n' +
    '<FilesMatch "^\\.ht">\n\tRequire all denied\n</FilesMatch>\n\n' +
    'LogFormat "%v:%p %h %l %u %t \\"%r\\" %>s %O \\"%{Referer}i\\" \\"%{User-Agent}i\\"" vhost_combined\n' +
    'LogFormat "%h %l %u %t \\"%r\\" %>s %O \\"%{Referer}i\\" \\"%{User-Agent}i\\"" combined\n' +
    'LogFormat "%h %l %u %t \\"%r\\" %>s %O" common\nLogFormat "%{Referer}i -> %U" referer\nLogFormat "%{User-agent}i" agent\n\n' +
    '# Include generic snippets of statements\nIncludeOptional conf-enabled/*.conf\n\n' +
    '# Include the virtual host configurations:\nIncludeOptional sites-enabled/*.conf\n';

  var VHOST_DEFAUT =
    '<VirtualHost *:80>\n' +
    '\t# The ServerName directive sets the request scheme, hostname and port that\n' +
    '\t# the server uses to identify itself. This is used when creating\n' +
    '\t# redirection URLs. In the context of virtual hosts, the ServerName\n' +
    '\t# specifies what hostname must appear in the request\'s Host: header to\n' +
    '\t# match this virtual host. For the default virtual host (this file) this\n' +
    '\t# value is not decisive as it is used as a last resort host regardless.\n' +
    '\t# However, you must set it for any further virtual host explicitly.\n' +
    '\t#ServerName www.example.com\n\n' +
    '\tServerAdmin webmaster@localhost\n\tDocumentRoot /var/www/html\n\n' +
    '\t# Available loglevels: trace8, ..., trace1, debug, info, notice, warn,\n' +
    '\t# error, crit, alert, emerg.\n\t# It is also possible to configure the loglevel for particular\n' +
    '\t# modules, e.g.\n\t#LogLevel info ssl:warn\n\n' +
    '\tErrorLog ${APACHE_LOG_DIR}/error.log\n\tCustomLog ${APACHE_LOG_DIR}/access.log combined\n\n' +
    '\t# For most configuration files from conf-available/, which are\n' +
    '\t# enabled or disabled at a global level, it is possible to\n' +
    '\t# include a line for only one particular virtual-host. For example the\n' +
    '\t# following line enables the CGI configuration for this host only\n' +
    '\t# after it has been globally disabled with "a2disconf".\n' +
    '\t#Include conf-available/serve-cgi-bin.conf\n</VirtualHost>\n';

  var VHOST_SSL =
    '<VirtualHost *:443>\n\tServerAdmin webmaster@localhost\n\tDocumentRoot /var/www/html\n\n' +
    '\tErrorLog ${APACHE_LOG_DIR}/error.log\n\tCustomLog ${APACHE_LOG_DIR}/access.log combined\n\n' +
    '\tSSLEngine on\n\tSSLCertificateFile      /etc/ssl/certs/ssl-cert-snakeoil.pem\n' +
    '\tSSLCertificateKeyFile   /etc/ssl/private/ssl-cert-snakeoil.key\n</VirtualHost>\n';

  var CONFS = {
    'charset.conf': '# Read the documentation before enabling AddDefaultCharset.\n# In general, it is only a good idea if you know that all your files\n' +
      '# have this encoding. It will override any encoding given in the files\n# in meta http-equiv or xml encoding tags.\n\n#AddDefaultCharset UTF-8\n',
    'localized-error-pages.conf': '# Customizable error responses come in three flavors:\n# 1) plain text\n#ErrorDocument 500 "The server made a boo boo."\n' +
      '#\n# 2) local redirects\n#ErrorDocument 404 /missing.html\n#\n# 3) external redirects\n#ErrorDocument 402 http://www.example.com/subscription_info.html\n',
    'other-vhosts-access-log.conf': '# Define an access log for VirtualHosts that don\'t define their own logfile\n' +
      'CustomLog ${APACHE_LOG_DIR}/other_vhosts_access.log vhost_combined\n',
    'security.conf': '# Changing the following options will not really affect the security of the\n' +
      '# server, but might make attacks slightly more difficult in some cases.\n\nServerTokens OS\nServerSignature On\nTraceEnable Off\n',
    'serve-cgi-bin.conf': '<IfModule mod_alias.c>\n\t<IfModule mod_cgi.c>\n\t\tDefine ENABLE_USR_LIB_CGI_BIN\n\t</IfModule>\n\n' +
      '\t<IfModule mod_cgid.c>\n\t\tDefine ENABLE_USR_LIB_CGI_BIN\n\t</IfModule>\n\n\t<IfDefine ENABLE_USR_LIB_CGI_BIN>\n' +
      '\t\tScriptAlias /cgi-bin/ /usr/lib/cgi-bin/\n\t\t<Directory "/usr/lib/cgi-bin">\n\t\t\tAllowOverride None\n' +
      '\t\t\tOptions +ExecCGI -MultiViews +SymLinksIfOwnerMatch\n\t\t\tRequire all granted\n\t\t</Directory>\n\t</IfDefine>\n</IfModule>\n'
  };

  var MODS = ['access_compat', 'alias', 'auth_basic', 'authn_core', 'authn_file', 'authz_core', 'authz_host', 'authz_user',
    'autoindex', 'deflate', 'dir', 'env', 'filter', 'mime', 'mpm_event', 'negotiation', 'reqtimeout', 'setenvif', 'status'];

  // ---------- Système de fichiers ----------

  function D(c, p, o, g) {
    return { t: 'd', p: p || '755', o: o || 'root', g: g || o || 'root', m: Date.now(), c: c || {} };
  }
  function F(txt, p, o, g) {
    return { t: 'f', p: p || '644', o: o || 'root', g: g || o || 'root', m: Date.now(), txt: txt || '' };
  }
  function L(cible) {
    return { t: 'l', p: '777', o: 'root', g: 'root', m: Date.now(), cible: cible };
  }

  function arbreInitial() {
    var bins = {};
    ['bash', 'cat', 'chmod', 'chown', 'cp', 'echo', 'grep', 'ls', 'mkdir', 'mv', 'nano', 'rm', 'su', 'tail', 'touch', 'curl', 'sudo']
      .forEach(function (b) {
        bins[b] = F('', '755');
      });
    return D({
      bin: L('usr/bin'),
      boot: D({}),
      dev: D({}),
      etc: D({
        'os-release': F(OS_RELEASE),
        hostname: F('ubuntu\n'),
        hosts: F('127.0.0.1 localhost\n127.0.1.1 ubuntu\n\n::1     ip6-localhost ip6-loopback\n'),
        passwd: F(''),
        group: F(''),
        shadow: F('', '640', 'root', 'shadow'),
        skel: D({ '.bashrc': F(BASHRC), '.profile': F(PROFILE), '.bash_logout': F('# ~/.bash_logout: executed by bash(1) when login shell exits.\n') }),
        apt: D({ 'sources.list.d': D({ 'ubuntu.sources': F('Types: deb\nURIs: http://archive.ubuntu.com/ubuntu/\nSuites: noble noble-updates noble-backports\nComponents: main restricted universe multiverse\n') }) })
      }),
      home: D({}),
      opt: D({}),
      root: D({ '.bashrc': F(BASHRC), '.profile': F(PROFILE) }, '700'),
      srv: D({}),
      tmp: D({}, '777'),
      usr: D({ bin: D(bins), sbin: D({}), lib: D({ systemd: D({ system: D({}) }) }), share: D({ doc: D({}) }) }),
      var: D({
        lib: D({ apt: D({ lists: D({}) }) }),
        log: D({ syslog: F('', '640', 'syslog', 'adm') }, '775', 'root', 'syslog'),
        tmp: D({}, '777')
      })
    });
  }

  function etatInitial() {
    var e = {
      v: VERSION,
      id: hasard(12, '0123456789abcdef'),
      fs: arbreInitial(),
      users: {
        root: { uid: 0, home: '/root', groupes: ['root'], mdp: null },
        'www-data': { uid: 33, home: '/var/www', groupes: ['www-data'], mdp: null }
      },
      pile: [{ user: 'root', cwd: '/root', ancien: '/root', login: true }],
      aptMaj: false,
      paquets: { nano: true, curl: true },
      apache: { installe: false, etat: 'absent', depuis: 0, pid: 0, conf: null, journal: [] },
      ports: {},
      hist: [],
      lignes: [],
      faites: {}
    };
    majComptes(e);
    return e;
  }

  var etat;

  function charger() {
    var e = TP.lire(CLE, null);
    if (!e || e.v !== VERSION || !e.fs) e = etatInitial();
    return e;
  }
  etat = charger();

  function sauver() {
    etat.lignes = etat.lignes.slice(-250);
    etat.hist = etat.hist.slice(-100);
    TP.ecrire(CLE, etat);
  }

  function reinitialiser() {
    etat = etatInitial();
    sauver();
    emettre('reset', null);
  }

  // Un autre onglet a modifié le serveur : on recharge (même machine).
  window.addEventListener('storage', function (evt) {
    if (evt.key === 'apache-' + CLE) {
      etat = charger();
      emettre('reset', null);
    }
  });

  // /etc/passwd et /etc/group sont tenus à jour à partir des comptes.
  function majComptes(e) {
    var et = e.fs.c.etc.c;
    var pw = ['root:x:0:0:root:/root:/bin/bash', 'daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin',
      'bin:x:2:2:bin:/bin:/usr/sbin/nologin', 'sys:x:3:3:sys:/dev:/usr/sbin/nologin',
      'www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin', 'syslog:x:104:111::/home/syslog:/usr/sbin/nologin'];
    var gr = ['root:x:0:', 'adm:x:4:syslog', 'www-data:x:33:', 'shadow:x:42:', 'users:x:100:', 'syslog:x:111:'];
    Object.keys(e.users).forEach(function (u) {
      var c = e.users[u];
      if (c.uid >= 1000) {
        pw.push(u + ':x:' + c.uid + ':' + c.uid + ':,,,:' + c.home + ':/bin/bash');
        gr.push(u + ':x:' + c.uid + ':');
      }
    });
    var membres = Object.keys(e.users).filter(function (u) {
      return e.users[u].groupes.indexOf('users') !== -1;
    });
    gr[4] = 'users:x:100:' + membres.join(',');
    et.passwd.txt = pw.join('\n') + '\n';
    et.group.txt = gr.join('\n') + '\n';
  }

  // ---------- Comptes et session ----------

  function session() {
    return etat.pile[etat.pile.length - 1];
  }
  function utilisateur() {
    return session().user;
  }
  function home(u) {
    var c = etat.users[u || utilisateur()];
    return c ? c.home : '/';
  }
  function groupePrincipal(u) {
    var c = etat.users[u];
    return c ? c.groupes[0] : u;
  }
  function membre(u, g) {
    var c = etat.users[u];
    return !!c && c.groupes.indexOf(g) !== -1;
  }
  function existeCompte(u) {
    return !!etat.users[u];
  }
  function existeGroupe(g) {
    if (['root', 'adm', 'www-data', 'shadow', 'users', 'syslog'].indexOf(g) !== -1) return true;
    return Object.keys(etat.users).some(function (u) {
      return etat.users[u].groupes.indexOf(g) !== -1;
    });
  }

  // Droits (0 à 7) de l'utilisateur u sur le nœud n.
  function droits(n, u) {
    if (u === 'root') return 7;
    if (n.o === u) return parseInt(n.p.charAt(0), 8);
    if (membre(u, n.g)) return parseInt(n.p.charAt(1), 8);
    return parseInt(n.p.charAt(2), 8);
  }

  // ---------- Chemins ----------

  function decouper(ch) {
    return String(ch).split('/').filter(Boolean);
  }
  function normaliser(abs) {
    var res = [];
    decouper(abs).forEach(function (p) {
      if (p === '.') return;
      if (p === '..') res.pop();
      else res.push(p);
    });
    return '/' + res.join('/');
  }
  function absolu(ch, cwd, u) {
    if (ch === undefined || ch === '') return cwd;
    if (ch === '~' || ch.indexOf('~/') === 0) ch = home(u) + ch.slice(1);
    return normaliser(ch.charAt(0) === '/' ? ch : cwd + '/' + ch);
  }
  function dossierDe(abs) {
    var p = decouper(abs);
    p.pop();
    return '/' + p.join('/');
  }
  function nomDe(abs) {
    var p = decouper(abs);
    return p.length ? p[p.length - 1] : '/';
  }

  // Parcourt le chemin (liens symboliques suivis, sauf pour le dernier
  // élément si suivre === false). Si u est donné, vérifie le droit de
  // traverser (x) chaque dossier. Renvoie { n, chemin } ou { erreur, ou }.
  function acceder(abs, u, suivre, profondeur) {
    profondeur = profondeur || 0;
    if (profondeur > 8) return { erreur: 'ELOOP' };
    var parties = decouper(abs);
    var n = etat.fs;
    var ch = '';
    for (var i = 0; i < parties.length; i++) {
      if (n.t !== 'd') return { erreur: 'ENOTDIR', ou: ch };
      if (u && !(droits(n, u) & 1)) return { erreur: 'EACCES', ou: ch || '/' };
      var suivant = n.c[parties[i]];
      var dernier = i === parties.length - 1;
      if (!suivant) return { erreur: 'ENOENT', ou: ch + '/' + parties[i] };
      if (suivant.t === 'l' && (!dernier || suivre !== false)) {
        var cible = suivant.cible.charAt(0) === '/' ? suivant.cible : (ch || '') + '/' + suivant.cible;
        var reste = parties.slice(i + 1).join('/');
        return acceder(normaliser(cible + (reste ? '/' + reste : '')), u, suivre, profondeur + 1);
      }
      n = suivant;
      ch += '/' + parties[i];
    }
    return { n: n, chemin: ch || '/' };
  }
  function noeud(abs, suivre) {
    return acceder(abs, null, suivre).n || null;
  }
  function texte(abs) {
    var n = noeud(abs);
    return n && n.t === 'f' ? n.txt : null;
  }

  // Création / écriture par l'utilisateur u. Renvoie null si tout va bien,
  // sinon 'EACCES', 'ENOENT', 'EISDIR', 'ENOTDIR', 'EEXIST'.
  function ecrire(abs, txt, u, ajout) {
    var r = acceder(abs, u);
    if (r.n) {
      if (r.n.t === 'd') return 'EISDIR';
      if (!(droits(r.n, u) & 2)) return 'EACCES';
      r.n.txt = ajout ? r.n.txt + txt : txt;
      r.n.m = Date.now();
      if (ajout) emettre('ecriture', { chemin: r.chemin, texte: txt });
      return null;
    }
    if (r.erreur === 'EACCES' || r.erreur === 'ENOTDIR') return r.erreur;
    var p = acceder(dossierDe(abs), u);
    if (!p.n) return p.erreur === 'EACCES' ? 'EACCES' : 'ENOENT';
    if (p.n.t !== 'd') return 'ENOTDIR';
    if ((droits(p.n, u) & 3) !== 3) return 'EACCES';
    var f = F(txt, u === 'root' ? '644' : '664', u, groupePrincipal(u));
    p.n.c[nomDe(abs)] = f;
    p.n.m = Date.now();
    return null;
  }

  function creerDossier(abs, u) {
    var p = acceder(dossierDe(abs), u);
    if (!p.n) return p.erreur === 'EACCES' ? 'EACCES' : 'ENOENT';
    if (p.n.t !== 'd') return 'ENOTDIR';
    if (p.n.c[nomDe(abs)]) return 'EEXIST';
    if ((droits(p.n, u) & 3) !== 3) return 'EACCES';
    p.n.c[nomDe(abs)] = D({}, u === 'root' ? '755' : '775', u, groupePrincipal(u));
    p.n.m = Date.now();
    return null;
  }

  function supprimer(abs, u) {
    var p = acceder(dossierDe(abs), u);
    if (!p.n || p.n.t !== 'd' || !p.n.c[nomDe(abs)]) return 'ENOENT';
    if ((droits(p.n, u) & 3) !== 3) return 'EACCES';
    delete p.n.c[nomDe(abs)];
    p.n.m = Date.now();
    return null;
  }

  // Écriture « système » (journaux, paquets) : sans contrôle de droits.
  function placer(abs, n) {
    var p = noeud(dossierDe(abs));
    if (p && p.t === 'd') p.c[nomDe(abs)] = n;
  }

  // ---------- Journaux d'Apache ----------

  var ACCESS = '/var/log/apache2/access.log';
  var ERROR = '/var/log/apache2/error.log';

  function journaliser(chemin, ligne) {
    var f = noeud(chemin);
    if (!f) {
      if (!noeud('/var/log/apache2')) return;
      f = F('', '640', 'root', 'adm');
      placer(chemin, f);
    }
    var lignes = (f.txt + ligne + '\n').split('\n');
    if (lignes.length > 301) lignes = lignes.slice(-301);
    f.txt = lignes.join('\n');
    f.m = Date.now();
    emettre('ecriture', { chemin: chemin, texte: ligne + '\n' });
  }

  function erreurLog(module, niveau, message, client) {
    journaliser(ERROR, '[' + dateErreur() + '] [' + module + ':' + niveau + '] [pid ' + (etat.apache.pid + 2) + ':tid ' +
      (etat.apache.pid + 7) + '] ' + (client ? '[client ' + client + ':' + (40000 + Math.floor(Math.random() * 20000)) + '] ' : '') + message);
  }

  function journalService(ligne) {
    etat.apache.journal.push(dateJournal() + ' ubuntu ' + ligne);
    etat.apache.journal = etat.apache.journal.slice(-8);
  }

  // ---------- Paquets ----------

  function installerApache() {
    var etc = D({
      'apache2.conf': F(APACHE2_CONF),
      'ports.conf': F('# If you just change the port or add more ports here, you will likely also\n' +
        '# have to change the VirtualHost statement in\n# /etc/apache2/sites-enabled/000-default.conf\n\n' +
        'Listen 80\n\n<IfModule ssl_module>\n\tListen 443\n</IfModule>\n\n<IfModule mod_gnutls.c>\n\tListen 443\n</IfModule>\n'),
      envvars: F('# envvars - default environment variables for apache2ctl\n\nexport APACHE_RUN_USER=www-data\n' +
        'export APACHE_RUN_GROUP=www-data\nexport APACHE_PID_FILE=/var/run/apache2$SUFFIX/apache2.pid\n' +
        'export APACHE_RUN_DIR=/var/run/apache2$SUFFIX\nexport APACHE_LOCK_DIR=/var/lock/apache2$SUFFIX\n' +
        'export APACHE_LOG_DIR=/var/log/apache2$SUFFIX\n'),
      magic: F('# Magic data for mod_mime_magic\n'),
      'conf-available': D({}),
      'conf-enabled': D({}),
      'mods-available': D({}),
      'mods-enabled': D({}),
      'sites-available': D({ '000-default.conf': F(VHOST_DEFAUT), 'default-ssl.conf': F(VHOST_SSL) }),
      'sites-enabled': D({ '000-default.conf': L('../sites-available/000-default.conf') })
    });
    Object.keys(CONFS).forEach(function (k) {
      etc.c['conf-available'].c[k] = F(CONFS[k]);
      etc.c['conf-enabled'].c[k] = L('../conf-available/' + k);
    });
    MODS.forEach(function (m) {
      etc.c['mods-available'].c[m + '.load'] = F('LoadModule ' + m + '_module /usr/lib/apache2/modules/mod_' + m + '.so\n');
      etc.c['mods-enabled'].c[m + '.load'] = L('../mods-available/' + m + '.load');
    });
    ['rewrite', 'ssl', 'headers', 'userdir', 'cgi'].forEach(function (m) {
      etc.c['mods-available'].c[m + '.load'] = F('LoadModule ' + m + '_module /usr/lib/apache2/modules/mod_' + m + '.so\n');
    });
    placer('/etc/apache2', etc);
    placer('/var/www', D({ html: D({ 'index.html': F(PAGE_DEFAUT) }) }));
    placer('/var/log/apache2', D({
      'access.log': F('', '640', 'root', 'adm'),
      'error.log': F('', '640', 'root', 'adm'),
      'other_vhosts_access.log': F('', '640', 'root', 'adm')
    }, '750', 'root', 'adm'));
    var sbin = noeud('/usr/sbin');
    ['apache2', 'apachectl', 'apache2ctl', 'a2enconf', 'a2disconf', 'a2ensite', 'a2dissite', 'a2enmod', 'a2dismod'].forEach(function (b) {
      sbin.c[b] = F('', '755');
    });
    var bin = noeud('/usr/bin');
    ['htpasswd', 'htdigest', 'ab', 'logresolve'].forEach(function (b) {
      bin.c[b] = F('', '755');
    });
    noeud('/usr/lib/systemd/system').c['apache2.service'] = F('[Unit]\nDescription=The Apache HTTP Server\n' +
      'After=network.target remote-fs.target nss-lookup.target\nDocumentation=https://httpd.apache.org/docs/2.4/\n\n' +
      '[Service]\nType=forking\nEnvironment=APACHE_STARTED_BY_SYSTEMD=true\nExecStart=/usr/sbin/apachectl start\n' +
      'ExecStop=/usr/sbin/apachectl graceful-stop\nExecReload=/usr/sbin/apachectl graceful\n\n[Install]\nWantedBy=multi-user.target\n');
    etat.paquets.apache2 = true;
    etat.paquets['apache2-utils'] = true;
    etat.apache.installe = true;
    etat.apache.enabled = true;
    demarrer();
  }

  // ---------- Configuration d'Apache ----------

  var DIRECTIVES = ('alias aliasmatch redirect redirectmatch scriptalias documentroot errordocument options allowoverride ' +
    'require authtype authname authuserfile authgroupfile authbasicprovider servername serveradmin serveralias serverroot ' +
    'errorlog customlog loglevel logformat include includeoptional listen user group pidfile timeout keepalive ' +
    'maxkeepaliverequests keepalivetimeout hostnamelookups accessfilename directoryindex defaultruntimedir mutex ' +
    'adddefaultcharset servertokens serversignature traceenable header satisfy order allow deny setenv addtype ' +
    'addhandler rewriteengine rewriterule rewritecond protocols define sslengine sslcertificatefile ' +
    'sslcertificatekeyfile loadmodule indexignore indexoptions').split(' ');
  var BLOCS = {
    directory: 'Directory', directorymatch: 'DirectoryMatch', files: 'Files', filesmatch: 'FilesMatch',
    location: 'Location', locationmatch: 'LocationMatch', virtualhost: 'VirtualHost', ifmodule: 'IfModule',
    ifdefine: 'IfDefine', ifversion: 'IfVersion', limit: 'Limit', limitexcept: 'LimitExcept', requireall: 'RequireAll',
    requireany: 'RequireAny'
  };

  // Découpe une ligne de configuration en mots (guillemets et \" gérés).
  function motsConf(l) {
    var mots = [];
    var i = 0;
    while (i < l.length) {
      while (i < l.length && /\s/.test(l.charAt(i))) i++;
      if (i >= l.length) break;
      var mot = '';
      if (l.charAt(i) === '"') {
        i++;
        while (i < l.length && l.charAt(i) !== '"') {
          if (l.charAt(i) === '\\' && i + 1 < l.length) i++;
          mot += l.charAt(i++);
        }
        i++;
      } else {
        while (i < l.length && !/\s/.test(l.charAt(i))) mot += l.charAt(i++);
      }
      mots.push(mot);
    }
    return mots;
  }

  function cheminDir(arg) {
    var a = String(arg).replace(/^"|"$/g, '').trim();
    if (a.length > 1) a = a.replace(/\/+$/, '');
    return a || '/';
  }

  // Analyse un fichier de configuration et complète res. contexte :
  // 'serveur' (fichiers .conf) ou 'htaccess'.
  function analyser(fichier, txt, res, contexte) {
    var pile = [];
    var lignes = String(txt).split('\n');
    function erreur(i, msg) {
      if (!res.erreur) res.erreur = { fichier: fichier, ligne: i + 1, msg: msg };
    }
    for (var i = 0; i < lignes.length && !res.erreur; i++) {
      var l = lignes[i].trim();
      if (!l || l.charAt(0) === '#') continue;
      if (/^<\//.test(l)) {
        var mf = /^<\/\s*([A-Za-z]+)\s*>$/.exec(l);
        var haut = pile[pile.length - 1];
        if (!mf || !haut || haut.nom !== mf[1].toLowerCase()) {
          var nomF = mf ? mf[1] : l.replace(/[<>/]/g, '');
          erreur(i, '</' + nomF + '> without matching <' + nomF + '> section');
          continue;
        }
        pile.pop();
        continue;
      }
      if (l.charAt(0) === '<') {
        var mo = /^<\s*([A-Za-z]+)\s*([^>]*)>$/.exec(l);
        if (!mo) {
          var nomBloc = (/^<\s*([A-Za-z]+)/.exec(l) || [])[1] || l;
          erreur(i, '<' + nomBloc + '> directive missing closing \'>\'');
          continue;
        }
        var nomO = mo[1].toLowerCase();
        if (!BLOCS[nomO] || contexte === 'htaccess' && /^(directory|virtualhost)/.test(nomO)) {
          erreur(i, 'Invalid command \'<' + mo[1] + '\', perhaps misspelled or defined by a module not included in the server configuration');
          continue;
        }
        var bloc = { nom: nomO, arg: mo[2].trim(), ligne: i + 1 };
        if (nomO === 'directory') {
          bloc.dir = { chemin: cheminDir(mo[2]), source: fichier, options: null, allowOverride: null, require: null };
          res.dirs.push(bloc.dir);
        }
        pile.push(bloc);
        continue;
      }
      var mots = motsConf(l);
      var nom = mots[0].toLowerCase();
      var args = mots.slice(1);
      if (DIRECTIVES.indexOf(nom) === -1) {
        erreur(i, 'Invalid command \'' + mots[0] + '\', perhaps misspelled or defined by a module not included in the server configuration');
        continue;
      }
      var interieur = pile[pile.length - 1];
      var dir = interieur && interieur.dir ? interieur.dir : null;
      if (contexte === 'htaccess') {
        if (nom === 'allowoverride' || nom === 'alias' || nom === 'documentroot' || nom === 'listen') {
          erreur(i, mots[0] + ' not allowed here');
          continue;
        }
        res.directives.push({ nom: nom, args: args });
        continue;
      }
      if (interieur && interieur.nom === 'filesmatch') continue;
      switch (nom) {
        case 'alias':
          if (args.length !== 2) erreur(i, 'Alias takes two arguments, a fake name and a real name');
          else res.alias.push({ url: args[0], chemin: args[1], source: fichier });
          break;
        case 'documentroot':
          if (args.length !== 1) erreur(i, 'DocumentRoot takes one argument, Root directory of the document tree');
          else res.docRoot = cheminDir(args[0]);
          break;
        case 'errordocument':
          if (args.length < 2) erreur(i, 'ErrorDocument takes two arguments, Change responses for HTTP errors');
          else res.errorDocs[args[0]] = args.slice(1).join(' ');
          break;
        case 'allowoverride':
          if (!dir) erreur(i, 'AllowOverride not allowed here');
          else dir.allowOverride = args.join(' ') || 'None';
          break;
        case 'options':
          if (dir) dir.options = args;
          break;
        case 'require':
          if (!args.length) erreur(i, 'Require takes at least one argument');
          else if (dir) dir.require = args.join(' ').toLowerCase();
          break;
        case 'directoryindex':
          res.directoryIndex = args;
          break;
      }
    }
    if (!res.erreur && pile.length) {
      var ouvert = pile[pile.length - 1];
      res.erreur = { fichier: fichier, ligne: ouvert.ligne, msg: '<' + BLOCS[ouvert.nom] + '> was not closed.' };
    }
  }

  // Lit la configuration telle qu'elle est actuellement sur le disque.
  function lireConfig() {
    var res = { erreur: null, dirs: [], alias: [], errorDocs: {}, docRoot: '/var/www/html', directoryIndex: ['index.html'], fichiers: [] };
    var sources = ['/etc/apache2/apache2.conf'];
    ['/etc/apache2/conf-enabled', '/etc/apache2/sites-enabled'].forEach(function (d) {
      var n = noeud(d);
      if (n && n.t === 'd') {
        Object.keys(n.c).sort().forEach(function (k) {
          if (/\.conf$/.test(k)) sources.push(d + '/' + k);
        });
      }
    });
    sources.forEach(function (ch) {
      if (res.erreur) return;
      var n = noeud(ch);
      if (!n || n.t !== 'f') {
        res.erreur = { fichier: ch, ligne: 0, msg: 'Could not open configuration file ' + ch + ': No such file or directory' };
        return;
      }
      res.fichiers.push(ch);
      analyser(ch, n.txt, res, 'serveur');
    });
    return res;
  }

  function messageErreurConf(err) {
    if (!err.ligne) return ['apache2: Syntax error in ' + err.fichier + ':', err.msg];
    return ['AH00526: Syntax error on line ' + err.ligne + ' of ' + err.fichier + ':', err.msg];
  }

  // Réglages <Directory> qui s'appliquent au chemin (du moins précis au plus précis).
  function reglagesPour(conf, chemin) {
    var r = { options: ['FollowSymLinks'], allowOverride: 'None', require: null };
    conf.dirs.filter(function (d) {
      return d.chemin === '/' || chemin === d.chemin || chemin.indexOf(d.chemin + '/') === 0;
    }).sort(function (a, b) {
      return a.chemin.length - b.chemin.length;
    }).forEach(function (d) {
      if (d.options) {
        var relatif = d.options.every(function (o) {
          return /^[+-]/.test(o);
        });
        var base = relatif ? r.options.slice() : [];
        d.options.forEach(function (o) {
          var nomO = o.replace(/^[+-]/, '').toLowerCase();
          base = base.filter(function (x) {
            return x.replace(/^[+-]/, '').toLowerCase() !== nomO;
          });
          if (o.charAt(0) !== '-' && nomO !== 'none') base.push(o.replace(/^\+/, ''));
        });
        r.options = base;
      }
      if (d.allowOverride) r.allowOverride = d.allowOverride;
      if (d.require) r.require = d.require;
    });
    return r;
  }

  // ---------- Service Apache ----------

  function nouveauPid() {
    return 2000 + Math.floor(Math.random() * 6000);
  }

  function demarrer() {
    var conf = lireConfig();
    if (conf.erreur) {
      etat.apache.etat = 'echec';
      etat.apache.depuis = Date.now();
      etat.apache.conf = null;
      journalService('systemd[1]: Starting apache2.service - The Apache HTTP Server...');
      messageErreurConf(conf.erreur).forEach(function (l) {
        journalService('apachectl[' + nouveauPid() + ']: ' + l);
      });
      journalService('systemd[1]: apache2.service: Control process exited, code=exited, status=1/FAILURE');
      journalService('systemd[1]: Failed to start apache2.service - The Apache HTTP Server.');
      return conf.erreur;
    }
    etat.apache.etat = 'actif';
    etat.apache.depuis = Date.now();
    etat.apache.pid = nouveauPid();
    etat.apache.conf = conf;
    journalService('systemd[1]: Starting apache2.service - The Apache HTTP Server...');
    journalService('systemd[1]: Started apache2.service - The Apache HTTP Server.');
    erreurLog('mpm_event', 'notice', 'AH00489: ' + SIGNATURE + ' configured -- resuming normal operations');
    erreurLog('core', 'notice', 'AH00094: Command line: \'/usr/sbin/apache2\'');
    return null;
  }

  function arreter() {
    if (etat.apache.etat === 'actif') {
      journalService('systemd[1]: Stopping apache2.service - The Apache HTTP Server...');
      erreurLog('mpm_event', 'notice', 'AH00491: caught SIGTERM, shutting down');
      journalService('systemd[1]: apache2.service: Deactivated successfully.');
      journalService('systemd[1]: Stopped apache2.service - The Apache HTTP Server.');
    }
    etat.apache.etat = 'arrete';
    etat.apache.depuis = Date.now();
  }

  // Renvoie null si le rechargement a réussi, sinon l'erreur de configuration
  // (l'ancienne configuration reste alors en service).
  function recharger() {
    var conf = lireConfig();
    journalService('systemd[1]: Reloading apache2.service - The Apache HTTP Server...');
    if (conf.erreur) {
      messageErreurConf(conf.erreur).forEach(function (l) {
        journalService('apachectl[' + nouveauPid() + ']: ' + l);
      });
      journalService('systemd[1]: apache2.service: Control process exited, code=exited, status=1/FAILURE');
      journalService('systemd[1]: Reload failed for apache2.service - The Apache HTTP Server.');
      return conf.erreur;
    }
    etat.apache.conf = conf;
    journalService('systemd[1]: Reloaded apache2.service - The Apache HTTP Server.');
    erreurLog('mpm_event', 'notice', 'AH00493: SIGUSR1 received.  Doing graceful restart');
    erreurLog('mpm_event', 'notice', 'AH00489: ' + SIGNATURE + ' configured -- resuming normal operations');
    return null;
  }

  // ---------- Requêtes HTTP ----------

  var RAISONS = { 200: 'OK', 301: 'Moved Permanently', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 500: 'Internal Server Error', 502: 'Bad Gateway' };
  var TYPES = { html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', json: 'application/json',
    txt: 'text/plain', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', svg: 'image/svg+xml', pdf: 'application/pdf' };

  function typeDe(nom) {
    var ext = (/\.([a-z0-9]+)$/i.exec(nom) || [])[1];
    return (ext && TYPES[ext.toLowerCase()]) || 'text/plain';
  }

  function pageErreur(statut, hote, port, chemin, supplement) {
    var corps = {
      301: '<p>The document has moved <a href="' + chemin + '">here</a>.</p>',
      401: '<p>This server could not verify that you\nare authorized to access the document\nrequested.  Either you supplied the wrong\n' +
        'credentials (e.g., bad password), or your\nbrowser doesn\'t understand how to supply\nthe credentials required.</p>',
      403: '<p>You don\'t have permission to access this resource.</p>',
      404: '<p>The requested URL was not found on this server.</p>',
      500: '<p>The server encountered an internal error or\nmisconfiguration and was unable to complete\nyour request.</p>\n' +
        '<p>Please contact the server administrator at \n webmaster@localhost to inform them of the time this error occurred,\n' +
        ' and the actions you performed just before this error.</p>\n<p>More information about this error may be available\nin the server error log.</p>'
    }[statut] || '';
    return '<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML 2.0//EN">\n<html><head>\n<title>' + statut + ' ' + RAISONS[statut] +
      '</title>\n</head><body>\n<h1>' + RAISONS[statut] + '</h1>\n' + corps + (supplement || '') +
      '\n<hr>\n<address>' + SIGNATURE + ' Server at ' + hote + ' Port ' + port + '</address>\n</body></html>\n';
  }

  function listing(url, n, hote, port) {
    var lignes = Object.keys(n.c).filter(function (k) {
      return k.charAt(0) !== '.';
    }).sort().map(function (k) {
      var e = n.c[k];
      var d = new Date(e.m);
      var date = d.getUTCFullYear() + '-' + deux(d.getUTCMonth() + 1) + '-' + deux(d.getUTCDate()) + ' ' + deux(d.getUTCHours()) + ':' + deux(d.getUTCMinutes());
      var taille = e.t === 'd' ? '  - ' : String(octets(e.txt || ''));
      var nomL = k + (e.t === 'd' ? '/' : '');
      return '<tr><td><a href="' + nomL + '">' + nomL + '</a></td><td align="right">' + date + '  </td><td align="right">' +
        taille + ' </td><td>&nbsp;</td></tr>';
    });
    var parent = url.replace(/[^/]+\/?$/, '') || '/';
    return '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 3.2 Final//EN">\n<html>\n <head>\n  <title>Index of ' + url.replace(/\/$/, '') +
      '</title>\n </head>\n <body>\n<h1>Index of ' + url.replace(/\/$/, '') + '</h1>\n  <table>\n' +
      '   <tr><th>Name</th><th>Last modified</th><th>Size</th><th>Description</th></tr>\n   <tr><th colspan="4"><hr></th></tr>\n' +
      '<tr><td><a href="' + parent + '">Parent Directory</a></td><td>&nbsp;</td><td align="right">  - </td><td>&nbsp;</td></tr>\n' +
      lignes.join('\n') + '\n   <tr><th colspan="4"><hr></th></tr>\n</table>\n<address>' + SIGNATURE + ' Server at ' + hote +
      ' Port ' + port + '</address>\n</body></html>\n';
  }

  // Traite une URL déjà décodée. Renvoie { statut, corps, type, ... }.
  function traiter(url, o, conf) {
    var hote = o.hote;
    var client = o.ip;
    // 1. Alias, sinon DocumentRoot.
    var alias = null;
    var fs = null;
    conf.alias.slice().sort(function (a, b) {
      return b.url.length - a.url.length;
    }).some(function (a) {
      var u = a.url;
      var correspond = u.slice(-1) === '/' ? url.indexOf(u) === 0 : url === u || url.indexOf(u + '/') === 0;
      if (correspond) {
        alias = a;
        fs = a.chemin.replace(/\/+$/, '') + '/' + url.slice(u.replace(/\/+$/, '').length);
      }
      return correspond;
    });
    if (!alias) fs = conf.docRoot + '/' + url;
    fs = normaliser(fs);
    var demandeDossier = /\/$/.test(url);
    var rep = { statut: 200, alias: alias, fs: fs };

    // 2. Contrôle d'accès <Directory> (Require).
    var reglages = reglagesPour(conf, fs);
    if (reglages.require === 'all denied' || /^\.ht/.test(nomDe(fs))) {
      erreurLog('authz_core', 'error', 'AH01630: client denied by server configuration: ' + fs, client);
      rep.statut = 403;
      return rep;
    }

    // 3. Parcours du disque avec les droits de www-data, et lecture des
    //    .htaccess autorisés par AllowOverride.
    var parties = decouper(fs);
    var n = etat.fs;
    var ch = '';
    var dossiers = ['/'];
    var introuvable = false;
    for (var i = 0; i < parties.length; i++) {
      if (n.t !== 'd') {
        introuvable = true;
        break;
      }
      if (!(droits(n, 'www-data') & 1)) {
        erreurLog('core', 'error', 'AH00035: access to ' + url + ' denied (filesystem path \'' + fs +
          '\') because search permissions are missing on a component of the path', client);
        rep.statut = 403;
        return rep;
      }
      var suivant = n.c[parties[i]];
      if (suivant && suivant.t === 'l') {
        var r = acceder(ch + '/' + parties[i]);
        suivant = r.n;
      }
      if (!suivant) {
        introuvable = true;
        break;
      }
      ch += '/' + parties[i];
      n = suivant;
      if (n.t === 'd') dossiers.push(ch);
    }

    var auth = {};
    for (var k = 0; k < dossiers.length; k++) {
      var d = dossiers[k];
      var ao = reglagesPour(conf, d).allowOverride;
      if (!ao || /^none$/i.test(ao)) continue;
      var h = noeud((d === '/' ? '' : d) + '/.htaccess');
      if (!h || h.t !== 'f') continue;
      if (!(droits(h, 'www-data') & 4)) {
        erreurLog('core', 'crit', 'AH00529: ' + d + '/.htaccess pcfg_openfile: unable to check htaccess file, ensure it is readable and that \'' +
          d + '/\' is executable', client);
        rep.statut = 403;
        return rep;
      }
      var res = { erreur: null, directives: [] };
      analyser(d + '/.htaccess', h.txt, res, 'htaccess');
      if (res.erreur) {
        erreurLog('core', 'alert', d + '/.htaccess: ' + res.erreur.msg, client);
        rep.statut = 500;
        return rep;
      }
      res.directives.forEach(function (dv) {
        if (dv.nom === 'authtype') auth.type = dv.args[0];
        if (dv.nom === 'authname') auth.nom = dv.args.join(' ');
        if (dv.nom === 'authuserfile') auth.fichier = dv.args[0];
        if (dv.nom === 'require') auth.require = dv.args.join(' ');
        if (dv.nom === 'errordocument' && dv.args.length > 1) auth.errorDocs = Object.assign(auth.errorDocs || {}, (function () {
          var e = {};
          e[dv.args[0]] = dv.args.slice(1).join(' ');
          return e;
        })());
        if (dv.nom === 'options' && n) reglages.options = dv.args;
      });
    }
    if (auth.errorDocs) rep.errorDocs = auth.errorDocs;

    // 4. Authentification (Basic).
    if (auth.require) {
      var req = auth.require.toLowerCase();
      if (req === 'all denied') {
        erreurLog('authz_core', 'error', 'AH01630: client denied by server configuration: ' + fs, client);
        rep.statut = 403;
        return rep;
      }
      if (req === 'valid-user' || req.indexOf('user ') === 0) {
        if (!auth.type) {
          erreurLog('authz_core', 'error', 'AH01796: AuthType not set!: ' + url, client);
          rep.statut = 500;
          return rep;
        }
        if (auth.type.toLowerCase() !== 'basic') {
          rep.statut = 500;
          return rep;
        }
        rep.realm = auth.nom || '';
        if (!o.auth) {
          rep.statut = 401;
          return rep;
        }
        var fichier = auth.fichier ? acceder(auth.fichier, 'www-data') : { erreur: 'ENOENT' };
        if (!fichier.n || fichier.n.t !== 'f' || !(droits(fichier.n, 'www-data') & 4)) {
          erreurLog('authn_file', 'error', 'AH01620: Could not open password file: ' + (auth.fichier || '(null)'), client);
          rep.statut = 500;
          return rep;
        }
        var ligne = fichier.n.txt.split('\n').filter(function (l) {
          return l.split(':')[0] === o.auth.user;
        })[0];
        if (!ligne) {
          erreurLog('auth_basic', 'error', 'AH01618: user ' + o.auth.user + ' not found: ' + url, client);
          rep.statut = 401;
          return rep;
        }
        if (!verifierMdp(ligne.slice(ligne.indexOf(':') + 1), o.auth.mdp)) {
          erreurLog('auth_basic', 'error', 'AH01617: user ' + o.auth.user + ': authentication failure for "' + url + '": Password Mismatch', client);
          rep.statut = 401;
          return rep;
        }
        if (req.indexOf('user ') === 0 && req.split(/\s+/).slice(1).indexOf(o.auth.user.toLowerCase()) === -1) {
          erreurLog('authz_core', 'error', 'AH01631: user ' + o.auth.user + ': authorization failure for "' + url + '": ', client);
          rep.statut = 401;
          return rep;
        }
        rep.user = o.auth.user;
      }
    }

    // 5. Ressource introuvable.
    if (introuvable) {
      rep.statut = 404;
      return rep;
    }

    // 6. Dossier : redirection vers « / », index.html ou liste du contenu.
    if (n.t === 'd') {
      if (!demandeDossier) {
        rep.statut = 301;
        rep.location = o.base + url + '/';
        return rep;
      }
      var index = null;
      (conf.directoryIndex || ['index.html']).some(function (nomI) {
        index = n.c[nomI] && n.c[nomI].t === 'f' ? { n: n.c[nomI], nom: nomI } : null;
        return !!index;
      });
      if (index) {
        if (!(droits(index.n, 'www-data') & 4)) {
          erreurLog('core', 'error', 'AH00132: file permissions deny server access: ' + fs.replace(/\/$/, '') + '/' + index.nom, client);
          rep.statut = 403;
          return rep;
        }
        rep.corps = index.n.txt;
        rep.type = typeDe(index.nom);
        rep.fichier = (fs === '/' ? '' : fs) + '/' + index.nom;
        rep.m = index.n.m;
        return rep;
      }
      var indexes = reglages.options.some(function (x) {
        return /^indexes$/i.test(x);
      });
      if (!indexes || !(droits(n, 'www-data') & 4)) {
        erreurLog('autoindex', 'error', 'AH01276: Cannot serve directory ' + fs + '/: No matching DirectoryIndex (index.html,index.cgi,index.pl,index.php,index.xhtml,index.htm) found, and server-generated directory index forbidden by Options directive', client);
        rep.statut = 403;
        return rep;
      }
      rep.corps = listing(url, n, hote, o.port);
      rep.type = 'text/html;charset=UTF-8';
      rep.listing = true;
      return rep;
    }

    // 7. Fichier.
    if (demandeDossier) {
      rep.statut = 404;
      return rep;
    }
    if (!(droits(n, 'www-data') & 4)) {
      erreurLog('core', 'error', 'AH00132: file permissions deny server access: ' + fs, client);
      rep.statut = 403;
      return rep;
    }
    rep.corps = n.txt;
    rep.type = typeDe(fs);
    rep.fichier = fs;
    rep.m = n.m;
    return rep;
  }

  // o = { chemin, methode, client: 'navigateur' | 'curl', auth: { user, mdp },
  //       hote, port, ua, base } ; renvoie la réponse complète, ou
  //       { connexion: false } si rien n'écoute sur le port.
  function requete(o) {
    o.port = o.port || 80;
    o.methode = o.methode || 'GET';
    o.ip = o.client === 'curl' ? '::1' : IP_PROXY;
    o.hote = o.hote || 'localhost';
    o.base = o.base || 'http://' + o.hote;
    var a = etat.apache;
    if (o.port !== 80 || !a.installe || a.etat !== 'actif' || !a.conf) return { connexion: false };
    var brut = o.chemin || '/';
    if (brut.charAt(0) !== '/') brut = '/' + brut;
    var chemin = brut.split('#')[0].split('?')[0];
    var url;
    try {
      url = decodeURIComponent(chemin);
    } catch (e) {
      url = chemin;
    }
    url = normaliser(url) + (url.length > 1 && /\/$/.test(url) ? '/' : '');

    var rep = traiter(url, o, a.conf);
    rep.url = brut;
    // ErrorDocument : la page personnalisée est renvoyée avec le code d'erreur.
    var docs = Object.assign({}, a.conf.errorDocs, rep.errorDocs || {});
    if (rep.statut >= 400 && docs[rep.statut]) {
      var cible = docs[rep.statut];
      if (cible.charAt(0) === '/') {
        var sous = traiter(normaliser(cible), Object.assign({}, o, { auth: null }), a.conf);
        if (sous.statut === 200) {
          rep.corps = sous.corps;
          rep.type = sous.type;
          rep.errorDocument = cible;
        } else {
          rep.corps = pageErreur(rep.statut, o.hote, o.port, url, '<p>Additionally, a ' + sous.statut + ' ' + RAISONS[sous.statut] +
            '\nerror was encountered while trying to use an ErrorDocument to handle the request.</p>');
          rep.type = 'text/html; charset=iso-8859-1';
        }
      } else {
        rep.corps = cible.replace(/^"|"$/g, '');
        rep.type = 'text/html; charset=iso-8859-1';
        rep.errorDocument = cible;
      }
    }
    if (rep.statut !== 200 && rep.corps === undefined) {
      rep.corps = pageErreur(rep.statut, o.hote, o.port, rep.location || url);
      rep.type = 'text/html; charset=iso-8859-1';
    }
    rep.raison = RAISONS[rep.statut];
    rep.taille = octets(rep.corps);
    if (o.methode === 'HEAD') rep.corpsEnvoye = '';

    // En-têtes de réponse.
    var h = [['Date', dateHttp()], ['Server', SIGNATURE]];
    if (rep.statut === 200 && rep.fichier) {
      h.push(['Last-Modified', dateHttp(rep.m)]);
      h.push(['ETag', '"' + rep.taille.toString(16) + '-' + Math.floor((rep.m || 0) / 1000).toString(16) + '"']);
      h.push(['Accept-Ranges', 'bytes']);
    }
    if (rep.location) h.push(['Location', rep.location]);
    if (rep.statut === 401) h.push(['WWW-Authenticate', 'Basic realm="' + rep.realm + '"']);
    h.push(['Content-Length', String(rep.taille)]);
    if (rep.statut === 200 && rep.fichier) h.push(['Vary', 'Accept-Encoding']);
    h.push(['Keep-Alive', 'timeout=5, max=100']);
    h.push(['Connection', 'Keep-Alive']);
    h.push(['Content-Type', rep.type]);
    rep.entetes = h;

    // Journal d'accès (format « combined »).
    rep.ligneLog = o.ip + ' - ' + (rep.user || '-') + ' [' + dateLog() + '] "' + o.methode + ' ' + brut + ' HTTP/1.1" ' +
      rep.statut + ' ' + (o.methode === 'HEAD' ? '-' : rep.taille) + ' "' + (o.referer || '-') + '" "' + o.ua + '"';
    journaliser(ACCESS, rep.ligneLog);
    sauver();
    emettre('requete', rep);
    return rep;
  }

  // Fichier que servirait Apache pour cette URL (pour l'outil « URL → fichier »).
  function resoudre(url) {
    var conf = etat.apache.conf;
    if (!conf) return null;
    var res = null;
    conf.alias.slice().sort(function (a, b) {
      return b.url.length - a.url.length;
    }).some(function (a) {
      var u = a.url;
      var ok = u.slice(-1) === '/' ? url.indexOf(u) === 0 : url === u || url.indexOf(u + '/') === 0;
      if (ok) res = { alias: a, fs: normaliser(a.chemin + '/' + url.slice(u.replace(/\/+$/, '').length)) };
      return ok;
    });
    return res || { alias: null, fs: normaliser(conf.docRoot + '/' + url), docRoot: conf.docRoot };
  }

  // ---------- Missions ----------

  var missions = [];
  var suivi = null; // fichier suivi par « tail -f » (terminal ouvert sur la page)

  function marquer(id) {
    document.querySelectorAll('[data-mission="' + id + '"]').forEach(function (li) {
      li.classList.add('faite');
    });
  }
  function demarquer() {
    document.querySelectorAll('[data-mission]').forEach(function (li) {
      if (!etat.faites[li.getAttribute('data-mission')]) li.classList.remove('faite');
    });
  }

  function definirMissions(liste) {
    missions = liste || [];
    Object.keys(etat.faites).forEach(marquer);
  }

  function contexte(ev) {
    return {
      source: ev.source,
      type: ev.type || 'commande',
      cmd: ev.cmd,
      args: ev.args || [],
      opts: ev.opts || {},
      ok: ev.ok,
      refus: ev.refus || null,
      requete: ev.requete || null,
      port: ev.port,
      devtools: !!ev.devtools,
      suivi: suivi,
      user: utilisateur(),
      cwd: session().cwd,
      pile: etat.pile.map(function (s) {
        return s.user;
      }),
      noeud: noeud,
      texte: texte,
      existe: function (abs, type) {
        var n = noeud(abs);
        return !!n && (!type || n.t === type);
      },
      apache: etat.apache,
      users: etat.users,
      lireConfig: lireConfig,
      PAGE_DEFAUT: PAGE_DEFAUT
    };
  }

  function evenement(ev) {
    var ctx = contexte(ev);
    var nouvelles = [];
    for (var i = 0; i < missions.length; i++) {
      var m = missions[i];
      if (etat.faites[m.id]) continue;
      if (i > 0 && !etat.faites[missions[i - 1].id]) break;
      var reussi = false;
      try {
        reussi = m.test(ctx);
      } catch (e) {
        reussi = false;
      }
      if (!reussi) break;
      etat.faites[m.id] = true;
      marquer(m.id);
      nouvelles.push(m);
    }
    var finies = nouvelles.length > 0 && missions.every(function (m) {
      return etat.faites[m.id];
    });
    if (nouvelles.length) sauver();
    nouvelles.forEach(function (m) {
      emettre('mission', { mission: m, source: ev.source });
    });
    if (finies) emettre('missions-finies', { source: ev.source });
  }

  on('reset', demarquer);

  return {
    on: on,
    emettre: emettre,
    get etat() {
      return etat;
    },
    sauver: sauver,
    reinitialiser: reinitialiser,
    // comptes
    session: session,
    utilisateur: utilisateur,
    home: home,
    groupePrincipal: groupePrincipal,
    membre: membre,
    existeCompte: existeCompte,
    existeGroupe: existeGroupe,
    majComptes: function () {
      majComptes(etat);
    },
    droits: droits,
    // fichiers
    D: D,
    F: F,
    L: L,
    decouper: decouper,
    normaliser: normaliser,
    absolu: absolu,
    dossierDe: dossierDe,
    nomDe: nomDe,
    acceder: acceder,
    noeud: noeud,
    texte: texte,
    ecrire: ecrire,
    creerDossier: creerDossier,
    supprimer: supprimer,
    placer: placer,
    octets: octets,
    // apache
    installerApache: installerApache,
    lireConfig: lireConfig,
    messageErreurConf: messageErreurConf,
    demarrer: demarrer,
    arreter: arreter,
    recharger: recharger,
    journalService: journalService,
    requete: requete,
    resoudre: resoudre,
    hacher: hacher,
    verifierMdp: verifierMdp,
    PAGE_DEFAUT: PAGE_DEFAUT,
    SIGNATURE: SIGNATURE,
    IP_MACHINE: IP_MACHINE,
    dateJournal: dateJournal,
    // missions
    definirMissions: definirMissions,
    evenement: evenement,
    get suivi() {
      return suivi;
    },
    set suivi(v) {
      suivi = v;
    }
  };
})();
