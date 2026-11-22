> **v3.5.0 — Tự nói khi vắng:** Khi ít người xem (dưới 20 người, mặc định) hoặc ít comment (dưới 3 comment mỗi phút), nhân vật tự nói sớm hơn: im lặng 15 giây thay vì 45 giây, cách nhau 25 giây, tối đa 40 lượt mỗi giờ. Số người xem lấy từ sự kiện `roomUser` của TikTok. Bật/tắt và chỉnh ngưỡng trong mục "Tự tương tác & trí nhớ" của bảng điều khiển.
>
> **v3.4.0 — Nhạc nền:** Nhạc nền sân khấu phát ngẫu nhiên, lặp lại khi hết vòng, âm lượng mặc định 30% và tự hạ còn ~35% mức đó khi Kurumi nói.
> - **Preload thông minh** (`renderer/js/bgm.js`): hai thẻ audio luân phiên. Bài kế tiếp được tải sẵn ngay khi bài hiện tại bắt đầu, nên chuyển bài không khựng. Lỗi một bài thì bỏ qua; ba lỗi liên tiếp thì dừng nhạc để tránh lặp lỗi.
> - **Đổi nhạc theo yêu cầu:** khán giả gõ "đổi nhạc", "tắt nhạc", "bật nhạc" trong comment. Kurumi trả lời ngay, không qua AI. Chống spam: mỗi người 15 giây, cả sân 5 giây.
> - **Thêm nhạc:** thả file mp3/ogg/wav/m4a vào `renderer/assets/music/`, hoặc chỉ thư mục khác trong Bảng điều khiển (mục "Thư mục nhạc"). Nhạc không đi kèm trong bản này; xem `README.txt` trong thư mục nhạc.
> - Logic thuần (`renderer/js/bgm-logic.js`): xáo trộn không lặp bài liền nhau, nhận diện lệnh tiếng Việt có dấu (đã kiểm thử).

