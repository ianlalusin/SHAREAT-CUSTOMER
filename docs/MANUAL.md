# SharEat Customer Hub — Manual

## 1. Introduction

The SharEat Customer Hub is the mobile web app diners use at their table. It is a
Progressive Web App (installable, mobile-first) that lets a guest join their
active dining session, browse the menu, order refills, send requests to staff,
leave feedback, and use the **Sharelebrator** loyalty program. It connects to
the same backend as the POS — requests and refills land on the kitchen/server
screens in real time, and the menu is the store's POS catalog.

There are two audiences:
- **Customers** (diners) — §2–§6.
- **Customer-Hub admins** (catalog & content managers) — §7.

---

## 2. Joining a Session

A guest gets into their table's session one of two ways:

- **QR code**: scan the QR on the table / PIN slip. It opens the Hub and joins
  the session automatically.
- **PIN**: open the Hub and enter the **6-character PIN** printed on the slip
  (the `/join` screen).

On success the guest lands on their **Session Dashboard** with a welcome message
and their table shown. If the session has ended or the PIN is no longer valid,
the Hub shows a **"Session Closed"** screen rather than stale data.

Sessions are seat-based: multiple guests at the same table can join the same
session from their own phones.

---

## 3. The Session Dashboard

The main screen once joined. Everything is large-tap, mobile-first.

- **Browse the Menu**: the catalog shows the store's items (the POS catalog,
  organized by category) so guests can see what's available.
- **Order Refill**: tap **Order Refill** to request refillable items (and
  flavors where applicable). Orders go straight to the assigned kitchen station.
  Two rules apply, both enforced server-side:
  - **One flavor per meat.** Each meat takes a single flavor per order — e.g.
    Pork → Bulgogi together with Beef → Galbi. Picking another flavor for the
    same meat replaces the current one.
  - **Order it again once it arrives.** After ordering Pork, that guest's Pork
    stays locked while it is still with the kitchen — and for at least a minute
    — then frees up as soon as the kitchen marks it served or cancelled. Their
    Beef is unaffected and has its own clock. The clocks are per phone, so four
    guests at one table can all order at the same time. A blocked meat shows
    either "On its way" (still with the kitchen) or a short countdown, and
    cannot be selected. If the kitchen never closes a ticket the block lifts on
    its own after 10 minutes, so a forgotten order can never lock a guest out.
- **Request / Call Staff**: tap **Request** to send a free-text message to staff
  (call a server, ask about add-ons, anything). These appear on the kitchen's
  **Customer Requests** panel, where staff mark them done; response time is
  tracked.
- **Request status**: submitted refills/requests track their status so the guest
  can see progress.
- **Submit Feedback**: a floating **Feedback** bubble lets the guest rate /
  comment on their visit (once per session).
- **Flash Ads**: time-limited promos may appear as an overlay or a badge the
  guest can tap to view.

---

## 4. Sharelebrator (Loyalty)

The Hub's loyalty program. Available from the **Card** tab and a floating
mini-card.

- **Sign up / Log in**: a guest can create a Sharelebrator account or log into an
  existing one from the Hub.
- **Card & points**: view the membership card and current points balance.
- **Link to this session**: linking the loyalty account to the active session so
  the visit earns points.
- **Transfer points**: send points to another Sharelebrator member (looked up by
  their identifier).
- **Edit profile**: update member details.
- **Redeem**: redeem points/rewards from the redeem screen.

---

## 5. Installing the App (PWA)

The Hub is a Progressive Web App: guests can "Add to Home Screen" for an
app-like, fast-loading experience. No app-store install needed.

---

## 6. Session Lifecycle

- A session stays live while the table's POS session is active.
- When staff close or void the session (or access expires), the Hub redirects to
  **Session Closed**.
- Re-joining requires a fresh QR/PIN from staff.

---

## 7. Admin: Managing the Customer Hub

Customer-Hub admins manage the content the diners see. Sign in at **`/admin`**
(separate from the POS login).

- **Categories**: organize the customer-facing menu into categories.
- **Items**: manage the customer catalog items and **link each one to a POS
  product** so prices/availability stay consistent. (The POS also exposes this
  under Admin → Customer App Catalog.)
- **Flash Ads**: create the time-limited promos shown to diners (overlay/badge).
- **Feedback**: review feedback submitted by guests.
- **Catalog cache**: rebuild the per-store / global catalog caches the Hub reads
  from (used after catalog changes).

---

## 8. How it Connects to the POS

- **Menu** = the store's POS catalog (linked per item; cached for fast reads).
- **Refills & requests** = written to the same store session; they surface on the
  POS **Kitchen (KDS)** and **Server** screens in real time.
- **Sharelebrator** = the shared loyalty program (the POS side calls it
  Sharelebrator / loyalty; points earned here appear there).
- **Join** = QR/PIN issued by the POS PINs screen for the table's session.

---

## Change Log

A running log of notable changes to the Customer Hub. Newest on top.

### 2026-05-24 — Manual created

Initial version of this manual, documenting the join flow, session dashboard
(menu, refills, requests, feedback, flash ads), the Sharelebrator loyalty
features, PWA install, and the admin catalog/ads/feedback tools.
