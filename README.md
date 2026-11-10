# 星途之旅 · Luma Trail

一款三关的横版平台冒险游戏。控制星途旅人集齐每关的三颗星芒，并用星术击败守门者。曙光守卫会在加宽的最终平台上追击玩家，发射三连飞弹后跃起换位，再发动长距离冲锋。粉色瞄准线提示飞弹，金色预警线提示冲锋。

每关有三颗生命值，击败怪物可以回复一颗心。生命耗尽、掉落或碰到尖刺时会复活，恢复生命并保留星芒和战斗进度。抵达曙光守卫所在的平台时会点亮篝火，之后可从篝火复活。

## 运行

Windows 上可以双击 `start.cmd`，启动后会打开默认浏览器。也可以在项目目录运行下列命令，然后访问 [http://127.0.0.1:8765](http://127.0.0.1:8765/)。

```sh
python app.py
```

需要 Python 3.9 或更新版本。游戏服务使用 Python 标准库，前端资源保存在项目内。关闭终端或按 Ctrl+C 即可结束服务。

打开登录页，选择「注册账号」，然后用注册的用户名和密码登录。账号保存在运行游戏的电脑上的 `accounts.local.sqlite3` 中。已有的 `login.local.json` 账号也可以继续登录。服务重启后需要重新登录。

## 操作

| 操作 | 按键 |
| --- | --- |
| 移动 | ← / → 或 A / D |
| 跳跃 | 空格、↑ 或 W |
| 星弹（按住连发） | J |
| 月影冲刺（穿过怪物和飞弹） | K |
| 暂停 / 继续 | Esc |
| 重玩本关 | R |

触屏设备可使用舞台下方的按钮。通关记录按账号保存在当前浏览器中，战斗版最佳用时单独记录。

在「操作指南」底部展开「清除游戏记录」并确认，可把当前浏览器的通关进度和最佳用时清零。

三关各有一段原创循环配乐。月影森林使用柔和铃音，萤光洞窟加入回声与低音，破晓浮岛的节奏更紧凑。进入关卡后开始播放，暂停或离开关卡时停止，右上角扬声器可同时开关音乐和音效。

击败曙光守卫并进入最终传送门后，会打开奶茶兑换卡制作页面。星巴克、霸王茶姬、卡旺卡三选一，填写饮品名称、杯型、冰量、甜度、加料、姓名、地址、电话及兑换日期时间后，即可生成并保存 PNG 或 SVG。卡号保存在浏览器中，可在页面右上方重新打开。凭卡向赠卡人兑换一杯饮品。

每次点击「生成兑换卡」并保存成功后，表单内容会写入项目根目录的 `兑换记录/LUMA-卡号.json`。记录使用 UTF-8 编码，可用记事本打开。同一卡号重新提交会更新该文件，并记录最后保存时间。目录位于网页资源目录之外。

## 项目结构

- `app.py` 提供关卡数据和网页文件。
- `public/game.js` 管理操作、界面、音效和存档。
- `public/physics.js` 实现角色移动、碰撞、星芒和过关规则。
- `public/combat.js` 实现技能、怪物行为、飞弹和生命值。
- `public/scene.js` 使用 Canvas 绘制游戏画面。

## 场景素材

**可玩角色 · `traveler.webp`**

角色以用户提供的照片作为外观参考，由内置 ImageGen 生成。精灵图包含待机、两帧跑步、跳跃、下落、施法、冲刺和受击姿态。

> Use case: style-transfer / stylized-concept. Reference image role: character appearance and outfit only. Make a PRODUCTION GAME SPRITE SHEET with 8 poses of the SAME cartoon young girl inspired by the supplied family photo: long flowing dark brown-black hair with a soft side part, dark warm eyes, cheerful open smile, raspberry-pink knit top and pale cream trousers. Turn the outfit into a practical, wholesome star-magic adventurer outfit with sturdy cocoa ankle boots, warm gold star hairpin, and a small plum scarf. She is the playable hero in an illustrated 2D side-scrolling fairy-tale night platformer. Cute softly shaded hand-painted storybook game art, clean graphic silhouette, chibi proportions roughly 2.7 heads tall, clearly readable when reduced to 58 pixels tall. Soft warm rim light, dark tidy outlines, consistent warm pink and ivory palette and identical face, hair, clothes and proportions in every pose. Strict layout: exactly four columns by two rows, equally sized cells. No visible grid, no titles, no letters, no border. Every figure fully in its own cell, with transparent padding all around, no figures touching. Center figures around the same body axis in each cell. Same scale and angle across all frames. All face RIGHT in a clear side-scrolling three-quarter profile, shoes fully visible. In row 1 from left to right: 1 grounded idle, relaxed arms; 2 running with near foot forward and far foot back; 3 running with far foot forward and near foot back, opposite phase; 4 upward jump, arms raised and knees tucked. In row 2 from left to right: 5 falling in the air, arms gently out, legs lowered; 6 standing spell cast, rightward hand extended, other hand close to the body; 7 low forward dash, body leaning forward, hair streaming back; 8 recovery flinch, slight backward lean, palms raised. No weapons, no magic effects, no trails, no shadows on ground, no scenery, no props, genuine alpha transparent background. Wide landscape sprite atlas. Replace the photograph setting and pose entirely, preserve only the appearance cues.

使用内置 ImageGen 工具生成三张背景图，再转为 WebP 放入 `public/assets`。

**月影森林 · `moon.webp`**

> Use case: stylized-concept. Background plate for an exquisitely art-directed 2D indie side-scrolling platformer called Luma Trail. Wide 16:9 painterly storybook landscape, deep midnight indigo and electric violet, grainy hand-painted brush textures, with a huge softly luminous pale lavender moon in upper right framed by peach-lavender clouds. Layered purple alpine mountains, silhouettes of conifer trees along the left and right edges, magical deep valley and distant turquoise mist, tiny glowing fireflies and stars. Bottom edge full of dark navy grass silhouettes. Keep center-left relatively dark and spacious so cream menu lettering overlaid in HTML will read. Rich dramatic depth, soft moonlight, atmospheric perspective, limited palette, mature elegant indie game art. Fill frame, absolutely no words, no typography, no interface, no terrain platforms or characters.

**萤光洞窟 · `cavern.webp`**

> Use case: stylized-concept. Seamless background plate for a 2D platformer. Wide 16:9 atmospheric hand-painted indie storybook illustration with grainy brush texture, rich aerial perspective, distinct layers, high contrast between backdrop and silhouette edges. Important: landscape only, no words, no characters, no UI, no gameplay platforms. An underground bioluminescent cavern. Giant aquamarine crystal formations angle out from side edges, tiny glowing turquoise mushrooms and spores, deep navy upper caves with violet and emerald underground water and distant rock arches. A shaft of pale mint light descends from an opening at upper right, center-left dark and spacious. Foreground navy silhouettes. Painterly fantasy game art.

**破晓浮岛 · `dawn.webp`**

> Use case: stylized-concept. Seamless background plate for a 2D platformer. Wide 16:9 atmospheric hand-painted indie storybook illustration with grainy brush texture, rich aerial perspective, distinct layers, high contrast between backdrop and silhouette edges. Important: landscape only, no words, no characters, no UI, no gameplay platforms. An ethereal dawn high above the clouds. Floating distant rocky islets with slender evergreens and crumbling stone archways, sun rising at upper right behind a sea of coral clouds, deep indigo and pink plum hues with warm peach sunlight and tiny motes. Darker cool violet center-left for overlay text, fore-edge dusky cliffs. Painterly fantasy game art.

## 兑换卡配图

品牌选项与卡面使用品牌标识。导出时会将标识嵌入 PNG 或 SVG。

- 星巴克采用中国官网的 Siren 标识。[素材来源](https://www.starbucks.com.cn/)
- 霸王茶姬采用官网的红色花旦图标。[素材来源](https://www.chagee.com/favicon.ico)
- 卡旺卡采用招聘官网提供的中文字标。[素材来源](https://comewonka.zhiye.com/campus/jobs)

内置 ImageGen 生成的饮品示意图，保存于 `public/assets`。

**星巴克主题 · `drink-coffee.webp`**

> Use case: photorealistic-natural. Vertical 3:4 hero image for a small elegant digital drink voucher. Emerald and ivory studio palette, iced creamy matcha milk drink in a transparent tall takeaway cup, pale green swirls of milk, crisp ice, dark green straw, deep pine green backdrop. Center the full drink with room around all sides; beautiful soft studio lighting, fine condensation, warm highlights, editorial beverage photography, clean, premium and appetizing. Cup is completely unbranded, no logo, no letters or words, no people, no additional drinks. Full bleed background.

**霸王茶姬主题 · `drink-jasmine.webp`**

> Use case: photorealistic-natural. Vertical 3:4 hero image for a small elegant digital drink voucher. Warm ivory and ink burgundy palette, iced jasmine milk tea in a tall clear takeaway cup, pale beige tea, ivory foam and visible ice cubes, small delicate jasmine blooms by the base, warm claret studio backdrop. Center the full drink with room around all sides; beautiful soft studio lighting, fine condensation, warm highlights, editorial beverage photography, clean, premium and appetizing. Cup is completely unbranded, no logo, no letters or words, no people, no additional drinks. Full bleed background.

**卡旺卡主题 · `drink-pearl.webp`**

> Use case: photorealistic-natural. Vertical 3:4 hero image for a small elegant digital drink voucher. Caramel and apricot palette, rich brown sugar milk tea with swirls of syrup, clearly visible dark tapioca pearls, tall clear takeaway cup and creamy iced top, muted apricot studio backdrop. Center the full drink with room around all sides; beautiful soft studio lighting, fine condensation, warm highlights, editorial beverage photography, clean, premium and appetizing. Cup is completely unbranded, no logo, no letters or words, no people, no additional drinks. Full bleed background.
