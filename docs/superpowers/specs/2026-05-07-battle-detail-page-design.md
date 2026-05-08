# Battle Detail Page — Design Spec

**Date:** 2026-05-07  
**Route:** `/battles/[id]`  
**Status:** Approved

## Overview

The battle detail page is the primary hub for a single battle. It lets users view the battle info, submit a video entry, browse all submissions in a ranked grid, and cast or retract a vote. All of these actions live on one page — there is no tabbed or split layout.

---

## Data Layer

### Schema change — `Submission.user`

The `Submission` GraphQL type currently has `userId: ID!` but no user object. Add:

- `schema.ts`: `user: User!` field on `Submission`
- `resolvers.ts`: `Submission.user` resolver — `db.user.findUnique({ where: { id: parent.userId } })`

### Client queries

Update `GET_BATTLE` in `client/lib/graphql/queries.ts` to include user data on submissions:

```graphql
submissions {
  id
  userId
  videoUrl
  title
  description
  voteCount
  createdAt
  votes { id userId }
  user { id username name image }
}
```

Add `CREATE_SUBMISSION` mutation to `queries.ts`:

```graphql
mutation CreateSubmission($battleId: ID!, $videoUrl: String!, $title: String, $description: String) {
  createSubmission(battleId: $battleId, videoUrl: $videoUrl, title: $title, description: $description) {
    id
    userId
    videoUrl
    title
    description
    voteCount
    createdAt
    user { id username name image }
  }
}
```

Existing `VOTE_MUTATION` and `DELETE_VOTE_MUTATION` in `queries.ts` are used as-is.

---

## Page Structure

### Battle Header (always visible)

- Title (large, uppercase, bold — matching site typography)
- Status badge (existing `Badge` variant: upcoming/active/voting/completed)
- Type badge (e.g. "Open Format") — plain muted badge
- Date range: start → end
- Description (if present)

### Submit Your Entry Form (conditional)

Shown only when **all three** conditions are true:
1. Battle status is `ACTIVE`
2. User is authenticated (`session.user` exists)
3. User has not already submitted (no submission with `userId === session.user.id`)

If authenticated but already submitted: hide the form entirely (no message needed — their submission is visible in the grid).  
If not authenticated: show a brief "Sign in to submit your entry" prompt with a link to `/auth/signin`.  
If battle is not `ACTIVE`: hide the form entirely.

Form fields:
- **Video URL** (required) — YouTube link
- **Title** (optional)
- **Description** (optional)

On success: refetch `GET_BATTLE`, hide the form.

### Submissions Grid

All submissions sorted descending by `voteCount`. Responsive grid: 1 col (mobile) → 2 col (tablet) → 3 col (desktop).

**Podium treatment** (applied by rank index after sort):

| Rank | Border | Badge |
|------|--------|-------|
| 1st | Amber/gold | `#1` gold badge |
| 2nd | Slate/silver | `#2` silver badge |
| 3rd | Amber-brown/bronze | `#3` bronze badge |
| 4th+ | Default `border-border` | No badge |

---

## Components

All co-located in `client/app/battles/[id]/`.

### `page.tsx`

- Calls `useQuery(GET_BATTLE, { variables: { id } })`
- Reads `useSession()` to get current user
- Derives `userVotedSubmissionId`: find the submission whose `votes` array contains a vote with `userId === session.user.id`
- Sorts submissions by `voteCount` descending before rendering
- Handles loading, error, and not-found states

### `SubmitEntryForm`

Props: `battleId: string`, `onSuccess: () => void`

- Controlled inputs: `videoUrl` (required), `title`, `description`
- Fires `CREATE_SUBMISSION` mutation on submit
- Calls `onSuccess` (triggers `GET_BATTLE` refetch in parent) and resets form on success
- Shows inline error on failure

### `SubmissionCard`

Props: `submission`, `rank: number`, `userVotedSubmissionId: string | null`, `currentUserId: string | null`

Renders:
- Embedded video iframe (via `getEmbedUrl`); if URL unrecognized, renders a plain anchor link
- DJ avatar (image or initial fallback), username, linked to `/users/[id]`
- Vote count
- Vote button — three states:
  - **Active "Vote"**: `userVotedSubmissionId` is null → fires `VOTE_MUTATION`
  - **"Voted" (removable)**: `userVotedSubmissionId === submission.id` → fires `DELETE_VOTE_MUTATION`
  - **Disabled**: `userVotedSubmissionId` is some other submission's ID (vote already used elsewhere in this battle)
- Podium border + rank badge if `rank <= 3`
- No vote button if `currentUserId` is null (logged out)

### `getEmbedUrl` (utility function)

Converts raw YouTube URLs to embeddable form. Handles:
- `youtube.com/watch?v=VIDEO_ID`
- `youtu.be/VIDEO_ID`
- `youtube.com/shorts/VIDEO_ID`

Returns `string | null` — null triggers the plain-link fallback in `SubmissionCard`.

---

## Files Changed

| File | Change |
|------|--------|
| `server/src/schema.ts` | Add `user: User!` to `Submission` type |
| `server/src/resolvers.ts` | Add `Submission.user` field resolver |
| `client/lib/graphql/queries.ts` | Update `GET_BATTLE` + add `CREATE_SUBMISSION` |
| `client/app/battles/[id]/page.tsx` | New — main page component |
| `client/app/battles/[id]/SubmitEntryForm.tsx` | New — submission form |
| `client/app/battles/[id]/SubmissionCard.tsx` | New — ranked submission card |
| `client/app/battles/[id]/getEmbedUrl.ts` | New — YouTube URL utility |
