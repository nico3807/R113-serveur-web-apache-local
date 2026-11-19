// Page Installation (parties 2 et 3) : terminal et navigateur d'entraînement,
// missions dans l'ordre du sujet. Les autres éléments interactifs (sortie de
// systemctl décodée, mini-jeu des ports, cartes) sont gérés par js/main.js.

(function () {
  Serveur.definirMissions([
    // 2. Installation
    { id: 'i-update', bravo: 'Index des paquets à jour.', test: function (c) {
      return (c.cmd === 'apt' || c.cmd === 'apt-get') && c.args[0] === 'update' && c.ok;
    } },
    { id: 'i-install', bravo: 'Apache est installé, et déjà démarré.', test: function (c) {
      return c.apache.installe;
    } },
    { id: 'i-status', bravo: 'Regarde la ligne « Active: » pour répondre à Q2.', test: function (c) {
      var status = c.cmd === 'systemctl' && c.args[0] === 'status' && /^apache2(\.service)?$/.test(c.args[1] || '') ||
        c.cmd === 'service' && c.args[0] === 'apache2' && c.args[1] === 'status';
      return status && c.apache.etat === 'actif';
    } },
    // 3. Accès et exposition
    { id: 'i-port', bravo: 'Port 80 exposé : regarde l\'adresse générée par Killercoda.', test: function (c) {
      return c.type === 'port' && c.port === 80;
    } },
    { id: 'i-itworks', bravo: 'Ton serveur répond au navigateur.', test: function (c) {
      return c.source === 'navigateur' && c.requete && c.requete.statut === 200;
    } },
    { id: 'i-curl', bravo: 'Depuis la machine elle-même, le site répond aussi sur localhost.', test: function (c) {
      return c.cmd === 'curl' && c.requete && c.requete.statut === 200;
    } }
  ]);

  var t = document.getElementById('terminal-installation');
  if (t) Terminal.creer(t, {});
  var n = document.getElementById('navigateur-installation');
  if (n) Navigateur.creer(n);
  var poste = document.getElementById('poste');
  if (poste) Poste.init(poste);
})();
