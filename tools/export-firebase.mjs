import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import admin from 'firebase-admin';

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });

const output = path.resolve(process.env.MIGRATION_OUTPUT || './migration-output');
const collections = [
  'clientes', 'vendedores', 'produtos', 'vendas', 'vendasVendedor',
  'cupons', 'comissoes', 'movimentosVendedores', 'destaquesSolicitados',
  'levantamentos', 'avaliacoes', 'rastreiosPublicos'
];

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error('Defina GOOGLE_APPLICATION_CREDENTIALS apontando para o service-account JSON local.');
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || undefined
});

const db = admin.firestore();
await fs.mkdir(output, { recursive: true });

function serialize(value) {
  if (value instanceof admin.firestore.Timestamp) return { __type: 'timestamp', value: value.toDate().toISOString() };
  if (value instanceof admin.firestore.GeoPoint) return { __type: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  if (value instanceof admin.firestore.DocumentReference) return { __type: 'reference', path: value.path };
  if (value instanceof admin.firestore.Bytes) return { __type: 'bytes', value: value.toBase64() };
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialize(v)]));
  return value;
}

for (const name of collections) {
  const snap = await db.collection(name).get();
  const rows = snap.docs.map(d => ({ id: d.id, data: serialize(d.data()) }));
  await fs.writeFile(path.join(output, `${name}.json`), JSON.stringify(rows, null, 2));
  console.log(`${name}: ${rows.length}`);
}

const users = [];
let pageToken;
do {
  const page = await admin.auth().listUsers(1000, pageToken);
  for (const u of page.users) {
    users.push({
      uid: u.uid,
      email: u.email || null,
      emailVerified: !!u.emailVerified,
      displayName: u.displayName || null,
      phoneNumber: u.phoneNumber || null,
      disabled: !!u.disabled,
      customClaims: u.customClaims || {},
      providerData: u.providerData.map(p => ({ providerId: p.providerId, uid: p.uid, email: p.email || null }))
    });
  }
  pageToken = page.pageToken;
} while (pageToken);
await fs.writeFile(path.join(output, 'auth-users.json'), JSON.stringify(users, null, 2));

const manifest = {
  generatedAt: new Date().toISOString(),
  firebaseProjectId: admin.app().options.projectId || null,
  collections,
  userCount: users.length,
  warning: 'Este export não contém passwords. A migração de Auth deve usar convite/reset de password ou um método de importação de hashes suportado pelo Supabase.'
};
await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\nExport concluído em ${output}`);
