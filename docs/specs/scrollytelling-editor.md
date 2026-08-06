# Spec: scrollytelling — `edit`, trình soạn cục bộ có dải khả năng đọc

Trạng thái: chờ đưa lên issue tracker (`ready-for-agent`)
Nguồn: brainstorm 2026-08-06 (hướng A) · nối tiếp
[Phase B mốc 1](scrollytelling-phase-b.md) · [Phase A](scrollytelling-phase-a.md)

---

## Vấn đề

Người dùng mà tài liệu này nói tới **không viết code**. Họ là designer hoặc người làm
marketing, và họ chạm vào công cụ này qua một coding agent. Đối thủ thật của họ không phải
GSAP hay scrollama — đó là Webflow và Framer.

Với người đó, luồng hôm nay gãy ở một chỗ rất cụ thể: **mọi thay đổi, dù nhỏ đến đâu, đều
phải đi qua một agent.** Sửa một chữ trong tiêu đề, dịch một beat sớm hơn một chút, đổi thứ
tự hai câu — tất cả đều là "mở session mới, mô tả điều muốn sửa bằng tiếng Anh, chờ, rồi
xem kết quả". Webflow cho họ một canvas: bấm vào chữ, gõ, thấy ngay.

Nặng hơn cả sự bất tiện là **vòng phản hồi bị đứt**. Công cụ này đã đo luma từng khung hình
theo lưới 6×4 và ghi vào contract. `frames --check` biết beat nào sẽ không đọc được và gợi
ý dịch `at` sang đâu. Nhưng kết quả đó là một đoạn văn trong terminal, gửi tới một người
không mở terminal. Thứ giá trị nhất mà Phase A tạo ra không bao giờ tới được tay người cần
nó nhất.

Và đây chính là chỗ Webflow không thể theo: với họ video là một hộp đen, họ **không đo gì
cả**, nên họ vĩnh viễn không nói được câu *"chữ này ở khung 30 sẽ không đọc được, khung 34
thì được"*. Ta nói được câu đó từ Phase A. Ta chỉ chưa vẽ nó ra.

## Giải pháp

Một lệnh mới: `scrollytelling edit <project_dir>`. Nó mở một trang trên `localhost` gồm
ba phần:

1. **Bản xem trước thật.** Không phải mô phỏng: trang mount đúng `lib/scroll-engine.mjs`
   mà `scaffold` copy vào dự án, đọc frames từ `public/` của dự án. Cuộn trong khung xem
   trước cho ra đúng thứ sẽ lên production. Người dùng **không cần chạy `npm run dev`**,
   không cần cài dependency của dự án, không cần biết dự án viết bằng framework nào.
2. **Một timeline kéo thả.** Mỗi beat là một chốt trên trục scroll 0→1. Kéo chốt là đổi
   `at`. Chọn một beat thì sửa `heading`, `body`, `align`, `anchor` ngay tại chỗ.
3. **Dải khả năng đọc dưới timeline.** Xanh là vùng đặt chữ đọc được, đỏ là không, tính từ
   lưới luma đã đo. Dải này đổi theo `align` và `anchor` của beat đang chọn, vì vùng chữ
   chiếm đổi thì nền phía sau cũng đổi. Kéo một beat vào vùng đỏ, nó đỏ ngay lập tức, trước
   khi người dùng kịp gõ một chữ nào.

Bấm lưu thì ghi ngược ra `story.js` của dự án — đúng file mà agent và `--check` vẫn đọc.
Không tài khoản, không API key, không mạng.

Điểm đáng chú ý về mặt cạnh tranh: dải khả năng đọc **không phải một tính năng thêm vào**.
Nó là thứ Phase A đã tính xong và đang vứt đi, được vẽ ra lần đầu tiên.

## User Stories

1. Là designer, tôi muốn mở một trang chỉnh sửa bằng một lệnh duy nhất, để tôi không phải
   cài gì thêm hay hiểu cấu trúc dự án.
2. Là designer, tôi muốn lệnh đó tự mở trình duyệt, để tôi không phải copy một URL từ
   terminal.
3. Là designer, tôi muốn thấy bản xem trước cuộn được, để tôi đánh giá nhịp kể chuyện chứ
   không chỉ đọc một danh sách.
4. Là designer, tôi muốn bản xem trước dùng đúng engine sẽ ship, để thứ tôi duyệt là thứ
   khách hàng sẽ thấy.
