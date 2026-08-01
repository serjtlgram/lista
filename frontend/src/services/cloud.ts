// cloud.ts — Telegram CloudStorage chunking utility
// Telegram CloudStorage limits keys to 4096 bytes. This utility splits data into chunks.

const CHUNK_SIZE = 4000;

export async function saveToCloudStorage(key: string, value: string): Promise<void> {
  const tg = (window as any).Telegram?.WebApp;
  if (!tg?.CloudStorage) return;

  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) {
    chunks.push(value.slice(i, i + CHUNK_SIZE));
  }

  return new Promise((resolve) => {
    // 1. Save metadata (number of chunks)
    tg.CloudStorage.setItem(`${key}_meta`, chunks.length.toString(), (err: any) => {
      if (err) {
        console.warn(`CloudStorage set ${key}_meta error:`, err);
        return resolve();
      }

      if (chunks.length === 0) {
        return resolve();
      }

      // 2. Save all chunks
      let completed = 0;
      let hasError = false;

      chunks.forEach((chunk, index) => {
        tg.CloudStorage.setItem(`${key}_${index}`, chunk, (err2: any) => {
          if (err2) hasError = true;
          completed++;
          if (completed === chunks.length) {
            if (hasError) console.warn(`CloudStorage save chunk error for ${key}`);
            resolve();
          }
        });
      });
    });
  });
}

export async function loadFromCloudStorage(key: string): Promise<string | null> {
  const tg = (window as any).Telegram?.WebApp;
  if (!tg?.CloudStorage) return null;

  return new Promise((resolve) => {
    tg.CloudStorage.getItem(`${key}_meta`, (err: any, metaVal: string) => {
      if (!err && metaVal) {
        const numChunks = parseInt(metaVal, 10);
        if (!isNaN(numChunks) && numChunks > 0) {
          const keysToFetch = Array.from({ length: numChunks }, (_, i) => `${key}_${i}`);
          
          if (tg.CloudStorage.getItems) {
            tg.CloudStorage.getItems(keysToFetch, (err2: any, valuesObj: any) => {
              if (!err2 && valuesObj) {
                let fullString = '';
                for (let i = 0; i < numChunks; i++) {
                  const chunk = valuesObj[`${key}_${i}`];
                  if (chunk) fullString += chunk;
                }
                resolve(fullString);
              } else {
                resolve(null);
              }
            });
          } else {
            // Fallback if getItems is not available (though it should be)
            let fullString = '';
            let completed = 0;
            const chunksMap: Record<number, string> = {};
            
            keysToFetch.forEach((k, idx) => {
              tg.CloudStorage.getItem(k, (err3: any, chunkVal: string) => {
                if (!err3 && chunkVal) chunksMap[idx] = chunkVal;
                completed++;
                if (completed === keysToFetch.length) {
                  for (let i = 0; i < numChunks; i++) {
                    if (chunksMap[i]) fullString += chunksMap[i];
                  }
                  resolve(fullString);
                }
              });
            });
          }
        } else {
          resolve(null);
        }
      } else {
        // Fallback: try loading the unchunked version
        tg.CloudStorage.getItem(key, (err3: any, val: string) => {
          if (!err3 && val !== undefined && val !== null && val !== '') {
            resolve(val);
          } else {
            resolve(null);
          }
        });
      }
    });
  });
}
