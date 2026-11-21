# Phase 9 — Tab "Browser use": mỗi agent có trình duyệt Chromium (Edge/Chrome) điều khiển qua Playwright MCP

**Mục tiêu:** trên trang AI Agent, mỗi agent có một tab **Browser** (thay cho tab "Computer" đang không hoạt động trong web). Agent duyệt web bằng **Microsoft Edge hoặc Chrome** có sẵn trên máy, điều khiển qua **Playwright MCP** (`@playwright/mcp`); người dùng xem trực tiếp, giành quyền điều khiển để đăng nhập hoặc giải CAPTCHA rồi trả lại. Mỗi agent có hồ sơ trình duyệt riêng (đăng nhập được giữ giữa các lần chạy).

**Trạng thái:** đã triển khai Browser use, cài đặt theo agent và chính sách chọn kênh đăng. Quyết định của người dùng đã chốt: giao diện và cách dùng **giống Computer use hiện tại** (xem trực tiếp, Take over khi cần); **tất cả agent** dùng được trình duyệt; **việc đăng bài** cấu hình được cho từng agent là dùng **Composio** hay dùng **web (trình duyệt)**, mặc định **Composio**; **bỏ hẳn** bộ công cụ `browser_*` cũ.

**Điều chỉnh khi triển khai**

- Phiên bản thực trên npm là `@playwright/mcp@0.0.86`. Bộ chuyển tiếp MCP tra hồ sơ và cổng CDP qua broker loopback. Vì vậy, việc liệt kê công cụ và nối lại phiên engine không làm mở trình duyệt.
- Chromium đi qua cổng SOCKS5 loopback như OpenMausBot. Cổng phân giải và kết nối tới chính địa chỉ IP đã được duyệt, áp dụng cả khi đổi hướng và tải tài nguyên phụ. Luồng ảnh SSE riêng cho mỗi trình duyệt dùng `Page.startScreencast`. Luồng trạng thái office vẫn dùng polling như trước.
- Thao tác có tác dụng phụ chờ duyệt trong tab Browser. Mở bài soạn theo các đường dẫn phổ biến và gọi công cụ đăng của Composio chịu chính sách theo agent. Bộ lọc này bổ sung cho permission broker.

**Vấn đề cần giải quyết**

- Agent Research báo "Trình duyệt không vào được X" (`net::ERR_HTTP_RESPONSE_CODE_FAILURE`): trình duyệt tích hợp hiện tại là Chromium chạy **headless** với hồ sơ trống, nên X và nhiều trang khác chặn hoặc đòi đăng nhập.
- Tab **Computer** của web (`web/components/sandbox/*`, `/api/sandbox`) là phần còn lại của bản tham chiếu dùng máy ảo đám mây E2B: `/api/sandbox` luôn trả 404 và `sandboxes` luôn rỗng, nên tab không dùng được. Server BotTeam đã có trình duyệt thật (`server/botteam/browser.py`, API `/api/bots/{id}/computer/*`) nhưng web chưa nối vào.
- Công cụ `browser_*` hiện tại là bộ công cụ tự viết (mở, chụp cấu trúc, bấm, gõ, cuộn, quay lại). Playwright MCP là bộ công cụ chuẩn, đầy đủ hơn (snapshot theo cây trợ năng, điều hướng, tab, tải lên tệp, hộp thoại, console, mạng, PDF…) và được các engine (Claude Code, Codex, Antigravity) biết dùng sẵn.

**Tham chiếu**

