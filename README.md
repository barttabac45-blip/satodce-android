# SatoDCE pour Android

Appli Android officielle de [SatoDCE](https://satodce.fr) : la Web App FC et SatoDCE dans une seule appli, **sans favori ni signet à créer**.

## Installer

- **Lien direct (toujours la dernière version)** :
  `https://github.com/barttabac45-blip/satodce-android/releases/latest/download/SatoDCE.apk`
- **Avec Downloader** (Android TV, Fire TV, tablette) : saisis le lien ci-dessus dans Downloader, puis installe le fichier.
- Android 8 ou plus récent. Android demande d’autoriser l’installation depuis l’appli qui télécharge le fichier (navigateur ou Downloader).

## Utiliser

Les automatismes d’achat et de vente sont désactivés par défaut à l’installation.
Un appui long sur l’onglet SatoDCE, puis **Options du marché (achat et vente)**,
permet de les activer séparément ; les choix sont conservés.
Sans automatisme d’achat, **Acheter dans FC** ouvre toutes les offres de la version
exacte du joueur, avec le moins cher de la page affichée en vert.
Sans automatisme de vente, aucune recherche ni modification des prix n’est lancée.
Les recherches et préremplissages automatiques décrits ci-dessous nécessitent
l’activation de l’option correspondante.

1. L’application s’ouvre toujours sur **FC Web App** pour te connecter à EA. L’onglet **Site SatoDCE** permet de te connecter à ton compte SatoDCE et de retrouver tes calculs.
2. En haut, **Équipe** permet de lancer l’import du club, de l’équipe et des DCE ; **Album** met à jour la collection depuis FC ou SatoDCE.
3. SatoDCE s’ouvre, calcule la solution ; *Placer dans le DCE FC* remplit le DCE et te ramène automatiquement dans l’onglet FC après confirmation du placement. Tu peux ensuite valider le DCE dans FC.

Les deux onglets du bas (**FC Web App** et **Site SatoDCE**) affichent leur logo et
un fond bleu pour l’onglet actif. En haut d’un DCE ouvert dans FC, le bouton
**Résoudre dans SatoDCE** ouvre le même défi dans SatoDCE, sans lancer la recherche
avant ton clic. Le bouton maison revient à l’accueil de l’écran utilisé ; Retour
revient aux écrans précédents sans fermer l’application. Un appui long sur l’onglet
SatoDCE ouvre les options et la recherche de mises à jour.

Sur le marché et dans **Comparer les prix**, **Comparer les pages suivantes** parcourt
les pages à partir de la page ouverte, avec des pauses variables et un bouton d’arrêt.
Le prix le plus bas observé est mémorisé par version de carte, sans sélection automatique.
À l’ouverture de « Lister / Relister l’élément », l’appli recherche en arrière-plan le
prix le plus bas de la version exacte du joueur sur tout le marché, sans ouvrir
l’écran du marché. Elle indique le minimum dans le panneau sous la carte et préremplit
les prix un palier en dessous, dans les limites FC. La recherche abaisse le plafond
d’achat immédiat jusqu’à vérifier qu’aucune offre moins chère n’existe, quelle que soit
sa page. En cas d’arrêt ou d’erreur, les prix restent inchangés. La mise en vente reste manuelle.
Les pauses variables ne garantissent pas que cette automatisation soit acceptée par EA.

La connexion à ton compte SatoDCE (Google) se fait dans le navigateur du téléphone, puis l’appli reprend la main automatiquement.

La connexion FC conserve les cartes enregistrées sans lancer de synchronisation.
Appuie sur **Équipe** pour importer ou actualiser ton club, ton équipe et les DCE.
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
seule version est affichée, elle reste simplement surlignée, sans sélection.
Sur l’écran de vente, les prix préremplis respectent les limites FC et la version exacte.
La mise en vente reste manuelle.

À chaque lancement, l’appli vérifie les nouvelles versions et propose automatiquement de les installer avec les boutons **Mettre à jour** et **Plus tard**. La recherche manuelle reste disponible par un appui long sur l’onglet SatoDCE, puis **Rechercher une mise à jour de l’appli**. Le connecteur FC est téléchargé depuis satodce.fr à chaque utilisation : il est toujours à jour sans réinstaller l’appli.

## Construire

```
node build-reconnect.mjs
./gradlew assembleRelease
```

La signature de publication lit `signing.properties` (non versionné) : `storeFile`, `storePassword`, `keyAlias`, `keyPassword`.

---
Appli indépendante, non affiliée à EA ni à FIFA. Elle affiche le site officiel de la Web App FC ; son utilisation reste soumise aux conditions d’EA.
