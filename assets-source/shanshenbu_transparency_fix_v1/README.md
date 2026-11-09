# 《闪身步》踢击动作透明背景修复 V1

本包由素材制作方重新清理原始动作帧，不需要 Codex 再抠图。

## 文件

- `assets/actions/kick/00.png` ~ `06.png`：清理后的7帧 RGBA PNG
- `assets/actions/kick/kick_spritesheet.png`：横向排列7帧，单帧 **400×370**
- `before_after_kick.jpg`：3组帧，左原图、右修复
- `after_blue_background.jpg` 与 `after_dark_background.jpg`：全帧检查
- `kick_clean_preview.gif`：动画检查预览（非游戏运行资源）
- `quality_report.json`：修复影响像素统计

## 修复范围

仅从现有帧中去除人物腿间的不透明浅色块、跟随人物移动的蓝灰地面阴影及边缘污染。**不改变**各帧尺寸、人物姿态、脚底锚点、战斗命中计算、衣服和面部颜色。它是清理而非重绘。

## 接入

将7帧和Sprite Sheet替换项目内同名踢击动画资源即可。若工程使用其它路径，请由Codex核对后替换，且**不改Combat Core**。务必在实际游戏蓝色舞台上检查动画。

## 限制

图像抠底的边缘可能仍有像素级瑕疵。本次按现有素材直接处理，不是自动修复未来所有新生成图片的万能模型。后续若提供源图层或独立角色部件，清理会更稳定。
