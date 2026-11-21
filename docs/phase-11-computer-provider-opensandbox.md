# Phase 11 — Lớp ComputerProvider: giữ E2B, thêm OpenSandbox (Docker) cho Computer use nhẹ hơn

**Mục tiêu:** tách phần "máy tính ảo" của Computer use khỏi E2B bằng một lớp **`ComputerProvider`**, giữ nguyên E2B (Cloud và Embed) và **thêm OpenSandbox** của Alibaba chạy ở **chế độ Docker** trên một máy Linux. Lý do: E2B Embed nặng (cần KVM, khuyến nghị 12 GiB RAM, hugepages, mười hai cổng); OpenSandbox Docker chỉ cần Docker, sandbox là container, mà vẫn có API vòng đời tương tự (tạo, chạy lệnh, tệp, huỷ, tường lửa ra ngoài theo từng máy, volume). Người dùng **chọn một nhà cung cấp cho toàn bộ Computer use** trong Settings; mặc định vẫn là **Tắt** như phase 10.

**Trạng thái:** đã triển khai (2026-11-21), kèm các điều chỉnh ghi ở mục 8; OpenSandbox đã cài và chạy thật trên cùng máy với E2B Embed (mục 7). **Phụ thuộc phase 9 (Browser use) và phase 10 (Computer use bằng E2B, đã có mã chạy):** phase này **không đổi** hành vi của E2B; nó chỉ rút giao diện chung ra rồi thêm một nhà cung cấp.

**Phạm vi:** chỉ hai họ nhà cung cấp: **E2B** (Cloud hoặc Embed tự host) và **OpenSandbox (Docker, tự host)**. Không thêm AIO Sandbox, Cua, microsandbox, Daytona, Bytebot, AgentDesk (đã cân nhắc và loại ở các cuộc trao đổi trước: một số đã archived hoặc không còn cập nhật, số khác không phải sandbox có vòng đời đầy đủ).

## 0. Điều đã kiểm tra về OpenSandbox (tài liệu chính thức, `alibaba/OpenSandbox`)

- **Đang hoạt động:** Apache-2.0, dự án của AAIF, commit gần đây, hơn 17 nghìn sao.
- **Cài:** `uvx opensandbox-server init-config ~/.sandbox.toml --example docker` rồi `uvx opensandbox-server`; yêu cầu Docker và Python 3.10 trở lên. Chế độ chạy: `runtime.type = "docker"` hoặc `"kubernetes"`.
- **SDK Python bất đồng bộ** `opensandbox` (`pip install opensandbox`): `Sandbox.create(image, ...)`, `sandbox.commands.run(...)`, `sandbox.files.write_files/read_file/...`, `sandbox.renew(...)`, `sandbox.pause()` / `Sandbox.resume(...)`, `sandbox.get_endpoint(port)`, `sandbox.destroy()`/`kill()`. Có ghi `sandbox_timeout` (mặc định 10 phút) và chính sách tự gia hạn khi có truy cập.
- **Mạng ra ngoài theo từng sandbox:** chính sách `networkPolicy` (cho phép/chặn theo tên miền, IP, CIDR, cổng), thực thi ở tầng DNS và nftables (`dns+nft`), mặc định đóng nếu không cài được (fail-closed); quản trị viên đặt được "sàn" chặn mà người dùng không ghi đè được.
- **Cách ly:** mặc định `runc` (container thường, chỉ nên cho việc đáng tin); có thể bật `gVisor`, `Kata` hoặc `Firecracker` bằng mục `[secure_runtime]` của máy chủ (cần Linux; Kata và Firecracker cần KVM).
- **Desktop:** ví dụ chính thức `examples/desktop` (image Docker có Xvfb, XFCE, x11vnc, người dùng không phải root, kèm noVNC/websockify); **không** có lớp hành động chuột/phím/chụp ảnh như `e2b-desktop`.
- **Điều chưa rõ và phải đo ở bước A:** (1) **tạm dừng/tiếp tục ở chế độ Docker**: tài liệu "Pause & Resume" viết cho Kubernetes (commit rootfs thành ảnh OCI), chưa nói Docker; (2) độ trễ mỗi lệnh `commands.run` qua HTTP; (3) ở chế độ Docker, máy chủ chỉ nhận `mode = "direct"` cho ingress, nên địa chỉ truy cập sandbox là cổng trực tiếp trên máy chủ (cần kiểm tra mở cổng và HTTPS); (4) hai cách xác thực (`OPEN-SANDBOX-API-KEY`) khi chạy nhiều người.