5. Là designer, tôi muốn sửa `heading` và `body` bằng cách gõ trực tiếp, để đổi một chữ mất
   vài giây chứ không phải một session với agent.
6. Là designer, tôi muốn kéo một beat dọc trục scroll, để đặt nó vào đúng khoảnh khắc của
   tư liệu thay vì dò số `at`.
7. Là designer, tôi muốn thấy vị trí `at` bằng số khi đang kéo, để tôi lặp lại được giá trị
   đó nếu cần.
8. Là designer, tôi muốn đổi `align` giữa trái/giữa/phải bằng một cú bấm, để thử bố cục
   không cần biết cú pháp.
9. Là designer, tôi muốn bật `anchor: "bottom"` bằng một cú bấm, vì đó thường là cách sửa
   nhanh nhất một beat khó đọc.
10. Là designer, tôi muốn thêm một beat mới, để mở rộng câu chuyện mà không mở file.
11. Là designer, tôi muốn xoá một beat, để cắt bớt khi câu chuyện dài quá.
12. Là designer, tôi muốn sửa `brand`, `title` và `description` của trang, vì đó là những
    thứ tôi đổi thường xuyên nhất sau copy.
13. Là designer, tôi muốn một dải màu dưới timeline nói cho tôi biết chỗ nào đặt chữ đọc
    được, để tôi chọn vị trí bằng mắt thay vì thử rồi sai.
14. Là designer, tôi muốn dải đó đổi khi tôi đổi `align`, vì chữ bên trái và chữ bên phải
    nằm trên hai vùng nền khác nhau.
15. Là designer, tôi muốn dải đó đổi khi tôi bật `anchor: "bottom"`, vì khối chữ chuyển
    xuống nửa dưới khung hình.
16. Là designer, tôi muốn beat đang vi phạm được đánh dấu rõ ràng, để tôi không lưu nhầm
    một trang có chữ không đọc được.
17. Là designer, tôi muốn công cụ nói vị trí thay thế gần nhất khi beat của tôi vi phạm, để
    tôi biết kéo về đâu.
18. Là designer có cả bản ngang lẫn bản dọc, tôi muốn dải khả năng đọc phản ánh **cả hai**,
    vì một beat chỉ có một `at`.
19. Là designer, khi hai sequence mâu thuẫn, tôi muốn biết sequence nào đang chặn, để tôi
    biết vấn đề nằm ở bản điện thoại chứ không phải ở copy.
20. Là designer, tôi muốn xem trước ở khổ dọc, để kiểm tra trang trên điện thoại mà không
    cần điện thoại.
21. Là designer, tôi muốn bấm lưu và thấy xác nhận rõ ràng, để tôi tin là việc đã xong.
22. Là designer, tôi muốn công cụ cảnh báo khi tôi đóng tab lúc còn thay đổi chưa lưu, để
    tôi không mất việc.
23. Là designer, tôi muốn thứ được lưu là một file dự án bình thường, để dev trong nhóm tôi
    mở ra vẫn hiểu.
24. Là người viết nội dung, tôi muốn công cụ chạy được khi dự án chưa có frames, để tôi
    viết copy nháp trước khi tư liệu về.
25. Là người viết nội dung, tôi muốn được nói rõ rằng chưa có frames chứ không thấy một
    khung đen im lặng.
26. Là dev, tôi muốn `edit` chạy trên dự án của **mọi** template — Next, Astro, Nuxt, HTML —
    vì tôi không muốn chọn template theo việc công cụ nào hỗ trợ nó.
27. Là dev, tôi muốn `edit` tự nhận ra template từ bản ghi dự án, để tôi không phải truyền
    cờ.
28. Là dev, tôi muốn ghi đè template bằng cờ khi bản ghi sai, vì mất khả năng nói điều đó
    tệ hơn là phải lặp lại nó.
29. Là dev, tôi muốn `edit` chỉ nghe trên loopback, để không ai trong cùng mạng wifi mở
    được dự án của tôi.
30. Là dev, tôi muốn chọn cổng, để chạy được khi cổng mặc định đang bận.
31. Là dev, tôi muốn tắt việc tự mở trình duyệt, để dùng được trong môi trường không có
    trình duyệt.
32. Là dev, tôi muốn server chỉ phục vụ file bên trong thư mục dự án và thư mục runtime của
    công cụ, để một đường dẫn bịa ra không đọc được `~/.ssh`.
