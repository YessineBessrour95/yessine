@echo off
REM Lance le bot en simulation + le scan, enregistre le rapport du jour et l'ouvre.
cd /d "%~dp0"
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

REM Choisir la commande Python disponible (python ou py)
set PY=python
where python >nul 2>&1 || set PY=py

for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set JOUR=%%d
if not exist rapports mkdir rapports
set RAPPORT=rapports\rapport_%JOUR%.txt

echo ===== RAPPORT DU BOT BITVAVO - %JOUR% ===== > "%RAPPORT%"
echo. >> "%RAPPORT%"
echo ----- 1. DECISIONS DU BOT (simulation) ----- >> "%RAPPORT%"
%PY% bot.py >> "%RAPPORT%" 2>&1
echo. >> "%RAPPORT%"
echo ----- 2. SCAN DES 30 CRYPTOS LES PLUS ECHANGEES ----- >> "%RAPPORT%"
%PY% bot.py --scan >> "%RAPPORT%" 2>&1

start "" notepad "%RAPPORT%"