## 1. Hiện trạng mã (đọc từ thư mục làm việc)

| Phần | Tệp | Phụ thuộc E2B |
|---|---|---|
| Vòng đời máy ảo | `server/botteam/computer_host.py` (`ComputerHost`: `wake`, `pause`, `destroy`, `recover`, `shutdown`, `set_control`, `ask_for_help`, `KEEP_AWAKE`) | Gọi trực tiếp `e2b_desktop.Sandbox.create/connect/kill/list`, `current.pause(mode="full")`, metadata chủ sở hữu, `deny_out`, `traffic_access_token` |
| Công cụ cho agent | `server/botteam/computer_mcp.py` (`TOOLS`, `perform`, `ComputerMcp`) | `perform()` nhận đối tượng `Sandbox` của E2B: `left_click`, `move_mouse`, `drag`, `scroll`, `write`, `press`, `launch`, `commands.run`, `files.read/write`, `screenshot`; câu lỗi ghi "The E2B computer…" |
| Luồng hình | `server/botteam/computer_stream.py` (`ensure_viewer`, `upstream`, `relay`) | x11vnc + noVNC cổng 6080, `E2b-Traffic-Access-Token`, `E2b-Sandbox-Id` |
| Cấu hình | `server/botteam/computer_settings.py` (`Connection`, `ComputerHostSettings.test`) | Nguồn `cloud`/`embed`, địa chỉ API, khoá, mẫu `desktop` |
| API và giao diện | `server/botteam/main.py` (`/api/computer/host`, `/api/bots/{id}/computer/*`), `web/components/browser/computer-host-settings.tsx`, `browser-settings.tsx`, `browser-panel.tsx`, `computer-screen.tsx`, hướng dẫn `docs/e2b-setup.{vi,en}.md` | Chữ "E2B" trong giao diện và thông báo lỗi |
| Bản ghi | `config["computerMachines"][bot] = {sandboxId, provider:[nguồn, api, sandbox, domain], status, resolution}` | `provider` đã là danh định kết nối, dùng được để nhận biết nhà cung cấp |

## 2. Quyết định thiết kế

1. **Hai giao diện nhỏ thay cho việc gọi thẳng SDK**:
   - **`ComputerProvider`** (cấp nhà cung cấp, bất đồng bộ): `identity()`, `capabilities()`, `test()` (trạng thái kết nối), `create(bot_id, resolution, owner, label) -> MachineRecord`, `connect(record) -> Machine`, `pause(record)`, `kill(record)`, `list_owned(owner) -> [record]`.
   - **`Machine`** (cấp một máy, bất đồng bộ): `screenshot() -> bytes (PNG)`, `click(x, y, button)`, `move`, `drag`, `scroll`, `type_text`, `press(keys)`, `launch(app, url)`, `wait`, `run_command`, `read_file`, `write_file`, `keep_awake()`, `ensure_viewer()`, `viewer_target() -> (url, headers)`.
   - Hành vi chung (khoá `control`, idle, chính sách quyền, kiểm tra toạ độ, giới hạn tệp 10 MB, đường dẫn tệp chỉ trong `/home/user` hoặc `/tmp`) nằm ở **`ComputerHost` và `perform()`**, không lặp lại trong từng nhà cung cấp.
