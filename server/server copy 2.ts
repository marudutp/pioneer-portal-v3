import express from 'express';
import { Server } from 'socket.io';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// 1. IMPORT KONSTANTA (Biar nggak typo, Ferguso!)
// Di server.ts
import { ROLES, NETWORK_EVENTS } from "../shared/constants.ts";
// Pakai .js di sini sudah benar untuk Node.js ESM + TSX

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();

const options = {
    key: fs.readFileSync(path.join(__dirname, 'cert', 'localhost+2-key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'cert', 'localhost+2.pem')),
};

const server = https.createServer(options, app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"], credentials: true }
});

// 2. DATABASE SESI (Key sekarang pakai UID Google, bukan SocketID!)
const activeUsers = new Map(); // Map<uid, PlayerData>
// 2. TAMBAHKAN INI: Variabel penanda siapa Gurunya (global variable)
let currentTeacherId: string | null = null;

io.on('connection', (socket: any) => {
    console.log(`🔌 Handshake baru: ${socket.id}`);

    // --- LOGIKA AUTH JOIN (V3 GUARD) ---
    // ... (bagian import tetap sama)

    socket.on(NETWORK_EVENTS.AUTH_JOIN, (data: any) => {
        const { uid, displayName, avatarModel } = data;

        // 1. Cek duplikasi
        if (activeUsers.has(uid)) {
            socket.emit(NETWORK_EVENTS.AUTH_ERROR, "Anda sudah login di tab lain!");
            socket.disconnect();
            return;
        }

        // 2. PENENTUAN ROLE & UPDATE TEACHER ID
        const isTeacherPresent = Array.from(activeUsers.values()).some((p: any) => p.role === ROLES.TEACHER);
        const role = isTeacherPresent ? ROLES.STUDENT : ROLES.TEACHER;

        // --- TAMBAHKAN INI: Jika dia guru pertama, catat UID-nya! ---
        if (role === ROLES.TEACHER) {
            currentTeacherId = uid;
        }

        // Di server.ts
        const newPlayer = {
            uid: uid,
            socketId: socket.id,
            displayName: displayName, // <-- Ubah 'name' jadi 'displayName'
            x: 0, y: -0.9, z: 0,
            rotation: Math.PI,
            model: avatarModel,
            role: role
        };

        activeUsers.set(uid, newPlayer);
        socket.uid = uid;

        console.log(`✅ ${displayName} bergabung sebagai ${role}`);

        // ... (sisa kodenya)
        // server.ts (Node.js/Socket.io)

        socket.on('drawData', (data) => {
            // Memantulkan ke semua orang kecuali si Guru (pengirim)
            socket.broadcast.emit('remoteDraw', data);
            // console.log("Menyiarkan coretan Guru ke seluruh kelas...");
        });


        console.log(`✅ ${displayName} bergabung sebagai ${role}`);
        // 1. Siswa minta data ke Guru
        socket.on(NETWORK_EVENTS.WHITEBOARD_SYNC_REQ, () => {
            if (currentTeacherId) {
                // Cari socket ID si Guru
                const teacher = Array.from(activeUsers.values()).find(u => u.uid === currentTeacherId);
                if (teacher) {
                    io.to(teacher.socketId).emit(NETWORK_EVENTS.WHITEBOARD_SYNC_REQ, { requester: socket.id });
                }
            }
        });

        // 2. Guru kirim data ke Siswa spesifik
        socket.on(NETWORK_EVENTS.WHITEBOARD_SYNC_RES, (data) => {
            // data.img adalah Base64, data.to adalah socketId peminta
            io.to(data.to).emit(NETWORK_EVENTS.WHITEBOARD_SYNC_RES, { img: data.img });
        });

        // Kirim data balik ke user
        socket.emit('assignRole', { role });
        socket.emit('currentPlayers', Object.fromEntries(activeUsers));

        // Broadcast ke semua orang: "Ada kawan baru!"
        socket.broadcast.emit(NETWORK_EVENTS.USER_JOINED, newPlayer);
    });

    // --- LOGIKA MOVE (Optimasi: Pakai UID) ---
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

    // --- PIPA SUARA WEBRTC (TARGETED - BUKAN BROADCAST!) ---
    // Di V3, kita kirim offer hanya ke orang yang dituju biar nggak berisik
    socket.on(NETWORK_EVENTS.OFFER, (data: { offer: any, toUid: string }) => {
        const target = activeUsers.get(data.toUid);
        if (target) {
            io.to(target.socketId).emit(NETWORK_EVENTS.OFFER, {
                offer: data.offer,
                from: socket.uid
            });
        }
    });

    socket.on(NETWORK_EVENTS.ANSWER, (data: { answer: any, toUid: string }) => {
        const target = activeUsers.get(data.toUid);
        if (target) {
            io.to(target.socketId).emit(NETWORK_EVENTS.ANSWER, {
                answer: data.answer,
                from: socket.uid
            });
        }
    });

    socket.on(NETWORK_EVENTS.ICE_CANDIDATE, (data: { candidate: any, toUid: string }) => {
        const target = activeUsers.get(data.toUid);
        if (target) {
            io.to(target.socketId).emit(NETWORK_EVENTS.ICE_CANDIDATE, {
                candidate: data.candidate,
                from: socket.uid
            });
        }
    });

    // --- DISCONNECT ---
    socket.on('disconnect', () => {
        if (socket.uid) {
            activeUsers.delete(socket.uid);
            io.emit(NETWORK_EVENTS.USER_LEFT, socket.uid);
            console.log(`❌ User cabut: ${socket.uid}`);
        }
    });
});

server.listen(3000, '0.0.0.0', () => {
    console.log("🚀 PIONEER PORTAL V3: Secure Server Online @ Port 3000");
});