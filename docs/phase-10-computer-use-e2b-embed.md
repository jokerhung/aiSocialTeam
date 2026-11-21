# Phase 10 — Computer use bằng E2B (E2B Cloud hoặc tự host E2B Embed); mỗi agent chọn Computer use hoặc Browser use

**Mục tiêu:** đưa lại **Computer use** (máy tính ảo có màn hình đầy đủ, agent nhìn ảnh màn hình rồi bấm, gõ) bằng **E2B**, theo **một trong hai cách do người dùng chọn**: **E2B Cloud** (dịch vụ của E2B, dùng khoá API lấy ở e2b.dev) hoặc **tự host E2B Embed** (bản mã nguồn mở chạy trên máy của bạn, không cần tài khoản). Chỉ hỗ trợ E2B (không hỗ trợ nhà cung cấp sandbox khác). **Người dùng tự thiết lập** (đăng ký lấy khoá hoặc tự cài Embed theo một tệp hướng dẫn `.md` có phần Cloud, Linux và Windows); BotTeam **không cài gì hộ**, và **Computer use mặc định tắt**: chỉ bật được sau khi kết nối E2B thành công. Mỗi agent được **cấu hình riêng** cách làm việc với giao diện: **Computer use** (phase này), **Browser use** (phase 9: Edge/Chrome qua Playwright MCP) hoặc **Tắt**.

**Trạng thái:** Computer use đã triển khai và kiểm thử trên VMware qua Tailscale. Xem mục 7 để biết kết quả, phạm vi đã kiểm và giới hạn của bộ lọc mạng. Giao diện dùng chung luồng Tiếp quản và Trả quyền điều khiển với phase 9.

## 0. Hai cách dùng E2B: Cloud hoặc tự host (Embed)

Cùng một SDK (`e2b-desktop`) và cùng một API; chuyển giữa hai cách chỉ là đổi cấu hình (địa chỉ API, khoá, domain). BotTeam hỗ trợ cả hai qua một cài đặt "Nguồn E2B" (mục 3.4).

| | **E2B Cloud** | **Tự host E2B Embed** |
|---|---|---|
| Người dùng làm gì | Đăng ký tại e2b.dev, lấy `E2B_API_KEY`, dán vào Settings | Tự cài Embed (Linux: Docker; Windows: Docker Desktop + WSL2), dựng mẫu desktop, dán địa chỉ và khoá vào Settings |
| Mẫu máy desktop | Mẫu `desktop` chính thức có sẵn | Phải dựng trên Embed. Đã dựng và tạo máy thử trên VMware (mục 7). |
| Phần cứng | Không cần gì thêm | Linux có **KVM**, 12 GiB RAM trở lên cho riêng Embed |
| Dữ liệu | **Đi qua máy chủ của E2B**: ảnh chụp màn hình, nội dung trang, tệp trong máy ảo, đăng nhập vào các tài khoản mạng xã hội | Nằm trên máy của bạn |
| Chi phí | Theo gói và mức dùng của E2B (có hạn mức và giới hạn thời gian phiên theo gói, xem trang giá hiện hành) | Miễn phí (chỉ tốn máy) |
| Cách ly | Firecracker microVM do E2B vận hành | Firecracker microVM trên máy bạn |
| Điểm yếu | Phụ thuộc dịch vụ ngoài và chi phí; lo ngại riêng tư | Cần KVM, cài đặt phức tạp, tự bảo trì |

Cloud là cách **nhanh nhất để chạy thử** (không cần KVM, hợp Windows 10 hiện tại); tự host dành cho người cần dữ liệu ở lại máy mình. Giao diện hiển thị cảnh báo riêng tư khi chọn Cloud ("ảnh chụp màn hình và nội dung trong máy ảo được gửi tới E2B").

### Tự host: điều kiện bắt buộc (Linux có KVM; Linux: Docker, Windows: Docker Desktop + WSL2)

Đã kiểm tra tài liệu của E2B (`e2b-dev/runtime`, thư mục `embed/`; Apache-2.0, không cần tài khoản hay khoá cấp phép):