33. Là dev, tôi muốn `edit` không ghi gì cho tới khi tôi bấm lưu, để mở nó ra xem là việc
    an toàn.
34. Là dev, tôi muốn lần ghi giữ nguyên mọi thứ ngoài phần story trong file — comment đầu
    file, chú thích kiểu — để diff nhỏ và review được.
35. Là dev, tôi muốn lần ghi là nguyên tử, để một lần Ctrl-C đúng lúc không để lại file
    cụt.
36. Là dev, tôi muốn `edit` từ chối chạy nếu `story.js` không đọc được, kèm lý do, chứ
    không mở một editor rỗng rồi ghi đè việc của tôi.
37. Là dev, tôi muốn dải khả năng đọc trong editor và `frames --check` trong terminal cho
    **cùng một kết luận**, vì hai nguồn sự thật mâu thuẫn thì cả hai đều vô dụng.
38. Là dev đã sửa file bằng tay trong lúc editor đang mở, tôi muốn được cảnh báo thay vì bị
    ghi đè im lặng.
39. Là agent, tôi muốn mở editor thay cho người dùng rồi đưa họ URL, để bàn giao phần cần
    mắt người cho mắt người.
40. Là agent, tôi muốn biết editor đã lưu gì, để phiên làm việc sau của tôi đọc đúng trạng
    thái.
41. Là người bảo trì, tôi muốn logic tuần tự hoá story nằm trong `lib/` và test được bằng
    chuỗi thuần, chứ không nằm kín sau một HTTP server.
42. Là người bảo trì, tôi muốn logic khả năng đọc nằm trong `lib/` và được cả `--check` lẫn
    editor dùng chung, để một lần sửa lợi cho cả hai.
43. Là người bảo trì, tôi muốn editor **không** có bản sao engine riêng, vì hai bản sẽ trôi
    xa nhau và bản xem trước sẽ nói dối.
44. Là người bảo trì, tôi muốn bộ test vẫn chạy offline trong khoảng một giây, không cần
    trình duyệt.
45. Là người bảo trì, tôi muốn dung lượng gói npm không phình vì editor, vì nó nằm trong
    cùng một package người ta `npx`.
46. Là người dùng dự án cũ, tôi muốn `edit` chạy được trên dự án sinh từ bản trước mà không
    phải scaffold lại.

## Quyết định triển khai

### 1. Phạm vi ghi: chỉ `story.js`, không đụng gì khác

Editor đọc và ghi đúng một file của dự án: file story mà `template-manifest` khai báo. Nó
sửa được `brand`, `title`, `description` và toàn bộ danh sách `sections`.

Màu, font, spacing nằm trong CSS của template và **ngoài phạm vi bản này**. Lý do không
phải là chúng không đáng giá — người dùng đã nêu "kết quả không giống brand" như một điểm
tắc thật. Lý do là mỗi file ghi thêm là một parser thêm, một cách hỏng thêm, một seam thêm.
Một file ghi, một parser đã có sẵn, một seam. Brand tokens là bản kế tiếp.

`frames.js` là contract sinh ra và editor **không bao giờ ghi vào đó**, đúng theo bất biến
đã có của repo.

### 2. Bản xem trước mount engine gốc, không dựng lại

`lib/scroll-engine.mjs` đã framework-free với một điểm vào `mount(container, options)`, và
`scaffold` copy chính file đó vào mọi dự án. Editor phục vụ **file gốc trong `lib/` của
công cụ**, không phải bản sao trong dự án và không phải bản sao thứ ba.

Ba hệ quả, tất cả đều là lý do chọn phương án này:

- Bản xem trước là trang thật, không phải mô phỏng — cùng `scroll-math`, cùng scrim, cùng
  cửa sổ giải mã.
- Không có bản sao nào để trôi. Bất biến "một cơ chế cuộn, một chỗ sửa" giữ nguyên.
- Người dùng không cần cài dependency của dự án hay chạy dev server. Với người không viết
  code, đó là khác biệt giữa "chạy được" và "không".

Contract `frames.js` của dự án và thư mục `public/frames/` được phục vụ y nguyên. Template
nào cũng dùng chung hai thứ đó, nên editor chạy trên cả bốn template mà không có nhánh
riêng cho template nào.

### 3. Một module thuần mới để **ghi** story

