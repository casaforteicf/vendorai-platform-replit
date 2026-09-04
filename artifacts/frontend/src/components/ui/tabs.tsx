import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import LeadAttachmentsTab from "@/components/leads/LeadAttachmentsTab"
import { cn } from "@/lib/utils"

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex min-h-10 items-center justify-center rounded-xl border border-border/60 bg-muted/70 p-1 text-muted-foreground",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex min-h-8 items-center justify-center whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=inactive]:hidden",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

/**
 * Mantém o componente Tabs genérico, mas estende o workspace real do lead
 * quando ele se identifica pelo id oficial. Isso evita duplicar LeadDetail e
 * permite que a nova aba Anexos compartilhe o mesmo estado de abas existente.
 * Se LeadDetail passar a declarar a aba nativamente no futuro, a proteção
 * hasAnexos evita qualquer duplicação.
 */
function Tabs({ children, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const isLeadWorkspace = props.id === "lead-workspace-tabs"

  if (!isLeadWorkspace) {
    return <TabsPrimitive.Root {...props}>{children}</TabsPrimitive.Root>
  }

  const rootChildren = React.Children.toArray(children)
  const hasAnexosContent = rootChildren.some((child) =>
    React.isValidElement(child) &&
    child.type === TabsContent &&
    (child.props as { value?: string }).value === "anexos"
  )

  const enhancedChildren = rootChildren.map((child) => {
    if (!React.isValidElement(child) || child.type !== TabsList) return child

    const listProps = child.props as React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
    const listChildren = React.Children.toArray(listProps.children)
    const hasAnexosTrigger = listChildren.some((listChild) =>
      React.isValidElement(listChild) &&
      listChild.type === TabsTrigger &&
      (listChild.props as { value?: string }).value === "anexos"
    )

    if (hasAnexosTrigger) return child

    return React.cloneElement(
      child as React.ReactElement<React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>>,
      {
        style: {
          ...listProps.style,
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          maxWidth: "42rem",
        },
      },
      <>
        {listProps.children}
        <TabsTrigger value="anexos">Anexos</TabsTrigger>
      </>
    )
  })

  return (
    <TabsPrimitive.Root {...props}>
      {enhancedChildren}
      {!hasAnexosContent && (
        <TabsContent value="anexos" className="mt-4">
          <LeadAttachmentsTab />
        </TabsContent>
      )}
    </TabsPrimitive.Root>
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
