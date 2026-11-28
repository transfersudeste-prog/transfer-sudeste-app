// Run tools/update-service-worker.py after changing the application shell or its static resources.
const VERSION = '31-15-r12';
// BEGIN GENERATED ASSETS
const REVISION = '2f6f7de4d7e608e1';
const ASSETS = {
  "apple-touch-icon.png": "ebeb4909f82d186b93e285f1b152c675306314556f4806805652ec132573fd4d",
  "assets/images/conta-veiculo.svg": "0b9ee58834f467e40ac71c0b4ce1e94328d42a92ada9972d65780760f4396a3f",
  "assets/images/equipe/motorista-01.webp": "fb5f1d209a77457a1fe984654f394da162f7cb51bb9f8c51d3d118637a28819e",
  "assets/images/equipe/motorista-02.webp": "f62a98d1d5a92e345b8b3d6ad0df48ef3936b2aa71b356edc2f45c8a35d50f48",
  "assets/images/equipe/motorista-03.webp": "ac3d2c1bd46a445befb2c6312cfc371f3147a73d882af1817598dba0a3206ca1",
  "assets/images/equipe/motorista-04.webp": "e27686e8c1132a5ce4cdf7a7c988f0baf8ff1beb9b348e7f4fccabdfe5954dc5",
  "assets/images/equipe/motorista-05.webp": "a0c31d7d19498bf5fa83a8aba883d508894fd34569f0521588dfe1703cca4c9e",
  "assets/images/equipe/motorista-06.webp": "1b275b72599fd3e1cd04cd2a330e428f8319864a6548dce2f5028c54ee46a1ae",
  "assets/images/equipe/motorista-07.webp": "6e0c968d2064390e6628b55050d9b102e37af8cc71daa7ed4bb456ccfe266b54",
  "assets/images/equipe/motorista-08.webp": "ed5feb87ca84127aee2fede2a5fa69476651d2c768f3fbafb69a8b64a8c3a2b9",
  "assets/images/equipe/motorista-09.webp": "dbdcc61a235f13f20820c7b7aef8b38dbe3e027e2e46d4081ba6919bfe92b37a",
  "assets/images/equipe/motorista-10.webp": "da76ae124ed2421821eda7df9b1f28f7a71f17de62732010d7062d62f1a144fa",
  "assets/images/equipe/motorista-11.webp": "1dc22c8b76715f5a91e19c25831d5525a8239d76fdff41f0db81fa7a179ea19f",
  "assets/images/equipe/motorista-12.webp": "d964c5627aa47ed75415ec51f14c39e03b3fc3bd36c8da9ca2610031b142ac22",
  "assets/images/equipe/motorista-13.webp": "d610fd89ee606af02c15743de206d4cb9ffe31d3ed74fa402bf271042daf5892",
  "assets/images/equipe/motorista-14.webp": "570f65ab2c63a3f4bf57b5cac4860225ab7736c6f98d3213cc23599f7593cfc4",
  "assets/images/equipe/motorista-15.webp": "3217c660c4cca03ffd20685e26ac7dbb7984ea2859a0c92f85aa6f793f1984b4",
  "assets/images/equipe/motorista-16.webp": "02e613cf783d391ee22bf0d53fff2cd11fbc23af6ebf46c8fe4f5ee6ca6e4926",
  "assets/images/equipe/motorista-17.webp": "7e0c18c69c54a76a23207c6aca4b183c8b9a2909fc624b5692661a61e6bb8d33",
  "assets/images/equipe/motorista-18.webp": "28083da953045aed90b29fbc850feb63711dfc35e7acb7965bb66926f75e1a01",
  "assets/images/equipe/motorista-19.webp": "bfa3ea5bd3fbf7b51cd220490e99bf061a10623926facbda4ed97cfce30f77a1",
  "assets/images/equipe/motorista-20.webp": "5f054304251a65a88eb9bd103403e431edf8cb7415ad3dd5fb037a9d607113d3",
  "assets/vendor/libphonenumber.js": "89629e0d251e40a316d40bb28fb56704ae562f4c0eb3a068a944b86043985b13",
  "icon-192.png": "90dff60e5d6654704b571373f1e41300b2084c80880092c24706ed77900943c0",
  "icon-512.png": "eac765375bacc6c411ec737cf0e8b466d9d32013e0c3b9ee7b47863c8ac13f56",
  "index.html": "524951854016970a54f4c226dd99d0db2ded9e2ee5eacf48a9fa32e18f6c4da3",
  "manifest.webmanifest": "bf0e36f2ede6ba0b2bd69b7f5a1915f285e10a9f7e4f2fab64d934ebe46dd0e2",
  "src/core/application-legacy.js": "31c08ec40f86771287c554b820f6d6bbf1496d341a07b9f139ef0e422167ed48",
  "src/core/auth/session.js": "1e262ff28ef6eb363f0b6969195d4230dcc73e2a377afbc01eb5538d05df5135",
  "src/core/controls/confirm-delete.js": "46b251acdcb0b0ab9b72e5bdb869f6cc2c254e129996cffd3e6754d4f1af746d",
  "src/core/features.js": "fe251c7cb7f0877a9737a834914790d7e8d896c76404ebcc72c77c90aaacd205",
  "src/core/permissions/resolve-area.js": "35429dc13c05537ef9853dc721787896d8f6e447bfabd2f58fffd656a066e900",
  "src/core/pwa/install-prompt.js": "541bed623483a59464839283c7751fd5e19f9664c7559826aecf8849694d8072",
  "src/core/pwa/version-label.js": "88f8899ce9a95fe02295c6bb9864082b47098c4dc6385edb3dd868f174b13b39",
  "src/core/realtime/connection.js": "ad71a89a90850ebe39d41fa3ea53ae7487981b79fd2d6d6a22588332e387e2c9",
  "src/core/services/phone-library.js": "cd806dfd4c6f97cb80adf95665fed02ec356298f0cef452e59c15c4d98d321c7",
  "src/core/supabase/http.js": "2bbede7d0cae0935cde9276aeb0320de8877cfa16b1218e5fdd96ebd111be7ed",
  "src/features/dispatch-offers/index.js": "351562ccb75cba39aa403d634e82a07af5947a7f2816bc10d67db4b589f003e4",
  "src/features/dispatch-offers/styles.css": "4d9541cd746bb8af099075edf9aeed05614c84bac0fad85ef8023b9cef86a869",
  "src/main.js": "5379d9c2536e469ee04c1a80a61b7c1f57956007d8b4a8814c448ee490b0b608",
  "src/modules/admin/dispatch-form.js": "8be06ec5def06362c89d340905302f6ba4f704baecc7f5b59200a7a72ec246e1",
  "src/modules/admin/index.js": "4c3d6994ad6c3f4d2b71f7dcfff7fd1c848f1a423370fbe6e8a257d3c44fc592",
  "src/modules/admin/management-tabs.js": "fc1190553aaf68edd16568be6d0b058571536d186ba5ccedce7e9f3884673319",
  "src/modules/admin/owner-dispatch-assignment.js": "8b9f29dd4afb695274585c7ffc2596aacc501548cac53ed16eeb7925af832080",
  "src/modules/admin/owner-dispatch-boarding.js": "d087e318595ff905216821941f4d359e60e3635dfef6e43342c61a3e9f337286",
  "src/modules/admin/owner-dispatch-confirmation.js": "d5e18d1a32dc5f2a1dceec9cd521fb1c391061316c26290f09184980346110d0",
  "src/modules/admin/owner-dispatch-draft.js": "239d9bff9adb4cf05eb017925129edd8d10fb731e8ef6fcf7820f8bb2b174129",
  "src/modules/admin/owner-dispatch-party.js": "ca4d1a09fe60c2a4c9cddbd3d8adf274ba9ad09700f4058607d9d0b256e68b6a",
  "src/modules/admin/owner-dispatch-payload.js": "9edb2508929a4f966584ec9f03c8e41e8dea231addd69a71556b7b326ab573e9",
  "src/modules/admin/owner-dispatch-payment.js": "4fe621d60ae222598b71070b6a86b5e520b0dd60191343cae01b7c29ed91af86",
  "src/modules/admin/owner-dispatch-review.js": "85fa89ca9d7f75ac58c454937177c9c56c02edb9509a758327dc5236c4aed5d1",
  "src/modules/admin/owner-dispatch-route.js": "60ebf4111868652e06d14fbca93aa70351868998aa8234c4b346e779b0581807",
  "src/modules/admin/owner-dispatch-values.js": "608e487fac7425645a3f4c09421e43440cb0e7c11f79ee847e94f5768cb8d0f1",
  "src/modules/admin/owner-dispatch-view.js": "1437c095235875ca9cad73af4c53ff6bb5e5cf747db616d1b1399bcee2185765",
  "src/modules/admin/owner-navigation.js": "74b28406feb3e6eb7d798aec935047b1890c90f337d65c1d2e934ad0ce958135",
  "src/modules/admin/owner-operations.js": "82c56cc5370e89c78e6e77cd6d60e2993d28bc4127798d3db3ed588b8cade34f",
  "src/modules/admin/owner-period.js": "5624ff319d01e8a7cee37df5e632b2e2d30e9d31d352626082f976b76ca510c0",
  "src/modules/admin/owner-viewport.js": "bd25044345673f7494b40b004f070edd1510501967faa68a382f779c61f6c77c",
  "src/modules/client/index.js": "7881d9f2e3bf30f18125dc6571d10c283181fce4fdd4efffe9caee2644a37e92",
  "src/modules/driver/dashboard.js": "d58ef052ffae23e119e14e8e84df35d2c805318f206061ebe3e3c6bdc47b0429",
  "src/modules/driver/index.js": "1812a70884e398c742c68b2753f04684162b5eec2f264dc87178f91115603015",
  "src/shared/components/account-profile.js": "364b93452ac545d49c29ea10906c5a14a2e36eb1f14f6f46620f819b729d7a8e",
  "src/shared/components/dialog-dismiss.js": "f15869eaf7ebf658373ce329214f03662273f1626b7be65d67d87273a1f9dd39",
  "src/shared/components/interface-icons.js": "436e21ba03f47fe2ed1499cffda66db04e949f648d916afa50f8db15f83d67d2",
  "src/shared/components/photo-overlay.js": "2cbc088beffe0b6861efe0d1c2237d57abd5492784452bb42ab45fc03bc80501",
  "src/styles/account-layout.css": "3c314476031a3ef7d983c421515e4b049c8b2b0083c7662accbd0b4ae7d078cf",
  "src/styles/adm-geral-layout.css": "c71280e8927d258efefa2292e2021ca9f9455630f30af153fc65a9fc885d5ea5",
  "src/styles/adm-geral-operations.css": "4936597e45f753a80e5f416c9f6bf376871408b32a7212d92923841a892b4903",
  "src/styles/application.css": "c942d81209b71eaa63d503289ac8a66a4a4784ee706dabc166211dc5b767ed8f",
  "src/styles/client-layout.css": "4d8018f4dbbfbc9d5dd1eba473fa3cb71b5cdfff4554e9af2369f85b0b5d0785",
  "src/styles/driver-layout.css": "229e9d6a14fb3b63bcc6f1758f922d4926a68eabc5165ccbba34fc08df5326fd"
};
// END GENERATED ASSETS

