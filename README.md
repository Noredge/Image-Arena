# 选图擂台 · Image Arena v1.0

好图过招，胜者为王。把选图变成一场小游戏，每次比较两张，留下你更喜欢的那张。

**[在线试用 Web 版](https://image-arena.noredge.chatgpt.site/)** · Windows 桌面版额外支持移动原图和回收站整理。

## 玩法

| 模式 | 最少图片 | 规则 |
| --- | ---: | --- |
| 精选排名 | 1 | 选出有顺序的前 K 名 |
| 一败退场 | 2 | 单败淘汰，决出冠军 |
| 连胜擂台 | 3 | 胜者留台，迎接下一位挑战者 |
| 双败复活 | 4 | 首败进复活区，再败退场 |
| 小组出线 | 6 | 小组循环、前二出线，再打淘汰赛 |

导入静态 PNG / JPEG / WebP 后即可开赛。支持滚轮缩放、拖动、同步比较和单独看图；手机可点图查看、双指缩放。`A / ←` 选左，`D / →` 选右，`Ctrl+Z` 撤销。裁判“一票否决”只取消本轮资格，不删除图片。

日夜主题、五套背景音乐、音量和开赛偏好会自动记住。刷新或退出不会保存比赛进度；JSON 导出用于留存结果，不能恢复对局。详细赛制见 [玩法说明](docs/RULES.md)。

## 本地运行

Web 开发需要 Node.js 22.12+：

```sh
npm ci
npm run dev
```

生产预览：`npm run build` 后运行 `npm run preview`，打开 `http://127.0.0.1:4173/`。

Windows x64 桌面构建还需 Rust stable（MSVC）、Visual Studio C++ 构建工具与 WebView2 Runtime：

```sh
npm run desktop:build
```

生成 `src-tauri/target/release/image-arena.exe`，可直接运行。桌面程序无需 Node.js 或 Rust，仍需 WebView2。当前未签名。

## 文件与隐私

- 比赛在本机进行，应用不上传图片。Web 版只读取图片；桌面版在你主动执行后才整理文件。
- 同名目标不会覆盖；回收站不可用时拒绝操作，不改为永久删除。比赛撤销不撤销磁盘操作，整理可能部分成功，请查看逐项结果。
- 最多 256 张、单张 256 MiB、合计 1 GiB；手机建议从少量图片开始，这些限制不代表大图内存性能保证。

Web 与桌面共用赛制和界面。线上主要流程已通过浏览器验收，用户反馈实体手机试用通过；这不代表所有设备均已验证。

## 测试与许可

`npm test` · `npm run build` · Windows 原生测试：`npm run desktop:test`

跨盘、ACL 和真实回收站测试需要专用临时环境，默认跳过。项目采用 [MIT](LICENSE) 许可证，依赖许可见 [第三方声明](THIRD_PARTY_NOTICES.txt)。
