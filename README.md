# 沈述声音馆 · 前端 v0.1

独立声音馆 `/` 与未来 MCP Apps 工具结果卡片 `/card.html`，共享 `packages/voice-data/index.js` 中的内容结构和收藏状态。仅前端，无密钥、无 MiniMax、无 MCP 服务。

## 启动

安装 Node.js 20.19+ 或 22.12+，在仓库根目录运行 `npm install`、`npm run dev`，浏览器打开终端提示的本地地址。手机同一 Wi-Fi 下可通过电脑局域网 IP 加 Vite 端口访问（防火墙需允许）。`npm run build` 生成 `dist/`，`npm run preview` 本地检查构建产物。不能直接双击 HTML：浏览器对 ES Modules、绝对音频路径及路由有本地文件限制。

## 结构

- `apps/voice-gallery/`：声音馆列表、搜索、分类、全屏播放器及移动端样式。
- `apps/voice-card/`：独立卡片页面，后续可迁移为 MCP Apps 资源视图。
- `packages/voice-data/index.js`：语音记录 schema、分类、收藏工具。
- `public/audio/first-english.mp3`：用户提供的真实 10.056 秒英文录音。
- `public/manifest.webmanifest`：加入手机主屏幕所需的 Web App Manifest。iOS 使用 Safari 的“分享 → 添加到主屏幕”；需要先将页面部署到手机可访问的 HTTPS 站点，局域网 HTTP 不保证安装体验。

## 数据结构与后续接入

每条语音含 `id,title,date,category,duration,audioUrl,body,captions,demo`。收藏状态独立保存在 `localStorage` 的 `shenshu:favorites`，播放位置和循环状态保存在 `shenshu:player`。`captions` 可填写 `{start,end,text}` 数组，时间单位为秒；首条音频尚无经核对的逐句时间轴，故不伪造逐句字幕。演示数据明确标注且不可播放；上一条/下一条只在真实可播放条目间切换。

未来 MiniMax 服务端生成音频后，上传到云端对象存储，写入可持久化记录并返回稳定 HTTPS `audioUrl`。将 `packages/voice-data/index.js` 的本地数组替换为后端数据适配器即可。密钥只保存在未来服务端，不放入前端。MCP Apps 接入时将 `apps/voice-card/` 迁移或构建为工具结果 UI 资源，并通过工具结果传入同一语音记录；本版 `/card.html` 是独立可运行预览，不宣称已注册 MCP 工具。私有 GitHub 仓库不会自动提供可公开访问的音频托管服务。

## 检查说明

真实录音已放入 `public/audio/`。页面支持原生 Audio 播放/暂停、拖动进度、循环、收藏、下载、列表切换、刷新后恢复播放位置（浏览器自动播放限制下不会自行开始播放）。视觉呼吸和卡片波形根据播放时钟驱动，不是实际音频振幅分析。可在 `apps/voice-gallery/style.css` 的 `:root` 中统一替换颜色变量。没有录音逐句转写和时间戳前不显示虚构字幕。
