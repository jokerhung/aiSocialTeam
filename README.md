# **aiSocialTeam**

aiSocialTeam is a multi-agent application for creating social media content. Turn a brief into a coordinated workflow with five AI agents: Master plans and delegates, Research finds topics and sources, Creator writes captions and prepares visuals, Scheduler organizes the content calendar, and Analytics helps review performance. Chat with the team to develop ideas, refine drafts and prepare content for your campaigns.

Each agent can use Claude Code, Codex or Antigravity CLI, or an OpenAI-compatible endpoint, with its own instructions, model, memory, working folder and connected apps. Agents can hand tasks to one another, run on a schedule, and receive requests through Telegram or Zalo. The dashboard brings together campaign chats, posts, a calendar, analytics and social accounts connected through Composio. Campaign data and conversations are stored on your computer. The interface supports English and Vietnamese, selectable with the Language button above Settings at the bottom of the sidebar.

It is built with a Next.js web app and a Python (FastAPI) server. The web interface is inspired by TubeGuruji's video [Build Social Media AI Agent Team Using Claude Code & Next.js](https://www.youtube.com/watch?v=5GWTDRrwynY).

**English** | [Tiếng Việt](README_VI.md)

---

<p align="center"><img src="docs/screenshots/overview.png" alt="Overview: the Master Agent, the campaign status, upcoming posts and the AI team's office" width="100%"></p>

<table>
  <tr>
    <td width="33%"><img src="docs/screenshots/ai-agent.png" alt="AI Agent: each agent's engine, model and thinking level in its Settings tab"></td>
    <td width="33%"><img src="docs/screenshots/calendar.png" alt="Calendar: when posts go live, by month or week"></td>
    <td width="33%"><img src="docs/screenshots/analytics.png" alt="Analytics: posts published, views and engagement"></td>
  </tr>
  <tr>
    <td width="33%"><img src="docs/screenshots/posts.png" alt="Posts: drafts, scheduled and published content"></td>
    <td width="33%"><img src="docs/screenshots/integrations.png" alt="Settings, Integrations: social apps connected through Composio"></td>
    <td width="33%"></td>
  </tr>
</table>

---

## ⚡ Quick Start

**macOS / Linux**

```bash
curl -fsSL https://raw.githubusercontent.com/jokerhung/aiSocialTeam/master/install.sh -o install.sh && bash install.sh
```

**Windows (PowerShell)**

```powershell
iwr -useb https://raw.githubusercontent.com/jokerhung/aiSocialTeam/master/install.ps1 -OutFile install.ps1; powershell -ExecutionPolicy Bypass -File install.ps1
```

The script installs Git, Node.js, Python and uv when they are missing, clones the repository and installs its dependencies. Add `--claude` / `-Claude`, `--codex` / `-Codex` or `--antigravity` / `-Antigravity` to install the engine CLIs too. See [docs/user-guide.md](docs/user-guide.md) for every option and for signing in to an engine.

---

## What you can do

- **Work by campaign.** Create a campaign with its own Master, Research, Creator, Scheduler and Analytics agents. Switch campaigns to work with a different team and set of posts.
- **Brief and follow the team.** Talk to Master, open individual agent chats, and follow delegated work in Tasks and agent history. The office view shows the team alongside the workspace. Its image panel can be hidden, with the preference remembered in your browser.
- **Configure each agent.** Choose an available engine, model and thinking level in the agent's Settings tab. Edit and save its instructions.
- **Prepare posts.** Write captions and hashtags, select platforms and connected accounts, attach media, save drafts and preview content in the post editor.
- **Generate and edit images.** Choose an installed Codex CLI or Gemini CLI in Creator's image settings. Use the image tool from the post editor or ask Creator to prepare an image.
- **Plan content on a calendar.** Schedule, move and unschedule posts. Review stored post metrics in Analytics.
- **Connect social accounts.** Set a Composio key in Settings → Integrations, connect accounts and manage them from Accounts.
- **Watch agents use interfaces.** Choose Browser use, Computer use or Off per agent. View the browser or desktop, take over for sign-in or verification, then hand control back.
- **Use either language.** Select English or Vietnamese from the sidebar.

### Publishing and analytics in this version

The Posts and Calendar workflow saves drafts and schedules in the local server. When a scheduled time passes, the server marks the post as published locally. This path does not submit the post to a social network, and its published status is not a platform confirmation.

Agents have a separate publishing setting for Composio or the selected browser/computer interface. What an agent can publish depends on the connected account, available tools, platform requirements and your instructions. Review the agent's result and the platform itself when verifying a publication.

