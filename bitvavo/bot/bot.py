"""Bot de trading Bitvavo.

Mode simulation (par défaut) : aucun ordre réel, portefeuille fictif dans etat_papier.json.
Mode réel (--live)          : passe de vrais ordres au marché avec ta clé API.

Usage :
  python3 bot.py              # une passe en simulation
  python3 bot.py --live       # une passe en réel
  python3 bot.py --boucle     # tourne en continu (vérifie toutes les heures)
  python3 bot.py --scan       # analyse les 30 cryptos les plus échangées, sans trader
"""
import argparse, csv, json, math, os, time
from datetime import datetime, timezone
from pathlib import Path

from bitvavo_client import Bitvavo, BitvavoError
from strategie import INTERVALLE, PARAMS, indicateurs, signal_entree, signal_sortie
from scanner import force, univers

ICI = Path(__file__).resolve().parent
FRAIS = 0.0025


def charger_env():
    f = ICI / ".env"
    if f.exists():
        for ligne in f.read_text().splitlines():
            if "=" in ligne and not ligne.strip().startswith("#"):
                k, v = ligne.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def log(msg):
    print(f"[{datetime.now(timezone.utc):%Y-%m-%d %H:%M:%S} UTC] {msg}", flush=True)


class Bot:
    def __init__(self, live):
        self.live = live
        self.cfg = json.loads((ICI / "config.json").read_text())
        self.api = Bitvavo()
        self.f_etat = ICI / ("etat_live.json" if live else "etat_papier.json")
        self.etat = json.loads(self.f_etat.read_text()) if self.f_etat.exists() else {
            "cash_papier": self.cfg["capital_papier_eur"], "positions": {}, "pnl_realise": 0.0, "bloque": False}
        self.infos = {}

    def sauver(self):
        self.f_etat.write_text(json.dumps(self.etat, indent=2))

    def journal(self, **ligne):
        f = ICI / ("trades_live.csv" if self.live else "trades_papier.csv")
        neuf = not f.exists()
        with f.open("a", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=["date", "marche", "sens", "quantite", "prix", "montant_eur", "raison"])
            if neuf:
                w.writeheader()
            w.writerow({"date": datetime.now(timezone.utc).isoformat(timespec="seconds"), **ligne})

    def info(self, m):
        if m not in self.infos:
            self.infos[m] = self.api.market_info(m)
        return self.infos[m]

    # ----------------------------------------------------------- exécution
    def acheter(self, m, eur, prix, raison):
        if self.live:
            r = self.api.market_order(m, "buy", amount_quote=eur)
            qty, depense = float(r["filledAmount"]), float(r["filledAmountQuote"]) + float(r.get("feePaid", 0))
            prix = depense / qty if qty else prix
        else:
            qty, depense = eur * (1 - FRAIS) / prix, eur
            self.etat["cash_papier"] -= eur
        self.etat["positions"][m] = {"quantite": qty, "prix_entree": prix, "cout_eur": depense,
                                     "plus_haut": prix, "date": datetime.now(timezone.utc).isoformat()}
        self.journal(marche=m, sens="ACHAT", quantite=qty, prix=prix, montant_eur=round(depense, 2), raison=raison)
        log(f"ACHAT {m}: {qty:.8g} à {prix:.6g} € ({depense:.2f} €) — {raison}")

    def vendre(self, m, prix, raison):
        pos = self.etat["positions"][m]
        qty = pos["quantite"]
        if self.live:
            base = m.split("-")[0]
            dispo = self.api.balances().get(base, 0.0)
            dec = int(self.info(m).get("quantityDecimals", 8))
            qty = math.floor(min(qty, dispo) * 10**dec) / 10**dec
            r = self.api.market_order(m, "sell", amount=f"{qty:.{dec}f}")
            recu = float(r["filledAmountQuote"]) - float(r.get("feePaid", 0))
            prix = float(r["filledAmountQuote"]) / float(r["filledAmount"])
        else:
            recu = qty * prix * (1 - FRAIS)
            self.etat["cash_papier"] += recu
        pnl = recu - pos["cout_eur"]
        self.etat["pnl_realise"] += pnl
        del self.etat["positions"][m]
        self.journal(marche=m, sens="VENTE", quantite=qty, prix=prix, montant_eur=round(recu, 2), raison=raison)
        log(f"VENTE {m}: {qty:.8g} à {prix:.6g} € ({recu:.2f} €, P&L {pnl:+.2f} €) — {raison}")

    # ----------------------------------------------------------- logique
    def donnees(self, m, maintenant):
        df = self.api.candles(m, INTERVALLE, 300)
        df = df[df.index + pd_delta(INTERVALLE) <= maintenant]  # bougies clôturées uniquement
        d = indicateurs(df, PARAMS)
        d["force"] = force(d)
        return d

    def marches_suivis(self):
        sc = self.cfg.get("scanner", {})
        if sc.get("actif"):
            return sc["marches"], sc["max_positions"], sc["budget_total_eur"] / sc["max_positions"]
        return list(self.cfg["marches"]), len(self.cfg["marches"]), None

    def passe(self):
        log(f"=== Passe {'RÉELLE' if self.live else 'SIMULATION'} ===")
        maintenant = datetime.now(timezone.utc)
        soldes = self.api.balances() if self.live else None
        marches, max_pos, mise_fixe = self.marches_suivis()

        investi = mise_fixe * max_pos if mise_fixe else sum(c["budget_eur"] for c in self.cfg["marches"].values())
        if self.etat["pnl_realise"] < -investi * self.cfg["perte_max_pct"] / 100 and not self.etat["bloque"]:
            self.etat["bloque"] = True
            log(f"⛔ Perte réalisée {self.etat['pnl_realise']:.2f} € > {self.cfg['perte_max_pct']} % : achats bloqués.")

        btc_ok = True
        if self.cfg.get("filtre_btc", True):
            b = self.donnees("BTC-EUR", maintenant).iloc[-1]
            btc_ok = b.close > b.ema_t
            log(f"Filtre BTC : clôture {b.close:.0f} € {'>' if btc_ok else '<'} EMA{PARAMS['ema_trend']} {b.ema_t:.0f} € "
                f"→ {'achats autorisés' if btc_ok else 'marché baissier, AUCUN achat'}")

        candidats = []
        for m in dict.fromkeys(list(self.etat["positions"]) + marches):  # positions d'abord, sans doublon
            try:
                d = self.donnees(m, maintenant)
                row = d.iloc[-1]
                prix = self.api.price(m)
                pos = self.etat["positions"].get(m)

                if pos is None and self.live and self.cfg["reprendre_positions_existantes"]:
                    qte = soldes.get(m.split("-")[0], 0.0)
                    if qte * prix >= float(self.info(m)["minOrderInQuoteAsset"]):
                        pos = self.etat["positions"][m] = {"quantite": qte, "prix_entree": prix, "cout_eur": qte * prix,
                                                           "plus_haut": prix, "date": maintenant.isoformat()}
                        log(f"{m}: position existante reprise ({qte:.8g}, {qte*prix:.2f} €)")

                txt = (f"{m}: clôture {row.close:.6g} | EMA{PARAMS['ema_fast']} {row.ema_f:.6g} "
                       f"EMA{PARAMS['ema_slow']} {row.ema_s:.6g} EMA{PARAMS['ema_trend']} {row.ema_t:.6g} | RSI {row.rsi:.1f}")
                if pos:
                    pos["plus_haut"] = max(pos["plus_haut"], row.high)
                    raison = signal_sortie(row, pos["plus_haut"], PARAMS)
                    log(f"{txt} | EN POSITION ({(prix / pos['prix_entree'] - 1) * 100:+.1f} %)")
                    if raison:
                        self.vendre(m, prix, raison)
                        if self.live:
                            soldes = self.api.balances()
                elif signal_entree(row, PARAMS):
                    log(f"{txt} | SIGNAL D'ACHAT (force 30 j {row.force * 100:+.1f} %)")
                    candidats.append((row.force, m, prix))
                else:
                    log(f"{txt} | pas de signal")
            except BitvavoError as e:
                log(f"⚠️ {m}: erreur API — {e}")
            self.sauver()

        # achats : les plus forts d'abord, dans la limite des places libres
        candidats.sort(reverse=True)
        for _, m, prix in candidats:
            if len(self.etat["positions"]) >= max_pos:
                log(f"{m}: ignoré, déjà {max_pos} positions ouvertes"); continue
            if self.etat["bloque"] or not btc_ok:
                log(f"{m}: achat ignoré ({'bot bloqué' if self.etat['bloque'] else 'filtre BTC'})"); continue
            dispo = soldes.get("EUR", 0.0) if self.live else self.etat["cash_papier"]
            budget = mise_fixe or self.cfg["marches"].get(m, {}).get("budget_eur", 0)
            eur = min(budget, self.cfg["max_ordre_eur"], dispo)
            if eur < float(self.info(m)["minOrderInQuoteAsset"]):
                log(f"{m}: EUR disponible insuffisant ({dispo:.2f} €)"); continue
            try:
                self.acheter(m, eur, prix, "tendance haussière confirmée")
            except BitvavoError as e:
                log(f"⚠️ {m}: achat refusé — {e}"); continue
            if self.live:
                soldes["EUR"] = dispo - eur
            self.sauver()

        valeur = sum(p["quantite"] * self.api.price(m) for m, p in self.etat["positions"].items())
        if not self.live:
            valeur += self.etat["cash_papier"]
            log(f"Portefeuille simulé : {valeur:.2f} € (départ {self.cfg['capital_papier_eur']} €)")
        log(f"P&L réalisé du bot : {self.etat['pnl_realise']:+.2f} €")