2. **`E2BProvider` bọc nguyên mã hiện tại** (đổi chỗ, không đổi hành vi): `Sandbox.create/connect/kill/list/pause`, `deny_out`, siêu dữ liệu chủ sở hữu, `KEEP_AWAKE`, luồng noVNC với tiêu đề `E2b-*`. Phần gọi SDK đồng bộ được bọc bằng luồng nền (`asyncio.to_thread`) bên trong `E2BMachine` để giao diện chung đều bất đồng bộ. **Toàn bộ test hiện có của E2B phải qua mà không sửa mong đợi.**
3. **`OpenSandboxProvider` dùng SDK bất đồng bộ `opensandbox`**: tạo máy từ **image desktop do người dùng dựng** (mục 3.4), chạy `xdotool` và công cụ chụp ảnh bằng `commands.run`, đọc ảnh PNG bằng `files.read_file`. Một Python phụ thuộc mới: `opensandbox` (cố định phiên bản).
4. **Một nhà cung cấp cho toàn bộ Computer use** (cài đặt toàn cục): `e2b-cloud` | `e2b-embed` | `opensandbox`. Không trộn theo từng agent (giữ đơn giản). Đổi nhà cung cấp thì máy ảo cũ ở nhà cung cấp kia không còn điều khiển được: giao diện cảnh báo và đề nghị xoá (phase 10 đã có cơ chế).
5. **Khả năng khác nhau được khai báo, không giả vờ giống nhau.** `capabilities()` trả về: `pause` (`snapshot` | `freeze` | `none`), `egressPolicy` (bool), `secureIsolation` (`vm` | `gvisor` | `container`), `persistentLogin` (`snapshot` | `volume` | `none`). Giao diện hiện đúng điều này trong Settings (ví dụ "OpenSandbox Docker: không giữ cửa sổ đang mở khi tạm dừng, chỉ giữ đăng nhập qua volume").
6. **Đăng nhập bền bằng volume khi không có ảnh chụp bộ nhớ.** Nếu bước A cho thấy Docker không tạm dừng giữ trạng thái: khi rảnh thì **huỷ container nhưng giữ volume** chứa hồ sơ Chrome (`/home/user/.config/google-chrome`); lần wake sau tạo container mới gắn lại volume. Cửa sổ và tab đang mở mất, đăng nhập thì còn. Đây là khác biệt với E2B và phải ghi rõ.
7. **Không phơi cổng của OpenSandbox ra trình duyệt người dùng:** luồng noVNC đi qua server BotTeam làm trung gian như hiện nay (`/api/bots/{id}/computer/stream`); `Machine.viewer_target()` quyết định địa chỉ và tiêu đề gửi lên OpenSandbox (`get_endpoint(6080)` + khoá API nếu cần). Khoá API chỉ ở server.
8. **Tường lửa ra ngoài bắt buộc:** khi tạo sandbox OpenSandbox truyền `networkPolicy` chặn các dải riêng (`PRIVATE_NETWORKS` đã có trong `computer_host.py`) và địa chỉ của chính BotTeam, của máy chủ OpenSandbox. Nếu máy chủ không bật egress hoặc tạo không được chính sách thì **không tạo máy** (fail-closed), trừ khi người dùng bật "cho phép địa chỉ nội bộ".
9. **Tên gọi giao diện đổi từ "E2B computer" thành "computer"** (thông báo lỗi, nhãn, hướng dẫn chung); chữ "E2B" và "OpenSandbox" chỉ xuất hiện ở phần chọn nhà cung cấp và hướng dẫn cài.

## 3. Công việc

### 3.1 Server — tách giao diện (không đổi hành vi)

- [ ] Tạo `server/botteam/computer_provider.py`: `Capabilities`, `MachineRecord` (sandbox id, nhà cung cấp, trạng thái, độ phân giải, tuỳ chọn riêng nhà cung cấp), `ComputerProvider` và `Machine` (Protocol hoặc lớp trừu tượng), `ComputerUnavailable` dùng chung.
- [ ] Chuyển phần SDK E2B của `ComputerHost` (`_backend`, `_options`, `_connection_for`, `wake` tạo máy, `pause`, `destroy`, `recover`) vào `server/botteam/computer_e2b.py` (`E2BProvider`, `E2BMachine`); `perform()` đổi sang nhận `Machine` bất đồng bộ.
- [ ] `ComputerHost` giữ: `_live`, `_control`, `_idle`, khoá thao tác, trạng thái, `set_control`, `ask_for_help`, `touch`, `recover` gọi `provider.list_owned`. Nhà cung cấp lấy từ cài đặt toàn cục tại thời điểm wake.
- [ ] `computer_stream.py`: `ensure_viewer` và `upstream` chuyển thành phương thức của `Machine`; `relay` giữ nguyên.
- [ ] Đổi thông báo lỗi sang tên chung ("The computer could not …") và cập nhật các test mong đợi chữ.
- [ ] **Kiểm:** `pytest -k computer` và toàn bộ test phase 10 qua không đổi hành vi; chạy lại thao tác thật trên E2B Embed hiện có (xem, Take over, chụp, bấm).

