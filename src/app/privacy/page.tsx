import type { Metadata } from "next";
import Link from "next/link";
import {
  BUSINESS_NAME,
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_NOTICE_VERSION,
  RETENTION_YEARS_AFTER_LAST_VISIT,
} from "@/lib/privacy";

export const metadata: Metadata = { title: `Privacy Notice — ${BUSINESS_NAME}` };

/**
 * The privacy notice shown before a Sharelebrator card is created.
 *
 * Plain language on purpose: diners read this on a phone at the table. Every
 * field listed here must match what the signup form and the card actually
 * collect — if a field is added or dropped, change this page and bump
 * PRIVACY_NOTICE_VERSION in lib/privacy.ts.
 */
export default function PrivacyPage() {
  const updated = new Date(`${PRIVACY_NOTICE_VERSION}T00:00:00Z`).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-5 py-8 text-sm leading-relaxed text-zinc-800">
      <div>
        <h1 className="text-2xl font-black text-zinc-900">Privacy Notice</h1>
        <p className="mt-1 text-xs text-zinc-500">
          {BUSINESS_NAME} · Sharelebrator loyalty card and table ordering · Last updated {updated}
        </p>
      </div>

      <p>
        This notice explains what personal information {BUSINESS_NAME} collects when you use our ordering app and
        Sharelebrator card, why we need it, and what you can ask us to do with it. We handle your information in line
        with the Philippine Data Privacy Act of 2012 (Republic Act No. 10173).
      </p>

      <Section title="What we collect, and why">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <b>Mobile number</b> — your card number and login, so your points follow you to any branch.
          </li>
          <li>
            <b>Password</b> — to protect your card. We store it scrambled (hashed); nobody at {BUSINESS_NAME} can read
            it.
          </li>
          <li>
            <b>Name</b> — so our staff can greet you and confirm the card is yours.
          </li>
          <li>
            <b>Birthday</b> — for birthday treats and greetings at the branch.
          </li>
          <li>
            <b>Address (optional)</b> — only if you want it printed on your official receipt.
          </li>
          <li>
            <b>Email (optional)</b> — only if you give it, to contact you about your card.
          </li>
          <li>
            <b>Visits, orders and points</b> — to earn and spend points, honour rewards, and keep the records the law
            requires for sales.
          </li>
          <li>
            <b>A random ID for your phone</b> — so the app knows which phone at the table placed which order. It does
            not identify you by name.
          </li>
          <li>
            <b>Photos you take in our games</b> — stay on your phone. They are only shared if you share them yourself.
          </li>
        </ul>
      </Section>

      <Section title="Who sees it">
        <p>
          Our branch staff see your name, card number and points when serving you. We do not sell your information
          and we do not share it with advertisers. We use Google Firebase to run the app and store the data securely.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          We keep your card details while you use your card. If you have not visited any branch or used your card
          for {RETENTION_YEARS_AFTER_LAST_VISIT} years, we delete your card and personal details, along with any
          points left on it. Sales and receipt records are kept only as long as tax law requires.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You can ask to see the information we hold about you, correct it, or have your card and personal details
          deleted. You can also withdraw your consent at any time — this closes your card. Email us at{" "}
          <a className="font-semibold text-primary underline" href={`mailto:${PRIVACY_CONTACT_EMAIL}`}>
            {PRIVACY_CONTACT_EMAIL}
          </a>{" "}
          from any address, and include your card&apos;s mobile number. You may also raise a concern with the National
          Privacy Commission.
        </p>
        <p className="mt-2">You can change your name, birthday, address and email yourself on your card page.</p>
      </Section>

      <Section title="Changes">
        <p>
          If we change this notice in an important way, we will show it to you again in the app before it applies to
          you.
        </p>
      </Section>

      <Link href="/" className="inline-block text-sm font-semibold text-primary underline">
        Back to the app
      </Link>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-black text-zinc-900">{title}</h2>
      {children}
    </section>
  );
}