- Server: `server/botteam/browser.py` (`BrowserService`, hồ sơ bền mỗi bot, chọn `msedge` → `chrome` → `chromium`, `BOTTEAM_BROWSER_CHANNEL`, `netguard`), `server/botteam/agents.py` (`t_browser_*`, `_browse`), `server/botteam/main.py` (mục "the computer panel", `/api/bots/{id}/computer*`, `ComputerSettings`), `server/botteam/mcp_servers.py` và `mcp_proxy.py` (MCP tuỳ chỉnh stdio/http/sse, bí mật không lên dòng lệnh), `server/botteam/broker.py` (duyệt quyền).
- Web: `web/components/agents/agent-panel.tsx` (`AgentTab`, `hasComputer`, `MASTER_TABS`/`WORKER_TABS`), `web/components/sandbox/*`, `web/lib/agent-roles.ts` (`computer: boolean`), `web/app/api/sandbox/route.ts`, `web/app/api/agents/status/route.ts` (`sandboxes: {}`).
- `docs/phase-5-extensions-polish.md` mục 3 (Computer panel mức trình duyệt) và `docs/phase-3-approvals-bot-management.md` (permission broker).
- Quy tắc dự án (`AGENTS.md`): cập nhật `README.md`, `install.ps1`, `install.sh` trước khi push (mục 3); mọi thay đổi web hỗ trợ tiếng Anh và tiếng Việt (mục 4).

Kết quả kiểm thực tế khi lập kế hoạch: `npx @playwright/mcp@latest --version` → `0.86`; có các cờ `--browser <chrome|msedge|firefox|webkit>`, `--cdp-endpoint`, `--user-data-dir`, `--headless`, `--isolated`, `--viewport-size`, `--caps vision,pdf,devtools`, `--allowed-origins`/`--blocked-origins` (tài liệu ghi rõ **không phải ranh giới bảo mật** và không áp dụng cho chuyển hướng), `--storage-state`, `--secrets`, `--init-script`, `--output-dir`, `--extension`.

## 1. Quyết định thiết kế

1. **Một trình duyệt thật cho mỗi agent, do BotTeam khởi chạy; Playwright MCP gắn vào nó qua CDP.** Server mở Edge/Chrome (`--remote-debugging-port` ngẫu nhiên, chỉ nghe `127.0.0.1`, hồ sơ riêng `<data>/browser/<agent>/`), rồi cho agent một MCP server `playwright` chạy `npx @playwright/mcp@<phiên bản cố định> --cdp-endpoint http://127.0.0.1:<cổng>`. Lý do: cùng một trình duyệt phục vụ cả agent (MCP) và người xem (tab Browser), nên "xem trực tiếp" và "giành quyền" luôn là cùng một cửa sổ mà agent đang dùng. Dùng `--user-data-dir` thẳng thì MCP tự mở trình duyệt riêng, web không có cách xem.
2. **Mặc định giống Computer use:** trình duyệt chạy **không hiện cửa sổ** (chế độ headless mới của Chromium, gần giống có đầu hơn bản headless cũ); người dùng **xem trực tiếp trong tab Browser** và **Take over** khi cần (đăng nhập, CAPTCHA). Vì X và vài trang chặn headless, có công tắc **"Hiện cửa sổ trình duyệt" (headed)** trong Settings của agent; bật công tắc này không đổi cách xem trực tiếp (vẫn xem được trong tab).
3. **Edge trước, rồi Chrome, rồi Chromium của Playwright**, giữ đúng thứ tự hiện có ở `BrowserService._launch`; `BOTTEAM_BROWSER_CHANNEL` vẫn ghi đè. Cờ `--browser` của MCP không cần khi dùng CDP, nhưng truyền `--executable-path` khi cần.
4. **MCP server là một "bản dựng sẵn" (built-in) gắn vào agent**, tái dùng cơ chế MCP tuỳ chỉnh (`mcp_servers.py`): spec `stdio` do server sinh ra, không cho người dùng sửa dòng lệnh; vẫn đi qua `mcp_proxy` để áp ngân sách đầu ra (`outputBudget`) và bộ lọc quyền. **Gắn cho cả 5 agent** (Master, Research, Creator, Scheduler, Analytics), mặc định bật; mỗi agent tắt được trong Settings của nó. Trình duyệt chỉ khởi chạy khi agent gọi công cụ lần đầu.
5. **Bỏ hẳn bộ công cụ `browser_*` cũ, không giữ dự phòng:** xoá `t_browser_*` và tên công cụ trong `agents.py`, phần công cụ trình duyệt ở `mcp_bridge.py`, `BrowserService` kiểu cũ (thay bằng `BrowserHost`), `server/tests/test_browser.py` (viết lại cho `BrowserHost`), và mọi chỗ nhắc `browser_open`/`browser_snapshot` trong soul và tài liệu. Chỉ giữ `browser_request_help` (mục 3.1), vì xin trợ giúp là việc của BotTeam, không phải của Playwright MCP.
6. **Việc đăng bài chọn kênh theo từng agent: Composio hay Web.** Mặc định **Composio** (đăng bằng tài khoản đã kết nối qua Composio, không cần trình duyệt). Chọn **Web** thì agent đăng bằng trình duyệt của nó (đã đăng nhập sẵn nhờ hồ sơ riêng hoặc Take over). Cài đặt này chỉ điều khiển việc **đăng bài**; việc duyệt web để nghiên cứu, kiểm tin, xem số liệu vẫn dùng trình duyệt bình thường ở mọi agent. Chi tiết ở mục 3.6.
7. **Tên gọi:** "Computer" đổi thành **"Browser"** trong giao diện, mã (`hasComputer` → `hasBrowser`, `computer` → `browser`) và tài liệu. API server `/api/bots/{id}/computer/*` giữ làm bí danh một thời gian, đường mới là `/api/bots/{id}/browser/*`. Phần E2B (`sandbox-*`, `/api/sandbox`, `SANDBOX_STATUS_LABELS`, `sandboxes`) được thay bằng trạng thái trình duyệt, không giữ lại.
8. **Người dùng luôn có quyền cao nhất:** nút **Take over** khoá công cụ của agent (MCP trả lỗi "người dùng đang điều khiển") cho tới khi **Hand back**. Agent gặp đăng nhập hoặc CAPTCHA phải gọi công cụ xin trợ giúp (mục 3.3) và chờ, không tự vượt.

