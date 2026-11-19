// Page Sécurisation (parties 7 et 8, observation des échanges) : terminal et
// navigateur d'entraînement, missions dans l'ordre du sujet.

(function () {
  var WWW = '/var/www/html';

  // Un bloc <Directory> couvrant /var/www/html/admin autorise-t-il les .htaccess ?
  function override(conf) {
    return !!conf && conf.dirs.some(function (d) {
      return ['/var/www', WWW, WWW + '/admin'].indexOf(d.chemin) !== -1 && /\b(all|authconfig)\b/i.test(d.allowOverride || '');
    });
  }

  Serveur.definirMissions([
    // 7. Authentification
    { id: 's-admin', bravo: 'Dossier /admin créé, avec sa page.', test: function (c) {
      return c.existe(WWW + '/admin', 'd') && c.existe(WWW + '/admin/index.html', 'f');
    } },
    { id: 's-override', bravo: 'AllowOverride All : Apache pourra lire les fichiers .htaccess.', test: function (c) {
      return override(c.lireConfig());
    } },
    { id: 's-htaccess', bravo: '.htaccess en place dans /admin.', test: function (c) {
      var t = c.texte(WWW + '/admin/.htaccess') || '';
      return /^\s*AuthType\s+Basic\s*$/mi.test(t) && /^\s*AuthUserFile\s+\S+/mi.test(t) && /^\s*Require\s+valid-user\s*$/mi.test(t);
    } },
    { id: 's-htpasswd', bravo: 'Fichier de mots de passe créé : le mot de passe y est stocké sous forme d\'empreinte.', test: function (c) {
      return /^[^:\s]+:\$apr1\$/m.test(c.texte('/etc/apache2/.htpasswd') || '');
    } },
    { id: 's-restart', bravo: 'Apache a relu apache2.conf : les .htaccess sont maintenant pris en compte.', test: function (c) {
      return c.apache.etat === 'actif' && override(c.apache.conf);
    } },
    { id: 's-401', bravo: '401 Unauthorized : le navigateur demande des identifiants.', test: function (c) {
      return !!c.requete && c.requete.statut === 401 && /^\/admin/.test(c.requete.url);
    } },
    { id: 's-200', bravo: 'Authentification réussie : /admin s\'affiche.', test: function (c) {
      return !!c.requete && c.requete.statut === 200 && /^\/admin/.test(c.requete.url) && !!c.requete.user;
    } },
    // 8. Page d'erreur personnalisée
    { id: 's-oups', bravo: 'Page oups.html créée.', test: function (c) {
      return !!(c.texte(WWW + '/oups.html') || '').trim();
    } },
    { id: 's-errordoc', bravo: 'Directive ErrorDocument ajoutée dans le VirtualHost.', test: function (c) {
      var t = c.texte('/etc/apache2/sites-available/000-default.conf') || '';
      var vhost = /<VirtualHost[^>]*>([\s\S]*?)<\/VirtualHost>/i.exec(t);
      return !!vhost && /^\s*ErrorDocument\s+404\s+\/oups\.html\s*$/mi.test(vhost[1]);
    } },
    { id: 's-reload', bravo: 'Apache a rechargé sa configuration : ErrorDocument est actif.', test: function (c) {
      return c.apache.etat === 'actif' && !!c.apache.conf && c.apache.conf.errorDocs['404'] === '/oups.html';
    } },
    { id: 's-perso404', bravo: 'Ta page oups.html s\'affiche pour une adresse inexistante.', test: function (c) {
      return !!c.requete && c.requete.statut === 404 && c.requete.errorDocument === '/oups.html';
    } },
    // Observation des échanges
    { id: 's-devtools', bravo: 'Onglet Réseau ouvert.', test: function (c) {
      return c.source === 'navigateur' && c.devtools;
    } },
    { id: 's-net404', bravo: 'La requête en échec 404 apparaît dans l\'onglet Réseau.', test: function (c) {
      return c.source === 'navigateur' && c.devtools && !!c.requete && c.requete.statut === 404;
    } },
    { id: 's-entetes', bravo: 'En-têtes affichés : repère User-Agent et Content-Type pour Q10.', test: function (c) {
      return c.type === 'entetes' && !!c.requete && c.requete.statut === 200;
    } }
  ]);

  var t = document.getElementById('terminal-securisation');
  if (t) Terminal.creer(t, { exigeApache: true });
  var n = document.getElementById('navigateur-securisation');
  if (n) Navigateur.creer(n);
  var poste = document.getElementById('poste');
  if (poste) Poste.init(poste);
})();
