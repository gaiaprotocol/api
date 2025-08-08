const API_ENDPOINT = 'https://api.gaia.cc/init-nft-ownership';
const START = 530;
const END = 3332;
const STEP = 10;
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 1000;
const REQUEST_DELAY_MS = 200;

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function initRange(start: number, end: number, attempt = 1): Promise<void> {
  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start, end }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    console.log(`[✅] ${start} ~ ${end}:`, result);

  } catch (err) {
    if (attempt < MAX_RETRIES) {
      console.warn(`[⚠️ RETRY ${attempt}] ${start} ~ ${end}:`, err);
      await delay(RETRY_DELAY_MS);
      return initRange(start, end, attempt + 1);
    } else {
      console.error(`[❌ FAILED after ${MAX_RETRIES} tries] ${start} ~ ${end}:`, err);
      throw err;
    }
  }
}

async function run() {
  for (let start = START; start <= END; start += STEP) {
    const end = Math.min(start + STEP - 1, END);
    await initRange(start, end);
    //await delay(REQUEST_DELAY_MS);
  }
}

run();
