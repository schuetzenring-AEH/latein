import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

const variants = {
  primary: "bg-teal-800 text-white hover:bg-teal-900 dark:bg-teal-600 dark:text-stone-950 dark:hover:bg-teal-500",
  secondary: "border border-stone-300 bg-white text-stone-900 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800",
  ghost: "bg-transparent text-teal-900 hover:bg-teal-950/5 dark:text-teal-200 dark:hover:bg-white/10",
  danger: "border border-red-300 bg-white text-red-800 hover:bg-red-50 dark:border-red-900 dark:bg-stone-900 dark:text-red-300 dark:hover:bg-red-950",
} as const;

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:focus-visible:outline-teal-300",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

const controlClass = "min-h-12 w-full min-w-0 rounded-xl border border-stone-300 bg-white px-3 text-stone-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus-visible:outline-teal-300";

export function Field({
  id,
  label,
  ...props
}: { id: string; label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <input id={id} className={controlClass} {...props} />
    </div>
  );
}

export function TextArea({
  id,
  label,
  ...props
}: { id: string; label: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <textarea id={id} className={cx(controlClass, "min-h-28 py-2")} {...props} />
    </div>
  );
}

export function SelectField({
  id,
  label,
  children,
  ...props
}: { id: string; label: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <select id={id} className={controlClass} {...props}>{children}</select>
    </div>
  );
}