def scan(top):
    """Analyse seule (aucun ordre) des `top` cryptos les plus échangées."""
    api, maintenant, lignes = Bitvavo(), datetime.now(timezone.utc), []
    for m in univers(api, top):
        try:
            df = api.candles(m, INTERVALLE, 300)
            df = df[df.index + pd_delta(INTERVALLE) <= maintenant]
            if len(df) < PARAMS["ema_trend"]:
                continue
            d = indicateurs(df, PARAMS); d["force"] = force(d); r = d.iloc[-1]
            etat = "ACHAT" if signal_entree(r, PARAMS) else ("haussier" if r.close > r.ema_t else "baissier")
            lignes.append((m, r.close, r.force * 100, r.rsi, (r.close / r.ema_t - 1) * 100, etat))
        except BitvavoError:
            pass
    import pandas as pd
    t = pd.DataFrame(lignes, columns=["marché", "prix", "perf_30j_%", "RSI", "vs_EMA100_%", "état"])
    t = t.sort_values("perf_30j_%", ascending=False).round({"perf_30j_%": 1, "RSI": 1, "vs_EMA100_%": 1})
    t["prix"] = t["prix"].map(lambda x: f"{x:.6g}")
    print(t.to_string(index=False))
    print("\n⚠️ Analyse seule. Les petites cryptos sont très risquées : le backtest montre que les trader"
          " automatiquement fait perdre de l'argent.")


def pd_delta(iv):
    import pandas as pd
    return pd.Timedelta(iv.replace("d", "D"))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true", help="passer de VRAIS ordres")
    ap.add_argument("--boucle", action="store_true", help="tourner en continu")
    ap.add_argument("--intervalle-min", type=int, default=60)
    ap.add_argument("--scan", type=int, nargs="?", const=30, metavar="N",
                    help="analyser seulement les N cryptos les plus échangées (aucun ordre)")
    a = ap.parse_args()
    charger_env()
    if a.scan:
        scan(a.scan); raise SystemExit
    if a.live and input("⚠️  Mode RÉEL : de vrais ordres vont être passés. Taper OUI pour continuer : ") != "OUI":
        raise SystemExit("Annulé.")
    bot = Bot(a.live)
    while True:
        try:
            bot.passe()
        except Exception as e:  # le bot ne doit pas mourir sur une erreur réseau
            log(f"⚠️ Erreur inattendue : {e!r}")
        if not a.boucle:
            break
        time.sleep(a.intervalle_min * 60)