const PREFIX = 'ts-pwa-';
const CACHE = PREFIX + 'v' + VERSION + '-' + REVISION;
const scope = new URL(self.registration.scope);

function assetUrl(path) {
  return new URL(path, scope);
}

async function validatedResponse(path, expected) {
  const url = assetUrl(path);
  // Give the CDN a new lookup key for each revision.
  url.searchParams.set('release', REVISION);
  const response = await fetch(url, {cache: 'reload'});
  if (!response.ok) throw new Error('Falha ao carregar ' + path);
  const buffer = await response.clone().arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  const actual = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  if (actual !== expected) throw new Error('Versão do arquivo incompatível: ' + path);
  return response;
}

async function prepareCache() {
  const cache = await caches.open(CACHE);
  const shell = Object.entries(ASSETS).filter(([path]) => !path.startsWith('assets/images/equipe/') && path !== 'assets/vendor/libphonenumber.js');
  const responses = await Promise.all(
    shell.map(async ([path, expected]) => [path, await validatedResponse(path, expected)])
  );
  await Promise.all(responses.map(([path, response]) => cache.put(assetUrl(path), response)));
}

self.addEventListener('install', event => {
  event.waitUntil(prepareCache());
});

// Activation waits for the previous version's tabs to close.
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const relative = url.pathname.slice(scope.pathname.length);
  const path = !relative && event.request.mode === 'navigate' ? 'index.html' : relative;
  if (!Object.hasOwn(ASSETS, path)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(assetUrl(path));
    if (cached) return cached;
    const response = await validatedResponse(path, ASSETS[path]);
    await cache.put(assetUrl(path), response.clone());
    return response;
  })());
});