Repo hôm nay có chiều đọc: `parseStory`, `parseBeats`, `parseSequences` khớp ngoặc rồi
đánh giá đúng literal đó. Chiều ghi chưa tồn tại.

Module mới nhận `(source, story)` và trả về source mới. Nó định vị literal `story` bằng
**đúng cách khớp ngoặc mà chiều đọc dùng**, thay riêng literal đó, và giữ nguyên từng
byte bên ngoài — comment đầu file, chú thích `@type`, import. Thuần: không fs, không
console, không exit.

Bất biến bắt buộc, và là thứ test phải chứng minh: **round-trip.** Đọc rồi ghi lại một
story không đổi phải cho ra một file mà đọc lại được đúng story đó. Việc định dạng số
`at` cố định ở hai chữ số thập phân, để một lần kéo chuột không tạo ra `0.30000000000000004`
trong diff của người dùng.

### 4. Cụm khả năng đọc chuyển sang `lib/`, và Phase B mục 1 được kéo lên trước

Đây là quyết định quan trọng nhất của bản này.

`suggestFixes`, `HARD_TO_READ_LUMA`, `SUGGESTION_RADIUS` hiện là private trong
`scripts/frames.mjs` và trả về **câu tiếng Anh**. Chúng chuyển sang `lib/`, trả về dữ liệu
có cấu trúc, và việc định dạng ở lại với lệnh. Đây đúng là mục 2 của
[Phase B mốc 1](scrollytelling-phase-b.md), không đổi.

Cùng với nó, mục 1 của Phase B — sửa hình học `beatLuma` cho khớp `scrimOpacity` — **phải
làm trước**, không phải "nên". Hôm nay hai chỗ bất đồng: `beatLuma` dùng cột cứng theo
bucket trải toàn bộ 4 hàng và không nhận `rect`, còn `scrimOpacity` dùng dải phân số theo
`HORIZONTAL_BANDS`, giới hạn hàng, và giao với vùng nhìn thấy. Với một công cụ chỉ *cảnh
báo*, sai số đó chấp nhận được. Với một **dải màu vẽ ra trước mắt người dùng**, nó thành
lời nói dối có đồ hoạ: dải bảo xanh, trang ra xấu, người dùng mất tin vào công cụ và không
có cách nào biết tại sao. Kéo mục này lên trước là điều kiện cần để bản này có nghĩa.

Thêm vào cụm đó một hàm mới trả về **dải khả năng đọc**: cho một sequence và hình dạng một
beat (`align`, `anchor`), trả về luma tại N vị trí `at` đều nhau trên trục scroll. Editor
vẽ mảng đó. `--check` không cần nó, nhưng cả hai cùng gọi `beatLuma` đã sửa, nên hai bên
không thể bất đồng — đó là ý nghĩa của user story 37.

Khi có nhiều sequence, dải hiển thị là **giao của các sequence**: một vị trí chỉ xanh khi
nó đọc được trên mọi sequence, vì một beat chỉ có một `at`. Khi một vị trí bị chặn, dữ liệu
trả về nói sequence nào chặn, để giao diện chỉ đích danh thay vì chỉ tô đỏ.

### 5. Lệnh mới, dispatch không đổi hình

`lib/cli-args.mjs` thêm một entry `edit` với một positional (thư mục dự án) và các cờ:
cổng, tắt tự mở trình duyệt, ghi đè template. `bin/cli.mjs` thêm một nhánh import động,
giống hệt `frames` và `scaffold`. Không cấu trúc nào đổi.

`scripts/edit.mjs` giữ toàn bộ phần IO: `node:http`, đọc file, ghi file, mở trình duyệt.
Việc mở trình duyệt qua `execFile` với mảng đối số, không `shell: true` — bất biến của repo
áp dụng, và ở đây đường dẫn của người dùng thực sự chạm tới lệnh đó.

### 6. Hợp đồng HTTP

Bề mặt cố tình nhỏ:

- `GET /api/project` — trả về story đã đọc, các sequence từ contract, dải khả năng đọc, tên
  template, và một **thẻ phiên bản** của file story (hàm băm nội dung lúc đọc).
- `PUT /api/story` — nhận story mới kèm thẻ phiên bản đã đọc. Nếu file trên đĩa đã đổi so
  với thẻ đó, trả về xung đột và **không ghi** (user story 38). Ghi thành công trả về thẻ
  mới.
