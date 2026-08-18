/**
 * Every translatable string, as data.
 *
 * Two kinds of entry, as described in js/i18n.js:
 *
 *   "key": { it: "…" }            prose that lives in index.html: only the
 *                                 Italian is needed, the English is harvested
 *                                 from the document itself.
 *
 *   "js.key": { en: "…", it: "…" } sentences built in JavaScript, which have no
 *                                 home in the HTML.
 *
 * Rules for the Italian, enforced by tests/verify.mjs:
 *   · every <span id> / <b id> placeholder in the English must survive, spelled
 *     identically — app.js fills those by id, so a missing one blanks a number;
 *   · {placeholders} in the js.* entries must exist in both languages.
 *
 * House style for the Italian: "tu" throughout (this is a personal tool, not a
 * bank statement), "azioni" for shares, "obbligazioni" for bonds, "imposte" for
 * tax. Italian tax terms are left in Italian in both languages, because that is
 * what the reader will meet on the documents.
 */

export const STRINGS = {
  // =========================================================== head and header
  "head.title": {
    it: "Simulatore di investimento — quanto potrebbero diventare i miei soldi?",
  },
  "head.description": {
    it: "Inserisci quanto investiresti ogni mese in un ETF azionario mondiale e in obbligazioni governative in euro, e vedi tutta la gamma dei risultati possibili nei prossimi dieci anni, misurata su ogni scenario dal 1900 a oggi.",
  },
  "skip.link": { it: "Salta ai risultati" },

  "hero.h1": { it: "Quanto potrebbero diventare i miei soldi?" },
  "hero.lede": {
    it: `Dividi i tuoi risparmi tra una parte <strong>rischiosa</strong> (azioni di
      tutto il mondo) e una parte <strong>più sicura</strong> (obbligazioni
      governative in euro), e guarda tutta la gamma di ciò che può succedere —
      non solo un unico numero rassicurante.`,
  },
  "hero.sub": {
    it: `Ogni risultato di questa pagina è costruito sulla storia reale dei mercati
      dal <span id="dsRange">1900</span>. Niente è inventato, e niente è una
      promessa.`,
  },

  // ================================================================== the plan
  "plan.title": { it: "1 · Il tuo piano" },
  "plan.sub": { it: "Cambia un numero qualsiasi e la risposta si aggiorna." },

  "sleeve.risky.title": { it: "Parte rischiosa — un ETF azionario mondiale" },
  "sleeve.risky.note": {
    it: `Un unico fondo che possiede una fetta di migliaia di aziende in tutto il
      mondo sviluppato. Sul lungo periodo è quello che cresce di più, ma può
      crollare e restare giù per anni.`,
  },
  "sleeve.safe.title": { it: "Parte più sicura — obbligazioni governative in euro" },
  "sleeve.safe.note": {
    it: `Presti denaro ai governi dell'area euro e loro ti pagano un interesse.
      Molto più tranquilla delle azioni in tempi normali — ma non è priva di
      rischio, come ha mostrato il 2022 (<span id="ds2022bd">−25,1%</span> al
      netto dell'inflazione, in un solo anno).`,
  },

  "field.initial": { it: "Quanto metti oggi" },
  "field.monthly": { it: "Quanto aggiungi ogni mese" },
  "field.years": { it: "Per quanto tempo?" },
  "opt.years.5": { it: "5 anni" },
  "opt.years.10": { it: "10 anni" },
  "opt.years.15": { it: "15 anni" },
  "opt.years.20": { it: "20 anni" },
  "opt.years.25": { it: "25 anni" },
  "opt.years.30": { it: "30 anni" },

  "plan.sum.start": { it: 'Parti con <b id="sumStart">€15 000</b>' },
  "plan.sum.monthly": { it: 'Aggiungi <b id="sumMonthly">€500</b> ogni mese' },
  "plan.sum.total": {
    it: 'In <b id="sumHorizon">10 anni</b> versi in tutto <b id="sumTotal">€75 000</b>',
  },

  "opts.summary": {
    it: "Imposte, storia e regolazioni fini — i valori predefiniti sono già sensati",
  },

  // ------------------------------------------------------------------- the tax
  "field.country": { it: "Dove paghi le imposte" },
  "opt.country.it": { it: "Italia — togli le imposte italiane" },
  "opt.country.gb": { it: "Regno Unito — togli le imposte britanniche" },
  "opt.country.none": { it: "Nessun paese — mostra le cifre al lordo" },
  "field.fund": { it: "Cosa fanno i fondi con le cedole e i dividendi" },
  "opt.fund.acc": { it: "Li reinvestono (ad accumulazione)" },
  "opt.fund.dist": { it: "Me li pagano (a distribuzione)" },
  "field.wrapper": { it: "Tipo di conto" },
  "opt.wrapper.taxable": { it: "Un normale conto titoli" },
  "opt.wrapper.isa": { it: "Un conto Stocks &amp; Shares ISA" },
  "field.band": { it: "La tua aliquota sul reddito" },
  "opt.band.basic": { it: "Aliquota base — reddito sotto £50.270" },
  "opt.band.higher": { it: "Aliquota alta — da £50.270 a £125.140" },
  "opt.band.additional": { it: "Aliquota massima — oltre £125.140" },

  "field.view": { it: "Mostra gli importi in" },
  "opt.view.real": { it: "Potere d'acquisto di oggi" },
  "opt.view.nominal": { it: "Euro futuri" },
  "field.inflation": { it: "Inflazione ipotizzata, % all'anno" },

  "field.era": { it: "Su quale storia imparare" },
  "opt.era.1900": { it: "1900–2025 — tutto, guerre incluse" },
  "opt.era.1950": { it: "1950–2025 — solo dopoguerra" },
  "opt.era.1970": { it: "1970–2025 — mercati moderni" },
  "opt.era.1990": { it: "1990–2025 — solo anni recenti" },
  "field.terRisky": { it: "Costo annuo dell'ETF azionario, %" },
  "field.terSafe": { it: "Costo annuo dell'ETF obbligazionario, %" },
  "field.nPaths": { it: "Numero di percorsi simulati" },
  "opt.nPaths.20000": { it: "20 000 — il più veloce" },
  "opt.nPaths.100000": { it: "100 000 — consigliato" },
  "opt.nPaths.200000": { it: "200 000 — più lento, code più stabili" },
  "field.blockMean": { it: "Lunghezza media dei tratti riusati, anni" },
  "opt.blockMean.1": { it: "1 — anni mescolati uno per uno" },
  "opt.blockMean.5": { it: "5 — valore calibrato" },
  "opt.blockMean.10": { it: "10 — regimi lunghi" },
  "field.seed": { it: "Seme casuale" },
  "field.intraYear": { it: "Oscillazioni dentro l'anno" },
  "field.intraYear.check": { it: "Simula l'andamento mese per mese" },

  "adv.tax.title": { it: "Ipotesi fiscali" },
  "adv.tax.sub": {
    it: `Usate solo quando qui sopra è selezionato un paese. I rendimenti da cedole e
      dividendi decidono quanta parte del guadagno arriva come reddito, che è la
      parte che alcuni paesi tassano ogni anno.`,
  },
  "field.equityYield": { it: "Dividendo dell'ETF azionario, % all'anno" },
  "field.bondYield": { it: "Cedola dell'ETF obbligazionario, % all'anno" },
  "field.wealthRate": { it: "Imposta annua sul patrimonio investito, %" },
  "field.gbpEur": { it: "Sterline per euro, per le franchigie britanniche" },
  "adv.reset": { it: "Riporta tutto ai valori predefiniti" },

  // ================================================================ the answer
  "res.title": { it: "2 · La risposta" },
  "res.heroLabel": {
    it: 'il caso più probabile, in <span id="heroUnit">euro futuri</span>',
  },
  "tile.paidIn": { it: "Soldi che hai messo" },
  "tile.p1": { it: "Molto sfortunato — il peggior caso su 100" },
  "tile.mean": { it: "La media di tutti i percorsi" },
  "tile.p99": { it: "Molto fortunato — il miglior caso su 100" },
  "tile.minPath": { it: "Punto più basso lungo la strada" },
  "tile.maxPath": { it: "Punto più alto lungo la strada" },
  "tile.below": { it: "Probabilità di finire in perdita" },

  "res.chart.title": { it: "Tutta la gamma, anno per anno" },
  "res.chart.sub": {
    it: `La linea spessa al centro è il percorso più probabile; le aree colorate
      mostrano quanto in alto e quanto in basso le cose potrebbero
      ragionevolmente andare lungo la strada.`,
  },
  "chart.opts.summary": { it: "Opzioni del grafico e numeri esatti" },
  "chart.bandsLabel": { it: "Fasce da mostrare" },
  "chart.band99": { it: "99 su 100" },
  "chart.band95": { it: "95 su 100" },
  "chart.band50": { it: "la metà ordinaria" },
  "chart.overlayLabel": { it: "Disegna anche un periodo reale della storia" },
  "chart.overlay.worst": { it: "il peggiore che sia davvero accaduto" },
  "chart.showTable": { it: "Mostra i numeri" },

  // ============================================================== the range
  "range.title": { it: "3 · Il resto della gamma — i casi sfortunati e fortunati intermedi" },
  "range.hint": { it: "cosa significa davvero “1 su 100”" },
  "tile.p5": { it: "Sfortunato — i 5 peggiori casi su 100" },
  "tile.p25": { it: "Estremo basso della metà ordinaria" },
  "tile.p75": { it: "Estremo alto della metà ordinaria" },
  "tile.p95": { it: "Fortunato — i 5 migliori casi su 100" },
  "range.callout": {
    it: `<strong>Come si legge “il peggior caso su 100”.</strong> Su cento futuri
      simulati, novantanove sono finiti sopra quel numero e uno sotto. È un caso
      brutto ma plausibile, non la cosa peggiore immaginabile: una guerra, il
      crollo di una valuta o un tipo di crisi mai visto possono fare peggio, e la
      storia contiene tutti e tre.`,
  },

  // ============================================================ the bumpy road
  "dip.title": { it: "4 · La strada accidentata — quanto si soffre lungo il percorso?" },
  "dip.hint": { it: "i cali che fanno mollare la gente" },
  "dip.sub": {
    it: `Il risultato finale è solo metà della storia. Quello che di solito porta a
      vendere nel momento peggiore è ciò che accade nel frattempo. Queste cifre
      sono il punto più basso e il punto più alto toccati dal tuo capitale
      durante tutto il periodo, non solo alla fine.`,
  },
  "dip.lowest.title": { it: "Il punto più basso toccato dal tuo capitale" },
  "tile.low1": { it: "Punto più basso — 1 caso su 100" },
  "tile.low5": { it: "Punto più basso — 5 casi su 100" },
  "tile.lowMed": { it: "Punto più basso — caso tipico" },
  "dip.highest.title": { it: "Il punto più alto raggiunto dal tuo capitale" },
  "tile.high50": { it: "Punto più alto — caso tipico" },
  "tile.high95": { it: "Punto più alto — 5 casi su 100" },
  "tile.high99": { it: "Punto più alto — 1 caso su 100" },
  "dip.highest.note": {
    it: `Un massimo molto più alto del valore finale è un avvertimento, non una buona
      notizia: significa che quei soldi c'erano e poi sono andati via.`,
  },
  "dip.dd.title": { it: "La caduta più profonda da un massimo" },
  "tile.dd50": { it: "Caduta più profonda — caso tipico" },
  "tile.dd95": { it: "Caduta più profonda — 5 casi su 100" },
  "tile.dd99": { it: "Caduta più profonda — 1 caso su 100" },
  "dip.gap.title": { it: "Quanto sotto il versato puoi arrivare" },
  "tile.gap1": { it: "Massimo scarto sotto quanto avevi versato — 1 caso su 100" },
  "tile.gap50": { it: "Massimo scarto sotto quanto avevi versato — caso tipico" },
  "dip.gap.note": {
    it: `Qui il tuo capitale è confrontato con la somma semplice dei soldi che avevi
      consegnato fino a quel mese. Vedere sull'estratto conto meno di quanto hai
      messo è il motivo più comune per cui si abbandona un piano — quindi vale la
      pena conoscere il numero in anticipo.`,
  },

  // ================================================================== the tax
  "tax.title": { it: "5 · Quanto si prende il fisco" },
  "tile.taxTotal": { it: "Imposte versate in tutto" },
  "tile.taxYearly": { it: "Pagate anno per anno, strada facendo" },
  "tile.taxExit": { it: "Pagate alla fine, quando vendi" },
  "tile.taxShare": { it: "Quota del guadagno che ti viene presa" },
  "tax.medianNote": {
    it: `Ognuna di queste cifre è il valore centrale della propria graduatoria, quindi
      le due voci “quando” non devono necessariamente sommarsi al totale: il
      percorso con il conto totale centrale non è per forza quello con il conto
      annuale centrale.`,
  },
  "tax.rules.title": { it: "Cosa viene applicato" },
  "tax.warn": {
    it: `<strong>Questo è un calcolatore di imposte, non un consulente fiscale.</strong>
      Usa le aliquote ordinarie per un normale investitore privato che detiene due
      comuni ETF UCITS, e non può conoscere la tua situazione. Tre complicazioni
      reali che ignora deliberatamente:
      <ul style="margin:8px 0 0">
        <li>
          In Italia l'aliquota ridotta del 12,5% si applica alla parte governativa
          del rendimento solo se il fondo detiene davvero titoli di Stato white
          list. Un ETF obbligazionario <em>sintetico</em>, che replica l'indice con
          uno swap invece di possedere i titoli, può perdere quel trattamento ed
          essere tassato interamente al 26%.
        </li>
        <li>
          Per il Regno Unito i numeri qui presuppongono che entrambi i fondi abbiano
          il <em>reporting status</em> britannico. Un fondo che non lo ha viene
          tassato su tutto il guadagno come reddito, all'aliquota marginale: molto
          peggio del trattamento da capital gain mostrato qui.
        </li>
        <li>
          Aliquote, scaglioni e franchigie cambiano. Queste sono quelle in vigore per
          l'anno italiano 2026 e per l'anno britannico 2026/27, tenute costanti per
          tutto il periodo — cosa che nessun governo ha mai fatto davvero.
        </li>
      </ul>`,
  },

  // ============================================================ real history
  "hist.title": { it: "6 · Cosa è successo davvero, ogni singola volta" },
  "hist.hint": { it: "storia reale, nessun caso" },
  "hist.note": {
    it: `In questo grafico non c'è nessuna casualità: prende il tuo piano esatto e lo
      fa passare attraverso ogni periodo storico reale, uno che parte da ogni anno.
      Ogni barra conta quanti di quei periodi reali sono finiti in quella fascia.
      Passa il puntatore su una barra per vedere di quali anni si tratta.`,
  },

  // ============================================================= how it works
  "how.title": { it: "7 · Come funziona, in parole semplici" },
  "how.hint": { it: "per chi non sa nulla di finanza" },

  "how.choice.title": { it: "Le due cose fra cui stai scegliendo" },
  "how.choice.equity": {
    it: `<strong>Un ETF azionario mondiale</strong> è un unico fondo, economico, che
      compra un pezzetto di migliaia di aziende in decine di paesi. Non stai
      scommettendo su una singola azienda: stai scommettendo che le aziende, in
      generale, continuino a fare soldi. Sui periodi lunghi ha pagato bene — circa
      <b id="dsEquityCagr">+5%</b> all'anno oltre l'inflazione dal
      <span id="dsRange2">1900</span> — ma il viaggio è violento. Il suo anno
      peggiore in questi dati è stato il <b id="dsEquityWorstYear">2008</b>, con
      <b id="dsEquityWorst">−40%</b>.`,
  },
  "how.choice.bonds": {
    it: `<strong>Obbligazioni governative in euro</strong> significa prestare denaro a
      governi come Germania, Francia, Italia e Spagna, che ti pagano un interesse.
      In un anno normale questa parte si muove appena. Ma le obbligazioni non sono
      una cassaforte: perdono valore quando i tassi salgono, e l'inflazione le
      consuma in silenzio. Su tutto il periodo dal
      <span id="dsRange3">1900</span> le obbligazioni governative dell'area euro
      hanno reso <b id="dsBondCagr">−0,9%</b> all'anno <em>al netto</em>
      dell'inflazione: le due guerre mondiali hanno distrutto gli obbligazionisti
      due volte. Il loro anno peggiore qui è stato il
      <b id="dsBondWorstYear">1923</b>, con <b id="dsBondWorst">−40%</b>.`,
  },
  "how.choice.why": {
    it: `<strong>E allora perché tenere obbligazioni?</strong> Perché di solito salgono
      quando le azioni scendono, il che rende il viaggio più tranquillo e rende più
      probabile che tu resti investito. Guarda cosa succede ai numeri “punto più
      basso” e “caduta più profonda” quando sposti denaro da una parte all'altra:
      è quello lo scambio che stai davvero facendo. Ma “di solito” è una parola che
      lavora molto in quella frase: nel 2022 sono scese insieme, azioni
      <b id="ds2022eq">−18%</b> e obbligazioni <b id="ds2022bd2">−25%</b> al netto
      dell'inflazione. La simulazione tiene azioni e obbligazioni dello stesso anno
      proprio perché anni come quello restino possibili.`,
  },

  "how.units.title": { it: "“Euro futuri” contro “potere d'acquisto di oggi”" },
  "how.units.p1": {
    it: `€100 fra dieci anni non compreranno quello che comprano €100 adesso. Perciò lo
      stesso risultato si può scrivere come due cifre diverse, e l'interruttore
      accanto al tuo piano passa da una all'altra:`,
  },
  "how.units.list": {
    it: `<li>
        <strong>Euro futuri</strong> (il valore predefinito) è la cifra che vedresti
        letteralmente stampata su un estratto conto fra dieci anni — gli euro che
        avrai in mano. È la più grande delle due, perché nel frattempo saranno
        saliti anche i prezzi.
      </li>
      <li>
        <strong>Potere d'acquisto di oggi</strong> quella salita la toglie di nuovo. Se dice
        €102 000, significa <em>tanta spesa quanta ne fai oggi con €102 000</em>. È la
        cifra più piccola e più severa, ed è quella che i dati storici ci danno
        direttamente: tutto è simulato così e poi convertito.
      </li>`,
  },
  "how.units.p2": {
    it: `Per la vista “euro futuri” <em>non</em> ricaviamo l'inflazione dalla storia:
      l'iperinflazione tedesca del 1923 renderebbe la cosa priva di senso. Imposti
      invece un'unica inflazione ipotizzata (2% per default, l'obiettivo della Banca
      Centrale Europea), nella casella accanto all'interruttore. In quella vista
      assumiamo anche che tu alzi il versamento mensile con l'inflazione, così
      mantiene lo stesso valore reale: è per questo che lì la linea dei “soldi
      versati” è più alta.`,
  },

  "how.bands.title": { it: "Cosa significano le fasce" },
  "how.bands.p1": {
    it: `Non simuliamo un futuro, ne simuliamo <b>centomila</b>. Poi mettiamo in fila
      tutti i centomila risultati di ogni mese e leggiamo la graduatoria:`,
  },
  "how.bands.list": {
    it: `<li>il <strong>risultato centrale</strong> è quello esattamente in mezzo — metà sopra, metà sotto;</li>
      <li>la <strong>metà ordinaria</strong> sono i 50 centrali, la fascia che chiameresti normale;</li>
      <li>la fascia <strong>95 su 100</strong> esclude i 2,5 più fortunati e i 2,5 più sfortunati;</li>
      <li>la fascia <strong>99 su 100</strong> esclude solo il mezzo punto percentuale più estremo a ciascun estremo.</li>`,
  },
  "how.bands.p2": {
    it: `Il risultato centrale è usato deliberatamente al posto della media. Le medie
      vengono tirate in alto da una manciata di corse spettacolari e finiscono per
      descrivere un futuro che la maggior parte delle persone non avrà.`,
  },

  "how.steps.title": { it: "I cinque passi dietro ogni numero di questa pagina" },
  "how.steps.list": {
    it: `<li>
        <strong>Raccogliere la storia reale.</strong> Rendimenti annuali al netto
        dell'inflazione per le azioni mondiali e per le obbligazioni governative
        dell'area euro per <b id="dsN2">126</b> anni,
        <span id="dsRange4">1900–2025</span>.
      </li>
      <li>
        <strong>Costruire un futuro sintetico.</strong> Si prende un anno a caso
        della storia, poi si continua con gli anni che sono venuti davvero dopo per
        un po', poi si salta a un altro anno a caso, e così via finché il periodo è
        pieno. Azioni e obbligazioni si prendono sempre dallo <em>stesso</em> anno,
        così le crisi reali restano intatte: se esce il 2008, esce per entrambe.
      </li>
      <li>
        <strong>Riempire i mesi.</strong> Un anno che finisce piatto può comunque
        essere sceso del 30% nel mezzo. Ogni anno viene spezzato in dodici passi
        mensili che vagano in modo realistico ma sono vincolati a sommare
        esattamente il rendimento reale di quell'anno. È questo che rende onesti i
        numeri del “punto più basso”.
      </li>
      <li>
        <strong>Far passare il tuo piano vero attraverso quel futuro.</strong> I tuoi
        importi iniziali, i versamenti mensili aggiunti alla fine di ogni mese, i
        costi annuali dei fondi tolti — e, se hai scelto un paese, le imposte
        sottratte quando e come sono dovute.
      </li>
      <li>
        <strong>Ripetere centomila volte</strong> e leggere la graduatoria.
      </li>`,
  },

  "how.tax.title": { it: "Come sono trattate le imposte" },
  "how.tax.p1": {
    it: `Scegli un paese nel riquadro delle opzioni e ogni cifra di questa pagina
      diventa quello che porteresti davvero a casa: il capitale che potresti
      vendere, <em>dopo</em> aver regolato i conti con il fisco. Scegli “nessun
      paese” e vedi lo stesso piano al lordo, che è il modo onesto di capire quanto
      ti costano davvero le imposte.`,
  },
  "how.tax.p2": {
    it: `Il paese <strong>non cambia nient'altro</strong>. I due fondi sono gli stessi
      dovunque tu viva — un ETF azionario mondiale e un ETF obbligazionario
      governativo in euro — quindi i rendimenti, la storia e il ricampionamento
      sono identici. Cambiano solo le imposte.`,
  },
  "how.tax.p3": {
    it: "Il denaro può essere prelevato in tre modi molto diversi, e fanno male in modo diverso:",
  },
  "how.tax.list": {
    it: `<li>
        <strong>Un'imposta annua su tutto il capitale.</strong> L'Italia ce l'ha:
        l'<em>imposta di bollo</em> (o l'IVAFE con un broker estero), 0,20% all'anno
        su quanto vale il tuo deposito. La devi negli anni buoni e in quelli
        cattivi — non è un'imposta sul guadagno. Il Regno Unito non ha nulla di
        simile. Qui è addebitata in dodici piccole rate mensili, che è vicino a come
        la fatturano davvero le banche.
      </li>
      <li>
        <strong>Un'imposta annua sul reddito che i fondi incassano.</strong> Le azioni
        pagano dividendi e le obbligazioni pagano cedole. Nel Regno Unito quel reddito
        è tassabile nell'anno in cui matura <em>anche se il fondo lo trattiene e lo
        reinveste</em> — è l'“excess reportable income” di un fondo con reporting
        status. In Italia un ETF ad accumulazione non viene toccato affatto finché non
        vendi: è per questo che la scelta accumulazione/distribuzione nel riquadro
        delle opzioni conta così tanto per un investitore italiano. Il reddito già
        tassato viene aggiunto al costo fiscale, così non è mai tassato due volte.
      </li>
      <li>
        <strong>Un'imposta sul guadagno quando vendi.</strong> Italia: 26% di
        <em>imposta sostitutiva</em>, ridotta al 12,5% sulla parte del guadagno che
        viene da titoli di Stato white list — quindi la parte obbligazionaria è
        tassata a circa metà dell'aliquota di quella azionaria. Regno Unito: capital
        gains tax al 18% dentro lo scaglione base e al 24% sopra, con i primi £3.000
        di guadagno esenti ogni anno.
      </li>`,
  },
  "how.tax.p4": {
    it: `Ogni mese la pagina mostra il <em>valore di liquidazione</em>: il tuo capitale
      meno le imposte che una vendita in quel mese farebbe scattare. È per questo
      che le imposte peggiorano anche i numeri del “punto più basso” e della
      “caduta più profonda”: il conto col fisco è reale in ogni istante, non solo
      alla fine.`,
  },
  "how.tax.p5": {
    it: `<strong>Due dettagli facili da sbagliare, e qui giusti.</strong> Primo, le
      imposte si pagano sul guadagno <em>nominale</em>: nessun paese ti fa dedurre
      l'inflazione. Quindi più alta è l'inflazione, più grande è la quota del tuo
      guadagno <em>reale</em> che le imposte si prendono — alza l'ipotesi di
      inflazione e guarda crescere il conto fiscale anche se nulla di reale è
      cambiato. Secondo, l'Italia tassa i guadagni degli ETF come
      <em>redditi di capitale</em> ma le perdite come <em>redditi diversi</em>, due
      categorie separate: una perdita sul fondo obbligazionario <em>non</em> può
      quindi essere compensata con un guadagno su quello azionario. Nel Regno Unito
      sì. Prova i due paesi con un piano ricco di obbligazioni in un decennio brutto
      e vedrai la differenza.`,
  },
  "how.tax.p6": {
    it: `Le imposte vengono tolte dal capitale investito. Se nella vita reale le
      pagassi dal conto corrente, l'aritmetica è la stessa: la tua ricchezza totale
      finisce identica, i soldi escono solo da una tasca diversa.`,
  },
  "how.tax.p7": {
    it: `Una cosa che nessun singolo numero può mostrare: l'imposta pagata presto ti
      costa più del suo valore nominale, perché quel denaro non potrà mai più
      capitalizzare. È per questo che il calo del tuo totale finale è sempre
      <em>maggiore</em> delle imposte che hai davvero consegnato.`,
  },

  "how.replay.title": { it: "Perché non riprodurre semplicemente la storia?" },
  "how.replay.p1": {
    it: `Lo facciamo — è la sezione 6, ed è la cosa più affidabile della pagina. Ma non
      può rispondere alla domanda che hai fatto. Tra il 1900 e il 2025 ci sono solo
      117 periodi di dieci anni, e si sovrappongono molto: 1970–1979 e 1971–1980
      condividono nove dei loro dieci anni. In pratica sono solo una dozzina di
      esperimenti indipendenti. Da una dozzina di casi non si può misurare un evento
      “1 su 100”.`,
  },
  "how.replay.p2": {
    it: `Il ricampionamento del passo 2 risolve il problema rimontando la storia reale
      in ordini nuovi. Riusa solo cose che sono davvero accadute, ma può produrre
      combinazioni che ci è capitato di non vivere — un 2008 che arriva subito dopo
      un 1973, per esempio. Ed è proprio il punto: niente dice che il prossimo
      decennio debba essere uno dei 117 che abbiamo già visto.`,
  },

  "how.blocks.title": { it: "Perché tratti di circa cinque anni?" },
  "how.blocks.p1": {
    it: `Se mescolassimo i singoli anni uno per uno distruggeremmo qualcosa di reale:
      i periodi brutti si raggruppano. I rendimenti obbligazionari in particolare
      sono fortemente legati da un anno all'altro (una correlazione di circa
      <b>+0,51</b> a un anno di distanza in questi dati, dove sotto lo 0,18 non si
      distinguerebbe dal caso), perché i regimi di tassi e di inflazione durano a
      lungo. Separare gli anni renderebbe il mondo, in silenzio, più sicuro di quanto
      sia.`,
  },
  "how.blocks.p2": {
    it: `Per questo teniamo tratti di lunghezza media cinque anni. Cinque non è una
      questione di gusto: è la lunghezza alla quale la dispersione dei risultati
      simulati a dieci anni corrisponde a quella osservata davvero nelle finestre
      storiche sovrapposte di dieci anni, entro circa l'1,6%. Puoi cambiarla nel
      riquadro delle opzioni e guardare le code allargarsi o restringersi.`,
  },

  "how.missing.title": { it: "Cosa <em>non</em> c'è in questi numeri" },
  "how.missing.list": {
    it: `<li><strong>Quasi tutto il resto del diritto tributario.</strong> Le imposte <em>sono</em> incluse per i due paesi disponibili, ma solo nelle parti che incontra un normale investitore privato con due ETF: l'imposta annua sul capitale, l'imposta sul reddito dei fondi e l'imposta sul guadagno alla vendita. Patrimoniali di altri paesi, imposte di successione, imposte all'uscita per cambio di residenza, la Tobin tax italiana (che comunque non si applica agli ETF), le minusvalenze riportate dagli anni precedenti e qualunque franchigia che tu abbia già usato altrove non ci sono.</li>
      <li><strong>Costi di negoziazione e di piattaforma.</strong> È addebitato solo il costo annuo di gestione dei fondi. Commissioni del broker, cambio valuta e spese di conto no.</li>
      <li><strong>Il ribilanciamento.</strong> Le due parti sono lasciate andare alla deriva. Se le azioni volano, la tua quota rischiosa cresce e resta cresciuta.</li>
      <li><strong>Il tuo comportamento.</strong> La simulazione non va mai nel panico, non smette mai di versare, non vende mai sul fondo. Le persone vere lo fanno.</li>
      <li><strong>Il rischio di cambio.</strong> L'indice azionario mondiale è trattato in euro senza copertura, che è ciò che un tipico investitore in euro detiene — ma la storia dei cambi prima del 1971 era un mondo molto diverso.</li>
      <li><strong>Ciò che non ha precedenti.</strong> Tutto qui è assemblato da cose già accadute. Il prossimo decennio ha il permesso di essere più strano di tutte.</li>`,
  },
  "how.advice": {
    it: `<strong>Questa non è consulenza finanziaria né fiscale.</strong> È un
      calcolatore per costruirsi un'intuizione sul rischio. Non può conoscere la tua
      situazione, i tuoi altri risparmi, la sicurezza del tuo lavoro, i tuoi debiti
      o il resto della tua posizione fiscale. I rendimenti passati davvero non
      predicono quelli futuri, e le regole fiscali cambiano.`,
  },

  // ================================================================= glossary
  "gloss.title": { it: "8 · Ogni parola spiegata" },
  "gloss.hint": { it: "22 termini, in parole semplici" },
  "gloss.list": {
    it: `<dt>ETF (fondo quotato in borsa)</dt>
    <dd>Una cosa sola che puoi comprare e che contiene dentro molti investimenti. Un “ETF azionario mondiale” contiene azioni di migliaia di aziende in tutto il mondo, così il fallimento di una singola azienda non può farti molto male. Si compra e si vende come un'azione e costa tipicamente lo 0,1–0,3% del tuo denaro all'anno.</dd>

    <dt>Titolo di Stato (obbligazione governativa)</dt>
    <dd>Un prestito a un governo. Consegni del denaro, ricevi interessi e alla fine ti restituiscono il capitale. Più sicuro delle azioni, perché i governi raramente non pagano — ma il prezzo di mercato di un titolo già emesso scende quando i nuovi titoli iniziano a offrire interessi più alti.</dd>

    <dt>Rendimento reale (“al netto dell'inflazione”)</dt>
    <dd>Quanto in più puoi davvero comprare. Se i tuoi soldi crescono del 5% ma i prezzi salgono del 2%, il tuo rendimento reale è circa il 3%. Tutta la simulazione gira in termini reali: porta l'interruttore su “potere d'acquisto di oggi” e ogni cifra della pagina è una cifra reale.</dd>

    <dt>Rendimento totale</dt>
    <dd>Variazione di prezzo <em>più</em> i dividendi e gli interessi ricevuti, ipotizzando di averli reinvestiti. Ignorare i dividendi sottostimerebbe il rendimento delle azioni di circa il 2–4% all'anno, quindi non lo facciamo mai.</dd>

    <dt>Percentile</dt>
    <dd>Una posizione nella graduatoria. Il “5° percentile” significa: metti in fila tutti i risultati dal peggiore al migliore, e questo è quello al 5% della fila. 95 su 100 hanno fatto meglio.</dd>

    <dt>Mediana (il “risultato centrale”)</dt>
    <dd>Il 50° percentile — il risultato esattamente in mezzo. Più rappresentativo della media, che poche vincite enormi possono trascinare molto lontano dall'esperienza tipica.</dd>

    <dt>Volatilità</dt>
    <dd>Quanto i rendimenti rimbalzano da un anno all'altro. Più volatilità significa una gamma di risultati più larga e un viaggio più movimentato, in entrambe le direzioni.</dd>

    <dt>Drawdown (caduta da un massimo)</dt>
    <dd>Quanto il tuo capitale è sceso rispetto al suo massimo raggiunto fino a quel momento. Un drawdown del 40% significa che in un certo momento stavi guardando il 40% in meno del massimo che avevi mai avuto.</dd>

    <dt>TER (costo totale del fondo)</dt>
    <dd>Il costo annuo del fondo, prelevato automaticamente dal valore del fondo stesso. 0,20% significa €20 all'anno su €10 000. Numeri piccoli, ma si accumulano: 0,5% all'anno costa circa il 5% del tuo denaro in dieci anni.</dd>

    <dt>Correlazione</dt>
    <dd>Se due cose si muovono insieme. +1 significa sempre all'unisono, 0 significa senza relazione, −1 significa opposti perfetti. Azioni e obbligazioni qui sono state circa <b id="dsCorr">0.2</b>: legate, ma poco, che è esattamente ciò che rende utile tenerle entrambe.</dd>

    <dt>Simulazione Monte Carlo</dt>
    <dd>Far passare lo stesso piano attraverso un numero enorme di futuri possibili e poi studiare l'intera collezione di risultati, invece di cercare di indovinare l'unica risposta giusta.</dd>

    <dt>Fondo ad accumulazione o a distribuzione</dt>
    <dd>Un fondo <em>ad accumulazione</em> trattiene i dividendi e le cedole che incassa e li reinveste per te, così la tua quota vale semplicemente di più. Un fondo <em>a distribuzione</em> ti versa quel denaro sul conto. Gli investimenti sono identici, cambia solo l'idraulica — e in Italia quell'idraulica decide se sei tassato ogni anno oppure solo quando vendi.</dd>

    <dt>Imposta di bollo / IVAFE (Italia)</dt>
    <dd>Un'imposta annua dello 0,20% sul valore dei tuoi investimenti — €20 all'anno su €10 000 — indipendentemente dal fatto che tu abbia guadagnato. La addebita la tua banca se il conto è italiano (<em>imposta di bollo</em>) oppure la dichiari tu se il broker è estero (<em>IVAFE</em>). È l'unica imposta che paghi anche in un anno in perdita.</dd>

    <dt>Imposta sostitutiva (Italia)</dt>
    <dd>L'imposta fissa sui guadagni finanziari, il 26%, che sostituisce l'imposta sul reddito. Ridotta al 12,5% sulla parte del rendimento che viene da titoli di Stato di paesi nella “white list” italiana — ed è per questo che la parte obbligazionaria di questo piano è tassata più dolcemente di quella azionaria.</dd>

    <dt>White list (Italia)</dt>
    <dd>L'elenco ufficiale dei paesi i cui titoli di Stato hanno l'aliquota ridotta del 12,5% invece del 26%. Comprende tutti i governi dell'area euro, quindi un ETF obbligazionario governativo in euro che possiede davvero i titoli rientra.</dd>

    <dt>Capital gains tax (Regno Unito)</dt>
    <dd>L'imposta sul guadagno quando vendi, non sul denaro investito. 18% se il tuo reddito ti tiene nello scaglione base, 24% sopra, e i primi £3.000 di guadagno in un anno fiscale sono esenti. Le perdite possono essere compensate con i guadagni — cosa che in Italia non è vera.</dd>

    <dt>Excess reportable income (Regno Unito)</dt>
    <dd>Il reddito che un fondo ha incassato ma non ha distribuito. Se il fondo ha il “reporting status” britannico, devi l'imposta su quel reddito nell'anno in cui è maturato anche se non hai visto un euro — e l'imposta pagata così viene poi aggiunta al costo fiscale, perché lo stesso denaro non sia tassato di nuovo alla vendita.</dd>

    <dt>ISA (Regno Unito)</dt>
    <dd>Individual Savings Account: un normale conto di investimento dentro un involucro esente da imposte. Nessuna imposta sul reddito, nessuna sul guadagno, niente da dichiarare. C'è un limite annuo a quanto puoi versare, che questa pagina non controlla.</dd>

    <dt>Costo fiscale (base imponibile)</dt>
    <dd>Quello che il fisco considera l'importo che hai pagato. Il tuo guadagno tassabile è il prezzo di vendita meno il costo fiscale. Ogni euro che versi lo alza, e lo alza anche il reddito su cui sei già stato tassato: è il meccanismo che impedisce che lo stesso denaro sia tassato due volte.</dd>

    <dt>Guadagno nominale</dt>
    <dd>Il guadagno misurato in euro correnti, ignorando l'inflazione. Le imposte si pagano sempre su questo, mai sul guadagno reale che è più piccolo — quindi l'inflazione aumenta in silenzio l'aliquota vera sul tuo potere d'acquisto.</dd>

    <dt>Bootstrap / block bootstrap</dt>
    <dd>Costruire nuove storie possibili pescando pezzi da quella vera. “Block” significa che peschiamo tratti di più anni invece di singoli anni, così i disegni che durano diversi anni sopravvivono.</dd>`,
  },

  // ==================================================================== data
  "data.title": { it: "9 · Da dove vengono i dati" },
  "data.hint": { it: "fonti, punti deboli, come verificare" },
  "data.intro": {
    it: `<b id="dsN">126</b> anni, <span id="dsRange5">1900–2025</span>. Dataset
      costruito il <span id="dsBuilt">—</span>.`,
  },
  "data.jst.title": { it: '1900 – <span id="dsSplice">2020</span>' },
  "data.jst.p": {
    it: `Il <a href="https://www.macrohistory.net/database/" rel="noopener">Jordà-Schularick-Taylor
      Macrohistory Database</a> (release 6), la fonte accademica di riferimento per
      la storia finanziaria di lungo periodo. Fornisce rendimenti totali annuali
      delle azioni, rendimenti totali dei titoli di Stato a lunga scadenza e prezzi
      al consumo per 18 economie avanzate.`,
  },
  "data.jst.list": {
    it: `<li><strong>Azioni mondiali</strong> = la media dei rendimenti azionari reali dei 16 paesi che riportano dati azionari, pesata per la dimensione dell'economia di ciascuno.</li>
      <li><strong>Obbligazioni in euro</strong> = lo stesso calcolo su Germania, Francia, Italia, Spagna, Paesi Bassi, Belgio, Portogallo e Finlandia.</li>
      <li><strong>I pesi usano la dimensione dell'economia dell'anno <em>precedente</em></strong>, così il calcolo non usa mai informazioni che all'epoca non poteva avere.</li>
      <li>Rendimento reale per paese = (1 + rendimento totale del paese) ÷ (1 + inflazione del paese) − 1.</li>`,
  },
  "data.etf.title": { it: '<span id="dsSpliceFrom">2021</span> – oggi' },
  "data.etf.p": {
    it: `Fondi realmente investibili, così il passato recente riflette quello che
      avresti davvero potuto comprare: <strong>iShares Core MSCI World UCITS
      ETF</strong> (IWDA.AS) in euro per le azioni, <strong>iShares Core EUR Govt
      Bond UCITS ETF</strong> (IEGA.AS) per le obbligazioni, entrambi su prezzi di
      chiusura giornalieri corretti per i dividendi, deflazionati con l'indice HICP
      dell'area euro di Eurostat.`,
  },
  "data.stats.title": { it: "Che aspetto hanno i numeri" },
  "data.stats.caption": {
    it: "Statistiche di lungo periodo dei due strumenti, al netto dell'inflazione",
  },
  "data.stats.th": {
    it: 'Al netto dell\'inflazione, <span id="dsRange6">1900–2025</span>',
  },
  "data.col.shares": { it: "Azioni mondiali" },
  "data.col.bonds": { it: "Obbligazioni governative in euro" },
  "data.col.shares2": { it: "Azioni" },
  "data.col.bonds2": { it: "Obbligazioni" },
  "data.row.cagr": { it: "Crescita all'anno" },
  "data.row.vol": { it: "Oscillazione da un anno all'altro" },
  "data.row.best": { it: "Anno migliore" },
  "data.row.worst": { it: "Anno peggiore" },

  "data.worst.title": { it: "I cinque anni peggiori mai registrati" },
  "data.worst.caption": {
    it: "Anni singoli peggiori per ciascuno strumento, al netto dell'inflazione",
  },
  "data.worst.shareYear": { it: "Anno azioni" },
  "data.worst.bondYear": { it: "Anno obbligazioni" },
  "data.worst.note": {
    it: `Due di quegli anni obbligazionari sono l'iperinflazione tedesca e il periodo
      immediatamente dopo, che spazzarono via completamente gli obbligazionisti
      interni. Non è un difetto statistico: è il motivo per cui il caso
      obbligazionario “1 su 100” appare così cupo, e il motivo per cui nel riquadro
      delle opzioni esiste la scelta dell'epoca.`,
  },

  "data.era.title": { it: "L'epoca su cui stai imparando adesso" },
  "data.era.caption": { it: "Statistiche dell'epoca storica selezionata" },
  "data.era.th": {
    it: '<span id="eraYears">1900–2025</span> (<span id="eraN">126</span> anni)',
  },
  "data.era.row.cagr": { it: "Crescita all'anno, al netto dell'inflazione" },
  "data.era.row.corr": { it: "Correlazione tra le due" },

  "data.weak.title": { it: "Debolezze dichiarate dei dati" },
  "data.weak.list": {
    it: `<li><strong>Pesi per dimensione dell'economia, non per capitalizzazione.</strong> Nessuno ha dati affidabili sulla dimensione dei mercati azionari di ogni paese fino al 1900, quindi l'indice mondiale è pesato per PIL. È prassi standard nella ricerca di lungo periodo, ma non è ciò che fa oggi un vero fondo indicizzato.</li>
      <li><strong>Dati annuali, non giornalieri.</strong> Prima del <span id="dsSplice2">2020</span> abbiamo un solo numero per anno. Il dettaglio mese per mese è ricostruito statisticamente, non osservato.</li>
      <li><strong>Solo i paesi sopravvissuti come fonti di dati.</strong> Il dataset copre le economie avanzate che hanno tenuto i registri. I mercati chiusi o distrutti — la Russia nel 1917, la Cina nel 1949 — sono assenti, e questo fa apparire la storia un po' più gentile di quanto sia stata.</li>
      <li><strong>La giuntura nel <span id="dsSpliceFrom2">2021</span>.</strong> Sono cuciti insieme due tipi di misurazione diversi. Sono stati confrontati tra loro sugli anni in cui esistono entrambi, e vanno d'accordo da vicino, ma una giuntura è una giuntura.</li>
      <li><strong>L'euro non esisteva per la maggior parte di questa storia.</strong> “Obbligazioni governative in euro” prima del 1999 significa i titoli dei paesi che poi hanno formato l'euro, nelle loro valute.</li>`,
  },
  "data.check.title": { it: "Verifica tu stesso" },
  "data.check.p": {
    it: `Tutto in questa pagina gira nel tuo browser; niente viene mandato da nessuna
      parte. Il dataset, il motore di simulazione e la sua suite di test sono tutti
      nel repository:`,
  },
  "data.check.list": {
    it: `<li><code>data-build/build_dataset.py</code> — scarica le fonti e ricostruisce il dataset da zero</li>
      <li><code>data/returns.json</code> — i <b id="dsN3">126</b> anni di rendimenti, in testo semplice</li>
      <li><code>js/engine.js</code> — la simulazione</li>
      <li><code>js/tax.js</code> — tutto il modello fiscale per paese, aliquote incluse</li>
      <li><code>tests/verify.mjs</code> — <b id="dsChecks">90</b> verifiche, incluse dimostrazioni contro l'algebra esatta dove esiste</li>
      <li><code>tests/calibrate_blocks.mjs</code> — lo studio che ha scelto la lunghezza dei tratti di cinque anni</li>`,
  },
  "data.check.seed": {
    it: `Il seme casuale è mostrato sotto il grafico. Gli stessi dati con lo stesso seme
      danno sempre esattamente la stessa risposta, quindi qualunque numero qui può
      essere riprodotto.`,
  },

  "foot.sources": {
    it: `Costruito con dati storici del Jordà-Schularick-Taylor Macrohistory Database,
      di Eurostat e di Yahoo Finance; aliquote in vigore per l'anno italiano 2026 e
      per l'anno britannico 2026/27. Nessun tracciamento, nessun cookie, nessun dato
      lascia il tuo browser.`,
  },
  "foot.advice": {
    it: `<strong>Non è consulenza finanziaria né fiscale.</strong> Solo a scopo
      didattico. Se sono in gioco soldi veri e conseguenze vere, parla con qualcuno
      di qualificato che conosca la tua situazione.`,
  },

  // ============================================================================
  //  Sentences built in JavaScript. Both languages, {placeholders} in both.
  // ============================================================================

  // ---------------------------------------------------------------- chrome
  "js.theme.toLight": { en: "Light mode", it: "Tema chiaro" },
  "js.theme.toDark": { en: "Dark mode", it: "Tema scuro" },
  "js.theme.ariaLight": { en: "Switch to light mode", it: "Passa al tema chiaro" },
  "js.theme.ariaDark": { en: "Switch to dark mode", it: "Passa al tema scuro" },

  "js.status.simulating": { en: "Simulating…", it: "Simulazione in corso…" },
  "js.status.simulatingPct": {
    en: "Simulating… {pct}%",
    it: "Simulazione in corso… {pct}%",
  },
  "js.status.failed": { en: "Could not run: {msg}", it: "Non è stato possibile eseguire: {msg}" },
  "js.status.noWorker": {
    en: "Running in this tab (worker unavailable) — the page may pause briefly.",
    it: "Eseguo in questa scheda (worker non disponibile) — la pagina può bloccarsi per un istante.",
  },
  "js.status.crashed": { en: "Something went wrong: {msg}", it: "Qualcosa è andato storto: {msg}" },
  "js.status.summary": {
    en: "{n} simulated journeys · {w} real historical {years}-year windows · {sec}s · seed {seed} (same inputs always give the same answer)",
    it: "{n} percorsi simulati · {w} finestre storiche reali di {years} anni · {sec}s · seme {seed} (a parità di dati la risposta è sempre la stessa)",
  },

  "js.years": { en: "{n} years", it: "{n} anni" },
  "js.unit.real": { en: "today's buying power", it: "potere d'acquisto di oggi" },
  "js.unit.nominal": { en: "future euros", it: "euro futuri" },
  /* Even a named unit cannot carry the whole difference between a nominal and a
     real amount, so the selected one is spelled out underneath in a sentence. */
  "js.view.note.nominal": {
    en: "The number you would see on a statement in {years} years. Inflation is left in, so it looks bigger — {infl} a year is assumed.",
    it: "La cifra che vedresti su un estratto conto fra {years} anni. L'inflazione è lasciata dentro, quindi sembra più grande — si ipotizza il {infl} all'anno.",
  },
  "js.view.note.real": {
    en: "Inflation taken out: what the money would buy at today's prices.",
    it: "Inflazione tolta: quello che quei soldi comprerebbero ai prezzi di oggi.",
  },
  "js.table.show": { en: "Show the numbers", it: "Mostra i numeri" },
  "js.table.hide": { en: "Hide the numbers", it: "Nascondi i numeri" },
  "js.and": { en: " and ", it: " e " },

  // ------------------------------------------------------------- the headline
  "js.pill.after": { en: "after {short}", it: "al netto delle {short}" },
  "js.pill.isa": { en: "tax-free inside an ISA", it: "esente da imposte dentro un ISA" },
  "js.pill.none": { en: "before any tax", it: "al lordo delle imposte" },
  "js.pill.titleAfter": {
    en: "What you would keep after {label} — the balance minus the tax that selling would trigger.",
    it: "Quello che ti resterebbe al netto di {label} — il capitale meno le imposte che una vendita farebbe scattare.",
  },
  "js.pill.titleNone": {
    en: "No tax has been deducted from any figure on this page.",
    it: "Da nessuna cifra di questa pagina è stata dedotta alcuna imposta.",
  },
  "js.heroNote": {
    en: "Over {years} years you pay in {paid}, so the figure above is {mult}× the money you put in. Both figures are in {unit}, {taxClause}.",
    it: "In {years} anni versi {paid}, quindi la cifra qui sopra è {mult}× i soldi che hai messo. Entrambe le cifre sono in {unit}, {taxClause}.",
  },
  /* In future euros the monthly payment is raised each year to hold its real
     value, so the money-paid-in figure is larger than the plan as typed. Two
     different totals for the same plan, twenty centimetres apart on the page,
     have to be explained where they are read. */
  "js.heroNote.raised": {
    en: " That total rises with inflation too, so each payment keeps the same value; at a flat {monthly} a month it would be {plain}.",
    it: " Anche quel totale sale con l'inflazione, così ogni versamento mantiene lo stesso valore; a {monthly} fissi al mese sarebbe {plain}.",
  },
  "js.heroNote.after": { en: "after {short}", it: "al netto delle {short}" },
  "js.heroNote.before": { en: "before any tax", it: "al lordo delle imposte" },
  "js.heroGain.up": {
    en: "{amount} gain ({pct})",
    it: "{amount} di guadagno ({pct})",
  },
  "js.heroGain.down": {
    en: "{amount} loss ({pct})",
    it: "{amount} di perdita ({pct})",
  },
  "js.heroGain.title": {
    en: "The figure above minus the {paid} you pay in over {years} years, in {unit}.",
    it: "La cifra qui sopra meno i {paid} che versi in {years} anni, in {unit}.",
  },

  // ------------------------------------------------------------------- tiles
  "js.note.below1": { en: "1 chance in 100 of ending below this", it: "1 possibilità su 100 di finire sotto" },
  "js.note.below5": { en: "5 chances in 100 of ending below this", it: "5 possibilità su 100 di finire sotto" },
  "js.note.below25": { en: "25 chances in 100 of ending below this", it: "25 possibilità su 100 di finire sotto" },
  "js.note.above25": { en: "25 chances in 100 of ending above this", it: "25 possibilità su 100 di finire sopra" },
  "js.note.above5": { en: "5 chances in 100 of ending above this", it: "5 possibilità su 100 di finire sopra" },
  "js.note.above1": { en: "1 chance in 100 of ending above this", it: "1 possibilità su 100 di finire sopra" },
  "js.note.mean": {
    en: "pulled up by the luckiest few — the big figure above is the typical one",
    it: "trascinata in alto dai pochi più fortunati — la cifra grande sopra è quella tipica",
  },
  "js.note.paidIn": { en: "{start} now + {monthly}/month", it: "{start} adesso + {monthly}/mese" },
  /* In future euros the monthly payment is raised each year so that it keeps the
     same real value, which is why the total is larger than the plan as typed. */
  "js.note.paidInRaised": {
    en: "{start} now + {monthly}/month, raised with inflation",
    it: "{start} adesso + {monthly}/mese, alzati con l'inflazione",
  },
  "js.note.below": {
    en: "chance of ending with less than you paid in",
    it: "probabilità di finire con meno di quanto hai versato",
  },
  "js.note.minPath": {
    en: "in the typical journey; down to {p1} in the unluckiest 1 case in 100",
    it: "nel percorso tipico; fino a {p1} nel caso più sfortunato su 100",
  },
  "js.note.maxPath": {
    en: "in the typical journey; up to {p99} in the luckiest 1 case in 100",
    it: "nel percorso tipico; fino a {p99} nel caso più fortunato su 100",
  },
  "js.case.unlucky1": { en: "in the unluckiest 1 case in 100", it: "nel caso più sfortunato su 100" },
  "js.case.unlucky5": { en: "in the unluckiest 5 cases in 100", it: "nei 5 casi più sfortunati su 100" },
  "js.case.typical": { en: "in the typical case", it: "nel caso tipico" },
  "js.case.lucky5": { en: "in the luckiest 5 cases in 100", it: "nei 5 casi più fortunati su 100" },
  "js.case.lucky1": { en: "in the luckiest 1 case in 100", it: "nel caso più fortunato su 100" },
  "js.note.dd50": { en: "typical worst fall from a peak", it: "caduta tipica più profonda da un massimo" },
  "js.note.dd95": { en: "worst fall in 5 cases in 100", it: "caduta più profonda nei 5 casi su 100" },
  "js.note.dd99": { en: "worst fall in 1 case in 100", it: "caduta più profonda in 1 caso su 100" },
  "js.note.gap1": {
    en: "worst that your balance ever sat below the money you had paid in, 1 case in 100",
    it: "il massimo di quanto il capitale è stato sotto i soldi versati, 1 caso su 100",
  },
  "js.note.gap50": {
    en: "the same figure in the typical case (0 means it never went underwater)",
    it: "la stessa cifra nel caso tipico (0 significa che non è mai andato sotto)",
  },
  "js.lowestExplain": {
    en: "The lowest point is measured month by month along every one of the {n} simulated journeys, so it includes falls that happen in the middle of a year and recover before the year ends.",
    it: "Il punto più basso è misurato mese per mese su ognuno dei {n} percorsi simulati, quindi comprende anche i cali che avvengono in mezzo all'anno e si recuperano prima che l'anno finisca.",
  },
  "js.allocNote": {
    en: "{risky} of the money you put in goes to the risky part, {safe} to the safer part.",
    it: "Il {risky} dei soldi che versi va nella parte rischiosa, il {safe} in quella più sicura.",
  },

  // ------------------------------------------------------------------ legend
  "js.legend.b99": {
    en: "99 out of 100 outcomes land in here",
    it: "99 risultati su 100 cadono qui dentro",
  },
  "js.legend.b95": { en: "95 out of 100", it: "95 su 100" },
  "js.legend.b50": {
    en: "50 out of 100 (the everyday range)",
    it: "50 su 100 (la fascia ordinaria)",
  },
  "js.legend.median": { en: "Middle outcome", it: "Risultato centrale" },
  "js.legend.paidIn": { en: "Money you paid in", it: "Soldi che hai versato" },
  "js.legend.overlay": {
    en: "{label} (what actually happened)",
    it: "{label} (quello che è davvero accaduto)",
  },

  // ------------------------------------------------------------------- table
  "js.th.year": { en: "Year", it: "Anno" },
  "js.th.worst1": { en: "Worst 1 in 100", it: "Peggior caso su 100" },
  "js.th.worst5": { en: "Worst 5 in 100", it: "5 peggiori su 100" },
  "js.th.lowerEveryday": { en: "Lower everyday", it: "Ordinario basso" },
  "js.th.middle": { en: "Middle", it: "Centrale" },
  "js.th.upperEveryday": { en: "Upper everyday", it: "Ordinario alto" },
  "js.th.best5": { en: "Best 5 in 100", it: "5 migliori su 100" },
  "js.th.best1": { en: "Best 1 in 100", it: "Miglior caso su 100" },
  "js.th.paidIn": { en: "Paid in", it: "Versato" },
  "js.table.caption": {
    en: "Portfolio value by year, in {unit}",
    it: "Valore del portafoglio anno per anno, in {unit}",
  },
  "js.table.footnote": {
    en: "All figures in {unit}. “Everyday range” is the middle half of outcomes (25th to 75th out of 100).",
    it: "Tutte le cifre in {unit}. La “fascia ordinaria” è la metà centrale dei risultati (dal 25° al 75° su 100).",
  },

  // ----------------------------------------------------------------- overlay
  "js.overlay.label": { en: "Real {a}–{b}", it: "Reale {a}–{b}" },
  "js.overlay.none": { en: "none", it: "nessuno" },
  "js.overlay.worst": {
    en: "the worst one that really happened",
    it: "il peggiore che sia davvero accaduto",
  },
  "js.overlay.median": { en: "the middle one", it: "quello centrale" },
  "js.overlay.best": {
    en: "the best one that really happened",
    it: "il migliore che sia davvero accaduto",
  },
  "js.overlay.startingIn": {
    en: "starting in {y} ({a}–{b})",
    it: "con partenza nel {y} ({a}–{b})",
  },

  // ------------------------------------------------------------------- taxes
  "js.tax.plan.none.label": {
    en: "No tax — show the gross result",
    it: "Nessuna imposta — mostra il risultato lordo",
  },
  "js.tax.plan.none.short": { en: "no tax", it: "nessuna imposta" },
  "js.tax.plan.none.country": { en: "—", it: "—" },
  "js.tax.plan.it.label": { en: "Italy", it: "Italia" },
  "js.tax.plan.it.short": { en: "Italian tax", it: "imposte italiane" },
  "js.tax.plan.it.country": { en: "Italy", it: "l'Italia" },
  "js.tax.plan.gb.label": { en: "United Kingdom", it: "Regno Unito" },
  "js.tax.plan.gb.short": { en: "UK tax", it: "imposte britanniche" },
  "js.tax.plan.gb.country": { en: "the UK", it: "il Regno Unito" },
  "js.tax.plan.gb_isa.label": {
    en: "United Kingdom — inside an ISA",
    it: "Regno Unito — dentro un ISA",
  },
  "js.tax.plan.gb_isa.short": { en: "no tax (ISA)", it: "nessuna imposta (ISA)" },
  "js.tax.band.basic": {
    en: "Basic rate (income under £50,270)",
    it: "aliquota base (reddito sotto £50.270)",
  },
  "js.tax.band.higher": {
    en: "Higher rate (£50,270 – £125,140)",
    it: "aliquota alta (£50.270 – £125.140)",
  },
  "js.tax.band.additional": {
    en: "Additional rate (over £125,140)",
    it: "aliquota massima (oltre £125.140)",
  },

  "js.tax.describe.isa": {
    en: "Inside an ISA nothing is taxed: no tax on the income, no tax on the gain, nothing yearly.",
    it: "Dentro un ISA non si tassa niente: nessuna imposta sul reddito, nessuna sul guadagno, niente ogni anno.",
  },
  "js.tax.describe.none": {
    en: "No tax is being applied — these are gross figures.",
    it: "Non viene applicata nessuna imposta: queste sono cifre al lordo.",
  },
  "js.tax.describe.applied": { en: "Applied: {parts}.", it: "Applicato: {parts}." },
  "js.tax.describe.equityExit": {
    en: "{rate} on the gain of the share part",
    it: "{rate} sul guadagno della parte azionaria",
  },
  "js.tax.describe.bondExit": {
    en: "{rate} on the gain of the bond part",
    it: "{rate} sul guadagno della parte obbligazionaria",
  },
  "js.tax.describe.wealth": {
    en: "{rate} a year on the whole balance",
    it: "{rate} all'anno su tutto il capitale",
  },
  "js.tax.describe.income": {
    en: "{eq} a year on share income and {bd} a year on bond income",
    it: "{eq} all'anno sul reddito azionario e {bd} all'anno su quello obbligazionario",
  },
  "js.tax.describe.allowance": {
    en: "the first {amount} of gain in a year free",
    it: "i primi {amount} di guadagno all'anno esenti",
  },

  "js.tax.intro.isa": {
    en: "Inside an ISA the tax authority takes nothing at all: no tax on the income, no tax on the gain, nothing yearly. Every figure on this page is what you keep.",
    it: "Dentro un ISA il fisco non prende assolutamente nulla: nessuna imposta sul reddito, nessuna sul guadagno, niente ogni anno. Ogni cifra di questa pagina è ciò che ti resta.",
  },
  "js.tax.intro.none": {
    en: "No tax is being deducted, so every figure on this page is a before-tax figure. Pick Italy or the United Kingdom above to see what you would actually keep.",
    it: "Non viene dedotta nessuna imposta, quindi ogni cifra di questa pagina è al lordo. Scegli Italia o Regno Unito qui sopra per vedere quello che ti resterebbe davvero.",
  },
  "js.tax.nothingDeducted": { en: "nothing is being deducted", it: "non viene dedotto niente" },
  "js.tax.keepAll": { en: "you keep the whole profit", it: "ti tieni tutto il guadagno" },
  "js.tax.rules.isa": {
    en: "<li>An ISA shelters everything inside it, so there is nothing to apply.</li>",
    it: "<li>Un ISA protegge tutto quello che contiene, quindi non c'è nulla da applicare.</li>",
  },
  "js.tax.rules.none": {
    en: "<li>No country selected, so no rule is being applied.</li>",
    it: "<li>Nessun paese selezionato, quindi non viene applicata nessuna regola.</li>",
  },
  "js.tax.callout.isa": {
    en: "<strong>Worth knowing.</strong> This is the strongest argument for filling an ISA before an ordinary account: switch “Type of account” back and see how much the same plan hands over when it is not sheltered.",
    it: "<strong>Vale la pena saperlo.</strong> È l'argomento più forte per riempire un ISA prima di un conto ordinario: rimetti “Tipo di conto” su quello normale e guarda quanto consegna lo stesso piano quando non è protetto.",
  },
  "js.tax.callout.none": {
    en: "<strong>Try it.</strong> Choose a country above and every number on the page — the headline, the bands, the lowest point, the biggest fall — becomes the after-tax figure instead. The difference is usually larger than people expect.",
    it: "<strong>Provalo.</strong> Scegli un paese qui sopra e ogni numero della pagina — la cifra principale, le fasce, il punto più basso, la caduta più profonda — diventa quello al netto delle imposte. La differenza è di solito più grande di quanto si aspetti.",
  },
  "js.tax.intro": {
    en: "Under <b>{label}</b>, on the middle journey. All amounts in {unit}. Every other figure on this page is already after this tax — the balance you could sell for, minus the tax that selling would trigger.",
    it: "Con <b>{label}</b>, sul percorso centrale. Tutti gli importi in {unit}. Ogni altra cifra di questa pagina è già al netto di queste imposte — il capitale a cui potresti vendere, meno le imposte che la vendita farebbe scattare.",
  },
  "js.tax.note.total": {
    en: "between {lo} and {hi} across the luckier and unluckier journeys",
    it: "tra {lo} e {hi} nei percorsi più fortunati e più sfortunati",
  },
  "js.tax.note.yearly": {
    en: "charges you cannot avoid by holding on — {lo} to {hi}",
    it: "prelievi che non puoi evitare tenendo fermo — da {lo} a {hi}",
  },
  "js.tax.note.yearlyNone": {
    en: "nothing is taken while you hold",
    it: "finché tieni non viene preso niente",
  },
  "js.tax.note.exit": {
    en: "the bill if you sold everything in the final month — {lo} to {hi}",
    it: "il conto se vendessi tutto nell'ultimo mese — da {lo} a {hi}",
  },
  "js.tax.note.share": {
    en: "of the {gross} profit you made before tax",
    it: "del guadagno di {gross} realizzato al lordo",
  },
  "js.tax.rule.exit": {
    en: "<b>{eq}</b> on the gain of the share part and <b>{bd}</b> on the gain of the bond part, charged when you sell.",
    it: "<b>{eq}</b> sul guadagno della parte azionaria e <b>{bd}</b> su quello della parte obbligazionaria, dovuti quando vendi.",
  },
  "js.tax.rule.gentler": {
    en: " Government bonds get the gentler rate.",
    it: " Ai titoli di Stato si applica l'aliquota più leggera.",
  },
  "js.tax.rule.wealth": {
    en: "<b>{rate}</b> a year on the whole balance, owed whether you gained or lost — about {first} in the first year on your {pot} starting pot, and more as the pot grows.",
    it: "<b>{rate}</b> all'anno su tutto il capitale, dovuti sia che tu guadagni sia che tu perda — circa {first} il primo anno sui {pot} iniziali, e di più mentre il capitale cresce.",
  },
  "js.tax.rule.noWealth": {
    en: "No yearly charge on the balance itself.",
    it: "Nessuna imposta annua sul capitale in sé.",
  },
  "js.tax.rule.income": {
    en: "<b>{eqRate}</b> a year on the dividends the share fund earns and <b>{bdRate}</b> a year on the interest the bond fund earns{allowance}. Assumed yields: {eqYield} on shares, {bdYield} on bonds.{uk}",
    it: "<b>{eqRate}</b> all'anno sui dividendi che incassa il fondo azionario e <b>{bdRate}</b> all'anno sulle cedole che incassa il fondo obbligazionario{allowance}. Rendimenti ipotizzati: {eqYield} sulle azioni, {bdYield} sulle obbligazioni.{uk}",
  },
  "js.tax.rule.allowShare": { en: "{amount} of share income", it: "{amount} di reddito azionario" },
  "js.tax.rule.allowBond": { en: "{amount} of bond income", it: "{amount} di reddito obbligazionario" },
  "js.tax.rule.allowWith": {
    en: ", with the first {list} free each year",
    it: ", con i primi {list} esenti ogni anno",
  },
  "js.tax.rule.allowNone": {
    en: ", with no tax-free amount at this income level",
    it: ", senza alcuna franchigia a questo livello di reddito",
  },
  "js.tax.rule.uk": {
    en: " In the UK this is owed even though the fund reinvests the money and you never see it.",
    it: " Nel Regno Unito è dovuta anche se il fondo reinveste il denaro e tu non lo vedi mai.",
  },
  "js.tax.rule.noIncome": {
    en: "Nothing is taxed while you hold: the funds reinvest their income and {country} only taxes it when you finally sell. This is the single biggest advantage of an accumulating ETF here.",
    it: "Finché tieni non si tassa niente: i fondi reinvestono il loro reddito e {country} lo tassa solo quando finalmente vendi. È il più grande vantaggio di un ETF ad accumulazione qui.",
  },
  "js.tax.rule.exitAllowance": {
    en: "The first <b>{amount}</b> of gain in a tax year is free, used against the more heavily taxed part first. It is a fixed cash amount, so inflation shrinks it a little every year.",
    it: "I primi <b>{amount}</b> di guadagno in un anno fiscale sono esenti, usati prima contro la parte tassata più pesantemente. È un importo fisso in denaro, quindi l'inflazione lo riduce un po' ogni anno.",
  },
  "js.tax.rule.lossYes": {
    en: "A loss on one fund <b>can</b> be set against a gain on the other.",
    it: "Una perdita su un fondo <b>può</b> essere compensata con un guadagno sull'altro.",
  },
  "js.tax.rule.lossNo": {
    en: "A loss on one fund <b>cannot</b> be set against a gain on the other: {country} files ETF gains and ETF losses in two separate buckets (<em>redditi di capitale</em> and <em>redditi diversi</em>) that never meet.",
    it: "Una perdita su un fondo <b>non</b> può essere compensata con un guadagno sull'altro: {country} registra i guadagni degli ETF e le perdite degli ETF in due categorie separate (<em>redditi di capitale</em> e <em>redditi diversi</em>) che non si incontrano mai.",
  },
  "js.tax.rule.nominal": {
    en: "Tax is charged on the gain in plain euros, with no allowance for inflation — so raising the inflation assumption raises the tax bill even though nothing real has changed.",
    it: "Le imposte si pagano sul guadagno in euro correnti, senza alcuno sconto per l'inflazione — quindi alzare l'ipotesi di inflazione alza il conto fiscale anche se nulla di reale è cambiato.",
  },
  "js.tax.callout": {
    en: "<strong>The tax costs you more than the tax.</strong> On the middle journey you hand over {total}, which is {share} of the {gross} profit you made. But your final total drops by <em>more</em> than {total}: every euro taken early is also a euro that can never grow again. Set the country to “nowhere” and compare the headline to see the full cost.",
    it: "<strong>Le imposte ti costano più delle imposte.</strong> Sul percorso centrale consegni {total}, cioè il {share} del guadagno di {gross} che hai realizzato. Ma il tuo totale finale scende di <em>più</em> di {total}: ogni euro preso presto è anche un euro che non potrà mai più crescere. Metti il paese su “nessun paese” e confronta la cifra principale per vedere il costo pieno.",
  },

  // -------------------------------------------------------- history section
  "js.hist.summary": {
    en: "Every one of the <b>{n}</b> real {years}-year stretches between {from} and {to}, replayed with your exact plan. The worst was <b>{worst}</b> ({worstV}), the best <b>{best}</b> ({bestV}), and the middle one <b>{med}</b> ({medV}). <b>{nBelow}</b> of them ended below the {paidIn} you would have paid in.",
    it: "Tutti i <b>{n}</b> periodi reali di {years} anni tra il {from} e il {to}, ripercorsi con il tuo piano esatto. Il peggiore è stato <b>{worst}</b> ({worstV}), il migliore <b>{best}</b> ({bestV}) e quello centrale <b>{med}</b> ({medV}). <b>{nBelow}</b> di essi sono finiti sotto i {paidIn} che avresti versato.",
  },

  // ------------------------------------------------------------------ charts
  "js.chart.xTitle": { en: "years from today", it: "anni da oggi" },
  "js.chart.median": { en: "Most likely (middle)", it: "Più probabile (centrale)" },
  "js.chart.paidIn": { en: "Money you paid in", it: "Soldi che hai versato" },
  "js.chart.range99": { en: "99% range", it: "fascia 99%" },
  "js.chart.range95": { en: "95% range", it: "fascia 95%" },
  "js.chart.today": { en: "today", it: "oggi" },
  "js.chart.year": { en: "year {y}", it: "anno {y}" },
  "js.chart.yearMonth": { en: "year {y}, month {m}", it: "anno {y}, mese {m}" },
  "js.chart.live": {
    en: "{when}: middle {med}, 99% range {lo} to {hi}.",
    it: "{when}: centrale {med}, fascia 99% da {lo} a {hi}.",
  },
  "js.chart.aria": {
    en: "Chart of portfolio value over {years} years. Middle outcome ends at {med}; the 99% range is {lo} to {hi}. Use left and right arrow keys to read values, or open the table view below.",
    it: "Grafico del valore del portafoglio su {years} anni. Il risultato centrale finisce a {med}; la fascia 99% va da {lo} a {hi}. Usa le frecce sinistra e destra per leggere i valori, oppure apri la tabella qui sotto.",
  },
  "js.hist.tipCount": { en: "Periods landing here", it: "Periodi che cadono qui" },
  "js.hist.tipMore": { en: " +{n} more", it: " +{n} altri" },
  "js.hist.xTitle": {
    en: "value after the {years} years ({unit})",
    it: "valore dopo i {years} anni ({unit})",
  },
  "js.hist.aria": {
    en: "Histogram of {n} real historical periods of {years} years. Outcomes range from {lo} to {hi}.",
    it: "Istogramma di {n} periodi storici reali di {years} anni. I risultati vanno da {lo} a {hi}.",
  },
};
