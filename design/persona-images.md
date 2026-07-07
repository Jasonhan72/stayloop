# Persona 分镜图像清单 · /public/personas/

角色页「真实场景」区的三幕分镜故事条已上线，图像槽位指向 `/public/personas/<文件名>`。
文件不存在时自动回退到 Unsplash 占位图 —— **把生成好的图按下面的文件名放进
`public/personas/` 目录再部署，即自动替换，无需改代码。**

人物设定 canon（与设定卡一致）：
- **Mia Chen** — 27 岁女性,软件工程师,新移民。米色风衣 + 白 T + 牛仔裤,棕色单肩包,中长发。气质:hopeful / capable。暖米色调。
- **Sarah Wang** — 41 岁女性,会计师。深蓝西装 + 白 V 领衬衫,金色耳环项链,齐肩短发。气质:composed / decisive。深蓝色调。
- **David Park** — 35 岁男性,持牌经纪。深蓝夹克 + 白 T。气质:professional / warm。绿色点缀。

建议统一参数:横构图 7:5(约 1400×1000),真实摄影感,浅景深,多伦多背景(CN Tower 可隐约出现)。

## 租客 · Mia（暖米色调,倾向自然暖光）

| 文件名 | 生成提示词 |
|---|---|
| `mia-01-anxious.jpg` | Night interior, young Asian woman (Mia, 27, beige trench coat aside, casual tee) sitting on the floor of an old apartment surrounded by moving boxes and papers, holding a rental application form, worried expression, warm dim lamp light, cinematic realistic photo |
| `mia-02-luna.jpg` | Cozy Toronto coffee shop, same woman smiling softly at her phone, warm daylight, a subtle glowing chat bubble aesthetic, hopeful mood, shallow depth of field, realistic photo |
| `mia-03-home.jpg` | Bright new condo living room at dusk, same woman relaxed on a sofa with a mug, city lights of Toronto outside the window, content and settled mood, warm tones, realistic photo |

## 房东 · Sarah（深蓝冷静色调）

| 文件名 | 生成提示词 |
|---|---|
| `sarah-01-vacancy.jpg` | Night interior, professional Asian woman in her 40s (navy blazer, short shoulder-length hair) looking at her phone with a concerned, thoughtful expression, dark condo interior, city bokeh behind, cool tones, realistic photo |
| `sarah-02-logic.jpg` | Same woman at a desk reviewing a laptop screen, composed and analytical, modern condo office, evening light, navy palette, realistic photo |
| `sarah-03-decide.jpg` | Morning balcony, same woman with a coffee mug, calm confident smile, Toronto skyline with CN Tower behind, sunlight, relaxed authority, realistic photo |

## 经纪 · David（绿色点缀,专业利落）

| 文件名 | 生成提示词 |
|---|---|
| `david-01-task.jpg` | Asian man in his 30s (navy jacket, white tee) seated in a parked car checking his phone, daylight, Toronto street outside, professional and efficient mood, realistic photo |
| `david-02-showing.jpg` | Same man showing a bright modern condo to a client, gesturing toward the space, tablet in hand, wide interior with Toronto skyline through windows, natural light, realistic photo |
| `david-03-payout.jpg` | Golden hour waterfront, same man standing confidently with his phone, CN Tower and skyline behind, warm sunset light, hero-shot composition, realistic photo |

## 后续可选扩展槽位（暂未接线,生成后告诉 Claude 接入）

- 首页 03 区角色卡人像:`mia-portrait.jpg` / `sarah-portrait.jpg` / `david-portrait.jpg`(方形 1:1,设定卡 Front 机位)
- 房源详情页「让 Luna 替我问」侧栏配图
