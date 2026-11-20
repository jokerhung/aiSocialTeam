# Phase 8 — Giao diện web hỗ trợ tiếng Việt (chọn ngôn ngữ ở nút Language trên nút Settings của sidebar)

**Mục tiêu:** web dashboard (`web/`) hiển thị được bằng **English** và **Tiếng Việt**. Người dùng đổi ngôn ngữ ngay ở **nút Settings cuối sidebar**; lựa chọn được nhớ và áp dụng cho mọi trang, kể cả phần render phía server.

**Trạng thái:** đã triển khai (xem mục 10 cho những chỗ khác với kế hoạch ban đầu). Kết quả kiểm: `pnpm test:web` (kiểm từ điển + test hàm dịch), `tsc --noEmit`, `next build`, và chạy thật trên máy chủ dữ liệu tạm với trình duyệt Edge (tiếng Việt và tiếng Anh, đổi bằng menu).

**Tham chiếu**

- `web/components/dashboard/app-sidebar.tsx`: `SETTINGS_NAV` và `NavLink` (nút Settings hiện chỉ đi tới `/dashboard/settings`), `rowClass`.
- `web/lib/dashboard-nav.ts`: nhãn và mô tả của các mục điều hướng (chuỗi cứng).
- `web/app/layout.tsx`: `<html lang="en">`.
- Server: `server/botteam/main.py` (`DEFAULT_SETTINGS` có `"language": "en"`, `PUT /api/config` nhận `language`), `server/botteam/wire.py` (`ConfigPatch.language`). Trường này đã có sẵn, chưa dùng.
- Cách làm của bản BotTeam cũ: từ điển `i18n-vi.ts` (xem `docs/phase-5-extensions-polish.md`, mục i18n).
- Quy tắc dự án (`AGENTS.md` mục 3): trước khi push phải cập nhật `README.md`, `install.ps1`, `install.sh` nếu cần.

## 1. Hiện trạng

| Việc | Hiện tại |
|---|---|
| Chuỗi giao diện | Viết cứng bằng tiếng Anh trong khoảng **61 file `.tsx`** (không tính `components/ui/`) và vài file `lib/` (khoảng 200 chuỗi hiển thị, chưa tính thông báo lỗi và câu động) |
| Thư viện i18n | Không có |
| Ngôn ngữ trang | `lang="en"` cố định |
| Định dạng ngày, số | `Intl` với `"en-US"` cố định (`lib/calendar.ts`, `lib/posts/shared.ts`, `lib/analytics/shared.ts`, `components/analytics/*`) |
| Nội dung từ server | Thông báo lỗi HTTP từ `server/botteam` bằng tiếng Anh (hiện thẳng ra giao diện qua `ApiError`) |
| Chat với agent | Bot trả lời theo ngôn ngữ người dùng viết (không thuộc phạm vi i18n giao diện) |

Hạn chế quan trọng: phần lớn trang là **Server Component** (đọc dữ liệu từ BotTeam rồi render), nên ngôn ngữ phải biết được **ở phía server**, không chỉ ở trình duyệt.

## 2. Quyết định thiết kế

1. **Không thêm thư viện i18n nặng.** App chỉ có hai ngôn ngữ và ít câu số nhiều. Tự viết một lớp nhỏ (`web/lib/i18n/`) gồm từ điển kiểu `Record<Locale, Messages>`, hàm `t(key, params)` có nội suy `{name}` và hàm chọn số ít/số nhiều. Nếu sau này cần nhiều ngôn ngữ hoặc quy tắc phức tạp thì chuyển sang `next-intl` (khóa dịch giữ nguyên nên chuyển được).
2. **Ngôn ngữ lưu bằng cookie `lang`** (`en` | `vi`, hết hạn 1 năm), giống cách đang lưu campaign đang chọn (`active_campaign`) và trạng thái sidebar. Lý do: Server Component đọc được cookie ngay trong lần render đầu, nên không bị nháy chữ Anh rồi mới đổi sang Việt.
3. **Không dùng tiền tố URL** (`/vi/dashboard`). Địa chỉ và các liên kết hiện có giữ nguyên; app là công cụ cá nhân, không cần SEO theo ngôn ngữ.
4. **Mặc định:** lần đầu vào, lấy từ header `Accept-Language` (bắt đầu bằng `vi` thì tiếng Việt, ngược lại tiếng Anh) rồi ghi cookie. Người dùng chọn tay thì cookie ghi đè.
5. **Đồng bộ với server BotTeam (tùy chọn, bước cuối):** ghi thêm `language` vào `PUT /api/config` để bản giao diện BotTeam cũ và bot Administrator dùng cùng ngôn ngữ. Cookie vẫn là nguồn chính cho web; nếu lỗi khi ghi lên server thì bỏ qua, không chặn người dùng.
6. **Từ khóa dịch theo tên ổn định**, không dùng chính câu tiếng Anh làm khóa (ví dụ `nav.overview`, `posts.empty.title`). Tiếng Anh là bản gốc, tiếng Việt phải có đủ khóa (kiểm bằng script, mục 6).