- **Chạy được trên:** Linux x86-64 hoặc arm64 có KVM, nhân 6.8 trở lên (arm64 cần 6.10+), Ubuntu 24.04 là khuyến nghị; cần `/dev/kvm`, `/dev/net/tun`, Docker Engine 27+ với Compose 2.24+; **RAM 12 GiB khuyến nghị, 20 GiB đĩa trống**; mạng ra ngoài tới Docker Hub, `us-docker.pkg.dev`, `storage.googleapis.com`, `github.com`.
- **Sandbox là Firecracker microVM**, mỗi cái một máy Linux riêng, có tường lửa ra ngoài theo từng sandbox (danh sách cho phép/chặn miền), tạm dừng và tiếp tục bằng ảnh chụp (giữ nguyên đăng nhập và cửa sổ đang mở).
- **Cách cài (do người dùng tự làm, theo tệp hướng dẫn):** **Linux** → cài **Docker Engine** (`curl -fsSL https://get.docker.com | sh`), rồi chạy `docker compose up` của Embed trực tiếp trên máy; **Windows** → **Docker Desktop (chế độ WSL2) + WSL2**, chạy `docker compose up` của Embed từ một bản phân phối WSL (khuyến nghị Ubuntu 24.04 có bật tích hợp Docker Desktop). Mọi bản phân phối WSL2 và Docker Desktop **dùng chung một nhân Linux**, nên `/dev/kvm` phải có trong nhân đó. BotTeam **không cài, không sửa `.wslconfig`, không chạy `wsl --shutdown`, không đụng tới Docker** của người dùng; nó chỉ nhận **địa chỉ API** và khoá của Embed rồi kiểm tra kết nối. Embed cũng có thể nằm ở máy khác trong LAN/Tailscale.
- **Kết quả kiểm trên máy này (Windows 10 Pro 19045, 2026-11-21):** WSL `3.0.5` (nhân `6.18.58.1-microsoft-standard-WSL2`, đạt yêu cầu ≥ 6.8), Docker Desktop `29.6` (Docker Engine ≥ 27, đạt), RAM 31 GiB, ảo hoá phần cứng bật trong BIOS, `/dev/net/tun` có, cgroup v2 và trang nhớ 4 KiB đạt. **Chưa đạt:** **không có `/dev/kvm`** trong WSL2 (`vmx` = 0 trong `/proc/cpuinfo`): ảo hoá lồng nhau chưa bật; và `C:\Users\<bạn>\.wslconfig` đang đặt `memory=8GB` (Embed khuyến nghị 12 GiB RAM, nên đặt 16GB trở lên cho Embed cùng các máy desktop).
- **Bật KVM trong WSL2:** thêm `nestedVirtualization=true` vào mục `[wsl2]` của `.wslconfig`, rồi `wsl --shutdown` (**làm dừng Docker Desktop và mọi container đang chạy**, nên chỉ làm khi bạn đồng ý) và mở lại. Có báo cáo trên GitHub của WSL rằng **trên Windows 10 22H2 với bản WSL cài từ Microsoft Store (như `3.0.5`) tuỳ chọn này có thể bị bỏ qua**, còn WSL tích hợp sẵn trong Windows 10 (build 19044/19045) thì có hiệu lực; Windows 11 thì hỗ trợ chính thức. CPU cần Intel đời 5 (Broadwell) trở lên hoặc AMD Ryzen. Nếu `/dev/kvm` vẫn không có sau khi bật, phương án là máy Linux khác, Windows 11, hoặc nhân WSL tự dựng (`kernel=` trong `.wslconfig`) có KVM; bước A kiểm việc này trước khi làm gì khác.
- **Embed đổi cấu hình của máy chủ** (nó cần chủ động `host-setup`: hugepages, mô-đun, quyền `privileged` cho container), tài liệu viết cho máy "bạn sở hữu và được phép sửa". Trên Windows, "máy" đó là nhân WSL2 dùng chung với mọi container Docker Desktop khác của bạn (ví dụ các dịch vụ BotTeam/Composio chạy bằng Docker): cần xác nhận Embed không làm hỏng chúng. Ưu tiên chạy trong **một bản phân phối Ubuntu WSL2 riêng** thay vì trong chính phân phối `docker-desktop`; bước A kiểm cả hai.
- **Chưa kiểm chứng được:** tài liệu chính thức của Embed không nói rõ **mẫu `desktop` (Xfce + luồng hình qua noVNC) của E2B Desktop** chạy trên Embed; SDK `e2b-desktop` được mô tả là dùng E2B Cloud (cần `E2B_API_KEY`), còn Embed nói "cùng SDK, cùng API, chuyển sang chỉ là đổi cấu hình" và cho phép **tự dựng template riêng** qua API. Vì vậy bước đầu tiên của phase là một **bài thử khả thi** (mục 4, bước A) trước khi viết mã.

Nếu bài thử ở bước A không đạt (không có `/dev/kvm` dù đã bật ảo hoá lồng nhau, hoặc không dựng được mẫu desktop trên Embed), phase này dừng hoặc chuyển sang chạy Embed ở một máy Linux/Windows 11 khác; agent trong lúc đó chỉ dùng Browser use (phase 9).

**Tham chiếu**

- E2B: `https://github.com/e2b-dev/runtime` (thư mục `embed/`: `README.md`, `compose/README.md`, `docs/REFERENCE.md`), `https://github.com/e2b-dev/desktop` (mẫu desktop, `template/build_prod.py`, ví dụ phát luồng hình), SDK `e2b-desktop` (Python) / `@e2b/desktop` (JS) nằm trong monorepo `e2b-dev/E2B` (`packages/desktop-python`, `packages/desktop-js`).
- Bản tham chiếu `D:\hungnm\github\social-media-ai-agent-main`: `lib/sandbox/e2b.ts`, `agent-sandbox.ts`, `browser.ts`, `lib/ai/tools/computer-action.ts`, `app/api/sandbox/route.ts` (cách nó tạo và dùng máy E2B cho mỗi agent). Bản này không còn mã đó (`web/app/api/sandbox/route.ts` trả 404).
- Web hiện có: `web/components/sandbox/*` (viewer, controller, panel), `web/lib/orchestration/types.ts` (`SandboxView`, `SandboxStatus`, `LiveStatus.sandboxes`), `web/lib/agent-roles.ts` (`computer`), `web/components/agents/agent-panel.tsx`.
- Server: `server/botteam/drivers/proc.py`, `mcp_servers.py`/`mcp_proxy.py` (MCP tích hợp sẵn), `broker.py` (duyệt quyền), `composio.py` (mẫu lưu khoá trong thư mục dữ liệu), `social.py` (cài đặt theo campaign như `social_image_settings`).
- `docs/phase-9-browser-use.md` (Browser use, `BrowserHost`, tab Browser).
- Quy tắc dự án (`AGENTS.md`): cập nhật `README.md`, `install.ps1`, `install.sh` trước khi push; mọi chữ trên web có tiếng Anh và tiếng Việt.

## 1. Quyết định thiết kế