### 3.2 Server — `OpenSandboxProvider`

- [ ] `server/botteam/computer_opensandbox.py`: tạo `ConnectionConfig` (domain/URL máy chủ, giao thức, khoá API tuỳ chọn) từ cài đặt; `create` dựng sandbox từ image desktop với: `entrypoint` khởi động Xvfb (độ phân giải theo `resolution`), XFCE, x11vnc `-viewonly`, noVNC/websockify cổng 6080; `timeout` theo `idleSeconds` + gia hạn khi có thao tác (`renew`); siêu dữ liệu `botteamInstance`/`botteamBot`; `networkPolicy` (mục quyết định 8); volume hồ sơ Chrome (mục quyết định 6); giới hạn CPU/RAM theo cài đặt.
- [ ] `OpenSandboxMachine`: ánh xạ hành động sang lệnh trong máy: `xdotool mousemove/click/mousedown/mouseup/key/type`, cuộn bằng `xdotool click 4/5`, chụp ảnh bằng `scrot` (hoặc `import`) rồi `read_file`; mở ứng dụng bằng lệnh nền (dùng lại đoạn riêng cho Chrome hiện có: `dbus-run-session -- google-chrome-stable --password-store=basic <url>`); gõ tiếng Việt/Unicode bằng `xdotool type` hoặc dán qua `xclip` + `ctrl+v` (kiểm ở bước A, vì đây là chỗ dễ hỏng nhất); `wait`; `run_command`; `read_file`/`write_file` với cùng giới hạn đường dẫn và 10 MB.
- [ ] `keep_awake()`: tắt screensaver và tắt tối màn hình (`xset s off s noblank`, không chạy `xfce4-screensaver`) khi tạo hoặc tiếp tục, giống E2B (đã từng gây màn hình đen).
- [ ] `capabilities()`: đọc từ kết quả bước A (Docker pause có làm được không) và từ cấu hình máy chủ (`secure_runtime`, egress).
- [ ] `list_owned`: liệt kê theo siêu dữ liệu nếu SDK hỗ trợ; nếu không, dựa vào `computerMachines` và dọn mồ côi bằng nhãn Docker do chính BotTeam đặt (đặt tên/nhãn container ổn định `botteam-<owner>-<bot>`).
- [ ] Khi sandbox hết hạn hoặc bị máy chủ xoá: đánh dấu `status = "none"`, báo rõ, không treo agent.

### 3.3 Cấu hình, API, giao diện

- [ ] `computer_settings.py`: thêm nguồn `opensandbox` với trường `serverUrl` (mặc định `http://127.0.0.1:8080`), `apiKey` (tuỳ chọn), `image` (mặc định `botteam/desktop:1`), `domain/protocol` khi truy cập qua tên khác, `volumeRoot` (nếu dùng bind mount, phải nằm trong danh sách cho phép `[storage]` của máy chủ), giới hạn máy/RAM/CPU. Khoá giữ phía server như hiện nay; **không** đổi tên khoá `e2b` đã lưu (di chuyển tương thích).
- [ ] `ComputerHostSettings.test()` theo nhà cung cấp: **OpenSandbox**: gọi `/health`, xác thực, tạo một sandbox thử bằng image đã chọn, chạy `xdotool --version` và chụp một ảnh, đọc lại, xoá; trạng thái `ready` | `unreachable` | `unauthorized` | `no_image` | `no_desktop_tools` | `no_egress_policy`, kèm đo độ trễ và RAM (nếu máy chủ trả).
- [ ] `GET/PUT /api/computer/host` trả thêm `provider`, `capabilities`; `POST /api/computer/host/test` như cũ.
- [ ] `web/components/browser/computer-host-settings.tsx`: lựa chọn nhà cung cấp (E2B Cloud / E2B Embed / OpenSandbox Docker), các trường theo nhà cung cấp, hiển thị `capabilities` bằng lời ("không giữ cửa sổ khi tạm dừng", "cách ly container"), cảnh báo riêng tư cho Cloud giữ nguyên; liên kết "Hướng dẫn cài đặt" theo nhà cung cấp (mục 3.4).
- [ ] Lựa chọn Computer use trong Settings của từng agent vẫn khoá cho tới khi nhà cung cấp hiện tại ở trạng thái `ready`, kèm lý do và liên kết như phase 10.
- [ ] Chữ mới có tiếng Việt (`vi.ts`), chạy `pnpm test:web`.

