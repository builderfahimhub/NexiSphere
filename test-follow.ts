import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, increment } from 'firebase/firestore';
import * as fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(config);
const db = getFirestore(app);

async function run() {
  const followerRef = doc(db, 'users', 'test-follower');
  
  try {
    await setDoc(followerRef, { followingCount: increment(1) }, { merge: true });
    console.log("Success incrementing followingCount");
  } catch (e) {
    console.error("Error:", e);
  }
}
run();