1. **Mỗi agent có một "chế độ làm việc với giao diện"** (`surface`): `computer` | `browser` | `off`. **Computer use mặc định tắt** cho mọi agent: mặc định là `browser` (phase 9, chạy được trên mọi máy). `computer` **chỉ bật được khi kết nối E2B đã được người dùng thiết lập và "Kiểm tra kết nối" thành công** (trạng thái `ready`, có mẫu desktop; Cloud: đã nhập khoá; tự host: đã cài Embed); trước đó lựa chọn bị khoá kèm lý do và liên kết tới hướng dẫn cài. Nếu máy chủ mất kết nối sau này, agent đang ở `computer` báo rõ và giao diện hiện trạng thái, không tự chuyển sang `browser`. Hai chế độ **loại trừ nhau** trên một agent: agent chỉ nhận **một** bộ công cụ giao diện (MCP `playwright` hoặc MCP `computer`), để không lẫn lộn công cụ.
2. **Một MCP tích hợp sẵn tên `computer`**, do BotTeam viết (Python, stdio, qua `mcp_proxy` như phase 9), bọc SDK `e2b-desktop`. Công cụ: `computer_screenshot`, `computer_click` (trái/phải/đôi, toạ độ), `computer_move`, `computer_drag`, `computer_scroll`, `computer_type`, `computer_key` (tổ hợp phím), `computer_launch` (mở ứng dụng/URL), `computer_wait`, `computer_run_command` (chạy lệnh trong máy ảo, chỉ khi mức duyệt cho phép), `computer_read_file` / `computer_write_file` (trao đổi tệp với thư mục làm việc của agent), `computer_request_help` (xin người dùng giúp, dùng chung cơ chế với phase 9). Kết quả hành động trả kèm **ảnh chụp màn hình** (nén JPEG, giới hạn kích thước) để agent nhìn.
3. **Mỗi agent một máy ảo riêng** (mỗi campaign), tạo khi agent gọi công cụ lần đầu, **tạm dừng khi rảnh** (Embed giữ nguyên trạng thái, đăng nhập vẫn còn) và tiếp tục khi cần; **huỷ hẳn** khi campaign kết thúc hoặc bị xoá. Thời gian chờ và giới hạn số máy chạy đồng thời đọc từ cấu hình (Embed mặc định chỉ chứa khoảng tám sandbox `base` cùng lúc với `HUGEPAGES` mặc định; máy desktop nặng hơn, xem mục 5).
4. **Xem trực tiếp và Take over giống phase 9:** cùng tab, cùng nút, cùng thẻ "Agent cần bạn". Máy ảo phát hình qua luồng noVNC của mẫu desktop; web nhúng luồng đó ở chế độ **chỉ xem** (mặc định) hoặc **điều khiển** (sau khi Take over). Khi người dùng đang điều khiển, MCP `computer` từ chối công cụ cho tới khi Hand back.
5. **Địa chỉ luồng hình không phơi cổng 3002 của Embed:** trình duyệt người dùng không nói chuyện thẳng với Embed. Server BotTeam làm **trung gian** (`/api/bots/{id}/computer/stream`, WebSocket/HTTP, chỉ khi có quyền) để chạy được cả khi mở web qua LAN hoặc Tailscale, và để khoá `E2B_API_KEY` không bao giờ ra trình duyệt.
6. **Nguồn E2B, khoá và địa chỉ lưu phía server**, giống khoá Composio: nhập ở Settings, lưu trong thư mục dữ liệu (`BOTTEAM_DATA_DIR`), không trả lại giá trị đã lưu (chỉ hiện gợi ý), đổi khoá thì tải lại. `Nguồn = Cloud` dùng địa chỉ mặc định của E2B Cloud và chỉ cần khoá; `Nguồn = Tự host` cần thêm địa chỉ API và domain của Embed. Có thể ghi đè bằng biến môi trường `E2B_API_URL`, `E2B_API_KEY`, `E2B_DOMAIN` (tên và số biến thật lấy từ `/run/e2b/sdk.env` của Embed hoặc từ tài liệu SDK, xem mục 3.1). Hai nguồn **không dùng cùng lúc**: một thiết lập toàn cục; đổi nguồn thì các máy ảo cũ ở nguồn kia không còn điều khiển được (giao diện cảnh báo và đề nghị xoá).
7. **Tên gọi:** tab/menu đổi theo chế độ của agent: **Computer** (chế độ `computer`) hoặc **Browser** (chế độ `browser`); Master có tab **Screens** (hoặc **Computers**) xem cả đội. Các dịch vụ cũ có chữ "computer" (API `/api/bots/{id}/computer/*` đã có ở server cho trình duyệt cũ) được **tái dùng cho máy ảo thật**; API trình duyệt của phase 9 đứng dưới `/api/bots/{id}/browser/*`.

## 2. Kiến trúc

```
Web (tab Computer)             BotTeam server                         máy chủ Embed (Linux + KVM)
  ├ khung hình ◄── noVNC ◄── ComputerHost ──E2B SDK──► api (3000) ──► Firecracker microVM "desktop"
  ├ chuột/phím (Take over) ─►  /api/bots/{id}/computer/…                │  Xfce + Chrome + noVNC
  └ Take over / Hand back          │                                    ▲
                                   └─ mcp_proxy ─► MCP "computer" ──────┘  (engine của agent gọi công cụ)
```

- **`ComputerHost`**: quản vòng đời máy ảo của từng agent (tạo, tiếp tục, tạm dừng, huỷ), khoá `control` (`agent` | `person`), phát sự kiện trạng thái lên bus, giữ cổng luồng hình, kiểm tra kết nối tới Embed.
- **MCP `computer`**: tiến trình stdio con của lượt chạy (qua `mcp_proxy`), nói chuyện với `ComputerHost` qua socket cục bộ (cùng kiểu `mcp_bridge`), không giữ khoá Embed trong môi trường.
- **Embed** là dịch vụ riêng (Docker Compose trên máy Linux); BotTeam chỉ là **khách hàng của API** `E2B_API_URL`.

## 3. Công việc

### 3.1 Server — kết nối E2B (Cloud hoặc Embed), máy ảo, MCP `computer`