### 3.4 Image desktop và hướng dẫn cài (người dùng tự làm)

- [ ] **Dockerfile desktop** đặt trong repo (`docs/opensandbox-desktop/Dockerfile`, kèm `README`): dựa trên `examples/desktop` của OpenSandbox (Xvfb, XFCE, x11vnc, noVNC/websockify, người dùng không phải root) cộng `xdotool`, `scrot`, `xclip`, Chrome ổn định, `dbus-x11`, phông Unicode/tiếng Việt, tắt screensaver. Người dùng tự `docker build` theo hướng dẫn; BotTeam không dựng hộ (giữ nguyên nguyên tắc phase 10: không có mã cài đặt trong ứng dụng).
- [ ] **Hướng dẫn `docs/opensandbox-setup.vi.md` và `docs/opensandbox-setup.en.md`**, ba phần: **(A) Linux server**: cài Docker Engine, `uvx opensandbox-server init-config ... --example docker`, chạy như dịch vụ (systemd), bật khoá API và bind địa chỉ phù hợp, tuỳ chọn `[secure_runtime]` (gVisor/Kata), cấu hình egress và sàn chặn mạng riêng; **(B) dựng image desktop**; **(C) nhập vào Settings** (URL, khoá, image) rồi Kiểm tra kết nối; cộng phần gỡ cài đặt, cập nhật, mở cổng cho máy khác chỉ cho địa chỉ tin cậy, lỗi thường gặp. Phần Windows chỉ ghi "Docker Desktop (WSL2) chạy được ở chế độ Docker nhưng chưa kiểm chứng trên máy này".
- [ ] Trang xem hướng dẫn trong web mở rộng cho hai bộ tệp (`/guides/e2b` giữ nguyên, thêm `/guides/opensandbox`); tệp theo ngôn ngữ giao diện.
- [ ] Viết hướng dẫn **sau bước A**, từ các lệnh đã chạy thật.

### 3.5 Bảo mật

- [ ] Máy chủ OpenSandbox chỉ nghe địa chỉ tin cậy; bật khoá API; BotTeam không phơi khoá ra trình duyệt.
- [ ] Mặc định chặn dải mạng riêng và địa chỉ của chính BotTeam/OpenSandbox từ trong sandbox (mục quyết định 8) và có bài kiểm: từ trong máy ảo thử truy cập `127.0.0.1`, LAN, và cổng của máy chủ OpenSandbox phải bị chặn.
- [ ] Cảnh báo rõ khi `secureIsolation = container` ("mã trong trang web chỉ bị container giữ lại, dùng gVisor/Kata nếu cần cách ly mạnh hơn"); đề xuất gVisor trong hướng dẫn.
- [ ] Giữ nguyên các rào hiện có: permission broker cho hành động có tác dụng phụ, `control` cho Take over, giới hạn tệp, soul dặn nội dung màn hình là dữ liệu không đáng tin.
- [ ] Hồ sơ Chrome trong volume chứa đăng nhập: nằm ngoài thư mục dữ liệu BotTeam, không đưa vào sao lưu chia sẻ; nút "Xoá máy ảo" cũng xoá volume (có xác nhận).

### 3.6 Kiểm thử

