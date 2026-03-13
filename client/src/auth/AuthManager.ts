import { initializeApp } from "firebase/app";
import { getAuth, signOut, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
// Pastikan ada 'signOut' di sini!
// import { getAuth,  } from "firebase/auth";

const firebaseConfig = { /* Paste Config Kamu Di Sini */
    apiKey: "AIzaSyBi1F2B7GAWxx4io9m3zBXGYTtEIb-YOg4",
    authDomain: "pioneer-portal-v3.firebaseapp.com",
    projectId: "pioneer-portal-v3",
    storageBucket: "pioneer-portal-v3.firebasestorage.app",
    messagingSenderId: "336456019160",
    appId: "1:336456019160:web:5d276e96f8d9df1f7cbbad"
};
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export async function loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        return result.user; // Kita dapat UID dan Nama di sini
    } catch (error) {
        console.error("Login Gagal, Ferguso!", error);
        return null;
    }
}



// ... (kode initApp dan auth yang sudah ada)

/**
 * Fungsi Logout Ferguso: Bersih-bersih sesi!
 */
export async function logoutFromGoogle(): Promise<boolean> {
    try {
        await signOut(auth);
        console.log("Sesi Firebase dibersihkan.");
        return true;
    } catch (error) {
        console.error("Gagal logout, Ferguso!", error);
        return false;
    }
}