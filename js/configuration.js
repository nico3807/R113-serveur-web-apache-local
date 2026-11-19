// Page Configuration (parties 4 à 6) : terminal et navigateur d'entraînement
// dont les missions suivent le sujet (droits, alias, journaux), calculateur
// chmod et traduction « adresse → fichier sur le disque ».

(function () {
  var WWW = '/var/www/html';
  var ACCESS = '/var/log/apache2/access.log';

  Serveur.definirMissions([
    // 4. Modification de contenu et droits
    { id: 'c-adduser', bravo: 'Compte etudiant créé.', test: function (c) {
      return !!c.users.etudiant;
    } },
    { id: 'c-su', bravo: 'Te voilà connecté en etudiant : l\'invite se termine maintenant par $.', test: function (c) {
      return c.user === 'etudiant';
    } },
    { id: 'c-refus', bravo: 'Accès refusé : note le message d\'erreur pour Q4.', test: function (c) {
      return c.user === 'etudiant' && !!c.refus && c.refus.indexOf(WWW) === 0;
    } },
    { id: 'c-exit', bravo: 'De retour en root.', test: function (c) {
      return c.user === 'root';
    } },
    { id: 'c-chown', bravo: 'etudiant est propriétaire du dossier web.', test: function (c) {
      var n = c.noeud(WWW);
      return !!n && n.o === 'etudiant';
    } },
    { id: 'c-index', bravo: 'Ta page d\'accueil remplace celle d\'Apache.', test: function (c) {
      var t = c.texte(WWW + '/index.html');
      return !!t && !!t.trim() && t !== c.PAGE_DEFAUT;
    } },
    { id: 'c-voir', bravo: 'Le navigateur affiche ta nouvelle page.', test: function (c) {
      return !!c.requete && c.requete.statut === 200 && c.requete.fichier === WWW + '/index.html' && c.requete.corps !== c.PAGE_DEFAUT;
    } },
    // 5. Alias
    { id: 'c-dossier', bravo: 'Dossier ~/dossier_test prêt, avec sa page.', test: function (c) {
      return c.existe('/home/etudiant/dossier_test', 'd') && c.existe('/home/etudiant/dossier_test/index.html', 'f');
    } },
    { id: 'c-conf', bravo: 'Fichier mon_alias.conf créé.', test: function (c) {
      var t = c.texte('/etc/apache2/conf-available/mon_alias.conf') || '';
      return /^\s*Alias\s+\/test\/?\s+"?\/home\/etudiant\/dossier_test\/?"?\s*$/mi.test(t);
    } },
    { id: 'c-a2en', bravo: 'Configuration activée : un lien est apparu dans conf-enabled.', test: function (c) {
      return !!c.noeud('/etc/apache2/conf-enabled/mon_alias.conf', false);
    } },
    { id: 'c-reload', bravo: 'Apache a rechargé sa configuration : l\'alias /test est actif.', test: function (c) {
      return c.apache.etat === 'actif' && !!c.apache.conf && c.apache.conf.alias.some(function (a) {
        return /^\/test\/?$/.test(a.url);
      });
    } },
    { id: 'c-test', bravo: '.../test affiche le contenu de ~/dossier_test.', test: function (c) {
      return !!c.requete && c.requete.statut === 200 && !!c.requete.alias && /^\/test/.test(c.requete.url);
    } },
    // 6. Journaux
    { id: 'c-tail', bravo: 'Journal d\'accès suivi en temps réel.', test: function (c) {
      return c.cmd === 'tail' && (c.opts.f || c.opts.F) && c.suivi === ACCESS;
    } },
    { id: 'c-trafic', bravo: 'Chaque requête du navigateur ajoute une ligne au journal.', test: function (c) {
      return c.source === 'navigateur' && !!c.requete && c.suivi === ACCESS;
    } },
    { id: 'c-404', bravo: 'Erreur 404 enregistrée : repère sa ligne pour Q7.', test: function (c) {
      return !!c.requete && c.requete.statut === 404 && c.suivi === ACCESS;
    } }
  ]);

  var t = document.getElementById('terminal-configuration');
  if (t) Terminal.creer(t, { exigeApache: true });
  var n = document.getElementById('navigateur-configuration');
  if (n) Navigateur.creer(n);
  var poste = document.getElementById('poste');
  if (poste) Poste.init(poste);

  // ---------- Calculateur chmod ----------
  var calc = document.getElementById('chmod-calc');
  if (calc) {
    var boites = calc.querySelectorAll('input[type="checkbox"]');
    var octal = calc.querySelector('[name="octal"]');
    var chaine = calc.querySelector('[name="chaine"]');
    var cmd = calc.querySelector('[name="cmd"]');
    var cible = calc.getAttribute('data-cible') || 'index.html';

    var depuisCases = function () {
      var chiffres = [0, 0, 0];
      var s = '';
      boites.forEach(function (b) {
        if (b.checked) chiffres[+b.getAttribute('data-qui')] += +b.getAttribute('data-val');
      });
      chiffres.forEach(function (x) {
        s += (x & 4 ? 'r' : '-') + (x & 2 ? 'w' : '-') + (x & 1 ? 'x' : '-');
      });
      octal.value = chiffres.join('');
      chaine.value = s;
      cmd.value = 'chmod ' + chiffres.join('') + ' ' + cible;
    };

    var depuisOctal = function () {
      var v = octal.value.trim();
      if (!/^[0-7]{3}$/.test(v)) {
        octal.setAttribute('aria-invalid', 'true');
        return;
      }
      octal.removeAttribute('aria-invalid');
      boites.forEach(function (b) {
        var x = parseInt(v.charAt(+b.getAttribute('data-qui')), 8);
        b.checked = !!(x & +b.getAttribute('data-val'));
      });
      depuisCases();
    };

    boites.forEach(function (b) {
      b.addEventListener('change', depuisCases);
    });
    octal.addEventListener('input', depuisOctal);
    calc.querySelectorAll('[data-preset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        octal.value = btn.getAttribute('data-preset');
        depuisOctal();
      });
    });
    depuisCases();
  }

  // ---------- Adresse → fichier sur le disque ----------
  var resolveur = document.getElementById('resolveur');
  if (resolveur) {
    var champ = resolveur.querySelector('input');
    var fichier = document.getElementById('resolveur-fichier');
    var explication = document.getElementById('resolveur-explication');
    var esc = TP.echapper;

    var traduire = function () {
      var url = champ.value.trim() || '/';
      if (url.charAt(0) !== '/') url = '/' + url;
      var r = Serveur.resoudre(url);
      if (!r) {
        fichier.textContent = '—';
        explication.innerHTML = 'Apache n\'est pas démarré sur le serveur simulé (est-il installé ? <code>systemctl status apache2</code>).';
        return;
      }
      fichier.textContent = r.fs;
      var regle = r.alias
        ? 'Règle utilisée : <code>Alias ' + esc(r.alias.url) + ' ' + esc(r.alias.chemin) + '</code> (fichier <code>' + esc(r.alias.source) + '</code>).'
        : 'Règle utilisée : <code>DocumentRoot ' + esc(r.docRoot) + '</code> (aucun alias ne correspond à cette adresse).';
      var n = Serveur.noeud(r.fs);
      var existe = !n
        ? 'Ce chemin n\'existe pas sur le disque : Apache répondra <strong>404</strong>.'
        : n.t === 'd'
          ? 'C\'est un dossier : Apache y cherchera <code>index.html</code>' + (/\/$/.test(url) ? '.' : ' (après une redirection 301 vers ' + esc(url) + '/).')
          : 'Ce fichier existe. Encore faut-il que <code>www-data</code> ait le droit de le lire et de traverser chaque dossier du chemin, sinon : <strong>403</strong>.';
      explication.innerHTML = regle + ' ' + existe;
    };

    resolveur.querySelector('form').addEventListener('submit', function (evt) {
      evt.preventDefault();
      traduire();
    });
    resolveur.querySelectorAll('[data-url]').forEach(function (b) {
      b.addEventListener('click', function () {
        champ.value = b.getAttribute('data-url');
        traduire();
      });
    });
    Serveur.on('reset', traduire);
    traduire();
  }
})();
