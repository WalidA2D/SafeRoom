# SafeRoom

Application mobile de securite pour hotel, Airbnb et location courte duree.

Le projet contient :

- un frontend Expo / React Native
- un backend Node.js / Express
- une integration Firebase (Auth + Firestore + Storage)
- des scans natifs BLE / Wi-Fi de proximite
- une analyse LAN cote backend

## Prerequis

- Node.js 20+
- npm
- Android Studio pour Android
- Xcode pour iOS
- un projet Firebase configure
- le fichier `scripts/serviceAccountKey.json`

## Important

Les scans BLE et Wi-Fi utilisent des modules natifs.

`Expo Go` ne suffit pas pour tester l'application complete.

Il faut utiliser un dev build :

- `npx expo run:android`
- `npx expo run:ios`

## Variables d'environnement

Le fichier `.env` doit contenir au minimum :

```env
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=...
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
EXPO_PUBLIC_FIREBASE_APP_ID=...
EXPO_PUBLIC_API_BASE_URL=...
```

Notes :

- Le backend demarre par defaut sur le port `4000`.
- Si `EXPO_PUBLIC_API_BASE_URL` est vide, l'app essaye de deviner l'URL du backend.
- Sur telephone reel, si besoin, mets par exemple :

Adapte l'IP a ta machine.

## Installation

Depuis la racine du projet :

```bash
npm install
```

## Lancer le backend

Depuis la racine du projet :

```bash
npm run server
```

Equivalent :

```bash
node server/index.js
```

Le backend utilise :

- `.env`
- `scripts/serviceAccountKey.json`

## Lancer l'application mobile

### Premiere compilation Android

```bash
npx expo run:android
```

### Premiere compilation iOS

```bash
npx expo run:ios
```

### Demarrer Metro ensuite

```bash
npm start
```

Puis ouvre le dev build SafeRoom sur l'emulateur ou le telephone.

## Commandes utiles

### Frontend web

```bash
npm run web
```

Attention :

- le web ne permet pas les scans natifs BLE / Wi-Fi

### Verification TypeScript

```bash
npm exec tsc --noEmit
```

### Verification syntaxe backend

```bash
node -c server/index.js
```

## Demarrage rapide

Ouvre 2 terminaux a la racine du projet.

Terminal 1 :

```bash
npm run server
```

Terminal 2 :

```bash
npm start
```

Si c'est la premiere fois sur Android :

```bash
npx expo run:android
```

## Problemes frequents

### 1. L'app ne rejoint pas le backend

Verifie :

- que le backend tourne sur `4000`
- que le telephone et le PC sont sur le meme reseau
- que `EXPO_PUBLIC_API_BASE_URL` pointe vers la bonne IP locale

### 2. Le scan BLE / Wi-Fi ne marche pas

Verifie :

- que tu n'utilises pas `Expo Go`
- que les permissions Bluetooth / localisation sont acceptees
- que tu as bien lance un dev build natif

### 3. Firebase ne demarre pas

Verifie :

- le contenu du `.env`
- la presence du fichier `scripts/serviceAccountKey.json`
- les droits du compte de service Firebase

## Structure rapide

- `app/` : ecrans Expo Router
- `components/` : composants UI
- `services/` : appels API, scans, logique cliente
- `store/` : etat global Zustand
- `server/` : backend Express
- `scripts/serviceAccountKey.json` : credentials Firebase Admin

## Conseils de test

Pour tester le scan complet :

1. Lance le backend.
2. Lance le dev build mobile.
3. Connecte le telephone au meme Wi-Fi que ta machine.
4. Ouvre SafeRoom.
5. Lance une analyse.

Tu pourras alors tester :

- le scan BLE de proximite
- le scan Wi-Fi voisin sur Android
- l'analyse LAN envoyee au backend
- l'enregistrement des rapports dans Firebase