Analytics displays metrics stored for posts. The server accepts metrics through `PUT /api/social/posts/{id}/metrics`. Automatic collection from social platforms is not implemented in the dashboard's current analytics data path.

## Getting started

After running an installer from Quick Start, start the app from the repository.

**Windows**

```powershell
.\start.bat
```

**macOS / Linux**

```bash
pnpm dev
```

Open `http://127.0.0.1:5499` with the ports from `.env.example`.

1. Install and sign in to at least one supported CLI on the machine running the Python server. The installers support `-Claude`, `-Codex`, `-Antigravity` on Windows and `--claude`, `--codex`, `--antigravity` on macOS/Linux. Complete sign-in with the CLI itself.
2. Create a campaign. The app creates its five agents.
3. Open **AI Agent**, select an agent and open **Settings** to choose its engine, model and thinking level, and save instructions. Available engines reflect what the server detects.
4. Open **Settings → Integrations** to configure Composio and connect social accounts if the campaign needs them.
5. Give Master a brief with the audience, platforms, topic, tone and expected deliverables. For example, ask for three post drafts about a product launch with captions and visual ideas.
6. Review agent output and saved drafts in **Posts**, then use **Calendar** to organize timing.

### Dashboard pages

| Page | Purpose |
|---|---|
| Overview | Campaign summary, recent activity, upcoming posts and the team office. |
| AI Agent | Agent chats, Master tasks, worker history, model and instruction settings, Browser/Computer views and Master's Screens tab. |
| Posts | Create and edit content, manage drafts and schedules, attach media and use image generation. |
| Calendar | View post timing and move or remove scheduled entries. |
| Analytics | Review stored post metrics and compare performance. |
| Accounts | View and manage social accounts connected through Composio. |
| Settings → Integrations | Configure the Composio key and social app connections. |
| Settings → Computer Use | Configure and test an E2B or OpenSandbox host, with links to setup guides. |

### Image generation

Choose the tool in **AI Agent → Creator → Settings → Image generation**. Codex CLI and Gemini CLI use their locally configured accounts. Gemini needs an image extension or MCP integration capable of generating images.

The post editor supports generating an image and requesting changes to an image. Keep the result to attach it to the post. Generated media is stored under `<BOTTEAM_DATA_DIR>/social-media`.

### Browser and computer access

In each agent's **Settings → Interface controls**, choose a mode and save it.

| Mode | Requirements and behavior |
|---|---|
| Browser use | Local Edge, Chrome or Playwright Chromium, plus Node.js and npx for Playwright MCP. Uses a separate browser profile for each agent. |
| Computer use | A configured E2B or OpenSandbox host that passes the connection test, Python 3.11+, and a supported engine with image-capable tools. |
| Off | Disables the campaign agent's built-in interface tools. |

Browser use tries Edge, Chrome and then Playwright Chromium. If needed, install Chromium with `uv run --project server playwright install chromium`. Browser settings include window visibility, local-address access, downloads and clearing profile data.

Computer use supports E2B Cloud, self-hosted E2B with KVM, and OpenSandbox with Docker. The connection settings and full API key stay on the Python server. The dashboard displays a masked key and relays the live desktop stream through the web app.

- E2B Cloud processes desktop contents on E2B infrastructure under your plan's limits and pricing.
- Self-hosted E2B runs on your host and can preserve memory through pause/resume snapshots.
- OpenSandbox uses Docker containers. Pausing can preserve a running session while the container exists. Removing or recreating it loses its files and sign-ins.

Use **Open large → Take over** to operate the selected interface, then **Hand back** to let the agent continue. Computer tools pause while the person holds control. Removing a computer from agent settings clears its saved state. Ending or deleting its campaign removes its computers.

Setup instructions are available for [E2B in English](docs/e2b-setup.en.md), [E2B in Vietnamese](docs/e2b-setup.vi.md), [OpenSandbox in English](docs/opensandbox-setup.en.md) and [OpenSandbox in Vietnamese](docs/opensandbox-setup.vi.md). The desktop image build context for OpenSandbox is [docs/opensandbox-desktop](docs/opensandbox-desktop).

## Install and run from source

### Requirements