- [ ] **Bộ test hợp đồng nhà cung cấp** (tham số hoá): cùng một bộ kịch bản (tạo, chụp, bấm, gõ, phím, mở ứng dụng, chạy lệnh, đọc/ghi tệp, tạm dừng/tiếp tục hoặc huỷ-giữ-volume, kill, recover, giới hạn máy) chạy với `E2BProvider` (SDK giả có sẵn) và `OpenSandboxProvider` (`httpx.MockTransport` giả máy chủ OpenSandbox + máy giả).
- [ ] Test `perform()` trên `Machine` giả cho cả hai nhà cung cấp (toạ độ ngoài màn hình, phím không hợp lệ, URL có thông tin đăng nhập).
- [ ] Test `ComputerHostSettings.test()` cho từng trạng thái của OpenSandbox.
- [ ] Kiểm tay: thử thật với máy Linux (bước A) và với E2B Embed hiện có (không hỏng).

## 4. Giai đoạn triển khai

| Bước | Nội dung | Kiểm |
|---|---|---|
| A | **Bài thử khả thi** trên một máy Linux có Docker: chạy `opensandbox-server` chế độ Docker, dựng image desktop, tạo sandbox bằng SDK, chụp/bấm/gõ bằng `xdotool`, xem qua noVNC, thử egress, thử `pause()`/`resume()` ở Docker, thử volume giữ đăng nhập, gõ tiếng Việt, đo RAM/CPU/khởi động/độ trễ mỗi lệnh; so với E2B Embed hiện tại | Điền bảng mục 7; **dừng phase nếu** không gõ/chụp ổn định hoặc không có egress |
| B | Tách `ComputerProvider`/`Machine`, chuyển E2B vào `E2BProvider`, không đổi hành vi | Toàn bộ test E2B qua không sửa; thử tay E2B Embed |
| C | `OpenSandboxProvider` + máy giả + bộ test hợp đồng | `pytest` qua cho cả hai nhà cung cấp |
| D | Cài đặt, API, giao diện chọn nhà cung cấp, kiểm tra kết nối, hiển thị `capabilities` | `tsc`, `pnpm test:web`, chụp màn hình Anh/Việt |
| E | Image desktop, hai tệp hướng dẫn OpenSandbox, trang xem hướng dẫn | Người khác làm theo hướng dẫn trên Linux sạch tới `ready` |
| F | Bảo mật (egress, `secure_runtime`, khoá, volume), recover/dọn mồ côi, hết hạn sandbox | Máy ảo không truy cập được mạng nội bộ; kill/khởi động lại dọn đúng |
| G | README, `docs/user-guide.md`, `.env.example`, `docs/README.md`; kiểm `install.ps1`/`install.sh` (ghi "không đổi") | `pytest` + `pnpm test` toàn bộ |

## 5. Rủi ro và câu hỏi mở

- **Tạm dừng ở chế độ Docker:** chưa rõ (tài liệu chỉ mô tả Kubernetes). Nếu không giữ được, OpenSandbox chỉ giữ **đăng nhập** (qua volume), mất cửa sổ đang mở; chấp nhận được nhưng phải ghi rõ và xem lại thời gian wake (tạo container mới mỗi lần).
- **Hành động bằng `xdotool` qua HTTP kém bền và chậm hơn `e2b-desktop`:** mỗi thao tác là một lệnh cộng một ảnh chụp đọc về; ảnh PNG lớn tốn băng thông. Cân nhắc nén ảnh trong máy (chuyển sang JPEG) trước khi đọc, gom thao tác và ảnh thành một lệnh.
- **Gõ tiếng Việt/Unicode** bằng `xdotool type` hay hỏng với bố cục bàn phím; dùng dán từ clipboard (`xclip` + `ctrl+v`) khi gặp ký tự ngoài ASCII; phải thử với chữ có dấu.
- **Cách ly yếu hơn microVM** ở mặc định `runc`: cần gVisor/Kata cho việc mở trang web không tin cậy; Kata cần KVM nên lợi thế "không cần KVM" mất đi. Với gVisor (không cần KVM) thì ổn nhưng cần Linux.
- **Chúng ta tự bảo trì image desktop** (cập nhật Chrome, phông, công cụ): chi phí vận hành mới so với mẫu `desktop` do E2B cung cấp.
- **Phiên bản OpenSandbox thay đổi nhanh** (cổng proxy máy chủ đã "deprecated"): cố định phiên bản SDK và máy chủ, có bài kiểm "khói" trong "Kiểm tra kết nối".
- **Cổng trực tiếp của sandbox ở chế độ Docker** có thể mở trên mọi giao diện của máy chủ: hạn chế bằng bind địa chỉ, tường lửa máy chủ, và luôn đi qua trung gian BotTeam.
- **Câu hỏi cho bạn:** (1) OpenSandbox chạy cùng máy Linux với BotTeam hay máy khác trong LAN/Tailscale? (2) Có chấp nhận mất cửa sổ đang mở khi tạm dừng (chỉ giữ đăng nhập) nếu Docker không giữ được trạng thái? (3) Có muốn bật gVisor mặc định trong hướng dẫn không?