## 3. Giao diện chọn ngôn ngữ (nút Settings trong sidebar)

Bố cục hiện tại: nút Settings (bánh răng) ở cuối sidebar, bấm là đi tới `/dashboard/settings`.

**Đề xuất:** biến nút này thành **menu thả ra** (dropdown, dùng `DropdownMenu` có sẵn trong `components/ui/`) giống ô chọn campaign ở đầu sidebar:

```
⚙ Settings                ← bấm giữ nguyên chức năng cũ? xem lựa chọn bên dưới
  ├─ Mở Settings (Integrations)
  ├─ ───────────
  ├─ Ngôn ngữ / Language
  │    ● English
  │    ○ Tiếng Việt
```

Hai phương án, chọn một khi làm:

| Phương án | Cách hoạt động | Ưu | Nhược |
|---|---|---|---|
| **A (đề xuất)** | Bấm nút Settings mở menu có: "Open settings" và hai mục ngôn ngữ (dấu ✓ ở ngôn ngữ đang dùng) | Một chạm đổi ngôn ngữ; đúng yêu cầu "chọn ngôn ngữ trên nút setting" | Đi tới trang Settings tốn thêm một lần bấm |
| B | Giữ nguyên nút (đi tới trang Settings), thêm mục **Language** ở đầu trang `/dashboard/settings` | Không đổi hành vi nút | Không đổi được ngay trên sidebar |

Chi tiết cho phương án A:

- Khi sidebar thu gọn (chỉ có biểu tượng): menu mở ra bên phải của nút, có chú thích (tooltip) "Settings".
- Hiện cờ/ký hiệu ngắn `EN` / `VI` cạnh mục để nhận biết nhanh; không dùng cờ quốc gia (tiếng Việt không đồng nghĩa một quốc gia).
- Chọn ngôn ngữ: gọi server action `setLanguage(locale)` ghi cookie rồi `revalidatePath("/dashboard", "layout")` để Server Component render lại bằng ngôn ngữ mới, không tải lại trang.
- Trên màn hình nhỏ (sidebar dạng ngăn kéo, `onNavigate`): menu hoạt động như bản desktop và đóng ngăn kéo khi chọn "Open settings".
- Trang `/dashboard/settings` thêm phần **Language** (cùng hai lựa chọn) để người dùng vẫn đổi được từ đó; hai nơi dùng chung một thành phần.
- Truy cập bàn phím và đọc màn hình: `aria-label` lấy theo ngôn ngữ hiện tại; mục đang chọn có `aria-checked`.

## 4. Lớp i18n (`web/lib/i18n/`)

```
web/lib/i18n/
  config.ts       LOCALES = ["en","vi"], DEFAULT_LOCALE, tên hiển thị ("English", "Tiếng Việt"), hàm đọc cookie/Accept-Language
  messages/en.ts  từ điển tiếng Anh (nguồn chuẩn, kiểu `Messages`)
  messages/vi.ts  từ điển tiếng Việt (bắt buộc đủ khóa, kiểu `Messages`)
  server.ts       getLocale(), getT()  (dùng trong Server Component, action, route handler)
  client.tsx      <I18nProvider locale messages>, useT(), useLocale()  (dùng trong Client Component)
  format.ts       formatDate / formatTime / formatNumber / formatRelative theo locale
```

- `app/layout.tsx` đọc locale rồi: đặt `<html lang={locale}>`, bọc `<I18nProvider>`. Chỉ truyền xuống client **từ điển của ngôn ngữ đang dùng** để không tăng kích thước bundle.
- Kiểu `Messages` suy ra từ `en.ts`, nên thiếu khóa ở `vi.ts` hoặc dùng sai khóa sẽ lỗi ở `tsc`.
- Câu có số nhiều: tiếng Việt không chia số ít/số nhiều (dùng một dạng), tiếng Anh dùng hai dạng. Khóa có dạng `{ one: "...", other: "..." }`, hàm `t` chọn theo `Intl.PluralRules(locale)`.
- Câu có thành phần giao diện xen giữa (ví dụ có liên kết trong câu): dùng `t.rich("key", { link: (chunks) => <a>…</a> })`, tránh nối chuỗi.

