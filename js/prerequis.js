// Page Prise en main : terminal d'entraînement et missions de la partie 1.2
// (identité de l'utilisateur, version du système).

(function () {
  Serveur.definirMissions([
    { id: 'p-whoami', bravo: 'Tu es bien root, l\'administrateur de la machine.', test: function (c) {
      return c.cmd === 'whoami' && c.user === 'root';
    } },
    { id: 'p-os', bravo: 'Le fichier /etc/os-release indique la version du système.', test: function (c) {
      return c.cmd === 'cat' && c.ok && c.args.some(function (a) {
        return /os-release$/.test(a);
      });
    } }
  ]);

  var el = document.getElementById('terminal-prise-en-main');
  if (el) Terminal.creer(el, {});
})();
