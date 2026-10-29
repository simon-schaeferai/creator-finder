# Setup

Du brauchst drei Dinge. Alles zusammen dauert etwa zehn Minuten.

## 1. Claude Code

Der Skill läuft in **Claude Code**, im Terminal oder im Code-Tab der Claude-Desktop-App. Installation: https://docs.anthropic.com/claude-code

Prüfen, ob Node da ist (Version 18 oder neuer):

```bash
node --version
```

## 2. Apify-Konto und Token

1. Kostenloses Konto anlegen: https://apify.com (der Free-Plan enthält jeden Monat 5 $ Guthaben, Stand 30.10.2026).
2. Token kopieren: https://console.apify.com/settings/integrations → „Personal API tokens“.
3. Im Ordner, in dem du mit Claude arbeitest, eine Datei `.env` anlegen:

```bash
echo "APIFY_TOKEN=apify_api_DEIN_TOKEN" >> .env
```

Die `.env` gehört nie in ein Git-Repo. Leg in deinem Projekt deshalb auch eine `.gitignore` mit `.env` und `output/` an.

## 3. Skill installieren

Für alle Projekte:

```bash
git clone https://github.com/simon-schaeferai/creator-finder ~/.claude/skills/creator-finder
```

Nur für ein Projekt (im Projektordner):

```bash
git clone https://github.com/simon-schaeferai/creator-finder .claude/skills/creator-finder
```

Claude Code danach neu starten.

## Prüfen

```bash
node ~/.claude/skills/creator-finder/scripts/creator-finder.mjs --help
```

Dann in Claude schreiben: „Finde mir Instagram-Creator für <deine Nische>“.

## Fehler

| Meldung | Lösung |
|---|---|
| `APIFY_TOKEN fehlt` | `.env` im Arbeitsordner anlegen (Schritt 2) |
| `HTTP 401` | Token falsch kopiert, neu anlegen |
| `HTTP 402` / `403` | Monatsguthaben verbraucht, nächsten Monat oder Plan wechseln |
| `Geschätzte Kosten … über dem Budget` | weniger Anfragen, `budget` in suche.json erhöhen oder bewusst `--ja` |
