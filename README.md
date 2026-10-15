# SatoDCE pour Android

Appli Android officielle de [SatoDCE](https://satodce.fr) : la Web App FC et SatoDCE dans une seule appli, **sans favori ni signet à créer**.

## Installer

- **Lien direct (toujours la dernière version)** :
  `https://github.com/barttabac45-blip/satodce-android/releases/latest/download/SatoDCE.apk`
- **Avec Downloader** (Android TV, Fire TV, tablette) : saisis le lien ci-dessus dans Downloader, puis installe le fichier.
- Android 8 ou plus récent. Android demande d’autoriser l’installation depuis l’appli qui télécharge le fichier (navigateur ou Downloader).

## Utiliser

1. Onglet **FC Web App** : connecte-toi à ton compte EA comme d’habitude.
2. Ouvre ton club ou le DCE voulu, puis touche **⚡ SatoDCE** → *Importer mon équipe et le DCE ouvert* (ou *Synchroniser ma collection* pour l’album).
3. SatoDCE s’ouvre, calcule la solution ; *Placer dans le DCE FC* remplit le DCE. Valide ensuite dans l’onglet FC.

La connexion à ton compte SatoDCE (Google) se fait dans le navigateur du téléphone, puis l’appli reprend la main automatiquement.

## Mises à jour

L’appli vérifie les nouvelles versions publiées ici et propose de les installer (menu **⚡ SatoDCE → Rechercher une mise à jour**). Le connecteur FC est téléchargé depuis satodce.fr à chaque utilisation : il est toujours à jour sans réinstaller l’appli.

## Construire

```
./gradlew assembleRelease
```

La signature de publication lit `signing.properties` (non versionné) : `storeFile`, `storePassword`, `keyAlias`, `keyPassword`.

---
Appli indépendante, non affiliée à EA ni à FIFA. Elle affiche le site officiel de la Web App FC ; son utilisation reste soumise aux conditions d’EA.
