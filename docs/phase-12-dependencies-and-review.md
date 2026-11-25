# Phase 12: job dependencies and the person's review

Two additions to the job runtime (`server/botteam/runtime.py`), and one fix.

## 1. Fix: a used-up executions budget locked the runtime

`_try_start` called `_settle()` while holding `Runtime.lock`. `_settle()` takes the same `asyncio.Lock`, which is not
reentrant, so the dispatch loop stopped for good. The refusal is now recorded under the lock and settled after it, as
`_maybe_resume` does. Test: `test_a_used_up_executions_budget_fails_the_job_without_locking_the_runtime`.

## 2. Why this differs from the reference

The reference runtime (`docs/runtime-contract.md` of OpenMausBot) has no dependencies between jobs and no review gate:
the requester is woken between steps and passes results on itself. A social-media team often has a fixed chain
(research, then writing, then scheduling) and content that the person wants to see before it goes out.

## 3. `depends_on`

`coordinate_bots(..., depends_on: ["as_…"])`.

- Only jobs the same node handed out earlier can be named (at most 8), so there can be no cycle. A job that already
  failed or was cancelled is refused (`failed_dependency`); other bad input is `unknown_dependency` or `bad_dependency`.
- The job stays `queued` until every dependency is `completed`. It does not wait for unrelated siblings.
- When a dependency ends any other way, the job ends `failed` with outcome `dependency` without running, and so does
  what builds on it.
- The harness adds the results to the job's opening, 12,000 characters each and 36,000 together; a cut is marked. Every
  line is prefixed with `>` and labelled information only, because the opening around it may carry the person's authority.
- The requester is still woken once, after every awaited job has ended.

## 4. `review`

`coordinate_bots(..., review: true)`.

- When the job's last turn succeeds, its status is `review`. It is not reported, jobs that depend on it do not start and
  the requester is not woken. A turn that fails ends `failed` as usual.
- The person decides: **Approve** or **Reject** in the Master Agent's Tasks tab, which calls
  `POST /api/assignments/{id}/review` with `{"decision": "approve" | "reject", "note": "…"}`.
- Approve: `completed`. Reject: `failed`, outcome `rejected`; dependents end `failed(dependency)`; the requester gets the
  reason and the draft, marked as turned down. A later job for the same bot under the same node is gated again, whether
  or not it asks for review.
- `assignment_status` does not show a bot the result of gated work that is not approved.
- Stop cancels a job in review. A review has no time limit and is kept across a restart. If telling the person fails,
  the job stays in review.

It does not use the broker's approval cards: those expire after 15 minutes, are closed when a turn on the same thread
ends, and are answered automatically at Full access unless the tool is listed in `ALWAYS_ASK`.

### What the gate does not do

- **It gates the hand-over of a result, not the actions of the turn that produced it.** The job is told to prepare only,
  and to publish, send and schedule nothing, but that is an instruction to the model. A bot at Full access, or one that
  can write to the Posts API, can still act or save posts during its turn.
- **A bot with a shell can call the local API**, including the review route. No tool offers it, but this is not a
  security boundary. The same applies to the existing approval cards.
- **The requesting bot chooses `review`.** There is no campaign setting that forces it. Ask the Master Agent, or write it
  into its instructions.
- The rule that keeps a rejected bot gated holds within one node only; a new request from the person starts afresh.

## 5. Storage

`assignments` gains `depends_on` (JSON list) and `review` (0/1). `Runtime.open()` adds them to an older `runtime.db`.
`GET /api/assignments` returns `dependsOn`, `review` and `updatedAt`.

## 6. Tests

`server/tests/test_runtime.py` and `server/tests/test_teams.py` cover ordering, the quoted hand-over, failure and
rejection, input checks, approval by a plain yes only, errors, Stop, restart, the database upgrade, and the path through
the tool and the HTTP API with a bot at Full access. They use a fake host and the demo engine, not a real model, so they
do not show that a model will use `depends_on` or `review` when it should.
