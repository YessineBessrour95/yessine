"""Backtest de la stratégie sur l'historique Bitvavo, frais inclus, comparé à « acheter et garder »."""
import sys
import numpy as np, pandas as pd
from bitvavo_client import Bitvavo
from strategie import INTERVALLE, PARAMS, indicateurs, signal_entree, signal_sortie

FRAIS = 0.0025  # taker Bitvavo (palier le plus bas)


def backtest(df, p=PARAMS, warmup=110):
    d = indicateurs(df, p)
    cash, qty, plus_haut, trades, equity = 1.0, 0.0, 0.0, [], []
    entree_px = None
    for i in range(warmup, len(d) - 1):
        row, nxt = d.iloc[i], d.iloc[i + 1]  # décision à la clôture, exécution à l'ouverture suivante
        if qty == 0 and signal_entree(row, p):
            qty = cash * (1 - FRAIS) / nxt.open; cash = 0; entree_px = nxt.open; plus_haut = nxt.open
        elif qty > 0:
            plus_haut = max(plus_haut, row.high)
            if signal_sortie(row, plus_haut, p):
                cash = qty * nxt.open * (1 - FRAIS); trades.append(nxt.open / entree_px - 1); qty = 0
        equity.append(cash + qty * d.close.iloc[i])
    eq = pd.Series(equity)
    dd = (eq / eq.cummax() - 1).min()
    bh = d.close.iloc[-1] / d.close.iloc[warmup] - 1
    t = np.array(trades) if trades else np.array([0.0])
    return dict(strat_pct=(eq.iloc[-1] - 1) * 100, buyhold_pct=bh * 100, max_drawdown_pct=dd * 100,
                bh_drawdown_pct=((d.close.iloc[warmup:] / d.close.iloc[warmup:].cummax()) - 1).min() * 100,
                trades=len(trades), gagnants_pct=(t > 0).mean() * 100,
                jours=(d.index[-1] - d.index[warmup]).days)


if __name__ == "__main__":
    api = Bitvavo()
    marches = sys.argv[1:] or ["BTC-EUR", "SOL-EUR", "QNT-EUR", "ETH-EUR", "XRP-EUR"]
    res = {m: backtest(api.history(m, INTERVALLE, 1500)) for m in marches}
    print(pd.DataFrame(res).T.round(1).to_string())