## 6. Tiêu chí hoàn thành

1. Chọn được nhà cung cấp Computer use trong Settings: **E2B Cloud**, **E2B Embed** hoặc **OpenSandbox (Docker)**; mặc định Computer use vẫn **tắt**, chỉ bật được khi nhà cung cấp hiện tại `ready`.
2. Với E2B, mọi hành vi như phase 10 (xem trực tiếp, Take over, chụp, bấm, tạm dừng/tiếp tục, tường lửa); không có hồi quy.
3. Với OpenSandbox, agent chụp, bấm, gõ (kể cả tiếng Việt), mở Chrome và trang web trong container; người dùng xem trực tiếp, Take over và Hand back; đăng nhập còn sau khi máy rảnh rồi được dùng lại.
4. Máy ảo OpenSandbox không truy cập được mạng nội bộ, BotTeam hay máy chủ OpenSandbox; nếu không áp được chính sách mạng thì máy không được tạo.
5. Giao diện hiện đúng khả năng của từng nhà cung cấp; hai tệp hướng dẫn (vi/en) cho OpenSandbox mở được từ liên kết trong Settings; khoá không lộ ra trình duyệt.
6. `pytest` (kể cả bộ hợp đồng cho hai nhà cung cấp) và `pnpm test` qua; README, `.env.example`, `docs/` đã cập nhật; `install.ps1`/`install.sh` được kiểm và ghi "không đổi".

## 7. Kết quả thử (đo ngày 2026-11-21)

Máy thử: một VM Ubuntu 24.04 (nhân 7.0, 8 vCPU, 14 GiB RAM, đĩa 78 GB gần đầy), chạy E2B Embed cùng lúc, truy cập qua Tailscale. OpenSandbox server 1.x chế độ Docker, chạy bằng systemd, nghe trên địa chỉ Tailscale, có khoá API. Mạng của máy này chậm (khoảng 0,2 MB/s), nên các lần tải đầu rất lâu.

