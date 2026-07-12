# 🎬 宝拓影视 - 影视资源聚合平台

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)
![Storage](https://img.shields.io/badge/Storage-Local%20JSON%20%7C%20MongoDB-green?style=flat-square)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

**现代化影视资源聚合平台** - 支持 Dailymotion 视频源、豆瓣信息匹配、多种部署方式

🌐 **项目地址**: [https://github.com/baotuo88/BTTV](https://github.com/baotuo88/BTTV)

[功能特性](#-功能特性) • [部署方式](#-部署方式) • [环境变量](#-环境变量) • [本地开发](#-本地开发)

</div>

---

## ✨ 功能特性

- 🎬 **视频聚合** - 聚合 Dailymotion 等多个视频源
- 📝 **豆瓣匹配** - 自动匹配豆瓣电影信息和评分
- 💬 **弹幕功能** - 自动匹配加载弹幕，支持手动搜索
- 🎥 **高级播放器** - ArtPlayer 播放器，支持 HLS、倍速、快捷键
- 📱 **响应式设计** - 完美支持移动端和桌面端
- 🎨 **现代化 UI** - Netflix 风格界面设计
- 🔐 **后台管理** - 视频源配置、频道管理 (`/login`)
- 👤 **用户系统** - 注册/登录、个人中心、密码找回
- ❤️ **用户清单** - 收藏、追剧清单、稍后再看
- ☁️ **云端续播** - 播放进度跨设备同步
- 🩺 **源健康检测** - 后台一键检测视频源可用性
- 🚀 **多种部署** - 支持 Vercel、Docker、VPS 一键部署

## 📸 界面预览

<details>
<summary>点击展开预览图</summary>

### 首页

![首页](screenshot/home.png)

### 搜索页

![搜索](screenshot/movie-search.png)

### 详情页

![详情页](screenshot/movie-detail.png)

### 播放页

![播放页](screenshot/movie-playing.png)

</details>

---

## 🚀 部署方式

### 方式一：Vercel 部署（推荐）

> 无需服务器，免费托管，自动 HTTPS

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/baotuo88/BTTV)

**步骤：**

1. 点击上方按钮，Fork 项目到 Vercel
2. 在 Vercel 控制台设置环境变量：
   ```
   STORAGE_DRIVER=mongodb
   MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/bttv
   ADMIN_PASSWORD=your_password
   ALLOW_REGISTER=true
   ```
3. 部署完成！

> 💡 **提示**：Vercel 部署需要使用云端 MongoDB（如 [MongoDB Atlas](https://www.mongodb.com/atlas) 免费版）

---

### 方式二：Docker Compose 部署

#### 快速启动

```bash
# 1. 克隆项目
git clone https://github.com/baotuo88/BTTV.git
cd BTTV

# 2. 创建配置文件
cp .env.example .env

# 3. 编辑配置（可选）
nano .env

# 4. 启动服务
docker-compose up -d

# 5. 查看日志
docker-compose logs -f app
```

#### docker-compose.yml 说明

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000" # 修改左侧端口号自定义访问端口
    environment:
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
      - ALLOW_REGISTER=${ALLOW_REGISTER}
      - STORAGE_DRIVER=local
      - LOCAL_DATA_DIR=/app/data
    volumes:
      - bttv-data:/app/data # 本地数据持久化
```

#### 常用命令

```bash
docker-compose up -d       # 后台启动
docker-compose down        # 停止服务
docker-compose logs -f     # 查看日志
docker-compose restart     # 重启服务
docker-compose pull        # 更新镜像
```

---

### 方式三：VPS 一键部署

在任何装有 Docker 的服务器上执行：

```bash
# 使用 curl
curl -fsSL https://raw.githubusercontent.com/baotuo88/BTTV/master/scripts/install.sh | bash

# 使用 wget
wget -qO- https://raw.githubusercontent.com/baotuo88/BTTV/master/scripts/install.sh | bash
```

**部署后管理：**

```bash
cd ~/bttv
./bttv.sh start     # 启动
./bttv.sh stop      # 停止
./bttv.sh restart   # 重启
./bttv.sh logs      # 日志
./bttv.sh update    # 更新
./bttv.sh backup    # 备份
```

---

## ⚙️ 环境变量

### 存储变量

| 变量名           | 说明                                      | 默认值        |
| ---------------- | ----------------------------------------- | ------------- |
| `STORAGE_DRIVER` | 存储模式，`local` 为服务器本地文件，`mongodb` 为 MongoDB | `local` |
| `LOCAL_DATA_DIR` | 本地文件存储目录（Docker Compose 会覆盖为 `/app/data`） | `./data` |
| `MONGODB_URI`    | MongoDB 连接字符串，仅 `STORAGE_DRIVER=mongodb` 时需要 | - |
| `MONGODB_DB_NAME`| MongoDB 数据库名称                         | `bttv`        |

### 可选变量

| 变量名                        | 说明           | 默认值                               |
| ----------------------------- | -------------- | ------------------------------------ |
| `ADMIN_PASSWORD`              | 后台管理密码   | 必填（无默认值）                     |
| `ALLOW_REGISTER`              | 是否允许新用户注册（支持 `true/false/1/0/on/off`） | `true` |
| `SITE_NAME`                   | 站点名称（用于导航品牌） | `宝拓影视`                   |
| `SITE_TITLE`                  | 浏览器标题（SEO title） | `宝拓影视 - 免费影视在线观看` |
| `SITE_DESCRIPTION`            | 站点描述（SEO description） | -                           |
| `NEXT_PUBLIC_SITE_NAME`       | 前端回退站点名称（可选） | -                              |
| `NEXT_PUBLIC_SITE_TITLE`      | 前端回退标题（可选）   | -                                |
| `NEXT_PUBLIC_SITE_DESCRIPTION`| 前端回退描述（可选）   | -                                |
| `PROXY_SIGN_SECRET`           | 代理 URL 签名密钥（建议设置） | 自动回退到 `ADMIN_PASSWORD` |
| `PROXY_ALLOWED_HOSTS`         | 代理域名白名单（逗号分隔，支持 `*.example.com`） | - |
| `NEXT_PUBLIC_DANMU_API_URL`   | 弹幕 API 地址  | `https://danmuapi1-eight.vercel.app` |
| `NEXT_PUBLIC_DANMU_API_TOKEN` | 弹幕 API Token | -                                    |
| `RESEND_API_KEY`              | Resend 邮件 Key（找回密码） | -                     |
| `RESEND_FROM_EMAIL`           | 发件人邮箱（找回密码）      | -                     |

### 注册开关优先级说明

- 首次启动或读取不到存储配置时，使用环境变量 `ALLOW_REGISTER` 作为默认值（未设置时默认 `true`）。
- 后台「运营配置」保存过“开放用户注册”后，以持久化配置为准。
- 无论前端是否显示注册入口，后端 `/api/user/register` 都会按该开关强制拦截。

### 存储模式示例

本地文件存储（Docker Compose 默认）：

```bash
STORAGE_DRIVER=local
LOCAL_DATA_DIR=/app/data
```

数据会写入 Docker 数据卷 `bttv-data`，不需要单独启动数据库容器。

MongoDB：

```bash
STORAGE_DRIVER=mongodb
MONGODB_URI=mongodb://localhost:27017/bttv

# MongoDB Atlas（云端）
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/bttv
```

---

## 💻 本地开发

### 使用 Docker（推荐）

```bash
# 启动开发环境（包含 MongoDB）
npm run docker:dev

# 停止服务
docker-compose -f docker-compose.dev.yml down
```

### 不使用 Docker

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 默认使用本地 ./data；如需 MongoDB，设置 STORAGE_DRIVER=mongodb 和 MONGODB_URI

# 3. 启动开发服务器
npm run dev

# 4. 访问
open http://localhost:3000
```

### 脚本说明

| 命令                  | 说明                      |
| --------------------- | ------------------------- |
| `npm run dev`         | 启动开发服务器            |
| `npm run build`       | 构建生产版本              |
| `npm run docker:dev`  | Docker 开发环境（热重载） |
| `npm run docker:prod` | 构建并推送 Docker 镜像    |

---

## 📁 项目结构

```
BTTV/
├── app/                    # Next.js App Router
├── components/             # React 组件
│   └── player/             # 播放器组件
│       ├── LocalHlsPlayer.tsx  # 本地 HLS 播放器
│       └── DanmakuPanel.tsx    # 弹幕搜索面板
├── lib/                    # 工具库
│   ├── cache.ts            # 内存缓存
│   ├── db.ts               # MongoDB 连接
│   └── player/             # 播放器工具
│       └── danmaku-service.ts  # 弹幕服务
├── scripts/                # 部署脚本
│   └── install.sh          # 一键部署脚本
├── docker-compose.yml      # 生产环境
├── docker-compose.dev.yml  # 开发环境
└── docker-compose.server.yml
```

## 📄 License

MIT License © 2026
