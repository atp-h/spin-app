Ik wil een volledige webapplicatie bouwen met de volgende specificaties:

Doel:
Een interactieve "spin-the-wheel" applicatie waarin gebruikers items kunnen toevoegen aan een lijst. Deze items verschijnen automatisch als segmenten in een draaiend rad. Wanneer de gebruiker op het rad klikt, draait het en stopt willekeurig op één van de items.

Functionaliteiten:
- Een visueel rad (wheel) dat verdeeld is in segmenten op basis van de ingevoerde items
- Mogelijkheid om items toe te voegen, bewerken en verwijderen via een eenvoudige UI
- Het rad moet automatisch updaten wanneer de lijst verandert
- Animatie van het draaien (smooth spin met easing)
- Willekeurige maar eerlijke selectie (geen bias)
- Weergave van het geselecteerde item na het spinnen

Technische vereisten:
- Frontend: HTML, CSS, JavaScript (bij voorkeur met een framework zoals React)
- Gebruik canvas of SVG voor het rad
- State management voor de lijst van items
- Responsive design (mobiel + desktop)

Backend (optioneel maar gewenst):
- Node.js + Express API
- Opslaan van items (bijv. in JSON file of eenvoudige database zoals SQLite)
- REST API voor CRUD operaties op de lijst

Deployment:
- Geschikt om te draaien op een Linux server
- Build en run instructies (bijv. met npm of Docker)
- Reverse proxy compatibel (ik gebruik HAProxy)

Extra:
- Geef duidelijke projectstructuur
- Voeg comments toe in de code
- Voeg instructies toe voor installatie en deployment
- Bonus: mogelijkheid om meerdere wheels op te slaan

Output:
- Volledige werkende code (frontend + backend)
- Stap-voor-stap uitleg hoe ik het lokaal draai en deploy op mijn server


### 📊 Nieuw: Scorebord / History Systeem
- Bij elke spin wordt de winnaar opgeslagen
- History bevat:
  - Gewonnen item
  - Timestamp van de spin
  - Optioneel: gebruiker (als multi-user later wordt toegevoegd)
- Leaderboard:
  - Telt hoe vaak elk item heeft gewonnen
  - Sorteerbaar (meeste wins bovenaan)
- UI sectie:
  - "Recent wins" lijst
  - "Top winners" scoreboard
- Persistent opslag (backend of localStorage)
