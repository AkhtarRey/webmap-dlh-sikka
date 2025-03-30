import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
    apiKey: "AIzaSyBntbllSCJrkI2leP9QJZ1P3UrAbhdCTLE",
    authDomain: "belajarserver-eaa12.firebaseapp.com",
    projectId: "belajarserver-eaa12",
    storageBucket: "belajarserver-eaa12.firebasestorage.app",
    messagingSenderId: "582354120826",
    appId: "1:582354120826:web:fc38ca0eb2693884e38bc3",
    databaseURL: "https://belajarserver-eaa12-default-rtdb.asia-southeast1.firebasedatabase.app/", // URL Realtime Database
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);