- [x] **Bài thử khả thi (bước A):** dựng mẫu `desktop` trên E2B tự host có KVM. Tạo máy bằng `e2b-desktop`, kiểm ảnh, bấm, gõ, Chrome, noVNC và giữ phiên sau khi tạm dừng rồi khôi phục. Ghi số đo, lỗi và các lệnh chạy trên VMware vào mục 7.
- [ ] `ComputerHost`: `Sandbox.create/connect/pause/kill` qua SDK Python `e2b-desktop` (thêm vào phụ thuộc server, bản **cố định**), chạy các lời gọi chặn của SDK trong luồng riêng (`asyncio.to_thread`) để không làm đứng vòng lặp sự kiện; tạo theo yêu cầu, tạm dừng khi rảnh quá `BOTTEAM_COMPUTER_IDLE_S`, tiếp tục khi có công cụ gọi tới, huỷ khi campaign kết thúc/xoá (móc vào `DELETE /api/social/campaigns/{id}` và `end`), dọn máy mồ côi khi server khởi động (tìm theo siêu dữ liệu `botteam=<bot id>` đặt lúc tạo).
- [ ] MCP `computer` (mục quyết định 2): ánh xạ công cụ → SDK (`screenshot`, `left_click`, `double_click`, `right_click`, `move_mouse`, `drag`, `scroll`, `write`, `press`, `launch`, `wait`, `commands.run`, `files.read/write`). Ảnh chụp: đổi cỡ về tối đa ~1280×800, JPEG chất lượng ~70, ghi rõ kích thước ảnh trong kết quả để toạ độ khớp.
- [ ] **Kiểm tra engine nhận được ảnh từ công cụ MCP:** Claude Code, Codex và Antigravity (ACP) xử lý kết quả công cụ dạng ảnh khác nhau; mô hình phải **có khả năng nhìn ảnh**. Bước A kiểm từng engine; engine hoặc mô hình không nhận ảnh thì chế độ `computer` bị khoá trong Settings kèm lý do.
- [ ] Cài đặt toàn cục "Máy chủ Computer": `GET/PUT /api/computer/host` (`apiUrl`, `apiKey` ẩn, `domain`, `template`, `maxMachines`, `idleSeconds`), `POST /api/computer/host/test` (gọi API Embed: xác thực, đọc danh sách template, kiểm tra có mẫu desktop, đo độ trễ) và trạng thái `ready | unreachable | no_template | unauthorized`.
- [ ] Cài đặt theo agent (mục 3.4): `surface`, `idleSeconds`, `resolution`; bảng `social_surface_settings(campaign_id, role, surface, …)` (gộp với `social_browser_settings` của phase 9 thành một bảng "giao diện" theo agent, có migration từ bảng phase 9 nếu đã có).
- [ ] Khi `surface` đổi: gỡ MCP cũ, gắn MCP mới cho bot, làm mới soul (`soul_for` + `refresh_souls`), tạm dừng/huỷ máy ảo hoặc trình duyệt của chế độ cũ.
- [ ] API: `/api/bots/{id}/computer` (trạng thái), `/wake`, `/sleep`, `/control` (take over/hand back), `/input` (chuột/phím khi người dùng điều khiển, nếu không dùng thẳng noVNC), `/stream` (trung gian luồng hình), `/screen` (ảnh tĩnh để xem trước). Sự kiện bus `computer-control` giữ nguyên tên.
- [ ] Trao đổi tệp: tệp agent tạo trong máy ảo (ảnh, tài liệu) được sao ra thư mục làm việc của agent hoặc `<data>/social-media` khi agent gọi `computer_read_file`; ngược lại tệp media của bài đăng chuyển vào máy ảo để tải lên một trang web. Giới hạn kích thước.

### 3.2 Bảo mật và quyền

