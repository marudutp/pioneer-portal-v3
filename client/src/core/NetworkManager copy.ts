import { io, Socket } from "socket.io-client";

export class NetworkManager {
    public socket: Socket;

    constructor(private callbacks: any) {
        const isLocal =
            window.location.hostname === "localhost" ||
            window.location.hostname.startsWith("192.168.") ||
            window.location.hostname.startsWith("10.165.") ||
            window.location.hostname.startsWith("10.") ||
            window.location.hostname === "127.0.0.1";

        // 1. DINAMIS URL: Otomatis deteksi lingkungan
        // const serverUrl = window.location.hostname === "localhost"  
        const serverUrl = isLocal
            ? `http://${window.location.hostname}:3000` // Gunakan IP laptop yang sedang buka
            : "https://pioneer-portal.yourname.replit.app"; // Ganti dengan URL Replit Anda

        console.log(`Menghubungkan ke server: ${serverUrl}`);

        this.socket = io(serverUrl, {
            transports: ["websocket", "polling"],
            withCredentials: true
        });

        this.setupListeners();
    }

    private setupListeners() {
        // Listener standar Anda
        this.socket.on("assignRole", (data) => this.callbacks.onRoleAssigned(data.role));
        this.socket.on("currentPlayers", (players) => this.callbacks.onSync(players));
        this.socket.on("newPlayer", (data) => this.callbacks.onPlayerJoin(data)); // Tambahkan ini!
        this.socket.on("userMoved", (data) => this.callbacks.onMove(data));
        this.socket.on("userLeft", (id) => this.callbacks.onLeave(id));

        this.socket.on("connect", () => {
            console.log("Terhubung ke server dengan ID:", this.socket.id);
        });
    }

    // Fungsi untuk memicu proses masuk setelah pilih avatar
    public joinGame(avatarModel: string) {
        this.socket.emit("join", { avatarModel });
    }

    public sendUpdate(pos: { x: number, y: number, z: number }, rot: number, isMoving: boolean) {
        this.socket.emit("move", {
            x: pos.x,
            y: pos.y,
            z: pos.z,
            rotation: rot,
            isMoving
        });
    }
}