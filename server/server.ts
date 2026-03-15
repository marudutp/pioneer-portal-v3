import express from 'express';
import { Server } from 'socket.io';
import http from 'http'; import https from 'https';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import path from 'path';
import { ROLES, NETWORK_EVENTS } from "../shared/constants.ts";
import os from 'os';
import cors from 'cors';

// DETEKSI LEBIH AKURAT
// const hostname = os.hostname();
// const isReplit = process.env.REPLIT_ID || process.env.PORT || hostname.includes('replit') || process.cwd().includes('runner');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
// --- Tambahkan di bagian atas bersama import lainnya ---
const ADMIN_UID = "PjSNNdrP0DP0PddcE7wElgSkppE3"; // Ganti dengan UID Firebase Om


// 1. PASANG CORS DI EXPRESS (WAJIB biar gak 502/403)
app.use(cors({
    // origin: ["https://pioneer-portal-v3.vercel.app", "http://localhost:5000"],
    origin: "*",
    credentials: true
}));

// 2. DETEKSI REPLIT
const hostname = os.hostname();
const isReplit = process.env.REPLIT_ID || process.env.PORT || hostname.includes('replit') || process.cwd().includes('runner');

let server;

if (isReplit) {
    server = http.createServer(app);
    console.log("🚀 [SADAR MODE] REPLIT DETECTED! Running on HTTP");
} else {
    try {
        const options = {
            key: fs.readFileSync(path.join(__dirname, 'cert', 'localhost+2-key.pem')),
            cert: fs.readFileSync(path.join(__dirname, 'cert', 'localhost+2.pem')),
        };
        server = https.createServer(options, app);
        console.log("🛠️ LOCAL MODE: Running on HTTPS");
    } catch (e) {
        server = http.createServer(app);
        console.log("⚠️ Cert gak ada, fallback ke HTTP");
    }
}

// 3. RUTE PENGETESAN (Taruh di atas io)
app.get('/', (req, res) => {
    console.log("🔔 Seseorang mengetok pintu server (Route / diakses)");
    res.send("🚀 PIONEER PORTAL V3 SERVER IS LIVE!");
});

// --- Tambahkan endpoint untuk halaman Admin UI ---
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// --- Endpoint API untuk ambil data user real-time ---
app.get('/api/admin/users', (req, res) => {
    // Sederhanakan data Map agar bisa dikirim sebagai JSON
    const users = Array.from(activeUsers.values());
    res.json(users);
});


