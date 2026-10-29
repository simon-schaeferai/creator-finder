# Testplan

Getestet wird immer in einem frischen Ordner, Skill nur dort installiert (`.claude/skills/creator-finder/`), Token nur über `APIFY_TOKEN`. Im Repo liegen keine Ergebnisdaten, nur die Zahlen.

## T1 · Fehlerpfade ohne Kosten (30.10.2026)

| Fall | Erwartung | Ergebnis: |
|---|---|---|
| `suche.json` fehlt | klare Meldung mit Hinweis auf die Vorlage, Exit 1 | Ergebnis: bestanden |
| `--trocken` mit Vorlage | 10 Anfragen, Schätzung 0,48 $, Budget 5 $ | Ergebnis: bestanden |
| kein Token | Meldung mit Link zur Token-Seite, Exit 1, kein Stacktrace | Ergebnis: bestanden |
| falscher Token in `./.env` | „Apify lehnt den Token ab (HTTP 401)“, Exit 1 | Ergebnis: bestanden |
| Schätzung über `--budget 0.1` | Abbruch vor dem ersten bezahlten Aufruf | Ergebnis: bestanden |

## T2 · Frischtest Ende zu Ende (30.10.2026)

Nische „Laufcoaches und Lauftrainer aus Deutschland, die Content für Hobbyläufer machen“, ab 1.000 Follower. Ausgeführt von einem Agenten mit frischem Kontext, der nur die SKILL.md kannte.

| Schritt | Ergebnis: |
|---|---|
| Keyword-Recherche und `suche.json` nach SKILL.md (15 Anfragen, 3 Familien) | Ergebnis: bestanden |
| Trockenlauf 0,72 $ Obergrenze, Lauf in 1:43 min | Ergebnis: bestanden, 89 Profile, 13 passend |
| Stichprobe `aussortiert.csv`, `nischen_woerter` erweitert, `--nur-auswertung` | Ergebnis: bestanden, 16 passend, 0 $ |
| Netzwerk 3 Seeds × 60 | Ergebnis: Befund, nur 2 Kandidaten (Auswahl war auf KI-Nischen zugeschnitten) → Fix, danach 4 aus denselben Daten |
| Kosten des Netzwerk-Laufs | Ergebnis: Befund, 0,00 $ gemeldet, Apify verbuchte 0,32 $ → Fix (Nachladen + Events nachrechnen) |
| Netzwerk 5 Seeds × 50 nach den Fixes | Ergebnis: bestanden, 250 Einträge, 0,44 $ korrekt erfasst, 22 passend |
| CSV: BOM, gleiche Spaltenzahl je Zeile, Status-Spalte „offen“ | Ergebnis: bestanden |
| Summe | Ergebnis: 101 Profile, 22 passende Creator, 5 mit E-Mail, 1,16 $, unter 3 min Laufzeit |

Weitere Befunde, in der SKILL.md nachgezogen: Ganzwort-Filter braucht Wortformen, Keyword-Ideen bleiben bei kleinen Listen leer, Sprachfilter und Anglizismen, Gesamtbudget über mehrere Aufrufe, realistische Mengen in kleinen Nischen.

## T3 · Lasttest mit der Ursprungsfassung (28.10.2026)

KI-Creator Deutschland, 109 Anfragen, 2 Netzwerk-Runden. Ergebnis: 929 Profile geprüft, 129 passende Creator, 11 mit E-Mail, 7,05 $, etwa 15 Minuten.
