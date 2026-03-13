import express from 'express';
import { Server } from 'socket.io';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// 1. IMPORT KONSTANTA
import { ROLES, NETWORK_EVENTS } from "../shared/constants.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();

// --- SETUP HTTPS (Menggunakan Sertifikat Kamu) ---
const options = {
    key: fs.readFileSync(path.join(__dirname, 'cert', 'localhost+2-key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'cert', 'localhost+2.pem')),
};

const server = https.createServer(options, app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    }
});

// 2. DATABASE SESI (Key = UID Google)
const activeUsers = new Map(); // Map<uid, any>
let currentTeacherId: string | null = null;

io.on('connection', (socket: any) => {
    console.log(`🔌 Handshake: ${socket.id}`);

    // --- [A] AUTH & JOIN (LOGIKA BARU: SERVER PERCAYA CLIENT) ---
    socket.on(NETWORK_EVENTS.AUTH_JOIN, (data: any) => {
        const { uid, displayName, avatarModel, role } = data;

        // 1. Simpan/Update User (Gunakan UID sebagai kunci utama)
        const userData = {
            uid: uid,
            socketId: socket.id,
            displayName: displayName,
            role: role, // Role ini datang dari pengecekan Email di main.ts
            model: avatarModel,
            x: 0, y: -0.9, z: 0,
            rotation: Math.PI
        };

        activeUsers.set(uid, userData);
        socket.uid = uid; // Tempel UID ke socket agar gampang pas DC

        // 2. Jika dia Guru (berdasarkan email), catat di Server
        if (role === ROLES.TEACHER) {
            currentTeacherId = uid;
            console.log(`👨‍🏫 GURU SAH TERDETEKSI: ${displayName} (${uid})`);
        } else {
            console.log(`👶 SISWA MASUK: ${displayName}`);
        }

        // 3. Kirim data balik ke pengirim
        socket.emit('currentPlayers', Object.fromEntries(activeUsers));

        // 4. Kabari orang lain
        socket.broadcast.emit(NETWORK_EVENTS.USER_JOINED, userData);
    });

    // --- [B] GERAKAN (AVATAR_UPDATE) ---
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

    // --- [C] PAPAN TULIS (WHITEBOARD) ---
    // Broadcast garis mulus (x1, y1 -> x2, y2)
    // server.ts - Bagian Whiteboard
    socket.on('drawData', (data: any) => {
        // Pantulkan ke semua orang kecuali si Guru
        console.log("📡 Server: Menerima coretan, menyebarkan ke seluruh kelas...");
        socket.broadcast.emit('remoteDraw', data);
    });

    socket.on('clearBoard', () => {
        // Pantulkan perintah hapus ke semua orang
        socket.broadcast.emit('clearBoard');
    });

    // Sinkronisasi untuk siswa baru (minta gambar ke Guru)
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

    // --- [D] WEBRTC SIGNALING (TARGETED) ---
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

    // --- [E] DISCONNECT (ANTI-GHOSTING) ---
    socket.on('disconnect', () => {
        if (socket.uid) {
            const user = activeUsers.get(socket.uid);
            if (user && user.socketId === socket.id) {
                console.log(`❌ User Cabut: ${user.displayName}`);

                if (socket.uid === currentTeacherId) {
                    currentTeacherId = null;
                    console.log("⚠️ PERHATIAN: Guru meninggalkan kelas!");
                }

                activeUsers.delete(socket.uid);
                io.emit(NETWORK_EVENTS.USER_LEFT, socket.uid);
            }
        }
    });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log("--------------------------------------------------");
    console.log("🚀 PIONEER PORTAL V3: SECURE SERVER STABLE ONLINE");
    console.log(`🔗 Address: https://192.168.0.109:${PORT}`);
    console.log("--------------------------------------------------");
});