## 5. Phạm vi dịch (theo màn hình)

Làm theo thứ tự này; mỗi bước tự chạy được và kiểm được.

| Bước | Nội dung | File chính |
|---|---|---|
| 1 | Hạ tầng: lớp i18n, cookie, `lang` của `<html>`, provider | `lib/i18n/*`, `app/layout.tsx` |
| 2 | Sidebar + nút Settings thành menu ngôn ngữ, nhãn điều hướng, header (ô tìm kiếm, nút "Create post", menu tài khoản) | `app-sidebar.tsx`, `dashboard-header.tsx`, `lib/dashboard-nav.ts` (đổi sang khóa dịch), `dashboard-shell.tsx` |
| 3 | Tổng quan, trạng thái chưa có campaign, trình tạo campaign | `components/dashboard/overview/*`, `no-campaign.tsx`, `campaign/create-campaign-wizard.tsx`, `app/create-campaign/*` |
| 4 | AI Agent: tên và mô tả 5 agent, các tab (Chat, Tasks, Computers, Settings), cài đặt model/thinking, trạng thái (Idle, Running…) | `components/agents/*`, `lib/agent-roles.ts`, `lib/orchestration/types.ts` (các bảng `*_LABELS`) |
| 5 | Posts, trình soạn bài, quy tắc từng nền tảng (cảnh báo/lỗi độ dài, hashtag, media) | `components/posts/*`, `lib/posts/shared.ts` (`checkPost`), `lib/social-platforms.ts` |
| 6 | Calendar, Analytics (thẻ số liệu, biểu đồ, bảng, nhãn khoảng thời gian) | `components/calendar/*`, `components/analytics/*`, `lib/analytics/shared.ts`, `lib/calendar.ts` |
| 7 | Accounts, Settings → Integrations (Composio) | `components/integrations/*`, `app/dashboard/accounts`, `app/dashboard/settings/*` |
| 8 | Thông báo lỗi và kết quả server action (`"Pick a time in the future."`, `"Couldn't …"`) | `lib/posts/save.ts`, `app/**/actions.ts`, `app/api/**/route.ts` |
| 9 | Định dạng ngày, giờ, số theo ngôn ngữ; đồng bộ `language` lên server BotTeam; tài liệu | `lib/i18n/format.ts`, `README.md`, `docs/user-guide.md` |

Những chỗ cần xử lý riêng:

- **Thông báo lỗi từ server Python:** `ApiError` mang chữ tiếng Anh của server. Hướng xử lý: ở các lỗi hay gặp (server chưa chạy, 409 "bot đang trả lời", 404) web tự dùng khóa dịch theo mã trạng thái; lỗi lạ vẫn hiện nguyên văn tiếng Anh kèm tiền tố đã dịch. Không sửa chuỗi lỗi ở server trong phase này.
- **Chuỗi nằm trong `lib/` dùng chung cho cả server và client** (ví dụ `checkPost`): đổi hàm để nhận hàm `t` làm tham số, không import trực tiếp từ điển.
- **`Intl` cho phân tích ngày giờ** (`zoneOffset`, `zonedTimeToUtc`, `utcToZonedParts`): **giữ `"en-US"`/`"en-CA"`**, vì đang tách `formatToParts` để tính toán; chỉ các hàm **hiển thị** (`formatInZone`, nhãn lịch, nhãn múi giờ, số) mới theo locale.
- **Tên múi giờ** (`listTimeZones`): `Intl.supportedValuesOf` trả tên IANA tiếng Anh; giữ nguyên, chỉ phần độ lệch `(GMT+7)` theo locale.
- **Tên nền tảng và thương hiệu** (Instagram, TikTok, YouTube, Composio) không dịch.
- **Tên 5 agent** ("Master Agent"…): có tên tiếng Việt (ví dụ "Agent Điều phối", "Agent Nghiên cứu", "Agent Sáng tạo", "Agent Lên lịch", "Agent Phân tích") chỉ để **hiển thị**; tên bot thật trong BotTeam vẫn là tên tiếng Anh đã tạo, để không đổi dữ liệu cũ.
- **Nội dung do người dùng hoặc bot tạo** (tên campaign, tiêu đề bài, tin nhắn chat) không dịch.
- Ảnh trong `README.md`/`docs/screenshots` chụp bằng tiếng Anh; thêm bộ ảnh tiếng Việt nếu cần (mục 7).

