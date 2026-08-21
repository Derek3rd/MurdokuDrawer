# Murdoku

Web app (React + TypeScript + Vite) per creare e giocare a **Murdoku**: un
puzzle di logica su griglia X*Y ispirato al Sudoku, dove bisogna scoprire la
posizione di N sospettati (N = min(X,Y) - 1) usando indizi testuali, con il
vincolo che ogni riga e ogni colonna può contenere un solo sospettato. La
vittima occupa sempre l'ultima cella libera nella zona (area) del killer.

## Funzionalità

- **Editor** (`/editor/:id`): disegna la griglia, aggiungi muri per
  delimitare le aree, posiziona oggetti sulla mappa, assegna la cella
  soluzione di ogni sospettato, indica il killer, crea indizi (direzione,
  area, su/vicino a un oggetto, da solo/insieme) e regole globali.
- **Play** (`/play/:id`): risolvi il puzzle segnando celle candidate a
  matita, confermando la posizione definitiva di un sospettato (che blocca
  automaticamente la sua riga e colonna per gli altri) e verificando la
  soluzione finale.
- Salvataggio **locale**: i puzzle vengono salvati nel `localStorage` del
  browser e possono essere esportati/importati come file `.json` per essere
  condivisi o versionati.

## Sviluppo

```sh
npm install
npm run dev      # dev server con hot reload
npm run build    # build di produzione in dist/
npm run preview  # serve la build di produzione in locale
```

## Portare l'app su Android (Capacitor)

Il progetto è già inizializzato con [Capacitor](https://capacitorjs.com/)
(`capacitor.config.ts`, appId `com.derek3rd.murdokudrawer`). Per generare ed
aprire il progetto Android nativo (richiede Android Studio installato in
locale, non disponibile in questo ambiente cloud):

```sh
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

Ad ogni modifica del codice web, prima di ricompilare l'APK esegui di nuovo
`npm run build && npx cap sync android`.
