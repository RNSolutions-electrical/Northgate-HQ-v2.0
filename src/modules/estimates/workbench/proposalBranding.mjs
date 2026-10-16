// Local, versioned letterhead assets. No third-party request is made during export.
const assets = {
 logo: new URL('../../../assets/proposal/northgate-header.png', import.meta.url),
 regular: new URL('../../../assets/proposal/Carlito-Regular.ttf', import.meta.url),
 bold: new URL('../../../assets/proposal/Carlito-Bold.ttf', import.meta.url),
 footer: new URL('../../../assets/proposal/LiberationSans-Regular.ttf', import.meta.url),
};

async function readAsset(url) {
 // The same exporter runs in browser and in the repository's Node regression tests.
 if (url.protocol === 'file:') {
  const {readFile} = await import('node:fs/promises');
  return new Uint8Array(await readFile(url));
 }
 const response = await fetch(url);
 if (!response.ok) throw new Error('The proposal letterhead could not load. Please retry the preview.');
 return new Uint8Array(await response.arrayBuffer());
}

let cached;
export function proposalBranding() {
 if (!cached) cached = Promise.all(Object.values(assets).map(readAsset))
  .then(([logo, regular, bold, footer]) => ({logo, regular, bold, footer}))
  .catch(error => {cached = undefined; throw error;});
 return cached;
}