## 2. Kiến trúc

```
Browser (web, tab Browser)            BotTeam server                         máy này
  ├ ảnh trực tiếp ◄── SSE `screen` ◄─ BrowserHost ──CDP──► Edge/Chrome (hồ sơ riêng mỗi agent)
  ├ chuột/phím ──► /api/bots/{id}/browser/input  │               ▲
  └ Take over / Hand back                         │            CDP 127.0.0.1:<cổng>
                                                  └─ mcp_proxy ─► @playwright/mcp (stdio) ◄── engine của agent
```

- **`BrowserHost`** (phát triển từ `BrowserService`): quản vòng đời trình duyệt mỗi agent (khởi chạy, cổng CDP, hồ sơ, tắt khi rảnh), giữ trạng thái `control` (`agent` | `person`) và `help_reason`, phát ảnh màn hình qua CDP (`Page.startScreencast` thay cho chụp ảnh định kỳ) với giới hạn tần suất như hiện nay (`MIN_FRAME_GAP`, `IDLE_AFTER`), nhận sự kiện chuột/phím của người xem và gửi bằng `Input.dispatch*`.
- **Playwright MCP** chạy dưới dạng tiến trình con stdio của lượt chạy, qua `mcp_proxy` (đã có). Cổng CDP chỉ nghe loopback và không bao giờ trả ra ngoài API.
- **Phía web:** tab **Browser** nói chuyện với server qua route Next (`/api/agents/browser/*`) giống cách `/api/agents/model` làm, không gọi thẳng server từ trình duyệt.

## 3. Công việc

### 3.1 Server — trình duyệt và Playwright MCP

