# Bot de trading Bitvavo

Stratégie de **suivi de tendance sur bougies journalières** :
- **Achat** quand EMA10 > EMA30, clôture > EMA30 et > EMA100 (tendance de fond), RSI entre 50 et 80.
- **Vente** quand la clôture passe sous l'EMA30, ou stop suiveur à 3 × ATR sous le plus haut atteint.

## Fichiers
| Fichier | Rôle |
|---|---|
| `bot.py` | Le bot (simulation par défaut, `--live` pour le réel) |
| `strategie.py` | Règles d'achat / vente et paramètres |
| `backtest.py` | Test de la stratégie sur l'historique Bitvavo, frais inclus |
| `bitvavo_client.py` | Connexion à l'API Bitvavo |
| `config.json` | Budget par crypto, limites de sécurité |

## Utilisation
```bash
pip install pandas numpy
python3 backtest.py              # voir les résultats historiques
python3 bot.py                   # une passe en SIMULATION
python3 bot.py --boucle          # simulation en continu (vérifie toutes les heures)
```

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
