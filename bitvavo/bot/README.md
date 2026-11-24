# Bot de trading Bitvavo

Stratégie de **suivi de tendance sur bougies journalières** :
- **Achat** quand EMA10 > EMA30, clôture > EMA30 et > EMA100 (tendance de fond), RSI entre 50 et 80.
- **Vente** quand la clôture passe sous l'EMA30, ou stop suiveur à 3 × ATR sous le plus haut atteint.

## Fichiers
| Fichier | Rôle |
|---|---|
| `bot.py` | Le bot (simulation par défaut, `--live` pour le réel) |
| `strategie.py` | Règles d'achat / vente et paramètres |
| `scanner.py` | Sélection des cryptos et score de force |
| `backtest_portefeuille.py` | Backtest du mode scanner |
| `backtest.py` | Test de la stratégie sur l'historique Bitvavo, frais inclus |
| `bitvavo_client.py` | Connexion à l'API Bitvavo |
| `config.json` | Budget par crypto, limites de sécurité |

## Utilisation
```bash
pip install pandas numpy
python3 backtest.py              # voir les résultats historiques
python3 bot.py                   # une passe en SIMULATION
python3 bot.py --boucle          # simulation en continu (vérifie toutes les heures)
python3 bot.py --scan            # analyse les 30 cryptos les plus échangées (aucun ordre)
python3 backtest_portefeuille.py # backtest du mode scanner
```

## Filtre BTC et mode scanner (config.json)
- `filtre_btc: true` : le bot n'achète rien tant que le bitcoin clôture sous sa moyenne EMA100.
  En backtest, ce filtre améliore les résultats sur 1, 2 et 3 ans.
- `scanner.actif: true` : au lieu des marchés fixes de `marches`, le bot surveille la liste `scanner.marches`
  (12 grandes cryptos), achète celles qui ont un signal en commençant par les plus fortes sur 30 jours,
  avec au plus `max_positions` positions de `budget_total_eur / max_positions` chacune.
- Backtest : trader automatiquement les 30 cryptos les plus échangées (petites cryptos incluses)
  **fait perdre de l'argent** (-18 % à -63 %). Le scanner est donc limité aux grandes cryptos.

## Passer en réel
1. Sur Bitvavo : Paramètres → API → créer une clé avec **Consulter + Trader**, **jamais Retirer**.
   Limiter la clé à l'adresse IP de la machine qui fait tourner le bot si possible.
2. `cp .env.example .env` et y mettre la clé et le secret (le fichier `.env` n'est jamais commité).
3. `python3 bot.py --live --boucle` (le bot demande de taper OUI).

## Sécurités
- `max_ordre_eur` : montant maximum par ordre.
- `perte_max_pct` : si les pertes réalisées dépassent ce % du budget, le bot n'achète plus.
- `reprendre_positions_existantes` : `false` = le bot ne touche qu'aux cryptos qu'il a achetées lui-même.
  `true` = il peut aussi vendre tes BTC/SOL/QNT déjà détenus si la stratégie dit de sortir.
- Décisions uniquement sur bougies clôturées ; aucune fonction de retrait dans le code.

⚠️ Les performances passées ne garantissent rien. Lance-le d'abord plusieurs semaines en simulation.

## Rapport automatique chaque matin (Windows)
1. Double-clique sur **`installer_tache.bat`** : crée la tâche « Bot Bitvavo » tous les jours à 8h00.
2. Chaque matin, le rapport s'ouvre dans le Bloc-notes et il est gardé dans `rapports/rapport_AAAA-MM-JJ.txt`.
3. Pour tester tout de suite : double-clique sur **`lancer_bot.bat`**.
4. Pour arrêter : double-clique sur **`desinstaller_tache.bat`**.

Si le PC est éteint à 8h, la tâche se lance dès qu'il est rallumé. Le PC doit avoir une session ouverte.
Ne déplace pas le dossier après l'installation (sinon relance `installer_tache.bat`).
