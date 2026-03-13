// import { io, Socket } from "socket.io-client";

// export class NetworkManager {
//     public socket: Socket;

//     constructor(private callbacks: any) {
//         // Deteksi IP Lokal agar bisa diakses dari laptop lain/HP
//         const isLocal =
//             window.location.hostname === "localhost" ||
//             window.location.hostname.startsWith("192.168.") ||
//             window.location.hostname.startsWith("10.165.") ||
//             window.location.hostname.startsWith("10.") ||
//             window.location.hostname === "127.0.0.1";

//         // WAJIB HTTPS karena kita sudah pakai sertifikat mkcert
//         const serverUrl = isLocal
//             ? `https://${window.location.hostname}:3000` 
//             : "https://pioneer-portal.yourname.replit.app"; 

//         console.log(`🚀 Menghubungkan ke Secure Server: ${serverUrl}`);

//         this.socket = io(serverUrl, {
//             transports: ["websocket"],
//             secure: true,
//             rejectUnauthorized: false, // IZINKAN self-signed certificate (mkcert)
//             withCredentials: true
//         });

//         this.setupListeners();
//     }

//     private setupListeners() {
//         // --- 1. Logika Role & Sync ---
//         this.socket.on("assignRole", (data) => {
//             if (this.callbacks.onRoleAssigned) {
//                 this.callbacks.onRoleAssigned(data.role);
//             }
//         });

//         this.socket.on("currentPlayers", (players) => {
//             if (this.callbacks.onSync) {
//                 this.callbacks.onSync(players);
//             }
//         });

//         // --- 2. Logika Pemain Lain (Nama fungsi disamakan dengan main.ts) ---
//         this.socket.on("newPlayer", (data) => {
//             console.log("👤 Pemain baru terdeteksi:", data.id);
//             if (this.callbacks.onPlayerJoin) {
//                 this.callbacks.onPlayerJoin(data);
//             }
//         });

//         this.socket.on("userMoved", (data) => {
//             if (this.callbacks.onMove) {
//                 this.callbacks.onMove(data);
//             }
//         });

//         this.socket.on("userLeft", (id) => {
//             console.log("🏃 Pemain keluar:", id);
//             if (this.callbacks.onLeave) {
//                 this.callbacks.onLeave(id);
//             }
//         });

//         // --- 3. Status Koneksi ---
//         this.socket.on("connect", () => {
//             console.log("✅ Socket Connected! ID:", this.socket.id);
//         });

//         this.socket.on("connect_error", (err) => {
//             console.error("❌ Socket Connection Error:", err.message);
//         });
//     }

//     public joinGame(avatarModel: string) {
//         this.socket.emit("join", { avatarModel });
//     }

//     public sendUpdate(pos: { x: number, y: number, z: number }, rot: number, isMoving: boolean) {
//         this.socket.emit("move", {
//             x: pos.x,
//             y: pos.y,
//             z: pos.z,
//             rotation: rot,
//             isMoving
//         });
//     }
// }

// import { io, Socket } from "socket.io-client";

// export class NetworkManager {
//     public socket: Socket;

//     constructor(private callbacks: any) {
//         // const isLocal = window.location.hostname === "localhost" || window.location.hostname.startsWith("192.168.");

//         // const serverUrl = isLocal ? `https://${window.location.hostname}:3000` : "https://replit-url-anda.app";

//         const IP_GURU = "192.168.0.109"; // <--- GANTI DENGAN HASIL IPCONFIG TADI!

//         const serverUrl = `https://${IP_GURU}:3000`;

//         this.socket = io(serverUrl, {
//             transports: ["websocket"],
//             secure: true,
//             rejectUnauthorized: false, // Penting untuk mkcert
//             withCredentials: true
//         });

//         this.setupListeners();
//     }

//     private setupListeners() {
//         this.socket.on("assignRole", (data) => this.callbacks.onRoleAssigned(data.role));
//         this.socket.on("currentPlayers", (players) => this.callbacks.onSync(players));
//         this.socket.on("newPlayer", (data) => this.callbacks.onPlayerJoin(data));
//         this.socket.on("userMoved", (data) => this.callbacks.onMove(data));
//         this.socket.on("userLeft", (id) => this.callbacks.onLeave(id));
//         this.socket.on("connect", () => console.log("✅ Socket Connected!"));
//     }

//     public joinGame(avatarModel: string) {
//         this.socket.emit("join", { avatarModel });
//     }

//     public sendUpdate(pos: { x: number, y: number, z: number }, rot: number, isMoving: boolean) {
//         this.socket.emit("move", { x: pos.x, y: pos.y, z: pos.z, rotation: rot, isMoving });
//     }
// }

import { io, Socket } from "socket.io-client";

export class NetworkManager {
    public socket: Socket;

    constructor(private callbacks: any) {
        // Otomatis ambil IP dari URL browser
        const serverUrl = `https://${window.location.hostname}:3000`;
        
        this.socket = io(serverUrl, {
            transports: ["websocket"],
            secure: true,
            rejectUnauthorized: false
        });

        this.setupListeners();
    }

    private setupListeners() {
        this.socket.on("assignRole", (data) => this.callbacks.onRoleAssigned(data.role));
        this.socket.on("currentPlayers", (players) => this.callbacks.onSync(players));
        this.socket.on("newPlayer", (data) => this.callbacks.onPlayerJoin(data));
        this.socket.on("userMoved", (data) => this.callbacks.onMove(data));
        this.socket.on("userLeft", (id) => this.callbacks.onLeave(id));
    }

    public joinGame(avatarModel: string) { this.socket.emit("join", { avatarModel }); }
    public sendUpdate(pos: any, rot: number, isMoving: boolean) {
        this.socket.emit("move", { ...pos, rotation: rot, isMoving });
    }
}