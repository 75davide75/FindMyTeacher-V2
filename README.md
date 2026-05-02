# Orario Classi

Web app locale per consultare rapidamente l'orario di classi e docenti a partire da un PDF.

## Comandi

```bash
npm run dev
```

Avvia l'app su `http://localhost:5173` e le API su `http://localhost:8787`.

```bash
npm run import:pdf -- "/Users/davidesogos/Desktop/orario classi.pdf"
```

Rigenera il database locale in `data/schedule.json` da un PDF.

```bash
npm run build
npm run lint
```

Controllano build TypeScript/Vite e lint.

## Funzionamento

- `server/pdfScheduleParser.ts` legge il PDF con le coordinate del testo e produce lezioni normalizzate.
- `server/index.ts` espone import PDF e lettura orario.
- `src/App.tsx` mostra ricerca per classe/docente, ora corrente/prossima ora e giornata intera.

Il database e' locale: non viene inviato a servizi esterni.