- [x] `BrowserHost` tìm Edge/Chrome, mở hồ sơ `<data>/browser/<bot>` bằng `subprocess` và đọc cổng loopback từ `DevToolsActivePort`. Đã chạy thử trên Windows với đường dẫn Program Files. Có dò đường dẫn Linux và macOS.
- [x] Một trình duyệt mỗi agent, tắt sau thời gian rảnh (cấu hình), đóng sạch khi server tắt (không để tiến trình mồ côi, dùng `kill_tree` ở `drivers/proc.py`).
- [x] Sinh spec MCP `playwright` mỗi agent: `npx -y @playwright/mcp@0.0.86 --cdp-endpoint http://127.0.0.1:<port> --caps vision --output-dir <workspace>/browser-out`. **Cố định phiên bản** (không dùng `@latest`) để hành vi không đổi ngầm; ghi phiên bản trong một hằng số và cập nhật có kiểm thử.
- [x] Gắn vào `bot.mcpServers` của **cả 5 agent** theo cài đặt "Browser" (mục 3.4, mặc định bật); cập nhật khi đổi cổng (mỗi lần khởi động cổng mới nên spec được tạo lại ở đầu mỗi lượt, không lưu cố định). Campaign cũ: khi server khởi động, gắn MCP cho các bot của campaign đang có (cùng cách `refresh_souls` làm mới soul).
- [x] **Xoá bộ công cụ `browser_*` cũ** (quyết định 5): `agents.py` (`t_browser_*`, danh sách tên công cụ), `mcp_bridge.py`, `BrowserService` cũ, test cũ; sửa các test dùng chúng.
- [x] Chỗ cần `node`/`npx`: kiểm tra có sẵn khi bật, báo rõ khi thiếu (mục 3.7).
- [x] API mới `/api/bots/{id}/browser` (trạng thái), `/wake`, `/sleep`, `/control` (take over / hand back), `/input`, `/watch`, `/screen` (ảnh tĩnh), kèm bí danh `/computer/*`. Sự kiện bus `computer-control` đổi thành `browser-control` (giữ phát cả hai trong một giai đoạn).
- [x] Công cụ `browser_request_help(reason)` do BotTeam cung cấp (qua `mcp_bridge`, không phải Playwright MCP): đặt `help_reason`, chuyển `control = person`, chờ tới `hand_back` hoặc quá `HELP_TIMEOUT`. Hướng dẫn của agent (soul) nói rõ phải dùng nó khi gặp đăng nhập/CAPTCHA/xác minh.
- [x] Khoá công cụ khi `control == person`: `mcp_proxy` từ chối mọi lệnh gọi công cụ của Playwright MCP, trả thông điệp "người dùng đang điều khiển trình duyệt, chờ họ trả lại".

### 3.2 Bảo mật và quyền

Playwright MCP tự nói `--allowed-origins`/`--blocked-origins` **không phải ranh giới bảo mật**, nên không dựa vào chúng.

- [x] **Chặn địa chỉ nội bộ** bằng SOCKS5 tại loopback. Cổng kiểm tra IP đích trên mỗi kết nối, kể cả chuyển hướng và tài nguyên phụ. Truy cập nội bộ cần cài đặt **Cho phép địa chỉ cục bộ** của agent.
- [x] **Permission broker:** công cụ có tác dụng phụ (`browser_click` trên nút gửi, `browser_type`, `browser_file_upload`, `browser_evaluate`, `browser_run_code`…) đi qua `broker` theo mức duyệt của agent (Ask/Edits/Auto/Full). Lập bảng ánh xạ tên công cụ Playwright MCP → "chỉ đọc" hoặc "có tác dụng phụ"; công cụ chưa biết mặc định coi là có tác dụng phụ.
- [x] Tắt các khả năng nguy hiểm mặc định: không bật `--allow-unrestricted-file-access`, không `--caps devtools` mặc định, không cho `file://`; tải xuống tắt (như `accept_downloads: False` hiện nay) trừ khi người dùng bật.
- [x] **Nội dung trang là dữ liệu, không phải lệnh** (prompt injection): hướng dẫn agent bỏ qua mệnh lệnh nằm trong trang web; khi đọc trang, không tự gửi dữ liệu nhạy cảm ra ngoài. Dùng chung cơ chế `escape_notes`/phong bì đã có cho kết quả công cụ.
- [x] Hồ sơ trình duyệt chứa đăng nhập: nằm trong `<data>/browser/`, không đưa vào sao lưu chia sẻ, không đưa vào file xuất/nhập bot (`botfile.py`); cho phép "Xoá dữ liệu trình duyệt" trong Settings của agent.
- [x] Cổng CDP: chỉ loopback; kiểm tra không bị phơi ra qua `WEB_HOST=0.0.0.0` (server vẫn chỉ nghe `127.0.0.1`).

