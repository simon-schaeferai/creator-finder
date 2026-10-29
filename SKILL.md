---
name: creator-finder
description: Findet Instagram-Creator einer Nische über Google-Boolean-Suche (Apify) in Runden. Keyword-Recherche, Suchanfragen, Bewertung je Anfrage, neue Keywords aus den Bios der Treffer, optional Netzwerk (wem die Treffer folgen). Ergebnis sind CSV-Dateien mit Follower, Bio, E-Mail, Website und Sprache, fertig zum Import in Google Sheets. Nur Instagram. Nutze diesen Skill IMMER, wenn jemand Instagram-Creator, Influencer oder Accounts in einer Nische sucht, „finde Instagram-Creator für X“, „such mir Fitness-Coaches auf Instagram“, „Creator-Liste für Nische Y“, „Boolean-Suche nach Creatorn“, „Influencer für Kampagne finden“, „/creator-finder“, auch ohne das Wort Skill.
---

# Creator Finder (Instagram)

Nische rein, Liste mit passenden Creatorn raus. Der Skill arbeitet in **Runden**: Jede Runde misst, welche Suchanfragen wirklich passende Creator bringen, und schlägt aus den Bios der Gefundenen die Wörter für die nächste Runde vor. So werden die Boolean-Suchen von Runde zu Runde besser, statt geraten zu bleiben.

