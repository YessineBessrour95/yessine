@echo off
REM Supprime la tache planifiee du bot.
schtasks /delete /tn "Bot Bitvavo" /f
pause
