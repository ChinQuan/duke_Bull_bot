// Konfiguracja bota – eksportujemy pojedyncze stałe (ESM)
export const BULL_MINT     = "BuLL65dUKeRgZ1TUo3g9F3SAgJmdwq23mcx7erb9QX9D"; // mint tokena
export const SPIN_COST     = 1_000;   // koszt jednego spinu
export const DEPOSIT_AMOUNT= 25_000;  // wpłata wpisowa
export const MIN_WITHDRAW  = 20_000;  // minimalna wypłata
// BACKEND_WALLET uzupełniamy dynamicznie w index.js po wczytaniu klucza
export let   BACKEND_WALLET = null;