### 3.3 Web — tab "Browser"

Theo kiểu tab hiện có trong `agent-panel.tsx`; xem lại bản tham chiếu `http://localhost:5199/` cho bố cục.

- [x] Đổi `AgentTab` `"computer"` → `"browser"`, nhãn **Browser** (Master: **Browsers**), biểu tượng `Globe` thay `Monitor`; `hasComputer` → `hasBrowser`; `WorkerRole.computer` → `browser`.
- [x] Thành phần mới `components/browser/browser-panel.tsx` (thay `components/sandbox/*`): khung xem trước trực tiếp (ảnh từ SSE, tỉ lệ 16:10), thanh trạng thái (đang làm gì: "Đang mở x.com…", URL hiện tại, tiêu đề), nút **Open large** (hộp thoại lớn, có thể gõ/chuột), **Take over** / **Hand back**, **Sleep/Wake**, **Open in my browser** (mở URL hiện tại ở trình duyệt của người dùng).
- [x] Hộp thoại xem lớn có chuột/phím truyền qua `/browser/input`, chỉ hoạt động khi người dùng đã Take over; hiển thị chỉ báo "Agent đang điều khiển" / "Bạn đang điều khiển".
- [x] Khi agent xin trợ giúp (`help_reason`): thẻ nổi bật "Agent cần bạn: <lý do>" kèm nút **Open the browser** (đã có chỗ tương tự ở `master-tasks.tsx`: "Waiting for you on the computer" → đổi chữ thành "browser").
- [x] Tab **Browsers** của Master: lưới xem nhanh các trình duyệt của 4 agent (thay `TeamComputers`).
- [x] Route Next: `app/api/agents/browser/route.ts` (GET trạng thái, POST `wake|sleep|control|input|approval`), `.../screen` (ảnh tĩnh) và `.../watch` (SSE). Trạng thái từng agent có trường `browser`.
- [x] Văn bản **luôn dùng `t()`/`<T>`** và thêm tiếng Việt vào `web/lib/i18n/messages/vi.ts` (quy tắc mục 4); chạy `pnpm test:web`. Cập nhật chuỗi cũ nhắc "computer" ở `app-sidebar.tsx` (hộp thoại kết thúc campaign), `task-results.tsx` ("Saved on the agent's computer"), `agent-preview-popover.tsx`, `api/sandbox/route.ts`.
- [x] Gỡ code E2B còn lại (`SandboxProvider`, `useSandboxController`, `sandbox-viewer.tsx`, `SANDBOX_STATUS_LABELS`, `sandboxes` trong `LiveStatus`, `use-live-status.ts`) và thay bằng trạng thái trình duyệt; giữ giao diện office (popover agent) hiển thị "đang duyệt web" khi agent dùng trình duyệt.

### 3.4 Cài đặt trong tab Settings của agent

Phần mới "Browser" (cạnh Model và Image generation trong `agent-settings.tsx`):

- [x] Bật/tắt trình duyệt cho agent (gắn hay gỡ MCP `playwright`); mặc định bật cho cả 5 agent.
- [x] **Đăng bài qua:** Composio (mặc định) / Web (mục 3.6).
- [x] Trình duyệt: Tự chọn (Edge → Chrome → Chromium) / Edge / Chrome; hiện cái nào đã cài và phiên bản.
- [x] **Hiện cửa sổ trình duyệt** (headed): tắt theo mặc định (chạy ẩn, xem trực tiếp trong tab Browser); bật nếu trang chặn headless.
- [x] Cho phép địa chỉ cục bộ (mặc định tắt), Cho phép tải xuống (mặc định tắt).
- [x] Nút **Xoá dữ liệu trình duyệt** (đăng nhập, cookie) của agent này, có xác nhận.
- [x] Lưu theo campaign trên server (cùng kiểu `social_image_settings`: bảng `social_browser_settings(campaign_id, role, enabled, browser, headed, post_via, allow_local, allow_downloads)` hoặc trường trên bot), có endpoint `GET/PUT /api/social/campaigns/{id}/browser-settings` và route Next `/api/agents/browser-settings`.