**Werkzeug:** `node <skill-dir>/scripts/creator-finder.mjs --lauf <name> [Schalter]` (Node 18 oder neuer, keine weiteren Pakete)
**Ablage:** `output/creator-finder/<name>/` im aktuellen Arbeitsordner. Dort liegen `suche.json`, die Rohdaten und am Ende die CSV-Dateien. `output/` gehört in die `.gitignore` des Projekts, weil die Dateien personenbezogene Daten enthalten.
**Token:** `APIFY_TOKEN` aus der Umgebung, aus `./.env` oder aus `<skill-dir>/.env`. Fehlt er, erklär dem Nutzer, wo er ihn anlegt (https://console.apify.com/settings/integrations), und schreib ihn nie in den Chat zurück.
**Nur Instagram.** LinkedIn taugte im Test nicht für Creator-Listen, TikTok und YouTube sind nicht eingebaut.

## Ablauf (Checkliste im Chat zeigen und abhaken)

### 1. Brief (fragen, was fehlt; der Rest hat Standardwerte)
| Frage | Standard |
|---|---|
| Nische in einem Satz | Pflicht |
| Sprache/Land der Creator | Deutsch, `land: de` |
| Follower-Spanne | ab 1.000 |
| Wie groß soll die Liste werden? | etwa 100 passende Creator |
| Budget je Aufruf | 5 $ (`budget` in suche.json). Darüber nur nach ausdrücklichem Go |

### 2. Keyword-Recherche (vor der ersten Anfrage, kostet nichts)
Ziel: die Wörter, mit denen sich Creator der Nische **selbst** beschreiben, nicht die, mit denen wir über sie reden. Vier Quellen, in dieser Reihenfolge:
1. **Selbstbezeichnungen**: Wie heißt die Rolle? (`KI Creator`, `KI Expertin`, `Laufcoach`, `Lauftrainerin`). Weibliche Formen immer mitnehmen.
2. **Themen-Phrasen**: kurze Phrasen, die in Bios und Captions stehen (`KI Tipps`, `Lauftipps`, `Marathon Training`).
3. **Zielgruppen-Phrasen**: „<Nische> für <Zielgruppe>“ (`KI für Coaches`, `Laufen für Anfänger`). Im Test die verlässlichste Familie.
4. **Bekannte Creator der Nische** (optional): 3 bis 5 Namen, die der Nutzer kennt. Nennt er keine, überspringen und nach Runde 1 die Bios der besten Treffer in `creator.csv` lesen.

Daraus entstehen zwei Listen in `suche.json`: **`nischen_woerter`** (Prüfwörter für Name und Bio) und die **Anfragen**. Vorlage: `<skill-dir>/vorlage/suche.json`.

**`nischen_woerter` sind Ganzwort-Treffer.** „Laufen“ trifft weder „Laufpläne“ noch „Ultramarathon“ noch „Runs“. Deshalb Wortformen, Komposita und englische Varianten einzeln aufnehmen (im Test 25 Wörter für Laufcoaches). Zu breite Wörter („Laufen“, „Business“) lassen Rauschen durch, das fängt die Stichprobe in Schritt 4.

### 3. Runde 1: 20 bis 30 Anfragen, Trockenlauf, Lauf
Ordner `output/creator-finder/<name>/` anlegen, `suche.json` schreiben, dann `--trocken`. Das zeigt alle Anfragen und die Kostenobergrenze. Dem Nutzer die Schätzung nennen, sein Go abwarten, dann ohne `--trocken` laufen lassen. Liegt die Schätzung über dem Budget, bricht das Skript von selbst ab. Das Budget gilt je Aufruf; hat der Nutzer ein Gesamtbudget genannt, die echten Kosten aus `info.csv` nach jedem Lauf mitrechnen und `--budget` für den nächsten Aufruf auf den Rest setzen.

### 4. Auswerten (kostet nichts)
Das Skript bewertet nach jedem Lauf **jede Anfrage nach passenden Creatorn** (`suchanfragen.csv`) und schlägt **Keyword-Ideen** vor (`keyword-ideen.csv`): Wortgruppen, die in mindestens 2 Bios passender Creator stehen und noch keine Anfrage sind.

| Urteil | Bedeutung | Nächste Runde |
|---|---|---|
| stark | 3 oder mehr passende Creator | Muster vervielfältigen (gleiche Form, neue Zielgruppe oder Rolle) |
| behalten | 1 bis 2 passende | bleibt, kein Ausbau |
| raus (nur Fremdtreffer) | Profile, aber keine passenden | Muster nicht wiederholen |
| tot (0 Treffer) | Google kennt die Phrase so nicht | Muster nicht wiederholen |

Dazu Stichprobe aus `creator.csv` (passt jede Zeile?) und aus `aussortiert.csv` (fliegt Passendes raus?). Falsch aussortiert → `nischen_woerter` erweitern; durchgerutschte Firmen → `organisation_rx`; danach `--nur-auswertung` (kostet nichts). Im Frischtest hob das allein die passenden Creator von 13 auf 16.

**Keyword-Ideen leer?** Bei kleinen Listen (unter etwa 30 passenden Creatorn) steht selten eine Wortgruppe in zwei Bios. Dann die Bios der passenden Creator selbst lesen und Selbstbezeichnungen, Themen und Zielgruppen von dort für Runde 2 übernehmen.

### 5. Runde 2 und weitere: wachsen
Neue Anfragen **an `suche.json` anhängen** (alte bleiben stehen). Das Skript fragt nur die neuen ab und bezahlt nichts doppelt. Quellen: Keyword-Ideen und Varianten der starken Muster. Aufhören, wenn eine Runde weniger als 10 neue passende Creator bringt.

### 6. Netzwerk (optional, wenn die Liste groß werden soll)
`--netzwerk` nimmt die nächsten noch nicht genutzten passenden Creator als Seeds und liest, wem sie folgen. Geladen werden nur Kandidaten mit starkem Signal: Nischenwort im Handle oder Namen und mindestens 2 Seeds, die ihnen folgen (bei Sprachfilter `de` zählt ein Umlaut im Namen als deutsches Signal), oder 4 und mehr Seeds. Jeder weitere Aufruf ist eine neue Runde mit neuen Seeds. Vorher immer `--trocken-netz` (Schätzung), Steuerung mit `--seeds N --je-seed M`.

Mit weniger als etwa 8 Seeds folgen kaum zwei Seeds demselben Konto, die Runde bringt dann wenig (Frischtest: 3 Seeds × 60, 4 Kandidaten). Für eine echte Netzwerk-Runde 10 bis 15 Seeds × 150 nehmen, das kostet etwa 3 bis 5 $.

### 7. Übergabe
Zahlen nennen (passend · aussortiert nach Grund · mit E-Mail), echte Kosten aus `info.csv`, die stärksten Anfragen, und wie die Liste in Google Sheets kommt (siehe unten). Der Nutzer arbeitet danach die Status-Spalte ab (offen · passt · kontaktiert · raus).

## Regeln für Boolean-Anfragen (gemessen)

| Regel | Beleg |
|---|---|
| Basis `site:instagram.com` plus **höchstens zwei Bedingungen** | drei UND-Gruppen: 0 Treffer |
| **Kurze Phrasen in Anführungszeichen in der Sprache der Creator** sind am stärksten: `"KI Tipps"`, `"KI für Coaches"` | Top-Anfragen im Test |
| **1 Seite je Anfrage**, Masse über viele Anfragen | Seite 2 und 3 bei `site:` fast immer leer |
| Keine `-inurl:p`-Ausschlüsse; Beiträge sind erwünscht | Autoren werden aufgelöst, `-inurl:p` killt auch Handles mit „p“ |
| Allgemeine Wörter (`Kooperationen`, `Business`, `Community`, Städte) nie allein mit dem Nischenwort koppeln | ziehen Medien, Firmen, Behörden |
| Englische Fachbegriffe bringen bei deutscher Suche wenig | 0 passende Creator |
| Höchstens 32 Wörter, `OR` groß, OR-Gruppen in Klammern | Google-Grenze |

## suche.json

| Feld | Bedeutung |
|---|---|
| `nische` | Name der Suche, steht in `info.csv` |
| `land` / `sprache` | Google-Land und -Sprache (`de`, `at`, `ch`, `us` …) |
| `nischen_woerter` | Ganzwort-Treffer in Name, Bio oder Kategorie (Groß/klein egal). Leer = keine Nischenprüfung. Auch Grundlage der Keyword-Ideen |
| `sprache_filter` | `"de"` sortiert Creator mit nicht deutscher Bio aus (Ort in DACH zählt als deutsch). Leer = aus. Andere Sprachen sind nicht eingebaut |
| `min_follower` / `max_follower` | 0 = offen. Private Konten fliegen immer raus |
| `organisation_rx` | optional, ersetzt die Standardliste (Behörde, Hochschule, Schule, Bank, Museum, Magazin, Verband …) |
| `budget` | Kostengrenze je Aufruf in USD (Standard 5) |
| `netzwerk` | Standardwerte für `--netzwerk` (`seeds`, `je_seed`, `min_gemeinsam`, `max_kandidaten`); läuft nur mit dem Schalter |
| `queries` | Liste aus `{ "query": "...", "zweck": "Selbstbezeichnung" }` |

## Ergebnis-Dateien

| Datei | Inhalt |
|---|---|
| `creator.csv` | passende Profile nach Followern: Handle, Name, Link, Follower, Beiträge, Verifiziert, Business-Konto, Kategorie, Bio, Creator-Signal, Ort, E-Mail, Telefon, Website, letzter Beitrag, Bio-Sprache, Gefunden als (Profil/Beitrag/Netzwerk), Gefunden über (Anfragen), Gefolgt von (Seeds), **Status**, Notiz |
| `aussortiert.csv` | dieselben Spalten plus **Grund**: privat · unter/über N Follower · Follower unbekannt · Organisation · Bio ohne Nischenwort · Bio nicht deutschsprachig |
| `suchanfragen.csv` | je Anfrage: Google-Treffer, Profile, **passende Creator**, Urteil |
| `keyword-ideen.csv` | Wortgruppe, in wie vielen passenden Bios, Beispiele, fertige Anfrage für die nächste Runde |
| `info.csv` | Nische, Filter, Zahlen, Aussortier-Gründe, echte Apify-Kosten |

**In Google Sheets:** neues Sheet → Datei → Importieren → Hochladen → `creator.csv` → „Neues Tabellenblatt einfügen“. Für jede weitere CSV dasselbe. Status-Spalte markieren → Daten → Datenvalidierung → Drop-down mit `offen, passt, kontaktiert, raus`. Hat der Nutzer in Claude eine Google-Drive-Anbindung, kannst du das Sheet auch direkt anlegen.

## Messwerte aus dem Test (28.10.2026, KI-Creator Deutschland)

| Runde | Was | Neue passende Creator | Kosten |
|---|---|---|---|
| Google 1 | 49 Anfragen | 52 | 1,27 $ |
| Netzwerk 1 | 10 Seeds × 150 | 25 | 1,07 $ |
| Netzwerk 2 | 15 Seeds × 150 | 36 | 3,31 $ |
| Google 2 | 60 neue Anfragen | 16 | 1,40 $ |
| **Summe** | 109 Anfragen, 929 Profile geprüft | **129** (ab 1.000 Follower, deutsch, Nische geprüft), 11 davon mit E-Mail | **7,05 $** |

Gemessen im Bronze-Plan von Apify; im Free-Plan sind die Preise je Ergebnis etwas höher. Daraus:
- **Google zuerst, aber begrenzt**: Runde 1 ist die günstigste Quelle. Danach sinkt der Ertrag stark, weil Google pro Anfrage nur etwa 7 Treffer liefert und dieselben Profile wiederkehren.
- **Netzwerk ist der Hebel für große Listen**, kostet aber etwa 0,2 Cent je gelesenem Following-Eintrag. Ohne Sprachfilter führt es schnell in die internationale Szene.
- Größenordnung: etwa 100 passende Creator für etwa 5 $ in einer großen Nische. In kleinen Nischen ist weniger drin.

**Frischtest (30.10.2026, Laufcoaches Deutschland, frischer Ordner):** 15 Anfragen, 2 kleine Netzwerk-Runden, 101 Profile geprüft, 22 passende Creator (5 mit E-Mail), 1,16 $, unter 3 Minuten Laufzeit. Eine kleine Nische mit 15 Anfragen bringt also eher 15 bis 25 Creator als 100.

## Schalter

| Schalter | Wirkung | Kosten |
|---|---|---|
| `--trocken` | neue Anfragen und Kostenobergrenze zeigen | 0 |
| (ohne) | neue Anfragen suchen, Autoren auflösen, Profile laden, CSV schreiben | Apify |
| `--netzwerk [--seeds N --je-seed M]` | eine Netzwerk-Runde | Apify |
| `--trocken-netz` | Netzwerk-Schätzung | 0 |
| `--nur-auswertung` | Auswertung, Keyword-Ideen und CSV aus vorhandenen Daten neu | 0 |
| `--neu-suchen` | google.json verwerfen, alle Anfragen neu | Apify |
| `--ohne-profile` | nur Google-Daten | gering |
| `--min-follower` / `--max-follower` / `--seiten` | überschreiben suche.json | 0 |
| `--budget USD` / `--ja` | Kostengrenze für diesen Aufruf / bewusst darüber | 0 |

Bereits bezahlte Daten (Anfragen, aufgelöste Beiträge, Profile, nicht ladbare Profile, Following-Listen) werden nie ein zweites Mal abgerufen.

## Grenzen
- Die Nischen- und Sprachprüfung ist ein Wortfilter: Creator, deren Bio die Nische nicht nennt oder in Zierschrift geschrieben ist, landen in `aussortiert.csv`. Schritt 4 nie überspringen.
- Der Sprachfilter sortiert deutsche Bios mit vielen Anglizismen („Running & HYROX Coach“) als „nicht deutschsprachig“ aus, wenn kein Ort in DACH dabeisteht. In Nischen mit viel Englisch (Fitness, Laufen, Tech) die Gruppe in `aussortiert.csv` gezielt prüfen oder `sprache_filter` leer lassen.
- Google findet nur Indexiertes; neue oder kleine Konten fehlen. Das Netzwerk gleicht das teilweise aus.
- Apify verbucht Kosten erst kurz nach Laufende. Das Skript lädt deshalb nach und rechnet aus den abgerechneten Events nach; die Summe in `info.csv` ist so nah an der Rechnung wie möglich, verbindlich ist die Apify-Konsole.
- E-Mail und Telefon stehen nur da, wo Creator sie öffentlich angeben. Nutze sie nur für eine persönliche, einzelne Ansprache und beachte die DSGVO.
