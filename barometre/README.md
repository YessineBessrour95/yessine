# Baromètre social / QVT

Application web de baromètre social et de qualité de vie au travail :
questionnaire anonyme de **40 questions** (8 dimensions × 5 questions), collecte des réponses dans
une base SQLite et tableau de bord d'analyse pour les RH.

Aucune dépendance externe : Node.js ≥ 22.5 suffit (serveur `node:http` + base `node:sqlite`).

## Démarrage

```bash
cd barometre
ADMIN_TOKEN=mon-jeton-secret npm start
```

- Questionnaire salariés : http://localhost:3000/
- Tableau de bord RH : http://localhost:3000/admin (connexion avec `ADMIN_TOKEN`)

Données de démonstration (2 campagnes fictives) : `npm run seed`, puis `npm start`.
Tests : `npm test`.

| Variable      | Rôle                                   | Défaut                          |
|---------------|----------------------------------------|---------------------------------|
| `ADMIN_TOKEN` | Jeton d'accès au tableau de bord        | généré et affiché au démarrage  |
| `PORT`        | Port HTTP                               | `3000`                          |
| `DB_FILE`     | Fichier de la base SQLite               | `data/barometre.db`             |

## Les 8 dimensions (5 questions chacune)

1. Sens et contenu du travail
2. Charge et organisation du travail
3. Management de proximité
4. Relations et climat d'équipe
5. Reconnaissance et rémunération
6. Développement et carrière
7. Équilibre de vie et santé
8. Communication et confiance envers la direction

Les questions, les critères de profil (service, ancienneté, statut) et le seuil d'anonymat sont
définis dans `src/questions.js` : c'est le seul fichier à modifier pour adapter le questionnaire.

## Méthode de calcul

- Échelle de Likert en 5 points + « Ne se prononce pas » (exclu des calculs).
- Les questions formulées négativement (`reverse: true`, marquées (*)) sont inversées (6 − valeur).
- **Score sur 100** d'une question = (moyenne − 1) / 4 × 100 ; 50 correspond à une position neutre.
- **% favorables** = part des réponses « Plutôt d'accord » et « Tout à fait d'accord ».
- Score d'une dimension = moyenne de ses 5 questions ; **indice global** = moyenne des 8 dimensions.
- L'**évolution** est calculée par rapport à la campagne précédente, avec les mêmes filtres.

## Anonymat

- Aucune donnée d'identification n'est collectée (ni nom, ni e-mail, ni adresse IP).
- Un groupe (filtre ou sous-population) de moins de **5 répondants** n'est jamais affiché.
- Les données de profil sont facultatives.

## Fonctionnalités

**Questionnaire** : une page par dimension, barre de progression, contrôle des réponses manquantes,
brouillon sauvegardé automatiquement dans le navigateur, profil et commentaire libre facultatifs,
adapté au mobile.

**Tableau de bord** : indice global, % favorables, nombre de répondants et taux de participation,
radar des 8 dimensions (comparé à la campagne précédente), points forts / de vigilance, répartition
des réponses pour chacune des 40 questions, indice par service / ancienneté / statut, commentaires
libres, filtres, export CSV (compatible Excel), gestion des campagnes (création, ouverture/fermeture,
effectif ciblé).

## API

| Méthode | Route                          | Accès  | Description |
|---------|--------------------------------|--------|-------------|
| GET     | `/api/questionnaire`           | public | Questions, échelle, profils, campagne ouverte |
| POST    | `/api/responses`               | public | Enregistre une réponse |
| GET     | `/api/admin/campaigns`         | admin  | Liste des campagnes |
| POST    | `/api/admin/campaigns`         | admin  | Crée et ouvre une campagne `{ name, headcount }` |
| POST    | `/api/admin/campaigns/:id`     | admin  | Modifie `{ name, headcount, active }` |
| GET     | `/api/admin/results`           | admin  | Résultats (`?campaign=&service=&seniority=&status=`) |
| GET     | `/api/admin/export.csv`        | admin  | Export brut des réponses |

Les routes admin attendent l'en-tête `Authorization: Bearer <ADMIN_TOKEN>`.

## Limites connues

Les réponses étant anonymes, une même personne pourrait répondre plusieurs fois (seul le navigateur
garde la trace d'une participation). Pour un contrôle strict, on peut ajouter des codes d'accès à
usage unique distribués aléatoirement. En production, placer l'application derrière HTTPS.
