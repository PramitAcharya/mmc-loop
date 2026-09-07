# MMC loop

Build MMCLoop as a production-minded but intentionally small one-day MVP. MMCLoop is an UNOFFICIAL student community portal for Makawanpur Multiple Campus (MMC), Hetauda, Nepal. It must clearly state throughout appropriate areas that it is unofficial and is not operated, endorsed, or administered by MMC. Use https://mmchetauda.edu.np/ only as factual context for the college; do not invent college facts.

PRODUCT GOAL
Create a Reddit-inspired community platform for MMC students where they can discuss college life, anonymously report issues, ask questions, share study/general/fun posts, vote and comment, and find other students who are free for activities. Give it its own MMCLoop identity; do NOT copy Reddit branding, logo, exact styling, or assets.

ONE-DAY MVP PRIORITY
Build a small, coherent, end-to-end working MVP rather than a huge social network. Prioritize: authentication, feed, posts, anonymous posting, voting, comments, categories, Who's Free, reporting, and a lightweight profile. Add direct chat only if it can be implemented cleanly without destabilizing the MVP. Do not build payments, marketplace, video calls, voice chat, location tracking, AI matching, complex notifications, or elaborate group systems.

TECHNICAL DIRECTION
Use Lovable's standard full-stack TypeScript stack and Supabase/PostgreSQL for authentication, database, and storage where appropriate. Keep schema and queries simple. Use secure row-level access policies. Never expose private user identity behind anonymous posts to ordinary users. The authenticated user's ownership/moderation data may remain available to authorized backend/admin logic only.

PAGES / ROUTES
1. / — Landing/home: MMCLoop branding, concise explanation, unofficial disclaimer, CTA to join community, and a small preview of community activity.
2. /feed — Main Reddit-style feed. Tabs Latest and Trending; category filters; post cards; vote controls; comment count; anonymous/public author display.
3. /create — Create post form: title, body, category, optional image, anonymous/public toggle. Validate inputs and show clear errors/success.
4. /post/:id — Full post, voting, comments and nested replies if simple, report action.
5. /activities — “Who's Free?” feed with activity cards and filters.
6. /profile/:username — Minimal public profile: username, posts, activity, reputation/karma-like score. Never reveal identities behind anonymous posts.
7. /search — Keyword search plus category filtering.
8. /auth — Sign up, log in, log out, and basic session handling.
9. /chat — Only implement if straightforward within the MVP. Prefer simple user-to-user messaging over complex real-time infrastructure; otherwise leave a clearly marked “coming soon” UI and do not let this block the rest of the app.
10. /admin — Minimal moderation view for authorized admin/moderator users: reported posts/comments, report reason, status, and simple hide/remove action.

NAVIGATION
Desktop: logo, Home/Feed, Who's Free?, Search, Create Post, and profile/auth controls. Mobile: compact header plus bottom navigation or a clean mobile menu. Make the primary actions obvious.

VISUAL DESIGN
Create a modern, clean, youthful college-community aesthetic. Avoid generic corporate SaaS styling and avoid copying Reddit. Use a distinctive MMCLoop wordmark/text treatment, subtle loop/community motif, rounded cards, clear hierarchy, comfortable spacing, and restrained accent colors. The interface should feel welcoming rather than childish. Support responsive desktop/tablet/mobile layouts. Include empty states, loading states, error states, hover/focus states, and accessible keyboard navigation. Ensure readable contrast and visible focus indicators.

COMMUNITY CATEGORIES
Use these predefined categories for MVP: College Issues, Suggestions, Questions, Study, General, Memes & Fun, Gaming, Hangout, and Announcements & Information. Keep categories data-driven so they can be changed later.

POST MODEL
Each post should have: id, author_user_id, title, body, category_id, optional image_url, is_anonymous, created_at, updated_at, score, comment_count, status/visibility. Public posts display the username. Anonymous posts display “Anonymous Student.” Do not reveal author identity in UI, API responses, or client state unnecessarily. Support editing/deleting only by the owner or authorized moderator.

VOTING
Implement one vote per authenticated user per post, with upvote/downvote/toggle behavior. Keep score consistent. Prevent duplicate votes. If comment voting is simple to implement, support it too; otherwise prioritize post voting.

COMMENTS
Authenticated users can comment on posts and reply to comments if simple. Store author, post reference, optional parent comment, body, timestamps, score, and moderation status. Anonymous comments are optional; do not add complexity unless easy. Add report action.

