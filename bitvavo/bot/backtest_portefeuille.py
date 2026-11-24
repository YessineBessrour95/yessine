"""Backtest du mode scanner : N cryptos analysées, on détient au plus K positions à la fois,
choisies parmi celles qui ont un signal d'achat, classées par force de tendance. Frais inclus.

Attention, biais du survivant : l'univers est celui d'AUJOURD'HUI (les cryptos qui ont
disparu ou se sont effondrées n'y sont pas), donc les résultats sont un peu optimistes."""
import sys
import numpy as np, pandas as pd
from bitvavo_client import Bitvavo
from strategie import INTERVALLE, PARAMS, indicateurs, signal_entree, signal_sortie
from scanner import univers, force

FRAIS = 0.0025


def charger(api, marches, bars=1500):
    data = {}
    for m in marches:
        try:
            df = api.history(m, INTERVALLE, bars)
            if len(df) > 150:
                df.index = df.index.as_unit("ns"); d = indicateurs(df, PARAMS); d["force"] = force(d); data[m] = d
        except Exception as e:
            print("ignoré", m, e)
    return data


def simuler(data, k, debut, classer=True):
    dates = sorted(set().union(*[d.index for d in data.values()]))
    dates = [t for t in dates if t >= debut]
    cash, pos, eq = 1.0, {}, []  # pos[m] = [qty, plus_haut]
    nb = 0
    for i, t in enumerate(dates[:-1]):
        t1 = dates[i + 1]
        def px(m, when, col="open"):
            d = data[m]; return d.at[when, col] if when in d.index else None
        # sorties
        for m in list(pos):
            if t not in data[m].index: continue
            row = data[m].loc[t]; pos[m][1] = max(pos[m][1], row.high)
            if signal_sortie(row, pos[m][1], PARAMS) and px(m, t1):
                cash += pos[m][0] * px(m, t1) * (1 - FRAIS); del pos[m]; nb += 1
        # entrées
        libres = k - len(pos)
        if libres > 0:
            cands = []
            for m, d in data.items():
                if m in pos or t not in d.index or t1 not in d.index: continue
                if d.index.get_loc(t) < 110: continue
                row = d.loc[t]
                if signal_entree(row, PARAMS):
                    cands.append((row.force if classer else np.random.rand(), m))
            cands.sort(reverse=True)
            valeur = cash + sum(q * data[m].close.asof(t) for m, (q, _) in pos.items())
            for _, m in cands[:libres]:
                mise = min(cash, valeur / k)
                if mise <= 0: break
                o = px(m, t1); pos[m] = [mise * (1 - FRAIS) / o, o]; cash -= mise; nb += 1
        eq.append(cash + sum(q * data[m].close.asof(t) for m, (q, _) in pos.items()))
    eq = pd.Series(eq, index=dates[:-1])
    return dict(gain_pct=(eq.iloc[-1] - 1) * 100, pire_baisse_pct=(eq / eq.cummax() - 1).min() * 100, ordres=nb)


if __name__ == "__main__":
    np.random.seed(0)
    api = Bitvavo()
    top = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    marches = univers(api, top)
    print(f"Univers ({len(marches)}) :", ", ".join(m.split('-')[0] for m in marches))
    data = charger(api, marches)
    fixe = {m: data[m] for m in ["BTC-EUR", "SOL-EUR", "QNT-EUR"] if m in data}
    fixe = fixe or charger(api, ["BTC-EUR", "SOL-EUR", "QNT-EUR"])
    for nom, jours in [("3 ans", 1095), ("2 ans", 730), ("1 an", 365)]:
        debut = (pd.Timestamp.now(tz="UTC") - pd.Timedelta(days=jours)).floor("D")
        print(f"\n== {nom} ==")
        lignes = {
            "Bot actuel BTC/SOL/QNT (3 pos.)": simuler(fixe, 3, debut),
            f"Scanner top {top}, 3 positions": simuler(data, 3, debut),
            f"Scanner top {top}, 5 positions": simuler(data, 5, debut),
            f"Scanner top {top}, 5 pos. sans classement": simuler(data, 5, debut, classer=False),
        }
        bh = [data[m].close.iloc[-1] / data[m].close.asof(debut) - 1 for m in data if data[m].index[0] <= debut]
        print(pd.DataFrame(lignes).T.round(1).to_string())
        print(f"(Acheter et garder toutes les cryptos de l'univers, à parts égales : {np.mean(bh)*100:.1f} %)")