// 4. SOCKET.IO CONFIG
const io = new Server(server, {
    cors: {
        origin: ["https://pioneer-portal-v3.vercel.app", "http://localhost:5000"],
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['polling', 'websocket']
});

const activeUsers = new Map();
let currentTeacherId: string | null = null;
// 1. Tentukan batas maksimal di bagian atas (di luar io.on)
const MAX_STUDENTS = 10; // Batas aman untuk Replit Free
const broadcastCapacity = () => {
    const studentCount = Array.from(activeUsers.values()).filter(u => u.role !== ROLES.TEACHER).length;
    io.emit('capacityUpdate', {
        current: studentCount,
        max: MAX_STUDENTS
    });
    console.log(`📊 Kapasitas Update: ${studentCount}/${MAX_STUDENTS}`);
};
io.on('connection', (socket: any) => {
    console.log(`🔌 Handshake: ${socket.id}`);
    // Aksi Admin: Kick User
    socket.on('admin_kick_user', (targetUid: string) => {
        const target = activeUsers.get(targetUid);
        if (target) {
            io.to(target.socketId).emit('error_message', {
                title: "Dikeluarkan",
                message: "Anda telah dikeluarkan dari kelas oleh Admin."
            });
            // Beri jeda sebentar agar pesan sampai, lalu putuskan
            setTimeout(() => {
                const targetSocket = io.sockets.sockets.get(target.socketId);
                if (targetSocket) targetSocket.disconnect();
            }, 1000);
        }
    });

    // Aksi Admin: Broadcast
    socket.on('admin_broadcast', (message: string) => {
        io.emit('announcement', message);
    });
    socket.on(NETWORK_EVENTS.AUTH_JOIN, (data: any) => {
        const { uid, displayName, avatarModel, role } = data;
        // --- BARIS WAJIB ---
        socket.uid = uid; // <--- Titipkan UID ke objek socket supaya pas disconnect bisa dibaca
        // -------------------
        // --- FITUR AUTO-KICK (ROOM LIMIT) ---
        // Hitung jumlah siswa yang ada sekarang (tidak menghitung Guru)
        const currentStudents = Array.from(activeUsers.values()).filter(u => u.role !== ROLES.TEACHER).length;

        // Jika sudah penuh dan yang mau masuk adalah SISWA, tendang!
        if (currentStudents >= MAX_STUDENTS && role !== ROLES.TEACHER) {
            console.log(`🚫 KELAS PENUH: Menolak siswa ${displayName}`);

            // Kirim pesan khusus ke si murid agar dia tahu kenapa ditendang
            socket.emit('error_message', {
                title: "Kelas Penuh, Om!",
                message: `Maaf, kapasitas maksimal ${MAX_STUDENTS} siswa sudah tercapai. Coba lagi nanti ya!`
            });

            // Putuskan koneksi setelah jeda sedikit agar pesan sempat terkirim
            setTimeout(() => socket.disconnect(), 1000);
            return;
        }
        // --- END OF AUTO-KICK ---
        const userData = {
            uid: uid,
            socketId: socket.id,
            displayName: displayName,
            role: role,
            model: avatarModel,
            x: 0, y: -0.9, z: 0,
            rotation: Math.PI
        };

        activeUsers.set(uid, userData);
        socket.uid = uid;
        // PANGGIL DI SINI:
        broadcastCapacity();

        console.log(`✅ ${data.displayName} bergabung.`);

        if (role === ROLES.TEACHER) {
            currentTeacherId = uid;
            console.log(`👨‍🏫 GURU SAH TERDETEKSI: ${displayName} (${uid})`);
        } else {
            console.log(`👶 SISWA MASUK: ${displayName}`);
        }

        socket.emit('currentPlayers', Object.fromEntries(activeUsers));
        socket.broadcast.emit(NETWORK_EVENTS.USER_JOINED, userData);
    });

    socket.on(NETWORK_EVENTS.AVATAR_UPDATE, (data: any) => {
        const player = activeUsers.get(socket.uid);
        if (player) {
            Object.assign(player, data);
            socket.broadcast.emit(NETWORK_EVENTS.AVATAR_UPDATE, {
                uid: socket.uid,
                ...data
            });
        }
    });

    socket.on('drawData', (data: any) => {
        console.log("📡 Server: Menerima coretan, menyebarkan ke seluruh kelas...");
        socket.broadcast.emit('remoteDraw', data);
    });

    socket.on('clearBoard', () => {
        socket.broadcast.emit('clearBoard');
    });

    socket.on(NETWORK_EVENTS.WHITEBOARD_SYNC_REQ, () => {
        if (currentTeacherId) {
            const teacher = activeUsers.get(currentTeacherId);
            if (teacher) {
                io.to(teacher.socketId).emit(NETWORK_EVENTS.WHITEBOARD_SYNC_REQ, { requester: socket.id });
            }
        }
    });

    socket.on(NETWORK_EVENTS.WHITEBOARD_SYNC_RES, (data: any) => {
        io.to(data.to).emit(NETWORK_EVENTS.WHITEBOARD_SYNC_RES, { img: data.img });
    });

    socket.on(NETWORK_EVENTS.OFFER, (data: any) => {
        const target = activeUsers.get(data.toUid);
        if (target) io.to(target.socketId).emit(NETWORK_EVENTS.OFFER, { offer: data.offer, from: socket.uid });
    });

    socket.on(NETWORK_EVENTS.ANSWER, (data: any) => {
        const target = activeUsers.get(data.toUid);
        if (target) io.to(target.socketId).emit(NETWORK_EVENTS.ANSWER, { answer: data.answer, from: socket.uid });
    });

    socket.on(NETWORK_EVENTS.ICE_CANDIDATE, (data: any) => {
        const target = activeUsers.get(data.toUid);
        if (target) io.to(target.socketId).emit(NETWORK_EVENTS.ICE_CANDIDATE, { candidate: data.candidate, from: socket.uid });
    });

    socket.on('disconnect', () => {
        let disconnectedUser = "";
        if (socket.uid) {
            const user = activeUsers.get(socket.uid);
            if (user && user.socketId === socket.id) {
                disconnectedUser = user.displayName;
                console.log(`❌ User Cabut: ${user.displayName}`);

                if (socket.uid === currentTeacherId) {
                    currentTeacherId = null;
                    console.log("⚠️ PERHATIAN: Guru meninggalkan kelas!");
                }

                activeUsers.delete(socket.uid);
                if (disconnectedUser) {
                    // PANGGIL DI SINI:
                    broadcastCapacity();
                    console.log(`❌ ${disconnectedUser} keluar kelas.`);
                }
                io.emit(NETWORK_EVENTS.USER_LEFT, socket.uid);
            }
        }
    });
});

// const PORT = process.env.PORT || 3000;
// // server.listen(PORT, 'localhost', () => {
// const protocol = isProduction ? 'http' : 'https'; // Lokal pakai https
// server.listen(PORT, () => {
//     console.log("--------------------------------------------------");
//     console.log("🚀 PIONEER PORTAL V3: SERVER ONLINE");
//     console.log(`🔗 Address: ${protocol}://localhost:${PORT}`);
//     console.log(`🌍 MODE: ${isProduction ? 'PRODUCTION (REPLIT)' : 'DEVELOPMENT (LOCAL)'}`);

//     console.log("--------------------------------------------------");
// });

// const PORT = process.env.PORT || 3000;
const PORT = 8080;
server.listen(PORT, '0.0.0.0', () => {
    console.log("--------------------------------------------------");
    console.log(`📡 SERVER JALAN DI PORT: ${PORT}`);
    console.log(`🔗 MODE: ${isReplit ? 'CLOUD/REPLIT' : 'LOCAL'}`);
    console.log("--------------------------------------------------");
});