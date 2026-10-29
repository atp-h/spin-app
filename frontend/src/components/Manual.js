import React from 'react';

function Manual() {
  return (
    <div className="manual">
      <section className="manual-section">
        <h3>🎡 Het Rad</h3>
        <ul>
          <li><strong>Raderen:</strong> kies een rad bovenaan of maak er een met <strong>＋ Nieuw rad</strong>. Met ✏️ hernoem je, met ⧉ maak je een kopie en met 🗑 verwijder je (je hebt dan nog even tijd voor <em>Ongedaan maken</em>).</li>
          <li><strong>Items:</strong> klap <em>Items</em> open om toe te voegen, te bewerken (tik op de naam) of te verwijderen. Met <strong>📋 Lijst plakken</strong> voeg je er in één keer veel toe (één per regel), met <strong>🍺 Aanwezige spelers</strong> vul je het rad met wie er vanavond is.</li>
          <li><strong>Kans:</strong> tik op <strong>×1</strong> naast een item om het meer kans te geven (tot ×5). Het vak op het rad wordt dan ook groter.</li>
          <li><strong>Spinnen:</strong> tik op het rad of op SPIN. Een draai duurt 4 tot 9 seconden en de uitslag wordt automatisch bewaard.</li>
          <li><strong>Afvalrace:</strong> zet de schakelaar aan en de winnaar gaat na elke draai van het rad af — handig voor "wie is de volgende?". Met ↺ reset zet je iedereen terug.</li>
          <li><strong>📺 Party mode:</strong> groot rad op het hele scherm, ideaal voor een tv of tablet.</li>
        </ul>
      </section>

      <section className="manual-section">
        <h3>🍺 Beerpong</h3>
        <ul>
          <li><strong>👥 Spelers:</strong> voeg spelers toe en zet de schakelaar aan voor wie er is. Tik op een avatar om een emoji te kiezen. Start elke speelavond met <strong>🌙 Nieuwe avond</strong>: iedereen staat dan op afwezig en de stand van "vanavond" begint opnieuw.</li>
          <li><strong>🏆 Stand:</strong> ranglijst van spelers of duo's, voor vanavond of altijd. De <em>rating</em> is een Elo-score: winnen van sterke tegenstanders levert meer op. Tik op een speler om de beste partner en aartsvijand te zien.</li>
          <li><strong>📜 Historie:</strong> alle potjes per avond. Hier kun je ook een uitslag handmatig invoeren.</li>
        </ul>
      </section>

      <section className="manual-section highlight">
        <h3>🎲 Spelen</h3>
        <ol>
          <li><strong>⚡ Snelle pot:</strong> kies 4 spelers, of laat het rad ze trekken met <strong>🎡 Spin de teams</strong>. De eerste twee vormen Side A, de laatste twee Side B. Na het spelen vul je de score in.</li>
          <li><strong>👑 Winnaar blijft:</strong> zet duo's in de wachtrij (zelf kiezen of loten). De bovenste twee staan aan tafel; de winnaar blijft staan, de verliezer sluit achteraan aan.</li>
          <li><strong>🏆 Toernooi:</strong> maakt willekeurige duo's van alle aanwezigen en zet ze in een knock-out schema. Vul per wedstrijd de uitslag in tot er een kampioen is.</li>
        </ol>
        <p>Gelijkspel bestaat niet: de winnaar wordt bepaald door de score.</p>
      </section>

      <section className="manual-section">
        <h3>💡 Tips</h3>
        <ul>
          <li><strong>Samen spelen:</strong> iedereen kan de app op de eigen telefoon openen. Wijzigingen verschijnen binnen een paar seconden bij de anderen.</li>
          <li><strong>PIN:</strong> als er een PIN is ingesteld, vraagt de app daarom bij verwijderen en bij een nieuwe avond.</li>
          <li><strong>Op je beginscherm:</strong> kies in je browser "Zet op beginscherm" om de app als een echte app te openen.</li>
        </ul>
      </section>
    </div>
  );
}

export default Manual;
