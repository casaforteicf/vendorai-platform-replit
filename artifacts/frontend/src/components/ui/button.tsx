import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
           // @replit: no hover, and add primary border
          "btn-lift border border-primary/90 !bg-primary !text-primary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)] hover:!bg-primary/90",
        destructive:
          "border border-destructive/90 bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          // @replit Shows the background color of whatever card / sidebar / accent background it is inside of.
          // Inherits the current text color. Uses shadow-xs. no shadow on active
          // No hover state
          "border border-border/80 bg-background/75 text-foreground shadow-sm backdrop-blur-sm hover:border-border hover:bg-accent/70",
        secondary:
          // @replit border, no hover, no shadow, secondary border.
          "border border-border/60 bg-secondary text-secondary-foreground hover:bg-secondary/70",
        // @replit no hover, transparent border
        ghost: "border border-transparent text-muted-foreground hover:bg-accent/75 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // @replit changed sizes
        default: "min-h-10 px-4 py-2",
        sm: "min-h-9 rounded-lg px-3 text-xs",
        lg: "min-h-11 rounded-xl px-6",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
