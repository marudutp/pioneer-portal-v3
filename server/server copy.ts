import express from 'express';
import { Server } from 'socket.io';
import http from 'http';

const app = express();
const server = http.createServer(app);

// 1. DINAMIS CORS: Jika di Replit, origin bisa lebih ketat, 
// tapi untuk kemudahan development kita gunakan wildcard atau deteksi otomatis.
const io = new Server(server, {
    cors: {
        origin: "*", // Mengizinkan akses dari localhost maupun URL Replit
        methods: ["GET", "POST"],
        credentials: true
    }
});

interface PlayerData {
    id: string;
    x: number;
    y: number;
    z: number;
    rotation: number;
    model: string;
    isMoving: boolean;
    role: string;
}

const activePlayers: Map<string, PlayerData> = new Map();

app.get('/', (req, res) => {
    const status = process.env.REPLIT_ENVIRONMENT ? "REPLIT MODE" : "LOCAL MODE";
    res.send(`Pioneer Portal Server is Running in ${status}`);
});

io.on('connection', (socket) => {
    console.log(`User Connected: ${socket.id}`);

    socket.on('join', (data: { avatarModel: string }) => {
        // Logika penentuan Guru/Siswa yang dinamis
        const isTeacherPresent = Array.from(activePlayers.values()).some(p => p.role === 'guru');
        const assignedRole = isTeacherPresent ? 'siswa' : 'guru';

        const newPlayerData: PlayerData = {
            id: socket.id,
            x: 0, y: -0.9, z: 0,
            rotation: Math.PI,
            model: data.avatarModel,
            role: assignedRole,
            isMoving: false
        };

        activePlayers.set(socket.id, newPlayerData);

        socket.emit('assignRole', { role: assignedRole });
        socket.emit('currentPlayers', Object.fromEntries(activePlayers));
        socket.broadcast.emit('newPlayer', newPlayerData);
    });

    socket.on('move', (data: any) => {
        const player = activePlayers.get(socket.id);
        if (player) {
            Object.assign(player, data);
            socket.broadcast.emit('userMoved', player);
        }
    });

    // socket.on('drawData', (data) => {
    //     socket.broadcast.emit('remoteDraw', data);
    // });

    // server.ts

    socket.on('drawData', (data) => {
        // Siarkan (broadcast) data x1, y1, x2, y2 ke semua client selain pengirim
        socket.broadcast.emit('remoteDraw', data);
    });

    socket.on('disconnect', () => {
        activePlayers.delete(socket.id);
        io.emit('userLeft', socket.id);
        console.log(`User Disconnected: ${socket.id}`);
    });
});

// 2. DINAMIS PORT: Replit menggunakan process.env.PORT, Lokal biasanya 3000
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log("------------------------------------------");
    console.log(`PIONEER PORTAL SERVER ONLINE`);
    console.log(`PORT   : ${PORT}`);
    console.log(`MODE   : ${process.env.REPLIT_ENVIRONMENT ? "REPLIT (ONLINE)" : "LOCAL (OFFLINE)"}`);
    console.log("------------------------------------------");
});