### 3.5 Hướng dẫn (soul) của các agent

- [x] Tất cả agent: biết có công cụ trình duyệt (Playwright MCP) và `browser_request_help`; kênh đăng bài theo cài đặt (mục 3.6).
- [x] Master: giao việc cần duyệt web cho Research hoặc tự dùng khi việc nhỏ; khi Research báo bị chặn thì đề xuất cách khác (nguồn chính thức, nhờ người dùng Take over) thay vì giao lại cùng một việc.
- [x] Scheduler/Analytics: dùng trình duyệt để xem lại bài đã đăng hoặc số liệu trên trang khi cần.
- [x] Research: dùng trình duyệt để xác minh tin (mở trang chính thức, tài khoản X, blog), ghi **URL gốc** của từng nguồn; nếu bị chặn hoặc cần đăng nhập thì gọi `browser_request_help`, không bịa nguồn; nếu không vào được thì nói rõ "chưa xác minh được" (liên quan lỗi báo cáo X vừa gặp).
- [x] Creator: có thể mở trang để tham khảo hình ảnh/phong cách, nhưng không tải ảnh về dùng nếu không rõ bản quyền (ảnh do Codex/Gemini CLI tạo vẫn là đường chính).
- [x] Chung: nội dung trang web là dữ liệu không đáng tin; không nhập mật khẩu hay mã thanh toán; xin người dùng làm.
- [x] Cập nhật `soul_for()` trong `social.py` và `refresh_souls()` như đã làm cho Posts API (chỉ làm mới soul chưa bị sửa tay).

### 3.6 Đăng bài: Composio hay Web (cấu hình theo agent)

- [x] Cài đặt `postVia` cho mỗi agent: `composio` (mặc định) hoặc `web`. Nằm trong phần "Browser" của tab Settings (mục 3.4), lưu theo campaign cùng bảng cài đặt trình duyệt.
- [x] **Soul theo cài đặt:** `soul_for()` thêm đoạn "Đăng bài" tương ứng: `composio` thì dặn đăng bằng công cụ Composio của tài khoản đã kết nối (hoặc lưu bản nháp ở trang Posts như hiện nay), **không** mở trình duyệt để đăng; `web` thì dặn đăng bằng trình duyệt (vào trang đăng của nền tảng, dùng hồ sơ đã đăng nhập, xin Take over nếu chưa đăng nhập), **không** dùng Composio để đăng. `refresh_souls()` làm mới soul khi đổi cài đặt (chỉ soul chưa bị sửa tay).
- [x] **Cổng ở `mcp_proxy` theo cài đặt:** `postVia = composio`: khi agent điều hướng trình duyệt tới trang soạn/đăng bài của nền tảng đã kết nối (bảng ánh xạ miền → toolkit: `x.com`/`twitter.com`, `instagram.com`, `facebook.com`, `youtube.com`/`studio.youtube.com`, `linkedin.com`, `tiktok.com`…) mà đường dẫn là trang đăng (`/compose`, `/intent/tweet`, `/upload`, `/create`…) thì trả lời "Agent này đăng bài qua Composio; dùng công cụ Composio hoặc lưu bản nháp". Đọc, tìm kiếm, xem hồ sơ trên các trang đó vẫn cho phép. `postVia = web`: công cụ Composio dùng để đăng (tên công cụ đăng/tạo bài của toolkit) bị từ chối với lời nhắc dùng trình duyệt; công cụ đọc của Composio vẫn dùng được.
- [x] Nếu `postVia = composio` mà nền tảng **chưa có tài khoản kết nối**, agent lưu bản nháp ở trang Posts và báo người dùng cần kết nối (hoặc đổi sang Web), không tự chuyển sang trình duyệt.
- [x] Nếu `postVia = web` mà trình duyệt chưa đăng nhập, agent gọi `browser_request_help` và chờ người dùng Take over.
- [x] Mọi lần đăng bằng web đi qua permission broker (hành động có tác dụng phụ), như mục 3.2.