## 6. Kiểm tra

1. **Tự động (không cần thiết bị):**
   - `pnpm --filter web typecheck`: sai khóa hoặc thiếu khóa ở `vi.ts` thì lỗi biên dịch.
   - Script `scripts/check-i18n.mjs`: so khóa `en.ts` và `vi.ts`; báo khóa thừa, thiếu, và chuỗi tiếng Việt còn trống hoặc giống hệt tiếng Anh ngoài danh sách cho phép (tên thương hiệu). Gắn vào `pnpm test`.
   - Kiểm tra số nhiều và nội suy `{param}` của hàm `t` bằng test nhỏ (`node:test`, không cần thêm thư viện).
2. **Chạy thật** (server test với dữ liệu tạm, `next start`, không dùng instance dữ liệu thật):
   - Vào `/dashboard` lần đầu với `Accept-Language: vi` → chữ Việt, `<html lang="vi">`.
   - Bấm Settings → chọn English: toàn trang đổi ngay, không tải lại, không nháy; tải lại trang vẫn giữ.
   - Duyệt đủ 8 trang và các hộp thoại (trình soạn bài, tạo campaign) ở cả hai ngôn ngữ, tìm chuỗi còn tiếng Anh.
   - Chụp màn hình từng trang ở tiếng Việt để kiểm **chữ dài bị tràn/cắt** (tiếng Việt thường dài hơn tiếng Anh ở nhãn nút, tiêu đề thẻ, tab, sidebar mở rộng).
   - Dấu tiếng Việt (UTF-8): kiểm phông `Plus Jakarta Sans` đã nạp subset `vietnamese` (hiện chỉ khai báo `latin` trong `app/layout.tsx`, **phải thêm `"vietnamese"`** nếu không dấu sẽ rơi sang phông dự phòng).
3. **Truy cập qua LAN/Tailscale:** cookie hoạt động qua IP (cookie không gắn theo cổng/miền riêng nên dùng được); kiểm qua `http://<ip>:5499`.

## 7. Cập nhật tài liệu (theo `AGENTS.md` mục 3)

- `README.md`: thêm một dòng ở phần tính năng hoặc cài đặt ("Giao diện có tiếng Anh và tiếng Việt; đổi ở nút Settings của sidebar") và, nếu chụp lại, bộ ảnh mới.
- `docs/user-guide.md`: thêm mục "Đổi ngôn ngữ".
- `docs/README.md`: thêm hàng Phase 8 vào bảng.
- `install.ps1`, `install.sh`, `.env.example`: **không cần đổi** (không thêm cổng, biến môi trường hay phần phụ thuộc mới) nếu dùng phương án tự viết lớp i18n; ghi rõ "không cần thay đổi" khi commit. Nếu chuyển sang `next-intl` thì chỉ `pnpm-lock.yaml` đổi.

## 8. Rủi ro và việc để sau

| Rủi ro | Cách giảm |
|---|---|
| Quên một số chuỗi cứng trong 61 file | Tìm bằng `grep` các chuỗi chữ hoa đầu trong JSX và thuộc tính `title`, `placeholder`, `aria-label`; duyệt tay từng màn hình (mục 6) |
| Chữ Việt dài làm vỡ bố cục sidebar thu gọn/mở rộng | Chụp màn hình kiểm tra; dùng `truncate` và tooltip đã có; rút gọn nhãn nếu cần |
| Server Component cache bằng ngôn ngữ cũ | Các trang đã là `force-dynamic`; action `setLanguage` gọi `revalidatePath("/dashboard", "layout")` |
| Dịch máy sai thuật ngữ | Giữ bảng thuật ngữ cố định ở đầu `vi.ts` (campaign = chiến dịch, post = bài đăng, draft = bản nháp, schedule = lên lịch, publish = đăng, analytics = phân tích, account = tài khoản, agent = agent); người biết tiếng Việt rà lại |

**Để sau (ngoài phase này):** dịch thông báo lỗi từ server Python, thêm ngôn ngữ khác, tự chọn ngôn ngữ theo từng người (hiện cả máy dùng chung vì app không có đăng nhập), dịch nội dung mà bot sinh ra.

