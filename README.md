# 🚀 NexusX — Your Life Operating System

> **The social platform built for human progress, not addiction.**

[![NexusX](https://img.shields.io/badge/NexusX-v2.0-6c47ff?style=for-the-badge&logo=infinity)](#)
[![Node.js](https://img.shields.io/badge/Node.js-v20+-green?style=for-the-badge&logo=node.js)](#)
[![SQLite](https://img.shields.io/badge/SQLite-3-blue?style=for-the-badge&logo=sqlite)](#)
[![License: ISC](https://img.shields.io/badge/License-ISC-yellow?style=for-the-badge)](#)

---

## ✨ Features

| Category | Features |
|---|---|
| 🎨 **Design** | Aurora animated background, Liquid glass cards, Dark/Light mode, Particle field |
| ⚡ **Reactions** | 8 rich reactions with physics burst animations |
| 📝 **Posts** | Rich text, image upload, hashtag & mention parsing, character arc counter |
| 🔁 **Reposts** | One-click repost / quote boost with live counter |
| 🔖 **Bookmarks** | Save any post to your personal collection |
| 🔍 **Search** | Live user search with instant dropdown |
| 🔥 **Trending** | Real hashtags extracted dynamically from post data |
| 💓 **Pulse Score** | Dynamic reputation system that grows with every interaction |
| 🔔 **Notifications** | Follow, reaction, and comment notifications with unread badge |
| 👤 **Profiles** | Banner, avatar, bio, stats, pulse score card |
| 📱 **Mobile** | Instagram-style bottom navigation and responsive drawer |
| 🎵 **Audio FX** | Web Audio API synthesized sounds for every interaction |

---

## 🛠️ Tech Stack

- **Backend:** Node.js + Express
- **Database:** SQLite3 (WAL mode, indexed)
- **Auth:** JWT (30-day sessions) + bcrypt password hashing
- **Frontend:** Vanilla HTML5 + CSS3 + Modern JavaScript (ES6+)
- **Typography:** Inter + Playfair Display (Google Fonts)
- **Icons:** Font Awesome 6

---

## 🚀 Getting Started

```bash
# 1. Clone the repo
git clone https://github.com/avrojitsaha763-byte/NexusX.git
cd NexusX

# 2. Install dependencies
npm install

# 3. Start the server
node server.js

# 4. Open in browser
# http://localhost:3000
```

---

## 📂 Project Structure

```text
NexusX/
├── server.js          # Express backend + all API routes
├── package.json       # Dependencies
├── public/
│   ├── index.html     # Full SPA markup
│   ├── styles.css     # Premium design system
│   └── app.js         # Complete frontend logic
└── uploads/           # User-uploaded images (auto-created)
```

---

## 📡 API Endpoints

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register new account |
| `POST` | `/api/auth/login` | Login + get JWT |
| `GET` | `/api/users/me` | Current user profile |
| `PUT` | `/api/users/me` | Update profile + avatar/banner |
| `GET` | `/api/users/search?q=` | Live user search |
| `GET` | `/api/users/suggestions` | Suggested connections |
| `GET` | `/api/users/:id` | Any user profile + stats |
| `POST` | `/api/users/:id/follow` | Follow a user |
| `DELETE` | `/api/users/:id/follow` | Unfollow a user |
| `GET` | `/api/posts` | Feed (all/following/explore/user) |
| `POST` | `/api/posts` | Create a post |
| `DELETE` | `/api/posts/:id` | Delete own post |
| `POST` | `/api/posts/:id/react` | Add/change/remove reaction |
| `GET` | `/api/posts/:id/reactions` | Get reaction breakdown |
| `GET` | `/api/posts/:id/comments` | Get comments |
| `POST` | `/api/posts/:id/comments` | Add comment |
| `POST` | `/api/posts/:id/repost` | Toggle repost |
| `POST` | `/api/posts/:id/bookmark` | Toggle bookmark |
| `GET` | `/api/bookmarks` | Get saved posts |
| `GET` | `/api/trending` | Trending hashtags |
| `GET` | `/api/notifications` | User notifications |
| `PUT` | `/api/notifications/read` | Mark all as read |

---

## 💎 Design Philosophy

NexusX is built to make people **forget Instagram, Twitter, and Threads exist**.

- **Aurora UI** — Animated northern lights background that breathes
- **Liquid Glass Cards** — Real `backdrop-filter` blur with iridescent borders
- **Pulse Score** — Reputation system that rewards meaningful interaction
- **No doomscrolling** — Optimized for human progress, not addiction

---

Developed with ❤️ by **[Avrojit Saha](https://github.com/avrojitsaha763-byte)**.
