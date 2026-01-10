// --- VARIABLES GLOBALES DU GÉNÉRATEUR ---
let passwordLength = 12;

// Variables booléennes (initialisées selon l'état des checkboxes dans index.html)
let includeUppercase = true;
let includeNumbers = false;
let includeSymbols = false;

// Constantes pour les caractères disponibles
const CHARS_MIN = "abcdefghijklmnopqrstuvwxyz";
const CHARS_MAJ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CHARS_NUM = "0123456789";
const CHARS_SYM = "!@#$%^&*()_+~`|}{[]:;?><,./-=";

// --- FONCTIONS DE CONTRÔLE (Parties 1 & 2) ---

/**
 * Lit la valeur de l'input de longueur et met à jour la variable globale.
 */
function setPasswordLength() {
  const input = document.getElementById("length-input");
  // Mettre à jour la variable globale (sans 'let')
  passwordLength = parseInt(input.value);
}

/**
 * Lit l'état des checkboxes et met à jour les variables booléennes globales.
 */
function updateOptions() {
  includeUppercase = document.getElementById("include-uppercase").checked;
  includeNumbers = document.getElementById("include-numbers").checked;
  includeSymbols = document.getElementById("include-symbols").checked;

  // Après toute modification d'option, on peut relancer une génération
  // pour que l'utilisateur voie l'impact (Optionnel)
  generatePassword();
}

// --- FONCTION PRINCIPALE DE GÉNÉRATION (Parties 1 & 2) ---

/**
 * Génère un mot de passe basé sur la longueur et les options choisies.
 */
function generatePassword() {
  // Les minuscules sont la base de la chaîne de caractères
  let allCharacters = CHARS_MIN;

  // Construction conditionnelle de la chaîne source (Q3)
  if (includeUppercase) {
    allCharacters += CHARS_MAJ;
  }
  if (includeNumbers) {
    allCharacters += CHARS_NUM;
  }
  if (includeSymbols) {
    allCharacters += CHARS_SYM;
  }

  // Vérification de l'erreur si aucune option n'est sélectionnée (Q3)
  if (allCharacters.length === CHARS_MIN.length) {
    document.getElementById("password-display").textContent =
      "Erreur : Choisissez au moins une option !";
    document.getElementById("strength-display").textContent = "Force : N/A";
    document.getElementById("strength-display").style.color = "#888";
    return;
  }

  // Génération du mot de passe (Q2)
  let password = "";
  for (let i = 0; i < passwordLength; i++) {
    // Choix d'un index aléatoire dans la chaîne dynamique allCharacters
    const indexAleatoire = Math.floor(Math.random() * allCharacters.length);

    // Ajout du caractère correspondant
    password += allCharacters[indexAleatoire];
  }

  // Affichage du mot de passe
  document.getElementById("password-display").textContent = password;

  // Partie 3. Intégration de la force
  const strength = checkPasswordStrength(password);
  const strengthDisplay = document.getElementById("strength-display");

  strengthDisplay.textContent = "Force : " + strength;

  // Style dynamique (Bonus)
  if (strength === "Fort") {
    strengthDisplay.style.color = "green";
  } else if (strength === "Moyen") {
    strengthDisplay.style.color = "orange";
  } else {
    strengthDisplay.style.color = "red";
  }
}

// --- FONCTION D'ANALYSE DE LA FORCE (Partie 3) ---

/**
 * Évalue la force du mot de passe selon des critères simples.
 * @param {string} password Le mot de passe généré.
 * @returns {string} "Faible", "Moyen" ou "Fort".
 */
function checkPasswordStrength(password) {
  const length = password.length;

  // Compte le nombre d'options utilisées (Q3)
  let optionsCount = 0;
  if (includeUppercase) optionsCount++;
  if (includeNumbers) optionsCount++;
  if (includeSymbols) optionsCount++;

  // Critères (Q3)
  if (length >= 16 && optionsCount >= 3) {
    return "Fort";
  }

  if (length < 10 && optionsCount < 2) {
    return "Faible";
  }

  return "Moyen"; // Tous les autres cas
}

// --- FONCTION PÉDAGOGIQUE POUR LE MENU (Gestion des blocs de code) ---

/**
 * Fonction JavaScript appelée par le bouton pour déployer/rétracter les blocs de code.
 * Elle utilise la propriété 'originalDescription' pour restaurer correctement le titre.
 */
function toggleCode(button) {
  // 1. Stocker le texte descriptif initial (ex: "Indice de syntaxe...")
  if (!button.originalDescription) {
    button.originalDescription = button.textContent.substring(4).trim();
  }

  // 2. Sélectionne le div.code-content (élément masqué)
  const content = button.nextElementSibling;

  // 3. Bascule la classe CSS 'is-expanded'
  content.classList.toggle("is-expanded");

  // 4. Mise à jour du texte du bouton [+] ou [-]
  if (content.classList.contains("is-expanded")) {
    button.textContent = "[ - ] Masquer le code";
  } else {
    // Rétablit le [+] et la description stockée
    button.textContent = "[ + ] " + button.originalDescription;
  }
}

// --- INITIALISATION AU CHARGEMENT DE LA PAGE (CORRIGÉE) ---

window.onload = function () {
  // Vérifie si l'élément principal d'affichage du générateur existe.
  // Cette condition est VRAIE sur index.html et FAUSSE sur page_X.html
  const passwordDisplay = document.getElementById("password-display");

  if (passwordDisplay) {
    // Le code du générateur ne s'exécute que sur la page de démonstration.
    setPasswordLength();
    updateOptions();
    generatePassword();
  }

  // Note: La fonction toggleCode() n'a pas besoin d'être conditionnée,
  // car elle est appelée par l'utilisateur via onclick uniquement si les boutons existent.
};