| Mục | E2B Embed (hiện tại) | OpenSandbox Docker |
|---|---|---|
| Cài đặt | Compose nhiều dịch vụ, cần KVM | `uvx opensandbox-server` (cài lần đầu mất vài phút vì mạng chậm), một dịch vụ systemd; không cần KVM |
| Image desktop | Mẫu `desktop` của E2B | Dựng một lần từ `docs/opensandbox-desktop`: 2,02 GB (Ubuntu 24.04, XFCE, Chrome, xdotool, scrot, xclip); dựng mất khoảng 20 phút trên mạng chậm |
| Thời gian tạo một máy | vài giây | 6–7 giây (kể cả khởi động desktop) |
| Kiểm tra kết nối sâu (tạo máy, kiểm công cụ, chụp, xoá) | không có | 9,5–10,6 giây |
| Chụp ảnh màn hình | nhanh | 1,4–1,5 giây (scrot rồi đọc tệp qua proxy) |
| Một hành động bấm/gõ | nhanh | 1,3 giây cho một cú bấm; gõ tiếng Việt 2,5 giây (qua clipboard) |
| Gõ tiếng Việt có dấu | có | **có**: "xin chào đây là tiếng Việt" gõ đúng vào Chrome qua `xclip` + `ctrl+v` |
| Tạm dừng và tiếp tục | ảnh chụp bộ nhớ ra đĩa | **`pause()` chạy ở chế độ Docker** (docker pause): 0,3 giây; tiếp tục 4,1–4,2 giây; **cửa sổ Chrome và nội dung đang gõ còn nguyên** sau khi tiếp tục. Container đóng băng vẫn giữ RAM |
| Luồng noVNC | trung gian BotTeam | qua proxy của máy chủ OpenSandbox: bắt tay RFB `003.008`, kiểu bảo mật None; xem và Take over trong giao diện BotTeam hoạt động |
| Egress | `deny_out` theo máy | **chỉ hiệu lực khi `[egress] mode = "dns+nft"`**: lúc đó máy ảo không vào được 192.168.x.x, địa chỉ máy chủ OpenSandbox, cổng Docker `172.17.0.1`, máy khác trong Tailscale (các lệnh `curl` đều lỗi) còn `https://example.com` trả 200; với chế độ mặc định `dns` thì các địa chỉ riêng đó vẫn truy cập được |
| RAM | 12 GiB trở lên cho riêng Embed | một container desktop khoảng 1–2 GB khi chạy; dịch vụ OpenSandbox lúc không có máy chỉ vài chục MB (chưa đo chính xác trên máy này vì E2B đang chạy cùng lúc) |
| gVisor | không áp dụng | chưa thử (không bật trong lần này) |
| Bài thử qua BotTeam (máy chủ BotTeam tạm, trình duyệt thật) | không đổi | Settings: lưu cấu hình, "Save and test connection" báo `ready` (10,3 giây); tab Computer: Wake tạo máy, luồng hình hiện desktop, Take over mở khung lớn, click và phím gửi thành công (`200`), Hand back; xoá máy xong không còn container |

## 8. Điều chỉnh so với kế hoạch ban đầu (đã làm)

- **Giao diện `Machine` là đồng bộ, không phải bất đồng bộ như mục 2 viết.** SDK OpenSandbox có bản đồng bộ (`SandboxSync`, `SandboxManagerSync`, `ConnectionConfigSync`), và mọi lời gọi máy vốn đã chạy trong luồng nền (`asyncio.to_thread`), nên `perform()` và các test E2B không phải đổi. Máy E2B vẫn là chính đối tượng `Sandbox` của SDK; OpenSandbox có bộ chuyển (`OpenSandboxMachine`).
- **Tệp mới:** `computer_provider.py` (giao diện `Provider`, `E2BProvider`, `provider_for`, hằng số dùng chung), `computer_opensandbox.py` (`OpenSandboxProvider`, `OpenSandboxMachine`), `tests/test_computer_opensandbox.py`, `docs/opensandbox-desktop/`, `docs/opensandbox-setup.{vi,en}.md`, `web/components/guides/setup-guide.tsx`, `web/app/guides/opensandbox/page.tsx`.
- **Khoá API tách riêng theo nhà cung cấp** (`e2b` và `opensandbox`): đổi nguồn không gửi khoá của bên này sang bên kia.
- **Kiểm tra kết nối sâu** chỉ cho OpenSandbox (tạo máy thật, kiểm `xdotool/scrot/Xvfb/x11vnc/websockify/xclip` và ảnh chụp, rồi xoá), kết quả được tin 10 phút; các trạng thái mới: `no_image`, `no_desktop_tools`, `no_egress_policy`.
- **Luồng hình đi qua proxy của máy chủ OpenSandbox** (`use_server_proxy=True`): chỉ cần mở cổng 8080 của máy chủ; địa chỉ `eip` phải có cổng. Máy chủ OpenSandbox xếp chế độ proxy này vào diện "bảo trì" (chỉ sửa lỗi và bảo mật); nếu sau này bị gỡ, cần chuyển sang cổng trực tiếp.
- **Volume giữ đăng nhập (mục quyết định 6) chưa làm**, vì `pause()` của Docker đã giữ nguyên cửa sổ và đăng nhập khi container còn sống; chỉ mất khi container bị xoá hoặc máy chủ khởi động lại.
- **`xdotool mousemove --sync` bị bỏ**: nó chờ tới 15 giây cho mỗi cú bấm.
- **`kill`/`list_owned`** dùng `SandboxManagerSync` và siêu dữ liệu `botteamInstance`/`botteam` như E2B.
