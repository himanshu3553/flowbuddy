'use client';

import * as React from 'react';
import {
  BookOpen,
  Code2,
  Flag,
  HelpCircle,
  Lightbulb,
  ListChecks,
  Mic,
  MessagesSquare,
  Puzzle,
  RefreshCw,
  UploadCloud,
  Video,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface Step {
  icon: LucideIcon;
  title: string;
  body: string;
  /** 'record' tints the tile red for the "press record" step. */
  tone?: 'default' | 'record';
}

function Stepper({ steps }: { steps: Step[] }) {
  return (
    <div className="px-1 pt-1">
      {steps.map((s, i) => {
        const Icon = s.icon;
        const last = i === steps.length - 1;
        return (
          <div key={i} className="flex gap-3.5">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border',
                  s.tone === 'record'
                    ? 'border-destructive/20 bg-destructive/10 text-destructive'
                    : 'border-primary/20 bg-primary/10 text-primary',
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
              </div>
              {!last && <div className="my-1.5 w-0.5 flex-1 bg-primary/15" />}
            </div>
            <div className={cn('flex-1', last ? 'pb-1' : 'pb-4')}>
              <div className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-primary/60">
                Step {i + 1}
              </div>
              <div className="mt-0.5 text-[14.5px] font-semibold tracking-tight">
                {s.title}
              </div>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                {s.body}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FooterCallout({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-primary/30 bg-primary/[0.06] p-3.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-card text-primary">
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <p className="text-[12.5px] leading-snug text-foreground/80">{children}</p>
    </div>
  );
}

const howSyncWorks: Step[] = [
  {
    icon: Video,
    title: 'Record your product',
    body: 'Click through your product while talking out loud. The Sync browser extension captures the screen, your voice and every click.',
  },
  {
    icon: BookOpen,
    title: 'Sync builds your knowledge base',
    body: 'It automatically turns that recording into clean, step-by-step workflows. No manual writing required.',
  },
  {
    icon: ListChecks,
    title: 'Approve what the copilot can use',
    body: 'Review the workflows and approve them with one click. The copilot only ever answers from what you approve.',
  },
  {
    icon: Code2,
    title: 'Add the copilot to your app',
    body: 'Copy one line of code and paste it into your product.',
  },
  {
    icon: MessagesSquare,
    title: 'Your customers get instant answers',
    body: 'The copilot answers your customer’s questions right inside your app with sources and an honest “I don’t know yet” when it’s unsure.',
  },
];

const howToRecord: Step[] = [
  {
    icon: Puzzle,
    title: 'Install & connect the recorder',
    body: 'Add the Sync Recorder to Chrome, then click “Connect with Sync” to link it to your workspace.',
  },
  {
    icon: Mic,
    title: 'Open your product and press Start',
    body: 'Go to your live product, open the extension, and hit Start recording.',
    tone: 'record',
  },
  {
    icon: Mic,
    title: 'Click through a workflow, narrating',
    body: 'Do the task for real while talking out loud — what you’re doing and why. Sync captures the screen, your voice, clicks and pages.',
  },
  {
    icon: Flag,
    title: 'Mark each new workflow',
    body: 'Starting a different task? Hit “Mark new workflow” so Sync keeps them as separate, clean guides.',
  },
  {
    icon: UploadCloud,
    title: 'Stop, and it uploads itself',
    body: 'Press “Stop & upload.” Your session uploads securely and Sync turns it into your Knowledge Base.',
  },
];

/** "How Sync works" — pass the trigger as children (rendered with asChild). */
export function HowItWorksDialog({ children }: { children: React.ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>How Sync works</DialogTitle>
          <DialogDescription>
            From one recording to live, trustworthy answers — in five steps.
          </DialogDescription>
        </DialogHeader>
        <Stepper steps={howSyncWorks} />
        <FooterCallout icon={RefreshCw}>
          <b className="font-semibold">It gets better on its own.</b> Every
          question the copilot can’t answer becomes a “record this next” tip so
          your help section keeps improving.
        </FooterCallout>
      </DialogContent>
    </Dialog>
  );
}

/** "How to record" — pass the trigger as children (rendered with asChild). */
export function HowToRecordDialog({ children }: { children: React.ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>How to record</DialogTitle>
          <DialogDescription>
            Capture a workflow with the Sync Recorder — about 15 minutes.
          </DialogDescription>
        </DialogHeader>
        <Stepper steps={howToRecord} />
        <FooterCallout icon={Lightbulb}>
          <b className="font-semibold">Narrate as you go.</b> Saying what you’re
          doing and why is what makes the copilot’s answers accurate — and it’s
          masked for PII before upload.
        </FooterCallout>
      </DialogContent>
    </Dialog>
  );
}

export function HomeHelpDialogs() {
  return (
    <>
      <HowItWorksDialog>
        <Button
          variant="outline"
          size="sm"
          className="border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
        >
          <HelpCircle className="h-4 w-4" />
          How it works
        </Button>
      </HowItWorksDialog>

      <HowToRecordDialog>
        <Button
          size="sm"
          className="bg-gradient-to-b from-[#4a63e8] to-[#3a50dd] text-white shadow-[0_2px_10px_rgba(58,80,221,0.3)] hover:opacity-95"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-white" />
          How to Record
        </Button>
      </HowToRecordDialog>
    </>
  );
}