ANONYMOUS POSTING
A user can choose “Post anonymously.” Other users see only “Anonymous Student.” Never display the user's profile link, username, avatar, or identifying metadata for that post. The database should retain the author_user_id privately so the user can manage their post and authorized moderators can investigate abuse. Do not claim anonymity guarantees beyond what the application actually implements.

WHO'S FREE?
This is a signature MMCLoop feature. Users can create an availability/activity card with: activity type, short message, availability date/time, optional duration, and creator. Activity types: Gaming, Study, Hangout, Food/Coffee, Movie/Watch, Walk/Outdoor, Just Talk, and Other. Users can browse/filter by activity and approximate availability. Keep matching simple: filters/tags only. Do not build location tracking or an algorithmic matchmaking system. Include an “I’m interested” or simple response action if it can be implemented reliably; otherwise use a lightweight contact/chat CTA.

PROFILES
Keep profiles intentionally minimal: username, optional avatar, short bio, joined date, public posts, activities, and reputation score. Do not add follower/following systems.

REPORTING & MODERATION
Every post and comment should have a Report action with a small fixed reason list such as spam, harassment, inappropriate content, misleading information, or other. Store reports separately with reporter, target, reason, timestamp, and status. Create a minimal protected admin/moderator page to review reports and hide/remove content. Do not build sophisticated automated moderation. Add basic anti-spam validation/rate limiting where practical.

AUTHENTICATION
Use Supabase Auth or Lovable's standard supported auth. Require authentication to create posts, vote, comment, report, create Who's Free entries, and message. Browsing the feed may be public. Use email/password initially unless the platform provides a simpler secure option. Do not require college identity verification for this one-day MVP; make it easy to add later. Do not collect unnecessary personal information.

DATABASE
Use a small normalized PostgreSQL schema with tables approximately: profiles, categories, posts, comments, post_votes, comment_votes if implemented, activities, reports, and messages only if chat is implemented. Add created_at/updated_at timestamps where useful. Use foreign keys and indexes for common feed queries. Configure RLS so users can manage their own content, public content is readable as intended, votes are private to their owners, reports are visible only to authorized moderators, and anonymous author relationships cannot be exposed to ordinary users.

DEMO DATA
Seed a small amount of clearly labeled demo/example content relevant to MMC, such as a sample college issue, study question, gaming activity, hangout activity, general discussion, and suggestion. Do not fabricate official announcements or pretend demo content is from MMC. Use only factual college context from the official website when displaying college information.

LANDING COPY / DISCLAIMER
Make it clear that MMCLoop is an independent student/community project. Include language such as “MMCLoop is an unofficial student community platform and is not affiliated with, operated by, or endorsed by Makawanpur Multiple Campus.” Do not use MMC's official logo unless there is explicit authorization; prefer a text-based MMCLoop brand.

SECURITY & PRIVACY
Implement input validation, safe rendering of user-generated content, protected authenticated routes, RLS, basic abuse prevention, and sensible image upload limits. Avoid exposing email addresses or private profile fields. Do not store unnecessary sensitive data. Make anonymous-post privacy a deliberate part of the data-access design, not merely a visual toggle.

ACCESSIBILITY
Use semantic HTML, labels for forms, keyboard-accessible controls, visible focus states, sensible heading hierarchy, alt text for user-provided images where applicable, and adequate contrast. Do not rely on color alone for status or actions.

IMPORTANT SCOPE RULES
Do NOT build: payments, marketplace, ads, voice/video calls, location tracking, complex AI recommendations, AI moderation, follower/following graphs, stories/reels, livestreaming, complicated notification systems, elaborate admin analytics, or a full Discord clone. Do not spend the build on documentation pages or unnecessary animations.

BUILD QUALITY
Make the core flows actually functional end-to-end, not mock buttons. Avoid placeholder pages unless a feature is explicitly deferred. If a requested feature threatens the one-day scope, simplify it rather than expanding the architecture. Reuse components, keep the codebase organized, and make sensible defaults. Use clear toast/error feedback and graceful empty/loading states.

SUCCESS CRITERIA
A new visitor can understand MMCLoop immediately, sign up/log in, browse the feed, create a public or anonymous post, vote, comment, search/filter, create and browse a Who's Free activity, report content, and manage their own profile. An authorized moderator can review reports. The application works well on mobile and desktop. The result should feel like a polished small student-community MVP that can be expanded later, not an unfinished attempt at a massive social network.

Start by building the MVP directly. Make reasonable implementation decisions without asking unnecessary questions, and prioritize a working application over explanations.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://mmc-loop-connect.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/480a51b9-358f-4a9c-9fd1-71a1f88d6ca4).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
