# Pioneer Portal V3 - Virtual Classroom

A 3D virtual classroom application built with BabylonJS (frontend) and Express/Socket.io (backend).

## Architecture

- **Frontend**: Vite + TypeScript + BabylonJS 3D engine, runs on port 5000
- **Backend**: Express + Socket.io for real-time multiplayer, runs on port 3000
- **Shared**: Common constants and config shared between client and server
- **Auth**: Firebase Google Authentication

## Project Structure

```
/
├── client/          # Vite + TypeScript frontend (BabylonJS 3D)
│   ├── src/
│   │   ├── auth/    # Firebase authentication
│   │   ├── managers/ # AvatarManager, VoiceManager, WhiteboardManager, etc.
│   │   ├── network/  # NetworkManager, PeerVoice (WebRTC)
│   │   ├── scene.ts  # BabylonJS scene setup
│   │   └── main.ts   # App entry point
│   └── vite.config.ts
├── server/          # Express + Socket.io backend
│   └── server.ts    # HTTP server with Socket.io
└── shared/          # Shared constants and config
    ├── constants.ts  # ROLES, NETWORK_EVENTS, AVATAR_CONFIG, AUDIO_CONFIG
    └── admin.config.ts # Teacher email list
```

## Features

- Google login via Firebase Auth
- 3D virtual classroom with BabylonJS
- Real-time avatar movement (WASD controls)
- Interactive whiteboard with teacher/student roles
- WebRTC voice chat (spatial audio)
- Socket.io multiplayer synchronization

## Development

Run both frontend and backend together:
```
npm run dev
```

This runs:
- `npm run dev --prefix client` → Vite dev server on port 5000
- `npm run dev --prefix server` → tsx watch server.ts on port 3000

## Notes

- Firebase authorized domains must include the Replit dev domain for Google Auth to work
- Server uses HTTP (Replit handles TLS termination)
- Teacher role is determined by email matching `TEACHER_EMAILS` in `shared/admin.config.ts`
