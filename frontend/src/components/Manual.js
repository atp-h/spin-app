import React from 'react';

function Manual() {
  return (
    <div className="manual-container">
      <h2>📖 Handleiding & Uitleg</h2>
      
      <section className="manual-section">
        <h3>🎡 Het Rad (Spin The Wheel)</h3>
        <ul>
          <li><strong>Wielen aanmaken:</strong> Gebruik de sidebar (links op PC, bovenin op mobiel) om nieuwe raderen aan te maken voor verschillende thema's.</li>
          <li><strong>Items toevoegen:</strong> Voeg namen of keuzes toe in de lijst onder het rad. Je kunt items ook bewerken of verwijderen.</li>
          <li><strong>Spinnen:</strong> Klik of tik op het rad om het te laten draaien. De winnaar wordt automatisch opgeslagen in de historie onderaan de pagina.</li>
        </ul>
      </section>

      <section className="manual-section">
        <h3>🍺 Beerpong Competitie</h3>
        <p>In de Beerpong tab kun je jullie volledige competitie beheren:</p>
        <ul>
          <li><strong>Players:</strong> Voeg hier alle namen van jullie vriendengroep toe. Vink aan wie er die avond <strong>aanwezig</strong> zijn. Alleen aanwezige spelers doen mee in de Matchmaker.</li>
          <li><strong>Teams:</strong> Hier zie je alle duo-combinaties en hun winst-statistieken. De app maakt deze teams vaak automatisch aan bij het opslaan van een match.</li>
          <li><strong>History:</strong> Hier voer je handmatig de scores in van een gespeelde pot (bijv. 10 - 8). De winnaar krijgt automatisch +1 winst op zowel team- als speler-niveau.</li>
        </ul>
      </section>

      <section className="manual-section highlight">
        <h3>🎲 De Matchmaker</h3>
        <p>Geen gedoe meer met wie tegen wie moet:</p>
        <ol>
          <li>Ga naar de <strong>Matchmaker</strong> sub-tab binnen Beerpong.</li>
          <li>Kies handmatig 4 spelers óf klik op <strong>"🎲 Random Shuffle"</strong> om de app 4 aanwezige spelers te laten verdelen in twee duo's.</li>
          <li>Klik op <strong>"Start Match"</strong> om het potje te beginnen.</li>
          <li>Na het spelen vul je direct de score in en klik je op <strong>"Save & Finish"</strong> om de stand bij te werken.</li>
        </ol>
      </section>

      <section className="manual-section">
        <h3>💡 Tips</h3>
        <ul>
          <li><strong>Wissen:</strong> Gebruik het rode kruisje (×) om foutieve spelers, teams of matches te verwijderen.</li>
          <li><strong>Snelheid:</strong> De app is geoptimaliseerd met database-indexen. Als hij toch traag wordt, ververs dan de pagina met <strong>Ctrl + F5</strong>.</li>
        </ul>
      </section>
    </div>
  );
}

export default Manual;