- [ ] **Máy ảo cô lập** (Firecracker): không có đường vào máy chủ Embed hay máy BotTeam; **tường lửa ra ngoài theo sandbox** (tính năng của Embed): mặc định cho phép Internet nhưng **chặn mạng riêng và địa chỉ của chính BotTeam/Embed** (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`, địa chỉ LAN/Tailscale của máy này), có danh sách cho phép/chặn miền cấu hình được.
- [ ] **Permission broker:** `computer_click`, `computer_type`, `computer_key`, `computer_launch`, `computer_run_command`, `computer_write_file` là hành động có tác dụng phụ; `screenshot`, `wait`, `move`, `scroll`, `read_file` chỉ đọc. Theo mức duyệt của agent (Ask/Edits/Auto/Full); `computer_run_command` mặc định chỉ ở mức Full hoặc cần duyệt từng lệnh.
- [ ] **Nội dung trên màn hình là dữ liệu không đáng tin** (prompt injection qua trang web, văn bản trên ảnh): soul dặn bỏ qua lệnh nằm trong nội dung màn hình; không nhập mật khẩu hay mã thanh toán, xin người dùng làm (Take over).
- [ ] Khoá `E2B_API_KEY` và địa chỉ API chỉ ở server; luồng hình đi qua trung gian có kiểm quyền; `X-Forwarded`/Host theo `web/proxy.ts`.
- [ ] Đăng nhập nằm trong máy ảo tạm dừng (ảnh chụp trong thư mục dữ liệu của Embed): ghi rõ vị trí và cách xoá (huỷ máy ảo = mất đăng nhập); không đưa vào sao lưu chia sẻ hay file xuất/nhập bot.

### 3.3 Web

- [ ] Khôi phục tab **Computer** (đã có `components/sandbox/*`): nối lại với API mới của server thay cho `/api/sandbox` (route Next `app/api/agents/computer/*` làm trung gian giống `/api/agents/model`). Giữ giao diện viewer (xem / đăng nhập / Take over) đã có.
- [ ] **Tên tab theo chế độ của agent:** `computer` → "Computer", `browser` → "Browser", `off` → không có tab. Master: tab "Screens" xem nhanh các màn hình của 4 agent (kể cả Browser và Computer), mỗi ô ghi loại.
- [ ] `LiveStatus.sandboxes` → `surfaces`: `{ agentId, surface, status: none|starting|running|paused|killed|error, control: agent|user, url, helpReason }`; `hasComputer`/`computer` trong `agent-roles.ts` đổi thành đọc theo cài đặt của campaign, không cố định theo vai trò. Popover của agent trong office hiển thị "Đang dùng máy tính" hoặc "Đang duyệt web".
- [ ] Thẻ "Agent cần bạn" (đăng nhập, CAPTCHA, xác minh): giữ luồng `waiting_for_user` đã có; nút mở viewer đúng loại (Computer hoặc Browser).
- [ ] Trạng thái "Máy chủ Computer chưa sẵn sàng" khi chọn `computer` mà Embed không truy cập được: thông báo rõ, nút "Thử lại" và liên kết tới cài đặt.
- [ ] Mọi chữ có tiếng Việt (`vi.ts`), chạy `pnpm test:web`.

### 3.4 Cài đặt

**Settings → Integrations (hoặc mục "Computer") — Máy chủ Computer (toàn cục):**
- [ ] Mục **Máy chủ Computer** (toàn cục): **Nguồn E2B** (`E2B Cloud` / `Tự host (Embed)`), trạng thái (`chưa thiết lập` · `ready` · `unreachable` · `unauthorized` · `no_template`), `Khoá API`, và với Tự host thêm `Địa chỉ API (E2B_API_URL)`, `Domain`; `Mẫu máy ảo (template)` (mặc định `desktop`), số máy tối đa, thời gian rảnh trước khi tạm dừng; nút **Kiểm tra kết nối**; **liên kết "Hướng dẫn thiết lập"** mở tệp hướng dẫn `.md` đúng phần (Cloud, Linux, Windows) (mục 3.6); cảnh báo riêng tư khi chọn Cloud. **Không** có nút cài đặt, không in lệnh cài trong giao diện: chỉ liên kết.
- [ ] Không có nút dựng mẫu desktop trong giao diện: ở **Cloud** mẫu `desktop` đã có; ở **tự host** việc dựng mẫu nằm trong tệp hướng dẫn (người dùng tự làm); "Kiểm tra kết nối" chỉ **kiểm tra** có mẫu desktop hay chưa và báo `no_template` kèm liên kết tới đúng bước trong hướng dẫn.

**Tab Settings của từng agent — "Cách làm việc với giao diện":**
- [ ] Chọn **Browser use** (Edge/Chrome qua Playwright MCP, mặc định) / **Computer use** (máy ảo E2B Embed, **mặc định tắt**) / **Tắt**. `Computer use` **bị khoá cho tới khi máy chủ Computer ở trạng thái `ready`**; khi khoá hiện lý do (chưa cài / chưa kết nối / chưa có mẫu desktop / engine hoặc mô hình của agent không nhìn được ảnh) và liên kết "Hướng dẫn cài đặt".
- [ ] Với Computer use: độ phân giải (mặc định 1280×800), thời gian rảnh, cho phép chạy lệnh trong máy ảo (mặc định tắt), nút **Xoá máy ảo (mất đăng nhập)**.
- [ ] Với Browser use: các mục của phase 9 (Edge/Chrome, hiện cửa sổ, đăng bài qua Composio hoặc Web…).
- [ ] Mặc định theo vai trò khi tạo campaign mới: tất cả `browser`; **không agent nào mặc định `computer`**; người dùng tự đổi từng agent sau khi đã thiết lập xong E2B (Cloud hoặc tự host).

### 3.5 Hướng dẫn (soul) theo chế độ

- [ ] `soul_for()` thêm đoạn theo `surface`: `browser` → nhắc dùng công cụ Playwright MCP và `browser_request_help`; `computer` → nhắc quy trình nhìn–làm–kiểm tra (chụp màn hình, một hành động, chụp lại), dùng toạ độ theo ảnh chụp, xin người dùng giúp bằng `computer_request_help` khi gặp đăng nhập/CAPTCHA; `off` → không nhắc, không có công cụ giao diện.
- [ ] `refresh_souls()` làm mới khi đổi chế độ (chỉ soul chưa sửa tay), như đã làm cho Posts API và ảnh.
- [ ] Việc **đăng bài** (Composio hay Web, phase 9 mục 3.6) áp dụng cho cả hai chế độ: `Web` nghĩa là đăng bằng giao diện (trình duyệt hoặc máy ảo tuỳ `surface`).

### 3.6 Cài đặt, tài liệu, máy mới

- [ ] **Tệp hướng dẫn thiết lập E2B do người dùng tự làm**, một cặp theo ngôn ngữ giao diện: `docs/e2b-setup.vi.md` và `docs/e2b-setup.en.md` (nội dung giống nhau), chia **ba phần**: **(A) E2B Cloud** (đăng ký, lấy khoá, gói và hạn mức, cảnh báo riêng tư, nhập vào Settings, Kiểm tra kết nối); **(B) Tự host trên Linux**: kiểm tra `/dev/kvm`, nhân ≥ 6.8, cài Docker Engine (`get.docker.com`), nhóm `docker`, tải `compose.yaml` và `.env` của `e2b-dev/runtime` ở **tag/commit cố định**, `docker compose up -d --wait`, đọc `/run/e2b/sdk.env`; **(C) Tự host trên Windows**: bật ảo hoá trong BIOS, WSL2 (`wsl --version`), Docker Desktop (chế độ WSL2), Ubuntu 24.04 có tích hợp Docker, `.wslconfig` (`memory` ≥ 16GB, `nestedVirtualization=true`, lưu ý `wsl --shutdown` dừng Docker Desktop), kiểm `/dev/kvm` trong WSL, rồi các bước như Linux trong Ubuntu WSL. Phần chung cho tự host: dựng mẫu desktop trên Embed, mở cổng cho máy khác (3000, 3001, 3002) chỉ cho địa chỉ tin cậy, gỡ cài đặt/dọn dẹp/cập nhật, xử lý lỗi thường gặp (không có `/dev/kvm`, hugepages, `Failed to UFFD object`, hết RAM, `Hash Sum mismatch`). Viết **sau bước A** từ những lệnh đã chạy thật.
- [ ] **Giao diện chỉ đưa liên kết tới hướng dẫn:** web có một trang xem tệp hướng dẫn (route `/guides/e2b`, đọc `docs/e2b-setup.<ngôn ngữ>.md` ở phía server và hiển thị Markdown, có mục lục nhảy tới phần Cloud / Linux / Windows; hoạt động khi không có Internet) **hoặc** liên kết tới tệp trên GitHub nếu không muốn nhúng trình hiển thị Markdown; chọn cách đầu và giữ cách sau làm dự phòng. Tệp được chọn theo ngôn ngữ giao diện (quy tắc dự án mục 4). Liên kết xuất hiện ở Settings → Máy chủ Computer và ở lý do khoá của lựa chọn Computer use.
- [ ] **Không có mã cài đặt trong dự án:** không thêm `deploy/e2b-embed`, không thêm tuỳ chọn vào `install.sh`/`install.ps1`, không thêm `pnpm e2b:*`. `install.ps1`/`install.sh` **không đổi** (kiểm theo quy tắc mục 3: ghi "không cần đổi" khi commit vì E2B là tuỳ chọn người dùng tự thiết lập).
- [ ] `.env.example`: chú thích rằng E2B (tuỳ chọn, tự thiết lập) có thể cấu hình bằng `E2B_API_URL`, `E2B_DOMAIN`, `BOTTEAM_COMPUTER_TEMPLATE`, `BOTTEAM_COMPUTER_IDLE_S`; khoá `E2B_API_KEY` nhập qua Settings, không để trong `.env` mẫu.
- [ ] `README.md`: mục "Computer use (E2B Cloud hoặc tự host Embed, tuỳ chọn, mặc định tắt)" có liên kết tới `docs/e2b-setup.en.md`/`.vi.md`, ghi rõ khác biệt riêng tư và chi phí giữa Cloud và tự host, cách chọn chế độ cho từng agent; `docs/user-guide.md`: đăng nhập cho agent bằng Take over, xoá máy ảo, liên kết tới hướng dẫn thiết lập; `docs/README.md`: thêm dòng phase 10 và hai tệp hướng dẫn.

## 4. Giai đoạn triển khai

| Bước | Nội dung | Kiểm |
|---|---|---|
| A | **Bài thử khả thi** (do người dùng/nhà phát triển làm bằng tay trên máy có KVM, theo tệp hướng dẫn nháp): Embed chạy, dựng mẫu desktop, `e2b-desktop` tạo/chụp/bấm/luồng hình/tạm dừng–tiếp tục; kiểm engine nào nhận ảnh từ công cụ MCP; **ghi lại từng lệnh đã chạy** làm bản gốc cho tệp hướng dẫn | Ghi kết quả đo (thời gian, RAM, lỗi) vào mục "Kết quả thử"; **dừng phase nếu không đạt** |
| B | Cài đặt máy chủ Computer (lưu khoá, kiểm tra kết nối, trạng thái) + `ComputerHost` (tạo, tiếp tục, tạm dừng, huỷ, dọn mồ côi) với **E2B giả** cho test | `pytest` với máy chủ E2B giả (HTTP giả và SDK giả); không cần KVM |
| C | MCP `computer` + ảnh chụp + khoá khi `control == person` + `computer_request_help` + broker | Lượt chạy thật với từng engine nhận ảnh: chụp, bấm, gõ, mở trang; Take over chặn công cụ |
| D | Web: tab Computer nối lại (viewer, Take over/Hand back), trung gian luồng hình, `LiveStatus.surfaces`, tab Screens của Master | `tsc`, `pnpm test:web`, chụp màn hình Edge Anh + Việt; xem qua IP LAN |
| E | Cài đặt theo agent (`surface`), đổi chế độ gỡ/gắn MCP, soul và `refresh_souls`, migration bảng cài đặt từ phase 9 | Test server cho endpoint và đổi chế độ; thử đổi Research giữa Browser và Computer |
| F | Tường lửa ra ngoài theo sandbox, giới hạn số máy, dọn khi kết thúc campaign, trao đổi tệp | Máy ảo không truy cập được `127.0.0.1`/LAN; kết thúc campaign huỷ máy |
| G | Tệp hướng dẫn `docs/e2b-setup.{vi,en}.md` (Windows + Linux) từ các lệnh của bước A, trang `/guides/e2b` và các liên kết trong giao diện, README, user-guide, `.env.example`, dọn code E2B cũ | `pytest` + `pnpm test` toàn bộ; một người khác làm theo hướng dẫn trên máy sạch (Windows và Linux) tới khi "Kiểm tra kết nối" báo `ready` |

## 5. Rủi ro và câu hỏi mở

- **KVM trong WSL2 trên Windows 10:** điều kiện cứng và hiện **chưa đạt** trên máy này (mục 0). Có thể bật bằng `nestedVirtualization=true` nhưng có báo cáo bị bỏ qua trên Windows 10 với WSL cài từ Store. Nếu không được: máy Linux khác, Windows 11, hoặc nhân WSL tự dựng. Câu hỏi: bạn có đồng ý để tôi hướng dẫn sửa `.wslconfig` (làm dừng Docker Desktop khi `wsl --shutdown`) để thử bật KVM không?
- **Tài nguyên trên Windows:** `memory=8GB` hiện tại của `.wslconfig` không đủ cho Embed (12 GiB) cộng các máy desktop; nâng lên ≥ 16GB làm giảm RAM còn lại cho Windows (máy có 31 GiB).
- **Mẫu desktop trên Embed chưa được tài liệu xác nhận.** Rủi ro lớn nhất; bước A trả lời. Nếu không chạy được, thử dựng mẫu riêng (Ubuntu + Xfce + Chrome + `x11vnc`/noVNC + `xdotool`) bằng `Template.build` và viết lớp điều khiển riêng thay cho `e2b-desktop`.
- **Tài nguyên:** mỗi máy ảo desktop cần nhiều RAM hơn sandbox `base` (cỡ 2–4 GiB/máy). Với 12 GiB, chỉ vài máy cùng lúc; 5 agent bật `computer` đồng thời cần máy chủ lớn hơn (≥ 32 GiB). Giải pháp: tạm dừng khi rảnh, giới hạn số máy chạy, báo rõ khi đầy.
- **Mô hình phải nhìn được ảnh** và engine phải chuyển được ảnh từ công cụ MCP vào mô hình. Nếu một engine không làm được, chế độ `computer` bị khoá cho agent dùng engine đó (xem Settings).
- **Độ chậm và chi phí token:** mỗi bước gửi ảnh, nhiều bước cho một việc; Computer use chậm và tốn hơn Browser use đáng kể. Soul nên dặn dùng Browser use cho việc web thuần và chỉ Computer use cho việc cần ứng dụng ngoài trình duyệt hoặc giao diện không có cây trợ năng.
- **Luồng hình qua LAN/Tailscale:** trung gian của server phải hỗ trợ WebSocket và băng thông thấp; theo dõi độ trễ.
- **Phiên bản Embed và SDK thay đổi nhanh** (E2B 2.x, Embed mới ra): cố định phiên bản/commit, có bài kiểm "khói" (tạo sandbox, chạy lệnh, chụp ảnh) để phát hiện thay đổi.
- **Giấy phép:** Embed và mẫu desktop là Apache-2.0; ghi nguồn trong `NOTICE` nếu phân phối kèm.
- **E2B Cloud: riêng tư, chi phí, phụ thuộc dịch vụ ngoài.** Ảnh chụp màn hình, nội dung trang và đăng nhập vào tài khoản mạng xã hội nằm trên hạ tầng của E2B; có hạn mức và giới hạn thời gian phiên theo gói (kiểm trang giá hiện hành, không ghi con số cố định trong mã). Cần cảnh báo rõ trong giao diện, và dặn agent không nhập mật khẩu (người dùng Take over để đăng nhập). Khi hết hạn mức, tạo máy lỗi: báo rõ, không treo agent.
- **Hai nguồn, một thiết lập:** đổi giữa Cloud và tự host làm mất liên kết với máy ảo cũ; cần dọn (huỷ) máy ở nguồn cũ trước khi đổi, giao diện nhắc điều này.
- **Phiên bản SDK:** SDK `e2b-desktop` phải khớp phiên bản API của Cloud hoặc Embed; cố định phiên bản và kiểm trong "Kiểm tra kết nối".
- **Phạm vi:** chỉ máy Linux ảo (Xfce). Windows/macOS ảo hay điều khiển **máy thật** của người dùng nằm ngoài phạm vi.

## 6. Tiêu chí hoàn thành

1. Người dùng **tự thiết lập** E2B theo hướng dẫn: Cloud (dán khoá) **hoặc** tự host Embed (Windows: Docker Desktop + WSL2; Linux: Docker); nhập vào Settings, bấm **Kiểm tra kết nối** thấy `ready` và có mẫu desktop. Trước khi đạt điều đó, **Computer use bị khoá** ở mọi agent và giao diện chỉ đưa **liên kết tới hướng dẫn**, không có nút hay lệnh cài đặt.
2. Mỗi agent chọn được **Computer use / Browser use / Tắt** trong Settings; đổi chế độ thì công cụ, tab và soul đổi theo, không còn công cụ của chế độ cũ.
3. Agent ở chế độ Computer use chụp màn hình, bấm, gõ, mở ứng dụng và trang web trong máy ảo; người dùng xem trực tiếp, Take over để đăng nhập và Hand back; đăng nhập còn sau khi máy ảo tạm dừng rồi tiếp tục.
4. Khi bị chặn hoặc cần đăng nhập, agent xin trợ giúp và chờ; công cụ có tác dụng phụ đi qua permission broker; máy ảo không truy cập được mạng nội bộ hay chính BotTeam/Embed.
5. Khi E2B không truy cập được (Cloud hết hạn mức/khoá sai hoặc Embed tắt), agent ở chế độ Computer báo rõ và giao diện hướng dẫn xử lý; không ảnh hưởng agent ở chế độ Browser.
6. Kết thúc hoặc xoá campaign huỷ máy ảo của nó; khởi động lại server dọn máy mồ côi.
7. Không lộ khoá E2B ra trình duyệt; tiếng Anh và tiếng Việt đủ (cả hai tệp hướng dẫn); `pytest`, `pnpm test` qua; README, `.env.example`, `docs/` đã cập nhật; `install.ps1`/`install.sh` được kiểm và ghi "không đổi".

## 7. Kết quả thử (điền ở bước A)

Kiểm tra chỉ đọc trên máy Windows ngày 2026-11-21. `wsl.exe -l -q` chỉ liệt kê `docker-desktop`. Kiểm tra `/dev/kvm` trong WSL cho thấy thiết bị này chưa có. Cấu hình WSL vẫn giới hạn RAM ở 8 GB. Chưa có thông tin kết nối E2B Cloud hoặc Embed trong cấu hình dự án.

Cập nhật bước A trên máy VMware. API Embed tại `http://100.79.177.78:3000` trả HTTP 200 cho `/health` và cho danh sách template sau khi xác thực. Danh sách chỉ có mẫu `base` ở trạng thái `ready`. Cổng 3002 nhận kết nối HTTP.

Đã thử dựng mẫu E2B Desktop chính thức từ commit `91f23acaab7312e847596acc44e6f7763f56917f` với 2 vCPU và 2 GiB RAM. SDK dừng ở bước tải tệp vì Embed trả địa chỉ upload tại `localhost:5008` của máy VMware. Bước dựng mẫu cần chạy trên VMware hoặc qua đường hầm SSH loopback được E2B hướng dẫn. Bước A vẫn chờ xác nhận một mẫu desktop ở trạng thái `ready`.

Đã xác nhận SSH bằng tài khoản `jkhung`. VMware chạy x86-64, có 8 vCPU, khoảng 14,5 GiB RAM và `/dev/kvm`. Sau khi VMware khởi động lại, API và proxy chưa chạy. Đã lưu bản sao các log trước đó và khởi động lại bằng script E2B có sẵn trên máy ảo.

API đã phục hồi. Lượt dựng mẫu `desktop` chạy trực tiếp trên VMware đã vượt qua bước tải tệp và cài gói Xfce. Orchestrator báo `no space left on device` khi ghi snapshot ở bước 7/27. Phân vùng gốc `/dev/sda3` chiếm khoảng 39,5 GiB trên đĩa 80 GiB và chỉ còn khoảng 195 MiB trống sau lỗi. Kiểm thử SDK dừng khi mẫu báo lỗi, trước khi tạo máy desktop.

Sau khi mở rộng đĩa, `lsblk` xác nhận `/dev/sda3` là 79,5 GiB và `df -h /` báo hệ thống tệp 78 GiB, còn 44 GiB trống trước khi dựng lại. API `/health` trả HTTP 200. Lượt dựng lại dùng lớp cache đến bước 6/27 rồi dừng ở bước 7/27. Log NBD cho thấy một số snapshot được tham chiếu trong cache đã thiếu sau lượt hết đĩa. Đã chạy lại công thức chính thức trên VMware với `Template.build(template_with_user_workdir, name="desktop", cpu_count=2, memory_mb=2048, skip_cache=True)`.

Lượt bỏ toàn bộ cache dựng lại lớp Xfce rồi dừng ở bước 6/27 vì `envd` quá thời gian khi khôi phục máy dựng. Lượt phục hồi dùng cache Xfce mới và chèn `.skip_cache()` ngay trước `.pip_install("numpy")` trong bản công thức nạp vào bộ nhớ. Cách này buộc E2B dựng lại lớp NumPy từ lần khởi động mới và bỏ qua cache cũ cho các bước sau, giữ nguyên nội dung mẫu.

Lượt phục hồi hoàn tất cả 27 bước, đóng gói và tối ưu mẫu trong 5 phút 23 giây. Đã giải phóng 2,5 GiB cache biên dịch Go khi phân vùng gốc gần đầy. Sau khi dựng xong còn 4,6 GiB. SDK trên Windows tìm mẫu qua `GET /v2/templates` (lấy bí danh `desktop` hoặc tên kèm namespace), tạo được máy trong khoảng 15 giây qua Tailscale và chụp ảnh 1280×800. SDK dùng `E2B_API_URL=http://100.79.177.78:3000` và `E2B_SANDBOX_URL=http://100.79.177.78:3002`.

Bài thử desktop chạy bằng `e2b-desktop==2.7.2` với `Sandbox.create(template=..., resolution=(1280, 800), timeout=420, secure=True, allow_internet_access=False)`. Tạo tệp rỗng trong máy thử, gọi `launch` để mở Gedit, bấm vào vùng soạn thảo, gõ nội dung và lưu bằng Ctrl+S. Sau `pause(mode="full")` và `connect(timeout=180)`, cửa sổ Gedit và nội dung đã lưu vẫn còn. Đã huỷ từng máy thử bằng `kill()`.

Bật noVNC có mật khẩu với `stream.start(port=6080, require_auth=True)`. Từ Windows qua proxy của E2B, `GET /vnc.html` trả HTTP 200 và WebSocket `/websockify` trả phiên bản giao thức RFB. Proxy dùng header `E2b-Sandbox-Id` và `E2b-Sandbox-Port`. Khung xem và điều khiển qua trung gian BotTeam thuộc bước D.

Bài thử ảnh MCP độc lập dùng một công cụ stdio trả duy nhất một ảnh PNG có mã ngẫu nhiên. Codex CLI `0.166.0`, Claude Code `2.1.329` và Antigravity qua ACP đều gọi công cụ và đọc đúng mã.

Bài thử phiên Chrome dùng máy ảo riêng với cấu hình mạng mặc định của SDK. Khởi động `google-chrome-stable` trong `dbus-run-session` với hồ sơ tạm, `--password-store=basic`, `--disable-gpu`, `--disable-dev-shm-usage`, `--disable-background-networking`, `--ozone-platform=x11` và cổng DevTools chỉ nghe trong máy ảo. Chrome mở trang thử tại `127.0.0.1:8765`, nhận cookie phiên, rồi đọc được cookie trong tab mới sau khi `pause(mode="full")` và `connect()`. Lượt thử này không dùng tài khoản thật. Các lượt trước với `allow_internet_access=False` và cấu hình khởi động khác mở được cửa sổ Chrome nhưng chưa tải được trang thử.

| Mục | Kết quả |
|---|---|
| **E2B Cloud:** tạo máy từ mẫu `desktop` có sẵn, chụp/bấm/luồng hình, tạm dừng–tiếp tục, giới hạn theo gói | |
| **Tự host:** máy chủ Embed (CPU, RAM, hệ điều hành, cách bật KVM) | VMware, Linux Mint 22.3, kernel `7.0.0-43-generic`, 8 vCPU, khoảng 14,5 GiB RAM, có `/dev/kvm`. Runtime từ mã nguồn `2c662b9`. |
| Dựng được mẫu `desktop` trên Embed | `ready`. Công thức chính thức ở commit `91f23ac`, chạy với E2B Python SDK `2.64.0`, 2 vCPU và 2 GiB RAM. |
| Thời gian tạo / tiếp tục / tạm dừng một máy desktop | Tạo khoảng 10–15 giây. Tạm dừng 0,8–1,1 giây. Khôi phục và kiểm lại cửa sổ, tệp hoặc phiên Chrome trong 5,5–10,0 giây. |
| RAM mỗi máy desktop, số máy tối đa | Mẫu cấp 2 GiB. `MemTotal` 2.039.444 KiB, `MemAvailable` 1.477.648 KiB sau khi mở Gedit và luồng noVNC. Thử một máy tại một thời điểm. |
| Luồng noVNC (xem, điều khiển) qua trung gian | Proxy E2B qua Tailscale trả HTTP 200 và nhận kết nối WebSocket đến RFB. |
| Engine nhận ảnh từ công cụ MCP: Claude Code / Codex / Antigravity | Đạt với ảnh PNG từ MCP stdio và mô hình mặc định của từng CLI đã cài. |
| Đăng nhập còn sau tạm dừng–tiếp tục | Cookie phiên thử nghiệm vẫn có hiệu lực khi mở tab mới sau khi tiếp tục. |

### Kết quả tích hợp vào BotTeam

- API BotTeam nhận được mẫu `desktop` ở trạng thái `ready` và đo khoảng 0,3 giây cho lượt kiểm tra qua Tailscale. Lượt thử API đã tạo, tạm dừng, kết nối lại và xoá đúng một sandbox. Cấu hình E2B Embed cũng đã được lưu cho app đang chạy trên cổng 5499. Khoá chỉ ở máy chủ BotTeam.
- Claude Code, Codex và Antigravity gọi được `computer_screenshot` qua MCP tích hợp của ứng dụng và nhận ảnh từ một máy E2B thật. Trên máy thử, XFCE có thể trả khung nền đen ngay khi trình quản lý cửa sổ mới khởi chạy. BotTeam đợi thêm 2,5 giây khi tạo máy để khung hình đầu có thời gian hiển thị.
- Trên Edge qua IP Tailscale, đã đổi Research sang Computer, đánh thức máy, xem noVNC, Tiếp quản, Trả quyền điều khiển, tạm dừng và tiếp tục. Luồng VNC phía máy ảo chạy ở chế độ chỉ xem. Input qua API bị từ chối trước khi Tiếp quản. Proxy E2B từ chối luồng không có token. Đã mở trang cài đặt và hướng dẫn ở cả tiếng Anh và tiếng Việt.
- Kết thúc campaign thử đã xoá máy ảo của Research. Các môi trường thử đã được dọn. Chín bài kiểm tra server cho Computer use, `pnpm test:web` và TypeScript đã đạt.
- Máy ảo thử nghiệm với danh sách chặn CIDR báo hết thời gian khi truy cập API E2B và web BotTeam qua IP Tailscale. Runtime chấp nhận cả CIDR IPv4 và IPv6. Ở commit thử nghiệm, `denyOut` chỉ nhận địa chỉ IP và CIDR. `allowOut` ưu tiên hơn `denyOut`. BotTeam dùng chặn CIDR để giữ mạng riêng khỏi máy ảo. Bộ lọc theo tên miền vẫn chưa triển khai. [Đặc tả mạng của E2B](https://github.com/e2b-dev/runtime/blob/2c662b902d061bee7b88d408477bed5d05107934/spec/openapi.yml).
- E2B Cloud đã kiểm bằng HTTP giả. Lượt kiểm thử thật dùng Embed trên VMware. Bản Compose ghim theo commit đã qua `docker compose config --quiet`. Việc cài từ đầu trên một máy Linux hoặc WSL2 khác vẫn cần lượt kiểm riêng.
