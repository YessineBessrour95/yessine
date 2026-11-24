# Crée la tâche planifiée "Bot Bitvavo" : tous les jours à 8h00.
$bat = Join-Path $PSScriptRoot 'lancer_bot.bat'
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$bat`"" -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -Daily -At '08:00'
# StartWhenAvailable : si le PC était éteint à 8h, la tâche se lance dès que possible après.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'Bot Bitvavo' -Action $action -Trigger $trigger -Settings $settings `
    -Description 'Analyse quotidienne du bot de trading Bitvavo (simulation)' -Force | Out-Null
Write-Host ''
Write-Host 'OK : la tache "Bot Bitvavo" est installee. Elle se lancera tous les jours a 8h00.' -ForegroundColor Green
Write-Host 'Pour tester tout de suite : double-clique sur lancer_bot.bat'