### 3.7 Cài đặt, tài liệu, và máy mới

- [x] `install.ps1` / `install.sh`: kiểm tra có **Node.js ≥ 20** và `npx` (đã cài cho web); tải trước gói `@playwright/mcp` đúng phiên bản (`npx -y @playwright/mcp@0.0.86 --version`) để lần chạy đầu không chờ; kiểm tra có Edge hoặc Chrome, nếu không thì hướng dẫn cài Edge/Chrome hoặc `playwright install chromium`.
- [x] `.env.example`: `BOTTEAM_BROWSER_CHANNEL` (đã có), thêm `BOTTEAM_BROWSER_HEADLESS` (mặc định đặt theo máy), `BOTTEAM_PLAYWRIGHT_MCP_VERSION` nếu muốn ghi đè phiên bản.
- [x] `README.md`: dòng "Built-in browser (Computer)" → "Browser use", mục yêu cầu (Node, Edge/Chrome), mô tả tab Browser, mục bảo mật (hồ sơ đăng nhập nằm trong thư mục dữ liệu).
- [x] `docs/user-guide.md`: cách đăng nhập cho agent (Take over → đăng nhập → Hand back), cách xoá dữ liệu trình duyệt, xử lý X/Google chặn headless.
- [x] `docs/README.md`: thêm dòng phase 9 vào bảng.

## 4. Giai đoạn triển khai

| Bước | Nội dung | Kiểm |
|---|---|---|
| A | `BrowserHost` khởi chạy Edge/Chrome với CDP và hồ sơ riêng; API trạng thái, wake, sleep | Test với trình duyệt giả/thật: mở, đóng, không mồ côi tiến trình |
| B | Spec Playwright MCP cho cả 5 agent + khoá công cụ khi `control == person` + `browser_request_help` + **xoá công cụ `browser_*` cũ** | Lượt chạy thật với Claude Code, Codex và Antigravity: mở một trang, đọc snapshot, bấm; Take over chặn công cụ; không còn tham chiếu `browser_open` |
| C | Bảo mật: chặn địa chỉ nội bộ, bảng ánh xạ công cụ ↔ broker, tắt tải xuống/`file://` | Test đơn vị cho bộ chặn; thử đến `127.0.0.1:<cổng app>` qua chuyển hướng phải bị chặn |
| D | Web: tab Browser, xem trực tiếp, Take over/Hand back, đổi tên Computer → Browser, gỡ E2B | `tsc`, `pnpm test:web`, chụp màn hình Edge tiếng Anh + tiếng Việt |
| E | Cài đặt Browser trong Settings của agent + lưu theo campaign | Test server cho endpoint; thử đổi Edge/Chrome, headed/headless |
| F | Đăng bài Composio/Web (`postVia`: soul + cổng ở `mcp_proxy`), soul của 5 agent, `refresh_souls`, tài liệu, install scripts | Mặc định Composio: đăng thử một bài X không mở trình duyệt; đổi sang Web: đăng bằng trình duyệt, chưa đăng nhập thì xin trợ giúp; kiểm tin vẫn mở trình duyệt ở cả hai chế độ |
| G | Dọn code chết còn lại (E2B, tên "computer", bí danh `/computer/*` sau một bản phát hành) | Toàn bộ `pytest`, `pnpm test`, quét chữ "computer" còn sót |

## 5. Rủi ro và câu hỏi mở

