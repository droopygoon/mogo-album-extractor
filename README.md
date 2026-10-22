# 🐾 Monopoly Go - Album Extractor & Comparator

![Version](https://img.shields.io/badge/version-1.97-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

Un script simple, rapide et sécurisé pour extraire vos listes de stickers **Monopoly Go**, les partager sur le Cloud et les comparer instantanément avec vos amis pour optimiser vos échanges.

---

## 🚀 Installation Rapide

Pour installer le script ou le mettre à jour, rendez-vous sur la page officielle du projet :

👉 **[Accéder à la page d'installation](https://droopygoon.github.io/mogo-album-extractor/)**

*(Compatibilité optimale avec Violentmonkey sur PC/Android, Tampermonkey ou Greasemonkey).*

---

## ✨ Fonctionnalités Principales

### 📋 Extracteur d'Album & Inventaire
* **Extraction automatique** : Intercepte les données réseau de votre navigateur lors de la consultation de l'album en jeu.
* **Format Texte Formaté** : Un format propre (`Set-ID,ID,ID`) prêt à copier-coller sur Facebook, Discord ou Messenger.
* **Filtre Golds Dynamique** : Affichez ou masquez à tout moment les cartes Ors (mises en valeur entre crochets `[ID]` et dorées).

### 🔒 Sécurité & Protection de l'ID (v1.97)
* **Hachage Cryptographique SHA-256** : Vos mots de passe et réponses de sécurité sont hachés côté client via l'API Web Crypto du navigateur avant tout transit.
* **Question Secrète d'Oubli** : Possibilité de configurer une question de sécurité pour réinitialiser votre mot de passe en cas d'oubli.
* **Contrôle Strict Serveur** : Vérification préalable systématique en base de données avant toute modification d'identifiant.

### 🤝 Comparateur 1 à 1 & Favoris
* **Cloud & Favoris** : Enregistrez vos amis avec un surnom personnalisé et chargez leurs doubles/manquantes en un clic.
* **Comparaison Instantanée** : Calcul croisé automatique de vos cartes recevables (`Vos Manquantes ⚡ Ses Doubles`) et donnables (`Vos Doubles ⚡ Ses Manquantes`).
* **Bouton RàZ & Réinitialisation** : Effacez d'un clic les données comparées pour en charger de nouvelles proprement.

### 🔎 Recherche Globale & Filtre Récent
* **Scanner Réseau** : Scannez l'ensemble de votre liste d'amis en une action pour identifier instantanément qui possède vos cartes manquantes.
* **Filtre de Récence** : Filtrez les résultats par récence de mise à jour (*Aujourd'hui, 3 jours, 7 jours...*) pour ne contacter que des joueurs actifs.

### 🗓️ Gestion Dynamique des Saisons d'Album
* **Détection d'Album** : Le nom de l'album en cours (`AlbumName`) est enregistré sur le Cloud.
* **Filtrage des Anciens Albums** : Détecte et écarte automatiquement les amis restés sur un album précédent pour éviter les faux positifs lors des changements de saison.

---

## 🛠️ Comment l'utiliser ?

1. Connectez-vous à [Monopoly Go Web](https://www.monopolygo.com/).
2. Ouvrez votre **Album** en jeu (`sticker-album`).
3. Cliquez sur le bouton bleu **"🐾 Bilan Album"** qui apparaît en bas à droite de l'écran.
4. **Pour extraire :** Utilisez les boutons de copie dans l'onglet *"Mon Inventaire"*.
5. **Pour partager :** Cliquez sur *"☁️ Partager mon Album"* (pensez à sécuriser votre ID via *"🔓 Sécuriser ID"*).
6. **Pour comparer :** Allez dans *"🤝 Comparer 1 à 1"* ou *"🔎 Recherche Globale"*.

---

## 🛡️ Confidentialité & Transparence

* **Extraction Locale** : Le script intercepte uniquement les flux réseau envoyés par le jeu à votre propre navigateur.
* **Aucun Identifiant Jeu** : Il ne demande jamais vos identifiants de connexion Monopoly Go / Facebook.
* **Open Source** : Le code source est intégralement public et consultable sur ce dépôt.

---

## 👤 Auteur

Développé avec ❤️ par **Droopygoon**.

---

*Ce projet n'est pas affilié à Scopely ou Monopoly Go.*
