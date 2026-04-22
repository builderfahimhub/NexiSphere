import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, increment } from "firebase/firestore";
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testIncrement() {
  const testRef = doc(db, 'users', 'test-user-id');
  try {
    await setDoc(testRef, { followersCount: increment(1) }, { merge: true });
    console.log("INCREMENT_SUCCESS");
  } catch (error: any) {
    console.log("INCREMENT_ERROR:", error.message);
  }
  process.exit(0);
}

testIncrement();
