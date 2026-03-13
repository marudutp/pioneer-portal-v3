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

io.on('connection', (socket: any) => {
    console.log(`🔌 Handshake: ${socket.id}`);

    socket.on(NETWORK_EVENTS.AUTH_JOIN, (data: any) => {
        const { uid, displayName, avatarModel, role } = data;

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