- Tĩnh: `lib/` của công cụ, `frames.js` và `public/frames/` của dự án, và tài nguyên của
  chính editor.

Server chỉ bind loopback. Mọi đường dẫn tĩnh giải ra đường dẫn tuyệt đối và phải nằm trong
một trong các thư mục gốc đã khai báo; ngoài ra là 404. Không có endpoint nào nhận đường
dẫn tuỳ ý từ client.

### 7. Tài nguyên editor: không build step

Giao diện editor là HTML + JS thuần, module ES, không bundler, không framework, không
dependency mới trong `package.json`. Template `html` đã chứng minh engine chạy được như
vậy. Lý do vượt ra ngoài sở thích: bất kỳ build step nào cũng là thứ phải chạy trước khi
publish npm, và là một cách để gói đã publish khác với cây nguồn.

Tài nguyên nằm ở thư mục riêng của công cụ, **không phải trong `templates/`** — nó không
bao giờ được scaffold vào dự án người dùng. Nó vào `files` của `package.json`.

### 8. Trạng thái thiếu được nói ra, không im lặng

Ba trạng thái thiếu, mỗi cái một câu riêng, không cái nào là màn hình trống:

- Contract chưa có sequence → editor mở bình thường, sửa copy được, khung xem trước nói rõ
  chưa có frames và nêu lệnh cần chạy. Dải khả năng đọc vắng mặt kèm lý do, chứ không hiện
  toàn xanh (user story 24, 25).
- Không có file story → dừng, kèm hướng dẫn scaffold. Không tạo file mới.
- File story không đọc được → dừng, kèm lỗi parser. Không mở editor rỗng, vì lần lưu đầu
  tiên sẽ xoá việc của người dùng (user story 36).

Bất biến "không lỗi nào được phép im lặng" áp dụng nguyên vẹn.

## Quyết định kiểm thử

Một test tốt ở repo này chỉ chạm hành vi bên ngoài: một hàm thuần được cho đầu vào và bị
kiểm tra đầu ra, hoặc CLI được chạy như một tiến trình con và bị kiểm tra qua stdout, mã
thoát, và file để lại trên đĩa. Không test nào được biết một hàm private tồn tại.

**Module ghi story — unit, thuần chuỗi.** Round-trip là bài chính: mọi story đọc được, ghi
lại rồi đọc lại, phải bằng chính nó. Kèm: nội dung ngoài literal `story` không đổi một
byte; copy chứa dấu nháy, ký tự Unicode và xuống dòng sống sót; `at` được định dạng ổn
định; danh sách rỗng và một beat duy nhất đều hợp lệ. Prior art: `tests/report.test.js` cho
chiều đọc, `tests/scroll-math.test.js` cho kiểu test hàm thuần.

**Cụm khả năng đọc — unit, thuần số.** Sau khi `beatLuma` đổi hình học, kiểm tra rằng nó
đồng ý với `scrimOpacity` trên cùng một khung: cùng dải phân số, cùng giới hạn hàng, cùng
nhánh riêng cho `anchor: "bottom"`. Đây là bài test *tồn tại vì* mục 4, và là bài quan
trọng nhất trong bản này. Kèm: dải trả về đúng độ dài yêu cầu; đổi `align` đổi dải; giao
của nhiều sequence không bao giờ rộng hơn sequence chặt nhất; sequence rỗng trả về dải
vắng chứ không phải dải toàn xanh. Prior art: `tests/beat-check.test.js`, `tests/scrim.test.js`,
`tests/report.test.js`.

**Phân tích đối số — unit.** Lệnh mới, các cờ của nó, và các lỗi dùng sai. Prior art:
`tests/cli-args.test.js`, không có gì mới về hình thức.

**Lệnh `edit` — subprocess, ở tầng HTTP.** Dựng một dự án tạm, chạy lệnh với cổng 0 và tắt
tự mở trình duyệt, đọc cổng thật từ stdout, rồi: `GET /api/project` trả đúng story trên
đĩa; `PUT` với thẻ phiên bản đúng ghi được và file đọc lại ra story mới; `PUT` với thẻ cũ
bị từ chối và **file không đổi**; đường dẫn tĩnh vượt ra ngoài thư mục gốc trả 404; mở trên
dự án không có file story thoát khác 0 kèm câu giải thích. Prior art: `tests/cli.test.js`
cho việc chạy tiến trình con, `tests/scaffold.test.js` cho việc dựng dự án tạm và khẳng
định về file.

