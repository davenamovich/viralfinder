# P&R MCP tools used by the Viral Trend Bridge

These are the Plunder & Riffle MCP tools the bridge calls. All calls go
through `tools/call` after a session is initialized via `initialize`.

## `create_news`

**Purpose**: Read live sources about a topic and produce a news video
brief. Per the spec, this doubles as a fact check — if no source
answers, the call is refunded and the trend is marked `unverified`.

**Args**:

| Arg | Type | Required | Notes |
|---|---|---|---|
| `topic` | string | yes | 200 chars max |
| `brief` | string | no | short angle / audience hint |

**Async job kind**: `sitdown`

**Returns**: page URL, sources (for credit), caption draft. If no
sources answer, the call is refunded and the result is empty.

---

## `generate_ad_creative`

**Purpose**: Produce a preview creative (a web page, NOT a video).
Show the human the pageUrl, post copy and sources.

**Args**:

| Arg | Type | Required | Notes |
|---|---|---|---|
| `topic` | string | yes | 200 chars max |
| `format` | enum | yes | one of `hottake` (opinions), `carousel` (explainers), `hybrid` (iMessage threads), `image` (single meme) |
| `brandProfile` | object | no | output of `research_brand` |
| `brief` | string | no | short, concrete: trend, angle, audience |

**Async job kind**: `creative`

**Returns**: page URL, caption, sources to credit.

---

## `request_mp4`

**Purpose**: Render a preview page into an MP4. Per the spec, only call
this AFTER the human approves a specific preview.

**Args**:

| Arg | Type | Required | Notes |
|---|---|---|---|
| `pageUrl` | string | yes | the pageUrl returned by `generate_ad_creative` |
| `caption` | string | no | optional override |

**Async job kind**: `mp4`

**Returns**: mp4Url.

---

## `research_brand` (free)

**Purpose**: Get a brand profile to pass to `generate_ad_creative`.

**Args**:

| Arg | Type | Required | Notes |
|---|---|---|---|
| `brand` | string | yes | brand name |
| `url` | string | no | brand URL or handle |

**Returns**: brandProfile object — pass it as `brandProfile` in
`generate_ad_creative`.

**Free**: this call costs 0 credits.

---

## `get_job_status` (free)

**Purpose**: Poll an async job until terminal. Used by `create_news`,
`generate_ad_creative`, and `request_mp4`.

**Args**:

| Arg | Type | Required | Notes |
|---|---|---|---|
| `jobId` | string | yes | job id returned by the originating tool |
| `kind` | string | yes | one of `sitdown`, `creative`, `mp4` |

**Returns**: a job status object with `status`, `phase`, `terminal`,
`result`, `error`, and `refunded` (when a failed call was refunded).

**Poll rule**: poll every 20–30s. Stop when `terminal === true`. If
`phase === "needs_input"`, ask the human.

**Free**: this call costs 0 credits.

---

## Costs (per the bridge spec)

| Action | Cost |
|---|---|
| Any `tools/call` (BYOK key) | $0.01 (first 100/month free) |
| `research_brand` | free |
| `get_job_status` | free |
| MP4 render with own worker / full BYOK | $0.01 |
| MP4 render without own worker | $0.25 |
| Failed calls | refunded |

A 5-trend verify + create run is roughly 10 calls, or about $0.10 on
BYOK. Tell the human this before bulk runs.
