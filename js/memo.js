// Page Mémo : filtre des commandes, boutons « copier » et quiz « quelle
// commande ? ».

(function () {
  // ---------- Filtre ----------
  var filtre = document.getElementById('filtre');
  if (filtre) {
    filtre.addEventListener('input', function () {
      var q = filtre.value.trim().toLowerCase();
      document.querySelectorAll('[data-filtrable] tbody tr').forEach(function (tr) {
        tr.hidden = q && tr.textContent.toLowerCase().indexOf(q) === -1;
      });
    });
  }

  // ---------- Copier une commande ----------
  document.querySelectorAll('[data-copie]').forEach(function (code) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'copier';
    b.textContent = 'copier';
    b.setAttribute('aria-label', 'Copier ' + code.textContent);
    b.addEventListener('click', function () {
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(code.textContent).then(function () {
        b.textContent = 'copié ✔';
        setTimeout(function () {
          b.textContent = 'copier';
        }, 1500);
      });
    });
    code.insertAdjacentElement('afterend', b);
  });

  // ---------- Quiz « quelle commande ? » ----------
  var QUIZ = [
    { q: 'Mettre à jour l\'index des paquets.', r: ['apt update', 'apt-get update'] },
    { q: 'Installer le serveur web Apache.', r: ['apt install apache2', 'apt-get install apache2', 'apt install -y apache2', 'apt install apache2 -y'] },
    { q: 'Afficher l\'état du service Apache.', r: ['systemctl status apache2', 'service apache2 status'] },
    { q: 'Faire relire sa configuration à Apache, sans l\'arrêter.', r: ['systemctl reload apache2', 'service apache2 reload'] },
    { q: 'Créer le compte etudiant.', r: ['adduser etudiant'] },
    { q: 'Ouvrir une session en tant qu\'etudiant.', r: ['su - etudiant', 'su -l etudiant', 'su etudiant'] },
    { q: 'Rendre etudiant (utilisateur et groupe) propriétaire de /var/www/html.', r: ['chown etudiant:etudiant /var/www/html', 'chown etudiant:etudiant /var/www/html/'] },
    { q: 'Donner aux « autres » le droit de traverser /home/etudiant.', r: ['chmod o+x /home/etudiant', 'chmod o+x /home/etudiant/'] },
    { q: 'Activer le fichier de configuration mon_alias.', r: ['a2enconf mon_alias', 'a2enconf mon_alias.conf'] },
    { q: 'Vérifier la syntaxe de la configuration d\'Apache.', r: ['apache2ctl configtest', 'apachectl configtest', 'apache2ctl -t', 'apachectl -t'] },
    { q: 'Suivre en temps réel le journal d\'accès d\'Apache.', r: ['tail -f /var/log/apache2/access.log'] },
    { q: 'Créer le fichier /etc/apache2/.htpasswd avec le compte admin.', r: ['htpasswd -c /etc/apache2/.htpasswd admin'] }
  ];

  var bloc = document.getElementById('quiz-cmd');
  if (!bloc) return;
  var enonce = bloc.querySelector('.q-enonce');
  var input = bloc.querySelector('input');
  var fb = bloc.querySelector('.feedback');
  var compte = bloc.querySelector('.q-compte');
  var ordre = QUIZ.map(function (_, i) {
    return i;
  }).sort(function () {
    return Math.random() - 0.5;
  });
  var pos = 0;
  var bons = 0;
  var essaye = false;

  function afficher() {
    if (pos >= ordre.length) {
      enonce.textContent = 'Terminé : ' + bons + ' / ' + ordre.length + ' du premier coup. Recharge la page pour rejouer.';
      bloc.querySelector('form').hidden = true;
      return;
    }
    enonce.textContent = QUIZ[ordre[pos]].q;
    compte.textContent = 'Question ' + (pos + 1) + ' / ' + ordre.length;
    input.value = '';
    essaye = false;
  }

  bloc.querySelector('form').addEventListener('submit', function (evt) {
    evt.preventDefault();
    var item = QUIZ[ordre[pos]];
    var rep = input.value.trim().replace(/\s+/g, ' ');
    if (item.r.indexOf(rep) !== -1) {
      if (!essaye) bons++;
      fb.className = 'feedback ok';
      fb.textContent = '✔ Exact : ' + rep;
      pos++;
      afficher();
    } else {
      essaye = true;
      fb.className = 'feedback ko';
      fb.textContent = '✖ Pas tout à fait. Réponse attendue : ' + item.r[0] + ' (retape-la pour continuer).';
    }
  });

  afficher();
})();
