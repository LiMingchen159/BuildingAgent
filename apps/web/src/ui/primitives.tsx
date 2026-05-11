import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type TextareaHTMLAttributes
} from "react";

export type BannerTone = "error" | "info" | "success";

export interface DiagnosticLineProps {
  code?: string | undefined;
  requestId?: string | undefined;
  className?: string | undefined;
}

export interface BannerProps extends DiagnosticLineProps {
  tone?: BannerTone | undefined;
  title: string;
  message: string;
}

export interface AppShellProps {
  children: ReactNode;
  authenticated?: boolean | undefined;
  onSignOut?: (() => void) | undefined;
}

export interface SurfaceProps {
  children: ReactNode;
  className?: string | undefined;
  labelledBy?: string | undefined;
}

export interface EmptyStateProps {
  children: ReactNode;
  title?: string | undefined;
}

export interface LoadingSkeletonProps {
  label?: string | undefined;
  lines?: number | undefined;
}

const MOCK_LABELS = {
  mock: "Mock data only",
  stub: "Stub surface only",
  placeholder: "Placeholder-only",
  inspection: "Inspection surfaces are placeholder-only"
} as const;

export type MockOnlyBadgeKind = keyof typeof MOCK_LABELS;

export interface MockOnlyBadgeProps {
  kind?: MockOnlyBadgeKind | undefined;
  label?: string | undefined;
}

function classNames(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(" ");
}

export function BrandMark() {
  return <span className="brand-mark" aria-hidden="true">BA</span>;
}

export function BrandHeader({ authenticated = false, onSignOut }: { authenticated?: boolean | undefined; onSignOut?: (() => void) | undefined }) {
  return (
    <header className="topbar">
      <div>
        <BrandMark />
        <span className="brand-name">BuildingAgent</span>
      </div>
      {authenticated && onSignOut ? <button className="secondary" type="button" onClick={onSignOut}>Sign out</button> : null}
    </header>
  );
}

export function AppShell({ children, authenticated = false, onSignOut }: AppShellProps) {
  return (
    <div className="app-shell">
      <BrandHeader authenticated={authenticated} onSignOut={onSignOut} />
      {children}
    </div>
  );
}

export function DiagnosticLine({ code, requestId, className }: DiagnosticLineProps) {
  if (!code && !requestId) {
    return null;
  }
  return (
    <p className={classNames("diagnostic-line", className)}>
      {code ? <span>Code: {code}</span> : null}
      {requestId ? <span>Request: {requestId}</span> : null}
    </p>
  );
}

export function Banner({ tone = "info", title, message, code, requestId }: BannerProps) {
  return (
    <section className={`banner banner-${tone}`} role={tone === "error" ? "alert" : "status"} aria-live={tone === "error" ? "assertive" : "polite"}>
      <strong>{title}</strong>
      <p>{message}</p>
      <DiagnosticLine code={code} requestId={requestId} />
    </section>
  );
}

export function MockOnlyBadge({ kind = "placeholder", label }: MockOnlyBadgeProps) {
  const displayLabel = label ?? MOCK_LABELS[kind];
  return <span className={`placeholder-badge mock-badge mock-badge-${kind}`}>{displayLabel}</span>;
}

export function Surface({ children, className, labelledBy }: SurfaceProps) {
  return (
    <section className={classNames("surface-card", className)} aria-labelledby={labelledBy}>
      {children}
    </section>
  );
}

export function Card({ children, className, labelledBy }: SurfaceProps) {
  return (
    <article className={classNames("primitive-card", className)} aria-labelledby={labelledBy}>
      {children}
    </article>
  );
}

export function EmptyState({ children, title = "Nothing to show yet" }: EmptyStateProps) {
  return (
    <section className="empty-state management-empty" aria-label={title}>
      <strong>{title}</strong>
      <p>{children}</p>
    </section>
  );
}

export function LoadingSkeleton({ label = "Loading BuildingAgent workspace…", lines = 3 }: LoadingSkeletonProps) {
  const count = Math.max(1, Math.min(lines, 8));
  return (
    <section className="loading-skeleton" role="status" aria-live="polite" aria-label={label}>
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: count }, (_, index) => (
        <span className="loading-skeleton-line" key={index} aria-hidden="true" />
      ))}
    </section>
  );
}

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  loading?: boolean | undefined;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  type,
  disabled,
  children,
  "aria-busy": ariaBusy,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={classNames(`btn btn-${variant}`, size !== "md" && `btn-${size}`, className)}
      disabled={disabled || loading}
      aria-busy={ariaBusy ?? (loading ? true : undefined)}
      {...rest}
    >
      {children}
    </button>
  );
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean | undefined;
};

export function Input({ invalid, className, type, ...rest }: InputProps) {
  return (
    <input
      type={type ?? "text"}
      className={classNames("input-control", invalid && "input-invalid", className)}
      aria-invalid={invalid ? true : undefined}
      {...rest}
    />
  );
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean | undefined;
};

