import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy · FlowBuddy',
  description:
    'How the FlowBuddy Recorder browser extension and the FlowBuddy copilot collect, use, and protect your data.',
};

// Where privacy requests should be sent. Change this to a branded address
// (e.g. privacy@yourdomain.com) once you have one.
const CONTACT_EMAIL = 'singh.himanshu3535@gmail.com';
const LAST_UPDATED = 'June 30, 2026';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-9">
      <h2 className="text-[17px] font-extrabold tracking-tight text-ink">
        {title}
      </h2>
      <div className="mt-2 space-y-3 text-[14px] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-canvas px-4 py-12">
      <main className="mx-auto w-full max-w-3xl">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-gradient-logo text-sm font-bold text-white">
            S
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">
            Privacy Policy
          </h1>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-faint">
            Last updated {LAST_UPDATED}
          </p>
        </div>

        <div className="mt-8 rounded-card border bg-card p-6 shadow-card md:p-8">
          <p className="text-[14px] leading-relaxed text-muted-foreground">
            FlowBuddy (&ldquo;FlowBuddy&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) provides
            an embeddable AI help copilot for SaaS products. This policy explains
            what the <strong className="text-ink">FlowBuddy Recorder</strong> browser
            extension and the FlowBuddy service collect, how that information is used,
            and the choices you have. It applies to the extension, the FlowBuddy Studio
            web app, and the embeddable copilot widget.
          </p>

          <Section title="The FlowBuddy Recorder extension — single purpose">
            <p>
              The FlowBuddy Recorder has one purpose: to let you capture a narrated
              walkthrough of a product so FlowBuddy can turn it into a help knowledge
              base. The extension is <strong className="text-ink">dormant until
              you explicitly start a recording</strong> from its toolbar popup. It
              does not monitor your browsing, run in the background, or collect
              anything when a recording is not in progress.
            </p>
            <p>
              While a recording is active, and only on the tab you are recording,
              the extension captures:
            </p>
            <ul className="ml-5 list-disc space-y-1.5">
              <li>
                <strong className="text-ink">Screenshots</strong> of the visible
                tab, to illustrate each step.
              </li>
              <li>
                <strong className="text-ink">Microphone audio</strong> — your
                spoken narration of the workflow.
              </li>
              <li>
                <strong className="text-ink">Interaction events</strong> — clicks,
                form changes, submits, key presses, and in-page navigation,
                together with the page URL and basic semantics of the elements you
                interact with (such as a button&rsquo;s label).
              </li>
            </ul>
            <p>
              Because typed input on the recorded page may be captured, avoid
              entering passwords or other sensitive credentials while a recording
              is running.
            </p>
          </Section>

          <Section title="Information we collect">
            <ul className="ml-5 list-disc space-y-1.5">
              <li>
                <strong className="text-ink">Account information</strong> — the
                name, email address, and password (stored only as a salted hash)
                you provide to create a FlowBuddy Studio account.
              </li>
              <li>
                <strong className="text-ink">Recording content</strong> — the
                screenshots, narration audio, and interaction events described
                above, uploaded to FlowBuddy when you record a session.
              </li>
              <li>
                <strong className="text-ink">Copilot usage</strong> — questions
                end users ask your embedded copilot, the answers returned, any
                thumbs-up/down feedback, and timestamps, used to power answers and
                analytics.
              </li>
              <li>
                <strong className="text-ink">Technical data</strong> — limited
                request metadata (such as a widget &ldquo;last seen&rdquo;
                heartbeat) needed to operate and secure the service.
              </li>
            </ul>
          </Section>

          <Section title="How we use information">
            <ul className="ml-5 list-disc space-y-1.5">
              <li>To synthesize your recordings into a knowledge base.</li>
              <li>
                To power the copilot, which answers only from the knowledge you
                have explicitly approved.
              </li>
              <li>
                To provide analytics in FlowBuddy Studio (e.g. questions asked,
                coverage gaps, answer quality).
              </li>
              <li>To operate, secure, debug, and improve the service.</li>
            </ul>
            <p>
              We do <strong className="text-ink">not</strong> sell your data, use
              it for advertising, or use it to train third-party foundation models
              beyond generating answers for your own copilot.
            </p>
          </Section>

          <Section title="Extension permissions, and why we request them">
            <ul className="ml-5 list-disc space-y-1.5">
              <li>
                <strong className="text-ink">Host access to the site you record
                (<code>&lt;all_urls&gt;</code>)</strong> — so you can record a
                walkthrough on whichever product you choose. The capture script is
                active only during a recording you start.
              </li>
              <li>
                <strong className="text-ink">activeTab, tabs, scripting</strong> —
                to inject the capture script into the tab being recorded and take
                step screenshots.
              </li>
              <li>
                <strong className="text-ink">offscreen</strong> — to record
                microphone narration.
              </li>
              <li>
                <strong className="text-ink">storage</strong> — to buffer the
                in-progress recording locally in your browser until it is uploaded.
              </li>
            </ul>
          </Section>

          <Section title="Sharing and service providers">
            <p>
              We share data only with vendors that help us run FlowBuddy, under
              confidentiality obligations:
            </p>
            <ul className="ml-5 list-disc space-y-1.5">
              <li>
                <strong className="text-ink">OpenAI</strong> — to synthesize
                recordings and generate copilot answers.
              </li>
              <li>
                <strong className="text-ink">Cloud hosting and object
                storage</strong> — to run the service and store recording
                artifacts.
              </li>
            </ul>
            <p>
              We may also disclose information if required by law or to protect the
              rights and safety of our users and the service.
            </p>
          </Section>

          <Section title="Data retention and deletion">
            <p>
              Recordings and the knowledge derived from them are retained until you
              delete them. You can delete a recording from FlowBuddy Studio, which
              removes its associated artifacts. To delete your account and all
              associated data, contact us at the address below.
            </p>
          </Section>

          <Section title="Security">
            <p>
              Data is transmitted over encrypted connections (HTTPS) and access is
              restricted to your workspace. No method of transmission or storage is
              perfectly secure, but we work to protect your information using
              industry-standard measures.
            </p>
          </Section>

          <Section title="Your choices">
            <p>
              You control when the recorder runs — it captures only while you have
              an active recording. You can review, edit, approve, and delete the
              knowledge that powers your copilot at any time in FlowBuddy Studio, and you
              can request access to or deletion of your data by contacting us.
            </p>
          </Section>

          <Section title="Children">
            <p>
              FlowBuddy is a business tool and is not directed to children under 13, and
              we do not knowingly collect their personal information.
            </p>
          </Section>

          <Section title="Changes to this policy">
            <p>
              We may update this policy from time to time. Material changes will be
              reflected by updating the &ldquo;Last updated&rdquo; date above.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Questions or privacy requests? Email us at{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>
        </div>

        <div className="mt-6 text-center text-[13px]">
          <Link
            href="/"
            className="text-muted-foreground underline-offset-4 hover:text-ink hover:underline"
          >
            ← Back to FlowBuddy
          </Link>
        </div>
      </main>
    </div>
  );
}
