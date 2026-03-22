# 落雪桌面修改版 (lx-music-desktop modified)

## 来源
- 原始仓库: https://github.com/lyswhut/lx-music-desktop
- 版本: 2.12.1

## 修改内容
1. **酷狗登录** - QR码扫码登录酷狗账号
2. **网易云登录** - QR码扫码登录网易云账号  
3. **VIP 显示** - 显示酷狗/网易云 VIP 状态（类型+等级+过期时间）
4. **每日推荐** - 酷狗每日推荐歌曲列表

## API 来源
- 酷狗 API: https://github.com/MakcRe/KuGouMusicApi (fork: https://github.com/xinzhihong/KuGouMusicApi)
- 网易云 API: https://github.com/Binaryify/NeteaseCloudMusicApi (fork: https://github.com/xinzhihong/NeteaseCloudMusicApi)

## 打包说明
- macOS: 本地 `npm run build && npm run pack:mac:dmg:arm64`
- Windows/Linux: 通过 GitHub Actions 自动构建 (`.github/workflows/build-all.yml`)
- DMG 未签名 (identity=null)，仅供本地测试
