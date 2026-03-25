import express from 'express';
import { Server } from 'socket.io';
import http from 'http';
import https from 'https';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import path from 'path';
import { ROLES, NETWORK_EVENTS } from "../shared/constants.ts";
import os from 'os';
import cors from 'cors';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();

// Konfigurasi Admin
const ADMIN_UID = "PjSNNdrP0DP0PddcE7wElgSkppE3";

// Setup upload directory
const uploadDir = path.join(__dirname, 'public/presentations');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `slide-${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({ storage });

// CORS Configuration
app.use(cors({
    origin: "*",
    credentials: true
}));

// Body parser untuk JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/presentations', express.static(path.join(__dirname, 'public/presentations')));

// Deteksi environment
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

// Socket.IO dengan konfigurasi optimal
const io = new Server(server, {
    cors: {
        origin: ["https://pioneer-portal-v3.vercel.app", "http://localhost:5000"],
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['polling', 'websocket'],
    pingTimeout: 60000,
    pingInterval: 25000
});

// ============================================
// ROUTES API
// ============================================

app.get('/', (req, res) => {
    console.log("🔔 Seseorang mengetok pintu server (Route / diakses)");
    res.send("🚀 PIONEER PORTAL V3 SERVER IS LIVE!");
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.post('/upload-material', upload.single('slide'), (req, res) => {
    try {
        if (!(req as any).file) {
            return res.status(400).json({ success: false, message: 'File tidak ditemukan' });
        }

        const file = (req as any).file;
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.get('host');
        const fileUrl = `https://${host}/presentations/${file.filename}`;
        
        console.log("🚀 File berhasil disimpan:", fileUrl);
        res.json({ success: true, url: fileUrl });
    } catch (error) {
        console.error("❌ Error Server:", error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

app.get('/api/admin/users', (req, res) => {
    const users = Array.from(activeUsers.values());
    res.json(users);
});

// ============================================
// GAME STATE MANAGEMENT
// ============================================

interface PlayerData {
    uid: string;
    socketId: string;
    displayName: string;
    role: string;
    model: string;
    x: number;
    y: number;
    z: number;
    rotation: number;
    lastUpdate: number; // Timestamp untuk tracking
    lastHeartbeat: number;
}

const activeUsers = new Map<string, PlayerData>();
let currentTeacherId: string | null = null;
const MAX_STUDENTS = 10;

// Broadcast kapasitas ke semua client
const broadcastCapacity = () => {
    const studentCount = Array.from(activeUsers.values()).filter(u => u.role !== ROLES.TEACHER).length;
    io.emit('capacityUpdate', {
        current: studentCount,
        max: MAX_STUDENTS
    });
    console.log(`📊 Kapasitas Update: ${studentCount}/${MAX_STUDENTS}`);
};

// Cleanup inactive players (heartbeat timeout)
setInterval(() => {
    const now = Date.now();
    const timeout = 30000; // 30 detik timeout
    
    activeUsers.forEach((player, uid) => {
        if (now - (player.lastHeartbeat || now) > timeout) {
            console.log(`⏰ Heartbeat timeout untuk ${player.displayName} (${uid})`);
            const socket = io.sockets.sockets.get(player.socketId);
            if (socket) {
                socket.disconnect(true);
            }
            activeUsers.delete(uid);
            
            if (uid === currentTeacherId) {
                currentTeacherId = null;
                console.log("⚠️ Guru timeout, dihapus dari kelas");
            }
            
            io.emit(NETWORK_EVENTS.USER_LEFT, uid);
            broadcastCapacity();
        }
    });
}, 15000); // Cek setiap 15 detik

// ============================================
// SOCKET.IO EVENT HANDLERS
// ============================================

io.on('connection', (socket: any) => {
    console.log(`🔌 Handshake baru: ${socket.id}`);
    
    // ============================================
    // HEARTBEAT SYSTEM
    // ============================================
    socket.on('heartbeat', (data: { uid: string, timestamp: number }) => {
        const player = activeUsers.get(data.uid);
        if (player && player.socketId === socket.id) {
            player.lastHeartbeat = Date.now();
            // Optional: kirim balik untuk konfirmasi
            socket.emit('heartbeat_ack', { timestamp: data.timestamp });
        }
    });
    
    // ============================================
    // AUTHENTICATION & JOIN
    // ============================================
    socket.on(NETWORK_EVENTS.AUTH_JOIN, (data: any) => {
        const { uid, displayName, avatarModel, role } = data;
        
        // Simpan UID ke socket
        socket.uid = uid;
        
        // Cek double login
        if (activeUsers.has(uid)) {
            const existing = activeUsers.get(uid);
            if (existing && existing.socketId !== socket.id) {
                console.log(`⚠️ Double login detected: ${displayName} (${uid})`);
                socket.emit('kick_duplicate', { 
                    message: "Akun ini sudah aktif di tab lain. Silakan tutup tab lain terlebih dahulu." 
                });
                setTimeout(() => socket.disconnect(), 1000);
                return;
            }
        }
        
        // Cek kapasitas untuk siswa
        const currentStudents = Array.from(activeUsers.values()).filter(u => u.role !== ROLES.TEACHER).length;
        
        if (currentStudents >= MAX_STUDENTS && role !== ROLES.TEACHER) {
            console.log(`🚫 Kelas penuh: Menolak siswa ${displayName}`);
            socket.emit('error_message', {
                title: "Kelas Penuh!",
                message: `Maaf, kapasitas maksimal ${MAX_STUDENTS} siswa sudah tercapai.`
            });
            setTimeout(() => socket.disconnect(), 1000);
            return;
        }
        
        // Data player
        const playerData: PlayerData = {
            uid: uid,
            socketId: socket.id,
            displayName: displayName,
            role: role,
            model: avatarModel || (role === ROLES.TEACHER ? "yeti" : "frog"),
            x: 0,
            y: -0.9,
            z: 0,
            rotation: Math.PI,
            lastUpdate: Date.now(),
            lastHeartbeat: Date.now()
        };
        
        activeUsers.set(uid, playerData);
        
        // Update teacher ID jika guru
        if (role === ROLES.TEACHER) {
            currentTeacherId = uid;
            console.log(`👨‍🏫 GURU MASUK: ${displayName} (${uid})`);
        } else {
            console.log(`👶 SISWA MASUK: ${displayName} (${uid})`);
        }
        
        // Kirim daftar player yang sudah ada ke client baru
        const playersMap: any = {};
        activeUsers.forEach((player, key) => {
            playersMap[key] = {
                uid: player.uid,
                displayName: player.displayName,
                role: player.role,
                x: player.x,
                y: player.y,
                z: player.z,
                ry: player.rotation
            };
        });
        socket.emit('currentPlayers', playersMap);
        
        // Broadcast ke semua client lain
        socket.broadcast.emit(NETWORK_EVENTS.USER_JOINED, {
            uid: uid,
            displayName: displayName,
            role: role,
            x: playerData.x,
            z: playerData.z,
            ry: playerData.rotation
        });
        
        // Update kapasitas
        broadcastCapacity();
        
        console.log(`✅ ${displayName} bergabung. Total: ${activeUsers.size} user`);
    });
    
    // ============================================
    // AVATAR MOVEMENT (DENGAN THROTTLE DI SISI CLIENT)
    // ============================================
    socket.on(NETWORK_EVENTS.AVATAR_UPDATE, (data: any) => {
        const player = activeUsers.get(socket.uid);
        if (player && player.socketId === socket.id) {
            // Update data player di server
            if (data.position) {
                player.x = data.position.x;
                player.y = data.position.y;
                player.z = data.position.z;
            }
            if (data.rotation) {
                player.rotation = data.rotation.y || data.rotation.ry || player.rotation;
            }
            player.lastUpdate = Date.now();
            
            // Broadcast ke semua client KECUALI pengirim
            socket.broadcast.emit(NETWORK_EVENTS.AVATAR_UPDATE, {
                uid: socket.uid,
                position: { x: player.x, y: player.y, z: player.z },
                rotation: { y: player.rotation }
            });
        }
    });
    
    // ============================================
    // WHITEBOARD & DRAWING
    // ============================================
    socket.on('drawData', (data: any) => {
        // Hanya guru yang boleh broadcast gambar
        const player = activeUsers.get(socket.uid);
        if (player && player.role === ROLES.TEACHER) {
            socket.broadcast.emit('remoteDraw', data);
        }
    });
    
    socket.on('clearBoard', () => {
        const player = activeUsers.get(socket.uid);
        if (player && player.role === ROLES.TEACHER) {
            socket.broadcast.emit('clearBoard');
            console.log("🧹 Guru membersihkan papan tulis");
        }
    });
    
    socket.on("admin-change-slide", (data) => {
        const player = activeUsers.get(socket.uid);
        if (player && player.role === ROLES.TEACHER) {
            console.log("📢 Guru mengganti slide:", data.slideUrl);
            io.emit("update-whiteboard-slide", data);
        }
    });
    
    // ============================================
    // WHITEBOARD SYNC
    // ============================================
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
    
    // ============================================
    // WEBRTC SIGNALING
    // ============================================
    socket.on(NETWORK_EVENTS.OFFER, (data: any) => {
        const target = activeUsers.get(data.toUid);
        if (target) {
            io.to(target.socketId).emit(NETWORK_EVENTS.OFFER, { 
                offer: data.offer, 
                from: socket.uid 
            });
        }
    });
    
    socket.on(NETWORK_EVENTS.ANSWER, (data: any) => {
        const target = activeUsers.get(data.toUid);
        if (target) {
            io.to(target.socketId).emit(NETWORK_EVENTS.ANSWER, { 
                answer: data.answer, 
                from: socket.uid 
            });
        }
    });
    
    socket.on(NETWORK_EVENTS.ICE_CANDIDATE, (data: any) => {
        const target = activeUsers.get(data.toUid);
        if (target) {
            io.to(target.socketId).emit(NETWORK_EVENTS.ICE_CANDIDATE, { 
                candidate: data.candidate, 
                from: socket.uid 
            });
        }
    });
    
    // ============================================
    // ADMIN COMMANDS
    // ============================================
    socket.on('admin_kick_user', (targetUid: string) => {
        const player = activeUsers.get(socket.uid);
        if (player && player.role === ROLES.TEACHER) {
            const target = activeUsers.get(targetUid);
            if (target) {
                io.to(target.socketId).emit('error_message', {
                    title: "Dikeluarkan oleh Guru",
                    message: "Anda telah dikeluarkan dari kelas."
                });
                setTimeout(() => {
                    const targetSocket = io.sockets.sockets.get(target.socketId);
                    if (targetSocket) targetSocket.disconnect();
                }, 1000);
            }
        }
    });
    
    socket.on('admin_broadcast', (message: string) => {
        const player = activeUsers.get(socket.uid);
        if (player && player.role === ROLES.TEACHER) {
            io.emit('announcement', message);
            console.log(`📢 Pengumuman dari ${player.displayName}: ${message}`);
        }
    });
    
    // ============================================
    // DISCONNECT HANDLER
    // ============================================
    socket.on('disconnect', () => {
        if (socket.uid) {
            const player = activeUsers.get(socket.uid);
            if (player && player.socketId === socket.id) {
                console.log(`❌ ${player.displayName} (${player.role}) keluar`);
                
                if (socket.uid === currentTeacherId) {
                    currentTeacherId = null;
                    console.log("⚠️ Guru meninggalkan kelas!");
                }
                
                activeUsers.delete(socket.uid);
                io.emit(NETWORK_EVENTS.USER_LEFT, socket.uid);
                broadcastCapacity();
            }
        }
    });
});

// ============================================
// SERVER START
// ============================================
const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
    console.log("--------------------------------------------------");
    console.log("🚀 PIONEER PORTAL V3 SERVER ONLINE");
    console.log(`📡 Port: ${PORT}`);
    console.log(`🌍 Mode: ${isReplit ? 'REPLIT CLOUD' : 'LOCAL'}`);
    console.log(`👥 Max Students: ${MAX_STUDENTS}`);
    console.log("--------------------------------------------------");
});