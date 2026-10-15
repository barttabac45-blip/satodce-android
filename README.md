# SatoDCE pour Android

Appli Android officielle de [SatoDCE](https://satodce.fr) : la Web App FC et SatoDCE dans une seule appli, **sans favori ni signet à créer**.

## Installer

- **Lien direct (toujours la dernière version)** :
  `https://github.com/barttabac45-blip/satodce-android/releases/latest/download/SatoDCE.apk`
- **Avec Downloader** (Android TV, Fire TV, tablette) : saisis le lien ci-dessus dans Downloader, puis installe le fichier.
- Android 8 ou plus récent. Android demande d’autoriser l’installation depuis l’appli qui télécharge le fichier (navigateur ou Downloader).

## Utiliser

1. Onglet **FC Web App** : connecte-toi à ton compte EA comme d’habitude.
2. L’équipe se synchronise automatiquement après la connexion FC. En haut, **Équipe** permet de relancer l’import du club, de l’équipe et des DCE ; **Album** met à jour la collection depuis FC ou SatoDCE.
3. SatoDCE s’ouvre, calcule la solution ; *Placer dans le DCE FC* remplit le DCE et te ramène automatiquement dans l’onglet FC après confirmation du placement. Tu peux ensuite valider le DCE dans FC.

Les deux onglets du bas (**FC Web App** et **Site SatoDCE**) affichent leur logo et
un fond bleu pour l’onglet actif. En haut d’un DCE ouvert dans FC, le bouton
**Résoudre dans SatoDCE** ouvre le même défi dans SatoDCE, sans lancer la recherche
avant ton clic. Le bouton maison revient à l’accueil de l’écran utilisé ; Retour
revient aux écrans précédents sans fermer l’application. Un appui long sur l’onglet
SatoDCE ouvre les options et la recherche de mises à jour.

La connexion à ton compte SatoDCE (Google) se fait dans le navigateur du téléphone, puis l’appli reprend la main automatiquement.

L’équipe est synchronisée automatiquement dès que le compte FC est connecté,
y compris après la toute première connexion, à chaque réouverture de l’appli et
après une déconnexion suivie d’une reconnexion à FC.
Les cartes enregistrées restent disponibles pendant cette actualisation.
Si EA demande une nouvelle connexion, reconnecte-toi dans l’onglet FC ; le lien
reprend ensuite automatiquement. Les cartes choisies sont vérifiées dans FC au
moment du placement.

## Mises à jour

## Comptes locaux (Android 9 et plus)

Le bouton **Comptes**, visible dans FC et SatoDCE, permet de choisir jusqu’à
quatre profils. Chaque profil conserve séparément les sessions EA et SatoDCE,
le club, l’album et les préférences. Connecte une première fois les deux comptes
associés dans le profil choisi ; changer de profil bascule ensuite les deux
écrans ensemble. Le profil **Compte actuel** conserve les données déjà présentes.
Les mots de passe EA ne sont pas enregistrés par SatoDCE ; la session officielle
EA est conservée localement et EA peut demander une nouvelle connexion.

Le sélecteur ne détecte pas automatiquement les associations entre comptes :
c’est la paire connectée dans chaque profil qui est mémorisée. Utilise le bouton
Comptes pour changer de paire ; les connexions effectuées directement dans les
sites concernent uniquement le profil ouvert.

Dans les résultats du marché, l’offre au prix Achat immédiat le plus bas parmi
les résultats affichés est mise en évidence pour chaque version exacte. Si une
seule version est affichée, elle est sélectionnée automatiquement, sans achat.
Sur l’écran de vente, **Un palier sous le moins cher** compare la même version et
remplit les prix en respectant les limites FC. La mise en vente reste manuelle.

L’appli vérifie les nouvelles versions publiées ici et propose de les installer (menu **⚡ SatoDCE → Rechercher une mise à jour**). Le connecteur FC est téléchargé depuis satodce.fr à chaque utilisation : il est toujours à jour sans réinstaller l’appli.

## Construire

```
node build-reconnect.mjs
./gradlew assembleRelease
```

La signature de publication lit `signing.properties` (non versionné) : `storeFile`, `storePassword`, `keyAlias`, `keyPassword`.

---
Appli indépendante, non affiliée à EA ni à FIFA. Elle affiche le site officiel de la Web App FC ; son utilisation reste soumise aux conditions d’EA.