## 9. Việc cần làm (checklist)

- [x] Quyết phương án A hay B ở mục 3: chọn **A** (menu ở nút Settings).
- [x] Bước 1: lớp i18n, cookie, `lang`, provider, phông `vietnamese`.
- [x] Bước 2: menu ngôn ngữ ở nút Settings, sidebar, header, nhãn điều hướng.
- [x] Bước 3 đến 7: dịch từng màn hình theo bảng mục 5.
- [x] Bước 8: thông báo lỗi và kết quả server action.
- [x] Bước 9: định dạng ngày/số, đồng bộ `language` lên server, tài liệu.
- [x] Script `check-i18n.mjs` và test cho `t`.
- [x] Chạy thật theo mục 6, chụp màn hình tiếng Việt, rà chữ tràn.
- [x] Cập nhật README, user guide, docs/README (mục 7).

## 10. Khác với kế hoạch ban đầu

**Cập nhật sau khi dùng thử:** nút ngôn ngữ được tách thành một nút **Language** riêng nằm ngay phía trên nút Settings (menu thả ra có English / Tiếng Việt); nút Settings trở lại là liên kết thường tới trang Cài đặt, và trang Cài đặt không có mục chọn ngôn ngữ. Các mục 3 và 4 phía trên mô tả phương án A ban đầu.

| Kế hoạch | Thực tế | Lý do |
|---|---|---|
| Khóa dịch ổn định (`nav.overview`) và kiểu `Messages` bắt lỗi ở `tsc` | **Khóa là chính câu tiếng Anh** (kiểu gettext): `t("Create post")`, `<T>Create post</T>`; từ điển `vi.ts` là `Record<string, string>`; câu chưa có bản dịch hiện bằng tiếng Anh | Hơn 580 câu rải ở hơn 50 file, nhiều câu nằm giữa biểu thức JSX; dùng chính câu làm khóa tránh đặt tên và không bỏ sót chỗ nào. Việc kiểm thiếu khóa chuyển sang `scripts/check-i18n.mjs` (thay cho `tsc`) |
| `t.rich(...)` cho câu có thành phần xen giữa | Không dùng; câu được viết lại thành `t("... {name} ...", { name })` | Không có câu nào cần liên kết xen giữa |
| `lib/i18n/server.ts`, `client.tsx`, `format.ts`, `config.ts`, `messages/{en,vi}.ts` | Có thêm `translate.ts` (hàm dùng chung), `display.ts` (ngôn ngữ hiển thị cho ngày/số); **không có `messages/en.ts`** (tiếng Anh là chính câu gốc); `format.ts` bọc `date-fns` theo ngôn ngữ | Ngày và số được định dạng từ các hàm `lib/` gọi ở nhiều nơi, nên chúng đọc ngôn ngữ hiển thị thay vì nhận tham số |
| Cookie `lang` ghi ở lần vào đầu tiên | Ghi trong `web/proxy.ts` (nếu chưa có cookie) và đọc lại bằng `Accept-Language` khi chưa có | Server Component không ghi cookie được |
| Mẫu ngày (`"h:mm a"`) | Mẫu ngày hiển thị cũng đi qua `t()`; bản Việt dùng giờ 24h (`HH:mm`) và `d MMM` | Mỗi ngôn ngữ có thứ tự ngày/tháng riêng |
| Dịch cả trình sửa ảnh | Có dịch, nhưng trình sửa ảnh cần ImageKit nên không dùng được trong app này | Giữ đồng bộ chuỗi |
| Thông báo lỗi từ server Python | Giữ nguyên (tiếng Anh) | Như kế hoạch: không sửa chuỗi lỗi của server trong phase này |
| Mô tả công cụ của ImageKit (`lib/imagekit/transformations.ts`) | Không dịch | Dùng làm mô tả công cụ cho agent, không hiển thị cho người dùng |

Khi thêm một câu giao diện mới: viết bằng tiếng Anh trong `t("...")` hoặc `<T>...</T>`, thêm bản dịch vào `web/lib/i18n/messages/vi.ts`, rồi chạy `node scripts/check-i18n.mjs`. Câu tra cứu qua biến (bảng nhãn như `STATUS_LABELS[x]`) được hiển thị bằng `t(nhãn)`; thêm chúng vào `extra` trong `scripts/i18n-tables.json` nếu script không tự thấy (nó tự thấy các thuộc tính `label`, `description`, `name`, `text`, `tips`).