- Git, Node.js 20+ and pnpm. The repository specifies its pnpm version in `package.json`.
- Python 3.10+ and [uv](https://docs.astral.sh/uv/). Use Python 3.11+ for Computer use.
- A configured AI engine. The server supports Claude Code, Codex, Antigravity and OpenAI-compatible endpoints. Individual features depend on engine capabilities.
- Edge or Chrome for Browser use, or install Playwright Chromium.
- Optional tools and services for the features you enable, such as an image CLI, Composio or a computer host.

The installers check prerequisites, install project dependencies, create `.env` if missing, build the web app and prepare Playwright MCP. Engine installation flags are optional. Sign in to your chosen engine separately. E2B and OpenSandbox hosts are configured separately using the setup guides.

For an existing checkout, run these commands from the repository root.

```bash
pnpm install --frozen-lockfile
uv sync --project server
```

Copy `.env.example` to `.env` if the file does not exist, then start development.

```bash
pnpm dev
```

### Services and production build

| Command | Purpose |
|---|---|
| `pnpm dev` | Start the Python API and Next.js development server together. |
| `pnpm dev:server` | Start the Python API with reload. |
| `pnpm dev:web` | Start only the Next.js development server. |
| `pnpm build:static` | Build Next.js for production into `web/.next`. The script name is retained, and the build requires a Node.js server at runtime. |
| `pnpm start:one` | Start the Python API without development reload. |
| `pnpm start:web` | Serve the production web build. Run alongside the API. |
| `pnpm dev:zalo` | Start the optional Zalo personal-account service. |

On Windows, `start.bat` starts development and frees the configured ports first. It also accepts `server`, `web`, `one` and `zalo` to run a single service.

### Configuration and network access

The launch scripts read the root `.env`. Values in `.env.example` are as follows.

| Setting | Value | Purpose |
|---|---|---|
| `WEB_PORT` | `5499` | Dashboard port. |
| `SERVER_PORT` | `9999` | Python API port. |
| `WEBHOOK_PORT` | `9900` | Webhook receiver port. |
| `ZALO_PORT` | `8902` | Optional Zalo service port. |
| `WEB_HOST` | `0.0.0.0` | Open the dashboard through this machine's network interfaces. |
| `SERVER_HOST` | `127.0.0.1` | Keep the Python API on loopback. |
| `BOTTEAM_DATA_DIR` | `~/.botsocial` | Persistent application data. |

With these settings, open `http://<machine-ip>:5499` from another machine on LAN or Tailscale. The web app accepts localhost and literal LAN/Tailscale addresses. Add other hostnames to `WEB_ALLOWED_HOSTS`. The dashboard uses a local user without an application sign-in, so access to the web port grants access to the workspace. Set `WEB_HOST=127.0.0.1` for use on this machine only.

The launch script has fallback ports when `.env` is absent. Use `.env.example` for the documented ports. Optional browser and computer-host environment settings are listed there as well.

## Data and architecture

Next.js renders the dashboard and forwards requests to the Python API. The API stores campaigns, agents, conversations, posts and settings, and launches the engine CLIs. The team runtime tracks assignments delegated between agents. Composio provides connected social apps. Browser use runs on the API machine, while Computer use runs through the configured E2B or OpenSandbox host.

Application data is stored in `BOTTEAM_DATA_DIR`, including SQLite databases, settings, uploads and generated media. The server stores API keys and returns masked hints for the keys shown in Settings. Browser profiles and computer sessions can contain sign-ins. AI engines, connected apps and remote computer providers receive the content needed to perform their work.

| Path | Contents |
|---|---|
| `web/app/dashboard/` | Dashboard pages and Settings tabs. |
| `web/components/agents/` | Team workspace, chat, tasks and agent settings. |
| `web/components/browser/` | Browser/computer viewer and host settings. |
| `web/lib/` | Campaign, post, analytics and API data access. |
| `server/botteam/social.py` | Campaign roles, interface settings, posts and metrics. |
| `server/botteam/turns.py`, `runtime.py` | Agent turns and delegated assignments. |
| `server/botteam/drivers/` | AI engine integrations. |
| `server/botteam/computer_*.py` | Computer lifecycle, tools, providers and streaming. |
| `server/tests/` | Python tests. |
| `docs/` | Setup guides, phase plans, screenshots and reference material. |
| `scripts/` | Launch, build and verification scripts. |
| `zalo-service/` | Optional Node.js service for personal Zalo accounts. |

The Python package, CLI and some settings still use the technical name `botteam`, such as `server/botteam` and `BOTTEAM_DATA_DIR`.

## Development checks

Run from the repository root.

```bash
pnpm typecheck
pnpm test:web
pnpm test:server
pnpm test:zalo
```

`pnpm test` runs the server, web language and Zalo checks together. Web interface changes must support English and Vietnamese. See [AGENTS.md](AGENTS.md) for contribution rules.

## License

aiSocialTeam currently has no project license file. Third-party notices are in [NOTICE](NOTICE).

Repository [jokerhung/aiSocialTeam](https://github.com/jokerhung/aiSocialTeam).
