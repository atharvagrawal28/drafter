/**
 * UI primitives in the shadcn/ui idiom — copied components living in the repo,
 * built on Tailwind + class-variance-authority with no Radix runtime.
 *
 * The deliberate omission of a component library keeps the dependency surface
 * small (this has to install and build reliably before a deadline) and gives
 * full control over the prospectus typography, which off-the-shelf components
 * tend to fight.
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

/**
 * The press is the point.
 *
 * `active:translate-y-px` costs one class and is most of what makes a button
 * feel like a physical control rather than a coloured rectangle. Transitions
 * cover colour, shadow AND transform, at a duration short enough to feel
 * immediate (150ms) and an ease-out that settles rather than bounces.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-smooth active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary/92 hover:shadow-md active:shadow-xs",
        accent: "bg-accent text-accent-foreground shadow-sm hover:bg-accent/92 hover:shadow-md active:shadow-xs",
        outline:
          "border border-border bg-card text-foreground shadow-xs hover:border-input hover:bg-secondary/70 hover:shadow-sm",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/75",
        ghost: "hover:bg-secondary/70 hover:text-secondary-foreground",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/92 hover:shadow-md active:shadow-xs",
        link: "text-primary underline-offset-4 hover:underline active:translate-y-0",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-md px-6 text-[15px]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border border-border bg-card text-card-foreground shadow-sm transition-shadow duration-200 ease-smooth",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

export const CardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 p-5", className)} {...props} />
);

export const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn("text-base font-semibold leading-none tracking-tight", className)} {...props} />
);

export const CardDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn("text-sm text-muted-foreground", className)} {...props} />
);

export const CardContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("p-5 pt-0", className)} {...props} />
);

export const CardFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex items-center p-5 pt-0", className)} {...props} />
);

// ---------------------------------------------------------------------------
// Badge / status chip
// ---------------------------------------------------------------------------

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-[3px] text-[10.5px] font-medium leading-none tracking-[0.01em] transition-colors duration-150",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        // A hairline rather than a fill: an outline badge should recede.
        outline: "border-border/80 text-muted-foreground",
        complete:
          "border-[hsl(var(--status-complete))]/20 bg-[hsl(var(--status-complete))]/[0.09] text-[hsl(var(--status-complete))]",
        partial:
          "border-[hsl(var(--status-partial))]/25 bg-[hsl(var(--status-partial))]/[0.11] text-[hsl(var(--status-partial))]",
        missing:
          "border-[hsl(var(--status-missing))]/20 bg-[hsl(var(--status-missing))]/[0.09] text-[hsl(var(--status-missing))]",
        defect:
          "border-[hsl(var(--status-defect))]/20 bg-[hsl(var(--status-defect))]/[0.09] text-[hsl(var(--status-defect))]",
        accent: "border-accent/25 bg-accent/[0.1] text-accent",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = ({ className, variant, ...props }: BadgeProps) => (
  <span className={cn(badgeVariants({ variant }), className)} {...props} />
);

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export function Progress({
  value,
  className,
  indicatorClassName,
}: {
  value: number;
  className?: string;
  indicatorClassName?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-full bg-secondary shadow-[inset_0_1px_2px_hsl(218_30%_12%_/_0.06)]",
        className,
      )}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          "h-full rounded-full bg-primary transition-[width] duration-700 ease-smooth",
          indicatorClassName,
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-xs transition-[border-color,box-shadow] duration-150 ease-smooth placeholder:text-muted-foreground hover:border-ring/35 focus:border-ring/70 focus:outline-none focus:ring-[3px] focus:ring-ring/12 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[80px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm leading-relaxed shadow-xs transition-[border-color,box-shadow] duration-150 ease-smooth placeholder:text-muted-foreground hover:border-ring/35 focus:border-ring/70 focus:outline-none focus:ring-[3px] focus:ring-ring/12 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "flex h-9 w-full cursor-pointer rounded-md border border-input bg-card px-3 py-1 text-sm shadow-xs transition-[border-color,box-shadow] duration-150 ease-smooth hover:border-ring/35 focus:border-ring/70 focus:outline-none focus:ring-[3px] focus:ring-ring/12 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export const Label = ({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label
    className={cn("text-sm font-medium leading-none text-foreground", className)}
    {...props}
  />
);

// ---------------------------------------------------------------------------
// Separator
// ---------------------------------------------------------------------------

export const Separator = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("h-px w-full shrink-0 bg-border", className)} {...props} />
);

// ---------------------------------------------------------------------------
// Segmented control — used for the Promoter / Merchant-Banker toggle
// ---------------------------------------------------------------------------

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string; icon?: React.ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-lg bg-secondary p-[3px] shadow-[inset_0_1px_2px_hsl(218_30%_12%_/_0.05)]",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-xs font-medium transition-all duration-200 ease-smooth",
              active
                ? "bg-card text-primary shadow-xs"
                : "text-muted-foreground hover:text-secondary-foreground",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

export function Collapsible({
  trigger,
  children,
  defaultOpen = false,
  className,
}: {
  trigger: (open: boolean) => React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className={className}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full text-left">
        {trigger(open)}
      </button>
      {open ? <div className="animate-fade-in">{children}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center">
      {icon ? <div className="mb-3 text-muted-foreground">{icon}</div> : null}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