export function Textarea({ invalid, className, ...rest }: TextareaProps) {
  return (
    <textarea
      className={classNames("textarea-control", invalid && "input-invalid", className)}
      aria-invalid={invalid ? true : undefined}
      {...rest}
    />
  );
}

export type BadgeTone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone | undefined;
  className?: string | undefined;
}

export function Badge({ children, tone = "neutral", className }: BadgeProps) {
  return <span className={classNames("badge", `badge-${tone}`, className)}>{children}</span>;
}

export const Pill = Badge;

export interface AvatarProps {
  name: string;
  src?: string | undefined;
  size?: "sm" | "md" | "lg" | undefined;
  className?: string | undefined;
}

function deriveInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "?";
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function Avatar({ name, src, size = "md", className }: AvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(src) && !imageFailed;
  return (
    <span
      className={classNames("avatar", `avatar-${size}`, className)}
      role="img"
      aria-label={name}
    >
      {showImage ? (
        <img src={src} alt="" onError={() => setImageFailed(true)} />
      ) : (
        <span className="avatar-initials" aria-hidden="true">{deriveInitials(name)}</span>
      )}
    </span>
  );
}

export interface DropdownOption<TValue extends string = string> {
  value: TValue;
  label: string;
  disabled?: boolean | undefined;
}

export interface DropdownProps<TValue extends string = string> {
  options: ReadonlyArray<DropdownOption<TValue>>;
  value: TValue | null;
  onChange: (value: TValue) => void;
  label: string;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
  id?: string | undefined;
}

export function Dropdown<TValue extends string = string>({
  options,
  value,
  onChange,
  label,
  placeholder = "Select an option",
  disabled = false,
  className,
  id
}: DropdownProps<TValue>) {
  const generatedId = useId();
  const triggerId = id ?? `dropdown-${generatedId}`;
  const listboxId = `${triggerId}-listbox`;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listboxRef = useRef<HTMLUListElement | null>(null);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handleClickAway(event: MouseEvent) {
      const target = event.target as Node | null;
      if (target && containerRef.current && !containerRef.current.contains(target)) {
        close();
      }
    }
    document.addEventListener("mousedown", handleClickAway);
    return () => document.removeEventListener("mousedown", handleClickAway);
  }, [open, close]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (activeIndex < 0) {
      const fallback = selectedIndex >= 0 ? selectedIndex : options.findIndex((option) => !option.disabled);
      if (fallback >= 0) {
        setActiveIndex(fallback);
      }
    }
  }, [open, activeIndex, selectedIndex, options]);

  function moveActive(direction: 1 | -1) {
    if (options.length === 0) {
      return;
    }
    const start = activeIndex >= 0 ? activeIndex : selectedIndex;
    let next = start;
    for (let step = 0; step < options.length; step += 1) {
      next = (next + direction + options.length) % options.length;
      if (!options[next]!.disabled) {
        setActiveIndex(next);
        return;
      }
    }
  }

  function commit(index: number) {
    const option = options[index];
    if (!option || option.disabled) {
      return;
    }
    onChange(option.value);
    close();
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (disabled) {
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
      if (event.key === "ArrowUp") {
        moveActive(-1);
      } else {
        moveActive(1);
      }
    }
  }

  function handleListKeyDown(event: ReactKeyboardEvent<HTMLUListElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (activeIndex >= 0) {
        commit(activeIndex);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Home") {
      event.preventDefault();
      const first = options.findIndex((option) => !option.disabled);
      if (first >= 0) {
        setActiveIndex(first);
      }
    } else if (event.key === "End") {
      event.preventDefault();
      for (let index = options.length - 1; index >= 0; index -= 1) {
        if (!options[index]!.disabled) {
          setActiveIndex(index);
          break;
        }
      }
    }
  }

  useEffect(() => {
    if (open && listboxRef.current) {
      listboxRef.current.focus();
    }
  }, [open]);

  return (
    <div className={classNames("dropdown", className)} ref={containerRef}>
      <button
        type="button"
        id={triggerId}
        className="dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={label}
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="dropdown-value">{selectedOption ? selectedOption.label : placeholder}</span>
        <span className="dropdown-caret" aria-hidden="true">▾</span>
      </button>
      {open ? (
        <ul
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          aria-label={label}
          aria-activedescendant={activeIndex >= 0 ? `${triggerId}-option-${activeIndex}` : undefined}
          tabIndex={-1}
          className="dropdown-menu"
          onKeyDown={handleListKeyDown}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <li
                key={option.value}
                id={`${triggerId}-option-${index}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                className={classNames(
                  "dropdown-option",
                  isActive && "dropdown-option-active",
                  isSelected && "dropdown-option-selected",
                  option.disabled && "dropdown-option-disabled"
                )}
                onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  commit(index);
                }}
              >
                {option.label}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