- **X/Google vẫn chặn tự động hoá** kể cả bằng Edge thật (nhận diện `navigator.webdriver`, CDP). Giảm thiểu: headed + hồ sơ có đăng nhập thật do người dùng thực hiện; không hứa vượt được chống bot. Phương án khác cho X là Composio (tìm bài qua tài khoản đã kết nối) — để ngoài phạm vi phase này nhưng ghi trong soul của Research.
- **CDP và Playwright MCP cùng điều khiển một trình duyệt:** cần kiểm tra không tranh chấp khi web gửi sự kiện chuột/phím trong lúc MCP đang chạy (giải quyết bằng quy tắc `control`).
- **Phiên bản `@playwright/mcp` thay đổi nhanh** (0.x): cố định phiên bản và có bài kiểm tra "khói" (khởi động, liệt kê công cụ) để phát hiện công cụ đổi tên.
- **Tải gói bằng `npx` lần đầu cần mạng** và có thể chậm hoặc bị chặn: tải sẵn lúc cài, và báo lỗi rõ khi không có.
- **Hiệu năng ảnh trực tiếp:** `Page.startScreencast` chỉ chạy khi có người xem; giới hạn tần suất và chất lượng; trên LAN/Tailscale cần ảnh nhẹ (JPEG, chất lượng thấp khi băng thông kém).
- **Đã chốt:** (1) mặc định giống Computer use: chạy ẩn, xem trực tiếp và Take over; (2) cả 5 agent dùng được trình duyệt; (3) bỏ hẳn `browser_*` cũ, không giữ dự phòng; (4) đăng bài chọn Composio hoặc Web theo từng agent, mặc định Composio.
- **Rủi ro của mặc định chạy ẩn:** X và vài trang chặn headless, nên Research có thể bị chặn khi kiểm tin; khi đó agent xin trợ giúp và người dùng bật "Hiện cửa sổ" hoặc Take over.
- **Rủi ro của bỏ `browser_*` ngay:** không có đường lùi nếu Playwright MCP lỗi trên một engine (ví dụ Antigravity chạy giao thức ACP). Phải kiểm ở bước B trên cả 3 engine trước khi xoá code cũ.
- **Cổng đăng bài chỉ là rào mềm:** bảng miền và đường dẫn "trang đăng" không đầy đủ, nên không thay cho permission broker; agent có thể đăng theo kênh khác nếu cổng bỏ sót. Mức duyệt của agent (Ask/Edits/Auto/Full) vẫn là lớp bảo vệ chính.

## 6. Tiêu chí hoàn thành

1. Mỗi agent có tab **Browser** hiển thị trình duyệt Edge/Chrome của nó trực tiếp; Master có tab **Browsers** xem cả đội.
2. Cả 5 agent mở được trang bằng Playwright MCP (đọc snapshot, bấm, gõ); Research ghi được URL gốc cho từng nguồn.
3. Người dùng Take over để đăng nhập một trang, Hand back, và đăng nhập còn giữ ở lần chạy sau; xoá dữ liệu trình duyệt thì mất.
4. Khi bị chặn hoặc cần đăng nhập, agent xin trợ giúp và chờ; không bịa kết quả.
5. Cài đặt "Đăng bài qua" hoạt động theo từng agent: mặc định Composio (không mở trình duyệt để đăng), chọn Web thì đăng bằng trình duyệt.
6. Trình duyệt không vào được địa chỉ nội bộ (kể cả qua chuyển hướng) khi chưa bật cho phép cục bộ; công cụ có tác dụng phụ đi qua permission broker.
7. Không còn code `browser_*` cũ, E2B/`sandbox` và chữ "Computer" trong giao diện; tiếng Anh và tiếng Việt đủ; `pytest`, `pnpm test` qua; README, `install.ps1`, `install.sh` và `docs/` đã cập nhật.


## 7. Kiểm chứng

- Đã kiểm tra trong Edge trên Windows với giao diện tiếng Anh và tiếng Việt. Các lượt thử bao gồm khởi động, nhận ảnh JPEG và luồng SSE, tiếp quản và trả quyền.
- Claude Code, Codex và Antigravity đều mở trang và đọc được tiêu đề, URL qua Playwright MCP. Các lượt thử trên trang cục bộ đã kiểm tra nhập liệu và bấm nút.
- Kiểm thử tự động xác nhận cookie còn sau khi mở lại trình duyệt và hồ sơ bị xoá khi dọn dữ liệu. Cổng mạng chặn localhost kể cả khi đó là đích chuyển hướng.
- Chính sách Composio/Web được kiểm bằng máy chủ MCP mô phỏng và trang thử cục bộ. Chưa chạy thử việc đăng công khai lên X hoặc khởi động trình duyệt trên Linux và macOS.
