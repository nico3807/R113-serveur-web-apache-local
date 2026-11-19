// Navigateur simulé relié au serveur simulé (js/serveur.js), comme l'onglet
// que Killercoda ouvre avec le menu « Traffic / Ports » :
//  - choix du port exposé, puis barre d'adresse (URL publique Killercoda) ;
//  - affichage des pages renvoyées par Apache (redirections suivies,
//    fenêtre de connexion pour l'authentification Basic) ;
//  - outils de développement, onglet « Réseau » : code d'état, type,
//    taille et en-têtes de requête / de réponse de chaque échange.
//
// Poste.init(el) gère les onglets « Terminal » / « Navigateur » du poste de
// travail affiché à droite des consignes.

var Navigateur = (function () {
  var S = Serveur;
  var esc = TP.echapper;

  function creer(el) {
    el.classList.add('navigateur');
    el.innerHTML =
      '<form class="nav-ports">' +
      '<span class="nav-ports-titre">☰ Killercoda · <strong>Traffic / Ports</strong></span>' +
      '<label>Port <input type="text" inputmode="numeric" maxlength="5" autocomplete="off" aria-label="Numéro de port à exposer" /></label>' +
      '<button type="submit" class="popup-btn">Accéder</button>' +
      '<span class="nav-ports-etat" aria-live="polite"></span></form>' +
      '<div class="nav-fenetre">' +
      '<div class="nav-barre">' +
      '<button type="button" data-n="retour" title="Page précédente" aria-label="Page précédente">←</button>' +
      '<button type="button" data-n="recharger" title="Actualiser" aria-label="Actualiser la page">⟳</button>' +
      '<form class="nav-adresse"><span class="nav-cadenas" aria-hidden="true">🔒</span><span class="nav-base"></span>' +
      '<input type="text" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Chemin de la page (après le nom de domaine)" /></form>' +
      '<button type="button" data-n="devtools" aria-pressed="false" title="Outils de développement : onglet Réseau">🛠 Réseau</button>' +
      '</div>' +
      '<div class="nav-zone">' +
      '<iframe class="nav-page" sandbox="allow-same-origin" title="Page affichée par le navigateur simulé" hidden></iframe>' +
      '<div class="nav-message"></div>' +
      '<form class="nav-auth" hidden>' +
      '<p class="nav-auth-titre">Connexion</p>' +
      '<p class="nav-auth-site"></p>' +
      '<label>Nom d\'utilisateur<input type="text" name="user" autocomplete="off" spellcheck="false" autocapitalize="off" /></label>' +
      '<label>Mot de passe<input type="password" name="mdp" autocomplete="off" /></label>' +
      '<div class="nav-auth-boutons"><button type="button" class="btn secondary" data-n="annuler">Annuler</button>' +
      '<button type="submit" class="btn">Se connecter</button></div></form>' +
      '</div>' +
      '<div class="nav-devtools" hidden>' +
      '<div class="nav-dt-barre"><strong>Réseau</strong><span class="nav-dt-aide">Clique sur une requête pour voir ses en-têtes.</span>' +
      '<button type="button" data-n="effacer" title="Effacer la liste">🚫 Effacer</button></div>' +
      '<div class="nav-dt-corps"><div class="nav-dt-liste"><table class="nav-reseau"><thead><tr><th>État</th><th>Méthode</th><th>Fichier</th><th>Type</th><th>Taille</th></tr></thead>' +
      '<tbody></tbody></table></div><div class="nav-details" hidden></div></div></div>' +
      '</div>' +
      '<p class="nav-bravo" aria-live="polite"></p>';

    var formPorts = el.querySelector('.nav-ports');
    var inputPort = formPorts.querySelector('input');
    var etatPorts = el.querySelector('.nav-ports-etat');
    var fenetre = el.querySelector('.nav-fenetre');
    var base = el.querySelector('.nav-base');
    var formAdresse = el.querySelector('.nav-adresse');
    var adresse = formAdresse.querySelector('input');
    var page = el.querySelector('.nav-page');
    var message = el.querySelector('.nav-message');
    var formAuth = el.querySelector('.nav-auth');
    var devtools = el.querySelector('.nav-devtools');
    var btnDevtools = el.querySelector('[data-n="devtools"]');
    var tbody = el.querySelector('.nav-reseau tbody');
    var details = el.querySelector('.nav-details');
    var bravo = el.querySelector('.nav-bravo');

    var historique = [];
    var cheminCourant = null;
    var entrees = [];
    var identifiants = null; // { prefixe, user, mdp } après une connexion réussie
    var enAttenteAuth = null;
    var minuterieBravo = null;

    function port() {
      return S.etat.portActif || null;
    }
    function hote(p) {
      return S.etat.id + '-' + p + '.spch.r.killercoda.com';
    }
    function origine() {
      return 'https://' + hote(port());
    }

    function evenement(ev) {
      ev.source = 'navigateur';
      ev.devtools = !devtools.hidden;
      S.evenement(ev);
    }

    // ---------- Port exposé (Traffic / Ports) ----------

    function majPorts() {
      var p = port();
      fenetre.classList.toggle('inactive', !p);
      inputPort.value = p ? String(p) : '';
      etatPorts.textContent = p ? '→ ' + origine() : 'Saisis le port sur lequel écoute ton serveur web.';
      base.textContent = p ? origine() : 'https://…';
      adresse.disabled = !p;
      if (!p) afficherMessage('<p><strong>Aucun port n\'est encore exposé.</strong></p><p>Dans Killercoda, le menu ☰ en haut à droite, rubrique <em>Traffic / Ports</em>, ouvre un onglet vers un port de ta machine. Saisis le numéro de port ci-dessus, puis <em>Accéder</em>.</p>');
      else if (cheminCourant === null) afficherMessage('<p>Onglet ouvert sur <strong>' + esc(origine()) + '</strong>.</p><p><button type="button" class="btn" data-n="charger">Charger la page</button></p>');
    }

    formPorts.addEventListener('submit', function (evt) {
      evt.preventDefault();
      var p = parseInt(inputPort.value, 10);
      if (!(p > 0 && p < 65536)) {
        etatPorts.textContent = '✖ Numéro de port invalide.';
        return;
      }
      S.etat.portActif = p;
      S.etat.ports[p] = true;
      S.sauver();
      cheminCourant = null;
      historique = [];
      majPorts();
      evenement({ type: 'port', port: p });
      charger('/');
    });

    // ---------- Affichage ----------

    function afficherMessage(html) {
      page.hidden = true;
      message.hidden = false;
      message.innerHTML = html;
    }

    function pageProxy(p) {
      return '<!doctype html><html><head><meta charset="utf-8"><title>502 Bad Gateway</title><style>' +
        'body{font-family:system-ui,sans-serif;margin:0;padding:28px;background:#f6f7fb;color:#1c2333;font-size:14px}' +
        '.b{max-width:520px;margin:auto;background:#fff;border:1px solid #e1e4ec;border-radius:12px;padding:18px 22px}' +
        'h1{font-size:19px;margin:0 0 8px;color:#c23b3b}code{background:#eef0f6;padding:1px 5px;border-radius:4px}small{color:#5b6478}' +
        '</style></head><body><div class="b"><h1>502 Bad Gateway</h1><p>Le proxy de Killercoda n\'a obtenu aucune réponse sur le port <code>' +
        p + '</code> de ta machine : aucun serveur n\'y écoute.</p><p>Apache est-il installé et démarré ? (<code>systemctl status apache2</code>). ' +
        'Écoute-t-il bien sur ce port ?</p><p><small>Page d\'erreur simulée.</small></p></div></body></html>';
    }

    function afficherReponse(rep) {
      message.hidden = true;
      page.hidden = false;
      var type = rep.type || '';
      var html;
      if (/html/.test(type)) html = rep.corps;
      else if (/^image\//.test(type)) html = '<p style="font-family:sans-serif;color:#666">(image : ' + esc(type) + ', ' + rep.taille + ' octets)</p>';
      else html = '<pre style="white-space:pre-wrap;font:13px ui-monospace,Menlo,Consolas,monospace;margin:8px">' + esc(rep.corps) + '</pre>';
      page.srcdoc = html;
    }

    // Les liens de la page affichée restent dans le navigateur simulé.
    page.addEventListener('load', function () {
      var doc;
      try {
        doc = page.contentDocument;
      } catch (e) {
        return;
      }
      if (!doc) return;
      doc.addEventListener('click', function (evt) {
        var lien = evt.target.closest && evt.target.closest('a[href]');
        if (!lien) return;
        evt.preventDefault();
        var href = lien.getAttribute('href');
        if (/^https?:\/\//i.test(href)) {
          var m = /^https?:\/\/([^/]+)(\/.*)?$/i.exec(href);
          if (!m || m[1] !== hote(port())) {
            montrerBravo('Les liens vers d\'autres sites ne s\'ouvrent pas dans ce navigateur d\'entraînement.', true);
            return;
          }
          href = m[2] || '/';
        }
        if (href.charAt(0) === '#') return;
        var cible = href.charAt(0) === '/' ? href : (cheminCourant || '/').replace(/[^/]*$/, '') + href;
        var fin = /\/$/.test(cible) ? '/' : '';
        charger(S.normaliser(cible.split('?')[0]) + (S.normaliser(cible) === '/' ? '' : fin));
      });
    });

    // ---------- Requêtes ----------

    function enTetesRequete(chemin, auth) {
      var h = [['Host', hote(port())], ['User-Agent', navigator.userAgent],
        ['Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'],
        ['Accept-Language', 'fr-FR,fr;q=0.9,en;q=0.8'], ['Accept-Encoding', 'gzip, deflate, br'],
        ['Connection', 'keep-alive'], ['Upgrade-Insecure-Requests', '1']];
      if (auth) h.push(['Authorization', 'Basic ' + btoa(unescape(encodeURIComponent(auth.user + ':' + auth.mdp)))]);
      return h;
    }

    function envoyer(chemin, auth) {
      var p = port();
      var rep = S.requete({ chemin: chemin, methode: 'GET', client: 'navigateur', auth: auth, hote: hote(p), port: p,
        ua: navigator.userAgent, base: 'https://' + hote(p) });
      if (rep.connexion === false) {
        var corps = pageProxy(p);
        rep = { statut: 502, raison: 'Bad Gateway', corps: corps, type: 'text/html; charset=utf-8', taille: S.octets(corps), proxy: true,
          entetes: [['Date', new Date().toUTCString()], ['Content-Type', 'text/html; charset=utf-8'], ['Content-Length', String(S.octets(corps))]] };
      }
      var entree = { chemin: chemin, url: origine() + chemin, rep: rep, requete: enTetesRequete(chemin, auth) };
      entrees.push(entree);
      ajouterLigne(entree);
      evenement({ type: 'requete', requete: rep });
      return rep;
    }

    function protege(chemin) {
      return identifiants && chemin.indexOf(identifiants.prefixe) === 0 ? identifiants : null;
    }

    function charger(chemin, sansHistorique) {
      if (!port()) return;
      formAuth.hidden = true;
      enAttenteAuth = null;
      if (chemin.charAt(0) !== '/') chemin = '/' + chemin;
      var rep = envoyer(chemin, protege(chemin));
      var sauts = 0;
      while (rep.statut === 301 && rep.location && sauts < 5) {
        sauts++;
        chemin = rep.location.replace(/^https?:\/\/[^/]+/, '') || '/';
        rep = envoyer(chemin, protege(chemin));
      }
      if (!sansHistorique && cheminCourant !== null && cheminCourant !== chemin) historique.push(cheminCourant);
      cheminCourant = chemin;
      adresse.value = chemin;
      if (rep.statut === 401) {
        demanderIdentifiants(chemin, rep);
        return rep;
      }
      afficherReponse(rep);
      return rep;
    }

    function demanderIdentifiants(chemin, rep) {
      enAttenteAuth = { chemin: chemin, rep: rep };
      afficherReponse({ corps: '', type: 'text/html', taille: 0 });
      formAuth.hidden = false;
      formAuth.querySelector('.nav-auth-site').innerHTML = esc(origine()) + ' demande un nom d\'utilisateur et un mot de passe.' +
        (rep.realm ? '<br />Le site indique : « ' + esc(rep.realm) + ' »' : '');
      formAuth.user.value = '';
      formAuth.mdp.value = '';
      formAuth.user.focus();
    }

    // Comme un vrai navigateur : les identifiants saisis sont renvoyés pour
    // cette adresse et celles du même dossier, et les redirections suivies.
    formAuth.addEventListener('submit', function (evt) {
      evt.preventDefault();
      if (!enAttenteAuth) return;
      var chemin = enAttenteAuth.chemin;
      var ancien = identifiants;
      identifiants = { prefixe: chemin.replace(/[^/]*$/, '') || '/', user: formAuth.user.value, mdp: formAuth.mdp.value };
      var rep = charger(chemin, true);
      if (rep && rep.statut === 401) {
        identifiants = ancien;
        formAuth.querySelector('.nav-auth-site').insertAdjacentHTML('beforeend', '<br /><strong class="nav-auth-erreur">Identifiants refusés : réessaie.</strong>');
      }
    });
    formAuth.querySelector('[data-n="annuler"]').addEventListener('click', function () {
      if (!enAttenteAuth) return;
      var rep = enAttenteAuth.rep;
      formAuth.hidden = true;
      enAttenteAuth = null;
      afficherReponse(rep);
    });

    formAdresse.addEventListener('submit', function (evt) {
      evt.preventDefault();
      var v = adresse.value.trim();
      var m = /^https?:\/\/[^/]+(\/.*)?$/i.exec(v);
      if (m) v = m[1] || '/';
      charger(v || '/');
    });

    el.querySelector('[data-n="retour"]').addEventListener('click', function () {
      if (historique.length) charger(historique.pop(), true);
    });
    el.querySelector('[data-n="recharger"]').addEventListener('click', function () {
      charger(cheminCourant === null ? '/' : cheminCourant, true);
    });
    message.addEventListener('click', function (evt) {
      if (evt.target.closest('[data-n="charger"]')) charger('/');
    });

    // ---------- Outils de développement : Réseau ----------

    function classeStatut(s) {
      return s < 300 ? 'ok' : s < 400 ? 'redir' : 'ko';
    }
    function typeCourt(t) {
      return (t || '').split(';')[0].split('/').pop() || '—';
    }
    function nomCourt(chemin) {
      var p = chemin.replace(/\?.*$/, '').split('/').filter(Boolean);
      return p.length ? p[p.length - 1] + (/\/$/.test(chemin) ? '/' : '') : hote(port());
    }

    function ajouterLigne(entree) {
      var tr = document.createElement('tr');
      tr.className = 'st-' + classeStatut(entree.rep.statut);
      tr.tabIndex = 0;
      tr.innerHTML = '<td>' + entree.rep.statut + '</td><td>GET</td><td title="' + esc(entree.url) + '">' + esc(nomCourt(entree.chemin)) +
        '</td><td>' + esc(typeCourt(entree.rep.type)) + '</td><td>' + formatTaille(entree.rep.taille) + '</td>';
      tr.entree = entree;
      tbody.appendChild(tr);
      var liste = el.querySelector('.nav-dt-liste');
      liste.scrollTop = liste.scrollHeight;
    }
    function formatTaille(o) {
      return o < 1024 ? o + ' o' : (o / 1024).toFixed(1).replace('.', ',') + ' ko';
    }

    function montrerDetails(tr) {
      tbody.querySelectorAll('tr').forEach(function (x) {
        x.classList.toggle('choisie', x === tr);
      });
      var e = tr.entree;
      var r = e.rep;
      function bloc(titre, lignes) {
        return '<h5>' + titre + '</h5><dl>' + lignes.map(function (l) {
          return '<dt>' + esc(l[0]) + '</dt><dd>' + esc(l[1]) + '</dd>';
        }).join('') + '</dl>';
      }
      details.hidden = false;
      details.innerHTML = '<button type="button" class="nav-details-fermer" aria-label="Fermer les détails">×</button>' +
        bloc('Général', [['URL de la requête', e.url], ['Méthode de la requête', 'GET'],
          ['Code d\'état', r.statut + ' ' + r.raison], ['Adresse distante', '(proxy Killercoda) :443']]) +
        bloc('En-têtes de réponse', r.entetes) + bloc('En-têtes de requête', e.requete);
      details.querySelector('.nav-details-fermer').addEventListener('click', function () {
        details.hidden = true;
        tr.classList.remove('choisie');
      });
      evenement({ type: 'entetes', requete: r });
    }

    tbody.addEventListener('click', function (evt) {
      var tr = evt.target.closest('tr');
      if (tr) montrerDetails(tr);
    });
    tbody.addEventListener('keydown', function (evt) {
      if (evt.key === 'Enter' || evt.key === ' ') {
        var tr = evt.target.closest('tr');
        if (tr) {
          evt.preventDefault();
          montrerDetails(tr);
        }
      }
    });

    btnDevtools.addEventListener('click', function () {
      devtools.hidden = !devtools.hidden;
      btnDevtools.setAttribute('aria-pressed', !devtools.hidden);
      fenetre.classList.toggle('avec-devtools', !devtools.hidden);
      if (!devtools.hidden) evenement({ type: 'devtools' });
    });
    el.querySelector('[data-n="effacer"]').addEventListener('click', function () {
      entrees = [];
      tbody.innerHTML = '';
      details.hidden = true;
    });

    // ---------- Missions ----------

    function montrerBravo(txt, neutre) {
      bravo.textContent = txt;
      bravo.classList.toggle('neutre', !!neutre);
      bravo.classList.add('visible');
      clearTimeout(minuterieBravo);
      minuterieBravo = setTimeout(function () {
        bravo.classList.remove('visible');
      }, 5000);
    }
    S.on('mission', function (d) {
      if (d.source === 'navigateur') montrerBravo('✔ ' + (d.mission.bravo || 'Étape validée'));
    });

    S.on('reset', function () {
      cheminCourant = null;
      historique = [];
      identifiants = null;
      formAuth.hidden = true;
      majPorts();
    });

    majPorts();
    return { charger: charger };
  }

  return { creer: creer };
})();

// ---------- Poste de travail : onglets Terminal / Navigateur ----------

var Poste = (function () {
  function init(el) {
    var onglets = el.querySelectorAll('[data-onglet]');
    var panneaux = el.querySelectorAll('[data-panneau]');
    var cle = 'onglet-' + document.body.getAttribute('data-page');

    function montrer(nom, focus) {
      onglets.forEach(function (o) {
        var actif = o.getAttribute('data-onglet') === nom;
        o.setAttribute('aria-selected', actif);
        o.tabIndex = actif ? 0 : -1;
        if (actif) o.classList.remove('notif');
      });
      panneaux.forEach(function (p) {
        p.hidden = p.getAttribute('data-panneau') !== nom;
      });
      TP.ecrire(cle, nom);
      if (focus) {
        var champ = el.querySelector('[data-panneau="' + nom + '"] input:not([disabled])');
        if (nom === 'terminal' && champ) champ.focus();
      }
    }

    onglets.forEach(function (o) {
      o.addEventListener('click', function () {
        montrer(o.getAttribute('data-onglet'), true);
      });
    });

    // Nouvelle sortie dans le terminal pendant qu'on regarde le navigateur.
    var sortie = el.querySelector('[data-panneau="terminal"] .sortie');
    if (sortie && window.MutationObserver) {
      new MutationObserver(function () {
        var p = el.querySelector('[data-panneau="terminal"]');
        if (p && p.hidden) el.querySelector('[data-onglet="terminal"]').classList.add('notif');
      }).observe(sortie, { childList: true });
    }

    // Boutons placés dans les consignes : « ouvrir le navigateur », etc.
    document.querySelectorAll('[data-ouvrir-onglet]').forEach(function (b) {
      b.addEventListener('click', function () {
        montrer(b.getAttribute('data-ouvrir-onglet'), true);
        if (window.matchMedia('(max-width: 900px)').matches) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    montrer(TP.lire(cle, 'terminal') === 'navigateur' ? 'navigateur' : 'terminal');
    return { montrer: montrer };
  }
  return { init: init };
})();
