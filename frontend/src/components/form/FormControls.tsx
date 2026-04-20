import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const formLabelClass =
  "text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground";
export const formHelpTextClass =
  "text-[11px] leading-relaxed text-muted-foreground";
export const formInputClass =
  "bg-background/50 text-[13px] focus:bg-background/65";
export const formMonoInputClass = `${formInputClass} font-mono`;
export const formTextareaClass =
  "bg-background/50 text-[13px] leading-relaxed focus:bg-background/65";
export const formMonoTextareaClass = `${formTextareaClass} font-mono`;
export const formSelectTriggerClass =
  "h-8 w-full rounded-md bg-background/50 text-[13px]";
export const formReadOnlyClass = "cursor-default opacity-60 focus:outline-none";

const formIconButtonClass =
  "rounded-md border border-border/70 bg-accent/20 text-muted-foreground hover:bg-accent/45 hover:text-foreground";

interface FormInputProps extends Omit<
  React.ComponentProps<typeof Input>,
  "size"
> {
  mono?: boolean;
}

export function FormInput({
  className,
  mono = false,
  ...props
}: FormInputProps) {
  return (
    <Input
      className={cn(mono ? formMonoInputClass : formInputClass, className)}
      {...props}
    />
  );
}

interface FormTextareaProps extends React.ComponentProps<typeof Textarea> {
  mono?: boolean;
}

export function FormTextarea({
  className,
  mono = false,
  ...props
}: FormTextareaProps) {
  return (
    <Textarea
      className={cn(
        mono ? formMonoTextareaClass : formTextareaClass,
        className,
      )}
      {...props}
    />
  );
}

interface FormIconButtonProps extends Omit<
  React.ComponentProps<typeof Button>,
  "size"
> {
  size?: "compact" | "default";
}

export function FormIconButton({
  className,
  size = "compact",
  type = "button",
  variant = "ghost",
  ...props
}: FormIconButtonProps) {
  return (
    <Button
      type={type}
      variant={variant}
      size={size === "default" ? "icon-sm" : "icon-xs"}
      className={cn(formIconButtonClass, className)}
      {...props}
    />
  );
}

interface SecretInputProps extends Omit<FormInputProps, "type"> {
  buttonSize?: "compact" | "default";
  hideLabel: string;
  showLabel: string;
}

export function SecretInput({
  buttonSize = "compact",
  className,
  hideLabel,
  mono = false,
  showLabel,
  ...props
}: SecretInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <FormInput
        type={visible ? "text" : "password"}
        mono={mono}
        className={cn("pr-10", className)}
        {...props}
      />
      <FormIconButton
        aria-label={visible ? hideLabel : showLabel}
        size={buttonSize}
        className="absolute right-2 top-1/2 -translate-y-1/2"
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? (
          <EyeOff
            className={buttonSize === "default" ? "size-4" : "size-3.5"}
          />
        ) : (
          <Eye className={buttonSize === "default" ? "size-4" : "size-3.5"} />
        )}
      </FormIconButton>
    </div>
  );
}