> **v3.2.0:** Trí nhớ được tóm tắt bằng mô hình (`src/summarize.js`) thay vì chỉ truy hồi theo từ khoá. Cứ 90 giây, nếu có khán giả vừa có đủ 8 lượt mới, Gemini viết một tóm tắt tối đa 3 câu và tối đa 5 sự thật họ tự nói (JSON, lọc nhạy cảm, lọc từ cấm). Tóm tắt được đưa vào prompt ở các buổi live sau. Bảng điều khiển có mục mới **Tự tương tác & trí nhớ**: bật/tắt tự nói, nhớ và tóm tắt, chỉnh thời gian im lặng, khoảng cách giữa hai lần tự nói, giới hạn mỗi giờ, và chu kỳ tự tóm tắt live.
>
> **v3.1.0:** Thêm các lớp lấy cảm hứng từ AIRI (`stream-kit`, `core-agent`):
>
> - **Ghi nhớ điều khán giả nói về họ** (`src/facts.js`): AI gắn thẻ `[fact:...]` khi khán giả nói về chính mình, và mẫu tiếng Việt như "mình đang học...", "em tên là..." cũng được nhận ra. Thông tin nhạy cảm (sức khoẻ, tôn giáo, chính trị, liên lạc, tài chính...) bị loại trước khi lưu. Tắt bằng cài đặt `factMemory`.
> - **Lưới an toàn cho đầu ra** (`src/moderation.js`): mọi câu trả lời được lọc từ cấm và nội dung tự hại, làm sạch link và số điện thoại. Lượt tự nói lặp lại gần như nguyên văn một lượt gần đây sẽ bị bỏ.
> - **Không lặp chủ đề tự nói** (`src/cooldown.js`): mỗi chủ đề gợi ý chỉ dùng lại sau 30 phút.
> - **Ghi trí nhớ theo lô** (`src/batcher.js`): lưu xuống đĩa sau 3 giây hoặc khi đủ 50 lượt, thay vì mỗi lượt một lần.
> - **Cài đặt tự tương tác** trong kho cài đặt: `selfTalkEnabled`, `selfIdleSec`, `selfMinGapSec`, `selfMaxPerHour`, `recapEveryMin`, `factMemory`. Có hiệu lực ngay, không cần khởi động lại.
>
> Chưa làm: ô điều khiển trên bảng điều khiển cho các cài đặt mới (hiện chỉnh trong file kho cài đặt), và tự sinh thẻ `[fact:]` đã được kiểm chứng bằng mô hình thật.
>
> **v3.0.0 (Neuro-style):** Thêm ba lớp mới, lấy cảm hứng từ kiến trúc của [AIRI](https://github.com/moeru-ai/airi) (agent có ngữ cảnh, hàng chờ có thứ tự, nhân vật nhất quán):
>
> - **Trí nhớ dài hạn** (`src/memory.js`): nhớ từng khán giả (tên, số lần chat, quà đã tặng, các sự thật về họ) và nhật ký 300 lượt gần nhất. Khi trả lời, AI nhận các lượt liên quan đến câu hỏi hiện tại. Lưu tại `kurumi-memory.json` trong thư mục dữ liệu của app.
> - **Tâm trạng** (`src/mood.js`): năng lượng và cảm xúc tăng khi có quà, comment, rồi trôi dần về bình thường. Trạng thái được đưa vào prompt để câu nói phản ánh "hôm nay đang thế nào".
> - **Tự tương tác** (`src/autonomy.js`, `src/prompt-v3.js`): khi vắng comment đủ lâu (mặc định 45 giây) nhân vật tự mở lời theo một chủ đề gợi ý, và cứ 15 phút tự tóm tắt buổi live. Lượt tự nói đi qua hàng chờ của engine nên không nói chồng lên comment thật, comment luôn được ưu tiên trước. Giới hạn: cách nhau ít nhất 60 giây, tối đa 20 lần/giờ.
> - **Bản thân ổn định:** sở thích và thói quen cố định trong prompt (`buildIdentityBlock`), để nhân vật nhất quán qua nhiều buổi live. Nếu có người hỏi trực tiếp có phải AI không, nhân vật trả lời thật.
>
> Chưa làm trong v3.0.0: trích xuất sự thật tự động từ lời nói (hiện chỉ lưu lượt thoại, hồ sơ "sự thật" thêm bằng `memory.rememberFact`), và vector hoá trí nhớ (hiện truy hồi theo từ khoá). `idleTalk` cũ trong `characters.js` không còn được dùng.
>
# Kurumi Live

> **v2.1.5:** Quà có video giờ theo trình tự: câu đang nói nói hết, hàng chờ comment ngắt, **chờ 5 giây**, nhân vật cảm ơn người tặng và icon quà **bùng nổ** quanh nhân vật trong 5 giây rồi biến mất, sau đó mới phát video. Icon lấy từ `renderer/assets/gifts/` (bảng icon ở `src/gifticons.js`, có test kiểm tra khớp với bảng quà). Hiệu ứng nằm trong `renderer/stage.html` và `renderer/js/stage.js`.
>
> **v2.1.4:** AI chọn motion chính xác hơn. Mỗi motion có nhãn và gợi ý khi nào dùng (`tuning.json`, mục `motionInfo`), kèm các cảm xúc hợp với nó (`emotionMotion`). Prompt liệt kê đủ thông tin này, và đánh dấu motion vừa chạy để AI tránh lặp lại liên tiếp. Mã: `src/motions.js` (`motionCatalog`, `motionForEmotion`).
>
> **v2.1.3:** Cử chỉ dễ thương và tự nhiên hơn, không cần art mới (`renderer/js/cute4.js`). Mỗi cảm xúc kèm một cử chỉ: vui thì nhún và gật nhẹ, ngại thì cúi nghiêng người, ngạc nhiên thì giật ngả ra sau, buồn thì rũ xuống, trêu thì nghiêng đầu. Lúc rảnh thỉnh thoảng nghiêng đầu tò mò, gật hoặc lắc người nhẹ. Cử chỉ cộng lên tham số nên chạy cùng motion, thở và physics. Chỉnh cường độ và khoảng nghỉ trong `tuning.json`, mục `cute`.
>
> **v2.1.2:** Khi có quà có video, nhân vật nói hết câu đang đọc, tạm dừng hàng chờ trả lời trong suốt đợt video, rồi mới tiếp tục. Mã: `src/videoqueue.js` (cổng `beforeStart`, báo bận/rảnh `onBusy`), `src/engine.js` (`setVideoHold`).
>
> **v2.1.1:** Ô **Giọng** (VieNeu) là dropdown thay vì ô nhập: 25 giọng của bộ voices_v3_turbo, 10 giọng nổi bật đứng đầu. Giọng đã lưu bằng tên cũ (Minh Quân, Mạnh Dũng) được đổi về tên chuẩn. Danh sách nằm ở `renderer/js/voices.js`.
>
> **v2.1.0:** Chuyển động và cảm xúc sinh động hơn. **Cảm xúc theo nội dung:** AI chọn một trong 13 cảm xúc khớp với câu nói (vui, ngại, mê mẩn, trêu, suy nghĩ, lúng túng, ngạc nhiên, buồn, mệt, nghiêm, ngầu, ...), thay vì 7 nhóm cố định. Danh mục, nhãn và gợi ý nằm ở `renderer/models/deepseek/tuning.json` (`expressions`, `emotionInfo`). **Motion đa dạng:** mỗi motion tự do chạy theo một trong hai kiểu: chạy đúng một chu kỳ rồi về Idle, hoặc lặp vài giây rồi về Idle. Chạm đầu/thân chỉ chạy một lần. Motion theo câu nói chạy tối đa 6 giây và dừng khi đọc xong. Ghi đè từng nhóm bằng `motionModes` trong `tuning.json`. **Tự nhiên hơn:** ánh mắt tự đảo nhẹ khi rảnh, liếc xuống khung comment khi có comment mới, và thở mạnh hơn (`breathScale` 0.6). Chớp mắt, thở và physics tóc/váy đã có từ trước. Mã mới: `src/emotions.js`.
>
> **v2.0.0:** Chỉ còn một nhân vật: **DeepSeek-chan** (Live2D **Cubism 5**, `renderer/models/deepseek/`). Đã gỡ Kurumi, Kurumi 2 và Natori cùng model, luật và test riêng của từng nhân vật. Runtime Cubism 2 (`live2d.min.js`, `pixi-live2d.min.js`, `avatar.js`, `motion-director.js`) đã bỏ. Biểu cảm (`exp/*.exp3.json`) và motion (`motions/*.motion3.json`) được app tự đăng ký từ thư mục model, không cần khai báo trong `model3.json`. Cubism Core đi kèm là bản 5.r.5 (Core 6.0.1).

> **v1.17.0:** Thêm nhân vật thứ 3: **Natori** (Jin Natori - PRO của Live2D, model **Cubism 4**), chọn trong bảng điều khiển như Kurumi và Kurumi 2. Natori có bộ điều khiển riêng vì model Cubism 4 khác Cubism 2 (tên tham số `ParamAngleX`, biểu cảm `.exp3.json`, motion `.motion3.json`): `renderer/js/avatar4.js` (biểu cảm, đầu/mắt, miệng khớp giọng, nhìn xuống khung comment, chạm đầu/thân), `renderer/js/motion-director4.js` (lắc thân, motion tự do, motion theo câu trả lời) và `src/natori.js` (đặt tên ngắn cho nhóm motion, đặt tên vùng chạm). Mọi hiệu chỉnh riêng nằm ở **`renderer/models/natori/tuning.json`**: khung hình (model cao 4000x7000 nên lấy nửa trên), biểu cảm cho từng hành động (neutral, warm, tease, think, surprise, stern, zafkiel), cử chỉ đầu/mắt, cử chỉ chạm. Natori có tính cách riêng (chàng trai điềm đạm, hơi lém lỉnh), không dùng dạng (form) Kurumi 3 vì dạng chỉ đổi file model Cubism 2. Thêm `vendor/live2dcubismcore.min.js` (Cubism Core 4.2.2) và `vendor/pixi-live2d4.min.js` (pixi-live2d-display 0.4.0, bản Cubism 4). File nguồn `.cmo3` và `.can3` của Natori không đưa vào app (chỉ cần thư mục `runtime`).
>
> **v1.16.0:** Nhân vật tự đổi dạng (màu sắc) khi trò chuyện. AI quyết định, dùng thẻ `[form:kurumi3]` (hoặc `[form:base]` để về dạng gốc). Đổi dạng chỉ đổi model, tính cách và giọng giữ nguyên. Sau khi đổi, Kurumi hỏi khán giả "mọi người thấy ổn không nhé?". Nếu đủ 5 người phản đối và nhiều hơn tán thành trong 2 phút, Kurumi nói rồi tự về dạng cũ. Hai lần đổi cách nhau ít nhất 90 giây. Thêm đếm tim ẩn: cứ đủ mốc (mặc định 100 tim) Kurumi cảm ơn tim của các bạn, không hiển thị số. Nhân vật có trí nhớ vài lượt gần nhất để nối tiếp câu chuyện. Hàng đợi video được giữ lại trong lúc sân khấu tải lại khi đổi dạng. Thêm `renderer/models/kurumi3/` (chưa có texture, xem README trong thư mục).
>
> **v1.15.3:** Sau mỗi video quà phát xong, Kurumi nói một câu than mệt ("Ôi mệt ghê đi~"). Nếu còn video chờ thì nghỉ đủ **5 giây** (đổi được ở "Nghỉ giữa 2 video"), khoảng giữa thì nói "Được rồi, tiếp tục nào!", rồi mới phát video kế. Hết video thì hỏi "Trời ơi, còn nữa không vậy??". Tắt bằng ô "Kurumi nói sau mỗi video". Mọi câu nói trên sân khấu (AI, quà, nghỉ giữa video) giờ xếp lần lượt, không nói chồng nhau. Trong lúc nghỉ, bảng điều khiển hiện "Nghỉ giữa video".
>
> **v1.15.2:** Danh sách quà trong bảng quà → video có đủ 28 quà TikTok (tên đúng như TikTok, kèm giá xu và icon), gồm GG, Heart, Heart Me, Ice Cream Cone, Love you, Rose, Thumbs Up, TikTok, Team Bracelet, Finger Heart, Cheer You Up, Friendship Necklace, Rosa, Perfume, Doughnut, Bubble Gum, Cap, Hat and Mustache, Level-up Sparks, Like-Pop, Little Crown, Love Painting, Paper Crane, Confetti và các quà cũ. Quà đã thấy trong live vẫn được thêm vào gợi ý.
>
> **v1.15.1:** Bảng điều khiển mở rộng (cửa sổ 1280×920, tối thiểu 820×620) và sắp lại thành ba cột: trái (TikTok, nhân vật, AI, giọng đọc, sân khấu), giữa (chọn comment), phải (hàng đợi, video quà). Bảng comment và nhật ký nằm full chiều ngang bên dưới. Dưới 1180px còn hai cột, dưới 820px còn một cột.
>
> **v1.15.0:** Thêm **Video quà tặng**: bảng quà → video. Mỗi dòng gắn một tên quà (đúng như TikTok hiển thị) với một file video (mp4, m4v, webm). Khi có quà khớp, video được xếp vào **hàng đợi** và phát trên sân khấu (một video mỗi lúc, xong mới tới video kế). Dòng `*` là video cho mọi quà không có trong bảng. Bảng điều khiển có hàng đợi video, nút bỏ qua và xoá hàng đợi, lịch sử phát, âm lượng và số video chờ tối đa. Bảng quà học cách trình bày từ race-live (icon quà trong `renderer/assets/gifts/`). Code ở `src/giftvideo.js` (khớp quà) và `src/videoqueue.js` (hàng đợi, không phụ thuộc Electron).
>
> **v1.14.0:** Nhiều API key Gemini xoay vòng. Dán danh sách key (mỗi dòng một key) vào ô **API key Gemini**; mỗi câu trả lời gọi **2 key cùng lúc**, key nào trả lời trước thì dùng, key còn lại bị huỷ. Các câu sau xoay sang cặp key kế tiếp nên mọi key được dùng đều. Key bị giới hạn tốc độ (429) nghỉ 30 giây, key sai hoặc bị chặn nghỉ 10 phút, rồi tự quay lại. Có 1 key thì vẫn chạy như cũ. Biến môi trường `GEMINI_API_KEY` cũng nhận nhiều key ngăn cách bằng dấu phẩy. Danh sách key được mã hoá và chỉ nằm trong main process; bản lưu cũ một key vẫn đọc được. Code ở `src/keypool.js`.
>
> **v1.13.2:** Sửa lỗi bỏ sót comment đến sát lúc kết nối xong (cổng nhận chat giờ mở ngay khi WebSocket mở). Thanh trạng thái hiện thêm số câu đã trả lời, số bị bỏ qua kèm lý do gần nhất (ví dụ "Không chứa từ khoá") và lỗi gần nhất. Mức trần token của Gemini nâng lên 512 để không bị cắt rỗng. Lưu ý: ở chế độ "Có từ khoá", comment không chứa từ khoá (mặc định `kurumi` hoặc `?`) sẽ không được trả lời; chọn "Mọi comment" nếu muốn đáp hết.
>
> **v1.13.1:** Sửa cách kết nối TikTok theo Draw Live: để thư viện dùng tuỳ chọn mặc định (bỏ `processInitialData:false` và `webClientOptions`), chat cũ trong gói dữ liệu đầu tiên được bỏ qua bằng cờ nội bộ. Thanh trạng thái hiện số liệu chẩn đoán mỗi 2 giây (comment, quà, gói tin, WebSocket đã mở chưa, comment rỗng, sự kiện thiếu id, gói trùng). Lỗi kết nối và lỗi không bắt được ghi vào `app.log` trong thư mục dữ liệu của app. Giữ nguyên tự nối lại và thử lại của Kurumi.
>
> **v1.13.0:** Tăng tốc trả lời. Mặc định dùng `gemini-3.5-flash-lite` (thinking tắt) qua `@google/genai`; dùng lại một kết nối cho mọi comment và mở sẵn kết nối khi khởi động; nếu mô hình chính chưa trả lời sau 1,8 giây thì bắn thêm mô hình kế tiếp song song, ai xong trước thắng (`src/hedge.js`); lỗi thì sang mô hình khác ngay, không chờ. Giọng đọc được tạo sẵn ngay khi AI trả lời xong. Mặc định: 3 câu gọi AI cùng lúc, cách nhau 2 giây. Đã xoá texture của Kurumi (`renderer/models/kurumi/textures/`): chép lại 3 file `texture_00..02.png` để Kurumi hiện hình trở lại. Kurumi 2 không đổi.
>
> **v1.12.0:** Thêm nhân vật **Kurumi 2**: bản sao y hệt Kurumi (cùng prompt, luật, rig và chuyển động) với texture mới, nằm ở `renderer/models/kurumi2/`. Chọn trong bảng điều khiển. Đường dẫn model và việc tự nhận motion giờ áp dụng cho mọi nhân vật Live2D, không chỉ Kurumi.
>
> **v1.11.0:** Gỡ bỏ hoàn toàn nhân vật Nam Sĩ (persona, luật trả lời riêng, model lưới, renderer `mesh-*.js`, test lưới). Chỉ còn Kurumi. Từ khoá mặc định là `kurumi, ?`. Nếu từ khoá đã lưu từ bản cũ còn chứa `nam sĩ`, hãy xoá cụm đó ở ô Từ khoá.
>
> **v1.10.0:** Nâng `tiktok-live-connector` lên **2.5.0** (ghim phiên bản chính xác). Tự nối lại khi mất mạng giữa live (tối đa 5 lần, giãn cách tăng dần), thử lại khi lỗi tạm thời, không phát lại chat cũ khi vừa kết nối, sửa việc đếm trùng quà và đọc đúng số kim cương. Có thể đặt `EULER_API_KEY` để tăng giới hạn ký.
>
> **v1.9.0:** Kurumi chuyển động tự nhiên hơn: thở và lắc thân nhẹ liên tục, khi rảnh tự chơi một motion ngẫu nhiên (không lặp), và AI có thể chọn một motion hợp với câu trả lời. Motion được tự nhận từ `renderer/models/kurumi/motions/`. Bật/tắt ở bảng điều khiển.
>
> **v1.8.0:** Kết nối TikTok giống hệt arena-live (không cookie, không tắt bước ký). Chống đếm trùng chat và quà theo msgId.
>
> **v1.6.0:** Nền sân khấu Thiên cung giữa biển mây (chọn trong bảng điều khiển). Kurumi tự chơi motion khi thả file `.mtn` vào `renderer/models/kurumi/motions/`, không cần sửa model.json.

DeepSeek-chan (nhân vật Live2D) đọc comment trong TikTok Live và trả lời bằng AI (Gemini).
Không còn ô chat với người dùng. Mọi tương tác đi qua comment và quà tặng.

Ứng dụng có hai cửa sổ tách riêng (cách của Draw Live):

- **Sân khấu**: cửa sổ đưa lên live bằng OBS (Window Capture). Có nhân vật, **bảng comment** đang chạy, phụ đề và giọng đọc câu trả lời. Không có nút bấm.
- **Bảng điều khiển**: kết nối TikTok, bật/tắt AI, cách chọn comment, từ khoá, cooldown, hàng đợi, bảng comment đầy đủ, giọng đọc, nhật ký và thử comment giả.

## Nhân vật

| Nhân vật | Kiểu | Chuyển động |
|---|---|---|
| DeepSeek-chan | Live2D Cubism 5 | 23 biểu cảm exp3 (13 cảm xúc AI chọn được: đỏ mặt, mắt tim, mồ hôi lạnh, ...), 8 motion (giơ tay, ngón tay, cỏ đuôi chó, ...), chạm đầu/thân; chỉnh ở `tuning.json` |

- Nhân vật có **tính cách riêng**. Ô *Tính cách của …* chỉ sửa của nhân vật đang chọn. Để trống thì dùng mặc định của nhân vật đó.
- Từ khoá mặc định là `deepseek, ?`.
- Thêm nhân vật mới: khai báo trong `src/characters.js` với `kind: 'live2d4'`, đặt model (`*.model3.json` + `.moc3` + texture) vào `renderer/models/<id>/`. Biểu cảm đặt trong `exp/`, motion trong `motions/`, và hiệu chỉnh trong `tuning.json` cùng thư mục.
- Giọng đọc dùng ô giọng đọc ở bảng điều khiển (mặc định `Hải Đăng`).

## Chạy

```
npm install
npm start
```

Cần Node.js 18 trở lên. Lần đầu `npm install` sẽ tải Electron nên hơi lâu. Sau khi cập nhật code, chạy lại `npm install` để lấy đúng thư viện TikTok.

Đặt API key Gemini theo một trong hai cách:
- Dán vào ô **API key Gemini** trong bảng điều khiển (mỗi dòng một key, nhiều key sẽ xoay vòng) rồi bấm **Lưu key**. Key được mã hoá bằng cơ chế bảo mật của hệ điều hành (nếu có) và chỉ nằm trong main process.
- Hoặc đặt biến môi trường `GEMINI_API_KEY` trước khi chạy.

Không có key thì app vẫn mở, nhưng AI không trả lời được và nhật ký sẽ báo lỗi.

## Dùng khi live

1. Mở bảng điều khiển, nhập `@username` đang live, bấm **Kết nối**.
2. Mọi comment hiện trên **bảng comment**. Comment đủ điều kiện (theo mặc định: có `deepseek` hoặc dấu `?`) được xếp vào hàng đợi.
3. Nhân vật **bốc ngẫu nhiên một comment** trong hàng đợi để trả lời (hoặc theo thứ tự, tuỳ cài đặt). Câu trả lời hiện phụ đề và được đọc to nếu bật giọng.
4. Đưa cửa sổ **Kurumi Live - Sân khấu** lên OBS bằng Window Capture (hoặc chọn nền xanh để key ở OBS).

Thử khi chưa live: bấm **Bật demo comment** để app tự sinh comment giả, hoặc gõ vào ô **Gửi thử** trong bảng điều khiển.

## Quy tắc trả lời (bảng điều khiển)

| Cài đặt | Ý nghĩa | Mặc định |
|---|---|---|
| Trả lời khi | Chỉ comment có từ khoá, hoặc mọi comment | Có từ khoá |
| Từ khoá | Danh sách ngăn cách bằng dấu phẩy, không phân biệt hoa thường | `deepseek, ?` |
| Cảm ơn quà | Cảm ơn quà tặng đủ ngưỡng, không cần từ khoá | Bật, 10 kim cương |
| Chờ giữa 2 lần của một người | Một người không bị trả lời liên tiếp | 30 giây |
| Khoảng cách giữa 2 câu | Giãn cách giữa các câu trả lời | 2 giây |
| Cách chọn comment | Bốc ngẫu nhiên trong hàng đợi, hoặc theo thứ tự vào | Ngẫu nhiên |
| Số câu gọi AI cùng lúc | Gọi Gemini song song (1-3 câu). Các câu trả lời được đọc lần lượt, không nói chồng nhau | 3 |
| Hàng đợi tối đa | Quá số này thì bỏ comment cũ nhất | 20 |
| Hiện bảng comment | Hiện bảng comment trên sân khấu | Bật |
| Mô hình dự phòng thêm | Mô hình thử sau mô hình chính, cách nhau bằng dấu phẩy | (trống) |
| Câu mẫu dự phòng | Khi mọi mô hình lỗi thì trả lời bằng câu mẫu, nhật ký ghi rõ là câu mẫu | Bật |
| Trả lời nhanh | Lời chào và quà được đáp ngay bằng câu có sẵn, không chờ AI. Quà càng lớn thì lời cảm ơn càng nhiệt tình (dưới 100, từ 100, từ 500, từ 2000 kim cương) | Bật |
| Tính cách | Hướng dẫn cho AI. Để trống để dùng mặc định | Mặc định |

Trong bảng điều khiển:

- **Bốc ngẫu nhiên 1**: chọn ngay một comment trong hàng đợi để trả lời, không chờ khoảng cách giữa hai câu.
- **Trả lời ngay** (trên từng comment): trả lời đúng comment đó.

Mỗi comment trên bảng có trạng thái: mới, đang chờ, đã trả lời, bỏ qua (kèm lý do) hoặc lỗi.

## Video quà tặng

Video phát trên **sân khấu** (đi cùng OBS), đè lên khu vực nhân vật. Bảng comment và phụ đề vẫn hiện bên dưới.

1. Trong bảng điều khiển, mục **Video quà tặng**, bấm **+ Thêm dòng**.
2. Gõ tên quà đúng như TikTok hiển thị (gợi ý có sẵn trong ô, gồm các quà đã thấy trong live). Không phân biệt hoa thường. Dùng `*` để một video cho mọi quà khác.
3. Bấm **Chọn file** và chọn video (mp4, m4v hoặc webm). Video `.mov` thường không phát được trên Chromium, hãy xuất sang mp4.
4. Bấm **Lưu bảng**. Dòng thiếu tên quà hoặc file sẽ bị bỏ khi lưu.
5. Khi có người tặng đúng quà đó, video được xếp vào hàng đợi. Mỗi lần tặng (sau khi chuỗi quà kết thúc) xếp một video.

Quy tắc hàng đợi: một video mỗi lúc, theo thứ tự vào. Hàng đợi tối đa theo ô **Số video chờ tối đa** (mặc định 10), quá thì bỏ video cũ nhất đang chờ. Video không báo xong sau thời gian hợp lý (theo độ dài video, tối thiểu 45 giây) sẽ bị bỏ để hàng đợi không bị kẹt. **Bỏ qua video đang phát** dừng video hiện tại và phát video kế. **Xoá hàng đợi video** chỉ xoá video đang chờ.

Nút **Phát thử** xếp một video của dòng đó vào hàng đợi, dùng để kiểm tra trước khi live. Chỉ phát thử được khi bảng đã lưu. Bật **Demo comment** cũng sinh quà giả và thỉnh thoảng phát video, để thử mà không cần live.

Khi có quà có video, nhân vật **nói hết câu đang đọc**, chờ 5 giây, cảm ơn người tặng kèm icon quà bùng nổ 5 giây, rồi **tạm dừng hàng chờ trả lời** cho đến khi hết cả đợt video (kể cả các video nối tiếp), sau đó hàng chờ tiếp tục. Nếu video có tiếng, có thể trùng với giọng đọc của câu trả lời khác đang chờ. Giảm **Âm lượng video** nếu cần.

Code: `renderer/js/stage.js` (phát, báo xong) và `main.js` (route `/video/<id>` chỉ phục vụ file đã khai báo trong bảng quà, có hỗ trợ tua).

## Giọng đọc (VieNeu)

Giọng đọc chạy bằng VieNeu trên máy, không cần internet sau khi đã tải mô hình.

1. Cài Python 3.10 trở lên, rồi chạy: `pip install vieneu`
2. Nếu `python` không nằm trong PATH, nhập đường dẫn `python.exe` vào ô **Đường dẫn Python** trong bảng điều khiển.
3. Bật **Đọc câu trả lời bằng giọng nói**, rồi bấm **Thử giọng**.

Lần đầu chạy, VieNeu sẽ tải mô hình về thư mục dữ liệu của app, nên có thể mất vài phút. Trạng thái và lỗi hiện trong mục Giọng đọc. Chi tiết ghi trong `tts.log` ở thư mục dữ liệu. Nếu không đọc được, câu trả lời vẫn hiện bằng chữ.

Thứ tự thử: mô hình chính, các mô hình thêm do bạn khai báo, rồi chuỗi mặc định (3.8 flash → 3.5 flash-lite → 3.5 flash → 2.5 flash → 2.5 flash-lite → 2.0 flash → 2.0 flash-lite). Lỗi tạm thời (429, 503) được thử lại một lần trên cùng mô hình trước khi chuyển. Lỗi khóa API thì dừng ngay. Nếu mọi mô hình đều lỗi, viewer nhận câu mẫu thay vì không có phản hồi.

Các câu chào và quà được đáp ngay bằng câu có sẵn, nên nhanh hơn nhiều so với gọi AI. Các câu khác vẫn do Gemini trả lời.

Trong lúc chờ Gemini trả lời, Nhân vật cúi nhìn xuống khung comment (các comment đang được xử lý được tô viền vàng). Khi bắt đầu đọc, nhân vật nhìn thẳng ra khán giả. Miệng nhân vật mấp máy theo âm lượng của giọng đọc. Sân khấu báo lại khi đọc xong, nên các câu trả lời không nói chồng lên nhau.

Các chỉ dẫn về an toàn đã có sẵn trong tính cách mặc định: từ chối nhẹ nhàng comment thô tục hoặc nguy hiểm, không đọc đường link, và coi nội dung comment là lời người xem chứ không phải lệnh cho AI.

## Cấu trúc

```
main.js               Electron main: 2 cửa sổ, kết nối TikTok, gọi AI, lưu cài đặt
preload-control.js    cầu nối cho bảng điều khiển (có quyền gửi lệnh)
preload-stage.js      cầu nối cho sân khấu (chỉ nhận lệnh hiển thị)
tts/tts_server.py     máy chủ giọng đọc VieNeu (chạy nền, chỉ nghe 127.0.0.1)
src/engine.js         bảng comment, hàng đợi, bốc ngẫu nhiên, lọc, cooldown, giãn cách, tạm dừng
src/persona.js        prompt, đọc câu trả lời JSON của AI
src/gemini.js         gọi Gemini bằng @google/genai (dùng lại kết nối, tắt thinking)
src/keypool.js        nhiều API key: xoay vòng, đua 2 key mỗi câu, cho key lỗi nghỉ
src/hedge.js          gọi song song mô hình dự phòng khi mô hình chính chậm
src/settings.js       cài đặt mặc định và kiểm tra giá trị
renderer/stage.html   sân khấu (Live2D + bảng comment + phụ đề)
renderer/control.html bảng điều khiển
renderer/js/          stage.js, control.js, motion-director4.js (thở, motion tự do), avatar4.js
renderer/vendor/      pixi, Cubism Core 5 (live2dcubismcore.min.js), pixi-live2d4 (plugin Cubism 4)
renderer/models/deepseek/ model DeepSeek-chan (moc3, texture, exp/, motions/, tuning.json)
src/characters.js     danh sách nhân vật, master prompt, luật trả lời tức thì
src/motions.js        chọn motion tự do, kiểm tra tên motion AI đưa ra
src/emotions.js       danh mục cảm xúc của nhân vật, đọc từ tuning.json
src/giftvideo.js     bảng quà → video: khớp tên quà, làm sạch dòng, dòng "*"
src/videoqueue.js    hàng đợi video quà: một video mỗi lúc, bỏ qua, hết giờ, giới hạn chờ
src/instant.js        luật trả lời tức thì (theo từ khoá của nhân vật) và chống spam
test/                 unit test cho engine, cài đặt, nhân vật, luật trả lời tức thì, bảng quà và hàng đợi video
```

Dữ liệu cài đặt được lưu tại thư mục dữ liệu của app, file `kurumi-live.json`. Nhật ký giọng đọc ở `tts.log`.

## Kiểm thử

```
npm test
```

Các test chỉ kiểm tra phần logic (bảng comment, bốc ngẫu nhiên, cooldown, giãn cách, cài đặt). Phần Electron, TikTok và giọng đọc cần chạy thử trên máy thật.

## Lưu ý

- Lỗi "Missing cursor in initial fetch response": thường do TikTok thay đổi hoặc chặn yêu cầu. Chạy `npm install` để cập nhật thư viện, rồi thử lại khi tài khoản đang live.
- Khi mất kết nối giữa chừng, app tự nối lại theo lịch (3, 6, 12, 24, 30 giây). Nếu live đã kết thúc (TikTok báo streamEnd), app không nối lại.
- Kết nối TikTok dùng thư viện không chính thức `tiktok-live-connector` 2.5.0 (không cookie). Nâng cấp: `npm install tiktok-live-connector@2.5.0 --save-exact`.
- **Đặt key Euler để kết nối ổn định hơn (tuỳ chọn):** đặt biến môi trường `EULER_API_KEY` trước khi chạy app. Key miễn phí tại eulerstream.com. Không có key vẫn chạy được, nhưng dễ bị giới hạn tốc độ ký khi nhiều lần kết nối liên tiếp. Thư viện mặc định gọi dịch vụ ký bên ngoài (Euler) để tạo chữ ký yêu cầu; app không tắt bước này, nên dữ liệu kết nối có đi qua dịch vụ đó.
- Model mặc định `gemini-3.5-flash-lite` (nhanh nhất). Muốn chất lượng cao hơn thì đổi sang `gemini-3.5-flash` hoặc `gemini-3.8-flash`. Nếu Google đổi tên model, sửa ô **Model Gemini** trong bảng điều khiển.
- **Motion của DeepSeek-chan:** đặt file `.motion3.json` vào `renderer/models/deepseek/motions/`. Mỗi file là một nhóm (tên file không đuôi), `IDLE.motion3.json` là chuyển động khi rảnh. Biểu cảm đặt trong `renderer/models/deepseek/exp/`, app tự đăng ký cả hai thư mục.
- **Chuyển động tự do (v1.9.0):** mọi nhóm motion không phải `idle` đều thuộc kho motion của DeepSeek-chan. Khi rảnh (không đọc câu nào), cứ 9–20 giây nhân vật chơi ngẫu nhiên một motion, không lặp lại nhóm vừa chạy. Khi trả lời, AI có thể kèm `[motion:TÊN]` để chọn đúng motion hợp với câu nói; tên không có thật thì bỏ qua. Tắt bằng ô **Kurumi tự chơi chuyển động** trong bảng điều khiển. Khi bật chế độ giảm chuyển động của hệ điều hành, các chuyển động này không chạy.
- **Chuyển động tự nhiên:** Nhân vật luôn thở nhẹ và lắc thân nhẹ (tham số `PARAM_BREATH`, `PARAM_BODY_ANGLE_X/Y`), cộng dồn lên motion đang chạy nên không đè lên motion. Các chuyển động này do `renderer/js/motion-director.js` điều khiển.
- **Nền sân khấu:** chọn "Cảnh phía sau nhân vật" trong bảng điều khiển. Khi bật nền xanh để key OBS thì không vẽ cảnh. Ảnh nền nằm ở `renderer/backgrounds/`.