**Cả bốn template — hợp đồng, không nhân bản.** Một test duyệt `template-manifest` và
khẳng định `edit` giải đúng đường dẫn story và contract cho mọi template. Prior art:
`tests/template-manifest.test.js`. Không viết bốn bộ test song song.

**Giao diện trình duyệt — không nằm trong `node:test`.** Cùng lý do `lib/scroll-engine.mjs`
không có: nó cần một trình duyệt thật. Verify qua skill `/browse` theo quy ước repo — mở
editor trên dự án mẫu, kéo một beat vào vùng đỏ và xác nhận nó đỏ, lưu và xác nhận file
trên đĩa đổi. Nếu về sau cần cổng chặn tự động, chỗ của nó là `ci/`, không phải `npm test`.

Bộ test vẫn phải chạy offline trong khoảng một giây. Không test nào được tải frames thật
hay gọi ffmpeg.

## Ngoài phạm vi

- **Brand tokens** — màu, font, spacing. Là điểm tắc thật của người dùng và là bản kế tiếp,
  nhưng nó cần ghi vào CSS, tức một parser thứ hai và một seam thứ hai. Mục 1 giải thích lý
  do tách.
- **Sinh tư liệu.** Editor không tạo video, không gọi API sinh ảnh, không cần khoá. Lời hứa
  "no accounts, no API keys" của repo không suy chuyển.
- **Deploy.** `scrollytelling deploy` là việc đáng làm và rẻ, nhưng nó là table stakes chứ
  không phải lợi thế, và nó không chia sẻ seam nào với bản này.
- **Chèn vào dự án đang có** (`add`). Người dùng mục tiêu của bản này không có dự án sẵn.
- **Sửa nhiều người cùng lúc, lịch sử phiên bản, undo xuyên phiên.** Đây là một công cụ cục
  bộ một người dùng. Undo trong phiên là việc của trình duyệt.
- **Bộ giải đầy đủ của Phase B** — xếp hạng nhiều phương án, `--json`, `--strict`, quét
  `align`. Bản này chỉ kéo lên phần hạ tầng nó dùng: sửa hình học, và cụm khả năng đọc
  chuyển vào `lib/`. Phần còn lại của Phase B vẫn đứng nguyên và sẽ dùng lại chính module
  đó.
- **Sinh frames từ trong editor.** Nếu dự án chưa có frames, editor nói ra lệnh cần chạy;
  nó không chạy hộ.

## Ghi chú thêm

**Vì sao bản này đáng làm trước các điểm tắc khác.** Người dùng nêu bốn điểm tắc: không có
video, không biết deploy, sửa một chữ phải gọi agent, kết quả không giống brand. Ba trong
bốn cái đó Webflow và Framer đã làm tốt hơn — làm chúng là để không thua, không phải để
thắng. Chỉ có cái thứ ba đứng trên thứ đối thủ không có: một bản ghi luma theo từng khung
hình. Đây là hướng duy nhất mà công sức bỏ ra *cộng dồn* lên Phase A và Phase B thay vì
chạy song song với chúng.

**Quan hệ với Phase B.** Bản này không thay thế Phase B; nó lấy trước hai quyết định hạ
tầng của Phase B (sửa hình học `beatLuma`, chuyển cụm khả năng đọc vào `lib/`) vì không có
chúng thì dải màu sai một cách vô hình. Sau bản này, phần còn lại của Phase B — xếp hạng,
`--json`, `--strict` — nhỏ đi và có thêm một mặt hiển thị sẵn có.

**Rủi ro lớn nhất.** Đây là phần giao diện lớn nhất repo từng có, trong một repo mà bất
biến then chốt là "`lib/` thuần, không DOM". Ranh giới phải được giữ theo đúng cách
`scroll-engine` giữ nó hôm nay: mọi quyết định nằm ở module thuần, phần còn lại chỉ là dây
nối. Nếu thấy mình viết số học trong tài nguyên editor, chỗ của nó là `lib/`.

**Rủi ro thứ hai.** Dung lượng gói. Editor không được kéo theo dependency nào. Ràng buộc
"HTML + JS thuần, không build step" ở mục 7 tồn tại vì lý do đó cũng nhiều như vì sự gọn
gàng.
